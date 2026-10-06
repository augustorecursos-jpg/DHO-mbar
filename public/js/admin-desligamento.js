// Área do RH · Entrevista de desligamento: convites (link, WhatsApp, e-mail e QR Code), indicadores,
// respostas, exportação em Excel e editor do formulário.
// Carregado antes de admin.js; usa fmt, fmtPct, num e barras de lá somente em tempo de execução.
const dsl = { form: null, convites: [], respostas: [], sub: 'enviar', secoes: [] };

const DSL_TIPOS = { unica: 'Escolha única', multipla: 'Múltipla seleção', grade: 'Grade (itens × escala)', curto: 'Texto curto', texto: 'Texto longo', data: 'Data' };
const DSL_PRESETS = {
  sat: ['Excelente', 'Bom', 'Regular', 'Ruim'],
  freq: ['Sempre', 'Muitas vezes', 'Poucas vezes', 'Nunca'],
  simnao: ['Sim', 'Não'],
  sat_na: ['N/A', 'Excelente', 'Bom', 'Regular', 'Ruim'],
};
// Escalas reconhecidas para o "% positivo": as primeiras metades são as respostas favoráveis.
const DSL_ESCALAS = [DSL_PRESETS.sat, DSL_PRESETS.freq, ['Ótimo', 'Bom', 'Regular', 'Ruim', 'Péssimo'], ['Muito satisfeito', 'Satisfeito', 'Insatisfeito', 'Muito insatisfeito']];
const DSL_STATUS = { pendente: ['Aguardando', 'st-pendente'], respondido: ['Respondida', 'st-ok'], recusou: ['Recusou', 'st-recusa'] };

const dslNorm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const dslNA = (o) => ['n/a', 'na', 'nao se aplica'].includes(dslNorm(o));

/** Escala ordenada (do melhor para o pior) das opções, ignorando N/A; null se não for uma escala conhecida. */
function dslEscala(opcoes) {
  const sem = (opcoes || []).filter(o => !dslNA(o)).map(dslNorm);
  const e = DSL_ESCALAS.find(x => x.length === sem.length && x.every((v, i) => dslNorm(v) === sem[i]));
  return e ? (opcoes || []).filter(o => !dslNA(o)) : null;
}
const dslPositiva = (escala, valor) => escala.indexOf(valor) > -1 && escala.indexOf(valor) < escala.length / 2;

const dslLink = (token) => `${location.origin}/desligamento.html${token ? `?c=${token}` : ''}`;
const dslPrimeiroNome = (n) => String(n || '').trim().split(/\s+/)[0] || '';
function dslMensagem(nome, link) {
  let m = dsl.form?.mensagem || '{link}';
  m = nome ? m.replaceAll('{nome}', dslPrimeiroNome(nome)) : m.replace(/,?\s*\{nome\}/g, '');
  return m.replaceAll('{link}', link);
}
function dslWhats(telefone, msg) {
  let d = String(telefone || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  else if (!(d.startsWith('55') && (d.length === 12 || d.length === 13))) d = '';
  return `https://wa.me/${d}?text=${encodeURIComponent(msg)}`;
}
const dslEmail = (email, msg) => `mailto:${String(email || '').replace(/[^\w.@+-]/g, '')}?subject=${encodeURIComponent(dsl.form?.assunto || '')}&body=${encodeURIComponent(msg)}`;

const dslData = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '–');
const dslDataHora = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '–');
const dslRef = (r) => r.data_desligamento || (r.criado_em || '').slice(0, 10);
function dslMeses(adm, desl) {
  if (!adm || !desl) return null;
  const [a1, m1, d1] = adm.split('-').map(Number);
  const [a2, m2, d2] = desl.split('-').map(Number);
  const meses = (a2 - a1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  return meses >= 0 ? meses : null;
}
const dslTempo = (m) => (m == null ? '–' : m < 12 ? `${m} ${m === 1 ? 'mês' : 'meses'}` : `${fmt(m / 12, 1)} anos`);

async function dslCopiar(texto) {
  try { await navigator.clipboard.writeText(texto); } catch {
    const t = Object.assign(document.createElement('textarea'), { value: texto });
    document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
  }
  toast('Link copiado ✅');
}

// ---------- Carregamento e sub-abas ----------
async function carregarDesligamento() {
  const [form, convites, respostas] = await Promise.all([
    api('/api/admin/desligamento'), api('/api/admin/desligamento/convites'), api('/api/admin/desligamento/respostas'),
  ]);
  Object.assign(dsl, { form, convites, respostas });
  dslCarregarEditor(form);
  dslTrocarSub(dsl.sub);
}

function dslTrocarSub(sub) {
  dsl.sub = sub;
  document.querySelectorAll('[data-sub]').forEach(b => b.classList.toggle('ativo', b.dataset.sub === sub));
  document.querySelectorAll('[data-sub-painel]').forEach(p => { p.hidden = p.dataset.subPainel !== sub; });
  ({ enviar: dslRenderEnviar, indicadores: dslRenderIndicadores, respostas: dslRenderRespostas, formulario: dslRenderEditor })[sub]();
}
document.querySelectorAll('[data-sub]').forEach(b => b.addEventListener('click', () => dslTrocarSub(b.dataset.sub)));

// ---------- Enviar ----------
function dslBotoesEnvio(c) {
  const link = dslLink(c.token);
  const msg = dslMensagem(c.nome, link);
  return `
    <a class="btn btn-whats btn-sm" href="${esc(dslWhats(c.telefone, msg))}" target="_blank" rel="noopener" title="${c.telefone ? 'Enviar para ' + esc(c.telefone) : 'Escolher o contato no WhatsApp'}">WhatsApp</a>
    <a class="btn btn-claro btn-sm" href="${esc(dslEmail(c.email, msg))}" title="${c.email ? 'Enviar para ' + esc(c.email) : 'Abrir e-mail'}">✉️</a>
    <button type="button" class="btn btn-claro btn-sm" data-copiar="${esc(link)}" title="Copiar link">📋</button>
    <button type="button" class="btn btn-claro btn-sm" data-qr-dsl="${esc(c.token)}" title="QR Code">📱</button>`;
}

function dslRenderEnviar() {
  const geral = dslLink('');
  const msg = dslMensagem('', geral);
  document.getElementById('dsl-link-geral').value = geral;
  document.getElementById('dsl-whats-geral').href = dslWhats('', msg);
  document.getElementById('dsl-email-geral').href = dslEmail('', msg);

  const unicos = (campo) => [...new Set([...dsl.convites, ...dsl.respostas].map(x => x[campo]).filter(Boolean))].sort();
  for (const [id, campo] of [['dsl-lista-cargos', 'cargo'], ['dsl-lista-areas', 'area'], ['dsl-lista-gestores', 'gestor']]) {
    document.getElementById(id).innerHTML = unicos(campo).map(v => `<option value="${esc(v)}">`).join('');
  }

  const status = document.getElementById('dsl-filtro-status').value;
  const busca = dslNorm(document.getElementById('dsl-busca-convites').value);
  const lista = dsl.convites.filter(c => (!status || c.status === status)
    && (!busca || dslNorm([c.nome, c.area, c.cargo, c.gestor, c.matricula].join(' ')).includes(busca)));
  const pend = dsl.convites.filter(c => c.status === 'pendente').length;
  document.getElementById('dsl-qtd-convites').textContent = `· ${dsl.convites.length} convite(s) · ${pend} aguardando resposta`;
  document.getElementById('dsl-convites').innerHTML = `
    <tr><th>Colaborador</th><th>Área</th><th>Desligamento</th><th>Situação</th><th>Enviar / reenviar</th><th></th></tr>
    ${lista.map(c => {
      const [rot, cls] = DSL_STATUS[c.status];
      return `<tr>
        <td><strong>${esc(c.nome)}</strong><small class="sub">${esc([c.cargo, c.matricula && 'Mat. ' + c.matricula].filter(Boolean).join(' · '))}</small></td>
        <td>${esc(c.area || '–')}</td><td>${dslData(c.data_desligamento)}</td>
        <td><span class="selo-st ${cls}">${rot}</span>${c.respondido_em ? `<small class="sub">${dslDataHora(c.respondido_em)}</small>` : ''}</td>
        <td><div class="acoes-envio">${dslBotoesEnvio(c)}</div></td>
        <td><button type="button" class="q-rem" data-rem-convite="${c.id}" title="Excluir convite">🗑</button></td>
      </tr>`;
    }).join('') || `<tr><td colspan="6">${dsl.convites.length ? 'Nenhum convite neste filtro.' : 'Nenhum convite gerado ainda.'}</td></tr>`}`;
}
document.getElementById('dsl-filtro-status').addEventListener('change', dslRenderEnviar);
document.getElementById('dsl-busca-convites').addEventListener('input', dslRenderEnviar);

document.getElementById('dsl-form-convite').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const dados = Object.fromEntries(new FormData(f));
  try {
    const { token } = await api('/api/admin/desligamento/convites', { method: 'POST', body: dados });
    dsl.convites = await api('/api/admin/desligamento/convites');
    f.reset();
    const c = dsl.convites.find(x => x.token === token);
    document.getElementById('dsl-convite-novo').innerHTML = `
      <div class="convite-novo">
        <p>✅ Link gerado para <strong>${esc(c.nome)}</strong>:</p>
        <input class="campo" readonly value="${esc(dslLink(token))}" aria-label="Link do convite">
        <div class="acoes-envio">${dslBotoesEnvio(c)}</div>
      </div>`;
    dslRenderEnviar();
  } catch (err) { toast(err.message, 'erro'); }
});

