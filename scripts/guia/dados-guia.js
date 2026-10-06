// Conteúdo fictício usado só para os prints do guia de acesso (banco temporário, nunca o de produção).
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const FONTES = path.join(__dirname, '..', '..', 'assets', 'fontes');
const MARINHO = rgb(14 / 255, 59 / 255, 92 / 255);
const LARANJA = rgb(236 / 255, 107 / 255, 36 / 255);
const CINZA = rgb(95 / 255, 111 / 255, 124 / 255);

// Slides 16:9 no padrão visual da Âmbar.
async function slides(destino, tema, titulo, topicos) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const forte = await pdf.embedFont(fs.readFileSync(path.join(FONTES, 'montserrat-latin-800-normal.woff')));
  const texto = await pdf.embedFont(fs.readFileSync(path.join(FONTES, 'nunito-sans-latin-400-normal.woff')));
  const W = 960, H = 540;

  const capa = pdf.addPage([W, H]);
  capa.drawRectangle({ x: 0, y: 0, width: W, height: H, color: MARINHO });
  capa.drawRectangle({ x: 70, y: 300, width: 70, height: 6, color: LARANJA });
  capa.drawText(tema.toUpperCase(), { x: 70, y: 330, size: 16, font: forte, color: rgb(0.95, 0.6, 0.29) });
  capa.drawText(titulo, { x: 70, y: 240, size: 40, font: forte, color: rgb(1, 1, 1), maxWidth: 800 });
  capa.drawText('Trilha de Desenvolvimento · DHO', { x: 70, y: 190, size: 18, font: texto, color: rgb(0.8, 0.86, 0.91) });
  capa.drawCircle({ x: 880, y: 40, size: 160, color: LARANJA, opacity: 0.9 });

  topicos.forEach((t, i) => {
    const p = pdf.addPage([W, H]);
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) });
    p.drawRectangle({ x: 0, y: H - 90, width: W, height: 90, color: MARINHO });
    p.drawText(titulo, { x: 60, y: H - 58, size: 24, font: forte, color: rgb(1, 1, 1) });
    p.drawRectangle({ x: 60, y: 360, width: 50, height: 5, color: LARANJA });
    p.drawText(t, { x: 60, y: 310, size: 30, font: forte, color: MARINHO, maxWidth: 840 });
    ['Conceitos principais do tema', 'Exemplos práticos do dia a dia', 'Como aplicar na sua equipe'].forEach((l, j) => {
      p.drawCircle({ x: 72, y: 246 - j * 46, size: 6, color: LARANJA });
      p.drawText(l, { x: 92, y: 238 - j * 46, size: 20, font: texto, color: CINZA });
    });
    p.drawText(`Âmbar Energia · ${i + 2}`, { x: 60, y: 30, size: 12, font: texto, color: CINZA });
  });
  fs.writeFileSync(destino, await pdf.save());
}

const COLABORADOR = ['12345678909', 'Maria Souza', 'Coordenadora de Operações', 'Cuiabá', 'Centro-Oeste'];

const TEMAS = [
  { titulo: 'Cultura e Valores', icone: '🧭', descricao: 'Quem somos, no que acreditamos e como agimos.',
    materiais: ['Nossa história', 'Missão, visão e valores'], avaliacao: 'final' },
  { titulo: 'Liderança e Gestão de Pessoas', icone: '👥', descricao: 'O papel do líder no desenvolvimento da equipe.',
    materiais: ['O papel do líder', 'Feedback e desenvolvimento'], avaliacao: 'final' },
  { titulo: 'Segurança do Trabalho', icone: '🦺', descricao: 'Uma avaliação para cada material do tema.',
    materiais: ['Ferramentas de segurança', 'A liderança na segurança'], avaliacao: 'por-material' },
  { titulo: 'Comunicação e Feedback', icone: '💬', descricao: 'Comunicação clara, escuta ativa e feedback.',
    materiais: ['Comunicação assertiva'], avaliacao: 'final' },
];

const QUESTOES = [
  ['Qual atitude fortalece a confiança da equipe?', ['Dar o exemplo no dia a dia', 'Evitar conversas difíceis', 'Centralizar todas as decisões'], 0],
  ['Um bom feedback deve ser…', ['Genérico e rápido', 'Específico, respeitoso e no momento certo', 'Dado apenas na avaliação anual'], 1],
  ['Desenvolver pessoas significa…', ['Delegar sem acompanhar', 'Apoiar o crescimento com orientação e oportunidades', 'Cobrar apenas resultados'], 1],
  ['Diante de um risco na operação, o líder deve…', ['Interromper e corrigir a situação', 'Esperar o fim do turno', 'Ignorar se não houve acidente'], 0],
  ['A cultura de uma empresa é formada principalmente…', ['Pelo logotipo', 'Pelos comportamentos do dia a dia', 'Pelo organograma'], 1],
];

async function popular(db, uploadDir) {
  db.prepare('INSERT OR REPLACE INTO colaboradores (cpf, nome, cargo, filial, regional, ativo) VALUES (?, ?, ?, ?, ?, 1)').run(...COLABORADOR);
  const ids = [];
  for (const [ordem, t] of TEMAS.entries()) {
    const moduloId = Number(db.prepare('INSERT INTO modulos (titulo, descricao, icone, ordem) VALUES (?, ?, ?, ?)')
      .run(t.titulo, t.descricao, t.icone, ordem + 1).lastInsertRowid);
    const aulas = [];
    for (const [i, nome] of t.materiais.entries()) {
      const arquivo = `guia-${moduloId}-${i}.pdf`;
      await slides(path.join(uploadDir, arquivo), t.titulo, nome, ['Por que este tema importa', 'Na prática', 'Para refletir']);
      aulas.push(Number(db.prepare('INSERT INTO aulas (modulo_id, titulo, arquivo, nome_original, ordem) VALUES (?, ?, ?, ?, ?)')
        .run(moduloId, nome, arquivo, `${nome}.pdf`, i + 1).lastInsertRowid));
    }
    const provas = [];
    const criarProva = (titulo, aulaId, ordemProva) => {
      const id = Number(db.prepare('INSERT INTO provas (modulo_id, aula_id, titulo, nota_minima, ordem) VALUES (?, ?, ?, 70, ?)')
        .run(moduloId, aulaId, titulo, ordemProva).lastInsertRowid);
      QUESTOES.forEach(([enunciado, alternativas, correta], j) => db.prepare('INSERT INTO questoes (prova_id, enunciado, alternativas, correta, ordem) VALUES (?, ?, ?, ?, ?)')
        .run(id, enunciado, JSON.stringify(alternativas), correta, j));
      provas.push(id);
    };
    if (t.avaliacao === 'final') criarProva(`Avaliação · ${t.titulo}`, null, 1);
    else aulas.forEach((a, i) => criarProva(`Avaliação · ${t.materiais[i]}`, a, i + 1));
    ids.push({ moduloId, aulas, provas });
  }
  return { cpf: COLABORADOR[0], temas: ids, corretas: QUESTOES.map(q => q[2]) };
}

module.exports = { popular };
