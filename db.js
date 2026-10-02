// Banco de dados SQLite (módulo nativo node:sqlite, sem dependências nativas).
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

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
  nota_minima INTEGER NOT NULL DEFAULT 75,
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

module.exports = { db, DATA_DIR, UPLOAD_DIR };
