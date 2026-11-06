// Serviço de envio de mensagens de aniversário para um grupo do WhatsApp.
// Usa o Baileys, que fala com o WhatsApp direto por WebSocket (sem navegador): ~100 MB de memória.
// O n8n continua cuidando do agendamento e da leitura do Excel; este serviço só envia a imagem.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import QRCode from 'qrcode';
import pino from 'pino';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const API_KEY = process.env.API_KEY || '';
const GROUP_ID = process.env.GROUP_ID || '';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '.sessao');
const AUTH_DIR = path.join(DATA_DIR, 'baileys');
const IMAGE_PATH = process.env.IMAGE_PATH || path.join(__dirname, 'imagens', 'aniversario.jpg');
const THUMB_PATH = path.join(__dirname, 'imagens', 'aniversario-miniatura.jpg');
const MESSAGE_TEMPLATE =
  process.env.MESSAGE_TEMPLATE ||
  '🎉 Hoje é dia de celebrar *{nome}*!\n\nA Âmbar Energia deseja um feliz aniversário, com muita saúde, conquistas e energia para o novo ciclo! 🧡';

if (API_KEY.length < 16) {
  console.error('Defina a variável API_KEY (mínimo 16 caracteres) antes de iniciar.');
  process.exit(1);
}

// A versão anterior (whatsapp-web.js) guardava um perfil do Chromium em DATA_DIR/session; não é mais usado.
fs.rmSync(path.join(DATA_DIR, 'session'), { recursive: true, force: true });

// ---------------------------------------------------------------- WhatsApp
const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });
const state = { status: 'iniciando', qr: null, numero: null, desde: new Date().toISOString() };
const setStatus = (status) => Object.assign(state, { status, desde: new Date().toISOString() });

const gruposCache = new Map(); // metadados dos grupos, evita consultar o WhatsApp a cada envio
let sock = null;
let tentativas = 0;

async function conectar() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const { state: auth, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));

  sock = makeWASocket({
    version,
    auth,
    logger,
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false,
    syncFullHistory: false, // não pede o histórico completo de conversas: economiza memória
    cachedGroupMetadata: async (jid) => gruposCache.get(jid),
  });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('groups.update', (lista) => lista.forEach((g) => gruposCache.delete(g.id)));
  sock.ev.on('group-participants.update', (ev) => gruposCache.delete(ev.id));

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      state.qr = qr;
      setStatus('aguardando_qr');
      console.log('QR Code gerado. Abra /qr?key=SUA_API_KEY no navegador para escanear (ou use o QR abaixo).');
      console.log(await QRCode.toString(qr, { type: 'terminal', small: true }));
    }
    if (connection === 'open') {
      tentativas = 0;
      state.qr = null;
      state.numero = (sock.user?.id || '').split(':')[0].split('@')[0] || null;
      setStatus('conectado');
      console.log(`WhatsApp conectado (número ${state.numero}).`);
    }
    if (connection === 'close') {
      const codigo = lastDisconnect?.error?.output?.statusCode;
      state.numero = null;
      if (codigo === DisconnectReason.loggedOut) {
        // A sessão foi encerrada no celular: apaga o login salvo e gera um QR Code novo.
        console.warn('Sessão encerrada no celular. Será preciso escanear o QR Code de novo.');
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        gruposCache.clear();
      }
      tentativas += 1;
      const espera = codigo === DisconnectReason.restartRequired ? 0 : Math.min(60, 3 * tentativas) * 1000;
      console.warn(`Conexão fechada (código ${codigo ?? '?'}). Reconectando em ${espera / 1000}s.`);
      setStatus('reconectando');
      setTimeout(() => conectar().catch(falhaAoConectar), espera);
    }
  });
}

function falhaAoConectar(err) {
  console.error('Erro ao conectar no WhatsApp:', err.message, '- nova tentativa em 30s');
  setStatus('erro');
  setTimeout(() => conectar().catch(falhaAoConectar), 30_000);
}

// Imagem padrão + miniatura pronta (assim não é preciso biblioteca de imagens no servidor)
let imagemPadrao;
function carregarImagemPadrao() {
  imagemPadrao ??= {
    image: fs.readFileSync(IMAGE_PATH),
    mimetype: 'image/jpeg',
    ...(IMAGE_PATH.endsWith('aniversario.jpg') && fs.existsSync(THUMB_PATH)
      ? { jpegThumbnail: fs.readFileSync(THUMB_PATH).toString('base64'), width: 1688, height: 932 }
      : {}),
  };
  return imagemPadrao;
}

