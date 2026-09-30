// Área do RH: base de colaboradores, módulos/aulas/provas e resultados.
const adm = { colaboradores: [], modulos: [], resultados: null, linhasImportar: [] };

// ---------- Sessão ----------
async function iniciar() {
  try {
    await api('/api/admin/sessao');
    mostrarPainel();
  } catch { /* fica na tela de login */ }
}

function mostrarPainel() {
  document.getElementById('tela-login').hidden = true;
  document.getElementById('lateral').hidden = false;
  document.getElementById('principal').hidden = false;
  trocarAba(location.hash.slice(1) || 'colaboradores');
}

document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/admin/entrar', { method: 'POST', body: { senha: document.getElementById('senha').value } });
    mostrarPainel();
  } catch (err) { toast(err.message, 'erro'); }
});

document.getElementById('sair').addEventListener('click', async () => {
  await api('/api/admin/sair', { method: 'POST' });
  location.reload();
});

function trocarAba(aba) {
  if (!['colaboradores', 'modulos', 'resultados'].includes(aba)) aba = 'colaboradores';
  history.replaceState(null, '', `#${aba}`);
  document.querySelectorAll('[data-aba]').forEach(b => b.classList.toggle('ativo', b.dataset.aba === aba));
  document.querySelectorAll('[data-painel]').forEach(s => { s.hidden = s.dataset.painel !== aba; });
  document.getElementById('lateral').classList.remove('aberta');
  ({ colaboradores: carregarColaboradores, modulos: carregarModulos, resultados: carregarResultados })[aba]();
}
document.querySelectorAll('[data-aba]').forEach(b => b.addEventListener('click', () => trocarAba(b.dataset.aba)));
document.getElementById('btn-menu').addEventListener('click', () => document.getElementById('lateral').classList.toggle('aberta'));
document.addEventListener('click', (e) => { if (e.target.closest('[data-fechar]')) e.target.closest('dialog').close(); });

// ---------- Colaboradores ----------
const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Lê .xlsx/.xls/.csv no navegador e devolve linhas {cpf, nome, cargo, filial, regional}. */
async function lerPlanilha(arquivo) {
  const buffer = await arquivo.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', raw: false, codepage: 65001 });
  const aba = wb.Sheets[wb.SheetNames[0]];
  const matriz = XLSX.utils.sheet_to_json(aba, { header: 1, defval: '', raw: false });
  if (!matriz.length) return [];

  const campos = ['cpf', 'nome', 'cargo', 'filial', 'regional'];
  const cab = matriz[0].map(semAcento);
  const temCabecalho = cab.some(c => campos.includes(c));
  // Com cabeçalho, localiza cada coluna pelo nome; sem cabeçalho, usa a ordem CPF, NOME, CARGO, FILIAL, REGIONAL.
  const indice = Object.fromEntries(campos.map((c, i) => [c, temCabecalho ? cab.indexOf(c) : i]));
  return matriz.slice(temCabecalho ? 1 : 0)
    .filter(l => l.some(v => String(v).trim()))
    .map(l => Object.fromEntries(campos.map(c => [c, indice[c] >= 0 ? String(l[indice[c]] ?? '').trim() : ''])));
}

document.getElementById('arquivo-colab').addEventListener('change', async (e) => {
  const arq = e.target.files[0];
  const previa = document.getElementById('previa');
  const btn = document.getElementById('btn-importar');
  adm.linhasImportar = [];
  btn.disabled = true;
  previa.innerHTML = '';
  if (!arq) return;
  try {
    adm.linhasImportar = await lerPlanilha(arq);
  } catch (err) {
    previa.innerHTML = `<p class="aviso">Não foi possível ler o arquivo: ${esc(err.message)}</p>`;
    return;
  }
  const semCpf = adm.linhasImportar.filter(l => !l.cpf.replace(/\D/g, '')).length;
  previa.innerHTML = `
    <p><strong>${adm.linhasImportar.length}</strong> linhas encontradas${semCpf ? ` · <span class="aviso">${semCpf} sem CPF</span>` : ''}. Prévia:</p>
    <div class="tabela-wrap"><table class="tabela">
      <tr><th>CPF</th><th>Nome</th><th>Cargo</th><th>Filial</th><th>Regional</th></tr>
      ${adm.linhasImportar.slice(0, 5).map(l => `<tr><td>${esc(l.cpf)}</td><td>${esc(l.nome)}</td><td>${esc(l.cargo)}</td><td>${esc(l.filial)}</td><td>${esc(l.regional)}</td></tr>`).join('')}
    </table></div>`;
  btn.disabled = !adm.linhasImportar.length;
});

