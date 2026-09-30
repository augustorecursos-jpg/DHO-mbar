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
    <button class="lateral-item ${rota && Number(rota[1]) === m.id ? 'ativo' : ''}" data-modulo="${m.id}">
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
  const carga = etapas ? Math.round(((feitas + certificados.length) / etapas) * 100) : 0;
  return { aulas, feitas, provasAbertas: provas.length - certificados.length, certificados, carga };
}

function medidor(pct) {
  // Arco de 270° (de 135° a 405°)
  const r = 80, comp = 2 * Math.PI * r * 0.75;
  return `
    <svg viewBox="0 0 200 180" role="img" aria-label="Carga da trilha: ${pct}%">
      <defs><linearGradient id="grad-carga" x1="0" x2="1"><stop offset="0" stop-color="#fbbf57"/><stop offset="1" stop-color="#ea580c"/></linearGradient></defs>
      <circle class="trilho" cx="100" cy="100" r="${r}" stroke-dasharray="${comp} 999" transform="rotate(135 100 100)"/>
      <circle class="carga" cx="100" cy="100" r="${r}" stroke-dasharray="${comp} 999" stroke-dashoffset="${comp}" data-alvo="${comp * (1 - pct / 100)}" transform="rotate(135 100 100)"/>
      <text class="valor" x="100" y="108" text-anchor="middle">${pct}%</text>
      <text class="rotulo" x="100" y="132" text-anchor="middle">DE CARGA</text>
    </svg>`;
}

function proximoPasso() {
  for (const m of estado.modulos) {
    const aula = m.aulas.find(a => !a.vista);
    if (aula) return { modulo: m, texto: `Próxima aula: ${aula.titulo}` };
    if (m.prova && !m.certificado) return { modulo: m, texto: 'Aulas concluídas — sua prova está liberada!' };
  }
  return null;
}

function renderPainel() {
  const t = totais();
  const prox = proximoPasso();
  const primeiroNome = estado.colaborador.nome.split(' ')[0];
  conteudo.innerHTML = `
    <h1 class="titulo-pagina">Painel de energia do <em>seu desenvolvimento</em></h1>
    <div class="faixa-boasvindas">
      <strong>⚡ Olá, ${esc(primeiroNome)}!</strong>
      <span>Estude as aulas de cada módulo, faça a prova e conquiste seu certificado com 75% de acerto ou mais.</span>
    </div>
    <div class="grade-painel">
      <section class="cartao">
        <h3>⚡ Carga da sua Trilha</h3>
        <div class="medidor">${medidor(t.carga)}</div>
        <div class="mini-cards">
          <div class="mini verde"><strong>${t.feitas}</strong><span>AULAS FEITAS</span></div>
          <div class="mini ambar"><strong>${t.aulas}</strong><span>AULAS NA TRILHA</span></div>
          <div class="mini roxo"><strong>${t.provasAbertas}</strong><span>PROVAS ABERTAS</span></div>
          <div class="mini ambar"><strong>${t.certificados.length}</strong><span>CERTIFICADOS</span></div>
        </div>
      </section>
      <div class="coluna">
        <section class="cartao proximo">
          <div>
            <span class="sup">${prox ? 'CONTINUE DE ONDE PAROU' : estado.modulos.length ? 'TRILHA CONCLUÍDA' : 'EM BREVE'}</span>
            <h4>${prox ? esc(prox.modulo.titulo) : estado.modulos.length ? 'Parabéns, trilha 100% energizada! 🎉' : 'Nenhum módulo publicado ainda'}</h4>
            <p>${prox ? esc(prox.texto) : `${t.aulas} aulas · ${estado.modulos.filter(m => m.prova).length} provas`}</p>
            ${prox ? `<button class="btn btn-ambar btn-sm" data-modulo="${prox.modulo.id}">Continuar →</button>` : ''}
          </div>
          <div class="conquistas">
            <h3>🏅 Suas conquistas</h3>
            ${t.certificados.length ? `<ul>${t.certificados.map(m => `
              <li>🎖️ ${esc(m.titulo)} <a href="/api/certificados/${m.certificado.codigo}.pdf">Baixar</a></li>`).join('')}</ul>`
              : '<p class="vazio"><span>🔒</span>Seus certificados aparecem aqui ao ser aprovado nas provas.</p>'}
          </div>
        </section>
        <section class="cartao">
          <h3>🗼 Linhas de Transmissão por Módulo <small>· clique para entrar</small></h3>
          <div class="linhas">
            ${estado.modulos.map(m => `
              <button class="linha" data-modulo="${m.id}">
                <span class="ic">${esc(m.icone)}</span>
                <span class="info"><strong>${esc(m.titulo)}</strong><small>📖 ${m.aulas.length} ${m.aulas.length === 1 ? 'aula' : 'aulas'}${m.prova ? ' · 📝 prova' : ''}${m.certificado ? ' · ✅ certificado' : ''}</small></span>
                <span class="barra-prog"><i style="width:${m.progresso}%"></i></span>
                <span class="pct">${m.progresso}%</span>
              </button>`).join('') || '<p class="carregando">O RH ainda não publicou módulos.</p>'}
          </div>
        </section>
      </div>
    </div>`;
  requestAnimationFrame(() => {
    const arco = conteudo.querySelector('.carga');
    if (arco) arco.style.strokeDashoffset = arco.dataset.alvo;
  });
}

