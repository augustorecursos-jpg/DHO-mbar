// Popula o banco com dados de demonstração (colaboradores, 2 módulos, aulas em PDF e provas).
// Uso: npm run seed
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { db, UPLOAD_DIR } = require('../db');

async function pdfDemo(titulo, paginas) {
  const pdf = await PDFDocument.create();
  const fonte = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (let i = 1; i <= paginas; i++) {
    const p = pdf.addPage([960, 540]);
    p.drawRectangle({ x: 0, y: 0, width: 960, height: 540, color: rgb(0.07, 0.055, 0.04) });
    p.drawRectangle({ x: 0, y: 0, width: 960, height: 8, color: rgb(0.96, 0.62, 0.04) });
    p.drawText(titulo, { x: 60, y: 300, size: 40, font: fonte, color: rgb(1, 1, 1) });
    p.drawText(`Slide ${i} de ${paginas} · conteúdo de demonstração`, { x: 60, y: 250, size: 18, font: fonte, color: rgb(0.98, 0.75, 0.34) });
  }
  const nome = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
  fs.writeFileSync(path.join(UPLOAD_DIR, nome), await pdf.save());
  return nome;
}

(async () => {
  const colabs = [
    ['12345678909', 'Maria Souza', 'Coordenadora de Operações', 'Cuiabá', 'Centro-Oeste'],
    ['98765432100', 'João Pereira', 'Supervisor de Manutenção', 'Campo Grande', 'Centro-Oeste'],
    ['11144477735', 'Ana Lima', 'Analista de RH', 'São Paulo', 'Sudeste'],
  ];
  const up = db.prepare('INSERT OR REPLACE INTO colaboradores (cpf, nome, cargo, filial, regional, ativo) VALUES (?, ?, ?, ?, ?, 1)');
  colabs.forEach(c => up.run(...c));

  const modulos = [
    { titulo: 'Cultura e Valores', icone: '🧭', descricao: 'Quem somos, no que acreditamos e como agimos.', aulas: ['Nossa história', 'Missão, visão e valores'],
      questoes: [
        { enunciado: 'Qual valor deve orientar todas as nossas decisões em campo?', alternativas: ['Velocidade acima de tudo', 'Segurança em primeiro lugar', 'Redução de custos a qualquer preço'], correta: 1 },
        { enunciado: 'Um líder da Âmbar deve…', alternativas: ['Dar o exemplo', 'Delegar tudo', 'Evitar feedbacks'], correta: 0 },
        { enunciado: 'A cultura de uma empresa é formada principalmente…', alternativas: ['Pelo logotipo', 'Pelos comportamentos do dia a dia', 'Pelo organograma'], correta: 1 },
        { enunciado: 'Transparência significa…', alternativas: ['Compartilhar informações relevantes com clareza', 'Divulgar dados pessoais', 'Falar apenas o necessário'], correta: 0 },
      ] },
    { titulo: 'Admissão', icone: '📥', descricao: 'Processo de admissão e integração de novos colaboradores.', aulas: ['Fluxo de admissão'],
      questoes: [
        { enunciado: 'A integração do novo colaborador deve acontecer…', alternativas: ['No primeiro dia', 'Após 6 meses', 'Somente se ele pedir'], correta: 0 },
        { enunciado: 'Quem é o responsável por acolher o novo colaborador na equipe?', alternativas: ['Apenas o RH', 'O gestor direto, com apoio do RH', 'Ninguém'], correta: 1 },
      ] },
    { titulo: 'Segurança do Trabalho', icone: '🦺', descricao: 'Uma avaliação para cada material do tema.', aulas: ['Ferramentas de Segurança', 'Papel da Liderança na Segurança'],
      porMaterial: [
        [{ enunciado: 'Antes de iniciar uma atividade de risco, deve-se…', alternativas: ['Fazer a análise de risco', 'Começar logo', 'Pedir para outro fazer'], correta: 0 }],
        [{ enunciado: 'O líder é responsável pela segurança da equipe?', alternativas: ['Não, só o técnico de segurança', 'Sim, dando o exemplo e cobrando os procedimentos'], correta: 1 }],
      ] },
  ];
  for (const [ordem, m] of modulos.entries()) {
    if (db.prepare('SELECT 1 FROM modulos WHERE titulo = ?').get(m.titulo)) continue;
    const id = Number(db.prepare('INSERT INTO modulos (titulo, descricao, icone, ordem) VALUES (?, ?, ?, ?)').run(m.titulo, m.descricao, m.icone, ordem + 1).lastInsertRowid);
    const aulaIds = [];
    for (const [i, a] of m.aulas.entries()) {
      const arquivo = await pdfDemo(a, 4);
      aulaIds.push(Number(db.prepare('INSERT INTO aulas (modulo_id, titulo, arquivo, nome_original, ordem) VALUES (?, ?, ?, ?, ?)').run(id, a, arquivo, `${a}.pdf`, i + 1).lastInsertRowid));
    }
    if (m.porMaterial) {
      m.porMaterial.forEach((questoes, i) => {
        const provaId = Number(db.prepare('INSERT INTO provas (modulo_id, aula_id, titulo, nota_minima, ordem) VALUES (?, ?, ?, 70, ?)')
          .run(id, aulaIds[i], `Avaliação · ${m.aulas[i]}`, i + 1).lastInsertRowid);
        questoes.forEach((q, j) => db.prepare('INSERT INTO questoes (prova_id, enunciado, alternativas, correta, ordem) VALUES (?, ?, ?, ?, ?)')
          .run(provaId, q.enunciado, JSON.stringify(q.alternativas), q.correta, j));
      });
      continue;
    }
    const provaId = Number(db.prepare('INSERT INTO provas (modulo_id, titulo, nota_minima) VALUES (?, ?, 70)').run(id, `Avaliação · ${m.titulo}`).lastInsertRowid);
    m.questoes.forEach((q, i) => db.prepare('INSERT INTO questoes (prova_id, enunciado, alternativas, correta, ordem) VALUES (?, ?, ?, ?, ?)')
      .run(provaId, q.enunciado, JSON.stringify(q.alternativas), q.correta, i));
  }
  console.log('Dados de demonstração criados. CPFs de teste: 123.456.789-09, 987.654.321-00, 111.444.777-35');
})();
