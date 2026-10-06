// Entrevista de desligamento em capítulos: uma seção por tela, com mapa das seções, progresso e revisão antes do envio. Aceita o link geral, o link individual (?c=token) e a pré-visualização (?previa=1).
const params = new URLSearchParams(location.search);
const token = params.get('c') || '';
const previa = params.get('previa') === '1';
const palco = document.getElementById('cv-form');
let form;
let etapas = [];
let todas = []; // todas as perguntas: { p, secao, num }
let atual = 0;
let enviando = false;

const CAMPOS_ID = [
  ['nome', 'Nome completo', 'text', true],
  ['matricula', 'Matrícula', 'text'],
  ['cargo', 'Cargo', 'text'],
  ['area', 'Área / Diretoria', 'text'],
  ['gestor', 'Gestor imediato', 'text'],
  ['data_admissao', 'Admissão', 'date'],
  ['data_desligamento', 'Desligamento', 'date'],
];


// ---------- montagem ----------
/** Opções com bolinha (escolha única) ou caixinha (várias respostas); curtas ficam lado a lado. */
function htmlOpcoes(p, nome, tipo, opcoes) {
  const emLinha = opcoes.length <= 5 && opcoes.every(o => o.length <= 16);
  return `<div class="cv-opcoes ${emLinha ? 'em-linha' : ''}">${opcoes.map(o => `
    <label class="cv-op"><input type="${tipo}" name="${nome}" value="${esc(o)}"><span>${esc(o)}</span></label>`).join('')}</div>`;
}

function htmlPergunta(p) {
  const nome = `q-${p.id}`;
  const opcoes = [...(p.opcoes || []), ...(p.outro ? ['Outros'] : [])];
  let corpo;
  if (p.tipo === 'unica') corpo = htmlOpcoes(p, nome, 'radio', opcoes);
  else if (p.tipo === 'multipla') corpo = `<p class="cv-dica">Escolha quantas quiser</p>${htmlOpcoes(p, nome, 'checkbox', opcoes)}`;
  else if (p.tipo === 'grade') {
    corpo = `
      <div class="cv-grade" style="--n:${p.opcoes.length}">
        <div class="cv-grade-cab"><span></span>${p.opcoes.map(o => `<span>${esc(o)}</span>`).join('')}</div>
        ${p.itens.map((item, k) => `
          <div class="cv-grade-linha">
            <span class="cv-grade-item">${esc(item)}</span>
            ${p.opcoes.map(o => `<label class="cv-ponto" title="${esc(o)}">
              <input type="radio" name="${nome}-${k}" value="${esc(o)}"><i></i><em>${esc(o)}</em></label>`).join('')}
          </div>`).join('')}
      </div>`;
  } else if (p.tipo === 'texto') corpo = `<textarea class="cv-campo" name="${nome}" rows="4" maxlength="3000" placeholder="Escreva aqui…"></textarea>`;
  else if (p.tipo === 'curto') corpo = `<input class="cv-campo" name="${nome}" maxlength="300" placeholder="Digite aqui…">`;
  else corpo = `<input class="cv-campo cv-data" type="date" name="${nome}">`;

  return `
    ${corpo}
    ${p.outro ? `<input class="cv-campo cv-outro" name="${nome}-outro" maxlength="300" placeholder="Qual? Conte em poucas palavras" hidden>` : ''}
    ${p.justificativa ? `<details class="cv-justif"><summary>＋ Quer explicar sua resposta? <small>opcional</small></summary>
      <textarea class="cv-campo" name="${nome}-just" rows="3" maxlength="3000" placeholder="Sua justificativa…"></textarea></details>` : ''}`;
}

