// Geração do certificado em PDF (A4 paisagem) com pdf-lib.
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

// Cores oficiais do template institucional
const MARINHO = rgb(0.055, 0.231, 0.361);   // #0e3b5c
const MARINHO_2 = rgb(0.086, 0.302, 0.455); // #164d74
const LARANJA = rgb(0.925, 0.42, 0.141);    // #ec6b24
const GRAFITE = rgb(0.114, 0.169, 0.212);
const CINZA = rgb(0.373, 0.435, 0.486);

// As fontes padrão do PDF só codificam WinAnsi (Latin-1 + alguns símbolos); remove o resto (ex.: emojis).
const limpar = (t) => String(t ?? '').replace(/[^\x20-\xFF–—‘’“”•…€]/g, '').trim();

function dataPorExtenso(iso) {
  const d = iso ? new Date(iso.replace(' ', 'T') + 'Z') : new Date();
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
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
  const page = pdf.addPage([842, 595]);
  const { width, height } = page.getSize();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italico = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const centro = (texto, y, font, size, color = GRAFITE) => {
    const t = limpar(texto);
    let s = size;
    while (font.widthOfTextAtSize(t, s) > width - 140 && s > 10) s -= 1;
    page.drawText(t, { x: (width - font.widthOfTextAtSize(t, s)) / 2, y, size: s, font, color });
  };

  // Fundo e ondas do template (drawSvgPath usa y para baixo a partir do ponto x/y informado)
  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });
  page.drawSvgPath('M0 0H250C170 8 70 40 0 110Z', { x: 0, y: height, color: MARINHO });
  page.drawSvgPath('M0 126C60 50 160 12 270 0', { x: 0, y: height, borderColor: LARANJA, borderWidth: 2.5 });
  page.drawSvgPath('M300 0C210 6 150 80 30 120H60C170 90 230 22 300 16Z', { x: width - 300, y: 120, color: LARANJA });
  page.drawSvgPath('M300 16C230 22 170 90 60 120H300Z', { x: width - 300, y: 120, color: MARINHO_2 });
  page.drawRectangle({ x: 28, y: 28, width: width - 56, height: height - 56, borderColor: rgb(0.87, 0.9, 0.92), borderWidth: 1 });

  // Logotipo tipográfico
  page.drawText('Âmbar', { x: width - 150, y: height - 70, size: 28, font: regular, color: MARINHO });
  page.drawText('ENERGIA', { x: width - 148, y: height - 86, size: 10, font: negrito, color: LARANJA });

  centro('CERTIFICADO', height - 180, negrito, 40, MARINHO);
  centro('DE CONCLUSÃO', height - 206, regular, 14, LARANJA);
  centro('Certificamos que', height - 258, italico, 14, CINZA);
  centro(colaborador.nome.toUpperCase(), height - 300, negrito, 28, MARINHO);
  page.drawLine({ start: { x: width / 2 - 220, y: height - 312 }, end: { x: width / 2 + 220, y: height - 312 }, thickness: 1, color: LARANJA });

  const cargo = [colaborador.cargo, colaborador.filial].filter(Boolean).join(' · ');
  if (cargo) centro(cargo, height - 332, regular, 11, CINZA);
  // Com várias avaliações por tema, o destaque é o conteúdo avaliado; o tema aparece logo abaixo.
  const avaliado = tituloAvaliado(certificado);
  const nota = String(certificado.nota).replace('.', ',');
  centro('concluiu com aproveitamento', height - 366, regular, 14, GRAFITE);
  centro(avaliado, height - 394, negrito, 20, MARINHO);
  if (avaliado !== certificado.modulo) centro(`Tema: ${certificado.modulo}`, height - 414, regular, 11, CINZA);
  centro(`da Trilha de Desenvolvimento Âmbar, com nota ${nota}% na avaliação.`, height - 438, regular, 13, GRAFITE);

  // Rodapé: data, assinatura e código
  const yBase = 100;
  page.drawText(dataPorExtenso(certificado.emitido_em), { x: 90, y: yBase + 8, size: 12, font: regular, color: GRAFITE });
  page.drawLine({ start: { x: 80, y: yBase }, end: { x: 300, y: yBase }, thickness: 0.8, color: CINZA });
  page.drawText('Data de emissão', { x: 90, y: yBase - 16, size: 9, font: regular, color: CINZA });

  // Assinatura no centro-direita, fora da onda do canto inferior direito
  const xa = 340;
  page.drawLine({ start: { x: xa, y: yBase }, end: { x: xa + 220, y: yBase }, thickness: 0.8, color: CINZA });
  page.drawText('Desenvolvimento Humano e Organizacional', { x: xa + 8, y: yBase - 16, size: 9, font: negrito, color: GRAFITE });
  page.drawText('RH · Âmbar Energia', { x: xa + 8, y: yBase - 29, size: 9, font: regular, color: CINZA });

  page.drawText(`Código de autenticidade: ${certificado.codigo}`, { x: 80, y: 44, size: 8, font: regular, color: CINZA });

  return pdf.save();
}

module.exports = { gerarCertificado };