document.getElementById('btn-importar').addEventListener('click', async () => {
  const modo = document.querySelector('input[name="modo"]:checked').value;
  if (modo === 'substituir' && !confirm('Substituir a base? Colaboradores que não estiverem na planilha perderão o acesso (o histórico é mantido).')) return;
  const btn = document.getElementById('btn-importar');
  btn.disabled = true;
  try {
    const r = await api('/api/admin/colaboradores/importar', { method: 'POST', body: { linhas: adm.linhasImportar, modo } });
    document.getElementById('previa').innerHTML = `
      <p>✅ <strong>${r.importados}</strong> colaboradores importados · ${r.ativos} com acesso ativo.</p>
      ${r.invalidas.length ? `<p class="aviso">${r.invalidas.length} linha(s) ignorada(s): ${r.invalidas.slice(0, 10).map(i => `linha ${i.linha} (${esc(i.motivo)})`).join(', ')}${r.invalidas.length > 10 ? '…' : ''}</p>` : ''}`;
    document.getElementById('arquivo-colab').value = '';
    adm.linhasImportar = [];
    carregarColaboradores();
  } catch (err) {
    toast(err.message, 'erro');
    btn.disabled = false;
  }
});

async function carregarColaboradores() {
  adm.colaboradores = await api('/api/admin/colaboradores');
  renderColaboradores();
}

function renderColaboradores() {
  const termo = semAcento(document.getElementById('busca-colab').value);
  const lista = adm.colaboradores.filter(c => !termo || semAcento([c.cpf, c.nome, c.cargo, c.filial, c.regional].join(' ')).includes(termo.replace(/[.-]/g, '')));
  const ativos = adm.colaboradores.filter(c => c.ativo).length;
  document.getElementById('qtd-colab').textContent = `· ${ativos} ativos de ${adm.colaboradores.length}`;
  document.getElementById('tabela-colab').innerHTML = `
    <tr><th>CPF</th><th>Nome</th><th>Cargo</th><th>Filial</th><th>Regional</th><th>Acesso</th></tr>
    ${lista.slice(0, 500).map(c => `
      <tr class="${c.ativo ? '' : 'inativo'}">
        <td>${formatarCpf(c.cpf)}</td><td>${esc(c.nome)}</td><td>${esc(c.cargo)}</td><td>${esc(c.filial)}</td><td>${esc(c.regional)}</td>
        <td><button class="btn btn-sm ${c.ativo ? 'btn-claro' : 'btn-laranja'}" data-acesso="${c.cpf}" data-ativo="${c.ativo ? 0 : 1}">${c.ativo ? 'Bloquear' : 'Liberar'}</button></td>
      </tr>`).join('') || '<tr><td colspan="6">Nenhum colaborador. Importe a planilha acima.</td></tr>'}`;
}
document.getElementById('busca-colab').addEventListener('input', renderColaboradores);
document.getElementById('tabela-colab').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-acesso]');
  if (!b) return;
  await api(`/api/admin/colaboradores/${b.dataset.acesso}`, { method: 'PATCH', body: { ativo: b.dataset.ativo === '1' } });
  carregarColaboradores();
});

// ---------- Módulos, aulas e provas ----------
async function carregarModulos() {
  adm.modulos = await api('/api/admin/modulos');
  const lista = document.getElementById('lista-admin-modulos');
  lista.innerHTML = adm.modulos.map(m => `
    <article class="cartao adm-modulo" data-id="${m.id}">
      <header>
        <span class="ic">${esc(m.icone)}</span>
        <h3>${esc(m.titulo)} <small>${m.descricao ? '· ' + esc(m.descricao) : ''}</small></h3>
        <button class="btn btn-claro btn-sm" data-acao="subir" title="Mover para cima">↑</button>
        <button class="btn btn-claro btn-sm" data-acao="descer" title="Mover para baixo">↓</button>
        <button class="btn btn-claro btn-sm" data-acao="editar">Editar</button>
        <button class="btn btn-perigo btn-sm" data-acao="excluir">Excluir</button>
      </header>
      <div class="adm-aulas">
        ${m.aulas.map((a, i) => `
          <div class="adm-aula">📄 <span>${i + 1}. ${esc(a.titulo)}</span>
            <a href="/api/aulas/${a.id}/pdf" target="_blank" rel="noopener">ver PDF</a>
            <button class="btn btn-perigo btn-sm" data-excluir-aula="${a.id}">Remover</button>
          </div>`).join('') || '<p class="q-dica">Nenhum material ainda.</p>'}
      </div>
      <form class="form-aula">
        <input class="campo" name="titulo" placeholder="Título do material (opcional — usa o nome do arquivo)">
        <input class="campo" type="file" name="pdf" accept="application/pdf,.pdf" required>
        <button class="btn btn-laranja btn-sm" type="submit">⬆ Enviar PDF</button>
      </form>
      <div class="adm-prova">
        <span>📝 ${m.prova ? `<strong>${esc(m.prova.titulo)}</strong> · ${m.prova.questoes.length} questões · nota mínima ${m.prova.nota_minima}%` : 'Sem avaliação cadastrada'}</span>
        <button class="btn ${m.prova ? 'btn-claro' : 'btn-marinho'} btn-sm" data-acao="prova">${m.prova ? 'Editar avaliação e gabarito' : 'Criar avaliação'}</button>
      </div>
    </article>`).join('') || '<p class="carregando">Nenhum tema ainda. Crie o primeiro acima.</p>';
}

