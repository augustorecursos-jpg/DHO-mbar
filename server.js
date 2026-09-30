// Trilha de Desenvolvimento · Âmbar Energia (DHO)
// Servidor HTTP: API do colaborador (acesso por CPF), API do admin (RH) e arquivos estáticos.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');
const { db, DATA_DIR, UPLOAD_DIR } = require('./db');
const { gerarCertificado } = require('./certificado');

const PORT = Number(process.env.PORT) || 3000;
const PRODUCAO = process.env.NODE_ENV === 'production';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (PRODUCAO ? null : 'ambar-dho');
const NOTA_MINIMA_PADRAO = 75;

// Segredo para assinar os cookies de sessão (persistido para sobreviver a reinícios).
const SECRET_FILE = path.join(DATA_DIR, '.session-secret');
const SESSION_SECRET = process.env.SESSION_SECRET || (() => {
  if (!fs.existsSync(SECRET_FILE)) fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString('hex'));
  return fs.readFileSync(SECRET_FILE, 'utf8');
})();

if (!ADMIN_PASSWORD) {
  console.error('[erro] Em produção é obrigatório definir ADMIN_PASSWORD (senha da área do RH).');
  process.exit(1);
}
if (!process.env.ADMIN_PASSWORD) {
  console.warn('[aviso] ADMIN_PASSWORD não definido — usando a senha padrão "ambar-dho". Defina antes de publicar.');
}

// ---------- utilitários ----------

/** Mantém só os dígitos e recoloca zeros à esquerda que o Excel costuma remover. */
function normalizarCpf(valor) {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  if (!digitos || digitos.length > 11) return null;
  return digitos.padStart(11, '0');
}

function assinar(payload) {
  const corpo = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(corpo).digest('base64url');
  return `${corpo}.${sig}`;
}

function verificar(token) {
  if (!token) return null;
  const [corpo, sig] = token.split('.');
  if (!corpo || !sig) return null;
  const esperado = crypto.createHmac('sha256', SESSION_SECRET).update(corpo).digest('base64url');
  if (sig.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado))) return null;
  const payload = JSON.parse(Buffer.from(corpo, 'base64url').toString());
  if (payload.exp < Date.now()) return null;
  return payload;
}

