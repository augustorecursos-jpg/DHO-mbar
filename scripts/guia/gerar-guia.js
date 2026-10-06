// Gera o e-book "Guia de acesso" (public/guia/guia-de-acesso.pdf) com prints reais da plataforma.
// Usa um banco temporário com conteúdo fictício; o banco de produção não é tocado.
// Uso: node scripts/guia/gerar-guia.js   (requer o Playwright instalado globalmente)
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..', '..');
const PORTA = 3190;
const BASE = `http://localhost:${PORTA}`;
const SAIDA_PDF = path.join(RAIZ, 'public', 'guia', 'guia-de-acesso.pdf');

function playwright() {
  try { return require('playwright'); } catch {
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  }
}

async function aguardarServidor() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/healthz`)).ok) return; } catch { /* ainda subindo */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('O servidor temporário não respondeu.');
}

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'guia-dho-'));
  process.env.DATA_DIR = temp;
  const { db, UPLOAD_DIR } = require(path.join(RAIZ, 'db'));
  const dados = await require('./dados-guia').popular(db, UPLOAD_DIR);

  const servidor = spawn(process.execPath, ['--no-warnings', 'server.js'], {
    cwd: RAIZ, env: { ...process.env, DATA_DIR: temp, PORT: String(PORTA), ADMIN_PASSWORD: 'guia', NODE_ENV: 'development' }, stdio: 'ignore',
  });
  try {
    await aguardarServidor();
    const { chromium } = playwright();
    const capturas = path.join(temp, 'capturas');
    const mapa = await require('./capturar').capturar({ chromium, base: BASE, saida: capturas, dados, fontes: path.join(RAIZ, 'assets', 'fontes') });
    const { montarGuia } = require('./conteudo-guia');
    const html = path.join(capturas, 'guia.html');
    fs.writeFileSync(html, montarGuia(mapa, { fontes: path.join(RAIZ, 'assets', 'fontes'), imagens: path.join(RAIZ, 'public', 'img') }));

    const navegador = await chromium.launch();
    const page = await navegador.newPage();
    await page.goto(`file://${html}`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    fs.mkdirSync(path.dirname(SAIDA_PDF), { recursive: true });
    await page.pdf({ path: SAIDA_PDF, format: 'A4', printBackground: true, preferCSSPageSize: true });
    await navegador.close();
    console.log(`Guia gerado em ${path.relative(RAIZ, SAIDA_PDF)} (prints em ${capturas})`);
  } finally {
    servidor.kill();
  }
})().catch(err => { console.error(err); process.exit(1); });
