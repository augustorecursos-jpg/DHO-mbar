// Nó "Code" do n8n: "Aniversariantes de hoje" (modo: Run Once for All Items).
// Recebe as linhas da planilha e devolve um item { nome } para cada aniversariante do dia.
// Ajuste os nomes das colunas abaixo para ficarem iguais aos cabeçalhos do seu Excel.
const COL_NOME = 'Nome';
const COL_DATA = 'Data de Nascimento';
const FORMATAR_NOME = true; // "MARIA DA SILVA" -> "Maria da Silva"

// Data de hoje no fuso de Brasília (independe do fuso do servidor do n8n)
const [d, m, a] = new Date()
  .toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  .split('/')
  .map(Number);
const bissexto = (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;

const linhas = $input.all();

// Datas em texto como "11/13/1974" (mês/dia) ou "13/11/1974" (dia/mês): descobre a ordem olhando a coluna inteira.
// Se algum valor tiver o 2º número > 12, a planilha usa mês/dia; se nada indicar, assume dia/mês (padrão brasileiro).
const textos = linhas
  .map((i) => String(i.json[COL_DATA] ?? '').trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-]\d{2,4}/))
  .filter(Boolean);
const mesPrimeiro = textos.some((r) => Number(r[2]) > 12) && !textos.some((r) => Number(r[1]) > 12);

// Aceita: número de série do Excel (ex.: 27346), "13/11/1974", "11/13/1974", "1974-11-13" e "1974-11-13T00:00:00Z"
function diaMes(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    const dt = new Date(Math.round((v - 25569) * 86400000));
    return [dt.getUTCDate(), dt.getUTCMonth() + 1];
  }
  const s = String(v).trim();
  let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (r) return [Number(r[3]), Number(r[2])];
  r = s.match(/^(\d{1,2})[\/.-](\d{1,2})/);
  if (r) {
    let [x, y] = [Number(r[1]), Number(r[2])];
    // Um valor maior que 12 só pode ser o dia, mesmo que a coluna use outra ordem
    if (x > 12) return [x, y];
    if (y > 12) return [y, x];
    return mesPrimeiro ? [y, x] : [x, y];
  }
  if (/^\d+(\.\d+)?$/.test(s)) return diaMes(Number(s));
  return null;
}

const MINUSCULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
function formatarNome(nome) {
  const limpo = String(nome).trim().replace(/\s+/g, ' ');
  if (!FORMATAR_NOME) return limpo;
  return limpo
    .toLocaleLowerCase('pt-BR')
    .split(' ')
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1)))
    .join(' ');
}

const ehHoje = ([dia, mes]) =>
  (dia === d && mes === m) ||
  (!bissexto && d === 28 && m === 2 && dia === 29 && mes === 2); // quem nasceu em 29/02 é lembrado em 28/02

// Uma mensagem por pessoa, mesmo que o nome apareça repetido na planilha
const jaIncluidos = new Set();
const resultado = [];
for (const item of linhas) {
  const nomeBruto = item.json[COL_NOME];
  const dm = diaMes(item.json[COL_DATA]);
  if (!nomeBruto || !dm || !ehHoje(dm)) continue;
  const nome = formatarNome(nomeBruto);
  const chave = nome.toLocaleLowerCase('pt-BR');
  if (jaIncluidos.has(chave)) continue;
  jaIncluidos.add(chave);
  resultado.push({ json: { nome } });
}
return resultado;
