/**
 * Regras de dinheiro.
 *
 * Todo valor em dinheiro é um número inteiro de centavos (R$ 3,50 = 350).
 * Nunca use número com vírgula (float) para dinheiro: 0,1 + 0,2 não dá 0,3.
 * As contas de multiplicar e dividir usam BigInt para não perder precisão.
 */

function exigirInteiro(nome: string, v: number, minimo: number): void {
  if (!Number.isSafeInteger(v) || v < minimo) {
    throw new RangeError(`${nome} precisa ser um inteiro >= ${minimo} (recebido: ${v}).`);
  }
}

/** Arredonda a × b ÷ c para o inteiro mais próximo (meio centavo arredonda para cima). */
export function multiplicarDividir(a: number, b: number, c: number): number {
  exigirInteiro("a", a, 0);
  exigirInteiro("b", b, 0);
  exigirInteiro("c", c, 1);
  const resultado = (2n * BigInt(a) * BigInt(b) + BigInt(c)) / (2n * BigInt(c));
  return Number(resultado);
}

/**
 * Divide `total` centavos entre as partes, na proporção dos pesos, sem sobrar
 * nem faltar centavo (método dos maiores restos). Nenhuma parte passa do seu peso
 * quando total <= soma dos pesos.
 *
 * Exemplo: ratear(100, [1, 1, 1]) = [34, 33, 33].
 */
export function ratear(total: number, pesos: number[]): number[] {
  exigirInteiro("total", total, 0);
  pesos.forEach((p, i) => exigirInteiro(`peso[${i}]`, p, 0));
  if (pesos.length === 0) {
    if (total !== 0) throw new RangeError("Não há partes para dividir o valor.");
    return [];
  }
  if (total === 0) return pesos.map(() => 0);

  const soma = pesos.reduce((s, p) => s + BigInt(p), 0n);
  if (soma === 0n) throw new RangeError("A soma dos pesos é zero; não dá para dividir o valor.");

  const t = BigInt(total);
  const partes = pesos.map((p) => (t * BigInt(p)) / soma);
  const restos = pesos.map((p, i) => ({ i, peso: p, resto: (t * BigInt(p)) % soma }));
  const distribuido = partes.reduce((s, p) => s + p, 0n);
  let falta = Number(t - distribuido);

  restos.sort((x, y) => {
    if (x.resto !== y.resto) return y.resto > x.resto ? 1 : -1;
    if (x.peso !== y.peso) return y.peso - x.peso;
    return x.i - y.i;
  });
  for (let k = 0; falta > 0; k++, falta--) {
    const alvo = restos[k % restos.length]!;
    partes[alvo.i] = partes[alvo.i]! + 1n;
  }
  return partes.map(Number);
}

const formatoReais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** R$ 1.234,56 — só para mensagens; a tela formata os próprios valores. */
export function reais(centavos: number): string {
  return formatoReais.format(centavos / 100).replace(/ /g, " ");
}

/** Taxa da maquininha. A taxa é guardada em pontos-base: 1,99% = 199. */
export function calcularTaxa(valorCentavos: number, taxaBp: number): number {
  return multiplicarDividir(valorCentavos, taxaBp, 10_000);
}

/**
 * Margem em pontos-base (lucro ÷ receita × 10.000). Retorna null quando não há
 * receita: margem sem venda não existe, e a tela mostra "—".
 */
export function margemBp(lucroCentavos: number, receitaCentavos: number): number | null {
  if (receitaCentavos <= 0) return null;
  return Math.round((lucroCentavos * 10_000) / receitaCentavos);
}

/** Valor de uma quantidade em milésimos (1,5 un = 1500) a um preço unitário. */
export function valorDaQuantidade(quantidadeMil: number, precoUnitarioCentavos: number): number {
  return multiplicarDividir(quantidadeMil, precoUnitarioCentavos, 1000);
}

/**
 * Custo médio ponderado depois de uma compra.
 * Se o estoque atual for zero ou negativo, o custo passa a ser o da compra.
 */
export function custoMedio(
  estoqueAtualMil: number,
  custoAtualCentavos: number,
  quantidadeCompradaMil: number,
  custoCompraCentavos: number,
): number {
  exigirInteiro("quantidadeCompradaMil", quantidadeCompradaMil, 1);
  exigirInteiro("custoCompraCentavos", custoCompraCentavos, 0);
  exigirInteiro("custoAtualCentavos", custoAtualCentavos, 0);
  if (!Number.isSafeInteger(estoqueAtualMil)) throw new RangeError("estoqueAtualMil inválido.");
  if (estoqueAtualMil <= 0) return custoCompraCentavos;
  const numerador =
    BigInt(estoqueAtualMil) * BigInt(custoAtualCentavos) +
    BigInt(quantidadeCompradaMil) * BigInt(custoCompraCentavos);
  const denominador = BigInt(estoqueAtualMil + quantidadeCompradaMil);
  return Number((2n * numerador + denominador) / (2n * denominador));
}