document.querySelector('[data-painel="desligamento"]').addEventListener('click', async (e) => {
  const copiar = e.target.closest('[data-copiar]');
  if (copiar) return dslCopiar(copiar.dataset.copiar);
  if (e.target.closest('[data-copiar-geral]')) return dslCopiar(dslLink(''));
  const qr = e.target.closest('[data-qr-dsl]');
  if (qr) return dslAbrirQr(qr.dataset.qrDsl);
  const rem = e.target.closest('[data-rem-convite]');
  if (rem) {
    const c = dsl.convites.find(x => x.id === Number(rem.dataset.remConvite));
    if (!confirm(`Excluir o convite de ${c.nome}? O link deixa de funcionar${c.status !== 'pendente' ? ' (a resposta já recebida é mantida)' : ''}.`)) return;
    await api(`/api/admin/desligamento/convites/${c.id}`, { method: 'DELETE' });
    dsl.convites = dsl.convites.filter(x => x.id !== c.id);
    return dslRenderEnviar();
  }
  if (e.target.closest('[data-exportar-dsl]')) return dslExportar();
  const ver = e.target.closest('[data-ver-resp]');
  if (ver) return dslAbrirResposta(Number(ver.dataset.verResp));
  const remR = e.target.closest('[data-rem-resp]');
  if (remR) {
    const r = dsl.respostas.find(x => x.id === Number(remR.dataset.remResp));
    if (!confirm(`Excluir a entrevista de ${r.nome}? Esta ação não pode ser desfeita.`)) return;
    await api(`/api/admin/desligamento/respostas/${r.id}`, { method: 'DELETE' });
    return carregarDesligamento();
  }
});

async function dslAbrirQr(token) {
  try {
    const q = await api(`/api/admin/desligamento/qrcode${token ? `?c=${encodeURIComponent(token)}` : ''}`);
    document.getElementById('qr-rotulo').textContent = 'QR CODE · ENTREVISTA DE DESLIGAMENTO';
    document.getElementById('qr-dica').textContent = token
      ? 'Link individual: ao ler o QR Code, o colaborador abre a entrevista já identificada.'
      : 'Link geral: ao ler o QR Code, o colaborador preenche os próprios dados e responde a entrevista.';
    document.getElementById('qr-titulo').textContent = q.titulo;
    document.getElementById('qr-img').innerHTML = q.svg;
    document.getElementById('qr-link').value = q.link;
    document.getElementById('qr-baixar').href = `/api/admin/desligamento/qrcode?formato=png${token ? `&c=${encodeURIComponent(token)}` : ''}`;
    document.getElementById('modal-qr').showModal();
  } catch (err) { toast(err.message, 'erro'); }
}