document.getElementById('form-modulo').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('/api/admin/modulos', { method: 'POST', body: { titulo: f.titulo.value, descricao: f.descricao.value, icone: f.icone.value } });
    f.reset();
    toast('Tema criado');
    carregarModulos();
  } catch (err) { toast(err.message, 'erro'); }
});

const listaModulos = document.getElementById('lista-admin-modulos');
listaModulos.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const id = form.closest('[data-id]').dataset.id;
  const btn = form.querySelector('button');
  btn.disabled = true;
  btn.textContent = 'Enviando…';
  try {
    await api(`/api/admin/modulos/${id}/aulas`, { method: 'POST', body: new FormData(form) });
    toast('Material publicado');
    carregarModulos();
  } catch (err) {
    toast(err.message, 'erro');
    btn.disabled = false;
    btn.textContent = '⬆ Enviar PDF';
  }
});

listaModulos.addEventListener('click', async (e) => {
  const alvo = e.target.closest('[data-acao],[data-excluir-aula]');
  if (!alvo) return;
  const card = alvo.closest('[data-id]');
  const m = adm.modulos.find(x => x.id === Number(card.dataset.id));
  try {
    if (alvo.dataset.excluirAula) {
      if (!confirm('Remover este material? O progresso dos colaboradores nele será perdido.')) return;
      await api(`/api/admin/aulas/${alvo.dataset.excluirAula}`, { method: 'DELETE' });
    } else if (alvo.dataset.acao === 'excluir') {
      if (!confirm(`Excluir o tema "${m.titulo}" com todos os materiais, avaliação e certificados?`)) return;
      await api(`/api/admin/modulos/${m.id}`, { method: 'DELETE' });
    } else if (alvo.dataset.acao === 'editar') {
      const titulo = prompt('Nome do tema', m.titulo);
      if (titulo === null) return;
      const descricao = prompt('Descrição', m.descricao || '');
      const icone = prompt('Ícone (emoji)', m.icone);
      await api(`/api/admin/modulos/${m.id}`, { method: 'PUT', body: { titulo, descricao: descricao ?? m.descricao, icone: icone || m.icone } });
    } else if (alvo.dataset.acao === 'subir' || alvo.dataset.acao === 'descer') {
      const i = adm.modulos.indexOf(m);
      const j = alvo.dataset.acao === 'subir' ? i - 1 : i + 1;
      if (j < 0 || j >= adm.modulos.length) return;
      const ordem = adm.modulos.map(x => x.id);
      [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
      await Promise.all(ordem.map((id, k) => api(`/api/admin/modulos/${id}`, { method: 'PUT', body: { ordem: k + 1 } })));
    } else if (alvo.dataset.acao === 'prova') {
      abrirEditor(m);
      return;
    }
    carregarModulos();
  } catch (err) { toast(err.message, 'erro'); }
});

// ---------- Editor de prova ----------
const editor = { modulo: null, questoes: [] };
const modalEditor = document.getElementById('modal-editor');

function abrirEditor(m) {
  editor.modulo = m;
  editor.questoes = m.prova ? structuredClone(m.prova.questoes) : [novaQuestao()];
  document.getElementById('editor-modulo').textContent = m.titulo;
  document.getElementById('editor-titulo').value = m.prova?.titulo || `Avaliação · ${m.titulo}`;
  document.getElementById('editor-nota').value = m.prova?.nota_minima ?? 75;
  document.getElementById('editor-excluir').hidden = !m.prova;
  document.getElementById('editor-texto').value = '';
  renderEditor();
  modalEditor.showModal();
}

const novaQuestao = () => ({ enunciado: '', alternativas: ['', '', '', ''], correta: null });

function renderEditor() {
  document.getElementById('editor-questoes').innerHTML = editor.questoes.map((q, i) => `
    <div class="q-edit" data-q="${i}">
      <div class="q-cab">Questão ${i + 1} <button type="button" class="q-rem" data-rem-q="${i}" title="Remover questão">🗑</button></div>
      <textarea class="campo" rows="2" data-campo="enunciado" placeholder="Enunciado da questão">${esc(q.enunciado)}</textarea>
      ${q.alternativas.map((a, j) => `
        <div class="q-alt">
          <input type="radio" name="correta-${i}" value="${j}" ${q.correta === j ? 'checked' : ''} title="Marcar como correta (gabarito)">
          <span class="letra">${String.fromCharCode(65 + j)}</span>
          <input class="campo" data-alt="${j}" value="${esc(a)}" placeholder="Alternativa ${String.fromCharCode(65 + j)}">
          <button type="button" data-rem-alt="${j}" title="Remover alternativa">✕</button>
        </div>`).join('')}
      <div><button type="button" class="btn btn-claro btn-sm" data-add-alt>+ alternativa</button>
      <span class="q-dica">● marque a bolinha da alternativa correta (gabarito)</span></div>
    </div>`).join('');
}

const qEditor = document.getElementById('editor-questoes');
qEditor.addEventListener('input', (e) => {
  const bloco = e.target.closest('[data-q]');
  if (!bloco) return;
  const q = editor.questoes[Number(bloco.dataset.q)];
  if (e.target.dataset.campo === 'enunciado') q.enunciado = e.target.value;
  else if (e.target.dataset.alt !== undefined) q.alternativas[Number(e.target.dataset.alt)] = e.target.value;
});
qEditor.addEventListener('change', (e) => {
  if (e.target.type !== 'radio') return;
  editor.questoes[Number(e.target.closest('[data-q]').dataset.q)].correta = Number(e.target.value);
});
qEditor.addEventListener('click', (e) => {
  const bloco = e.target.closest('[data-q]');
  if (!bloco) return;
  const i = Number(bloco.dataset.q);
  const q = editor.questoes[i];
  if (e.target.closest('[data-rem-q]')) {
    editor.questoes.splice(i, 1);
  } else if (e.target.closest('[data-add-alt]')) {
    if (q.alternativas.length >= 6) return toast('Máximo de 6 alternativas.');
    q.alternativas.push('');
  } else if (e.target.closest('[data-rem-alt]')) {
    const j = Number(e.target.closest('[data-rem-alt]').dataset.remAlt);
    if (q.alternativas.length <= 2) return toast('A questão precisa de ao menos 2 alternativas.');
    q.alternativas.splice(j, 1);
    if (q.correta === j) q.correta = null; else if (q.correta > j) q.correta -= 1;
  } else return;
  renderEditor();
});

document.getElementById('editor-add').addEventListener('click', () => {
  editor.questoes.push(novaQuestao());
  renderEditor();
  qEditor.lastElementChild.scrollIntoView({ behavior: 'smooth' });
});

/** Converte texto no formato "1) pergunta / a) alt / *b) correta" em questões. */
function textoParaQuestoes(texto) {
  const questoes = [];
  let atual = null;
  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim();
    if (!linha) continue;
    const alt = linha.match(/^(\*?)\s*([a-fA-F])\s*[).\-]\s*(\*?)\s*(.+)$/);
    const nova = linha.match(/^\d+\s*[).\-]\s*(.+)$/);
    if (alt && atual) {
      if (alt[1] || alt[3]) atual.correta = atual.alternativas.length;
      atual.alternativas.push(alt[4].replace(/\s*\*$/, '').trim());
      if (/\*$/.test(alt[4])) atual.correta = atual.alternativas.length - 1;
    } else if (nova) {
      atual = { enunciado: nova[1], alternativas: [], correta: null };
      questoes.push(atual);
    } else if (atual && !atual.alternativas.length) {
      atual.enunciado += ' ' + linha;
    }
  }
  return questoes;
}

