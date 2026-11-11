/**
 * Formatação para a tela. Dinheiro chega do servidor em centavos inteiros e só
 * é convertido aqui, na hora de mostrar. Quantidades chegam como número normal
 * (1,5 m = 1.5). Datas de negócio são texto AAAA-MM-DD.
 */

const formatoReais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** R$ 1.234,56 */
export function reais(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined || !Number.isFinite(centavos)) return "—";
  return formatoReais.format(centavos / 100).replace(/ /g, " ");
}

/** −R$ 12,00 para valores que saem (despesas, CMV). */
export function reaisSaida(centavos: number): string {
  if (centavos === 0) return reais(0);
  return `−${reais(Math.abs(centavos))}`;
}

/** 1234,56 (sem R$), para campos de digitação. */
export function centavosParaTexto(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Lê o que a pessoa digitou ("12", "12,5", "1.234,56", "R$ 3,00") e devolve
 * centavos. Retorna null se não for um valor válido.
 */
export function textoParaCentavos(texto: string): number | null {
  const limpo = texto.replace(/[R$\s ]/g, "").trim();
  if (!limpo) return null;
  let normal = limpo;
  if (normal.includes(",")) normal = normal.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(normal)) normal = normal.replace(/\./g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(normal)) return null;
  const [inteiro, frac = ""] = normal.split(".");
  const centavos = Number(inteiro) * 100 + Number((frac + "00").slice(0, 2));
  return Number.isSafeInteger(centavos) ? centavos : null;
}

/** Lê uma quantidade ("2", "1,5", "0,250") — até 3 casas. */
export function textoParaQuantidade(texto: string): number | null {
  const limpo = texto.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{0,3})?$/.test(limpo)) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/** Lê uma porcentagem ("1,99" → 199 pontos-base). */
export function textoParaBp(texto: string): number | null {
  const limpo = texto.replace(/[%\s]/g, "").replace(",", ".");
  if (!limpo) return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(limpo)) return null;
  const bp = Math.round(Number(limpo) * 100);
  return bp >= 0 && bp <= 10_000 ? bp : null;
}

export function quantidade(n: number | null | undefined, unidade?: string): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const texto = n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  return unidade ? `${texto} ${unidade}` : texto;
}

/** Quantidade para um campo de digitação: sem separador de milhar ("1000", "1,5"), para ler de volta sem erro. */
export function quantidadeParaCampo(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 3, useGrouping: false });
}

/** 6570 pontos-base → "65,7%". null → "—". */
export function porcento(bp: number | null | undefined, casas = 1): string {
  if (bp === null || bp === undefined || !Number.isFinite(bp)) return "—";
  return `${(bp / 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

export function bpParaTexto(bp: number): string {
  return (bp / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGOS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

/** "2026-11-07" → "07/11/2026" */
export function data(aaaammdd: string | null | undefined): string {
  if (!aaaammdd) return "—";
  const [a, m, d] = aaaammdd.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** "2026-11-07" → "07 nov" */
export function dataCurta(aaaammdd: string): string {
  const [, m, d] = aaaammdd.split("-");
  return `${d} ${MESES[Number(m) - 1]}`;
}

/** "2026-11" → "nov/2026" */
export function mesAno(aaaamm: string): string {
  const [a, m] = aaaamm.split("-");
  return `${MESES[Number(m) - 1]}/${a}`;
}

/** Instante ISO (UTC) → "07/11/2026 12:08" no fuso do computador. */
export function dataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}/${d.getFullYear()} ${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
}

export function hora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
}

/** "quarta-feira, 11 de novembro" */
export function dataPorExtenso(d: Date, comAno = false): string {
  const base = `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES_LONGOS[d.getMonth()]}`;
  return comAno ? `${base} de ${d.getFullYear()}` : base;
}

export function doisDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/** Data local AAAA-MM-DD (fuso do computador da loja). */
export function hojeLocal(d = new Date()): string {
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
}

export function primeiroDiaDoMes(aaaammdd: string): string {
  return `${aaaammdd.slice(0, 7)}-01`;
}

export function ultimoDiaDoMes(aaaammdd: string): string {
  const [a, m] = aaaammdd.split("-").map(Number);
  const dias = new Date(Date.UTC(a!, m!, 0)).getUTCDate();
  return `${aaaammdd.slice(0, 7)}-${doisDigitos(dias)}`;
}

export function somarDias(aaaammdd: string, dias: number): string {
  const [a, m, d] = aaaammdd.split("-").map(Number);
  const dt = new Date(Date.UTC(a!, m! - 1, d! + dias));
  return `${dt.getUTCFullYear()}-${doisDigitos(dt.getUTCMonth() + 1)}-${doisDigitos(dt.getUTCDate())}`;
}

export function somarMeses(aaaammdd: string, meses: number): string {
  const [a, m, d] = aaaammdd.split("-").map(Number);
  const total = a! * 12 + (m! - 1) + meses;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const dias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${doisDigitos(mes)}-${doisDigitos(Math.min(d!, dias))}`;
}

/** Dias entre hoje e a data (negativo = já passou). */
export function diasAte(aaaammdd: string, hoje = hojeLocal()): number {
  const [a1, m1, d1] = hoje.split("-").map(Number);
  const [a2, m2, d2] = aaaammdd.split("-").map(Number);
  return Math.round((Date.UTC(a2!, m2! - 1, d2!) - Date.UTC(a1!, m1! - 1, d1!)) / 86_400_000);
}

export function relativoAoDia(aaaammdd: string): string {
  const n = diasAte(aaaammdd);
  if (n === 0) return "hoje";
  if (n === 1) return "amanhã";
  if (n === -1) return "ontem";
  if (n > 1) return `em ${n} dias`;
  return `há ${-n} dias`;
}

export function saudacao(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return "Boa noite";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export function plural(n: number, singular: string, pluralTexto?: string): string {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? singular : (pluralTexto ?? `${singular}s`)}`;
}

export function tamanhoArquivo(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

/** Texto sem acento e minúsculo, para busca local. */
export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