// ---------- Perguntas (formulário atual + perguntas antigas que só existem nas respostas) ----------
function dslPerguntas() {
  const lista = dsl.form.secoes.flatMap(s => s.perguntas.map(p => ({ ...p, secao: s.titulo })));
  const ids = new Set(lista.map(p => p.id));
  for (const r of dsl.respostas) {
    for (const a of r.respostas) {
      if (ids.has(a.id)) continue;
      ids.add(a.id);
      lista.push({ id: a.id, tipo: a.tipo, texto: a.pergunta, secao: `${a.secao} (fora do formulário atual)`, opcoes: [], itens: [], antiga: true });
    }
  }
  // Perguntas antigas: opções e itens vêm das próprias respostas.
  for (const p of lista.filter(x => x.antiga)) {
    const valores = dsl.respostas.flatMap(r => r.respostas.filter(a => a.id === p.id).map(a => a.valor));
    if (p.tipo === 'grade') {
      p.itens = [...new Set(valores.flatMap(v => Object.keys(v)))];
      p.opcoes = [...new Set(valores.flatMap(v => Object.values(v)))];
    } else p.opcoes = [...new Set(valores.flat())];
  }
  return lista;
}
const dslResp = (r, id) => r.respostas.find(a => a.id === id);
function dslFormatarValor(p, a) {
  if (!a) return '–';
  if (p.tipo === 'grade') return Object.entries(a.valor).map(([k, v]) => `${k}: ${v}`).join('; ');
  if (p.tipo === 'data') return dslData(a.valor);
  return Array.isArray(a.valor) ? a.valor.join('; ') : String(a.valor ?? '');
}

// ---------- Indicadores ----------
function dslFiltrar(lista) {
  const de = document.getElementById('dsl-de').value;
  const ate = document.getElementById('dsl-ate').value;
  const area = document.getElementById('dsl-f-area').value;
  const gestor = document.getElementById('dsl-f-gestor').value;
  return lista.filter(r => (!de || dslRef(r) >= de) && (!ate || dslRef(r) <= ate)
    && (!area || r.area === area) && (!gestor || r.gestor === gestor));
}

function dslPreencherSelect(id, valores, rotulo) {
  const sel = document.getElementById(id);
  const atual = sel.value;
  sel.innerHTML = `<option value="">${rotulo}</option>` + valores.map(v => `<option ${v === atual ? 'selected' : ''}>${esc(v)}</option>`).join('');
}

