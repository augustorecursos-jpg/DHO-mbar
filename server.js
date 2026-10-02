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
// Regra da trilha: o certificado é emitido para quem atinge pelo menos 70% em uma avaliação.
const { NOTA_MINIMA } = require('./db');

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
  const certPorProva = new Map(db.prepare('SELECT * FROM certificados WHERE cpf = ?').all(cpf).map(c => [c.prova_id, c]));

  return modulos.map(m => {
    const aulas = db.prepare('SELECT id, titulo, ordem FROM aulas WHERE modulo_id = ? ORDER BY ordem, id').all(m.id)
      .map(a => ({ ...a, vista: vistas.has(a.id) }));
    const todasVistas = aulas.every(a => a.vista);
    const provas = db.prepare('SELECT id, aula_id, titulo, nota_minima FROM provas WHERE modulo_id = ? ORDER BY ordem, id').all(m.id).map(p => {
      const total = db.prepare('SELECT COUNT(*) AS n FROM questoes WHERE prova_id = ?').get(p.id).n;
      const melhor = db.prepare('SELECT MAX(nota) AS nota, COUNT(*) AS tentativas FROM tentativas WHERE cpf = ? AND prova_id = ?').get(cpf, p.id);
      const cert = certPorProva.get(p.id);
      return {
        ...p,
        questoes: total,
        melhor_nota: melhor.nota,
        tentativas: melhor.tentativas,
        liberada: p.aula_id ? vistas.has(p.aula_id) : todasVistas,
        certificado: cert ? { codigo: cert.codigo, nota: cert.nota, emitido_em: cert.emitido_em } : null,
      };
    });
    const aulasFeitas = aulas.filter(a => a.vista).length;
    const aprovadas = provas.filter(p => p.certificado).length;
    // Etapas do tema: cada material + cada avaliação (concluída quando aprovada).
    const etapas = aulas.length + provas.length;
    return {
      ...m,
      aulas,
      provas,
      aulas_feitas: aulasFeitas,
      provas_aprovadas: aprovadas,
      progresso: etapas ? Math.round(((aulasFeitas + aprovadas) / etapas) * 100) : 0,
      concluido: provas.length > 0 && aprovadas === provas.length,
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
  res.json({ modulos, provas, nota_minima: NOTA_MINIMA });
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
  db.prepare("UPDATE colaboradores SET acessos = acessos + 1, ultimo_acesso = datetime('now') WHERE cpf = ?").run(cpf);
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

// Material em PDF (colaborador logado ou RH). Exibido no visualizador da plataforma, que bloqueia
// impressão e captura; vai sem cache e sem nome de arquivo para download.
app.get('/api/aulas/:id/pdf', (req, res) => {
  const cookies = lerCookies(req);
  const s = verificar(cookies.sess_colab);
  const colaborador = s && db.prepare('SELECT 1 FROM colaboradores WHERE cpf = ? AND ativo = 1').get(s.cpf);
  if (!colaborador && !verificar(cookies.sess_admin)?.admin) return res.status(401).json({ erro: 'Sessão expirada. Entre novamente com seu CPF.' });
  const aula = db.prepare('SELECT * FROM aulas WHERE id = ?').get(Number(req.params.id));
  if (!aula) return res.status(404).json({ erro: 'Material não encontrado' });
  res.setHeader('Cache-Control', 'private, no-store');
  res.type('application/pdf');
  res.sendFile(path.join(UPLOAD_DIR, aula.arquivo));
});

app.post('/api/aulas/:id/concluir', exigirColaborador, (req, res) => {
  const aula = db.prepare('SELECT id FROM aulas WHERE id = ?').get(Number(req.params.id));
  if (!aula) return res.status(404).json({ erro: 'Aula não encontrada' });
  db.prepare('INSERT OR IGNORE INTO aulas_vistas (cpf, aula_id) VALUES (?, ?)').run(req.colab.cpf, aula.id);
  res.json({ ok: true });
});

/** Avaliação ligada a um material: libera após esse material. Sem material: após todos os materiais do tema. */
function provaLiberada(cpf, prova) {
  if (prova.aula_id) {
    return Boolean(db.prepare('SELECT 1 FROM aulas_vistas WHERE cpf = ? AND aula_id = ?').get(cpf, prova.aula_id));
  }
  const pendentes = db.prepare(`
    SELECT COUNT(*) AS n FROM aulas a
    WHERE a.modulo_id = ? AND NOT EXISTS (SELECT 1 FROM aulas_vistas v WHERE v.aula_id = a.id AND v.cpf = ?)`).get(prova.modulo_id, cpf).n;
  return pendentes === 0;
}

function mensagemBloqueio(prova) {
  return prova.aula_id
    ? 'Conclua o material desta avaliação para liberá-la.'
    : 'Conclua todos os materiais do tema para liberar a avaliação.';
}

// Entrega a avaliação SEM o gabarito.
app.get('/api/provas/:id', exigirColaborador, (req, res) => {
  const prova = db.prepare('SELECT * FROM provas WHERE id = ?').get(Number(req.params.id));
  if (!prova) return res.status(404).json({ erro: 'Avaliação não encontrada' });
  if (!provaLiberada(req.colab.cpf, prova)) return res.status(403).json({ erro: mensagemBloqueio(prova) });
  const questoes = db.prepare('SELECT id, enunciado, alternativas FROM questoes WHERE prova_id = ? ORDER BY ordem, id').all(prova.id)
    .map(q => ({ id: q.id, enunciado: q.enunciado, alternativas: JSON.parse(q.alternativas) }));
  res.json({ id: prova.id, titulo: prova.titulo, nota_minima: NOTA_MINIMA, questoes });
});

// Correção feita no servidor, comparando com o gabarito.
app.post('/api/provas/:id/responder', exigirColaborador, (req, res) => {
  const prova = db.prepare('SELECT * FROM provas WHERE id = ?').get(Number(req.params.id));
  if (!prova) return res.status(404).json({ erro: 'Avaliação não encontrada' });
  if (!provaLiberada(req.colab.cpf, prova)) return res.status(403).json({ erro: mensagemBloqueio(prova) });
  const questoes = db.prepare('SELECT id, correta FROM questoes WHERE prova_id = ?').all(prova.id);
  if (!questoes.length) return res.status(400).json({ erro: 'Avaliação sem questões cadastradas.' });

  const respostas = req.body?.respostas || {};
  const acertos = questoes.filter(q => Number(respostas[q.id]) === q.correta).length;
  const nota = Math.round((acertos / questoes.length) * 1000) / 10;
  const aprovado = nota >= NOTA_MINIMA;

  db.prepare('INSERT INTO tentativas (cpf, prova_id, nota, acertos, total, aprovado, respostas) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.colab.cpf, prova.id, nota, acertos, questoes.length, aprovado ? 1 : 0, JSON.stringify(respostas));

  const buscar = () => db.prepare('SELECT * FROM certificados WHERE cpf = ? AND prova_id = ?').get(req.colab.cpf, prova.id);
  let certificado = buscar();
  if (aprovado) {
    if (!certificado) {
      const codigo = crypto.randomBytes(5).toString('hex').toUpperCase();
      db.prepare('INSERT INTO certificados (codigo, cpf, modulo_id, prova_id, nota) VALUES (?, ?, ?, ?, ?)')
        .run(codigo, req.colab.cpf, prova.modulo_id, prova.id, nota);
    } else if (nota > certificado.nota) {
      db.prepare('UPDATE certificados SET nota = ? WHERE codigo = ?').run(nota, certificado.codigo);
    }
    certificado = buscar();
  }
  res.json({ nota, acertos, total: questoes.length, aprovado, nota_minima: NOTA_MINIMA, certificado: certificado?.codigo || null });
});

app.get('/api/certificados/:codigo.pdf', exigirColaborador, async (req, res) => {
  const cert = db.prepare(`
    SELECT c.*, m.titulo AS modulo, p.titulo AS avaliacao
    FROM certificados c JOIN modulos m ON m.id = c.modulo_id LEFT JOIN provas p ON p.id = c.prova_id
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
    SELECT c.codigo, c.nota, c.emitido_em, col.nome, m.titulo AS modulo, p.titulo AS avaliacao
    FROM certificados c JOIN colaboradores col ON col.cpf = c.cpf JOIN modulos m ON m.id = c.modulo_id
    LEFT JOIN provas p ON p.id = c.prova_id
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
    const provas = db.prepare('SELECT * FROM provas WHERE modulo_id = ? ORDER BY ordem, id').all(m.id).map(p => ({
      ...p,
      questoes: db.prepare('SELECT * FROM questoes WHERE prova_id = ? ORDER BY ordem, id').all(p.id)
        .map(q => ({ enunciado: q.enunciado, alternativas: JSON.parse(q.alternativas), correta: q.correta })),
    }));
    return { ...m, aulas, provas };
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

// -- Avaliações + gabarito (várias por tema; salvar substitui as questões daquela avaliação) --

/** Valida o corpo enviado pelo editor e devolve os campos normalizados, ou uma mensagem de erro. */
function lerAvaliacao(body, moduloId) {
  const { titulo, questoes } = body || {};
  if (!String(titulo || '').trim()) return { erro: 'Informe o título da avaliação.' };
  if (!Array.isArray(questoes) || !questoes.length) return { erro: 'Cadastre ao menos uma questão.' };
  for (const [i, q] of questoes.entries()) {
    const alts = (q.alternativas || []).map(a => String(a).trim());
    if (!String(q.enunciado || '').trim() || alts.length < 2 || alts.some(a => !a)) {
      return { erro: `Questão ${i + 1}: preencha o enunciado e ao menos 2 alternativas.` };
    }
    if (!(Number.isInteger(q.correta) && q.correta >= 0 && q.correta < alts.length)) {
      return { erro: `Questão ${i + 1}: marque a alternativa correta (gabarito).` };
    }
  }
  const aulaId = body.aula_id ? Number(body.aula_id) : null;
  if (aulaId && !db.prepare('SELECT 1 FROM aulas WHERE id = ? AND modulo_id = ?').get(aulaId, moduloId)) {
    return { erro: 'O material escolhido não pertence a este tema.' };
  }
  return {
    titulo: String(titulo).trim(),
    nota_minima: NOTA_MINIMA,
    aula_id: aulaId,
    questoes,
  };
}

function salvarQuestoes(provaId, questoes) {
  db.prepare('DELETE FROM questoes WHERE prova_id = ?').run(provaId);
  const ins = db.prepare('INSERT INTO questoes (prova_id, enunciado, alternativas, correta, ordem) VALUES (?, ?, ?, ?, ?)');
  questoes.forEach((q, i) => ins.run(provaId, q.enunciado.trim(), JSON.stringify(q.alternativas.map(a => String(a).trim())), q.correta, i));
}

function emTransacao(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

app.post('/api/admin/modulos/:id/provas', exigirAdmin, (req, res) => {
  const moduloId = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM modulos WHERE id = ?').get(moduloId)) return res.status(404).json({ erro: 'Tema não encontrado' });
  const av = lerAvaliacao(req.body, moduloId);
  if (av.erro) return res.status(400).json({ erro: av.erro });
  const id = emTransacao(() => {
    const ordem = db.prepare('SELECT COALESCE(MAX(ordem), 0) + 1 AS o FROM provas WHERE modulo_id = ?').get(moduloId).o;
    const r = db.prepare('INSERT INTO provas (modulo_id, aula_id, titulo, nota_minima, ordem) VALUES (?, ?, ?, ?, ?)')
      .run(moduloId, av.aula_id, av.titulo, av.nota_minima, ordem);
    const provaId = Number(r.lastInsertRowid);
    salvarQuestoes(provaId, av.questoes);
    return provaId;
  });
  res.json({ id });
});

app.put('/api/admin/provas/:id', exigirAdmin, (req, res) => {
  const prova = db.prepare('SELECT * FROM provas WHERE id = ?').get(Number(req.params.id));
  if (!prova) return res.status(404).json({ erro: 'Avaliação não encontrada' });
  const av = lerAvaliacao(req.body, prova.modulo_id);
  if (av.erro) return res.status(400).json({ erro: av.erro });
  emTransacao(() => {
    db.prepare('UPDATE provas SET titulo = ?, nota_minima = ?, aula_id = ? WHERE id = ?').run(av.titulo, av.nota_minima, av.aula_id, prova.id);
    salvarQuestoes(prova.id, av.questoes);
  });
  res.json({ ok: true });
});

app.delete('/api/admin/provas/:id', exigirAdmin, (req, res) => {
  db.prepare('DELETE FROM provas WHERE id = ?').run(Number(req.params.id));
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

// -- Indicadores (painel do RH) --

app.get('/api/admin/indicadores', exigirAdmin, (req, res) => {
  const regional = String(req.query.regional || '');
  const filial = String(req.query.filial || '');
  const todos = db.prepare('SELECT cpf, nome, cargo, filial, regional, acessos, ultimo_acesso FROM colaboradores WHERE ativo = 1').all();
  const colabs = todos.filter(c => (!regional || c.regional === regional) && (!filial || c.filial === filial));
  const noFiltro = new Set(colabs.map(c => c.cpf));
  const doFiltro = (rows) => rows.filter(r => noFiltro.has(r.cpf));

  const modulos = db.prepare('SELECT id, titulo, icone FROM modulos ORDER BY ordem, id').all();
  const aulas = db.prepare('SELECT id, modulo_id FROM aulas').all();
  const provas = db.prepare('SELECT p.id, p.modulo_id, p.titulo, m.titulo AS tema FROM provas p JOIN modulos m ON m.id = p.modulo_id ORDER BY m.ordem, p.ordem, p.id').all();
  const vistas = doFiltro(db.prepare('SELECT cpf, aula_id FROM aulas_vistas').all());
  const melhores = doFiltro(db.prepare('SELECT cpf, prova_id, MAX(nota) AS melhor, COUNT(*) AS tentativas FROM tentativas GROUP BY cpf, prova_id').all());
  const certs = doFiltro(db.prepare('SELECT cpf, prova_id, modulo_id, emitido_em FROM certificados').all());

  const chave = (a, b) => `${a}|${b}`;
  const vistoSet = new Set(vistas.map(v => chave(v.cpf, v.aula_id)));
  const certSet = new Set(certs.map(c => chave(c.cpf, c.prova_id)));
  const ativosComAtividade = new Set([...vistas.map(v => v.cpf), ...melhores.map(m => m.cpf)]);
  const acessou = (c) => c.acessos > 0 || ativosComAtividade.has(c.cpf);

  // Tema concluído: aprovado em todas as avaliações (ou, sem avaliação, todos os materiais vistos).
  const temasComConteudo = modulos.map(m => ({
    ...m,
    aulas: aulas.filter(a => a.modulo_id === m.id).map(a => a.id),
    provas: provas.filter(p => p.modulo_id === m.id).map(p => p.id),
  })).filter(m => m.aulas.length || m.provas.length);
  const concluiuTema = (cpf, m) => m.provas.length
    ? m.provas.every(p => certSet.has(chave(cpf, p)))
    : m.aulas.every(a => vistoSet.has(chave(cpf, a)));
  const iniciouTema = (cpf, m) => m.aulas.some(a => vistoSet.has(chave(cpf, a))) || melhores.some(x => x.cpf === cpf && m.provas.includes(x.prova_id));
  const concluiuTrilha = (cpf) => temasComConteudo.length > 0 && temasComConteudo.every(m => concluiuTema(cpf, m));

  const media = (xs) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);
  const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

  const ativos = colabs.length;
  const acessaram = colabs.filter(acessou).length;
  const concluiram = colabs.filter(c => concluiuTrilha(c.cpf)).length;
  const resumo = {
    ativos,
    acessaram, pct_acessaram: pct(acessaram, ativos),
    concluiram, pct_concluiram: pct(concluiram, ativos),
    certificados: certs.length,
    nota_media: media(melhores.map(m => m.melhor)),
    tentativas_realizadas: melhores.length,
    aprovacao: pct(melhores.filter(m => m.melhor >= NOTA_MINIMA).length, melhores.length),
    materiais_vistos: vistas.length,
    total_materiais: aulas.length,
  };

  const porTema = temasComConteudo.map(m => {
    const iniciaram = colabs.filter(c => iniciouTema(c.cpf, m)).length;
    const conc = colabs.filter(c => concluiuTema(c.cpf, m)).length;
    const notas = melhores.filter(x => m.provas.includes(x.prova_id)).map(x => x.melhor);
    return { id: m.id, titulo: m.titulo, icone: m.icone, iniciaram, concluiram: conc, pct_conclusao: pct(conc, ativos), nota_media: media(notas) };
  });

  const porAvaliacao = provas.map(p => {
    const daProva = melhores.filter(x => x.prova_id === p.id);
    const aprovados = daProva.filter(x => x.melhor >= NOTA_MINIMA).length;
    return {
      titulo: p.titulo, tema: p.tema, fizeram: daProva.length, aprovados,
      aprovacao: pct(aprovados, daProva.length), nota_media: media(daProva.map(x => x.melhor)),
      tentativas_media: media(daProva.map(x => x.tentativas)),
    };
  });

  const agrupar = (campo) => {
    const grupos = new Map();
    for (const c of colabs) {
      const k = c[campo] || '(sem informação)';
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(c);
    }
    return [...grupos.entries()].map(([nome, lista]) => {
      const conc = lista.filter(c => concluiuTrilha(c.cpf)).length;
      const cpfs = new Set(lista.map(c => c.cpf));
      return {
        nome, ativos: lista.length, acessaram: lista.filter(acessou).length, concluiram: conc,
        pct_conclusao: pct(conc, lista.length), certificados: certs.filter(x => cpfs.has(x.cpf)).length,
        nota_media: media(melhores.filter(x => cpfs.has(x.cpf)).map(x => x.melhor)),
      };
    }).sort((a, b) => b.pct_conclusao - a.pct_conclusao || b.ativos - a.ativos);
  };

  // Certificados emitidos por semana (12 últimas semanas, semana começando na segunda-feira)
  const inicioSemana = (d) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x; };
  const atual = inicioSemana(new Date());
  const semanas = Array.from({ length: 12 }, (_, i) => { const d = new Date(atual); d.setUTCDate(d.getUTCDate() - 7 * (11 - i)); return { inicio: d.toISOString().slice(0, 10), certificados: 0 }; });
  for (const c of certs) {
    const ini = inicioSemana(new Date(c.emitido_em.replace(' ', 'T') + 'Z')).toISOString().slice(0, 10);
    const s = semanas.find(x => x.inicio === ini);
    if (s) s.certificados += 1;
  }

  res.json({
    filtros: {
      regionais: [...new Set(todos.map(c => c.regional).filter(Boolean))].sort(),
      filiais: [...new Set(todos.filter(c => !regional || c.regional === regional).map(c => c.filial).filter(Boolean))].sort(),
    },
    nota_minima: NOTA_MINIMA, resumo, por_tema: porTema, por_avaliacao: porAvaliacao,
    por_regional: agrupar('regional'), por_filial: agrupar('filial'), semanas,
  });
});

// -- Backup do banco (colaboradores, temas, avaliações, notas e certificados) --

app.get('/api/admin/backup', exigirAdmin, (_req, res) => {
  const arquivo = path.join(DATA_DIR, `backup-${Date.now()}.db`);
  db.exec(`VACUUM INTO '${arquivo.replace(/'/g, "''")}'`);
  res.download(arquivo, `trilha-backup-${new Date().toISOString().slice(0, 10)}.db`, () => fs.rm(arquivo, { force: true }, () => {}));
});

// ---------- estáticos e erros ----------

app.use('/vendor/pdfjs', express.static(path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'build')));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 400).json({ erro: err.message || 'Erro inesperado' });
});

app.listen(PORT, () => console.log(`Trilha DHO rodando em http://localhost:${PORT}`));