function lerCookies(req) {
  const out = {};
  for (const parte of (req.headers.cookie || '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0) out[parte.slice(0, i).trim()] = decodeURIComponent(parte.slice(i + 1).trim());
  }
  return out;
}

function definirSessao(res, nome, payload, horas) {
  const token = assinar({ ...payload, exp: Date.now() + horas * 3600e3 });
  res.cookie(nome, token, { httpOnly: true, sameSite: 'lax', maxAge: horas * 3600e3, secure: PRODUCAO });
}

function exigirColaborador(req, res, next) {
  const s = verificar(lerCookies(req).sess_colab);
  const colab = s && db.prepare('SELECT * FROM colaboradores WHERE cpf = ? AND ativo = 1').get(s.cpf);
  if (!colab) return res.status(401).json({ erro: 'Sessão expirada. Entre novamente com seu CPF.' });
  req.colab = colab;
  next();
}

function exigirAdmin(req, res, next) {
  const s = verificar(lerCookies(req).sess_admin);
  if (!s || !s.admin) return res.status(401).json({ erro: 'Acesso restrito ao RH.' });
  next();
}

function progressoDoColaborador(cpf) {
  const modulos = db.prepare('SELECT * FROM modulos ORDER BY ordem, id').all();
  const vistas = new Set(db.prepare('SELECT aula_id FROM aulas_vistas WHERE cpf = ?').all(cpf).map(r => r.aula_id));
  const certificados = db.prepare('SELECT * FROM certificados WHERE cpf = ?').all(cpf);
  const certPorModulo = new Map(certificados.map(c => [c.modulo_id, c]));

  return modulos.map(m => {
    const aulas = db.prepare('SELECT id, titulo, ordem FROM aulas WHERE modulo_id = ? ORDER BY ordem, id').all(m.id)
      .map(a => ({ ...a, vista: vistas.has(a.id) }));
    const prova = db.prepare('SELECT id, titulo, nota_minima FROM provas WHERE modulo_id = ?').get(m.id);
    let provaInfo = null;
    if (prova) {
      const total = db.prepare('SELECT COUNT(*) AS n FROM questoes WHERE prova_id = ?').get(prova.id).n;
      const melhor = db.prepare('SELECT MAX(nota) AS nota, COUNT(*) AS tentativas FROM tentativas WHERE cpf = ? AND prova_id = ?').get(cpf, prova.id);
      provaInfo = { ...prova, questoes: total, melhor_nota: melhor.nota, tentativas: melhor.tentativas };
    }
    const aulasFeitas = aulas.filter(a => a.vista).length;
    const cert = certPorModulo.get(m.id) || null;
    // Etapas do módulo: cada aula + a prova (se houver). A prova conta como concluída quando aprovada.
    const etapas = aulas.length + (provaInfo ? 1 : 0);
    const feitas = aulasFeitas + (cert ? 1 : 0);
    return {
      ...m,
      aulas,
      prova: provaInfo,
      aulas_feitas: aulasFeitas,
      progresso: etapas ? Math.round((feitas / etapas) * 100) : 0,
      certificado: cert ? { codigo: cert.codigo, nota: cert.nota, emitido_em: cert.emitido_em } : null,
    };
  });
}

/**
 * Limita tentativas de login com falha por IP (evita que alguém "chute" CPFs ou a senha do RH).
 * Só as falhas contam; o limite é folgado porque várias pessoas de uma mesma filial saem pelo mesmo IP.
 */
function limitadorDeFalhas({ maximo, janelaMin }) {
  const falhas = new Map();
  setInterval(() => {
    const agora = Date.now();
    for (const [ip, r] of falhas) if (r.expira < agora) falhas.delete(ip);
  }, 60e3).unref();
  return {
    bloqueado(req) {
      const r = falhas.get(req.ip);
      return Boolean(r && r.expira > Date.now() && r.n >= maximo);
    },
    registrar(req) {
      const agora = Date.now();
      const r = falhas.get(req.ip);
      if (!r || r.expira < agora) falhas.set(req.ip, { n: 1, expira: agora + janelaMin * 60e3 });
      else r.n += 1;
    },
  };
}
const limiteCpf = limitadorDeFalhas({ maximo: 30, janelaMin: 15 });
const limiteAdmin = limitadorDeFalhas({ maximo: 10, janelaMin: 15 });
const MSG_LIMITE = 'Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.';

// ---------- app ----------

const app = express();
app.disable('x-powered-by');
// Atrás do proxy HTTPS da hospedagem: usa o IP real do usuário e reconhece a conexão segura.
app.set('trust proxy', 1);
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (PRODUCAO) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  next();
});
app.use(express.json({ limit: '5mb' }));

app.get('/healthz', (_req, res) => {
  db.prepare('SELECT 1').get();
  res.json({ ok: true });
});

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, _file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.pdf`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname);
    cb(ok ? null : new Error('Envie apenas arquivos PDF.'), ok);
  },
});

// ===== Público =====

app.get('/api/publico/resumo', (_req, res) => {
  const modulos = db.prepare(`
    SELECT m.id, m.titulo, m.icone,
      (SELECT COUNT(*) FROM aulas a WHERE a.modulo_id = m.id) AS aulas
    FROM modulos m ORDER BY m.ordem, m.id`).all();
  const provas = db.prepare('SELECT COUNT(*) AS n FROM provas').get().n;
  res.json({ modulos, provas, nota_minima: NOTA_MINIMA_PADRAO });
});

// ===== Colaborador =====

app.post('/api/entrar', (req, res) => {
  if (limiteCpf.bloqueado(req)) return res.status(429).json({ erro: MSG_LIMITE });
  const cpf = normalizarCpf(req.body?.cpf);
  const colab = cpf && db.prepare('SELECT * FROM colaboradores WHERE cpf = ? AND ativo = 1').get(cpf);
  if (!colab) {
    limiteCpf.registrar(req);
    return res.status(403).json({ erro: 'Acesso negado. Procure o time de DHO.' });
  }
  definirSessao(res, 'sess_colab', { cpf }, 12);
  res.json({ ok: true, nome: colab.nome });
});

app.post('/api/sair', (_req, res) => {
  res.clearCookie('sess_colab');
  res.json({ ok: true });
});

app.get('/api/me', exigirColaborador, (req, res) => {
  const { cpf, nome, cargo, filial, regional } = req.colab;
  res.json({ colaborador: { cpf, nome, cargo, filial, regional }, modulos: progressoDoColaborador(cpf) });
});

app.get('/api/aulas/:id/pdf', (req, res) => {
  const cookies = lerCookies(req);
  const colab = verificar(cookies.sess_colab);
  const admin = verificar(cookies.sess_admin);
  if (!colab && !admin?.admin) return res.status(401).send('Não autorizado');
  const aula = db.prepare('SELECT * FROM aulas WHERE id = ?').get(Number(req.params.id));
  if (!aula) return res.status(404).send('Aula não encontrada');
  res.type('application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(aula.nome_original || 'aula.pdf')}"`);
  res.sendFile(path.join(UPLOAD_DIR, aula.arquivo));
});

