// Serviço de envio de mensagens de aniversário para um grupo do WhatsApp (whatsapp-web.js).
// O n8n continua cuidando do agendamento e da leitura do Excel; este serviço só envia a imagem.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const QRCode = require('qrcode');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

const PORT = Number(process.env.PORT) || 3001;
const API_KEY = process.env.API_KEY || '';
const GROUP_ID = process.env.GROUP_ID || '';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '.wwebjs');
const IMAGE_PATH = process.env.IMAGE_PATH || path.join(__dirname, 'imagens', 'aniversario.jpg');
const MESSAGE_TEMPLATE =
  process.env.MESSAGE_TEMPLATE ||
  '🎉 Hoje é dia de celebrar *{nome}*!\n\nA Âmbar Energia deseja um feliz aniversário, com muita saúde, conquistas e energia para o novo ciclo! 🧡';

if (API_KEY.length < 16) {
  console.error('Defina a variável API_KEY (mínimo 16 caracteres) antes de iniciar.');
  process.exit(1);
}

// ---------------------------------------------------------------- WhatsApp
const state = { status: 'iniciando', qr: null, numero: null, desde: new Date().toISOString() };
const setStatus = (status) => Object.assign(state, { status, desde: new Date().toISOString() });

// Se o container reiniciar no meio da sessão, o Chromium deixa travas que impedem abrir o perfil de novo.
for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
  fs.rmSync(path.join(DATA_DIR, 'session', f), { force: true });
}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: DATA_DIR }),
  puppeteer: {
    headless: true,
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run'],
  },
});

client.on('qr', async (qr) => {
  state.qr = qr;
  setStatus('aguardando_qr');
  console.log('QR Code gerado. Escaneie abaixo ou abra /qr?key=SUA_API_KEY no navegador.');
  console.log(await QRCode.toString(qr, { type: 'terminal', small: true }));
});
client.on('authenticated', () => setStatus('autenticado'));
client.on('ready', () => {
  state.qr = null;
  state.numero = client.info?.wid?.user || null;
  setStatus('conectado');
  console.log(`WhatsApp conectado (número ${state.numero}).`);
});
client.on('auth_failure', (msg) => {
  setStatus('falha_autenticacao');
  console.error('Falha de autenticação:', msg);
});
client.on('disconnected', async (motivo) => {
  console.warn('WhatsApp desconectado:', motivo, '- reiniciando em 10s');
  state.numero = null;
  setStatus('desconectado');
  await client.destroy().catch(() => {});
  setTimeout(iniciar, 10_000);
});

function iniciar() {
  setStatus('iniciando');
  client.initialize().catch(async (err) => {
    console.error('Erro ao iniciar o WhatsApp:', err.message, '- nova tentativa em 30s');
    setStatus('erro');
    await client.destroy().catch(() => {}); // fecha o Chromium antes de tentar de novo
    setTimeout(iniciar, 30_000);
  });
}

let imagemPadrao;
function carregarImagemPadrao() {
  imagemPadrao ??= MessageMedia.fromFilePath(IMAGE_PATH);
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

// Página para escanear o QR Code pelo navegador (útil quando o serviço roda na nuvem).
app.get('/qr', exigeChave, async (req, res) => {
  let corpo;
  if (state.status === 'conectado') {
    corpo = `<h2>✅ Conectado</h2><p>Número: <b>${state.numero}</b></p>`;
  } else if (state.qr) {
    const img = await QRCode.toDataURL(state.qr, { width: 320, margin: 2 });
    corpo = `<h2>Escaneie com o WhatsApp do número da automação</h2>
      <p>WhatsApp → Configurações → Dispositivos conectados → Conectar dispositivo</p>
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
  const chats = await client.getChats();
  const grupos = chats
    .filter((c) => c.isGroup)
    .map((c) => ({ id: c.id._serialized, nome: c.name, participantes: c.participants?.length ?? null }));
  res.json(grupos);
});

// Envia a imagem de aniversário.
// Corpo: { "nome": "Maria" } ou { "nomes": ["Maria", "João"] }
// Opcionais: "legenda" (texto pronto), "grupoId" (senão usa GROUP_ID), "imagemUrl" (senão usa a imagem padrão)
app.post('/aniversario', exigeChave, exigeConectado, async (req, res) => {
  const { nome, nomes, legenda, grupoId, imagemUrl } = req.body || {};
  const destino = grupoId || GROUP_ID;
  if (!destino) return res.status(400).json({ ok: false, erro: 'Informe grupoId ou defina GROUP_ID' });

  const nomeFinal = juntarNomes(Array.isArray(nomes) ? nomes : nome ? [nome] : []);
  const texto = legenda || (nomeFinal && MESSAGE_TEMPLATE.replaceAll('{nome}', nomeFinal));
  if (!texto) return res.status(400).json({ ok: false, erro: 'Informe nome, nomes ou legenda' });

  try {
    const media = imagemUrl ? await MessageMedia.fromUrl(imagemUrl, { unsafeMime: true }) : carregarImagemPadrao();
    const msg = await client.sendMessage(destino, media, { caption: texto });
    console.log(`Aniversário enviado para ${destino}: ${nomeFinal || '(legenda personalizada)'}`);
    res.json({ ok: true, mensagemId: msg.id._serialized, destino, legenda: texto });
  } catch (err) {
    console.error('Erro ao enviar:', err);
    res.status(500).json({ ok: false, erro: err.message });
  }
});

const server = app.listen(PORT, () => console.log(`Serviço de aniversários ouvindo na porta ${PORT}`));
iniciar();

async function encerrar() {
  server.close();
  await client.destroy().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);
