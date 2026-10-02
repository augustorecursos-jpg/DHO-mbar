// Painel do colaborador: dashboard, temas, materiais em PDF, avaliações e certificados.
const estado = { colaborador: null, modulos: [] };
const conteudo = document.getElementById('conteudo');

async function carregar() {
  try {
    const r = await api('/api/me');
    estado.colaborador = r.colaborador;
    estado.modulos = r.modulos;
  } catch (err) {
    if (err.status === 401) { location.href = 'index.html#acesso'; return false; }
    throw err;
  }
  const c = estado.colaborador;
  document.getElementById('nome-usuario').textContent = c.nome;
  document.getElementById('cargo-usuario').textContent = [c.cargo, c.filial].filter(Boolean).join(' · ');
  document.getElementById('avatar').textContent = c.nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  renderLateral();
  return true;
}

const pct = (n) => String(n).replace('.', ',');

function statusTema(m) {
  if (m.concluido) return { classe: 'ok', texto: 'Concluído' };
  if (m.progresso > 0) return { classe: 'pend', texto: 'Em andamento' };
  if (!m.aulas.length && !m.provas.length) return { classe: 'neutra', texto: 'Em breve' };
  return { classe: 'neutra', texto: 'Não iniciado' };
}

function renderLateral() {
  const rota = location.hash.match(/^#\/modulo\/(\d+)/);
  document.querySelector('[data-rota="painel"]').classList.toggle('ativo', !rota);
  document.getElementById('lista-modulos').innerHTML = estado.modulos.map(m => {
    const st = statusTema(m);
    return `
    <button class="tema-lateral ${st.classe} ${rota && Number(rota[1]) === m.id ? 'ativo' : ''}" data-modulo="${m.id}">
      <span class="ic">${esc(m.icone)}</span>
      <span class="tema-lateral-txt">
        <strong>${esc(m.titulo)}</strong>
        <small>${m.aulas.length} ${m.aulas.length === 1 ? 'material' : 'materiais'}${m.provas.length ? ` · ${m.provas.length} ${m.provas.length === 1 ? 'avaliação' : 'avaliações'}` : ''}</small>
        <span class="mini-prog"><i style="width:${m.progresso}%"></i></span>
      </span>
      <span class="tema-lateral-pct">${m.concluido ? '✓' : `${m.progresso}%`}</span>
    </button>`;
  }).join('');
}

/** Todas as avaliações da trilha, com o tema de cada uma. */
function todasProvas() {
  return estado.modulos.flatMap(m => m.provas.map(p => ({ ...p, modulo: m })));
}

function totais() {
  const aulas = estado.modulos.reduce((s, m) => s + m.aulas.length, 0);
  const feitas = estado.modulos.reduce((s, m) => s + m.aulas_feitas, 0);
  const provas = todasProvas();
  const certificados = provas.filter(p => p.certificado);
  const etapas = aulas + provas.length;
  const progresso = etapas ? Math.round(((feitas + certificados.length) / etapas) * 100) : 0;
  return { aulas, feitas, provas, provasAbertas: provas.length - certificados.length, certificados, progresso };
}

function anel(valor) {
  const r = 62, comp = 2 * Math.PI * r;
  return `
    <div class="anel" role="img" aria-label="Progresso geral: ${valor}%">
      <svg viewBox="0 0 150 150">
        <circle class="trilho" cx="75" cy="75" r="${r}"/>
        <circle class="carga" cx="75" cy="75" r="${r}" stroke-dasharray="${comp}" stroke-dashoffset="${comp}" data-alvo="${comp * (1 - valor / 100)}"/>
      </svg>
      <div class="anel-texto"><strong>${valor}%</strong><span>CONCLUÍDO</span></div>
    </div>`;
}

function proximoPasso() {
  for (const m of estado.modulos) {
    const prova = m.provas.find(p => p.liberada && !p.certificado);
    if (prova) return { modulo: m, texto: `A avaliação “${prova.titulo}” está liberada para você.` };
    const aula = m.aulas.find(a => !a.vista);
    if (aula) return { modulo: m, texto: `Seu próximo passo: “${aula.titulo}”, no tema ${m.titulo}.` };
  }
  return null;
}

const ONDA_CARTAO = `
  <svg class="onda" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true">
    <path d="M400 40C300 50 220 150 90 200H130C250 160 320 70 400 62Z" fill="#ec6b24"/>
    <path d="M400 62C320 70 250 160 130 200H400Z" fill="#164d74"/>
  </svg>`;

function renderPainel() {
  const t = totais();
  const prox = proximoPasso();
  const primeiroNome = estado.colaborador.nome.split(' ')[0];
  const notaMin = t.provas[0]?.nota_minima ?? 70;
  conteudo.innerHTML = `
    <section class="boasvindas">
      <div class="pontilhado"></div>${ONDA_CARTAO}
      <div>
        <small>MEU DESENVOLVIMENTO</small>
        <h1>Olá, ${esc(primeiroNome)}!</h1>
        <p>${prox ? esc(prox.texto) : estado.modulos.length ? 'Você concluiu todos os temas da trilha. Parabéns pela dedicação! 🎉' : 'Os temas da sua trilha estarão disponíveis em breve.'}</p>
        ${prox ? `<button class="btn btn-laranja" data-modulo="${prox.modulo.id}">Continuar trilha →</button>` : ''}
      </div>
      ${anel(t.progresso)}
    </section>

    <div class="indicadores">
      <div class="indicador"><span class="ic">📘</span><div><strong>${t.feitas}/${t.aulas}</strong><span>materiais estudados</span></div></div>
      <div class="indicador"><span class="ic">🗂️</span><div><strong>${estado.modulos.length}</strong><span>temas na trilha</span></div></div>
      <div class="indicador destaque"><span class="ic">📝</span><div><strong>${t.provasAbertas}</strong><span>avaliações pendentes</span></div></div>
      <div class="indicador destaque"><span class="ic">🎓</span><div><strong>${t.certificados.length}</strong><span>certificados</span></div></div>
    </div>

    <div class="grade-painel">
      <section>
        <h2 class="titulo-secao">Temas da trilha <small>${estado.modulos.length} temas · ${t.aulas} materiais · ${t.provas.length} avaliações</small></h2>
        <div class="temas">
          ${estado.modulos.map(m => {
            const st = statusTema(m);
            return `
            <button class="tema ${st.classe}" data-modulo="${m.id}">
              <span class="tema-topo"><span class="ic">${esc(m.icone)}</span><strong>${esc(m.titulo)}</strong></span>
              <span class="tema-meta">📘 ${m.aulas.length} ${m.aulas.length === 1 ? 'material' : 'materiais'} · 📝 ${m.provas.length} ${m.provas.length === 1 ? 'avaliação' : 'avaliações'}</span>
              <span class="tema-rodape"><span class="barra-prog"><i style="width:${m.progresso}%"></i></span><span class="pct">${m.progresso}%</span></span>
              <span class="tema-acao"><span class="etiqueta ${st.classe}">${st.texto}</span><span class="tema-cta">${m.progresso > 0 && !m.concluido ? 'Continuar' : 'Acessar tema'} →</span></span>
            </button>`;
          }).join('') || '<p class="carregando">O RH ainda não publicou temas.</p>'}
        </div>
      </section>
      <section>
        <h2 class="titulo-secao">Meus certificados</h2>
        <div class="cartao certificados">
          ${t.certificados.length ? `<ul>${t.certificados.map(p => `
            <li><span>🎓 ${esc(p.titulo)}<small>${esc(p.modulo.titulo)}</small></span> <a href="/api/certificados/${p.certificado.codigo}.pdf">Baixar PDF</a></li>`).join('')}</ul>`
            : `<p class="vazio"><span>🎓</span>Seja aprovado em uma avaliação com ${notaMin}% de acerto ou mais para receber seu certificado.</p>`}
        </div>
      </section>
    </div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const arco = conteudo.querySelector('.carga');
    if (arco) arco.style.strokeDashoffset = arco.dataset.alvo;
  }));
}

function cartaoProva(p, aula) {
  const status = p.certificado
    ? `<span class="etiqueta ok">Aprovado · ${pct(p.certificado.nota)}%</span>`
    : p.tentativas ? `<span class="etiqueta pend">Melhor nota: ${pct(p.melhor_nota)}%</span>` : '';
  const bloqueio = aula ? `Conclua o material “${esc(aula.titulo)}” para liberar.` : 'Conclua todos os materiais do tema para liberar.';
  return `
    <div class="prova-card ${p.liberada ? '' : 'bloqueada'}">
      <span class="ic">${p.liberada ? '📝' : '🔒'}</span>
      <div class="txt">
        <h3>${esc(p.titulo)} ${status}</h3>
        <p>${p.questoes} ${p.questoes === 1 ? 'questão' : 'questões'} · nota mínima ${p.nota_minima}% · ${p.tentativas} tentativa(s)${p.liberada ? '' : `<br>${bloqueio}`}</p>
      </div>
      ${p.certificado ? `<a class="btn btn-marinho btn-sm" href="/api/certificados/${p.certificado.codigo}.pdf">⬇ Certificado</a>` : ''}
      <button class="btn ${p.certificado ? 'btn-claro' : 'btn-laranja'} btn-sm" data-prova="${p.id}" ${p.liberada ? '' : 'disabled'}>
        ${p.certificado ? 'Refazer' : p.tentativas ? 'Tentar novamente' : 'Iniciar avaliação'}</button>
    </div>`;
}

function renderModulo(id) {
  const m = estado.modulos.find(x => x.id === id);
  if (!m) { location.hash = '#/'; return; }
  // Avaliações ligadas a um material aparecem logo abaixo dele; as demais, ao final do tema.
  const gerais = m.provas.filter(p => !p.aula_id || !m.aulas.some(a => a.id === p.aula_id));
  conteudo.innerHTML = `
    <button class="voltar" data-rota="painel">← Voltar ao painel</button>
    <div class="tema-cab">
      <span class="ic">${esc(m.icone)}</span>
      <div><h1 class="titulo-pagina" style="margin:0">${esc(m.titulo)}</h1>${m.descricao ? `<p>${esc(m.descricao)}</p>` : ''}</div>
      <div class="progresso"><span>${m.progresso}% concluído · ${m.provas_aprovadas}/${m.provas.length} avaliações aprovadas</span><span class="barra-prog"><i style="width:${m.progresso}%"></i></span></div>
    </div>
    <section class="cartao">
      <h3>📘 Materiais e avaliações <small>· ${m.aulas_feitas} de ${m.aulas.length} materiais concluídos</small></h3>
      <div class="lista-aulas">
        ${m.aulas.map((a, i) => `
          <div class="bloco-aula">
            <div class="aula ${a.vista ? 'feita' : ''}">
              <span class="num">${a.vista ? '✓' : i + 1}</span>
              <strong>${esc(a.titulo)}</strong>
              <span class="pdf">PDF</span>
              <button class="btn ${a.vista ? 'btn-claro' : 'btn-marinho'} btn-sm" data-aula="${a.id}">${a.vista ? 'Rever' : 'Abrir'}</button>
            </div>
            ${m.provas.filter(p => p.aula_id === a.id).map(p => cartaoProva(p, a)).join('')}
          </div>`).join('') || '<p class="carregando">Nenhum material neste tema ainda.</p>'}
      </div>
    </section>
    ${gerais.length ? `
    <section class="cartao" style="margin-top:1.4rem">
      <h3>📝 Avaliação final do tema</h3>
      <div class="lista-aulas">${gerais.map(p => cartaoProva(p, null)).join('')}</div>
    </section>` : ''}`;
}

function rotear() {
  renderLateral();
  const rota = location.hash.match(/^#\/modulo\/(\d+)/);
  const modulo = rota && estado.modulos.find(m => m.id === Number(rota[1]));
  document.getElementById('titulo-barra').textContent = modulo ? modulo.titulo : 'Meu painel';
  if (rota) renderModulo(Number(rota[1])); else renderPainel();
  document.getElementById('lateral').classList.remove('aberta');
  conteudo.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

// ----- Aula -----
const modalAula = document.getElementById('modal-aula');
let aulaAtual = null;

const paginasEl = document.getElementById('aula-paginas');
const avisoProtecao = document.getElementById('aviso-protecao');

// O PDF é desenhado pelo pdf.js em <canvas>, fiel ao arquivo, sem a barra do leitor do navegador
// (que teria os botões de baixar e imprimir).
let pdfjsLib, docAtual;
const carregarPdfjs = async () => {
  if (!pdfjsLib) {
    pdfjsLib = await import('/vendor/pdfjs/pdf.min.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
  }
  return pdfjsLib;
};

async function abrirAula(id) {
  const m = estado.modulos.find(x => x.aulas.some(a => a.id === id));
  aulaAtual = m.aulas.find(a => a.id === id);
  document.getElementById('aula-titulo').textContent = aulaAtual.titulo;
  document.getElementById('aula-concluir').hidden = aulaAtual.vista;
  document.getElementById('aula-pagina').textContent = '';
  paginasEl.innerHTML = '<p class="carregando-paginas">Abrindo o material…</p>';
  modalAula.showModal();
  try {
    const lib = await carregarPdfjs();
    const resp = await fetch(`/api/aulas/${id}/pdf`, { credentials: 'same-origin' });
    if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).erro || 'Material indisponível');
    docAtual = await lib.getDocument({ data: new Uint8Array(await resp.arrayBuffer()) }).promise;
    const total = docAtual.numPages;
    const primeira = (await docAtual.getPage(1)).getViewport({ scale: 1 });
    paginasEl.innerHTML = Array.from({ length: total }, (_, i) => `
      <div class="pagina" data-n="${i + 1}" style="aspect-ratio:${primeira.width} / ${primeira.height}"><span class="pagina-num">${i + 1} / ${total}</span></div>`).join('');
    observarPaginas(total);
    paginasEl.focus();
  } catch (err) {
    paginasEl.innerHTML = `<p class="carregando-paginas">Não foi possível abrir o material: ${esc(err.message)}</p>`;
  }
}

async function desenharPagina(el) {
  const doc = docAtual;
  const pagina = await doc.getPage(Number(el.dataset.n));
  const base = pagina.getViewport({ scale: 1 });
  const escala = (el.clientWidth / base.width) * Math.min(window.devicePixelRatio || 1, 2.5);
  const viewport = pagina.getViewport({ scale: escala });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await pagina.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  if (doc !== docAtual) return; // material fechado no meio do desenho
  el.style.aspectRatio = `${base.width} / ${base.height}`;
  el.prepend(canvas);
  el.classList.add('pronta');
}

// Desenha cada página só quando ela se aproxima da área visível.
let observador;
function observarPaginas(total) {
  observador?.disconnect();
  observador = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      const el = e.target;
      if (e.isIntersecting && !el.dataset.carregada) {
        el.dataset.carregada = '1';
        desenharPagina(el).catch(() => { el.dataset.carregada = ''; });
      }
      if (e.isIntersecting && e.intersectionRatio > 0.4) {
        document.getElementById('aula-pagina').textContent = `Página ${el.dataset.n} de ${total}`;
      }
    }
  }, { root: paginasEl, rootMargin: '600px 0px', threshold: [0, 0.4] });
  paginasEl.querySelectorAll('.pagina').forEach(p => observador.observe(p));
}

document.getElementById('aula-concluir').addEventListener('click', async () => {
  await api(`/api/aulas/${aulaAtual.id}/concluir`, { method: 'POST' });
  modalAula.close();
  toast('Material concluído ✓');
  await carregar();
  rotear();
});
modalAula.addEventListener('close', () => {
  observador?.disconnect();
  docAtual?.destroy();
  docAtual = null;
  paginasEl.innerHTML = '';
});

// ----- Proteção do material (download, impressão e captura) -----
const leituraAberta = () => modalAula.open;
const ocultar = (sim) => {
  paginasEl.classList.toggle('oculto', sim);
  avisoProtecao.hidden = !sim;
};
['contextmenu', 'dragstart', 'selectstart', 'copy'].forEach(ev =>
  modalAula.addEventListener(ev, (e) => e.preventDefault()));
document.addEventListener('keydown', (e) => {
  if (!leituraAberta()) return;
  const tecla = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && ['p', 's', 'c', 'u'].includes(tecla)) {
    e.preventDefault();
    toast('Este material é protegido e não pode ser salvo ou impresso.', 'erro');
  }
  if (tecla === 'printscreen') ocultar(true);
});
document.addEventListener('keyup', (e) => {
  if (!leituraAberta() || e.key.toLowerCase() !== 'printscreen') return;
  navigator.clipboard?.writeText('').catch(() => {});
  ocultar(true);
  toast('Captura de tela não é permitida para os materiais da trilha.', 'erro');
  setTimeout(() => ocultar(false), 1500);
});
// Ao sair da janela (ex.: abrir uma ferramenta de captura), o conteúdo fica borrado.
window.addEventListener('blur', () => { if (leituraAberta()) ocultar(true); });
window.addEventListener('focus', () => ocultar(false));
document.addEventListener('visibilitychange', () => { if (document.hidden && leituraAberta()) ocultar(true); });
window.addEventListener('beforeprint', () => { if (leituraAberta()) ocultar(true); });

// ----- Prova -----
const modalProva = document.getElementById('modal-prova');
const formProva = document.getElementById('form-prova');
let provaAtual = null;

async function abrirProva(id) {
  try {
    provaAtual = await api(`/api/provas/${id}`);
  } catch (err) { toast(err.message, 'erro'); return; }
  document.getElementById('prova-titulo').textContent = provaAtual.titulo;
  document.getElementById('prova-corpo').innerHTML = provaAtual.questoes.map((q, i) => `
    <fieldset class="questao">
      <legend>Questão ${i + 1}</legend>
      <p>${esc(q.enunciado)}</p>
      ${q.alternativas.map((alt, j) => `
        <label class="alt"><input type="radio" name="q${q.id}" value="${j}" required>
          <span><b>${String.fromCharCode(65 + j)})</b> ${esc(alt)}</span></label>`).join('')}
    </fieldset>`).join('');
  document.getElementById('prova-info').textContent = `${provaAtual.questoes.length} questões · mínimo ${provaAtual.nota_minima}%`;
  const enviar = document.getElementById('prova-enviar');
  enviar.hidden = false;
  enviar.disabled = false;
  modalProva.showModal();
  document.getElementById('prova-corpo').scrollTop = 0;
}

formProva.addEventListener('submit', async (e) => {
  e.preventDefault();
  const respostas = {};
  const faltando = provaAtual.questoes.filter(q => {
    const marcada = formProva.querySelector(`input[name="q${q.id}"]:checked`);
    if (marcada) respostas[q.id] = Number(marcada.value);
    return !marcada;
  });
  if (faltando.length) {
    toast(`Responda todas as questões (${faltando.length} em branco).`, 'erro');
    return;
  }
  const enviar = document.getElementById('prova-enviar');
  enviar.disabled = true;
  try {
    const r = await api(`/api/provas/${provaAtual.id}/responder`, { method: 'POST', body: { respostas } });
    document.getElementById('prova-corpo').innerHTML = `
      <div class="resultado ${r.aprovado ? 'ok' : 'nao'}">
        <div class="grande">${String(r.nota).replace('.', ',')}%</div>
        <h3>${r.aprovado ? 'Parabéns, você foi aprovado! 🎉' : 'Ainda não foi desta vez'}</h3>
        <p>Você acertou ${r.acertos} de ${r.total} questões. Nota mínima: ${r.nota_minima}%.</p>
        ${r.aprovado && r.certificado
          ? `<a class="btn btn-laranja" href="/api/certificados/${r.certificado}.pdf">⬇ Baixar certificado</a>`
          : '<p>Revise as aulas do módulo e tente novamente quando quiser.</p>'}
      </div>`;
    enviar.hidden = true;
    document.getElementById('prova-info').textContent = '';
    await carregar();
    rotear();
  } catch (err) {
    toast(err.message, 'erro');
    enviar.disabled = false;
  }
});

// ----- Eventos gerais -----
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-modulo],[data-rota],[data-aula],[data-prova],[data-fechar]');
  if (!el) return;
  if (el.dataset.fechar !== undefined) el.closest('dialog').close();
  else if (el.dataset.modulo) location.hash = `#/modulo/${el.dataset.modulo}`;
  else if (el.dataset.rota === 'painel') location.hash = '#/';
  else if (el.dataset.aula) abrirAula(Number(el.dataset.aula));
  else if (el.dataset.prova) abrirProva(Number(el.dataset.prova));
});
document.getElementById('btn-menu').addEventListener('click', () => document.getElementById('lateral').classList.toggle('aberta'));
document.getElementById('sair').addEventListener('click', async () => {
  await api('/api/sair', { method: 'POST' });
  location.href = 'index.html';
});
window.addEventListener('hashchange', rotear);

carregar().then(ok => ok && rotear()).catch(err => {
  conteudo.innerHTML = `<p class="carregando">Não foi possível carregar sua trilha: ${esc(err.message)}</p>`;
});
