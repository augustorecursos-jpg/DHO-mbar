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

CREATE TABLE IF NOT EXISTS provas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  modulo_id  INTEGER NOT NULL UNIQUE REFERENCES modulos(id) ON DELETE CASCADE,
  titulo     TEXT NOT NULL,
  nota_minima INTEGER NOT NULL DEFAULT 75
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

CREATE TABLE IF NOT EXISTS certificados (
  codigo    TEXT PRIMARY KEY,
  cpf       TEXT NOT NULL REFERENCES colaboradores(cpf) ON DELETE CASCADE,
  modulo_id INTEGER NOT NULL REFERENCES modulos(id) ON DELETE CASCADE,
  nota      REAL NOT NULL,
  emitido_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (cpf, modulo_id)
);
`);

module.exports = { db, DATA_DIR, UPLOAD_DIR };
