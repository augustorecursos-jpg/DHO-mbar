// Banco de dados SQLite (módulo nativo node:sqlite, sem dependências nativas).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

// Nota mínima para emissão do certificado (regra única da trilha).
const NOTA_MINIMA = 70;

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'trilha.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS colaboradores (
  cpf        TEXT PRIMARY KEY,
  nome       TEXT NOT NULL,
  cargo      TEXT,
  filial     TEXT,
  regional   TEXT,
  ativo      INTEGER NOT NULL DEFAULT 1,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS modulos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo    TEXT NOT NULL,
  descricao TEXT,
  icone     TEXT DEFAULT '⚡',
  ordem     INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS aulas (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  modulo_id INTEGER NOT NULL REFERENCES modulos(id) ON DELETE CASCADE,
  titulo    TEXT NOT NULL,
  arquivo   TEXT NOT NULL,
  nome_original TEXT,
  ordem     INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Várias avaliações por tema; cada uma pode ser liberada após um material específico (aula_id)
-- ou, se aula_id for nulo, após todos os materiais do tema.
CREATE TABLE IF NOT EXISTS provas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  modulo_id  INTEGER NOT NULL REFERENCES modulos(id) ON DELETE CASCADE,
  aula_id    INTEGER REFERENCES aulas(id) ON DELETE SET NULL,
  titulo     TEXT NOT NULL,
  nota_minima INTEGER NOT NULL DEFAULT 70,
  ordem      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS questoes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  prova_id    INTEGER NOT NULL REFERENCES provas(id) ON DELETE CASCADE,
  enunciado   TEXT NOT NULL,
  alternativas TEXT NOT NULL,          -- JSON: ["texto A", "texto B", ...]
  correta     INTEGER NOT NULL,        -- índice da alternativa correta (gabarito)
  ordem       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS aulas_vistas (
  cpf      TEXT NOT NULL REFERENCES colaboradores(cpf) ON DELETE CASCADE,
  aula_id  INTEGER NOT NULL REFERENCES aulas(id) ON DELETE CASCADE,
  visto_em TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (cpf, aula_id)
);

CREATE TABLE IF NOT EXISTS tentativas (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  cpf       TEXT NOT NULL REFERENCES colaboradores(cpf) ON DELETE CASCADE,
  prova_id  INTEGER NOT NULL REFERENCES provas(id) ON DELETE CASCADE,
  nota      REAL NOT NULL,
  acertos   INTEGER NOT NULL,
  total     INTEGER NOT NULL,
  aprovado  INTEGER NOT NULL,
  respostas TEXT NOT NULL,
  feito_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Um certificado por avaliação aprovada.
CREATE TABLE IF NOT EXISTS certificados (
  codigo    TEXT PRIMARY KEY,
  cpf       TEXT NOT NULL REFERENCES colaboradores(cpf) ON DELETE CASCADE,
  modulo_id INTEGER NOT NULL REFERENCES modulos(id) ON DELETE CASCADE,
  prova_id  INTEGER REFERENCES provas(id) ON DELETE CASCADE,
  nota      REAL NOT NULL,
  emitido_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (cpf, prova_id)
);
`);

migrarParaVariasAvaliacoes();
aplicarNotaMinima();
adicionarRegistroDeAcesso();
criarAvaliacaoDeReacao();

/**
 * Avaliação de reação: um formulário único (definido pelo RH) respondido uma vez por módulo.
 * O formulário começa com a seção "Conteúdo do módulo"; o RH pode editar e acrescentar seções.
 */
function criarAvaliacaoDeReacao() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS configuracoes (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reacoes (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      cpf       TEXT NOT NULL REFERENCES colaboradores(cpf) ON DELETE CASCADE,
      modulo_id INTEGER NOT NULL REFERENCES modulos(id) ON DELETE CASCADE,
      notas     TEXT NOT NULL,      -- JSON: [{ secao, criterio, nota }]
      comentario TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (cpf, modulo_id)
    );
  `);
  const padrao = {
    ativa: true,
    comentario: true,
    secoes: [{
      titulo: 'Conteúdo do módulo',
      criterios: [
        'Clareza do conteúdo apresentado',
        'Qualidade das informações apresentadas',
        'Organização e sequência lógica do conteúdo',
        'Profundidade adequada ao tema',
        'Relevância do conteúdo para minha atuação',
        'Equilíbrio entre teoria e prática',
        'Aplicabilidade do conteúdo à rotina de trabalho',
      ],
    }],
  };
  db.prepare('INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES (?, ?)').run('avaliacao_reacao', JSON.stringify(padrao));
}

/** Colunas para os indicadores de acesso (bases antigas ganham as colunas zeradas). */
function adicionarRegistroDeAcesso() {
  const colunas = db.prepare('PRAGMA table_info(colaboradores)').all().map(c => c.name);
  if (!colunas.includes('acessos')) db.exec('ALTER TABLE colaboradores ADD COLUMN acessos INTEGER NOT NULL DEFAULT 0');
  if (!colunas.includes('ultimo_acesso')) db.exec('ALTER TABLE colaboradores ADD COLUMN ultimo_acesso TEXT');
}