function montar() {
  const c = form.convite;
  const nome1 = c?.nome ? esc(c.nome.split(' ')[0]) : '';
  const perguntas = form.secoes.flatMap((s, i) => s.perguntas.map(p => ({ p, secao: i })));
  todas = perguntas.map((x, k) => ({ ...x, num: k + 1 }));
  etapas = [
    { tipo: 'boas', secao: -1 },
    { tipo: 'ident', secao: -1 },
    ...form.secoes.map((s, i) => ({ tipo: 'secao', s, secao: i })),
    { tipo: 'revisao', secao: form.secoes.length },
  ];

  palco.innerHTML = etapas.map((e, n) => {
    if (e.tipo === 'boas') {
      return `<section tabindex="-1" class="cv-etapa cv-boas" data-n="${n}">
        <small class="cv-kicker">${esc(form.titulo).toUpperCase()}</small>
        <h1>${nome1 ? `${nome1}, antes de você seguir,<br>` : 'Antes de você seguir,<br>'}<em>queremos ouvir você.</em></h1>
        <p class="cv-lead">${esc(form.introducao)}</p>
        <ul class="cv-fatos">
          <li><strong>${perguntas.length}</strong><span>perguntas</span></li>
          <li><strong>~10</strong><span>minutos</span></li>
          <li><strong>${form.secoes.length}</strong><span>etapas</span></li>
        </ul>
        <div class="cv-boas-acoes">
          <button type="button" class="cv-ok cv-ok-grande" data-ir="1">Começar a conversa <span aria-hidden="true">→</span></button>
          <button type="button" class="cv-recusa" data-recusar>Prefiro não participar</button>
        </div>
      </section>`;
    }
    if (e.tipo === 'ident') {
      return `<section tabindex="-1" class="cv-etapa" data-n="${n}">
        <p class="cv-num">Para começar</p>
        <h2 class="cv-pergunta">Confirme seus dados</h2>
        <p class="cv-dica">${c ? 'Já preenchemos o que o RH informou.' : 'Só o nome é obrigatório.'}</p>
        <div class="cv-ident">${CAMPOS_ID.map(([k, rotulo, tipo, obrig]) => `
          <label class="${k === 'nome' ? 'largo' : ''}"><input class="cv-campo" name="id-${k}" type="${tipo}" maxlength="200" placeholder=" "
            value="${esc(c?.[k] || '')}" ${c?.[k] ? 'readonly' : ''}><span>${rotulo}${obrig ? ' *' : ''}</span></label>`).join('')}
        </div>
      </section>`;
    }
    if (e.tipo === 'revisao') {
      return `<section tabindex="-1" class="cv-etapa cv-revisao" data-n="${n}">
        <p class="cv-num">Última etapa</p>
        <h2 class="cv-pergunta">Tudo pronto para enviar?</h2>
        <div id="cv-resumo"></div>
        <div class="cv-boas-acoes">
          <button type="button" class="cv-ok cv-ok-grande" data-enviar>Enviar entrevista <span aria-hidden="true">✓</span></button>
        </div>
      </section>`;
    }
    const total = String(form.secoes.length).padStart(2, '0');
    return `<section tabindex="-1" class="cv-etapa cv-capitulo" data-n="${n}">
      <header class="cv-cap-cab">
        <p class="cv-num"><b>${String(e.secao + 1).padStart(2, '0')}</b> <span>/ ${total}</span></p>
        <h2 class="cv-cap-titulo">${esc(e.s.titulo)}</h2>
      </header>
      ${todas.filter(x => x.secao === e.secao).map(({ p, num }) => `
        <div class="cv-q" data-pergunta="${esc(p.id)}">
          <p class="cv-q-num">${String(num).padStart(2, '0')}${p.obrigatoria ? '' : ' <i>opcional</i>'}</p>
          <h3 class="cv-pergunta">${esc(p.texto)}</h3>
          ${htmlPergunta(p)}
          <p class="cv-erro" role="alert"></p>
        </div>`).join('')}
    </section>`;
  }).join('');

  document.getElementById('cv-mapa').innerHTML = form.secoes.map((s, i) => `
    <li data-secao="${i}"><button type="button" data-ir-secao="${i}"><b>${String(i + 1).padStart(2, '0')}</b>${esc(s.titulo)}</button></li>`).join('');
  ir(0, true);
}

