// Tira os prints da plataforma usados no guia de acesso, com as marcações numeradas.
// Roda contra um servidor local com o banco temporário criado por gerar-guia.js.
const fs = require('node:fs');
const path = require('node:path');

// Posição de cada marcação, em % do print, para o guia desenhar a moldura e o número por cima.
async function caixas(page, clip, marcas) {
  const lista = [];
  for (const [n, seletor, folga = 6] of marcas) {
    const el = page.locator(seletor).first();
    const b = await el.boundingBox();
    if (!b) throw new Error(`Marcação ${n}: elemento não encontrado (${seletor})`);
    const x = Math.max(b.x - folga, clip.x), y = Math.max(b.y - folga, clip.y);
    const x2 = Math.min(b.x + b.width + folga, clip.x + clip.width), y2 = Math.min(b.y + b.height + folga, clip.y + clip.height);
    lista.push({ n, x: (x - clip.x) / clip.width * 100, y: (y - clip.y) / clip.height * 100,
      w: (x2 - x) / clip.width * 100, h: (y2 - y) / clip.height * 100 });
  }
  return lista;
}

// Fontes da marca servidas localmente (o navegador de captura pode não alcançar o Google Fonts).
function cssFontes(pasta) {
  const face = (familia, peso, arquivo) => `@font-face { font-family: '${familia}'; font-weight: ${peso}; font-style: normal;
    src: url(data:font/woff;base64,${fs.readFileSync(path.join(pasta, arquivo)).toString('base64')}) format('woff'); }`;
  return [
    face('Montserrat', '400 500', 'montserrat-latin-400-normal.woff'),
    face('Montserrat', '600 700', 'montserrat-latin-700-normal.woff'),
    face('Montserrat', '800 900', 'montserrat-latin-800-normal.woff'),
    face('Nunito Sans', '400 500', 'nunito-sans-latin-400-normal.woff'),
    face('Nunito Sans', '600 900', 'nunito-sans-latin-700-normal.woff'),
  ].join('\n');
}

