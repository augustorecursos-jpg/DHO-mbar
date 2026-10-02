// Geração do certificado em PDF (A4 paisagem) com pdf-lib.
// Layout institucional da plataforma (azul-marinho + laranja, logo e onda no canto) com a usina na lateral
// esquerda (assets/certificado-usina.jpg) e o selo "Pessoas · Propósito · Energia · Futuro" desenhado em vetor.
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

// Fontes da identidade visual da plataforma (SIL Open Font License, ver assets/fontes/OFL-*.txt).
// Embutidas no PDF para o texto ficar idêntico em qualquer leitor.
const fonte = (arquivo) => fs.readFileSync(path.join(__dirname, 'assets', 'fontes', arquivo));
const FONTES = {
  regular: fonte('nunito-sans-latin-400-normal.woff'),
  destaque: fonte('nunito-sans-latin-700-normal.woff'),
  negrito: fonte('montserrat-latin-700-normal.woff'),
  titulo: fonte('montserrat-latin-800-normal.woff'),
  logo: fonte('montserrat-latin-400-normal.woff'),
  script: fonte('dancing-script-latin-700-normal.woff'),
};

const USINA = fs.readFileSync(path.join(__dirname, 'assets', 'certificado-usina.jpg'));

// Nome da trilha impresso no certificado (pode ser trocado sem mexer no código).
const NOME_TRILHA = process.env.TRILHA_NOME || 'Trilha de Desenvolvimento para Coordenadores e Supervisores';

// Cores oficiais do template institucional
const MARINHO = rgb(0.055, 0.231, 0.361);   // #0e3b5c
const MARINHO_2 = rgb(0.086, 0.302, 0.455); // #164d74
const LARANJA = rgb(0.925, 0.42, 0.141);    // #ec6b24
const GRAFITE = rgb(0.114, 0.169, 0.212);
const CINZA = rgb(0.373, 0.435, 0.486);
const MARINHO_ESCURO = rgb(0.039, 0.173, 0.271); // #0a2c45
const LARANJA_ESCURO = rgb(0.85, 0.365, 0.094); // #d95d18
const BRANCO = rgb(1, 1, 1);
const PAPEL = rgb(246 / 255, 248 / 255, 248 / 255); // mesmo tom do fundo da arte da usina

const LARGURA = 842, ALTURA = 595;
const CENTRO = 452;               // eixo da área de texto, entre a usina e o selo
const LARGURA_TEXTO = 440;

// As fontes embutidas cobrem o alfabeto latino; remove o resto (ex.: emojis) para não sair glifo vazio.
const codificavel = (t) => String(t ?? '').replace(/[^\x20-\xFF–—‘’“”•…€]/g, '');
const limpar = (t) => codificavel(t).trim();

function dataPorExtenso(iso) {
  const d = iso ? new Date(iso.replace(' ', 'T') + 'Z') : new Date();
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
}

/** "Avaliação · Tema - Assunto" → "Assunto" quando o título repete o nome do tema. */
function tituloAvaliado({ avaliacao, modulo }) {
  let t = String(avaliacao || '').replace(/^(avalia[cç][aã]o|prova)\s*[·:\-–]\s*/i, '').trim();
  if (!t) return modulo;
  if (t.toLowerCase().startsWith(String(modulo).toLowerCase())) {
    t = t.slice(modulo.length).replace(/^\s*[·:\-–]\s*/, '').trim() || modulo;
  }
  return t;
}

/** "Módulo - Admissão" → "Admissão" (o texto do certificado já diz "no módulo"). */
const semPrefixoModulo = (t) => String(t).replace(/^m[óo]dulo\s*[-–:·]\s*/i, '').trim();