/** % positivo de uma pergunta (ou item de grade) com escala conhecida, entre as respostas dadas (N/A não conta). */
function dslPctPositivo(lista, p, item) {
  const escala = dslEscala(p.opcoes);
  if (!escala) return null;
  const valores = lista.map(r => dslResp(r, p.id)?.valor).map(v => (item ? v?.[item] : v)).filter(v => v && escala.includes(v));
  return valores.length ? { pct: (valores.filter(v => dslPositiva(escala, v)).length / valores.length) * 100, n: valores.length } : null;
}
function dslPctOpcao(lista, id, opcao) {
  const com = lista.filter(r => dslResp(r, id));
  return com.length ? { pct: (com.filter(r => dslResp(r, id).valor === opcao).length / com.length) * 100, n: com.length } : null;
}
const dslRotuloCurto = (t) => {
  const s = t.replace(/^qual (o )?seu grau de satisfa[cç][aã]o\s*(em rela[cç][aã]o|referente|com)?\s*(à sua|a sua|às|aos|as|ao|à|a)?\s+/i, '').replace(/\?$/, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function dslRenderIndicadores() {
  const todos = dsl.respostas;
  dslPreencherSelect('dsl-f-area', [...new Set(todos.map(r => r.area).filter(Boolean))].sort(), 'Todas as áreas');
  dslPreencherSelect('dsl-f-gestor', [...new Set(todos.map(r => r.gestor).filter(Boolean))].sort(), 'Todos os gestores');
  const filtradas = dslFiltrar(todos);
  const resp = filtradas.filter(r => !r.recusou);
  const recusas = filtradas.length - resp.length;
  const convites = dslFiltrar(dsl.convites);
  const respondidosConv = convites.filter(c => c.status !== 'pendente').length;
  const perguntas = dslPerguntas();
  const pergunta = (id) => perguntas.find(p => p.id === id);

  const voltaria = pergunta('voltaria') && dslPctOpcao(resp, 'voltaria', 'Sim');
  const satEmpresa = pergunta('sat_empresa') && dslPctPositivo(resp, pergunta('sat_empresa'));
  const tempos = resp.map(r => dslMeses(r.data_admissao, r.data_desligamento)).filter(m => m != null);
  const alertas = filtradas.filter(r => r.alerta).length;
  document.getElementById('dsl-kpis').innerHTML = [
    ['📝', fmt(resp.length), 'entrevistas respondidas', convites.length ? `${fmtPct(Math.round((respondidosConv / convites.length) * 1000) / 10)} de retorno dos ${fmt(convites.length)} convites` : 'pelo link geral e convites'],
    ['⏳', fmt(convites.filter(c => c.status === 'pendente').length), 'convites aguardando', 'reenviar pela aba Enviar'],
    ['🙅', fmt(recusas), 'não quiseram responder', filtradas.length ? `${fmtPct(Math.round((recusas / filtradas.length) * 1000) / 10)} dos retornos` : ''],
    ['🔁', voltaria ? fmtPct(Math.round(voltaria.pct)) : '–', 'voltariam a trabalhar', voltaria ? `${fmt(voltaria.n)} respostas` : ''],
    ['😊', satEmpresa ? fmtPct(Math.round(satEmpresa.pct)) : '–', 'satisfeitos com a empresa', 'Excelente ou Bom'],
    ['⏱', tempos.length ? dslTempo(Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length)) : '–', 'tempo médio de casa', tempos.length ? `${fmt(tempos.length)} com datas informadas` : 'informe admissão e desligamento'],
    ['⚠️', fmt(alertas), 'alertas', 'ex.: pediram contato com o Compliance'],
  ].map(([ic, valor, rotulo, sub]) => `
    <div class="kpi ${ic === '⚠️' && alertas ? 'kpi-alerta' : ''}"><span class="ic">${ic}</span><div><strong>${valor}</strong><span>${rotulo}</span>${sub ? `<small>${sub}</small>` : ''}</div></div>`).join('');

  const porOpcao = (id, vazio, el) => {
    const p = pergunta(id);
    const com = p ? resp.filter(r => dslResp(r, id)) : [];
    const itens = p ? [...(p.opcoes || []), ...(p.outro ? ['Outros'] : [])].map(o => {
      const n = com.filter(r => [].concat(dslResp(r, id).valor).includes(o)).length;
      return { rotulo: o, valor: com.length ? Math.round((n / com.length) * 1000) / 10 : 0, n };
    }).filter(i => i.n).sort((a, b) => b.n - a.n) : [];
    barras(el, itens.map(i => ({ ...i, dica: `<strong>${esc(i.rotulo)}</strong><br>${fmt(i.n)} de ${fmt(com.length)} entrevistas` })), vazio);
  };
  porOpcao('motivos', 'Sem respostas sobre motivos neste filtro.', 'dsl-g-motivos');
  porOpcao('mudaria', 'Sem respostas neste filtro.', 'dsl-g-mudaria');

  const fatores = [];
  for (const p of perguntas) {
    if (p.id === 'beneficios' || !dslEscala(p.opcoes)) continue;
    if (p.tipo === 'unica') {
      const r = dslPctPositivo(resp, p);
      if (r) fatores.push({ rotulo: dslRotuloCurto(p.texto), texto: p.texto, ...r });
    } else if (p.tipo === 'grade') {
      for (const item of p.itens) {
        const r = dslPctPositivo(resp, p, item);
        if (r) fatores.push({ rotulo: `${item}`, texto: `${p.texto} · ${item}`, ...r });
      }
    }
  }
  barras('dsl-g-fatores', fatores.map(f => ({ rotulo: f.rotulo, valor: Math.round(f.pct * 10) / 10,
    dica: `<strong>${esc(f.texto)}</strong><br>${fmtPct(Math.round(f.pct))} positivas · ${fmt(f.n)} respostas` })), 'Sem respostas neste filtro.');

  const ben = pergunta('beneficios');
  barras('dsl-g-beneficios', ben ? ben.itens.map(item => ({ item, r: dslPctPositivo(resp, ben, item) })).filter(x => x.r)
    .sort((a, b) => b.r.pct - a.r.pct)
    .map(({ item, r }) => ({ rotulo: item, valor: Math.round(r.pct * 10) / 10, dica: `<strong>${esc(item)}</strong><br>${fmtPct(Math.round(r.pct))} Excelente/Bom · ${fmt(r.n)} avaliaram` })) : [],
  'Sem avaliações de benefícios neste filtro.');

  dslColunasMeses(resp);

  const grupos = new Map();
  for (const r of filtradas) {
    const k = r.area || '(sem área)';
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(r);
  }
  document.getElementById('dsl-t-areas').innerHTML = `
    <tr><th>Área</th><th>Entrevistas</th><th>Recusas</th><th>Voltariam</th><th>Satisfeitos c/ empresa</th><th>Alertas</th></tr>
    ${[...grupos.entries()].sort((a, b) => b[1].length - a[1].length).map(([area, lista]) => {
      const ok = lista.filter(r => !r.recusou);
      const v = pergunta('voltaria') && dslPctOpcao(ok, 'voltaria', 'Sim');
      const s = pergunta('sat_empresa') && dslPctPositivo(ok, pergunta('sat_empresa'));
      return `<tr><td>${esc(area)}</td><td>${fmt(ok.length)}</td><td>${fmt(lista.length - ok.length)}</td>
        <td>${v ? fmtPct(Math.round(v.pct)) : '–'}</td><td>${s ? fmtPct(Math.round(s.pct)) : '–'}</td><td>${fmt(lista.filter(r => r.alerta).length)}</td></tr>`;
    }).join('') || '<tr><td colspan="6">Sem entrevistas neste filtro.</td></tr>'}`;

  dslResultadosPorPergunta(resp, perguntas);
}
['dsl-de', 'dsl-ate', 'dsl-f-area', 'dsl-f-gestor'].forEach(id => document.getElementById(id).addEventListener('change', dslRenderIndicadores));

function dslColunasMeses(resp) {
  const fim = document.getElementById('dsl-ate').value || new Date().toISOString().slice(0, 10);
  const [a, m] = fim.split('-').map(Number);
  const meses = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - (11 - i), 1));
    return { chave: d.toISOString().slice(0, 7), rotulo: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).replace('. de ', '/').replace(' de ', '/'), n: 0 };
  });
  for (const r of resp) {
    const mes = meses.find(x => x.chave === dslRef(r).slice(0, 7));
    if (mes) mes.n += 1;
  }
  const max = Math.max(1, ...meses.map(x => x.n));
  const passo = max <= 5 ? 1 : Math.ceil(max / 4);
  const topo = Math.ceil(max / passo) * passo;
  document.getElementById('dsl-g-meses').innerHTML = `
    <div class="colunas-area">
      <div class="colunas-grade">${Array.from({ length: topo / passo + 1 }, (_, k) => `<span style="bottom:${(k * passo / topo) * 100}%"><em>${fmt(k * passo)}</em></span>`).join('')}</div>
      ${meses.map(x => `
        <div class="coluna" tabindex="0" data-dica="${esc(x.rotulo)}<br><strong>${fmt(x.n)}</strong> entrevista(s)">
          <i style="height:${(x.n / topo) * 100}%">${x.n ? `<b>${fmt(x.n)}</b>` : ''}</i>
        </div>`).join('')}
    </div>
    <div class="colunas-rotulos">${meses.map((x, i) => `<span>${i % 2 === 1 ? esc(x.rotulo) : ''}</span>`).join('')}</div>`;
}

/** Barra empilhada da escala (melhor → pior, em tons de azul para positivo e laranja para negativo). */
function dslPilha(valores, opcoes) {
  const total = valores.length;
  if (!total) return '<span class="q-dica">sem respostas</span>';
  return `<span class="pilha">${opcoes.map((o, k) => {
    const n = valores.filter(v => v === o).length;
    return n ? `<i class="c${dslNA(o) ? 'na' : k}" style="width:${(n / total) * 100}%" data-dica="<strong>${esc(o)}</strong><br>${n} (${num((n / total) * 100, 0)}%)">${n / total >= 0.08 ? `${num((n / total) * 100, 0)}%` : ''}</i>` : '';
  }).join('')}</span>`;
}
const dslLegenda = (opcoes) => `<div class="pilha-legenda">${opcoes.map((o, k) => `<span><i class="c${dslNA(o) ? 'na' : k}"></i>${esc(o)}</span>`).join('')}</div>`;

