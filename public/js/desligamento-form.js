// Página pública da entrevista de desligamento: link geral, link individual (?c=token) e pré-visualização (?previa=1).
const params = new URLSearchParams(location.search);
const token = params.get('c') || '';
const previa = params.get('previa') === '1';
const conteudo = document.getElementById('conteudo');
let form;

const CAMPOS_ID = [
  ['nome', 'Nome completo', 'text', true],
  ['matricula', 'Matrícula', 'text'],
  ['cargo', 'Cargo', 'text'],
  ['area', 'Área / Diretoria', 'text'],
  ['gestor', 'Gestor imediato', 'text'],
  ['data_admissao', 'Data de admissão', 'date'],
  ['data_desligamento', 'Data de desligamento', 'date'],
];

/** Opções curtas e poucas viram botões lado a lado; as demais, lista. */
const emLinha = (opcoes) => opcoes.length <= 5 && opcoes.every(o => o.length <= 16);

function htmlOpcoes(p, nome, tipo, opcoes) {
  return `<div class="op-lista ${emLinha(opcoes) ? 'em-linha' : ''}">${opcoes.map(o => `
    <label class="op"><input type="${tipo}" name="${nome}" value="${esc(o)}"><span>${esc(o)}</span></label>`).join('')}</div>`;
}

function htmlPergunta(p, n) {
  const nome = `q-${p.id}`;
  const opcoes = [...(p.opcoes || []), ...(p.outro ? ['Outros'] : [])];
  let corpo;
  if (p.tipo === 'unica') corpo = htmlOpcoes(p, nome, 'radio', opcoes);
  else if (p.tipo === 'multipla') corpo = `<p class="dsl-dica">Marque quantas opções quiser.</p>${htmlOpcoes(p, nome, 'checkbox', opcoes)}`;
  else if (p.tipo === 'grade') {
    corpo = `<div class="grade">${p.itens.map((item, k) => `
      <div class="grade-linha" data-item="${esc(item)}">
        <span class="grade-item">${esc(item)}</span>
        <div class="op-lista em-linha" style="--n:${p.opcoes.length}">${p.opcoes.map(o => `
          <label class="op op-sm"><input type="radio" name="${nome}-${k}" value="${esc(o)}"><span>${esc(o)}</span></label>`).join('')}</div>
      </div>`).join('')}</div>`;
  } else if (p.tipo === 'texto') corpo = `<textarea class="campo" name="${nome}" rows="4" maxlength="3000"></textarea>`;
  else if (p.tipo === 'curto') corpo = `<input class="campo" name="${nome}" maxlength="300">`;
  else corpo = `<input class="campo campo-data" type="date" name="${nome}">`;

  return `
    <fieldset class="pergunta" data-pergunta="${esc(p.id)}">
      <legend><span class="num">${n}</span><span>${esc(p.texto)}${p.obrigatoria ? ' <b class="obrig" title="Obrigatória">*</b>' : ''}</span></legend>
      ${corpo}
      ${p.outro ? `<input class="campo outro" name="${nome}-outro" maxlength="300" placeholder="Outros: especifique" hidden>` : ''}
      ${p.justificativa ? `<label class="justif"><span>Justificativa <small>(opcional)</small></span>
        <textarea class="campo" name="${nome}-just" rows="2" maxlength="3000"></textarea></label>` : ''}
      <p class="faltou">Responda esta pergunta para continuar.</p>
    </fieldset>`;
}

function renderFormulario() {
  const c = form.convite;
  let n = 0;
  conteudo.innerHTML = `
    ${previa ? '<p class="dsl-aviso">👁 Pré-visualização: as respostas desta tela não são enviadas.</p>' : ''}
    <section class="dsl-cartao dsl-abertura">
      <small>ÂMBAR ENERGIA · GESTÃO DE PESSOAS</small>
      <h1>${esc(form.titulo)}</h1>
      ${c?.nome ? `<p class="ola">Olá, <strong>${esc(c.nome.split(' ')[0])}</strong>! Obrigado por dedicar alguns minutos a esta conversa.</p>` : ''}
      <p class="confidencial">🔒 ${esc(form.introducao)}</p>
      <p class="dsl-dica">Perguntas com <b class="obrig">*</b> são obrigatórias. Leva cerca de 10 minutos.</p>
    </section>

    <form id="form-dsl" novalidate>
      <section class="dsl-cartao">
        <h2><span class="sec-num">👤</span> Identificação</h2>
        <div class="ident">${CAMPOS_ID.map(([k, rotulo, tipo, obrig]) => `
          <label class="${k === 'nome' ? 'largo' : ''}"><span>${rotulo}${obrig ? ' <b class="obrig">*</b>' : ''}</span>
            <input class="campo" name="id-${k}" type="${tipo}" maxlength="200" value="${esc(c?.[k] || '')}" ${c?.[k] ? 'readonly' : ''}></label>`).join('')}
        </div>
      </section>

      ${form.secoes.map((sec, i) => `
        <section class="dsl-cartao">
          <h2><span class="sec-num">${i + 1}</span> ${esc(sec.titulo)}</h2>
          ${sec.perguntas.map(p => htmlPergunta(p, ++n)).join('')}
        </section>`).join('')}

      <div class="dsl-enviar">
        <button class="btn btn-laranja" type="submit">Enviar entrevista</button>
        <button class="btn-recusa" type="button" id="recusar">Não tenho interesse em realizar a entrevista de desligamento</button>
      </div>
    </form>`;

  const f = document.getElementById('form-dsl');
  f.addEventListener('change', (e) => {
    const q = e.target.closest('[data-pergunta]');
    if (q) {
      const outro = q.querySelector('.outro');
      if (outro) outro.hidden = !q.querySelector('input[value="Outros"]:checked');
      if (respondida(q, perguntaPorId(q.dataset.pergunta))) q.classList.remove('faltando');
    }
    atualizarProgresso();
  });
  f.addEventListener('input', atualizarProgresso);
  f.addEventListener('submit', (e) => { e.preventDefault(); enviar(false); });
  document.getElementById('recusar').addEventListener('click', () => enviar(true));
  atualizarProgresso();
}

