// Geração do certificado em PDF (A4 paisagem) com pdf-lib.
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const AMBAR = rgb(0.96, 0.62, 0.04);
const AMBAR_ESCURO = rgb(0.72, 0.38, 0.02);
const GRAFITE = rgb(0.12, 0.1, 0.08);
const CINZA = rgb(0.42, 0.38, 0.34);

// As fontes padrão do PDF só codificam WinAnsi (Latin-1 + alguns símbolos); remove o resto (ex.: emojis).
const limpar = (t) => String(t ?? '').replace(/[^\x20-\xFF–—‘’“”•…€]/g, '').trim();

function dataPorExtenso(iso) {
  const d = iso ? new Date(iso.replace(' ', 'T') + 'Z') : new Date();
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
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

  // Moldura
  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 0.985, 0.955) });
  page.drawRectangle({ x: 24, y: 24, width: width - 48, height: height - 48, borderColor: AMBAR, borderWidth: 3 });
  page.drawRectangle({ x: 34, y: 34, width: width - 68, height: height - 68, borderColor: AMBAR_ESCURO, borderWidth: 0.6 });
  page.drawRectangle({ x: 24, y: height - 70, width: width - 48, height: 46, color: GRAFITE });
  page.drawText('ÂMBAR ENERGIA', { x: 50, y: height - 53, size: 14, font: negrito, color: AMBAR });
  const sub = 'TRILHA DE DESENVOLVIMENTO · DHO';
  page.drawText(sub, { x: width - 50 - regular.widthOfTextAtSize(sub, 10), y: height - 51, size: 10, font: regular, color: rgb(1, 1, 1) });

  // Raio decorativo
  page.drawSvgPath('M 13 2 L 3 14 L 12 14 L 11 22 L 21 10 L 12 10 Z', { x: width / 2 - 18, y: height - 92, scale: 1.5, color: AMBAR });

  centro('CERTIFICADO', height - 180, negrito, 40, GRAFITE);
  centro('DE CONCLUSÃO', height - 206, regular, 14, AMBAR_ESCURO);
  centro('Certificamos que', height - 258, italico, 14, CINZA);
  centro(colaborador.nome.toUpperCase(), height - 300, negrito, 28, GRAFITE);
  page.drawLine({ start: { x: width / 2 - 220, y: height - 312 }, end: { x: width / 2 + 220, y: height - 312 }, thickness: 1, color: AMBAR });

  const cargo = [colaborador.cargo, colaborador.filial].filter(Boolean).join(' · ');
  if (cargo) centro(cargo, height - 332, regular, 11, CINZA);
  centro('concluiu com aproveitamento o módulo', height - 368, regular, 14, GRAFITE);
  centro(certificado.modulo, height - 396, negrito, 20, AMBAR_ESCURO);
  centro(`da Trilha de Desenvolvimento Âmbar, com nota ${String(certificado.nota).replace('.', ',')}% na avaliação final.`, height - 422, regular, 13, GRAFITE);

  // Rodapé: data, assinatura e código
  const yBase = 92;
  page.drawText(dataPorExtenso(certificado.emitido_em), { x: 90, y: yBase + 8, size: 12, font: regular, color: GRAFITE });
  page.drawLine({ start: { x: 80, y: yBase }, end: { x: 300, y: yBase }, thickness: 0.8, color: CINZA });
  page.drawText('Data de emissão', { x: 90, y: yBase - 16, size: 9, font: regular, color: CINZA });

  page.drawLine({ start: { x: width - 320, y: yBase }, end: { x: width - 80, y: yBase }, thickness: 0.8, color: CINZA });
  page.drawText('Desenvolvimento Humano e Organizacional', { x: width - 312, y: yBase - 16, size: 9, font: negrito, color: GRAFITE });
  page.drawText('RH · Âmbar Energia', { x: width - 312, y: yBase - 29, size: 9, font: regular, color: CINZA });

  centro(`Código de autenticidade: ${certificado.codigo}`, 46, regular, 8, CINZA);

  return pdf.save();
}

module.exports = { gerarCertificado };
