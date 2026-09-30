// Home pública: acesso por CPF, botão "Ligar" e resumo dos módulos.
const form = document.getElementById('acesso');
const campoCpf = document.getElementById('cpf');
const msg = document.getElementById('acesso-msg');
mascaraCpf(campoCpf);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.className = 'acesso-msg';
  msg.textContent = '';
  const cpf = campoCpf.value.replace(/\D/g, '');
  if (cpf.length !== 11) {
    msg.textContent = 'Digite os 11 números do seu CPF.';
    msg.classList.add('erro');
    return;
  }
  const botao = form.querySelector('button');
  botao.disabled = true;
  try {
    const r = await api('/api/entrar', { method: 'POST', body: { cpf } });
    msg.textContent = `Olá, ${r.nome.split(' ')[0]}! Energizando sua trilha…`;
    msg.classList.add('ok');
    document.body.classList.add('energizado');
    setTimeout(() => { location.href = 'trilha.html'; }, 700);
  } catch (err) {
    msg.textContent = err.status === 403 ? 'Acesso negado. Procure o time de DHO.' : err.message;
    msg.classList.add('erro');
    form.classList.remove('tremer');
    void form.offsetWidth;
    form.classList.add('tremer');
    botao.disabled = false;
  }
});

document.getElementById('ligar').addEventListener('click', () => {
  document.body.classList.add('energizado');
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => campoCpf.focus(), 350);
});
document.querySelector('.btn-hub').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('ligar').click();
});

(async function carregarResumo() {
  const padrao = ['Visão Estratégica', 'Certificados com 75%+', 'Cultura & Valores', 'Autoconhecimento', 'Gestão de Pessoas', 'Comunicação Assertiva'];
  let itens = padrao;
  try {
    const r = await api('/api/publico/resumo');
    document.querySelectorAll('.nota-min, #nota-min-1').forEach(el => { el.textContent = r.nota_minima; });
    document.getElementById('n-modulos').textContent = r.modulos.length;
    document.getElementById('n-aulas').textContent = r.modulos.reduce((s, m) => s + m.aulas, 0);
    document.getElementById('n-provas').textContent = r.provas;
    if (r.modulos.length) {
      itens = [...r.modulos.map(m => m.titulo), `Certificados com ${r.nota_minima}%+`];
      document.getElementById('grade-modulos').innerHTML = r.modulos.map(m => `
        <article class="modulo-card">
          <span class="ic">${esc(m.icone)}</span>
          <h3>${esc(m.titulo)}</h3>
          <small>${m.aulas} ${m.aulas === 1 ? 'aula' : 'aulas'}</small>
        </article>`).join('');
    }
  } catch { /* mantém os textos padrão */ }
  // Duplica a lista para a faixa rolar sem emendas.
  const html = itens.map(t => `<span>${esc(t)}</span>`).join('');
  document.getElementById('faixa').innerHTML = html + html + html + html;
})();
