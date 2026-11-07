/**
 * Data e hora do sistema.
 *
 * Datas de negócio (dia da venda, vencimento, data de um lançamento) são texto
 * AAAA-MM-DD no fuso do computador da loja. Instantes (criado_em, aberto_em) são
 * ISO 8601 em UTC. Os testes trocam o relógio para controlar o "agora".
 */

export type FonteDeTempo = () => Date;

const relogioReal: FonteDeTempo = () => new Date();
let fonte: FonteDeTempo = relogioReal;

export function definirRelogio(nova: FonteDeTempo): void {
  fonte = nova;
}

export function restaurarRelogio(): void {
  fonte = relogioReal;
}

export function agora(): Date {
  return fonte();
}

export function agoraIso(): string {
  return agora().toISOString();
}

function doisDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/** Data AAAA-MM-DD no fuso do computador da loja. */
export function dataLocal(d: Date = agora()): string {
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
}

/** Data de um instante ISO (UTC) no fuso do computador da loja. */
export function dataLocalDeIso(iso: string): string {
  return dataLocal(new Date(iso));
}

export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

export function ehDataValida(valor: unknown): valor is string {
  if (typeof valor !== "string") return false;
  const m = RE_DATA.exec(valor);
  if (!m) return false;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (ano < 2000 || ano > 2200 || mes < 1 || mes > 12 || dia < 1) return false;
  return dia <= diasNoMes(ano, mes);
}

function partes(data: string): [number, number, number] {
  const [a, m, d] = data.split("-").map(Number);
  return [a!, m!, d!];
}

/**
 * Soma meses mantendo o dia. Se o mês de destino não tiver esse dia, usa o último:
 * 31/01 + 1 mês = 28/02 (ou 29/02), e 31/01 + 2 meses = 31/03.
 */
export function somarMeses(data: string, meses: number): string {
  const [a, m, d] = partes(data);
  const total = a * 12 + (m - 1) + meses;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const dia = Math.min(d, diasNoMes(ano, mes));
  return `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
}

export function somarDias(data: string, dias: number): string {
  const [a, m, d] = partes(data);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return `${dt.getUTCFullYear()}-${doisDigitos(dt.getUTCMonth() + 1)}-${doisDigitos(dt.getUTCDate())}`;
}

/** Quantidade de dias entre duas datas (ate - de). */
export function diferencaEmDias(de: string, ate: string): number {
  const [a1, m1, d1] = partes(de);
  const [a2, m2, d2] = partes(ate);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

export function primeiroDiaDoMes(data: string): string {
  return `${data.slice(0, 7)}-01`;
}

export function ultimoDiaDoMes(data: string): string {
  const [a, m] = partes(data);
  return `${data.slice(0, 7)}-${doisDigitos(diasNoMes(a, m))}`;
}