async function capturar({ chromium, base, saida, dados, fontes }) {
  fs.mkdirSync(saida, { recursive: true });
  const mapa = {};
  const navegador = await chromium.launch();
  const css = cssFontes(fontes);
  const usarFontesLocais = (c) => c.route(/fonts\.(googleapis|gstatic)\.com/, rota => rota.fulfill({ contentType: 'text/css', body: css }));
  const ctx = await navegador.newContext({ viewport: { width: 1366, height: 820 }, deviceScaleFactor: 2 });
  await usarFontesLocais(ctx);
  const page = await ctx.newPage();
  const espera = (ms) => page.waitForTimeout(ms);

  // Print da tela inteira ou de um elemento (com margem), já com as marcações.
  async function print(nome, { alvo, ate, margem = 0, marcas = [], p = page } = {}) {
    let clip;
    if (alvo) {
      const b = await p.locator(alvo).first().boundingBox();
      clip = { x: Math.max(b.x - margem, 0), y: Math.max(b.y - margem, 0), width: b.width + margem * 2, height: b.height + margem * 2 };
      if (ate) {
        const f = await p.locator(ate).first().boundingBox();
        clip.height = f.y + f.height + 24 - clip.y;
      }
    } else {
      const v = p.viewportSize();
      clip = { x: 0, y: 0, width: v.width, height: v.height };
    }
    const arquivo = path.join(saida, `${nome}.jpg`);
    await p.screenshot({ path: arquivo, clip, type: 'jpeg', quality: 88 });
    mapa[nome] = { arquivo: `${nome}.jpg`, proporcao: clip.width / clip.height, marcas: await caixas(p, clip, marcas) };
  }

  const [m1, m2, m3, m4] = dados.temas;

  // 1. Home
  await page.setViewportSize({ width: 1366, height: 980 });
  await page.goto(base, { waitUntil: 'networkidle' });
  await espera(600);
  await print('home', { marcas: [[1, '#cpf'], [2, '#acesso button[type=submit]'], [3, '.guia-acesso', 0]] });
  await page.setViewportSize({ width: 1366, height: 820 });

  // 2. CPF fora da base
  await page.fill('#cpf', '529.982.247-25');
  await page.click('#acesso button[type=submit]');
  await page.waitForSelector('.acesso-msg.erro');
  await espera(500);
  await print('negado', { alvo: '.cartao-acesso', margem: 14, marcas: [[1, '#acesso-msg', 4]] });

  // 3. Entrada e preparação do histórico: tema 1 concluído e aprovado, tema 2 em andamento.
  await page.fill('#cpf', '');
  await page.fill('#cpf', dados.cpf);
  await page.click('#acesso button[type=submit]');
  await page.waitForURL('**/trilha.html');
  await page.evaluate(async ({ m1, m2, corretas }) => {
    const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(r => r.json());
    for (const a of m1.aulas) await post(`/api/aulas/${a}/concluir`);
    const prova = await fetch(`/api/provas/${m1.provas[0]}`).then(r => r.json());
    const respostas = Object.fromEntries(prova.questoes.map((q, i) => [q.id, i === prova.questoes.length - 1 ? (corretas[i] + 1) % 2 : corretas[i]]));
    await post(`/api/provas/${m1.provas[0]}/responder`, { respostas });
    const form = await fetch('/api/reacao').then(r => r.json());
    const reacao = {};
    form.secoes.forEach((s, i) => s.perguntas.forEach((q, j) => {
      reacao[`${i}-${j}`] = q.tipo === 'escala' ? 5 : q.tipo === 'nota' ? 10 : q.tipo === 'escolha' ? q.opcoes[0] : '';
    }));
    await post(`/api/modulos/${m1.moduloId}/reacao`, { respostas: reacao });
    await post(`/api/aulas/${m2.aulas[0]}/concluir`);
  }, { m1, m2, corretas: dados.corretas });
  await page.reload({ waitUntil: 'networkidle' });
  await espera(1200);

  // 4. Painel
  await print('painel', { marcas: [
    [1, '#lista-modulos', 4], [2, '.boasvindas .btn'], [3, '.indicadores', 4], [4, '.temas', 4], [5, '.certificados', 4],
  ] });

  // 5. Página do tema em andamento (avaliação final ainda bloqueada)
  await page.click(`.tema-lateral[data-modulo="${m2.moduloId}"]`);
  await espera(700);
  await page.evaluate(() => window.scrollTo(0, 0));
  await print('tema', { alvo: '.conteudo', ate: '#reacao-modulo h3', marcas: [
    [1, '.tema-cab .progresso', 4], [2, '.bloco-aula:nth-child(2) [data-aula]', 5], [3, '.prova-card.bloqueada', 4], [4, '#reacao-modulo h3', 6],
  ] });
  await print('avaliacao-bloqueada', { alvo: '.prova-card.bloqueada', margem: 10 });

  // 6. Visualizador do material
  await page.click(`.bloco-aula:nth-child(2) [data-aula]`);
  await page.waitForSelector('.pagina.pronta');
  await espera(1500);
  await print('material', { marcas: [[1, '#aula-pagina', 6], [2, '#aula-concluir', 5], [3, '#modal-aula [data-fechar]', 5]] });

  // 7. Material concluído: avaliação liberada
  await page.click('#aula-concluir');
  await espera(1000);
  await page.locator('.prova-card:not(.bloqueada)').first().scrollIntoViewIfNeeded();
  await print('avaliacao-liberada', { alvo: '.prova-card:not(.bloqueada)', margem: 10, marcas: [[1, '.prova-card:not(.bloqueada) [data-prova]', 5]] });

  // 8. Avaliação: abertura e questões
  await page.click('.prova-card:not(.bloqueada) [data-prova]');
  await page.waitForSelector('#modal-prova[open] .questao');
  await espera(500);
  await print('prova-abertura', { alvo: '#modal-prova', marcas: [[1, '.prova-intro', 4]] });
  const questoes = page.locator('#modal-prova .questao');
  for (let i = 0; i < await questoes.count(); i++) {
    await questoes.nth(i).locator('label.alt').nth(dados.corretas[i]).click();
  }
  await page.locator('#modal-prova .questao').nth(1).scrollIntoViewIfNeeded();
  await page.locator('#prova-corpo').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await espera(400);
  await print('prova-questoes', { alvo: '#modal-prova', marcas: [[1, '#modal-prova .questao >> nth=-1', 4], [2, '#prova-enviar', 5]] });

  // 9. Resultado e avaliação de reação
  await page.click('#prova-enviar');
  await page.waitForSelector('#modal-prova .resultado');
  await page.waitForSelector('#reacao-na-prova .reacao, #reacao-na-prova form, #reacao-na-prova fieldset', { timeout: 5000 }).catch(() => {});
  await espera(800);
  await page.locator('#prova-corpo').evaluate(el => { el.scrollTop = 0; });
  await print('resultado', { alvo: '#modal-prova', ate: '.resultado', marcas: [[1, '.resultado .grande', 6], [2, '.resultado .btn', 5]] });
  await page.locator('#reacao-na-prova').scrollIntoViewIfNeeded();
  await espera(300);
  await print('reacao', { alvo: '#modal-prova' });

  // 10. Certificado (primeira página do PDF gerado pela plataforma)
  const codigo = await page.locator('.resultado .btn').getAttribute('href');
  const imagem = await page.evaluate(async (url) => {
    const pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
    const doc = await pdfjs.getDocument({ data: await fetch(url).then(r => r.arrayBuffer()) }).promise;
    const pagina = await doc.getPage(1);
    const vp = pagina.getViewport({ scale: 2.5 });
    const canvas = Object.assign(document.createElement('canvas'), { width: vp.width, height: vp.height });
    await pagina.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    return canvas.toDataURL('image/jpeg', 0.9);
  }, codigo);
  fs.writeFileSync(path.join(saida, 'certificado.jpg'), Buffer.from(imagem.split(',')[1], 'base64'));
  mapa.certificado = { arquivo: 'certificado.jpg', proporcao: 842 / 595, marcas: [] };

  // 11. Tema com uma avaliação por material
  await page.keyboard.press('Escape');
  await page.goto(`${base}/trilha.html#/modulo/${m3.moduloId}`, { waitUntil: 'networkidle' });
  await espera(800);
  await print('por-material', { alvo: '.lista-aulas', margem: 10, marcas: [[1, '.bloco-aula:first-child .aula', 3], [2, '.bloco-aula:first-child .prova-card', 3]] });

  // 12. Painel após a aprovação (meus certificados)
  await page.goto(`${base}/trilha.html`, { waitUntil: 'networkidle' });
  await espera(1200);
  await print('certificados', { alvo: '.certificados', margem: 8 });

  // 13. Celular: home e avaliação de reação aberta pelo QR Code
  const cel = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await usarFontesLocais(cel);
  const pc = await cel.newPage();
  await pc.goto(base, { waitUntil: 'networkidle' });
  await pc.waitForTimeout(600);
  await pc.evaluate(() => window.scrollTo(0, document.querySelector('.hero-texto h1').getBoundingClientRect().top + scrollY - 140));
  await pc.waitForTimeout(300);
  await print('celular-home', { p: pc });
  await pc.goto(`${base}/reacao.html?modulo=${m4.moduloId}`, { waitUntil: 'networkidle' });
  await pc.waitForTimeout(500);
  await print('celular-qr-cpf', { p: pc, marcas: [[1, '#cpf', 4]] });
  await pc.fill('#cpf', dados.cpf);
  await pc.click('#form-cpf button');
  await pc.waitForTimeout(1200);
  await print('celular-qr-form', { p: pc });

  await navegador.close();
  fs.writeFileSync(path.join(saida, 'marcacoes.json'), JSON.stringify(mapa, null, 2));
  return mapa;
}

module.exports = { capturar };
