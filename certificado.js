// Geração do certificado em PDF com pdf-lib.
// O fundo (assets/certificado-fundo.jpg) é a arte institucional — usina, selo, logo, molduras e rodapé —
// sem os textos variáveis; aqui escrevemos por cima o nome, a avaliação, o tema, a nota e a data.
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const FUNDO = fs.readFileSync(path.join(__dirname, 'assets', 'certificado-fundo.jpg'));

// A arte tem 1536 × 1024 px; a página mantém a proporção (3:2).
const LARGURA = 864, ALTURA = 576, ESCALA = LARGURA / 1536;
const px = (v) => v * ESCALA;              // medida da arte (px) → pontos do PDF
const linhaBase = (y) => ALTURA - px(y);   // coordenada y da arte (de cima) → PDF (de baixo)
const CENTRO = px(787);                    // eixo central da área de texto da arte

const MARINHO = rgb(0.075, 0.13, 0.23);
const LARANJA = rgb(0.91, 0.5, 0.12);
const CINZA = rgb(0.4, 0.43, 0.47);

// As fontes padrão do PDF só codificam WinAnsi (Latin-1 + alguns símbolos); remove o resto (ex.: emojis).
const codificavel = (t) => String(t ?? '').replace(/[^\x20-\xFF–—‘’“”•…€]/g, '');
const limpar = (t) => codificavel(t).trim();

function dataPorExtenso(iso) {
  const d = iso ? new Date(iso.replace(' ', 'T') + 'Z') : new Date();
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
}

/** "Avaliação · Tema - Assunto" → "Assunto" quando o título repete o nome do tema. */
function tituloAvaliado({ avaliacao, modulo }) {
  let t = String(avaliacao || '').replace(/^(avalia[cç][aã]o|prova)\s*[·:\-–]\s*/i, '').trim();
  if (!t) return modulo;
  if (t.toLowerCase().startsWith(String(modulo).toLowerCase())) {
    t = t.slice(modulo.length).replace(/^\s*[·:\-–]\s*/, '').trim() || modulo;
  }
  return t;
}

async function gerarCertificado({ colaborador, certificado }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Certificado - ${limpar(certificado.modulo)}`);
  const page = pdf.addPage([LARGURA, ALTURA]);
  page.drawImage(await pdf.embedJpg(FUNDO), { x: 0, y: 0, width: LARGURA, height: ALTURA });

  const fontes = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    negrito: await pdf.embedFont(StandardFonts.HelveticaBold),
    script: await pdf.embedFont(StandardFonts.TimesRomanBoldItalic),
  };

  /**
   * Escreve uma linha centralizada composta de trechos com fonte/cor próprias,
   * reduzindo o tamanho até caber na largura máxima.
   */
  const linha = (trechos, y, tamanho, larguraMax = px(840), espaco = 0) => {
    // Só remove caracteres não codificáveis; os espaços entre trechos precisam ser mantidos.
    const partes = trechos.map(([texto, fonte = 'regular', cor = MARINHO]) => ({ texto: codificavel(texto), fonte: fontes[fonte], cor }));
    const medir = (s) => partes.reduce((w, p) => w + p.fonte.widthOfTextAtSize(p.texto, s) + espaco * p.texto.length, 0);
    let s = tamanho;
    while (medir(s) > larguraMax && s > 7) s -= 0.5;
    let x = CENTRO - medir(s) / 2;
    for (const p of partes) {
      if (espaco) {
        for (const ch of p.texto) {
          page.drawText(ch, { x, y: linhaBase(y), size: s, font: p.fonte, color: p.cor });
          x += p.fonte.widthOfTextAtSize(ch, s) + espaco;
        }
      } else {
        page.drawText(p.texto, { x, y: linhaBase(y), size: s, font: p.fonte, color: p.cor });
        x += p.fonte.widthOfTextAtSize(p.texto, s);
      }
    }
  };

  const avaliado = tituloAvaliado(certificado);
  const nota = String(certificado.nota).replace('.', ',');

  linha([['DE CONCLUSÃO', 'negrito', LARANJA]], 293, 21, px(700), 2.6);
  linha([[colaborador.nome.toUpperCase(), 'negrito']], 424, 24, px(700));
  const cargo = [colaborador.cargo, colaborador.filial].filter(Boolean).join(' · ');
  if (cargo) linha([[cargo, 'regular', CINZA]], 466, 10.5, px(700));

  // O nome da avaliação ganha uma linha própria para caber mesmo quando é longo.
  linha([['concluiu com aproveitamento a avaliação']], 502, 12.5);
  linha([[avaliado, 'negrito']], 535, 14);
  linha([['do tema '], [certificado.modulo, 'negrito', LARANJA], [' da Trilha de Desenvolvimento Âmbar,']], 567, 12.5);
  linha([['com nota '], [`${nota}%`, 'negrito'], [', em '], [dataPorExtenso(certificado.emitido_em), 'negrito'], ['.']], 598, 12.5);

  linha([['Investir no desenvolvimento das pessoas é fortalecer nossa cultura']], 708, 12);
  linha([['e garantir que a pessoa certa esteja sempre no lugar certo.']], 739, 12);
  linha([['Parabéns pela sua conquista e compromisso com a excelência!', 'script', LARANJA]], 802, 17);

  linha([['Desenvolvimento Humano e Organizacional', 'negrito']], 893, 11.5);
  linha([['RH · Âmbar Energia', 'regular', CINZA]], 916, 10);

  page.drawText(`Código de autenticidade: ${certificado.codigo}`, {
    x: px(372), y: linhaBase(918), size: 7, font: fontes.regular, color: CINZA,
  });

  return pdf.save();
}

module.exports = { gerarCertificado };