/** Selo "Pessoas · Propósito · Energia · Futuro" nas cores da marca, centrado em (cx, cy). */
function desenharSelo(page, f, cx, cy) {
  // Fitas
  for (const lado of [-1, 1]) {
    const x0 = cx + lado * 6;
    page.drawSvgPath(`M0 0L${lado * 30} 4L${lado * 40} 74L${lado * 26} 62L${lado * 18} 80L${lado * -4} 8Z`, { x: x0, y: cy - 30, color: lado < 0 ? LARANJA : LARANJA_ESCURO });
  }
  // Medalha
  page.drawCircle({ x: cx, y: cy, size: 50, color: MARINHO_ESCURO });
  page.drawCircle({ x: cx, y: cy, size: 46, color: MARINHO });
  page.drawCircle({ x: cx, y: cy, size: 41, borderColor: LARANJA, borderWidth: 0.9, borderDashArray: [2.2, 1.8] });
  // Ícone de pessoas
  const iy = cy + 24;
  for (const [dx, r, oy] of [[-7, 2.6, 0], [7, 2.6, 0], [0, 3.1, 2]]) {
    page.drawCircle({ x: cx + dx, y: iy + oy, size: r, borderColor: BRANCO, borderWidth: 1 });
  }
  page.drawSvgPath('M-12 8C-12 3 -2.5 3 -2.5 8M2.5 8C2.5 3 12 3 12 8M-6 9.5C-6 2.5 6 2.5 6 9.5', { x: cx, y: iy, borderColor: BRANCO, borderWidth: 1 });
  // Palavras
  const palavras = [['PESSOAS', BRANCO], ['PROPÓSITO', BRANCO], ['ENERGIA', LARANJA], ['FUTURO', BRANCO]];
  palavras.forEach(([t, cor], i) => {
    const s = 8.2;
    const w = f.negrito.widthOfTextAtSize(t, s);
    page.drawText(t, { x: cx - w / 2, y: cy + 3 - i * 10.5, size: s, font: f.negrito, color: cor });
  });
}

