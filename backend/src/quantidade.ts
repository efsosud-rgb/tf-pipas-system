import { ErroNegocio } from "./erros";

/**
 * Unidades de medida dos produtos. Quantidades são guardadas em milésimos
 * inteiros (1,5 m = 1500; 3 un = 3000), para o estoque nunca acumular erro
 * de arredondamento.
 */
export const UNIDADES = {
  un: { nome: "unidade", fracionavel: false },
  pct: { nome: "pacote", fracionavel: false },
  cx: { nome: "caixa", fracionavel: false },
  dz: { nome: "dúzia", fracionavel: false },
  par: { nome: "par", fracionavel: false },
  kit: { nome: "kit", fracionavel: false },
  rolo: { nome: "rolo", fracionavel: false },
  folha: { nome: "folha", fracionavel: false },
  m: { nome: "metro", fracionavel: true },
  kg: { nome: "quilo", fracionavel: true },
  l: { nome: "litro", fracionavel: true },
} as const;

export type Unidade = keyof typeof UNIDADES;
export const LISTA_UNIDADES = Object.keys(UNIDADES) as [Unidade, ...Unidade[]];

export function paraMil(quantidade: number): number {
  return Math.round(quantidade * 1000);
}

export function deMil(mil: number): number {
  return mil / 1000;
}

/** Aceita no máximo 3 casas decimais. */
export function temNoMaximoTresCasas(quantidade: number): boolean {
  return Math.abs(quantidade * 1000 - Math.round(quantidade * 1000)) < 1e-6;
}

export function validarQuantidadeMil(mil: number, unidade: Unidade, rotulo = "Quantidade"): void {
  if (!Number.isSafeInteger(mil) || mil <= 0) {
    throw new ErroNegocio(`${rotulo} precisa ser maior que zero.`);
  }
  const u = UNIDADES[unidade];
  if (!u.fracionavel && mil % 1000 !== 0) {
    throw new ErroNegocio(`${rotulo}: produto vendido por ${u.nome} aceita só número inteiro.`);
  }
}

/** Texto curto da quantidade para mensagens: 3, 1,5, 0,25. */
export function quantidadeTexto(mil: number): string {
  return deMil(mil).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}