document.getElementById('editor-converter').addEventListener('click', () => {
  const qs = textoParaQuestoes(document.getElementById('editor-texto').value);
  if (!qs.length) return toast('Nenhuma questão reconhecida. Confira o formato do exemplo.', 'erro');
  const semGabarito = qs.filter(q => q.correta === null).length;
  editor.questoes = [...editor.questoes.filter(q => q.enunciado.trim()), ...qs];
  renderEditor();
  toast(`${qs.length} questões adicionadas${semGabarito ? ` · ${semGabarito} sem gabarito marcado` : ''}`);
});

document.getElementById('form-editor').addEventListener('submit', async (e) => {
  e.preventDefault();
  const corpo = {
    titulo: document.getElementById('editor-titulo').value,
    nota_minima: Number(document.getElementById('editor-nota').value),
    questoes: editor.questoes,
  };
  try {
    await api(`/api/admin/modulos/${editor.modulo.id}/prova`, { method: 'PUT', body: corpo });
    modalEditor.close();
    toast('Avaliação salva ✅');
    carregarModulos();
  } catch (err) { toast(err.message, 'erro'); }
});

document.getElementById('editor-excluir').addEventListener('click', async () => {
  if (!confirm('Excluir a avaliação deste tema? As notas e tentativas registradas serão apagadas.')) return;
  await api(`/api/admin/modulos/${editor.modulo.id}/prova`, { method: 'DELETE' });
  modalEditor.close();
  carregarModulos();
});