const perguntas = () => form.secoes.flatMap(s => s.perguntas);
const perguntaPorId = (id) => perguntas().find(p => p.id === id);

function lerPergunta(caixa, p) {
  const nome = `q-${p.id}`;
  let valor;
  if (p.tipo === 'unica') valor = caixa.querySelector(`input[name="${nome}"]:checked`)?.value || '';
  else if (p.tipo === 'multipla') valor = [...caixa.querySelectorAll(`input[name="${nome}"]:checked`)].map(i => i.value);
  else if (p.tipo === 'grade') {
    valor = {};
    p.itens.forEach((item, k) => {
      const v = caixa.querySelector(`input[name="${nome}-${k}"]:checked`)?.value;
      if (v) valor[item] = v;
    });
  } else valor = caixa.querySelector(`[name="${nome}"]`).value.trim();
  return {
    valor,
    outro: caixa.querySelector(`[name="${nome}-outro"]`)?.value.trim() || '',
    justificativa: caixa.querySelector(`[name="${nome}-just"]`)?.value.trim() || '',
  };
}

function respondida(caixa, p) {
  const { valor } = lerPergunta(caixa, p);
  if (p.tipo === 'grade') return Object.keys(valor).length === p.itens.length;
  return Array.isArray(valor) ? valor.length > 0 : Boolean(valor);
}

function atualizarProgresso() {
  const obrig = perguntas().filter(p => p.obrigatoria);
  const feitas = obrig.filter(p => respondida(document.querySelector(`[data-pergunta="${CSS.escape(p.id)}"]`), p)).length;
  document.getElementById('dsl-barra').style.width = `${obrig.length ? (feitas / obrig.length) * 100 : 100}%`;
}

async function enviar(recusou) {
  const f = document.getElementById('form-dsl');
  const identificacao = Object.fromEntries(CAMPOS_ID.map(([k]) => [k, f.querySelector(`[name="id-${k}"]`).value.trim()]));
  if (!identificacao.nome) {
    toast('Informe seu nome completo.', 'erro');
    f.querySelector('[name="id-nome"]').focus();
    return;
  }
  const respostas = {};
  if (!recusou) {
    let primeira = null;
    for (const p of perguntas()) {
      const caixa = f.querySelector(`[data-pergunta="${CSS.escape(p.id)}"]`);
      respostas[p.id] = lerPergunta(caixa, p);
      const falta = p.obrigatoria && !respondida(caixa, p);
      caixa.classList.toggle('faltando', falta);
      if (falta && !primeira) primeira = caixa;
    }
    if (primeira) {
      primeira.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return toast('Há perguntas obrigatórias sem resposta.', 'erro');
    }
  } else if (!confirm('Confirma que não tem interesse em realizar a entrevista de desligamento?')) return;

  if (previa) return toast('Pré-visualização: nada foi enviado ✅');
  const botoes = f.querySelectorAll('button');
  botoes.forEach(b => { b.disabled = true; });
  try {
    await api('/api/desligamento', { method: 'POST', body: { c: token || undefined, identificacao, respostas, recusou } });
    agradecer(recusou ? 'Sua decisão foi registrada. Agradecemos por todo o tempo que esteve conosco e desejamos sucesso na sua nova jornada!'
      : 'Sua entrevista foi enviada. Agradecemos a sinceridade e todo o tempo que esteve conosco. Desejamos sucesso na sua nova jornada!');
  } catch (err) {
    toast(err.message, 'erro');
    botoes.forEach(b => { b.disabled = false; });
  }
}

function agradecer(msg) {
  document.getElementById('dsl-barra').style.width = '100%';
  conteudo.innerHTML = `<section class="dsl-cartao dsl-fim"><span class="selo">✓</span><h1>Obrigado!</h1><p>${esc(msg)}</p></section>`;
  window.scrollTo(0, 0);
}

(async () => {
  try {
    form = await api(`/api/desligamento${token ? `?c=${encodeURIComponent(token)}` : ''}`);
  } catch (err) {
    conteudo.innerHTML = `<section class="dsl-cartao"><p>${esc(err.message)}</p></section>`;
    return;
  }
  document.title = `${form.titulo} · Âmbar Energia`;
  document.getElementById('dsl-titulo-topo').textContent = form.titulo;
  if (form.convite && form.convite.status !== 'pendente') return agradecer('Esta entrevista já foi registrada. Obrigado por sua participação!');
  if (!form.ativa && !previa) {
    conteudo.innerHTML = '<section class="dsl-cartao"><p>A entrevista de desligamento não está recebendo respostas no momento. Procure o time de RH.</p></section>';
    return;
  }
  renderFormulario();
})();
