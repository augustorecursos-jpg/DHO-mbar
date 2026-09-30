// Painel do colaborador: dashboard, módulos, aulas em PDF, prova e certificados.
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

function renderLateral() {
  const rota = location.hash.match(/^#\/modulo\/(\d+)/);
  document.querySelector('[data-rota="painel"]').classList.toggle('ativo', !rota);
  document.getElementById('lista-modulos').innerHTML = estado.modulos.map(m => `
    <button class="lateral-item ${rota && Number(rota[1]) === m.id ? 'ativo' : ''}" data-modulo="${m.id}" title="${m.aulas.length} material(is) em PDF">
      <span class="ic">${esc(m.icone)}</span>${esc(m.titulo)}
      <span class="qtd ${m.certificado ? 'ok' : ''}">${m.certificado ? '✓' : m.aulas.length}</span>
    </button>`).join('');
}

function totais() {
  const aulas = estado.modulos.reduce((s, m) => s + m.aulas.length, 0);
  const feitas = estado.modulos.reduce((s, m) => s + m.aulas_feitas, 0);
  const provas = estado.modulos.filter(m => m.prova);
  const certificados = estado.modulos.filter(m => m.certificado);
  const etapas = aulas + provas.length;
  const progresso = etapas ? Math.round(((feitas + certificados.length) / etapas) * 100) : 0;
  return { aulas, feitas, provasAbertas: provas.length - certificados.length, certificados, progresso };
}

function anel(pct) {
  const r = 62, comp = 2 * Math.PI * r;
  return `
    <div class="anel" role="img" aria-label="Progresso geral: ${pct}%">
      <svg viewBox="0 0 150 150">
        <circle class="trilho" cx="75" cy="75" r="${r}"/>
        <circle class="carga" cx="75" cy="75" r="${r}" stroke-dasharray="${comp}" stroke-dashoffset="${comp}" data-alvo="${comp * (1 - pct / 100)}"/>
      </svg>
      <div class="anel-texto"><strong>${pct}%</strong><span>CONCLUÍDO</span></div>
    </div>`;
}

function proximoPasso() {
  for (const m of estado.modulos) {
    const aula = m.aulas.find(a => !a.vista);
    if (aula) return { modulo: m, texto: `Seu próximo passo: “${aula.titulo}”, no tema ${m.titulo}.` };
    if (m.prova && !m.certificado) return { modulo: m, texto: `Materiais de “${m.titulo}” concluídos — sua avaliação está liberada.` };
  }
  return null;
}

function statusTema(m) {
  if (m.certificado) return '<span class="etiqueta ok">Certificado</span>';
  if (m.progresso > 0) return '<span class="etiqueta pend">Em andamento</span>';
  return '<span class="etiqueta neutra">Não iniciado</span>';
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
  const nProvas = estado.modulos.filter(m => m.prova).length;
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
        <h2 class="titulo-secao">Temas da trilha <small>${estado.modulos.length} temas · ${t.aulas} materiais · ${nProvas} avaliações</small></h2>
        <div class="temas">
          ${estado.modulos.map(m => `
            <button class="tema" data-modulo="${m.id}">
              <span class="tema-topo"><span class="ic">${esc(m.icone)}</span><strong>${esc(m.titulo)}</strong></span>
              <span class="tema-meta">${m.aulas.length} ${m.aulas.length === 1 ? 'material' : 'materiais'} em PDF${m.prova ? ' · avaliação' : ''}</span>
              <span class="tema-rodape"><span class="barra-prog"><i style="width:${m.progresso}%"></i></span><span class="pct">${m.progresso}%</span></span>
              ${statusTema(m)}
            </button>`).join('') || '<p class="carregando">O RH ainda não publicou temas.</p>'}
        </div>
      </section>
      <section>
        <h2 class="titulo-secao">Meus certificados</h2>
        <div class="cartao certificados">
          ${t.certificados.length ? `<ul>${t.certificados.map(m => `
            <li>🎓 ${esc(m.titulo)} <a href="/api/certificados/${m.certificado.codigo}.pdf">Baixar PDF</a></li>`).join('')}</ul>`
            : `<p class="vazio"><span>🎓</span>Conclua a avaliação de um tema com ${estado.modulos.find(m => m.prova)?.prova.nota_minima ?? 75}% de acerto ou mais para receber seu certificado.</p>`}
        </div>
      </section>
    </div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const arco = conteudo.querySelector('.carga');
    if (arco) arco.style.strokeDashoffset = arco.dataset.alvo;
  }));
}

