// Texto e diagramação do e-book "Guia de acesso" (A4, retrato). Os prints vêm de capturar.js.
const path = require('node:path');

const ENDERECO = 'trilha-dho-ambar.onrender.com';

function montarGuia(mapa, { fontes, imagens }) {
  const arq = (p) => `file://${p}`;
  const fonte = (familia, peso, nome) => `@font-face { font-family: '${familia}'; font-weight: ${peso};
    src: url('${arq(path.join(fontes, nome))}') format('woff'); }`;

  // Print com as marcações numeradas (moldura laranja + número).
  const print = (nome, { moldura = 'navegador', classe = '' } = {}) => {
    const p = mapa[nome];
    const marcas = p.marcas.map(m => `
      <span class="caixa" style="left:${m.x}%;top:${m.y}%;width:${m.w}%;height:${m.h}%"></span>
      <b class="num" style="left:${m.x}%;top:${m.y}%">${m.n}</b>`).join('');
    const img = `<div class="print-img" style="aspect-ratio:${p.proporcao}"><img src="${p.arquivo}" alt="">${marcas}</div>`;
    if (moldura === 'navegador') return `<figure class="print navegador ${classe}"><div class="barra-nav"><i></i><i></i><i></i><span>${ENDERECO}</span></div>${img}</figure>`;
    if (moldura === 'celular') return `<figure class="print celular ${classe}">${img}</figure>`;
    return `<figure class="print solto ${classe}">${img}</figure>`;
  };
  const legenda = (itens) => `<ol class="legenda">${itens.map(([n, t]) => `<li><b>${n}</b><span>${t}</span></li>`).join('')}</ol>`;

  let numeroPagina = 0;
  const pagina = (conteudo, { classe = '', passo, titulo, kicker } = {}) => {
    numeroPagina++;
    const cab = titulo ? `
      <header class="cab">
        ${passo ? `<span class="passo-num">${passo}</span>` : ''}
        <div><small>${kicker || `PASSO ${passo}`}</small><h2>${titulo}</h2></div>
      </header>` : '';
    return `
    <section class="pagina ${classe}">
      ${classe.includes('capa') || classe.includes('contracapa') ? '' : `
      <div class="topo-pag"><span>GUIA DE ACESSO · TRILHA DE DESENVOLVIMENTO</span><span class="logo-mini"><b>Âmbar</b> ENERGIA</span></div>`}
      ${cab}
      <div class="corpo">${conteudo}</div>
      ${classe.includes('capa') || classe.includes('contracapa') ? '' : `
      <svg class="onda-pag" viewBox="0 0 420 150" preserveAspectRatio="none" aria-hidden="true">
        <path d="M420 0C300 6 220 100 60 150H100C250 110 320 24 420 18Z" fill="#ec6b24"/>
        <path d="M420 18C320 24 250 110 100 150H420Z" fill="#0e3b5c"/>
      </svg>
      <footer class="rodape-pag"><span>Âmbar, a energia que te desenvolve.</span><b>${String(numeroPagina).padStart(2, '0')}</b></footer>`}
    </section>`;
  };

  const marcas = ['green-cargo', 'fluxus', 'mgas', 'logas']
    .map(m => `<img src="${arq(path.join(imagens, 'marcas', `${m}.png`))}" alt="">`).join('');

  const paginas = [
    // 1 · Capa
    pagina(`
      <div class="capa-topo"><span class="logo"><b>Âmbar</b><small>ENERGIA</small></span><span class="sep"></span><div class="marcas">${marcas}</div></div>
      <div class="capa-foto"><img src="${arq(path.join(imagens, 'equipe-ambar.jpg'))}" alt=""></div>
      <div class="capa-texto">
        <span class="kicker">GUIA DE ACESSO · TRILHA DE DESENVOLVIMENTO</span>
        <h1>Primeira vez<br>por <em>aqui?</em></h1>
        <p>Um passo a passo para você entrar na plataforma, estudar os materiais, liberar e responder as avaliações e conquistar seus certificados.</p>
        <div class="capa-rodape"><span>Desenvolvimento Humano e Organizacional · DHO</span><strong>Âmbar, a energia que te desenvolve.</strong></div>
      </div>
      <svg class="capa-onda" viewBox="0 0 420 150" preserveAspectRatio="none" aria-hidden="true">
        <path d="M420 0C300 6 220 100 60 150H100C250 110 320 24 420 18Z" fill="#ec6b24"/>
        <path d="M420 18C320 24 250 110 100 150H420Z" fill="#164d74"/>
        <path d="M420 70C340 84 270 130 210 150" fill="none" stroke="#fff" stroke-width="1" opacity=".6"/>
      </svg>`, { classe: 'capa' }),

    // 2 · Boas-vindas e sumário
    pagina(`
      <div class="boasvindas">
        <span class="kicker">BOAS-VINDAS</span>
        <h1>Uma jornada para quem <em>desenvolve pessoas</em></h1>
        <p>A Trilha de Desenvolvimento reúne, em um só lugar, os materiais preparados pelo time de DHO, as avaliações de cada tema e os seus certificados.
          Você estuda no seu ritmo, pelo computador ou pelo celular, e acompanha o seu progresso a cada etapa.</p>
      </div>
      <div class="jornada">
        <div><span>🔑</span><strong>Entre</strong><small>com o seu CPF ou CI</small></div>
        <div><span>📘</span><strong>Estude</strong><small>os materiais do tema</small></div>
        <div><span>📝</span><strong>Avalie</strong><small>seu aprendizado</small></div>
        <div><span>🎓</span><strong>Certifique-se</strong><small>com 70% ou mais</small></div>
      </div>
      <div class="duas-col">
        <div>
          <h3 class="subtitulo">Neste guia</h3>
          <ol class="sumario">
            <li><b>1</b>Acesse a plataforma<span>03</span></li>
            <li><b>2</b>Conheça o seu painel<span>04</span></li>
            <li><b>3</b>Escolha um tema<span>05</span></li>
            <li><b>4</b>Estude os materiais<span>06</span></li>
            <li><b>5</b>Como a avaliação é liberada<span>07</span></li>
            <li><b>6</b>Responda a avaliação<span>08</span></li>
            <li><b>7</b>Baixe o seu certificado<span>09</span></li>
            <li><b>+</b>Avaliação de reação e QR Code<span>10</span></li>
            <li><b>?</b>Celular e dúvidas frequentes<span>11</span></li>
          </ol>
        </div>
        <div class="caixa-info">
          <h3 class="subtitulo">Antes de começar</h3>
          <ul class="checklist">
            <li><b>Seu CPF</b> — é ele que libera o acesso. Não há senha. Colaboradores da Bolívia usam o número do <b>CI</b>.</li>
            <li><b>Internet</b> — Wi-Fi ou dados móveis.</li>
            <li><b>Navegador atualizado</b> — Chrome, Edge, Safari ou Firefox.</li>
            <li><b>Computador, tablet ou celular</b> — a plataforma se adapta à tela.</li>
            <li><b>Um momento tranquilo</b> — para ler os materiais com atenção.</li>
          </ul>
        </div>
      </div>
      <div class="guarde">
        <span>📘</span>
        <div><h4>Guarde este guia</h4>
          <p>Ele também fica disponível na plataforma: no link <strong>“Primeira vez aqui?”</strong>, na página inicial,
            e em <strong>Guia de acesso</strong>, no menu lateral do seu painel.</p></div>
      </div>`, { classe: 'pag-intro' }),

    // 3 · Passo 1
    pagina(`
      <p class="intro">Abra o navegador e digite o endereço da plataforma. Na página inicial, use o cartão <strong>“Acesse sua trilha”</strong>.</p>
      <div class="endereco"><span>🌐</span><div><small>ENDEREÇO DA PLATAFORMA</small><strong>${ENDERECO}</strong></div></div>
      ${print('home', { classe: 'home' })}
      ${legenda([
        [1, 'Digite o seu <strong>CPF</strong>, com ou sem pontos e traço. Colaboradores da Bolívia digitam só o número do <strong>CI</strong>, sem a sigla do departamento.'],
        [2, 'Clique em <strong>Acessar Trilha</strong>. Pronto, você já está no seu painel.'],
        [3, '<strong>Primeira vez aqui?</strong> Por este link você abre este guia sempre que precisar.'],
      ])}
      <div class="alerta">
        ${print('negado', { moldura: 'nenhuma', classe: 'mini' })}
        <div>
          <h4>Apareceu “Acesso negado”?</h4>
          <p>Confira se o CPF (ou CI) foi digitado corretamente. Se a mensagem continuar, o seu documento ainda não está na base de colaboradores da trilha:
            <strong>procure o time de DHO</strong> para verificar o seu cadastro.</p>
        </div>
      </div>`, { passo: '01', titulo: 'Acesse a plataforma' }),

    // 4 · Passo 2
    pagina(`
      <p class="intro">Ao entrar, você chega ao <strong>Meu painel</strong>: o resumo de tudo o que você já fez e do que falta fazer na trilha.</p>
      ${print('painel')}
      ${legenda([
        [1, '<strong>Menu lateral com os temas da trilha.</strong> Cada tema mostra quantos materiais e avaliações tem, o seu percentual de avanço e um ✓ quando estiver concluído.'],
        [2, '<strong>Continuar trilha</strong> leva direto ao próximo material que você ainda não estudou.'],
        [3, '<strong>Seus números:</strong> materiais estudados, temas, avaliações pendentes e certificados conquistados.'],
        [4, '<strong>Cartões dos temas.</strong> Clique em um cartão para abrir o tema.'],
        [5, '<strong>Meus certificados.</strong> Todos os certificados emitidos ficam aqui para baixar quando quiser.'],
      ])}
      <div class="dica"><b>💡 Dica</b><span>No menu lateral também ficam o <strong>Guia de acesso</strong> e o botão <strong>Sair</strong>. Usou um computador compartilhado? Clique em Sair ao terminar.</span></div>`,
    { passo: '02', titulo: 'Conheça o seu painel' }),

    // 5 · Passo 3
    pagina(`
      <p class="intro">Clique em um tema no menu lateral ou nos cartões do painel. Cada tema reúne os seus materiais em PDF e as suas avaliações.</p>
      <div class="status">
        <div><span class="etq neutra">Não iniciado</span><small>Você ainda não abriu nenhum material.</small></div>
        <div><span class="etq pend">Em andamento</span><small>Já começou, mas ainda falta alguma etapa.</small></div>
        <div><span class="etq ok">Concluído</span><small>Todos os materiais estudados e as avaliações aprovadas.</small></div>
      </div>
      ${print('tema')}
      ${legenda([
          [1, '<strong>Progresso do tema:</strong> percentual concluído e quantas avaliações você já aprovou.'],
          [2, '<strong>Materiais:</strong> clique em <strong>Abrir</strong> para estudar. Os já concluídos ganham um ✓ e o botão vira <strong>Rever</strong>.'],
          [3, '<strong>Avaliação:</strong> o cadeado 🔒 indica que ela ainda está bloqueada e a mensagem mostra o que falta para liberar.'],
          [4, '<strong>Avaliação de reação:</strong> conte para o DHO o que achou do tema (veja a página 10).'],
        ])}`, { passo: '03', titulo: 'Escolha um tema' }),

    // 6 · Passo 4
    pagina(`
      <p class="intro">Ao clicar em <strong>Abrir</strong>, o material aparece dentro da própria plataforma, exatamente como foi preparado pelo time de DHO. Role a tela para passar as páginas.</p>
      ${print('material')}
      ${legenda([
        [1, '<strong>Página atual</strong> e total de páginas do material.'],
        [2, 'Terminou a leitura? Clique em <strong>✓ Concluí este material</strong>. É isso que conta o seu progresso e libera a avaliação.'],
        [3, '<strong>Fechar</strong> volta para a página do tema. Você pode rever o material quando quiser.'],
      ])}
      <div class="protegido">
        <span class="ic">🔒</span>
        <div>
          <h4>Conteúdo protegido</h4>
          <p>Os materiais são de uso exclusivo da trilha: <strong>não é possível baixar, imprimir ou capturar a tela</strong>.
            Se você trocar de janela ou de aplicativo, o conteúdo fica desfocado; basta voltar para a plataforma para continuar a leitura.</p>
        </div>
      </div>
      <div class="dica"><b>💡 Dica</b><span>Leia o material até a última página antes de marcar como concluído. Ele continua disponível depois, pelo botão <strong>Rever</strong>, para você consultar sempre que quiser.</span></div>`, { passo: '04', titulo: 'Estude os materiais' }),

    // 7 · Passo 5
    pagina(`
      <p class="intro">As avaliações são liberadas <strong>automaticamente</strong> conforme você conclui os materiais. Enquanto estiver bloqueada, a avaliação mostra um cadeado e explica o que falta.</p>
      <div class="fluxo">
        <div class="etapa feita"><span>✓</span><strong>Material 1</strong><small>concluído</small></div>
        <i>→</i>
        <div class="etapa feita"><span>✓</span><strong>Material 2</strong><small>concluído</small></div>
        <i>→</i>
        <div class="etapa liberada"><span>📝</span><strong>Avaliação</strong><small>liberada</small></div>
      </div>
      <h3 class="subtitulo">Avaliação final do tema</h3>
      <p class="texto">Fica no fim da página do tema e é liberada quando <strong>todos os materiais</strong> do tema forem marcados como concluídos.</p>
      <div class="antes-depois">
        <div><small class="rotulo">ANTES · bloqueada</small>${print('avaliacao-bloqueada', { moldura: 'nenhuma' })}</div>
        <div><small class="rotulo ok">DEPOIS · liberada</small>${print('avaliacao-liberada', { moldura: 'nenhuma' })}</div>
      </div>
      <h3 class="subtitulo">Avaliação de um material</h3>
      <p class="texto">Alguns temas têm uma avaliação para cada material. Ela aparece logo abaixo do material <strong>(1)</strong> e é liberada assim que <strong>aquele material</strong> for concluído <strong>(2)</strong>.</p>
      ${print('por-material', { moldura: 'nenhuma' })}`, { passo: '05', titulo: 'Como a avaliação é liberada' }),

    // 8 · Passo 6
    pagina(`
      <p class="intro">Clique em <strong>Iniciar avaliação</strong>. A avaliação abre com uma mensagem do time de DHO <strong>(1)</strong> e, logo abaixo, as questões.</p>
      <div class="dois-prints">
        ${print('prova-abertura', { moldura: 'nenhuma' })}
        ${print('prova-questoes', { moldura: 'nenhuma' })}
      </div>
      ${legenda([
        [1, '<strong>Abertura da avaliação:</strong> leia com calma antes de começar.'],
        [2, 'Marque uma alternativa em cada questão e clique em <strong>Enviar respostas</strong>.'],
      ])}
      <div class="regras">
        <div><span>✅</span><strong>Responda todas</strong><small>Todas as questões precisam ser marcadas antes do envio.</small></div>
        <div><span>🎯</span><strong>Nota mínima: 70%</strong><small>É o percentual de acertos para ser aprovado e receber o certificado.</small></div>
        <div><span>⚡</span><strong>Resultado na hora</strong><small>A nota aparece assim que você envia as respostas.</small></div>
        <div><span>🔁</span><strong>Pode refazer</strong><small>Não passou ou quer melhorar? Tente de novo: vale sempre a sua melhor nota.</small></div>
      </div>
      <div class="dica"><b>💡 Dica</b><span>Não atingiu os 70%? Volte aos materiais do tema pelo botão <strong>Rever</strong>, revise os pontos principais e clique em <strong>Tentar novamente</strong>.</span></div>`, { passo: '06', titulo: 'Responda a avaliação' }),

    // 9 · Passo 7
    pagina(`
      <p class="intro">Atingiu <strong>70% ou mais</strong>? Parabéns! O certificado é emitido na hora, com o nome do tema e a sua nota.</p>
      <div class="lado-a-lado certificado-lado">
        ${print('resultado', { moldura: 'nenhuma' })}
        ${legenda([
          [1, 'A sua <strong>nota</strong> e quantas questões você acertou.'],
          [2, '<strong>Baixar certificado</strong> salva o certificado em PDF no seu computador ou celular.'],
        ])}
      </div>
      <div class="certificado-img">${print('certificado', { moldura: 'nenhuma' })}</div>
      <div class="lado-a-lado onde">
        ${print('certificados', { moldura: 'nenhuma' })}
        <div>
          <h3 class="subtitulo">Onde encontro depois?</h3>
          <p class="texto">Em <strong>Meus certificados</strong>, no seu painel, e no botão <strong>⬇ Certificado</strong> da avaliação aprovada, dentro do tema.
            Cada certificado tem um <strong>código de autenticidade</strong> que comprova a sua emissão.</p>
        </div>
      </div>`, { passo: '07', titulo: 'Baixe o seu certificado' }),

    // 10 · Reação
    pagina(`
      <p class="intro">A sua opinião ajuda o time de DHO a melhorar a trilha. A avaliação de reação é rápida e é respondida <strong>uma vez por tema</strong>.</p>
      <div class="lado-a-lado reacao-lado">
        ${print('reacao', { moldura: 'nenhuma' })}
        <div>
          <h3 class="subtitulo">Onde responder</h3>
          <ul class="checklist">
            <li><b>Ao final da avaliação</b> — ela aparece logo abaixo do seu resultado.</li>
            <li><b>Na página do tema</b> — em “Avaliação de reação”, enquanto estiver pendente.</li>
            <li><b>Pelo QR Code</b> — enviado pelo time de DHO; você pode responder <strong>até antes</strong> da avaliação do tema.</li>
          </ul>
          <h3 class="subtitulo">Tipos de pergunta</h3>
          <ul class="tipos">
            <li><b>1 a 5</b> Escala de Muito ruim a Excelente</li>
            <li><b>0 a 10</b> Nota geral do módulo</li>
            <li><b>◉</b> Múltipla escolha</li>
            <li><b>✎</b> Texto livre (opcional)</li>
          </ul>
        </div>
      </div>
      <div class="qr-passos">
        ${print('celular-qr-cpf', { moldura: 'celular' })}
        <div class="qr-texto">
          <h3 class="subtitulo">Recebeu um QR Code?</h3>
          <ol class="passos-qr">
            <li>Aponte a câmera do celular para o QR Code e toque no link.</li>
            <li>Informe o seu <strong>CPF ou CI</strong> <b class="num-inline">1</b> e toque em <strong>Continuar</strong>.</li>
            <li>Responda as perguntas e toque em <strong>Enviar</strong>. Pronto!</li>
          </ol>
        </div>
        ${print('celular-qr-form', { moldura: 'celular' })}
      </div>`, { titulo: 'Avaliação de reação e QR Code', kicker: 'SUA OPINIÃO' }),

    // 11 · Celular e dúvidas
    pagina(`
      <div class="lado-a-lado celular-lado">
        ${print('celular-home', { moldura: 'celular' })}
        <div>
          <h3 class="subtitulo">Estude de onde estiver</h3>
          <p class="texto">A plataforma funciona no computador, no tablet e no celular, sem instalar nada. No celular, o menu dos temas fica no botão <strong>☰</strong>, no alto da tela.
            O seu progresso fica salvo: comece no computador e continue no celular, ou ao contrário.</p>
          <h3 class="subtitulo">Dúvidas frequentes</h3>
          <dl class="faq">
            <dt>Preciso de senha?</dt><dd>Não. O acesso é feito somente com o CPF ou, para colaboradores da Bolívia, com o número do CI.</dd>
            <dt>Marquei um material como concluído sem querer. E agora?</dt><dd>Sem problema: você pode abrir e rever o material quando quiser, pelo botão “Rever”.</dd>
            <dt>A avaliação não libera. O que faço?</dt><dd>Confira a mensagem abaixo do cadeado: ela indica o material que ainda precisa ser concluído.</dd>
            <dt>Parei no meio. Perco o que já fiz?</dt><dd>Não. O seu progresso fica salvo; é só entrar de novo com o CPF (ou CI) e clicar em “Continuar trilha”.</dd>
            <dt>Quantas vezes posso fazer a avaliação?</dt><dd>Quantas quiser. Vale sempre a sua melhor nota.</dd>
            <dt>Posso baixar ou imprimir os materiais?</dt><dd>Não. Os materiais ficam disponíveis somente dentro da plataforma.</dd>
            <dt>Perdi o certificado. Como recupero?</dt><dd>Entre na trilha e baixe de novo em “Meus certificados”.</dd>
          </dl>
        </div>
      </div>
      <div class="ajuda">
        <span>🤝</span>
        <div><h4>Precisa de ajuda?</h4><p>Procure o <strong>time de DHO</strong>. Estamos aqui para apoiar o seu desenvolvimento.</p></div>
      </div>`, { titulo: 'Celular e dúvidas frequentes', kicker: 'PARA FACILITAR' }),

    // 12 · Contracapa
    pagina(`
      <div class="contra-texto">
        <span class="logo claro"><b>Âmbar</b><small>ENERGIA</small></span>
        <h1>Bons estudos e<br><em>boa jornada!</em></h1>
        <p>Porque grandes lideranças não apenas conduzem resultados.<br><strong>Elas inspiram, desenvolvem e deixam pessoas melhores pelo caminho.</strong></p>
        <div class="contra-endereco"><small>ACESSE</small><strong>${ENDERECO}</strong></div>
      </div>
      <div class="contra-rodape"><span>Desenvolvimento Humano e Organizacional · DHO</span><strong>Âmbar, a energia que te desenvolve.</strong></div>
      <svg class="capa-onda" viewBox="0 0 420 150" preserveAspectRatio="none" aria-hidden="true">
        <path d="M420 0C300 6 220 100 60 150H100C250 110 320 24 420 18Z" fill="#ec6b24"/>
        <path d="M420 18C320 24 250 110 100 150H420Z" fill="#164d74"/>
        <path d="M420 70C340 84 270 130 210 150" fill="none" stroke="#fff" stroke-width="1" opacity=".6"/>
      </svg>`, { classe: 'contracapa' }),
  ];

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Guia de acesso · Trilha de Desenvolvimento</title>
<style>
${fonte('Montserrat', '400 500', 'montserrat-latin-400-normal.woff')}
${fonte('Montserrat', '600 700', 'montserrat-latin-700-normal.woff')}
${fonte('Montserrat', '800 900', 'montserrat-latin-800-normal.woff')}
${fonte('Nunito Sans', '400 500', 'nunito-sans-latin-400-normal.woff')}
${fonte('Nunito Sans', '600 900', 'nunito-sans-latin-700-normal.woff')}
${CSS}
</style></head><body>${paginas.join('')}</body></html>`;
}

const CSS = `
@page { size: A4; margin: 0; }
:root { --marinho: #0e3b5c; --marinho-2: #164d74; --laranja: #ec6b24; --laranja-claro: #f39a4a; --laranja-suave: #fdf0e7;
  --fundo: #f4f6f8; --linha: #dfe5eb; --texto: #1d2b36; --suave: #5f6f7c; --verde: #1f9d57; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: 'Nunito Sans', sans-serif; color: var(--texto); -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 10.5pt; }
h1, h2, h3, h4 { font-family: 'Montserrat', sans-serif; margin: 0; color: var(--marinho); }
em { font-style: normal; color: var(--laranja); }
strong { font-weight: 700; }

.pagina { position: relative; width: 210mm; height: 297mm; overflow: hidden; page-break-after: always; break-after: page;
  background: #fff; padding: 16mm 16mm 22mm; display: flex; flex-direction: column; }
.pagina:last-child { page-break-after: auto; break-after: auto; }
.corpo { flex: 1; display: flex; flex-direction: column; gap: 4.2mm; min-height: 0; position: relative; z-index: 1; }

.topo-pag { position: absolute; top: 0; left: 0; right: 0; height: 10mm; padding: 0 16mm; display: flex; align-items: center; justify-content: space-between;
  background: var(--marinho); color: #b9cddd; font-family: 'Montserrat'; font-size: 6.5pt; font-weight: 700; letter-spacing: .16em; }
.logo-mini { color: var(--laranja-claro); letter-spacing: .12em; }
.logo-mini b { color: #fff; font-weight: 600; letter-spacing: 0; font-size: 9pt; margin-right: 2px; }
.onda-pag { position: absolute; right: 0; bottom: 0; width: 70mm; height: 24mm; z-index: 0; }
.rodape-pag { position: absolute; left: 16mm; right: 16mm; bottom: 7mm; display: flex; align-items: center; gap: 4mm; font-size: 8pt; color: var(--suave); z-index: 1; }
.rodape-pag b { margin-left: auto; margin-right: 44mm; font-family: 'Montserrat'; color: var(--marinho); font-size: 9pt; }
.rodape-pag span::before { content: ''; display: inline-block; width: 6mm; height: 2px; background: var(--laranja); vertical-align: middle; margin-right: 2.5mm; }

.cab { display: flex; align-items: center; gap: 5mm; margin: 2mm 0 5mm; }
.passo-num { font-family: 'Montserrat'; font-weight: 800; font-size: 34pt; line-height: 1; color: var(--laranja); }
.cab small { font-family: 'Montserrat'; font-weight: 700; font-size: 7.5pt; letter-spacing: .2em; color: var(--laranja); }
.cab h2 { font-size: 21pt; font-weight: 800; letter-spacing: -.01em; margin-top: 1mm; }
.kicker { font-family: 'Montserrat'; font-weight: 700; font-size: 7.5pt; letter-spacing: .2em; color: var(--laranja); }
.intro { margin: 0; font-size: 11pt; line-height: 1.55; color: var(--texto); padding-left: 4mm; border-left: 3px solid var(--laranja); }
.texto { margin: 0; line-height: 1.55; color: var(--texto); }
.subtitulo { font-size: 11.5pt; font-weight: 700; margin: 0 0 2mm; }

/* Prints */
.print { margin: 0; }
.print-img { position: relative; width: 100%; }
.print-img img { display: block; width: 100%; height: 100%; }
.navegador { border-radius: 3mm; border: 1px solid var(--linha); box-shadow: 0 6mm 10mm -7mm rgba(14, 59, 92, .45); background: #fff; }
.navegador img { border-radius: 0 0 3mm 3mm; }
.barra-nav { border-radius: 3mm 3mm 0 0; display: flex; align-items: center; gap: 1.4mm; height: 6.5mm; padding: 0 3mm; background: #e9eef3; border-bottom: 1px solid var(--linha); }
.barra-nav i { width: 2.2mm; height: 2.2mm; border-radius: 50%; background: #c9d0d6; }
.barra-nav i:first-child { background: #f39a4a; }
.barra-nav span { margin-left: 3mm; flex: 0 1 60%; background: #fff; border-radius: 3mm; padding: .6mm 3mm; font-size: 7pt; color: var(--suave); }
.solto .print-img { border-radius: 2.5mm; border: 1px solid var(--linha); box-shadow: 0 5mm 9mm -7mm rgba(14, 59, 92, .4); }
.solto img { border-radius: 2.5mm; }
.celular { width: 100%; padding: 2.2mm; border-radius: 7mm; background: #1d2b36; box-shadow: 0 6mm 10mm -6mm rgba(14, 59, 92, .55); }
.celular .print-img { border-radius: 5mm; overflow: hidden; }
.caixa { position: absolute; border: 2px solid var(--laranja); border-radius: 2mm; box-shadow: 0 0 0 1.4mm rgba(236, 107, 36, .16); }
.num { position: absolute; transform: translate(-50%, -50%); width: 6mm; height: 6mm; border-radius: 50%; background: var(--laranja); color: #fff;
  display: grid; place-items: center; font-family: 'Montserrat'; font-weight: 800; font-size: 8.5pt; border: 1.6px solid #fff; box-shadow: 0 1mm 2mm rgba(0, 0, 0, .25); }

.legenda { list-style: none; margin: 0; padding: 0; display: grid; gap: 2.2mm; }
.legenda li { display: flex; gap: 3mm; align-items: flex-start; line-height: 1.45; }
.legenda li b { flex-shrink: 0; width: 6mm; height: 6mm; border-radius: 50%; background: var(--laranja); color: #fff; display: grid; place-items: center;
  font-family: 'Montserrat'; font-weight: 800; font-size: 8.5pt; margin-top: -.3mm; }
.num-inline { display: inline-grid; place-items: center; width: 4.6mm; height: 4.6mm; border-radius: 50%; background: var(--laranja); color: #fff; font-family: 'Montserrat'; font-size: 7pt; vertical-align: 1px; }

.dica, .alerta, .protegido, .ajuda { border-radius: 3mm; padding: 4mm 5mm; display: flex; gap: 4mm; align-items: center; }
.dica { background: var(--fundo); border-left: 3px solid var(--marinho); line-height: 1.5; }
.dica b { flex-shrink: 0; font-family: 'Montserrat'; color: var(--marinho); font-size: 9pt; }
.alerta { background: #fdecea; border: 1px solid #f6cfca; }
.alerta .mini { width: 58mm; flex-shrink: 0; }
.print.home { width: 86%; align-self: center; }
.texto + .subtitulo, .checklist + .subtitulo { margin-top: 4mm; }
.alerta h4 { color: #b42318; font-size: 11pt; margin-bottom: 1.5mm; }
.alerta p, .protegido p, .ajuda p { margin: 0; line-height: 1.5; }
.protegido { background: var(--marinho); color: #dce7f0; }
.protegido h4, .ajuda h4 { color: #fff; font-size: 11pt; margin-bottom: 1mm; }
.protegido strong { color: #fff; }
.protegido .ic, .ajuda > span { font-size: 18pt; }
.ajuda { background: var(--laranja); color: #fff; margin-top: auto; }

.endereco { display: flex; align-items: center; gap: 3.5mm; padding: 3mm 5mm; border-radius: 3mm; background: var(--laranja-suave); border: 1px dashed var(--laranja); align-self: flex-start; }
.endereco span { font-size: 15pt; }
.endereco small, .contra-endereco small { display: block; font-family: 'Montserrat'; font-weight: 700; font-size: 6.5pt; letter-spacing: .18em; color: var(--laranja); }
.endereco strong { font-family: 'Montserrat'; font-size: 13pt; color: var(--marinho); }

/* Capa */
.capa { padding: 0; background: var(--marinho); }
.capa .corpo { gap: 0; }
.capa-topo { display: flex; align-items: center; gap: 6mm; padding: 7mm 14mm; background: #fff; }
.capa-topo .sep { width: 1px; height: 9mm; background: var(--linha); }
.marcas { display: flex; align-items: center; gap: 5.5mm; }
.marcas img { height: 6.2mm; width: auto; }
.logo { display: inline-flex; flex-direction: column; line-height: .95; }
.logo b { font-family: 'Montserrat'; font-weight: 600; font-size: 19pt; color: var(--marinho); }
.logo small { font-family: 'Montserrat'; font-weight: 700; font-size: 6.5pt; letter-spacing: .14em; color: var(--laranja); margin-left: 1px; }
.logo.claro b { color: #fff; }
.capa-foto { position: relative; height: 146mm; overflow: hidden; }
.capa-foto img { width: 100%; height: 100%; object-fit: cover; object-position: 72% 12%; }
.capa-foto::after { content: ''; position: absolute; inset: 0; background: linear-gradient(0deg, var(--marinho) 0%, rgba(14, 59, 92, .35) 30%, rgba(14, 59, 92, 0) 55%); }
.capa-texto { position: relative; z-index: 2; padding: 0 16mm; margin-top: -14mm; color: #dce7f0; }
.capa-texto .kicker { color: var(--laranja-claro); }
.capa h1 { color: #fff; font-size: 40pt; line-height: 1.08; font-weight: 800; letter-spacing: -.02em; margin: 4mm 0 5mm; }
.capa-texto p { font-size: 12.5pt; line-height: 1.55; max-width: 140mm; margin: 0; padding-left: 4mm; border-left: 3px solid var(--laranja); }
.capa-rodape, .contra-rodape { position: absolute; left: 16mm; bottom: 14mm; z-index: 2; display: grid; gap: 1.5mm; font-size: 9pt; color: #b9cddd; }
.capa-rodape { position: relative; left: 0; bottom: 0; margin-top: 20mm; }
.capa-rodape strong, .contra-rodape strong { color: #fff; font-family: 'Montserrat'; font-size: 11pt; }
.capa-onda { position: absolute; right: 0; bottom: 0; width: 95mm; height: 42mm; z-index: 1; }

/* Página de boas-vindas */
.boasvindas h1 { font-size: 24pt; line-height: 1.15; font-weight: 800; margin: 2mm 0 4mm; max-width: 150mm; }
.boasvindas p { margin: 0; font-size: 11pt; line-height: 1.6; max-width: 165mm; }
.pag-intro .corpo { gap: 8mm; padding-top: 4mm; }
.jornada { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; position: relative; }
.jornada::before { content: ''; position: absolute; top: 9mm; left: 12%; right: 12%; height: 2px; background: repeating-linear-gradient(90deg, var(--laranja) 0 3mm, transparent 3mm 5mm); }
.jornada div { position: relative; text-align: center; display: grid; justify-items: center; gap: 1mm; }
.jornada span { width: 18mm; height: 18mm; border-radius: 50%; background: var(--marinho); display: grid; place-items: center; font-size: 17pt; box-shadow: 0 0 0 2mm #fff; margin-bottom: 2mm; }
.jornada strong { font-family: 'Montserrat'; color: var(--marinho); font-size: 11pt; }
.jornada small { color: var(--suave); font-size: 9pt; }
.duas-col { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; }
.sumario { list-style: none; margin: 0; padding: 0; }
.sumario li { display: flex; align-items: center; gap: 3mm; padding: 2.4mm 0; border-bottom: 1px dashed var(--linha); font-weight: 600; color: var(--marinho); }
.sumario b { width: 6.5mm; height: 6.5mm; border-radius: 1.6mm; background: var(--laranja-suave); color: var(--laranja); display: grid; place-items: center; font-family: 'Montserrat'; font-size: 8.5pt; }
.sumario span { margin-left: auto; font-family: 'Montserrat'; color: var(--suave); font-size: 9pt; }
.caixa-info { background: var(--fundo); border-radius: 3mm; padding: 5mm 6mm; border-top: 3px solid var(--marinho); }
.checklist { list-style: none; margin: 0 0 3mm; padding: 0; display: grid; gap: 2.4mm; }
.checklist li { position: relative; padding-left: 6.5mm; line-height: 1.45; }
.checklist li::before { content: '✓'; position: absolute; left: 0; top: 0; width: 4.6mm; height: 4.6mm; border-radius: 50%; background: var(--verde); color: #fff; font-size: 7pt; display: grid; place-items: center; font-weight: 800; }
.checklist b { color: var(--marinho); }

/* Passo 3 */
.status { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
.status div { display: grid; gap: 1.5mm; padding: 3mm 4mm; border: 1px solid var(--linha); border-radius: 2.5mm; }
.status small { color: var(--suave); line-height: 1.4; }
.etq { justify-self: start; font-weight: 700; font-size: 8.5pt; padding: .8mm 3mm; border-radius: 4mm; }
.etq.neutra { background: #eef1f4; color: var(--suave); }
.etq.pend { background: var(--laranja-suave); color: #b84d12; }
.etq.ok { background: #e3f4ea; color: #16794a; }
.lado-a-lado { display: grid; grid-template-columns: 1.15fr 1fr; gap: 7mm; align-items: center; }
.lado-a-lado .estreito { align-self: start; }

/* Passo 5 */
.fluxo { display: flex; align-items: center; justify-content: center; gap: 4mm; padding: 4mm; background: var(--fundo); border-radius: 3mm; }
.fluxo i { font-style: normal; color: var(--laranja); font-size: 16pt; font-weight: 800; }
.etapa { display: grid; justify-items: center; gap: .5mm; width: 36mm; padding: 3mm; border-radius: 2.5mm; background: #fff; border: 1px solid var(--linha); }
.etapa span { width: 8mm; height: 8mm; border-radius: 50%; display: grid; place-items: center; background: var(--verde); color: #fff; font-weight: 800; }
.etapa.liberada { border: 2px solid var(--laranja); }
.etapa.liberada span { background: var(--laranja-suave); }
.etapa strong { font-family: 'Montserrat'; color: var(--marinho); font-size: 10pt; }
.etapa small { color: var(--suave); font-size: 8pt; }
.antes-depois { display: grid; gap: 3mm; }
.rotulo { display: block; font-family: 'Montserrat'; font-weight: 700; font-size: 7pt; letter-spacing: .14em; color: var(--suave); margin-bottom: 1.2mm; }
.rotulo.ok { color: var(--verde); }

/* Passo 6 */
.dois-prints { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
.regras { display: grid; grid-template-columns: 1fr 1fr; gap: 3.5mm; }
.regras div { display: grid; grid-template-columns: auto 1fr; column-gap: 3mm; row-gap: .5mm; padding: 3.5mm 4mm; border-radius: 2.5mm; background: var(--fundo); }
.regras span { grid-row: span 2; font-size: 15pt; }
.regras strong { font-family: 'Montserrat'; color: var(--marinho); font-size: 10pt; }
.regras small { color: var(--suave); line-height: 1.4; font-size: 9pt; }

/* Passo 7 */
.certificado-lado { grid-template-columns: 1fr 1fr; }
.certificado-img { width: 72%; align-self: center; }
.onde { grid-template-columns: 62mm 1fr; }
.guarde { margin-top: auto; display: flex; gap: 5mm; align-items: center; padding: 5mm 6mm; border-radius: 3mm; background: var(--marinho); color: #dce7f0; }
.guarde > span { font-size: 20pt; }
.guarde h4 { color: #fff; font-size: 11pt; margin-bottom: 1mm; }
.guarde p { margin: 0; line-height: 1.5; }
.guarde strong { color: #fff; }

/* Reação */
.reacao-lado { grid-template-columns: 1fr 1fr; align-items: start; }
.tipos { list-style: none; margin: 0; padding: 0; display: grid; gap: 1.8mm; }
.tipos li { display: flex; align-items: center; gap: 3mm; }
.tipos b { min-width: 13mm; text-align: center; padding: .8mm 2mm; border-radius: 1.6mm; background: var(--marinho); color: #fff; font-family: 'Montserrat'; font-size: 8pt; }
.qr-passos { display: grid; grid-template-columns: 44mm 1fr 44mm; gap: 7mm; align-items: center; padding: 5mm 6mm; border-radius: 3mm; background: var(--fundo); }
.passos-qr { margin: 0; padding-left: 5mm; display: grid; gap: 2.5mm; line-height: 1.5; }
.passos-qr li::marker { color: var(--laranja); font-family: 'Montserrat'; font-weight: 800; }

/* Celular e dúvidas */
.celular-lado { grid-template-columns: 64mm 1fr; align-items: start; gap: 9mm; }
.faq { margin: 0; }
.faq dt { font-weight: 700; color: var(--marinho); margin-top: 2.6mm; }
.faq dd { margin: .6mm 0 0; color: var(--suave); line-height: 1.45; }

/* Contracapa */
.contracapa { background: var(--marinho); color: #dce7f0; padding: 0; }
.contra-texto { padding: 70mm 18mm 0; display: grid; gap: 8mm; justify-items: start; }
.contracapa h1 { color: #fff; font-size: 38pt; line-height: 1.1; font-weight: 800; }
.contra-texto p { margin: 0; font-size: 12.5pt; line-height: 1.6; padding-left: 4mm; border-left: 3px solid var(--laranja); max-width: 150mm; }
.contra-texto strong { color: #fff; }
.contra-endereco { padding: 3.5mm 6mm; border-radius: 3mm; border: 1px dashed var(--laranja-claro); }
.contra-endereco strong { font-family: 'Montserrat'; font-size: 14pt; color: #fff; }
`;

module.exports = { montarGuia };
