// Home pública: acesso por CPF (ou CI, para a Bolívia), botão "Ligar" e resumo dos módulos.
const form = document.getElementById('acesso');
const campoCpf = document.getElementById('cpf');
const msg = document.getElementById('acesso-msg');
mascaraCpf(campoCpf);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.className = 'acesso-msg';
  msg.textContent = '';
  const cpf = campoCpf.value.trim();
  if (!documentoValido(cpf)) {
    msg.textContent = 'Digite o número do seu CPF ou CI.';
    msg.classList.add('erro');
    return;
  }
  const botao = form.querySelector('button');
  botao.disabled = true;
  try {
    const r = await api('/api/entrar', { method: 'POST', body: { cpf } });
    msg.textContent = `Olá, ${r.nome.split(' ')[0]}! Abrindo sua trilha…`;
    msg.classList.add('ok');
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

(async function carregarResumo() {
  try {
    const r = await api('/api/publico/resumo');
    document.querySelectorAll('.nota-min').forEach(el => { el.textContent = r.nota_minima; });
    if (r.modulos.length) {
      document.getElementById('grade-temas').innerHTML = r.modulos.map(m => `
        <article class="tema-card">
          <span class="ic">${esc(m.icone)}</span>
          <div><h3>${esc(m.titulo)}</h3><small>${m.aulas} ${m.aulas === 1 ? 'material' : 'materiais'}</small></div>
        </article>`).join('');
    }
  } catch { /* mantém os textos padrão */ }
})();