/**
 * Garante a regra de 70% em bases antigas: avaliações criadas com outra nota mínima passam a 70%
 * e quem já tinha alcançado 70% (mas tinha sido reprovado pela regra anterior) recebe o certificado.
 * Idempotente: nas próximas inicializações não encontra nada a fazer.
 */
function aplicarNotaMinima() {
  db.exec('BEGIN');
  try {
    const alteradas = db.prepare('UPDATE provas SET nota_minima = ? WHERE nota_minima <> ?').run(NOTA_MINIMA, NOTA_MINIMA).changes;
    const devidos = db.prepare(`
      SELECT t.cpf, t.prova_id, p.modulo_id, MAX(t.nota) AS nota, MIN(CASE WHEN t.nota >= ? THEN t.feito_em END) AS aprovado_em
      FROM tentativas t JOIN provas p ON p.id = t.prova_id
      JOIN colaboradores c ON c.cpf = t.cpf
      WHERE NOT EXISTS (SELECT 1 FROM certificados ce WHERE ce.cpf = t.cpf AND ce.prova_id = t.prova_id)
      GROUP BY t.cpf, t.prova_id HAVING MAX(t.nota) >= ?`).all(NOTA_MINIMA, NOTA_MINIMA);
    const ins = db.prepare('INSERT INTO certificados (codigo, cpf, modulo_id, prova_id, nota, emitido_em) VALUES (?, ?, ?, ?, ?, ?)');
    for (const d of devidos) ins.run(crypto.randomBytes(5).toString('hex').toUpperCase(), d.cpf, d.modulo_id, d.prova_id, d.nota, d.aprovado_em);
    db.prepare('UPDATE tentativas SET aprovado = 1 WHERE nota >= ? AND aprovado = 0').run(NOTA_MINIMA);
    db.exec('COMMIT');
    if (alteradas || devidos.length) {
      console.log(`[regra 70%] ${alteradas} avaliação(ões) ajustada(s); ${devidos.length} certificado(s) emitido(s) para notas já atingidas.`);
    }
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/**
 * Bancos criados antes da v0.2 tinham uma única avaliação por tema (provas.modulo_id UNIQUE)
 * e um certificado por tema. Recria as duas tabelas no formato novo preservando todos os dados
 * (avaliações, questões, tentativas e certificados). Antes, salva uma cópia do banco em DATA_DIR.
 */
function migrarParaVariasAvaliacoes() {
  const colunas = db.prepare('PRAGMA table_info(provas)').all().map(c => c.name);
  if (colunas.includes('aula_id')) return;

  const copia = path.join(DATA_DIR, `trilha-antes-v0.2-${Date.now()}.db`);
  db.exec(`VACUUM INTO '${copia.replace(/'/g, "''")}'`);
  console.log(`[migração] Cópia de segurança salva em ${copia}`);

  // Com as chaves estrangeiras ligadas, apagar a tabela antiga apagaria em cascata as questões.
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    db.exec(`
      CREATE TABLE provas_v2 (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        modulo_id  INTEGER NOT NULL REFERENCES modulos(id) ON DELETE CASCADE,
        aula_id    INTEGER REFERENCES aulas(id) ON DELETE SET NULL,
        titulo     TEXT NOT NULL,
        nota_minima INTEGER NOT NULL DEFAULT 75,
        ordem      INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO provas_v2 (id, modulo_id, aula_id, titulo, nota_minima, ordem)
        SELECT id, modulo_id, NULL, titulo, nota_minima, 0 FROM provas;
      DROP TABLE provas;
      ALTER TABLE provas_v2 RENAME TO provas;

      CREATE TABLE certificados_v2 (
        codigo    TEXT PRIMARY KEY,
        cpf       TEXT NOT NULL REFERENCES colaboradores(cpf) ON DELETE CASCADE,
        modulo_id INTEGER NOT NULL REFERENCES modulos(id) ON DELETE CASCADE,
        prova_id  INTEGER REFERENCES provas(id) ON DELETE CASCADE,
        nota      REAL NOT NULL,
        emitido_em TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (cpf, prova_id)
      );
      INSERT INTO certificados_v2 (codigo, cpf, modulo_id, prova_id, nota, emitido_em)
        SELECT c.codigo, c.cpf, c.modulo_id, (SELECT p.id FROM provas p WHERE p.modulo_id = c.modulo_id), c.nota, c.emitido_em
        FROM certificados c;
      DROP TABLE certificados;
      ALTER TABLE certificados_v2 RENAME TO certificados;
    `);
    const problemas = db.prepare('PRAGMA foreign_key_check').all();
    if (problemas.length) throw new Error(`Chaves inconsistentes após a migração: ${JSON.stringify(problemas)}`);
    db.exec('COMMIT');
    console.log('[migração] Banco atualizado para várias avaliações por tema.');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

module.exports = { db, DATA_DIR, UPLOAD_DIR, NOTA_MINIMA };
