// Visualização protegida dos materiais: o colaborador nunca recebe o PDF, só imagens das páginas
// com marca d'água (nome, CPF parcial, data e hora). As páginas são renderizadas uma vez com o pdf.js
// e guardadas em cache no disco; a marca d'água é aplicada a cada pedido.
const fs = require('node:fs');
const path = require('node:path');
const napi = require('@napi-rs/canvas');
const { UPLOAD_DIR } = require('./db');

const { createCanvas, loadImage, GlobalFonts } = napi;
// O pdf.js usa estas classes do navegador para desenhar texto e imagens.
for (const k of ['Path2D', 'DOMMatrix', 'ImageData']) globalThis[k] ??= napi[k];

GlobalFonts.registerFromPath(path.join(__dirname, 'assets', 'fontes', 'nunito-sans-latin-700-normal.woff'), 'MarcaDagua');

const LARGURA_PAGINA = 1600;
const CACHE_DIR = path.join(UPLOAD_DIR, 'paginas');
const PASTA_FONTES_PDF = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + path.sep;

class FabricaCanvas {
  create(w, h) { const canvas = createCanvas(w, h); return { canvas, context: canvas.getContext('2d') }; }
  reset(c, w, h) { c.canvas.width = w; c.canvas.height = h; }
  destroy(c) { c.canvas.width = 0; c.canvas.height = 0; }
}

let pdfjs;
const carregarPdfjs = async () => (pdfjs ??= await import('pdfjs-dist/legacy/build/pdf.mjs'));

const pastaDaAula = (aula) => path.join(CACHE_DIR, path.parse(aula.arquivo).name);
const emAndamento = new Map();

/** Renderiza (uma única vez) as páginas do PDF da aula e devolve a quantidade de páginas. */
function prepararPaginas(aula) {
  const pasta = pastaDaAula(aula);
  const meta = path.join(pasta, 'meta.json');
  if (fs.existsSync(meta)) return Promise.resolve(JSON.parse(fs.readFileSync(meta, 'utf8')).paginas);
  if (emAndamento.has(pasta)) return emAndamento.get(pasta);

  const tarefa = (async () => {
    const { getDocument } = await carregarPdfjs();
    const dados = new Uint8Array(fs.readFileSync(path.join(UPLOAD_DIR, aula.arquivo)));
    const doc = await getDocument({ data: dados, CanvasFactory: FabricaCanvas, standardFontDataUrl: PASTA_FONTES_PDF, isEvalSupported: false, verbosity: 0 }).promise;
    fs.mkdirSync(pasta, { recursive: true });
    try {
      for (let n = 1; n <= doc.numPages; n++) {
        const pagina = await doc.getPage(n);
        const base = pagina.getViewport({ scale: 1 });
        const viewport = pagina.getViewport({ scale: LARGURA_PAGINA / base.width });
        const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await pagina.render({ canvasContext: ctx, viewport }).promise;
        fs.writeFileSync(path.join(pasta, `${n}.jpg`), await canvas.encode('jpeg', 88));
        pagina.cleanup();
      }
      fs.writeFileSync(meta, JSON.stringify({ paginas: doc.numPages }));
      return doc.numPages;
    } finally {
      await doc.destroy();
    }
  })().finally(() => emAndamento.delete(pasta));
  emAndamento.set(pasta, tarefa);
  return tarefa;
}

const mascararCpf = (cpf) => `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;

/** Devolve a página n (JPEG) com a marca d'água de quem está vendo. */
async function paginaComMarcaDagua(aula, n, colaborador) {
  const total = await prepararPaginas(aula);
  if (!Number.isInteger(n) || n < 1 || n > total) return null;
  const imagem = await loadImage(fs.readFileSync(path.join(pastaDaAula(aula), `${n}.jpg`)));
  const canvas = createCanvas(imagem.width, imagem.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imagem, 0, 0);

  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  const texto = colaborador
    ? `${colaborador.nome} · CPF ${mascararCpf(colaborador.cpf)} · ${agora}`
    : `Visualização do RH · ${agora}`;

  // Texto repetido na diagonal por toda a página
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(-Math.PI / 7);
  ctx.font = `${Math.round(canvas.width / 48)}px MarcaDagua`;
  ctx.fillStyle = 'rgba(14, 59, 92, 0.13)';
  const passoX = ctx.measureText(texto).width + canvas.width / 10;
  const passoY = canvas.width / 9;
  const alcance = Math.hypot(canvas.width, canvas.height);
  for (let y = -alcance, linha = 0; y < alcance; y += passoY, linha++) {
    for (let x = -alcance + (linha % 2) * (passoX / 2); x < alcance; x += passoX) ctx.fillText(texto, x, y);
  }
  ctx.restore();

  // Faixa discreta no rodapé
  const h = Math.round(canvas.width / 55);
  ctx.fillStyle = 'rgba(14, 59, 92, 0.75)';
  ctx.fillRect(0, canvas.height - h, canvas.width, h);
  ctx.fillStyle = '#fff';
  ctx.font = `${Math.round(h * 0.55)}px MarcaDagua`;
  ctx.fillText(`Material de uso interno · Âmbar Energia · proibida a reprodução · ${texto}`, h * 0.6, canvas.height - h * 0.32);

  return canvas.encode('jpeg', 82);
}

/** Remove o cache de páginas de uma aula (quando o material é excluído). */
function apagarPaginas(aula) {
  fs.rm(pastaDaAula(aula), { recursive: true, force: true }, () => {});
}

module.exports = { prepararPaginas, paginaComMarcaDagua, apagarPaginas };
