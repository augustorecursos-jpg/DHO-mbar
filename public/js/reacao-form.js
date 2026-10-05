// Formulário da avaliação de reação (usado no painel do colaborador e na página aberta pelo QR Code).
// Tipos de pergunta: escala (1 a 5), nota (0 a 10), escolha (uma opção) e texto (livre, opcional).

/** HTML do formulário; `form` vem de /api/reacao. */
function htmlFormReacao(form, modulo) {
  let numero = 0;
  const escalaTexto = form.escala.map((e, i) => `${i + 1} – ${e}`).join(' | ');
  const temEscala = form.secoes.some(s => s.perguntas.some(p => p.tipo === 'escala'));

  const pergunta = (p, chave) => {
    const nome = `r${chave}`;
    if (p.tipo === 'escala') {
      return `
        <fieldset class="reacao-linha">
          <legend>${esc(p.texto)}</legend>
          <span class="reacao-opcoes">${[1, 2, 3, 4, 5].map(n => `
            <label title="${n} – ${form.escala[n - 1]}" data-n="${n}"><input type="radio" name="${nome}" value="${n}"><span class="sr">${n} – ${form.escala[n - 1]}</span></label>`).join('')}</span>
        </fieldset>`;
    }
    if (p.tipo === 'nota') {
      return `
        <fieldset class="reacao-bloco">
          <legend>${esc(p.texto)}</legend>
          <div class="reacao-nota">${Array.from({ length: 11 }, (_, n) => `
            <label><input type="radio" name="${nome}" value="${n}"><span>${n}</span></label>`).join('')}</div>
        </fieldset>`;
    }
    if (p.tipo === 'escolha') {
      return `
        <fieldset class="reacao-bloco">
          <legend>${esc(p.texto)}</legend>
          <div class="reacao-escolha">${p.opcoes.map(o => `
            <label><input type="radio" name="${nome}" value="${esc(o)}"> ${esc(o)}</label>`).join('')}</div>
        </fieldset>`;
    }
    return `
      <label class="reacao-bloco reacao-texto">
        <span>${esc(p.texto)} <small>(opcional)</small></span>
        <textarea class="campo" name="${nome}" rows="3" maxlength="3000"></textarea>
      </label>`;
  };

  return `
    <section class="reacao" data-reacao-modulo="${modulo.id}">
      <small>AVALIAÇÃO DE REAÇÃO · ${esc(modulo.titulo)}</small>
      <h4>Conte para nós como foi este módulo</h4>
      ${temEscala ? `<p class="reacao-escala"><strong>Escala:</strong> ${escalaTexto}</p>` : ''}
      ${form.secoes.map((sec, i) => {
        const soEscala = sec.perguntas.every(p => p.tipo === 'escala');
        return `
        <div class="reacao-secao">
          <div class="reacao-cab"><strong>${++numero}. ${esc(sec.titulo.toUpperCase())}</strong>
            ${soEscala ? `<span class="reacao-num">${[1, 2, 3, 4, 5].map(n => `<b>${n}</b>`).join('')}</span>` : ''}</div>
          ${sec.perguntas.map((p, j) => pergunta(p, `${i}-${j}`)).join('')}
        </div>`;
      }).join('')}
      <button type="button" class="btn btn-marinho" data-enviar-reacao>Enviar avaliação de reação</button>
    </section>`;
}

/** Lê as respostas do formulário. Devolve { respostas, faltando } (texto livre é opcional). */
function coletarReacao(caixa, form) {
  const respostas = {};
  let faltando = 0;
  form.secoes.forEach((sec, i) => sec.perguntas.forEach((p, j) => {
    const chave = `${i}-${j}`;
    if (p.tipo === 'texto') {
      respostas[chave] = caixa.querySelector(`[name="r${chave}"]`).value;
      return;
    }
    const marcada = caixa.querySelector(`input[name="r${chave}"]:checked`);
    if (marcada) respostas[chave] = marcada.value; else faltando += 1;
  }));
  return { respostas, faltando };
}