// ---------- leitura ----------
const perguntaDe = (caixa) => todas.find(x => x.p.id === caixa.dataset.pergunta)?.p;
const caixaDe = (p) => palco.querySelector(`[data-pergunta="${CSS.escape(p.id)}"]`);
function lerPergunta(sec, p) {
  const nome = `q-${p.id}`;
  let valor;
  if (p.tipo === 'unica') valor = sec.querySelector(`input[name="${nome}"]:checked`)?.value || '';
  else if (p.tipo === 'multipla') valor = [...sec.querySelectorAll(`input[name="${nome}"]:checked`)].map(i => i.value);
  else if (p.tipo === 'grade') {
    valor = {};
    p.itens.forEach((item, k) => {
      const v = sec.querySelector(`input[name="${nome}-${k}"]:checked`)?.value;
      if (v) valor[item] = v;
    });
  } else valor = sec.querySelector(`[name="${nome}"]`).value.trim();
  return {
    valor,
    outro: sec.querySelector(`[name="${nome}-outro"]`)?.value.trim() || '',
    justificativa: sec.querySelector(`[name="${nome}-just"]`)?.value.trim() || '',
  };
}
function respondida(sec, p) {
  const { valor } = lerPergunta(sec, p);
  if (p.tipo === 'grade') return Object.keys(valor).length === p.itens.length;
  return Array.isArray(valor) ? valor.length > 0 : Boolean(valor);
}
const secaoEtapa = (n) => palco.querySelector(`[data-n="${n}"]`);