app.post('/api/aulas/:id/concluir', exigirColaborador, (req, res) => {
  const aula = db.prepare('SELECT id FROM aulas WHERE id = ?').get(Number(req.params.id));
  if (!aula) return res.status(404).json({ erro: 'Aula não encontrada' });
  db.prepare('INSERT OR IGNORE INTO aulas_vistas (cpf, aula_id) VALUES (?, ?)').run(req.colab.cpf, aula.id);
  res.json({ ok: true });
});

function provaLiberada(cpf, moduloId) {
  const pendentes = db.prepare(`
    SELECT COUNT(*) AS n FROM aulas a
    WHERE a.modulo_id = ? AND NOT EXISTS (SELECT 1 FROM aulas_vistas v WHERE v.aula_id = a.id AND v.cpf = ?)`).get(moduloId, cpf).n;
  return pendentes === 0;
}

// Entrega a prova SEM o gabarito.
app.get('/api/provas/:id', exigirColaborador, (req, res) => {
  const prova = db.prepare('SELECT * FROM provas WHERE id = ?').get(Number(req.params.id));
  if (!prova) return res.status(404).json({ erro: 'Prova não encontrada' });
  if (!provaLiberada(req.colab.cpf, prova.modulo_id)) {
    return res.status(403).json({ erro: 'Conclua todas as aulas do módulo para liberar a prova.' });
  }
  const questoes = db.prepare('SELECT id, enunciado, alternativas FROM questoes WHERE prova_id = ? ORDER BY ordem, id').all(prova.id)
    .map(q => ({ id: q.id, enunciado: q.enunciado, alternativas: JSON.parse(q.alternativas) }));
  res.json({ id: prova.id, titulo: prova.titulo, nota_minima: prova.nota_minima, questoes });
});