function dslResultadosPorPergunta(resp, perguntas) {
  document.getElementById('dsl-res-resumo').textContent = resp.length ? `· ${resp.length} entrevista(s) no filtro` : '';
  let secaoAtual = '';
  document.getElementById('dsl-resultados').innerHTML = resp.length ? perguntas.map(p => {
    const respostas = resp.map(r => ({ r, a: dslResp(r, p.id) })).filter(x => x.a);
    const cab = p.secao !== secaoAtual ? `<h4 class="res-secao">${esc((secaoAtual = p.secao))}</h4>` : '';
    let corpo;
    const escala = dslEscala(p.opcoes);
    if (!respostas.length) corpo = '<p class="q-dica">Sem respostas.</p>';
    else if (p.tipo === 'grade') {
      const ordem = escala ? [...escala, ...p.opcoes.filter(dslNA)] : p.opcoes;
      corpo = `${dslLegenda(ordem)}<div class="grade-res">${p.itens.map(item => `
        <div class="res-barra"><span>${esc(item)}</span>${dslPilha(respostas.map(x => x.a.valor[item]).filter(Boolean), ordem)}</div>`).join('')}</div>`;
    } else if (p.tipo === 'unica' && escala) {
      corpo = `${dslLegenda(p.opcoes)}<div class="res-barra"><span>${fmt(respostas.length)} respostas</span>${dslPilha(respostas.map(x => x.a.valor), p.opcoes)}</div>`;
    } else if (p.tipo === 'unica' || p.tipo === 'multipla') {
      const opcoes = [...(p.opcoes || []), ...(p.outro ? ['Outros'] : [])];
      corpo = opcoes.map(o => {
        const n = respostas.filter(x => [].concat(x.a.valor).includes(o)).length;
        const pct = (n / respostas.length) * 100;
        return `<div class="res-barra"><span>${esc(o)}</span><span class="barra-prog"><i style="width:${pct}%"></i></span><b>${n} (${num(pct, 0)}%)</b></div>`;
      }).join('');
    } else {
      corpo = `<div class="res-textos">${respostas.map(({ r, a }) => `<p>${p.tipo === 'data' ? dslData(a.valor) : `“${esc(a.valor)}”`}<small>${esc(r.nome)}${r.area ? ' · ' + esc(r.area) : ''}</small></p>`).join('')}</div>`;
    }
    const extras = respostas.filter(x => x.a.outro || x.a.justificativa);
    const detalhes = extras.length ? `<details class="res-extras"><summary>Ver ${extras.length} justificativa(s) / “Outros”</summary><div class="res-textos">${extras.map(({ r, a }) => `
      <p>${a.outro ? `<b>Outros:</b> ${esc(a.outro)}${a.justificativa ? '<br>' : ''}` : ''}${a.justificativa ? `“${esc(a.justificativa)}”` : ''}
        <small>${esc(r.nome)} · ${esc(dslFormatarValor(p, a))}</small></p>`).join('')}</div></details>` : '';
    return `${cab}<div class="res-pergunta"><p class="res-titulo">${esc(p.texto)} <small>· ${DSL_TIPOS[p.tipo] || ''} · ${respostas.length} resposta(s)</small></p>${corpo}${detalhes}</div>`;
  }).join('') : '<p class="q-dica">Quando as entrevistas forem respondidas, os resultados aparecem aqui.</p>';
}

// ---------- Respostas ----------
function dslRenderRespostas() {
  const busca = dslNorm(document.getElementById('dsl-busca-respostas').value);
  const lista = dsl.respostas.filter(r => !busca || dslNorm([r.nome, r.area, r.cargo, r.gestor, r.matricula].join(' ')).includes(busca));
  document.getElementById('dsl-qtd-respostas').textContent = `· ${dsl.respostas.filter(r => !r.recusou).length} respondida(s) · ${dsl.respostas.filter(r => r.recusou).length} recusa(s)`;
  document.getElementById('dsl-respostas').innerHTML = `
    <tr><th>Recebida em</th><th>Colaborador</th><th>Área</th><th>Gestor</th><th>Desligamento</th><th>Situação</th><th></th></tr>
    ${lista.map(r => `<tr>
      <td>${dslDataHora(r.criado_em)}<small class="sub">${r.convite_id ? 'Convite individual' : 'Link geral'}</small></td>
      <td><strong>${esc(r.nome)}</strong><small class="sub">${esc([r.cargo, r.matricula && 'Mat. ' + r.matricula].filter(Boolean).join(' · '))}</small></td>
      <td>${esc(r.area || '–')}</td><td>${esc(r.gestor || '–')}</td><td>${dslData(r.data_desligamento)}</td>
      <td>${r.recusou ? '<span class="selo-st st-recusa">Recusou</span>' : '<span class="selo-st st-ok">Respondida</span>'}${r.alerta ? ' <span class="selo-st st-alerta" title="Há uma resposta marcada como alerta">⚠️ Alerta</span>' : ''}</td>
      <td class="acoes-envio">${r.recusou ? '' : `<button type="button" class="btn btn-claro btn-sm" data-ver-resp="${r.id}">Ver</button>`}
        <button type="button" class="q-rem" data-rem-resp="${r.id}" title="Excluir">🗑</button></td>
    </tr>`).join('') || `<tr><td colspan="7">${dsl.respostas.length ? 'Nada encontrado.' : 'Nenhuma entrevista recebida ainda.'}</td></tr>`}`;
}
document.getElementById('dsl-busca-respostas').addEventListener('input', dslRenderRespostas);

function dslHtmlResposta(r) {
  const perguntas = dslPerguntas();
  const ident = [['Nome', r.nome], ['Matrícula', r.matricula], ['Cargo', r.cargo], ['Área / Diretoria', r.area], ['Gestor imediato', r.gestor],
    ['Data de admissão', dslData(r.data_admissao)], ['Data de desligamento', dslData(r.data_desligamento)],
    ['Tempo de casa', dslTempo(dslMeses(r.data_admissao, r.data_desligamento))], ['Responsável RH', r.responsavel_rh], ['Recebida em', dslDataHora(r.criado_em)]];
  let secao = '';
  return `
    <div class="det-ident">${ident.map(([k, v]) => `<div><small>${k}</small><span>${esc(v || '–')}</span></div>`).join('')}</div>
    ${perguntas.map(p => {
      const a = dslResp(r, p.id);
      const cab = p.secao !== secao ? `<h4 class="res-secao">${esc((secao = p.secao))}</h4>` : '';
      const alerta = a && p.alerta && [].concat(a.valor).includes(p.alerta);
      const valor = p.tipo === 'grade' && a
        ? `<ul>${Object.entries(a.valor).map(([k, v]) => `<li>${esc(k)}: <strong>${esc(v)}</strong></li>`).join('')}</ul>`
        : `<strong>${esc(dslFormatarValor(p, a))}</strong>`;
      return `${cab}<div class="det-perg ${alerta ? 'det-alerta' : ''}"><p>${esc(p.texto)}</p>${valor}
        ${a?.outro ? `<p class="det-extra"><b>Outros:</b> ${esc(a.outro)}</p>` : ''}
        ${a?.justificativa ? `<p class="det-extra"><b>Justificativa:</b> ${esc(a.justificativa)}</p>` : ''}</div>`;
    }).join('')}`;
}

