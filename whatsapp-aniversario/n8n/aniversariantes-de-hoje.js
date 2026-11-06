// Nó "Code" do n8n: "Aniversariantes de hoje" (modo: Run Once for All Items).
// Recebe as linhas da planilha e devolve um item { nome } para cada aniversariante do dia.
// Ajuste os nomes das colunas abaixo para ficarem iguais aos cabeçalhos do seu Excel.
const COL_NOME = 'Nome';
const COL_DATA = 'Data de Nascimento';

// Data de hoje no fuso de Brasília (independe do fuso do servidor do n8n)
const [d, m, a] = new Date()
  .toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  .split('/')
  .map(Number);
const bissexto = (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;

// Aceita: número de série do Excel (ex.: 32957), "25/03/1990", "25-03-1990", "1990-03-25" e "1990-03-25T00:00:00Z"
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
  if (r) return [Number(r[1]), Number(r[2])];
  if (/^\d+(\.\d+)?$/.test(s)) return diaMes(Number(s));
  return null;
}

const ehHoje = ([dia, mes]) =>
  (dia === d && mes === m) ||
  (!bissexto && d === 28 && m === 2 && dia === 29 && mes === 2); // quem nasceu em 29/02 é lembrado em 28/02

return $input
  .all()
  .filter((item) => {
    const dm = diaMes(item.json[COL_DATA]);
    return item.json[COL_NOME] && dm && ehHoje(dm);
  })
  .map((item) => ({ json: { nome: String(item.json[COL_NOME]).trim() } }));