// "Ana" | "Ana e Bia" | "Ana, Bia e Carlos"
function juntarNomes(nomes) {
  const lista = nomes.map((n) => String(n).trim()).filter(Boolean);
  if (lista.length <= 1) return lista[0] || '';
  return `${lista.slice(0, -1).join(', ')} e ${lista.at(-1)}`;
}

// ---------------------------------------------------------------- HTTP
const app = express();
app.use(express.json({ limit: '1mb' }));

function chaveValida(chave) {
  const a = Buffer.from(String(chave || ''));
  const b = Buffer.from(API_KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function exigeChave(req, res, next) {
  if (chaveValida(req.get('x-api-key') || req.query.key)) return next();
  res.status(401).json({ ok: false, erro: 'API key inválida' });
}
function exigeConectado(req, res, next) {
  if (state.status === 'conectado') return next();
  res.status(503).json({ ok: false, erro: `WhatsApp não está conectado (status: ${state.status})` });
}

app.get('/healthz', (req, res) => res.json({ ok: true, status: state.status }));

app.get('/status', exigeChave, (req, res) => {
  res.json({ status: state.status, numero: state.numero, desde: state.desde, grupoPadrao: GROUP_ID || null });
});

// Página para escanear o QR Code pelo navegador.
app.get('/qr', exigeChave, async (req, res) => {
  let corpo;
  if (state.status === 'conectado') {
    corpo = `<h2>✅ Conectado</h2><p>Número: <b>${state.numero}</b></p>`;
  } else if (state.qr) {
    const img = await QRCode.toDataURL(state.qr, { width: 320, margin: 2 });
    corpo = `<h2>Escaneie com o WhatsApp do número da automação</h2>
      <p>WhatsApp → Dispositivos conectados → Conectar dispositivo</p>
      <img src="${img}" alt="QR Code">`;
  } else {
    corpo = `<h2>Aguarde…</h2><p>Status: ${state.status}</p>`;
  }
  res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
    <meta http-equiv="refresh" content="10"><title>WhatsApp · Aniversários</title>
    <body style="font-family:sans-serif;text-align:center;padding:24px;background:#0e3b5c;color:#fff">${corpo}
    <p style="opacity:.7">A página atualiza sozinha a cada 10 segundos.</p></body>`);
});

// Lista os grupos do número conectado, para descobrir o ID (…@g.us) do grupo dos colaboradores.
app.get('/grupos', exigeChave, exigeConectado, async (req, res) => {
  const grupos = await sock.groupFetchAllParticipating();
  const lista = Object.values(grupos).map((g) => {
    gruposCache.set(g.id, g);
    return { id: g.id, nome: g.subject, participantes: g.participants?.length ?? null };
  });
  lista.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  res.json(lista);
});

// Envia a imagem de aniversário.
// Corpo: { "nome": "Maria" } ou { "nomes": ["Maria", "João"] }
// Opcionais: "legenda" (texto pronto), "grupoId" (senão usa GROUP_ID), "imagemUrl" (senão usa a imagem padrão)
app.post('/aniversario', exigeChave, exigeConectado, async (req, res) => {
  const { nome, nomes, legenda, grupoId, imagemUrl } = req.body || {};
  const destino = String(grupoId || GROUP_ID).trim();
  if (!destino) return res.status(400).json({ ok: false, erro: 'Informe grupoId ou defina GROUP_ID' });
  if (!/@(g\.us|s\.whatsapp\.net)$/.test(destino)) {
    return res.status(400).json({ ok: false, erro: 'grupoId inválido: deve terminar em @g.us' });
  }

  const nomeFinal = juntarNomes(Array.isArray(nomes) ? nomes : nome ? [nome] : []);
  const texto = legenda || (nomeFinal && MESSAGE_TEMPLATE.replaceAll('{nome}', nomeFinal));
  if (!texto) return res.status(400).json({ ok: false, erro: 'Informe nome, nomes ou legenda' });

  try {
    if (destino.endsWith('@g.us') && !gruposCache.has(destino)) {
      gruposCache.set(destino, await sock.groupMetadata(destino));
    }
    const media = imagemUrl ? { image: { url: imagemUrl } } : carregarImagemPadrao();
    const msg = await sock.sendMessage(destino, { ...media, caption: texto });
    console.log(`Aniversário enviado para ${destino}: ${nomeFinal || '(legenda personalizada)'}`);
    res.json({ ok: true, mensagemId: msg?.key?.id ?? null, destino, legenda: texto });
  } catch (err) {
    console.error('Erro ao enviar:', err);
    res.status(500).json({ ok: false, erro: err.message });
  }
});

const server = app.listen(PORT, () => console.log(`Serviço de aniversários ouvindo na porta ${PORT}`));
conectar().catch(falhaAoConectar);

function encerrar() {
  server.close();
  sock?.end(undefined);
  process.exit(0);
}
process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);