let dslRespostaAberta = null;
function dslAbrirResposta(id) {
  dslRespostaAberta = dsl.respostas.find(r => r.id === id);
  document.getElementById('dsl-modal-titulo').textContent = dslRespostaAberta.nome;
  document.getElementById('dsl-modal-corpo').innerHTML = dslHtmlResposta(dslRespostaAberta);
  document.getElementById('modal-dsl').showModal();
}
document.getElementById('dsl-imprimir').addEventListener('click', () => {
  const r = dslRespostaAberta;
  const w = window.open('', '_blank');
  if (!w) return toast('Permita pop-ups para imprimir.', 'erro');
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Entrevista de desligamento · ${esc(r.nome)}</title>
    <style>
      body { font-family: 'Nunito Sans', Arial, sans-serif; color: #1d2b36; margin: 24px; font-size: 12px; }
      header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #ec6b24; padding-bottom: 8px; margin-bottom: 14px; }
      header b { font-size: 22px; color: #0e3b5c; } header small { color: #ec6b24; font-weight: 700; letter-spacing: .12em; }
      h1 { font-size: 16px; color: #0e3b5c; margin: 0; } h4 { color: #ec6b24; text-transform: uppercase; letter-spacing: .06em; margin: 16px 0 4px; font-size: 11px; }
      .det-ident { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 14px; padding: 10px; background: #f4f6f8; border-radius: 6px; }
      .det-ident small { display: block; color: #5f6f7c; font-size: 10px; } .det-perg { padding: 6px 0; border-bottom: 1px solid #eaeef2; break-inside: avoid; }
      .det-perg p { margin: 0 0 2px; } .det-extra { color: #5f6f7c; } .det-alerta strong { color: #d93a2b; } ul { margin: 2px 0; padding-left: 18px; }
      .res-secao { margin-top: 14px; } footer { margin-top: 20px; color: #5f6f7c; font-size: 10px; }
    </style></head><body>
    <header><div><b>Âmbar</b><br><small>ENERGIA</small></div><div style="text-align:right"><h1>${esc(dsl.form.titulo)}</h1><span>Confidencial · uso exclusivo do RH</span></div></header>
    ${dslHtmlResposta(r)}
    <footer>Registro eletrônico recebido em ${dslDataHora(r.criado_em)} · ${r.convite_id ? 'convite individual' : 'link geral'}.</footer>
    <script>window.onload = () => window.print();<\/script></body></html>`);
  w.document.close();
});

// ---------- Exportação em Excel ----------
function dslExportar() {
  if (typeof XLSX === 'undefined') return toast('Não foi possível carregar o gerador de Excel.', 'erro');
  const perguntas = dslPerguntas();
  const dataCel = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`) : '');
  const curto = (t) => (t.length > 60 ? `${t.slice(0, 57)}…` : t);

  // Aba 1: uma linha por entrevista, uma coluna por pergunta (múltipla seleção também ganha uma coluna 0/1 por opção).
  const cab = ['ID', 'Recebida em', 'Situação', 'Origem', 'Nome', 'Matrícula', 'Cargo', 'Área / Diretoria', 'Gestor imediato',
    'Data de admissão', 'Data de desligamento', 'Mês do desligamento', 'Tempo de casa (meses)', 'Responsável RH', 'Alerta'];
  const colunas = [];
  const col = (titulo, p, f) => colunas.push({ titulo, p, f });
  for (const p of perguntas) {
    const t = curto(p.texto);
    if (p.tipo === 'grade') { for (const item of p.itens) col(`${t} [${item}]`, p, (a) => a?.valor[item] ?? ''); }
    else if (p.tipo === 'multipla') {
      col(t, p, (a) => (a ? a.valor.join('; ') : ''));
      for (const o of [...p.opcoes, ...(p.outro ? ['Outros'] : [])]) col(`${t} [${o}]`, p, (a, r) => (r.recusou ? '' : a?.valor.includes(o) ? 1 : 0));
    } else if (p.tipo === 'data') col(t, p, (a) => dataCel(a?.valor));
    else col(t, p, (a) => a?.valor ?? '');
    if (p.outro) col(`${t} – Outros (especifique)`, p, (a) => a?.outro ?? '');
    if (p.justificativa) col(`${t} – Justificativa`, p, (a) => a?.justificativa ?? '');
  }
  const linhas = dsl.respostas.map(r => [
    r.id, new Date(r.criado_em.replace(' ', 'T') + 'Z'), r.recusou ? 'Recusou' : 'Respondida', r.convite_id ? 'Convite individual' : 'Link geral',
    r.nome, r.matricula, r.cargo, r.area, r.gestor, dataCel(r.data_admissao), dataCel(r.data_desligamento), dslRef(r).slice(0, 7),
    dslMeses(r.data_admissao, r.data_desligamento) ?? '', r.responsavel_rh, r.alerta ? 'Sim' : 'Não',
    ...colunas.map(c => c.f(dslResp(r, c.p.id), r)),
  ]);

  // Aba 2: base "longa" para tabela dinâmica / Power BI (uma linha por resposta de pergunta ou item).
  const base = [['ID', 'Data de desligamento', 'Mês', 'Área / Diretoria', 'Cargo', 'Gestor imediato', 'Seção', 'Código da pergunta', 'Pergunta', 'Item', 'Resposta', 'Positiva (1/0)', 'Pontuação (maior = melhor)']];
  for (const r of dsl.respostas.filter(x => !x.recusou)) {
    for (const p of perguntas) {
      const a = dslResp(r, p.id);
      if (!a) continue;
      const escala = dslEscala(p.opcoes);
      const linha = (item, v) => {
        const k = escala ? escala.indexOf(v) : -1;
        base.push([r.id, dataCel(r.data_desligamento), dslRef(r).slice(0, 7), r.area, r.cargo, r.gestor, p.secao, p.id, p.texto, item, v,
          k > -1 ? (k < escala.length / 2 ? 1 : 0) : '', k > -1 ? escala.length - k : '']);
      };
      if (p.tipo === 'grade') Object.entries(a.valor).forEach(([item, v]) => linha(item, v));
      else if (p.tipo === 'multipla') a.valor.forEach(v => linha('', v === 'Outros' && a.outro ? `Outros: ${a.outro}` : v));
      else if (p.tipo === 'data') linha('', dslData(a.valor));
      else if (a.valor !== '') linha('', a.valor === 'Outros' && a.outro ? `Outros: ${a.outro}` : a.valor);
    }
  }

  // Aba 3: resumo de contagens por opção.
  const resp = dsl.respostas.filter(r => !r.recusou);
  const resumo = [['Seção', 'Pergunta', 'Item', 'Opção', 'Quantidade', '% das respostas']];
  for (const p of perguntas.filter(x => ['unica', 'multipla', 'grade'].includes(x.tipo))) {
    const opcoes = [...p.opcoes, ...(p.outro ? ['Outros'] : [])];
    const itens = p.tipo === 'grade' ? p.itens : [''];
    for (const item of itens) {
      const valores = resp.map(r => dslResp(r, p.id)?.valor).filter(Boolean).map(v => (item ? v[item] : v)).filter(v => v != null && v !== '');
      for (const o of opcoes) {
        const n = valores.filter(v => [].concat(v).includes(o)).length;
        resumo.push([p.secao, p.texto, item, o, n, valores.length ? Math.round((n / valores.length) * 1000) / 1000 : 0]);
      }
    }
  }

  const convites = [['Nome', 'Matrícula', 'Cargo', 'Área / Diretoria', 'Gestor imediato', 'Data de admissão', 'Data de desligamento', 'WhatsApp', 'E-mail', 'Responsável RH', 'Criado em', 'Situação', 'Respondido em', 'Link']]
    .concat(dsl.convites.map(c => [c.nome, c.matricula, c.cargo, c.area, c.gestor, dataCel(c.data_admissao), dataCel(c.data_desligamento), c.telefone, c.email,
      c.responsavel_rh, new Date(c.criado_em.replace(' ', 'T') + 'Z'), DSL_STATUS[c.status][0], c.respondido_em ? new Date(c.respondido_em.replace(' ', 'T') + 'Z') : '', dslLink(c.token)]));

  const aba = (aoa, larguras) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true, dateNF: 'dd/mm/yyyy' });
    ws['!cols'] = aoa[0].map((_, i) => ({ wch: larguras?.[i] ?? 18 }));
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: aoa[0].length - 1, r: Math.max(aoa.length - 1, 0) } }) };
    return ws;
  };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, aba([[...cab, ...colunas.map(c => c.titulo)], ...linhas]), 'Respostas');
  XLSX.utils.book_append_sheet(wb, aba(base, [6, 14, 9, 22, 22, 22, 24, 18, 50, 24, 28, 12, 14]), 'Base_indicadores');
  const wsResumo = aba(resumo, [24, 60, 24, 28, 12, 14]);
  for (let i = 1; i < resumo.length; i++) { const cel = wsResumo[XLSX.utils.encode_cell({ r: i, c: 5 })]; if (cel) cel.z = '0.0%'; }
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');
  XLSX.utils.book_append_sheet(wb, aba(convites), 'Convites');
  XLSX.writeFile(wb, `entrevistas-desligamento-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ---------- Editor do formulário ----------
const dslLinhas = (lista) => (lista || []).join('\n');
const dslSepara = (txt) => String(txt || '').split('\n').map(s => s.trim()).filter(Boolean);

function dslCarregarEditor(form) {
  dsl.secoes = structuredClone(form.secoes).map(sec => ({
    titulo: sec.titulo,
    perguntas: sec.perguntas.map(p => ({ ...p, opcoes: dslLinhas(p.opcoes), itens: dslLinhas(p.itens), alerta: p.alerta || '' })),
  }));
  document.getElementById('dsl-titulo').value = form.titulo || '';
  document.getElementById('dsl-introducao').value = form.introducao || '';
  document.getElementById('dsl-assunto').value = form.assunto || '';
  document.getElementById('dsl-mensagem').value = form.mensagem || '';
  document.getElementById('dsl-ativa').checked = form.ativa !== false;
}

function dslRenderEditor() {
  document.getElementById('dsl-secoes').innerHTML = dsl.secoes.map((sec, i) => `
    <div class="q-edit" data-dsl-sec="${i}">
      <div class="q-cab">Seção ${i + 1}
        <span>
          <button type="button" class="q-rem" data-acao="sec-sobe" title="Subir seção">↑</button>
          <button type="button" class="q-rem" data-acao="sec-desce" title="Descer seção">↓</button>
          <button type="button" class="q-rem" data-acao="sec-rem" title="Remover seção">🗑</button>
        </span>
      </div>
      <input class="campo" data-campo="titulo" value="${esc(sec.titulo)}" placeholder="Título da seção (ex.: Satisfação)">
      <div class="perguntas-edit">
        ${sec.perguntas.map((p, j) => {
          const comOpcoes = ['unica', 'multipla', 'grade'].includes(p.tipo);
          const escolha = p.tipo === 'unica' || p.tipo === 'multipla';
          const opcoesAlerta = [...dslSepara(p.opcoes), ...(p.outro ? ['Outros'] : [])];
          return `
          <div class="pergunta-edit dsl-perg" data-perg="${j}">
            <select class="campo" data-campo="tipo" aria-label="Tipo da pergunta">
              ${Object.entries(DSL_TIPOS).map(([v, r]) => `<option value="${v}" ${p.tipo === v ? 'selected' : ''}>${r}</option>`).join('')}
            </select>
            <input class="campo" data-campo="texto" value="${esc(p.texto)}" placeholder="Texto da pergunta">
            <span class="acoes-perg">
              <button type="button" class="q-rem" data-acao="perg-sobe" title="Subir">↑</button>
              <button type="button" class="q-rem" data-acao="perg-desce" title="Descer">↓</button>
              <button type="button" class="q-rem" data-acao="perg-rem" title="Remover pergunta">✕</button>
            </span>
            ${p.tipo === 'grade' ? `<label class="extra">Itens avaliados <small>(um por linha)</small>
              <textarea class="campo" data-campo="itens" rows="${Math.min(8, Math.max(3, dslSepara(p.itens).length))}">${esc(p.itens)}</textarea></label>` : ''}
            ${comOpcoes ? `<label class="extra">${p.tipo === 'grade' ? 'Escala de resposta' : 'Opções'} <small>(uma por linha)</small>
              <textarea class="campo" data-campo="opcoes" rows="${Math.min(8, Math.max(3, dslSepara(p.opcoes).length))}">${esc(p.opcoes)}</textarea>
              <span class="presets">Usar:
                <button type="button" data-preset="sat">Excelente…Ruim</button><button type="button" data-preset="freq">Sempre…Nunca</button>
                <button type="button" data-preset="simnao">Sim/Não</button>${p.tipo === 'grade' ? '<button type="button" data-preset="sat_na">N/A + Excelente…Ruim</button>' : ''}
              </span></label>` : ''}
            <div class="extra dsl-flags">
              <label class="check"><input type="checkbox" data-campo="obrigatoria" ${p.obrigatoria ? 'checked' : ''}> Obrigatória</label>
              <label class="check"><input type="checkbox" data-campo="justificativa" ${p.justificativa ? 'checked' : ''}> Pedir justificativa</label>
              ${escolha ? `<label class="check"><input type="checkbox" data-campo="outro" ${p.outro ? 'checked' : ''}> Opção “Outros” com texto</label>
              <label class="check">⚠️ Alerta quando responder
                <select class="campo" data-campo="alerta"><option value="">(sem alerta)</option>
                  ${opcoesAlerta.map(o => `<option ${o === p.alerta ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
      <div><button type="button" class="btn btn-claro btn-sm" data-acao="perg-add">+ pergunta</button></div>
    </div>`).join('');
}

const dslEditor = document.getElementById('dsl-secoes');
const dslAlvo = (el) => {
  const sec = el.closest('[data-dsl-sec]');
  if (!sec) return {};
  const s = dsl.secoes[Number(sec.dataset.dslSec)];
  const perg = el.closest('[data-perg]');
  return { i: Number(sec.dataset.dslSec), s, j: perg ? Number(perg.dataset.perg) : null, p: perg ? s.perguntas[Number(perg.dataset.perg)] : null };
};
dslEditor.addEventListener('input', (e) => {
  const { s, p } = dslAlvo(e.target);
  const campo = e.target.dataset.campo;
  if (!s || !campo || e.target.type === 'checkbox') return;
  (p || s)[campo] = e.target.value;
});
dslEditor.addEventListener('change', (e) => {
  const { p } = dslAlvo(e.target);
  const campo = e.target.dataset.campo;
  if (!p || !campo) return;
  p[campo] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  if (['tipo', 'outro', 'opcoes'].includes(campo)) {
    if (campo === 'tipo' && ['unica', 'multipla', 'grade'].includes(p.tipo) && !dslSepara(p.opcoes).length) p.opcoes = dslLinhas(DSL_PRESETS.sat);
    if (!dslSepara(p.opcoes).concat(p.outro ? ['Outros'] : []).includes(p.alerta)) p.alerta = '';
    dslRenderEditor();
  }
});
dslEditor.addEventListener('click', (e) => {
  const preset = e.target.closest('[data-preset]');
  const acao = e.target.closest('[data-acao]')?.dataset.acao;
  if (!preset && !acao) return;
  const { i, s, j, p } = dslAlvo(e.target);
  const troca = (lista, a, b) => { if (b >= 0 && b < lista.length) [lista[a], lista[b]] = [lista[b], lista[a]]; };
  if (preset) { p.opcoes = dslLinhas(DSL_PRESETS[preset.dataset.preset]); p.alerta = ''; }
  else if (acao === 'sec-sobe') troca(dsl.secoes, i, i - 1);
  else if (acao === 'sec-desce') troca(dsl.secoes, i, i + 1);
  else if (acao === 'sec-rem') {
    if (dsl.secoes.length === 1) return toast('O formulário precisa de ao menos uma seção.', 'erro');
    if (!confirm(`Remover a seção "${s.titulo || i + 1}" e suas perguntas?`)) return;
    dsl.secoes.splice(i, 1);
  } else if (acao === 'perg-sobe') troca(s.perguntas, j, j - 1);
  else if (acao === 'perg-desce') troca(s.perguntas, j, j + 1);
  else if (acao === 'perg-rem') s.perguntas.splice(j, 1);
  else if (acao === 'perg-add') s.perguntas.push(dslNovaPergunta());
  dslRenderEditor();
});
const dslNovaPergunta = () => ({ id: `p_${Math.random().toString(36).slice(2, 10)}`, tipo: 'unica', texto: '', opcoes: dslLinhas(DSL_PRESETS.sat), itens: '', obrigatoria: true, justificativa: false, outro: false, alerta: '' });

document.getElementById('dsl-add-secao').addEventListener('click', () => {
  dsl.secoes.push({ titulo: '', perguntas: [dslNovaPergunta()] });
  dslRenderEditor();
  dslEditor.lastElementChild.querySelector('input').focus();
});
document.getElementById('dsl-restaurar').addEventListener('click', async () => {
  if (!confirm('Carregar o modelo original (PRESI-RH-0002)? As alterações só valem depois de clicar em Salvar.')) return;
  dslCarregarEditor(await api('/api/admin/desligamento/padrao'));
  dslRenderEditor();
  toast('Modelo original carregado. Clique em Salvar formulário para aplicar.');
});
document.getElementById('dsl-form-editor').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    dsl.form = await api('/api/admin/desligamento', { method: 'PUT', body: {
      ativa: document.getElementById('dsl-ativa').checked,
      titulo: document.getElementById('dsl-titulo').value,
      introducao: document.getElementById('dsl-introducao').value,
      assunto: document.getElementById('dsl-assunto').value,
      mensagem: document.getElementById('dsl-mensagem').value,
      secoes: dsl.secoes.map(sec => ({
        titulo: sec.titulo,
        perguntas: sec.perguntas.map(p => ({ ...p, opcoes: dslSepara(p.opcoes), itens: dslSepara(p.itens) })),
      })),
    } });
    dslCarregarEditor(dsl.form);
    dslRenderEditor();
    toast('Formulário salvo ✅');
  } catch (err) { toast(err.message, 'erro'); }
});
