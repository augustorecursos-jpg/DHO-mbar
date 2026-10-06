// Entrevista de desligamento: formulário editável pelo RH, convites individuais (link, WhatsApp, e-mail e QR Code),
// link geral e respostas para os indicadores e a exportação em Excel.
const crypto = require('node:crypto');
const QRCode = require('qrcode');
const { db } = require('./db');

const CHAVE_FORM = 'entrevista_desligamento';
const TIPOS = ['unica', 'multipla', 'grade', 'texto', 'curto', 'data'];
const COM_OPCOES = ['unica', 'multipla', 'grade'];
const IDENTIFICACAO = ['nome', 'matricula', 'cargo', 'area', 'gestor', 'data_admissao', 'data_desligamento'];

const SATISFACAO = ['Excelente', 'Bom', 'Regular', 'Ruim'];
const FREQUENCIA = ['Sempre', 'Muitas vezes', 'Poucas vezes', 'Nunca'];
const SIM_NAO = ['Sim', 'Não'];

db.exec(`
  CREATE TABLE IF NOT EXISTS desligamento_convites (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    token         TEXT NOT NULL UNIQUE,
    nome          TEXT NOT NULL,
    matricula     TEXT,
    cargo         TEXT,
    area          TEXT,
    gestor        TEXT,
    data_admissao TEXT,
    data_desligamento TEXT,
    telefone      TEXT,
    email         TEXT,
    responsavel_rh TEXT,
    criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS desligamento_respostas (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    convite_id    INTEGER UNIQUE REFERENCES desligamento_convites(id) ON DELETE SET NULL,
    nome          TEXT NOT NULL,
    matricula     TEXT,
    cargo         TEXT,
    area          TEXT,
    gestor        TEXT,
    data_admissao TEXT,
    data_desligamento TEXT,
    responsavel_rh TEXT,
    recusou       INTEGER NOT NULL DEFAULT 0,  -- "Não tenho interesse em realizar a entrevista"
    alerta        INTEGER NOT NULL DEFAULT 0,  -- alguma resposta marcada como alerta (ex.: falar com Compliance)
    respostas     TEXT NOT NULL,               -- JSON: [{ id, secao, pergunta, tipo, valor, outro?, justificativa? }]
    criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

/** Formulário inicial, transcrito do PRESI-RH-0002 (Entrevista de Desligamento, revisão 01). */
function formularioPadrao() {
  const p = (id, tipo, texto, extra = {}) => ({ id, tipo, texto, obrigatoria: true, justificativa: false, outro: false, ...extra });
  return {
    ativa: true,
    titulo: 'Entrevista de Desligamento',
    introducao: 'Este formulário tem por objetivo colaborar na melhoria da Gestão de Pessoas. Todas as informações são de caráter confidencial, de uso exclusivo da área de Recursos Humanos.',
    assunto: 'Entrevista de desligamento · Âmbar Energia',
    mensagem: 'Olá, {nome}! Agradecemos por fazer parte da nossa história na Âmbar Energia. Gostaríamos muito de ouvir você na entrevista de desligamento: leva cerca de 10 minutos e as respostas são confidenciais, de uso exclusivo do RH.\n\nResponda pelo link: {link}',
    secoes: [
      { titulo: 'Motivo do desligamento', perguntas: [
        p('tipo_desligamento', 'unica', 'Motivo do desligamento', { opcoes: ['Iniciativa da empresa', 'Iniciativa do colaborador', 'Mútuo acordo', 'Justa causa'] }),
        p('motivos', 'multipla', 'Por favor, indique o(s) motivo(s) de sua saída', { outro: true, opcoes: [
          'Insatisfação com o salário', 'Reside longe da empresa', 'Outra proposta de trabalho', 'Insatisfação com as atividades',
          'Término do contrato', 'Problemas pessoais', 'Problemas com horário de trabalho', 'Problemas de relacionamento com a equipe',
          'Problemas de relacionamento com o gestor', 'Redução de quadro de pessoal', 'Mudança de cidade'] }),
      ] },
      { titulo: 'Satisfação', perguntas: [
        p('sat_empresa', 'unica', 'Qual o seu grau de satisfação em relação à empresa?', { opcoes: SATISFACAO, justificativa: true }),
        p('sat_atividades', 'unica', 'Qual o seu grau de satisfação em relação às atividades que você desenvolvia e à orientação que recebeu para realizá-las?', { opcoes: SATISFACAO, justificativa: true }),
        p('sat_gestor', 'unica', 'Qual o seu grau de satisfação em relação ao apoio e orientação que recebeu de seu gestor?', { opcoes: SATISFACAO, justificativa: true }),
        p('sat_equipe', 'unica', 'Qual o seu grau de satisfação em relação à sua equipe de trabalho?', { opcoes: SATISFACAO, justificativa: true }),
        p('sat_crescimento', 'unica', 'Qual o seu grau de satisfação referente às oportunidades de crescimento e desenvolvimento oferecidas pela empresa?', { opcoes: SATISFACAO, justificativa: true }),
      ] },
      { titulo: 'Liderança e ambiente de trabalho', perguntas: [
        p('lid_equipe', 'unica', 'Seu superior imediato estimulava o trabalho em equipe?', { opcoes: FREQUENCIA, justificativa: true }),
        p('lid_conversas', 'unica', 'Eram frequentes suas conversas com seu superior imediato sobre as diversas situações de trabalho?', { opcoes: FREQUENCIA, justificativa: true }),
        p('lid_confianca', 'unica', 'Existia relação de confiança entre seu superior imediato e você?', { opcoes: FREQUENCIA }),
        p('lid_reconhecimento', 'unica', 'Recebia reconhecimento quando fazia um bom trabalho?', { opcoes: FREQUENCIA, justificativa: true }),
        p('lid_expressar', 'unica', 'Podia expressar seus sentimentos honestamente, sem medo de ser punido depois?', { opcoes: FREQUENCIA, justificativa: true }),
        p('rel_colegas', 'unica', 'Você mantinha um bom relacionamento com seus colegas de trabalho?', { opcoes: FREQUENCIA, justificativa: true }),
        p('areas_apoio', 'grade', 'Qual o seu grau de satisfação com as áreas de apoio da empresa?', { opcoes: SATISFACAO, justificativa: true,
          itens: ['Recursos Humanos', 'Tecnologia da Informação', 'Jurídico', 'Financeiro'] }),
        p('lid_habilidade', 'unica', 'Seu superior imediato tinha habilidade em administrar, treinar e desenvolver pessoas?', { opcoes: SIM_NAO, justificativa: true }),
      ] },
      { titulo: 'Benefícios e remuneração', perguntas: [
        p('beneficios', 'grade', 'Qual o seu grau de satisfação em relação aos benefícios oferecidos pela empresa?', { opcoes: ['N/A', ...SATISFACAO], itens: [
          'Assistência médica', 'Assistência odontológica', 'Vale-alimentação', 'Vale-refeição', 'Vale-transporte', 'Restaurante',
          'Estacionamento', 'Remuneração', 'Seguro de vida', 'Previdência privada', 'Auxílio-creche', 'AVD – Avaliação de Desempenho'] }),
        p('feedback_avd', 'unica', 'Recebeu feedback sobre sua AVD?', { opcoes: ['Sim', 'Não', 'N/A'] }),
        p('comentarios_beneficios', 'texto', 'Comentários', { obrigatoria: false }),
      ] },
      { titulo: 'Cultura e valores', perguntas: [
        p('valores', 'multipla', 'Com quais valores da empresa você mais se identifica?', { opcoes: [
          'Atitude de dono', 'Disciplina', 'Simplicidade', 'Franqueza', 'Determinação', 'Disponibilidade', 'Humildade'] }),
        p('mudaria', 'multipla', 'O que você mudaria na empresa?', { outro: true, opcoes: ['Clima', 'Gestão', 'Pessoas', 'Remuneração', 'Benefícios', 'Processos'] }),
        p('nao_mudaria', 'multipla', 'O que você NÃO mudaria na empresa?', { outro: true, opcoes: ['Clima', 'Gestão', 'Pessoas', 'Remuneração', 'Benefícios', 'Processos'] }),
      ] },
      { titulo: 'Próximos passos', perguntas: [
        p('perspectiva', 'unica', 'Perspectiva de trabalho fora da empresa', { opcoes: [
          'Autônomo', 'Em processo de admissão', 'Promessa de trabalho', 'Desempregado', 'Estudo', 'Convidado para outra empresa'] }),
        p('nova_empresa', 'curto', 'Nova empresa', { obrigatoria: false }),
        p('novo_cargo', 'curto', 'Cargo na nova empresa', { obrigatoria: false }),
        p('novo_salario', 'curto', 'Salário na nova empresa', { obrigatoria: false }),
        p('nivel_responsabilidade', 'unica', 'Nível de responsabilidade na nova empresa', { obrigatoria: false, opcoes: ['Maior', 'Igual', 'Menor'] }),
        p('voltaria', 'unica', 'Voltaria a trabalhar na empresa?', { opcoes: SIM_NAO, justificativa: true }),
        p('comentarios', 'texto', 'Sinta-se à vontade para oferecer informações ou comentários que sejam importantes', { obrigatoria: false }),
        p('compliance', 'unica', 'Você gostaria de conversar/reportar algo para alguém da área de Compliance?', { opcoes: SIM_NAO, alerta: 'Sim' }),
      ] },
    ],
  };
}

db.prepare('INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES (?, ?)').run(CHAVE_FORM, JSON.stringify(formularioPadrao()));

function formulario() {
  return JSON.parse(db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(CHAVE_FORM).valor);
}

const texto = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const dataValida = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');

/** Valida o formulário enviado pelo editor. Devolve { form } ou { erro }. */
function lerFormulario(body) {
  const secoes = [];
  const ids = new Set();
  for (const [i, sec] of (Array.isArray(body?.secoes) ? body.secoes : []).entries()) {
    const titulo = texto(sec.titulo, 200);
    const perguntas = [];
    for (const p of Array.isArray(sec.perguntas) ? sec.perguntas : []) {
      const enunciado = texto(p.texto, 500);
      if (!enunciado) continue;
      const tipo = TIPOS.includes(p.tipo) ? p.tipo : 'unica';
      let id = String(p.id || '').replace(/[^\w-]/g, '').slice(0, 40);
      if (!id || ids.has(id)) id = `p_${crypto.randomBytes(4).toString('hex')}`;
      ids.add(id);
      const pergunta = { id, tipo, texto: enunciado, obrigatoria: Boolean(p.obrigatoria), justificativa: Boolean(p.justificativa), outro: false };
      if (COM_OPCOES.includes(tipo)) {
        pergunta.opcoes = [...new Set((Array.isArray(p.opcoes) ? p.opcoes : []).map(o => texto(o, 200)).filter(Boolean))];
        if (pergunta.opcoes.length < 2) return { erro: `"${enunciado}": informe ao menos 2 opções de resposta.` };
      }
      if (tipo === 'grade') {
        pergunta.itens = [...new Set((Array.isArray(p.itens) ? p.itens : []).map(o => texto(o, 200)).filter(Boolean))];
        if (!pergunta.itens.length) return { erro: `"${enunciado}": informe os itens avaliados (uma linha para cada).` };
      }
      if (tipo === 'unica' || tipo === 'multipla') {
        pergunta.outro = Boolean(p.outro);
        const alerta = texto(p.alerta, 200);
        if (alerta && (pergunta.opcoes.includes(alerta) || (pergunta.outro && alerta === 'Outros'))) pergunta.alerta = alerta;
      }
      perguntas.push(pergunta);
    }
    if (!titulo && !perguntas.length) continue;
    if (!titulo || !perguntas.length) return { erro: `Seção ${i + 1}: informe o título e ao menos uma pergunta.` };
    secoes.push({ titulo, perguntas });
  }
  if (!secoes.length) return { erro: 'Cadastre ao menos uma seção com perguntas.' };
  return {
    form: {
      ativa: body.ativa !== false,
      titulo: texto(body.titulo, 120) || 'Entrevista de Desligamento',
      introducao: texto(body.introducao, 2000),
      assunto: texto(body.assunto, 200) || 'Entrevista de desligamento',
      mensagem: texto(body.mensagem, 2000) || 'Olá, {nome}! Responda a entrevista de desligamento pelo link: {link}',
      secoes,
    },
  };
}

/** Confere as respostas com o formulário atual. Devolve { respostas, alerta } ou { erro }. */
function lerRespostas(form, recebidas) {
  const respostas = [];
  let alerta = false;
  for (const sec of form.secoes) {
    for (const p of sec.perguntas) {
      const r = recebidas?.[p.id] || {};
      const validas = [...(p.opcoes || []), ...(p.outro ? ['Outros'] : [])];
      let valor;
      let vazio;
      if (p.tipo === 'unica') {
        valor = texto(r.valor, 200);
        if (valor && !validas.includes(valor)) return { erro: `Resposta inválida em "${p.texto}".` };
        vazio = !valor;
      } else if (p.tipo === 'multipla') {
        valor = [...new Set((Array.isArray(r.valor) ? r.valor : []).map(v => texto(v, 200)))];
        if (valor.some(v => !validas.includes(v))) return { erro: `Resposta inválida em "${p.texto}".` };
        vazio = !valor.length;
      } else if (p.tipo === 'grade') {
        valor = {};
        for (const item of p.itens) {
          const v = texto(r.valor?.[item], 200);
          if (v && !p.opcoes.includes(v)) return { erro: `Resposta inválida em "${p.texto}".` };
          if (v) valor[item] = v;
        }
        vazio = p.obrigatoria ? Object.keys(valor).length < p.itens.length : !Object.keys(valor).length;
      } else if (p.tipo === 'data') {
        valor = dataValida(r.valor);
        vazio = !valor;
      } else {
        valor = texto(r.valor, p.tipo === 'curto' ? 300 : 3000);
        vazio = !valor;
      }
      if (vazio && p.obrigatoria) {
        return { erro: p.tipo === 'grade' ? `Responda todos os itens de "${p.texto}".` : `Responda: "${p.texto}".` };
      }
      const outro = valor === 'Outros' || (Array.isArray(valor) && valor.includes('Outros')) ? texto(r.outro, 300) : '';
      const justificativa = p.justificativa ? texto(r.justificativa, 3000) : '';
      if (vazio && !justificativa) continue;
      if (p.alerta && (valor === p.alerta || (Array.isArray(valor) && valor.includes(p.alerta)))) alerta = true;
      respostas.push({
        id: p.id, secao: sec.titulo, pergunta: p.texto, tipo: p.tipo, valor,
        ...(outro ? { outro } : {}), ...(justificativa ? { justificativa } : {}),
      });
    }
  }
  return { respostas, alerta };
}

const dadosConvite = (c) => c && Object.fromEntries(IDENTIFICACAO.map(k => [k, c[k] || '']));

function statusConvite(conviteId) {
  const r = db.prepare('SELECT recusou, criado_em FROM desligamento_respostas WHERE convite_id = ?').get(conviteId);
  return r ? { status: r.recusou ? 'recusou' : 'respondido', respondido_em: r.criado_em } : { status: 'pendente', respondido_em: null };
}

function registrar(app, { exigirAdmin, limitadorDeFalhas }) {
  // Limite de envios por IP pelo link geral (o link individual só aceita uma resposta).
  const limiteEnvios = limitadorDeFalhas({ maximo: 20, janelaMin: 15 });

  // ===== Público (colaborador que está saindo; não precisa estar na base de CPFs) =====

  app.get('/api/desligamento', (req, res) => {
    const form = formulario();
    let convite = null;
    if (req.query.c) {
      const c = db.prepare('SELECT * FROM desligamento_convites WHERE token = ?').get(String(req.query.c));
      if (!c) return res.status(404).json({ erro: 'Link inválido ou expirado. Procure o time de RH.' });
      convite = { ...dadosConvite(c), ...statusConvite(c.id) };
    }
    res.json({ ...form, convite });
  });

  app.post('/api/desligamento', (req, res) => {
    const form = formulario();
    if (!form.ativa) return res.status(400).json({ erro: 'A entrevista de desligamento não está recebendo respostas no momento.' });
    let convite = null;
    if (req.body?.c) {
      convite = db.prepare('SELECT * FROM desligamento_convites WHERE token = ?').get(String(req.body.c));
      if (!convite) return res.status(404).json({ erro: 'Link inválido ou expirado. Procure o time de RH.' });
      if (statusConvite(convite.id).status !== 'pendente') return res.status(409).json({ erro: 'Esta entrevista já foi registrada. Obrigado!' });
    } else if (limiteEnvios.bloqueado(req)) {
      return res.status(429).json({ erro: 'Muitos envios seguidos. Aguarde alguns minutos e tente novamente.' });
    }

    const ident = Object.fromEntries(IDENTIFICACAO.map(k => [k, k.startsWith('data_') ? dataValida(req.body?.identificacao?.[k]) : texto(req.body?.identificacao?.[k], 200)]));
    // No link individual, os dados que o RH já preencheu prevalecem.
    if (convite) for (const k of IDENTIFICACAO) if (convite[k]) ident[k] = convite[k];
    if (!ident.nome) return res.status(400).json({ erro: 'Informe seu nome.' });

    const recusou = req.body?.recusou === true;
    let lidas = { respostas: [], alerta: false };
    if (!recusou) {
      lidas = lerRespostas(form, req.body?.respostas);
      if (lidas.erro) return res.status(400).json({ erro: lidas.erro });
    }
    try {
      db.prepare(`INSERT INTO desligamento_respostas
        (convite_id, nome, matricula, cargo, area, gestor, data_admissao, data_desligamento, responsavel_rh, recusou, alerta, respostas)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(convite?.id ?? null, ident.nome, ident.matricula, ident.cargo, ident.area, ident.gestor, ident.data_admissao,
          ident.data_desligamento, convite?.responsavel_rh || '', recusou ? 1 : 0, lidas.alerta ? 1 : 0, JSON.stringify(lidas.respostas));
    } catch (e) {
      if (/UNIQUE/.test(e.message)) return res.status(409).json({ erro: 'Esta entrevista já foi registrada. Obrigado!' });
      throw e;
    }
    if (!convite) limiteEnvios.registrar(req);
    res.json({ ok: true });
  });

  // ===== RH =====

  app.get('/api/admin/desligamento', exigirAdmin, (_req, res) => res.json(formulario()));
  app.get('/api/admin/desligamento/padrao', exigirAdmin, (_req, res) => res.json(formularioPadrao()));

  app.put('/api/admin/desligamento', exigirAdmin, (req, res) => {
    const { form, erro } = lerFormulario(req.body);
    if (erro) return res.status(400).json({ erro });
    db.prepare('UPDATE configuracoes SET valor = ? WHERE chave = ?').run(JSON.stringify(form), CHAVE_FORM);
    res.json(form);
  });

  app.get('/api/admin/desligamento/convites', exigirAdmin, (_req, res) => {
    const convites = db.prepare('SELECT * FROM desligamento_convites ORDER BY id DESC').all().map(c => ({ ...c, ...statusConvite(c.id) }));
    res.json(convites);
  });

  app.post('/api/admin/desligamento/convites', exigirAdmin, (req, res) => {
    const b = req.body || {};
    const c = {
      ...Object.fromEntries(IDENTIFICACAO.map(k => [k, k.startsWith('data_') ? dataValida(b[k]) : texto(b[k], 200)])),
      telefone: texto(b.telefone, 40), email: texto(b.email, 200), responsavel_rh: texto(b.responsavel_rh, 200),
    };
    if (!c.nome) return res.status(400).json({ erro: 'Informe o nome do colaborador.' });
    const token = crypto.randomBytes(9).toString('base64url');
    const r = db.prepare(`INSERT INTO desligamento_convites
      (token, nome, matricula, cargo, area, gestor, data_admissao, data_desligamento, telefone, email, responsavel_rh)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(token, c.nome, c.matricula, c.cargo, c.area, c.gestor, c.data_admissao, c.data_desligamento, c.telefone, c.email, c.responsavel_rh);
    res.json({ id: Number(r.lastInsertRowid), token });
  });

  app.delete('/api/admin/desligamento/convites/:id', exigirAdmin, (req, res) => {
    db.prepare('DELETE FROM desligamento_convites WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  app.get('/api/admin/desligamento/respostas', exigirAdmin, (_req, res) => {
    const linhas = db.prepare(`
      SELECT r.*, c.telefone, c.email FROM desligamento_respostas r
      LEFT JOIN desligamento_convites c ON c.id = r.convite_id ORDER BY r.criado_em DESC, r.id DESC`).all()
      .map(r => ({ ...r, respostas: JSON.parse(r.respostas) }));
    res.json(linhas);
  });

  app.delete('/api/admin/desligamento/respostas/:id', exigirAdmin, (req, res) => {
    db.prepare('DELETE FROM desligamento_respostas WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // QR Code do link geral ou de um convite (?c=token).
  app.get('/api/admin/desligamento/qrcode', exigirAdmin, async (req, res, next) => {
    let link = `${req.protocol}://${req.get('host')}/desligamento.html`;
    let titulo = 'Link geral';
    if (req.query.c) {
      const c = db.prepare('SELECT nome, token FROM desligamento_convites WHERE token = ?').get(String(req.query.c));
      if (!c) return res.status(404).json({ erro: 'Convite não encontrado' });
      link += `?c=${c.token}`;
      titulo = c.nome;
    }
    try {
      const opcoes = { margin: 2, width: 600, color: { dark: '#0e3b5c', light: '#ffffff' } };
      if (req.query.formato === 'png') {
        res.setHeader('Content-Disposition', `attachment; filename="qrcode-desligamento${req.query.c ? '-' + req.query.c : ''}.png"`);
        return res.type('image/png').send(await QRCode.toBuffer(link, opcoes));
      }
      res.json({ link, titulo, svg: await QRCode.toString(link, { ...opcoes, type: 'svg' }) });
    } catch (e) { next(e); }
  });
}

module.exports = { registrar };