// ---------- Resultados ----------
async function carregarResultados() {
  adm.resultados = await api('/api/admin/resultados');
  const opcoes = (campo) => [...new Set(adm.resultados.linhas.map(l => l[campo]).filter(Boolean))].sort();
  for (const [id, campo, rotulo] of [['filtro-regional', 'regional', 'Todas as regionais'], ['filtro-filial', 'filial', 'Todas as filiais']]) {
    const sel = document.getElementById(id);
    const atual = sel.value;
    sel.innerHTML = `<option value="">${rotulo}</option>` + opcoes(campo).map(o => `<option ${o === atual ? 'selected' : ''}>${esc(o)}</option>`).join('');
  }
  renderResultados();
}

function linhasFiltradas() {
  const reg = document.getElementById('filtro-regional').value;
  const fil = document.getElementById('filtro-filial').value;
  return adm.resultados.linhas.filter(l => (!reg || l.regional === reg) && (!fil || l.filial === fil));
}

function renderResultados() {
  const { total_aulas: ta, total_provas: tp } = adm.resultados;
  const linhas = linhasFiltradas();
  const iniciaram = linhas.filter(l => l.aulas_vistas > 0).length;
  const concluiram = linhas.filter(l => tp && l.certificados >= tp).length;
  document.getElementById('resumo-resultados').textContent = `· ${linhas.length} colaboradores · ${iniciaram} iniciaram · ${concluiram} concluíram a trilha`;
  document.getElementById('tabela-resultados').innerHTML = `
    <tr><th>Nome</th><th>CPF</th><th>Cargo</th><th>Filial</th><th>Regional</th><th>Materiais</th><th>Certificados</th><th>Média avaliações</th><th>Última prova</th></tr>
    ${linhas.map(l => {
      const pct = ta ? Math.round((l.aulas_vistas / ta) * 100) : 0;
      return `<tr>
        <td>${esc(l.nome)}</td><td>${formatarCpf(l.cpf)}</td><td>${esc(l.cargo)}</td><td>${esc(l.filial)}</td><td>${esc(l.regional)}</td>
        <td><span class="barra-prog"><i style="width:${pct}%"></i></span>${l.aulas_vistas}/${ta}</td>
        <td>${l.certificados}/${tp}</td>
        <td>${l.media != null ? String(l.media).replace('.', ',') + '%' : '–'}</td>
        <td>${l.ultima_prova ? new Date(l.ultima_prova.replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR') : '–'}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="9">Sem dados.</td></tr>'}`;
}
document.getElementById('filtro-regional').addEventListener('change', renderResultados);
document.getElementById('filtro-filial').addEventListener('change', renderResultados);

document.getElementById('exportar').addEventListener('click', () => {
  const { total_aulas: ta, total_provas: tp } = adm.resultados;
  const cab = ['CPF', 'NOME', 'CARGO', 'FILIAL', 'REGIONAL', 'AULAS CONCLUIDAS', 'TOTAL AULAS', 'CERTIFICADOS', 'TOTAL PROVAS', 'MEDIA PROVAS', 'ULTIMA PROVA'];
  const linhas = linhasFiltradas().map(l => [l.cpf, l.nome, l.cargo, l.filial, l.regional, l.aulas_vistas, ta, l.certificados, tp, l.media ?? '', l.ultima_prova ?? '']);
  const csv = [cab, ...linhas].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `resultados-trilha-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click();
  URL.revokeObjectURL(url);
});

iniciar();