async function gerarCertificado({ colaborador, certificado }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Certificado - ${limpar(certificado.modulo)}`);
  const page = pdf.addPage([LARGURA, ALTURA]);
  const y = (topo) => ALTURA - topo; // posições pensadas de cima para baixo

  pdf.registerFontkit(fontkit);
  const f = {};
  for (const [nome, dados] of Object.entries(FONTES)) f[nome] = await pdf.embedFont(dados, { subset: true });

  /** Linha centralizada feita de trechos com fonte/cor próprias; reduz o tamanho até caber. */
  const linha = (trechos, topo, tamanho, { largura = LARGURA_TEXTO, espaco = 0 } = {}) => {
    const partes = trechos.map(([texto, fonte = 'regular', cor = GRAFITE]) => ({ texto: codificavel(texto), fonte: f[fonte], cor }));
    const RESPIRO = 0.8; // folga entre trechos de fontes diferentes (evita vírgula colada no negrito)
    const medir = (s) => partes.reduce((w, p) => w + p.fonte.widthOfTextAtSize(p.texto, s) + espaco * p.texto.length, 0) + RESPIRO * (partes.length - 1);
    let s = tamanho;
    while (medir(s) > largura && s > 7) s -= 0.5;
    let x = CENTRO - medir(s) / 2;
    for (const p of partes) {
      const pedacos = espaco ? [...p.texto] : [p.texto];
      for (const t of pedacos) {
        page.drawText(t, { x, y: y(topo), size: s, font: p.fonte, color: p.cor });
        x += p.fonte.widthOfTextAtSize(t, s) + espaco;
      }
      x += RESPIRO;
    }
  };

  /** Divisor horizontal com um enfeite no meio. */
  const divisor = (topo, metade, desenharEnfeite) => {
    page.drawLine({ start: { x: CENTRO - metade, y: y(topo) }, end: { x: CENTRO - 18, y: y(topo) }, thickness: 0.8, color: LARANJA });
    page.drawLine({ start: { x: CENTRO + 18, y: y(topo) }, end: { x: CENTRO + metade, y: y(topo) }, thickness: 0.8, color: LARANJA });
    desenharEnfeite(CENTRO, y(topo));
  };

  // ---- Fundo, usina, ondas e logo ----
  page.drawRectangle({ x: 0, y: 0, width: LARGURA, height: ALTURA, color: PAPEL });
  const usina = await pdf.embedJpg(USINA);
  const larguraUsina = usina.width * (ALTURA / usina.height);
  page.drawImage(usina, { x: 0, y: 0, width: larguraUsina, height: ALTURA });

  // Onda do canto inferior direito (mesma do template da plataforma)
  page.drawSvgPath('M300 0C210 6 150 80 30 120H60C170 90 230 22 300 16Z', { x: LARGURA - 300, y: 120, color: LARANJA });
  page.drawSvgPath('M300 16C230 22 170 90 60 120H300Z', { x: LARGURA - 300, y: 120, color: MARINHO_2 });
  // Fio laranja no topo, como na moldura do modelo
  page.drawLine({ start: { x: larguraUsina - 20, y: y(14) }, end: { x: LARGURA - 24, y: y(14) }, thickness: 1.2, color: LARANJA });

  page.drawText('Âmbar', { x: LARGURA - 160, y: y(66), size: 30, font: f.logo, color: MARINHO });
  page.drawText('ENERGIA', { x: LARGURA - 158, y: y(82), size: 10, font: f.negrito, color: LARANJA });

  desenharSelo(page, f, LARGURA - 97, y(318));

  // ---- Textos ----
  linha([['CERTIFICADO', 'titulo', MARINHO]], 128, 42, { espaco: 2 });
  linha([['DE PARTICIPAÇÃO', 'negrito', LARANJA]], 156, 15, { espaco: 2 });
  divisor(173, 120, (cx, cy) => page.drawSvgPath('M0 -4.5L4.5 0L0 4.5L-4.5 0Z', { x: cx, y: cy, color: LARANJA }));
  linha([['CERTIFICAMOS QUE', 'regular', MARINHO]], 200, 10.5, { espaco: 2.2 });

  linha([[colaborador.nome.toUpperCase(), 'negrito', MARINHO]], 240, 24, { largura: 400 });
  page.drawLine({ start: { x: CENTRO - 205, y: y(251) }, end: { x: CENTRO + 205, y: y(251) }, thickness: 1, color: MARINHO });
  const cargo = [colaborador.cargo, colaborador.filial].filter(Boolean).join(' · ');
  if (cargo) linha([[cargo, 'regular', CINZA]], 267, 9.5, { largura: 400 });

  const avaliado = tituloAvaliado(certificado);
  const modulo = semPrefixoModulo(certificado.modulo);
  const assunto = avaliado === certificado.modulo ? modulo : `${modulo} | ${avaliado}`;
  const carga = certificado.carga_horaria ? `, com carga horária de ${certificado.carga_horaria} ${Number(certificado.carga_horaria) === 1 ? 'hora' : 'horas'}` : '';
  const nota = String(certificado.nota).replace('.', ',');
  linha([['participou da '], [NOME_TRILHA, 'negrito', MARINHO], [',']], 298, 12);
  linha([['no módulo '], [assunto, 'negrito', LARANJA], [',']], 319, 12);
  linha([['realizado em '], [dataPorExtenso(certificado.emitido_em), 'negrito', MARINHO], [`${carga}, com nota `], [`${nota}%`, 'negrito', MARINHO], ['.']], 340, 12);

  divisor(372, 160, (cx, cy) => {
    page.drawCircle({ x: cx, y: cy, size: 13, borderColor: LARANJA, borderWidth: 0.9, color: PAPEL });
    // ícone de pessoas (três cabeças e ombros)
    for (const [dx, r, oy] of [[-5.5, 2, 1.5], [5.5, 2, 1.5], [0, 2.4, 3]]) {
      page.drawCircle({ x: cx + dx, y: cy + oy, size: r, borderColor: LARANJA, borderWidth: 0.8 });
    }
    page.drawSvgPath('M-9 6C-9 2 -2 2 -2 6M2 6C2 2 9 2 9 6M-4.5 7C-4.5 1.5 4.5 1.5 4.5 7', { x: cx, y: cy, borderColor: LARANJA, borderWidth: 0.8 });
  });

  linha([['Investir no desenvolvimento de líderes é fortalecer nossa cultura']], 405, 11.5);
  linha([['e garantir que a pessoa certa esteja sempre no lugar certo.']], 422, 11.5);
  linha([['Parabéns pela sua participação e compromisso com a excelência!', 'script', LARANJA]], 456, 19);

  divisor(484, 110, (cx, cy) => page.drawSvgPath('M0 4C-1 1 -6 0 -6 -3C-6 -6 -2 -7 0 -4C2 -7 6 -6 6 -3C6 0 1 1 0 4Z', { x: cx, y: cy + 1, borderColor: LARANJA, borderWidth: 0.9 }));
  linha([['Time de DHO', 'negrito', MARINHO]], 503, 11.5);
  linha([['Âmbar Energia', 'regular', CINZA]], 517, 10);

  // Rodapé: assinatura institucional e frases da marca
  page.drawText('Âmbar', { x: larguraUsina + 8, y: y(568), size: 11, font: f.negrito, color: LARANJA });
  page.drawText('a energia que te desenvolve', { x: larguraUsina + 8 + f.negrito.widthOfTextAtSize('Âmbar ', 11), y: y(568), size: 10, font: f.regular, color: MARINHO });
  page.drawText('CONECTAMOS PESSOAS  ·  GERAMOS SOLUÇÕES  ·  IMPULSIONAMOS O FUTURO', {
    x: larguraUsina + 8, y: y(583), size: 7, font: f.regular, color: CINZA,
  });
  page.drawText(`Código de autenticidade: ${certificado.codigo}`, { x: LARGURA - 168, y: 16, size: 7, font: f.regular, color: rgb(1, 1, 1) });

  return pdf.save();
}

module.exports = { gerarCertificado };