function renderModulo(id) {
  const m = estado.modulos.find(x => x.id === id);
  if (!m) { location.hash = '#/'; return; }
  const aulasOk = m.aulas.every(a => a.vista);
  let provaHtml = '';
  if (m.prova) {
    const p = m.prova;
    const status = m.certificado
      ? `<span class="selo-ok">Aprovado · ${String(m.certificado.nota).replace('.', ',')}%</span>`
      : p.tentativas ? `<span class="selo-pend">Melhor nota: ${String(p.melhor_nota).replace('.', ',')}%</span>` : '';
    provaHtml = `
      <section class="cartao prova-card">
        <span class="ic">📝</span>
        <div class="txt">
          <h3>${esc(p.titulo)} ${status}</h3>
          <p>${p.questoes} questões · nota mínima ${p.nota_minima}% · ${p.tentativas} tentativa(s)
          ${aulasOk ? '' : '<br>🔒 Conclua todas as aulas para liberar a prova.'}</p>
        </div>
        ${m.certificado ? `<a class="btn btn-ambar" href="/api/certificados/${m.certificado.codigo}.pdf">⬇ Baixar certificado</a>` : ''}
        <button class="btn ${m.certificado ? 'btn-claro' : 'btn-roxo'}" data-prova="${p.id}" ${aulasOk ? '' : 'disabled'}>
          ${m.certificado ? 'Refazer prova' : p.tentativas ? 'Tentar novamente' : 'Fazer prova'}</button>
      </section>`;
  }
  conteudo.innerHTML = `
    <button class="voltar" data-rota="painel">← Voltar ao painel</button>
    <div class="modulo-topo">
      <span class="ic">${esc(m.icone)}</span>
      <div><h1 class="titulo-pagina" style="margin:0">${esc(m.titulo)}</h1>${m.descricao ? `<p>${esc(m.descricao)}</p>` : ''}</div>
      <span class="barra-prog" title="${m.progresso}% concluído"><i style="width:${m.progresso}%"></i></span>
    </div>
    <section class="cartao">
      <h3>📖 Aulas <small>· ${m.aulas_feitas} de ${m.aulas.length} concluídas</small></h3>
      <div class="lista-aulas">
        ${m.aulas.map((a, i) => `
          <div class="aula ${a.vista ? 'feita' : ''}">
            <span class="num">${a.vista ? '✓' : i + 1}</span>
            <strong>${esc(a.titulo)}</strong>
            <button class="btn ${a.vista ? 'btn-claro' : 'btn-ambar'} btn-sm" data-aula="${a.id}">${a.vista ? 'Rever' : 'Abrir aula'}</button>
          </div>`).join('') || '<p class="carregando">Nenhuma aula neste módulo ainda.</p>'}
      </div>
    </section>
    ${provaHtml}`;
}

function rotear() {
  renderLateral();
  const rota = location.hash.match(/^#\/modulo\/(\d+)/);
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
  toast('Aula concluída! ⚡');
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
          ? `<a class="btn btn-ambar" href="/api/certificados/${r.certificado}.pdf">⬇ Baixar certificado</a>`
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