// Correção feita no servidor, comparando com o gabarito.
app.post('/api/provas/:id/responder', exigirColaborador, (req, res) => {
  const prova = db.prepare('SELECT * FROM provas WHERE id = ?').get(Number(req.params.id));
  if (!prova) return res.status(404).json({ erro: 'Prova não encontrada' });
  if (!provaLiberada(req.colab.cpf, prova.modulo_id)) {
    return res.status(403).json({ erro: 'Conclua todas as aulas do módulo para liberar a prova.' });
  }
  const questoes = db.prepare('SELECT id, correta FROM questoes WHERE prova_id = ?').all(prova.id);
  if (!questoes.length) return res.status(400).json({ erro: 'Prova sem questões cadastradas.' });

  const respostas = req.body?.respostas || {};
  const acertos = questoes.filter(q => Number(respostas[q.id]) === q.correta).length;
  const nota = Math.round((acertos / questoes.length) * 1000) / 10;
  const aprovado = nota >= prova.nota_minima;

  db.prepare('INSERT INTO tentativas (cpf, prova_id, nota, acertos, total, aprovado, respostas) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.colab.cpf, prova.id, nota, acertos, questoes.length, aprovado ? 1 : 0, JSON.stringify(respostas));

  let certificado = db.prepare('SELECT * FROM certificados WHERE cpf = ? AND modulo_id = ?').get(req.colab.cpf, prova.modulo_id);
  if (aprovado) {
    if (!certificado) {
      const codigo = crypto.randomBytes(5).toString('hex').toUpperCase();
      db.prepare('INSERT INTO certificados (codigo, cpf, modulo_id, nota) VALUES (?, ?, ?, ?)').run(codigo, req.colab.cpf, prova.modulo_id, nota);
    } else if (nota > certificado.nota) {
      db.prepare('UPDATE certificados SET nota = ? WHERE codigo = ?').run(nota, certificado.codigo);
    }
    certificado = db.prepare('SELECT * FROM certificados WHERE cpf = ? AND modulo_id = ?').get(req.colab.cpf, prova.modulo_id);
  }
  res.json({ nota, acertos, total: questoes.length, aprovado, nota_minima: prova.nota_minima, certificado: certificado?.codigo || null });
});

app.get('/api/certificados/:codigo.pdf', exigirColaborador, async (req, res) => {
  const cert = db.prepare(`
    SELECT c.*, m.titulo AS modulo, (SELECT COUNT(*) FROM aulas a WHERE a.modulo_id = m.id) AS aulas
    FROM certificados c JOIN modulos m ON m.id = c.modulo_id
    WHERE c.codigo = ? AND c.cpf = ?`).get(req.params.codigo, req.colab.cpf);
  if (!cert) return res.status(404).json({ erro: 'Certificado não encontrado' });
  const pdf = await gerarCertificado({ colaborador: req.colab, certificado: cert });
  res.type('application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="certificado-${cert.codigo}.pdf"`);
  res.send(Buffer.from(pdf));
});

// Validação pública de autenticidade do certificado (código impresso no PDF).
app.get('/api/validar/:codigo', (req, res) => {
  const c = db.prepare(`
    SELECT c.codigo, c.nota, c.emitido_em, col.nome, m.titulo AS modulo
    FROM certificados c JOIN colaboradores col ON col.cpf = c.cpf JOIN modulos m ON m.id = c.modulo_id
    WHERE c.codigo = ?`).get(String(req.params.codigo).toUpperCase());
  if (!c) return res.status(404).json({ valido: false });
  res.json({ valido: true, ...c });
});

// ===== Admin (RH) =====

app.post('/api/admin/entrar', (req, res) => {
  if (limiteAdmin.bloqueado(req)) return res.status(429).json({ erro: MSG_LIMITE });
  const senha = String(req.body?.senha || '');
  const a = Buffer.from(senha), b = Buffer.from(ADMIN_PASSWORD);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    limiteAdmin.registrar(req);
    return res.status(401).json({ erro: 'Senha incorreta.' });
  }
  definirSessao(res, 'sess_admin', { admin: true }, 8);
  res.json({ ok: true });
});

app.post('/api/admin/sair', (_req, res) => {
  res.clearCookie('sess_admin');
  res.json({ ok: true });
});

app.get('/api/admin/sessao', exigirAdmin, (_req, res) => res.json({ ok: true }));

// -- Colaboradores --

app.get('/api/admin/colaboradores', exigirAdmin, (_req, res) => {
  res.json(db.prepare('SELECT * FROM colaboradores ORDER BY ativo DESC, nome').all());
});

// Recebe as linhas já lidas da planilha (CPF, NOME, CARGO, FILIAL, REGIONAL).
// modo "substituir": quem não estiver na planilha fica inativo (histórico é mantido).
app.post('/api/admin/colaboradores/importar', exigirAdmin, (req, res) => {
  const linhas = Array.isArray(req.body?.linhas) ? req.body.linhas : [];
  const substituir = req.body?.modo === 'substituir';
  const invalidas = [];
  const validos = [];
  linhas.forEach((l, i) => {
    const cpf = normalizarCpf(l.cpf);
    const nome = String(l.nome || '').trim();
    if (!cpf || !nome) invalidas.push({ linha: i + 2, cpf: l.cpf, motivo: !cpf ? 'CPF inválido' : 'Nome vazio' });
    else validos.push({ cpf, nome, cargo: String(l.cargo || '').trim(), filial: String(l.filial || '').trim(), regional: String(l.regional || '').trim() });
  });

  const upsert = db.prepare(`
    INSERT INTO colaboradores (cpf, nome, cargo, filial, regional, ativo) VALUES (?, ?, ?, ?, ?, 1)
    ON CONFLICT(cpf) DO UPDATE SET nome = excluded.nome, cargo = excluded.cargo, filial = excluded.filial,
      regional = excluded.regional, ativo = 1, atualizado_em = datetime('now')`);

  db.exec('BEGIN');
  try {
    if (substituir) db.exec('UPDATE colaboradores SET ativo = 0');
    for (const c of validos) upsert.run(c.cpf, c.nome, c.cargo, c.filial, c.regional);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  const ativos = db.prepare('SELECT COUNT(*) AS n FROM colaboradores WHERE ativo = 1').get().n;
  res.json({ importados: validos.length, invalidas, ativos });
});

app.patch('/api/admin/colaboradores/:cpf', exigirAdmin, (req, res) => {
  db.prepare('UPDATE colaboradores SET ativo = ? WHERE cpf = ?').run(req.body?.ativo ? 1 : 0, req.params.cpf);
  res.json({ ok: true });
});

// -- Módulos --

app.get('/api/admin/modulos', exigirAdmin, (_req, res) => {
  const modulos = db.prepare('SELECT * FROM modulos ORDER BY ordem, id').all().map(m => {
    const aulas = db.prepare('SELECT * FROM aulas WHERE modulo_id = ? ORDER BY ordem, id').all(m.id);
    const prova = db.prepare('SELECT * FROM provas WHERE modulo_id = ?').get(m.id);
    const questoes = prova
      ? db.prepare('SELECT * FROM questoes WHERE prova_id = ? ORDER BY ordem, id').all(prova.id)
        .map(q => ({ enunciado: q.enunciado, alternativas: JSON.parse(q.alternativas), correta: q.correta }))
      : [];
    return { ...m, aulas, prova: prova ? { ...prova, questoes } : null };
  });
  res.json(modulos);
});

app.post('/api/admin/modulos', exigirAdmin, (req, res) => {
  const { titulo, descricao, icone } = req.body || {};
  if (!titulo?.trim()) return res.status(400).json({ erro: 'Informe o título do módulo.' });
  const ordem = db.prepare('SELECT COALESCE(MAX(ordem), 0) + 1 AS o FROM modulos').get().o;
  const r = db.prepare('INSERT INTO modulos (titulo, descricao, icone, ordem) VALUES (?, ?, ?, ?)')
    .run(titulo.trim(), descricao || '', icone || '⚡', ordem);
  res.json({ id: Number(r.lastInsertRowid) });
});

app.put('/api/admin/modulos/:id', exigirAdmin, (req, res) => {
  const { titulo, descricao, icone, ordem } = req.body || {};
  db.prepare('UPDATE modulos SET titulo = COALESCE(?, titulo), descricao = COALESCE(?, descricao), icone = COALESCE(?, icone), ordem = COALESCE(?, ordem) WHERE id = ?')
    .run(titulo ?? null, descricao ?? null, icone ?? null, ordem ?? null, Number(req.params.id));
  res.json({ ok: true });
});

app.delete('/api/admin/modulos/:id', exigirAdmin, (req, res) => {
  const id = Number(req.params.id);
  for (const a of db.prepare('SELECT arquivo FROM aulas WHERE modulo_id = ?').all(id)) {
    fs.rm(path.join(UPLOAD_DIR, a.arquivo), { force: true }, () => {});
  }
  db.prepare('DELETE FROM modulos WHERE id = ?').run(id);
  res.json({ ok: true });
});

// -- Aulas (PDF) --

app.post('/api/admin/modulos/:id/aulas', exigirAdmin, upload.single('pdf'), (req, res) => {
  const moduloId = Number(req.params.id);
  if (!req.file) return res.status(400).json({ erro: 'Selecione um arquivo PDF.' });
  if (!db.prepare('SELECT 1 FROM modulos WHERE id = ?').get(moduloId)) {
    fs.rm(req.file.path, { force: true }, () => {});
    return res.status(404).json({ erro: 'Módulo não encontrado' });
  }
  const titulo = (req.body.titulo || '').trim() || req.file.originalname.replace(/\.pdf$/i, '');
  const ordem = db.prepare('SELECT COALESCE(MAX(ordem), 0) + 1 AS o FROM aulas WHERE modulo_id = ?').get(moduloId).o;
  db.prepare('INSERT INTO aulas (modulo_id, titulo, arquivo, nome_original, ordem) VALUES (?, ?, ?, ?, ?)')
    .run(moduloId, titulo, req.file.filename, req.file.originalname, ordem);
  res.json({ ok: true });
});

app.delete('/api/admin/aulas/:id', exigirAdmin, (req, res) => {
  const aula = db.prepare('SELECT * FROM aulas WHERE id = ?').get(Number(req.params.id));
  if (aula) {
    fs.rm(path.join(UPLOAD_DIR, aula.arquivo), { force: true }, () => {});
    db.prepare('DELETE FROM aulas WHERE id = ?').run(aula.id);
  }
  res.json({ ok: true });
});

// -- Prova + gabarito (uma por módulo; salvar substitui as questões) --

app.put('/api/admin/modulos/:id/prova', exigirAdmin, (req, res) => {
  const moduloId = Number(req.params.id);
  const { titulo, nota_minima, questoes } = req.body || {};
  if (!Array.isArray(questoes) || !questoes.length) return res.status(400).json({ erro: 'Cadastre ao menos uma questão.' });
  for (const [i, q] of questoes.entries()) {
    const alts = (q.alternativas || []).map(a => String(a).trim());
    if (!String(q.enunciado || '').trim() || alts.length < 2 || alts.some(a => !a)) {
      return res.status(400).json({ erro: `Questão ${i + 1}: preencha o enunciado e ao menos 2 alternativas.` });
    }
    if (!(Number.isInteger(q.correta) && q.correta >= 0 && q.correta < alts.length)) {
      return res.status(400).json({ erro: `Questão ${i + 1}: marque a alternativa correta (gabarito).` });
    }
  }
  db.exec('BEGIN');
  try {
    let prova = db.prepare('SELECT * FROM provas WHERE modulo_id = ?').get(moduloId);
    const minima = Math.min(100, Math.max(1, Number(nota_minima) || NOTA_MINIMA_PADRAO));
    if (prova) {
      db.prepare('UPDATE provas SET titulo = ?, nota_minima = ? WHERE id = ?').run(titulo || 'Prova do módulo', minima, prova.id);
      db.prepare('DELETE FROM questoes WHERE prova_id = ?').run(prova.id);
    } else {
      const r = db.prepare('INSERT INTO provas (modulo_id, titulo, nota_minima) VALUES (?, ?, ?)').run(moduloId, titulo || 'Prova do módulo', minima);
      prova = { id: Number(r.lastInsertRowid) };
    }
    const ins = db.prepare('INSERT INTO questoes (prova_id, enunciado, alternativas, correta, ordem) VALUES (?, ?, ?, ?, ?)');
    questoes.forEach((q, i) => ins.run(prova.id, q.enunciado.trim(), JSON.stringify(q.alternativas.map(a => String(a).trim())), q.correta, i));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  res.json({ ok: true });
});

app.delete('/api/admin/modulos/:id/prova', exigirAdmin, (req, res) => {
  db.prepare('DELETE FROM provas WHERE modulo_id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// -- Resultados --

app.get('/api/admin/resultados', exigirAdmin, (_req, res) => {
  const totalAulas = db.prepare('SELECT COUNT(*) AS n FROM aulas').get().n;
  const totalProvas = db.prepare('SELECT COUNT(*) AS n FROM provas').get().n;
  const linhas = db.prepare(`
    SELECT c.cpf, c.nome, c.cargo, c.filial, c.regional,
      (SELECT COUNT(*) FROM aulas_vistas v WHERE v.cpf = c.cpf) AS aulas_vistas,
      (SELECT COUNT(*) FROM certificados ce WHERE ce.cpf = c.cpf) AS certificados,
      (SELECT ROUND(AVG(t.melhor), 1) FROM (SELECT MAX(nota) AS melhor FROM tentativas WHERE cpf = c.cpf GROUP BY prova_id) t) AS media,
      (SELECT MAX(feito_em) FROM tentativas WHERE cpf = c.cpf) AS ultima_prova
    FROM colaboradores c WHERE c.ativo = 1 ORDER BY c.regional, c.filial, c.nome`).all();
  res.json({ total_aulas: totalAulas, total_provas: totalProvas, linhas });
});

// -- Backup do banco (colaboradores, temas, avaliações, notas e certificados) --

app.get('/api/admin/backup', exigirAdmin, (_req, res) => {
  const arquivo = path.join(DATA_DIR, `backup-${Date.now()}.db`);
  db.exec(`VACUUM INTO '${arquivo.replace(/'/g, "''")}'`);
  res.download(arquivo, `trilha-backup-${new Date().toISOString().slice(0, 10)}.db`, () => fs.rm(arquivo, { force: true }, () => {}));
});

// ---------- estáticos e erros ----------

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 400).json({ erro: err.message || 'Erro inesperado' });
});

app.listen(PORT, () => console.log(`Trilha DHO rodando em http://localhost:${PORT}`));