// ---------- navegação ----------
function ir(n, inicial = false, pergunta = null) {
  n = Math.max(0, Math.min(etapas.length - 1, n));
  const anterior = secaoEtapa(atual);
  const proxima = secaoEtapa(n);
  if (!inicial && anterior) anterior.classList.remove('ativa');
  proxima.dataset.dir = n >= atual ? 'frente' : 'tras';
  proxima.classList.add('ativa');
  atual = n;
  const e = etapas[n];
  document.body.classList.toggle('cv-inicio', e.tipo === 'boas');
  document.getElementById('cv-nav').hidden = e.tipo === 'boas';
  document.getElementById('cv-avancar').hidden = e.tipo === 'revisao';
  if (e.tipo === 'revisao') montarResumo();
  atualizarLado();
  if (!inicial) {
    // No computador, o cursor já vai para o campo de texto; no celular, não abre o teclado sozinho.
    const campo = proxima.querySelector('.cv-campo:not([readonly]):not(.cv-outro):not([name$="-just"])');
    if (campo && e.tipo === 'ident' && !window.matchMedia('(pointer: coarse)').matches) campo.focus({ preventScroll: true });
    else proxima.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    if (pergunta) setTimeout(() => pergunta.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  }
}

function validarAtual() {
  const e = etapas[atual];
  const sec = secaoEtapa(atual);
  if (e.tipo === 'ident') {
    const nome = sec.querySelector('[name="id-nome"]');
    if (!nome.value.trim()) { tremer(sec); nome.focus(); toast('Informe seu nome completo.', 'erro'); return false; }
  }
  if (e.tipo === 'secao') {
    let primeira = null;
    for (const { p } of todas.filter(x => x.secao === e.secao)) {
      const caixa = caixaDe(p);
      const falta = p.obrigatoria && !respondida(caixa, p);
      caixa.classList.toggle('faltando', falta);
      caixa.querySelector('.cv-erro').textContent = falta ? (p.tipo === 'grade' ? 'Avalie todos os itens.' : 'Esta pergunta é obrigatória.') : '';
      if (falta && !primeira) primeira = caixa;
    }
    if (primeira) {
      primeira.scrollIntoView({ behavior: 'smooth', block: 'center' });
      tremer(primeira);
      toast('Há perguntas obrigatórias sem resposta nesta etapa.', 'erro');
      return false;
    }
  }
  return true;
}
function tremer(sec) {
  sec.classList.remove('treme'); void sec.offsetWidth; sec.classList.add('treme');
}
function avancar() { if (validarAtual()) ir(atual + 1); }

function atualizarLado() {
  const e = etapas[atual];
  const feitas = todas.filter(x => respondida(caixaDe(x.p), x.p)).length;
  const pct = todas.length ? Math.round((feitas / todas.length) * 100) : 0;
  const anel = document.getElementById('cv-anel-valor');
  anel.style.strokeDashoffset = String(326.7 * (1 - pct / 100));
  document.getElementById('cv-anel-num').textContent = `${pct}%`;
  document.getElementById('cv-linha').style.width = `${(atual / (etapas.length - 1)) * 100}%`;
  const titulo = e.tipo === 'boas' ? 'Boas-vindas' : e.tipo === 'ident' ? 'Seus dados' : e.tipo === 'revisao' ? 'Revisão' : form.secoes[e.secao].titulo;
  document.getElementById('cv-secao').textContent = titulo;
  document.getElementById('cv-topo-sec').textContent = titulo;
  document.getElementById('cv-topo-num').textContent = e.tipo === 'secao' ? `${e.secao + 1}/${form.secoes.length}` : '';
  document.querySelectorAll('#cv-mapa li').forEach(li => {
    const i = Number(li.dataset.secao);
    const completa = todas.filter(x => x.secao === i).every(x => !x.p.obrigatoria || respondida(caixaDe(x.p), x.p));
    li.className = i === e.secao ? 'atual' : i < e.secao ? (completa ? 'feita' : 'pendente') : '';
  });
}

function montarResumo() {
  const faltam = todas.filter(x => x.p.obrigatoria && !respondida(caixaDe(x.p), x.p));
  const total = todas.length;
  const resp = todas.filter(x => respondida(caixaDe(x.p), x.p)).length;
  document.getElementById('cv-resumo').innerHTML = `
    <div class="cv-placar"><strong>${resp}</strong><span>de ${total} perguntas respondidas</span></div>
    ${faltam.length ? `<p class="cv-dica">Faltam ${faltam.length} obrigatória(s). Toque para responder:</p>
      <ul class="cv-faltam">${faltam.map(x => `<li><button type="button" data-ir="${etapas.findIndex(e => e.secao === x.secao && e.tipo === 'secao')}" data-q="${esc(x.p.id)}">${esc(x.p.texto)} <span>→</span></button></li>`).join('')}</ul>`
      : '<p class="cv-lead">Obrigado pela sinceridade. Suas respostas ajudam a construir uma Âmbar melhor para quem fica.</p>'}`;
  palco.querySelector('[data-enviar]').disabled = faltam.length > 0;
}

// ---------- eventos ----------
palco.addEventListener('click', (e) => {
  const alvo = e.target.closest('[data-ir]');
  if (alvo) {
    if (alvo.dataset.q) return ir(Number(alvo.dataset.ir), false, palco.querySelector(`[data-pergunta="${CSS.escape(alvo.dataset.q)}"]`));
    if (Number(alvo.dataset.ir) > atual && !validarAtual()) return;
    return ir(Number(alvo.dataset.ir));
  }
  if (e.target.closest('[data-enviar]')) return enviar(false);
  if (e.target.closest('[data-recusar]')) return enviar(true);
});
palco.addEventListener('change', (e) => {
  const sec = e.target.closest('[data-pergunta]');
  if (!sec) return atualizarLado();
  const p = perguntaDe(sec);
  if (respondida(sec, p)) { sec.classList.remove('faltando'); sec.querySelector('.cv-erro').textContent = ''; }
  const outro = sec.querySelector('.cv-outro');
  const marcouOutro = Boolean(sec.querySelector('input[value="Outros"]:checked'));
  if (outro) { outro.hidden = !marcouOutro; if (marcouOutro && e.target.value === 'Outros') outro.focus(); }
  atualizarLado();
});
document.getElementById('cv-avancar').addEventListener('click', avancar);
document.getElementById('cv-voltar').addEventListener('click', () => ir(atual - 1));
document.getElementById('cv-mapa').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ir-secao]');
  if (!b) return;
  const n = etapas.findIndex(x => x.tipo === 'secao' && x.secao === Number(b.dataset.irSecao));
  if (n > atual && !validarAtual()) return;
  ir(n);
});
palco.addEventListener('submit', (e) => e.preventDefault());