function renderModulo(id) {
  const m = estado.modulos.find(x => x.id === id);
  if (!m) { location.hash = '#/'; return; }
  const aulasOk = m.aulas.every(a => a.vista);
  let provaHtml = '';
  if (m.prova) {
    const p = m.prova;
    const status = m.certificado
      ? `<span class="etiqueta ok">Aprovado · ${String(m.certificado.nota).replace('.', ',')}%</span>`
      : p.tentativas ? `<span class="etiqueta pend">Melhor nota: ${String(p.melhor_nota).replace('.', ',')}%</span>` : '';
    provaHtml = `
      <section class="cartao prova-card">
        <span class="ic">📝</span>
        <div class="txt">
          <h3>${esc(p.titulo)} ${status}</h3>
          <p>${p.questoes} questões · nota mínima ${p.nota_minima}% · ${p.tentativas} tentativa(s)
          ${aulasOk ? '' : '<br>🔒 Conclua todos os materiais para liberar a avaliação.'}</p>
        </div>
        ${m.certificado ? `<a class="btn btn-marinho" href="/api/certificados/${m.certificado.codigo}.pdf">⬇ Baixar certificado</a>` : ''}
        <button class="btn ${m.certificado ? 'btn-claro' : 'btn-laranja'}" data-prova="${p.id}" ${aulasOk ? '' : 'disabled'}>
          ${m.certificado ? 'Refazer avaliação' : p.tentativas ? 'Tentar novamente' : 'Iniciar avaliação'}</button>
      </section>`;
  }
  conteudo.innerHTML = `
    <button class="voltar" data-rota="painel">← Voltar ao painel</button>
    <div class="tema-cab">
      <span class="ic">${esc(m.icone)}</span>
      <div><h1 class="titulo-pagina" style="margin:0">${esc(m.titulo)}</h1>${m.descricao ? `<p>${esc(m.descricao)}</p>` : ''}</div>
      <div class="progresso"><span>${m.progresso}% concluído</span><span class="barra-prog"><i style="width:${m.progresso}%"></i></span></div>
    </div>
    <section class="cartao">
      <h3>📘 Materiais do tema <small>· ${m.aulas_feitas} de ${m.aulas.length} concluídos</small></h3>
      <div class="lista-aulas">
        ${m.aulas.map((a, i) => `
          <div class="aula ${a.vista ? 'feita' : ''}">
            <span class="num">${a.vista ? '✓' : i + 1}</span>
            <strong>${esc(a.titulo)}</strong>
            <span class="pdf">PDF</span>
            <button class="btn ${a.vista ? 'btn-claro' : 'btn-marinho'} btn-sm" data-aula="${a.id}">${a.vista ? 'Rever' : 'Abrir'}</button>
          </div>`).join('') || '<p class="carregando">Nenhum material neste tema ainda.</p>'}
      </div>
    </section>
    ${provaHtml}`;
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

function abrirAula(id) {
  const m = estado.modulos.find(x => x.aulas.some(a => a.id === id));
  aulaAtual = m.aulas.find(a => a.id === id);
  document.getElementById('aula-titulo').textContent = aulaAtual.titulo;
  const url = `/api/aulas/${id}/pdf`;
  document.getElementById('aula-frame').src = url;
  document.getElementById('aula-abrir').href = url;
  const btn = document.getElementById('aula-concluir');
  btn.hidden = aulaAtual.vista;
  modalAula.showModal();
}

document.getElementById('aula-concluir').addEventListener('click', async () => {
  await api(`/api/aulas/${aulaAtual.id}/concluir`, { method: 'POST' });
  modalAula.close();
  toast('Material concluído ✓');
  await carregar();
  rotear();
});
modalAula.addEventListener('close', () => { document.getElementById('aula-frame').src = 'about:blank'; });

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