// Enter avança só na abertura e nos dados pessoais; nas seções, não pula etapa sem querer.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !etapas.length || enviando || e.ctrlKey || e.metaKey || e.altKey) return;
  if (['BUTTON', 'SUMMARY', 'TEXTAREA', 'A'].includes(document.activeElement?.tagName)) return;
  const tipo = etapas[atual].tipo;
  if (tipo === 'boas') { e.preventDefault(); ir(1); }
  else if (tipo === 'ident') { e.preventDefault(); avancar(); }
});

// ---------- envio ----------
async function enviar(recusou) {
  const identificacao = Object.fromEntries(CAMPOS_ID.map(([k]) => [k, palco.querySelector(`[name="id-${k}"]`).value.trim()]));
  if (recusou) {
    if (!identificacao.nome) {
      const nome = prompt('Tudo bem! Para registrarmos, informe seu nome completo:');
      if (!nome?.trim()) return;
      identificacao.nome = nome.trim();
    } else if (!confirm('Confirma que prefere não realizar a entrevista de desligamento?')) return;
  } else if (!identificacao.nome) { ir(1); return toast('Informe seu nome completo.', 'erro'); }

  const respostas = {};
  if (!recusou) for (const { p } of todas) respostas[p.id] = lerPergunta(caixaDe(p), p);
  if (previa) return toast('Pré-visualização: nada foi enviado ✅');
  enviando = true;
  palco.querySelectorAll('button').forEach(b => { b.disabled = true; });
  try {
    await api('/api/desligamento', { method: 'POST', body: { c: token || undefined, identificacao, respostas, recusou } });
    agradecer(recusou
      ? 'Sua decisão foi registrada. Agradecemos por todo o tempo que esteve conosco e desejamos sucesso na sua nova jornada!'
      : 'Sua entrevista foi enviada. Agradecemos a sinceridade e todo o tempo que esteve conosco. Desejamos sucesso na sua nova jornada!');
  } catch (err) {
    enviando = false;
    palco.querySelectorAll('button').forEach(b => { b.disabled = false; });
    if (!recusou) montarResumo();
    toast(err.message, 'erro');
  }
}

function agradecer(msg) {
  document.body.classList.add('cv-inicio', 'cv-fim');
  document.getElementById('cv-nav').hidden = true;
  document.getElementById('cv-secao').textContent = 'Obrigado';
  document.getElementById('cv-anel-valor').style.strokeDashoffset = '0';
  document.getElementById('cv-anel-num').textContent = '100%';
  document.getElementById('cv-linha').style.width = '100%';
  palco.innerHTML = `<section tabindex="-1" class="cv-etapa cv-boas cv-obrigado ativa">
    <div class="cv-selo" aria-hidden="true"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg></div>
    <small class="cv-kicker">ENTREVISTA REGISTRADA</small>
    <h1>Obrigado, <em>de verdade.</em></h1>
    <p class="cv-lead">${esc(msg)}</p>
  </section>`;
  etapas = [];
}

function mensagem(html) {
  document.body.classList.add('cv-inicio');
  palco.innerHTML = `<section tabindex="-1" class="cv-etapa cv-boas ativa"><small class="cv-kicker">ÂMBAR ENERGIA · RH</small><h1>${html}</h1></section>`;
}

(async () => {
  if (previa) document.getElementById('cv-previa').hidden = false;
  try {
    form = await api(`/api/desligamento${token ? `?c=${encodeURIComponent(token)}` : ''}`);
  } catch (err) { return mensagem(`<em>Ops.</em><br>${esc(err.message)}`); }
  document.title = `${form.titulo} · Âmbar Energia`;
  document.getElementById('cv-kicker').textContent = form.titulo.toUpperCase();
  if (form.convite && form.convite.status !== 'pendente') return agradecer('Esta entrevista já foi registrada. Obrigado por sua participação!');
  if (!form.ativa && !previa) return mensagem('A entrevista não está recebendo respostas <em>no momento.</em><br><small>Procure o time de RH.</small>');
  montar();
})();
