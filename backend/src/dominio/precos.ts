import type { Banco } from "../banco";
import { ErroNegocio } from "../erros";
import { deMil, quantidadeTexto, UNIDADES, validarQuantidadeMil, type Unidade } from "../quantidade";

/**
 * Tabela de preços por quantidade: "a partir de 10 unidades, cada uma sai por
 * R$ 12,00". Vale a faixa de maior quantidade que a venda alcançou; abaixo da
 * primeira faixa vale o preço normal do produto.
 */

export interface FaixaPreco {
  quantidade_minima_mil: number;
  preco_centavos: number;
}

/** Como a faixa sai na API (quantidade com vírgula, como a pessoa digita). */
export interface FaixaPrecoApi {
  quantidade: number;
  preco_centavos: number;
}

export const MAX_FAIXAS = 10;

export function faixasDoProduto(db: Banco, produtoId: number): FaixaPreco[] {
  return db
    .query(
      `SELECT quantidade_minima_mil, preco_centavos FROM precos_quantidade
       WHERE produto_id = $p ORDER BY quantidade_minima_mil`,
    )
    .all({ p: produtoId }) as FaixaPreco[];
}

export function faixasDeTodos(db: Banco): Map<number, FaixaPreco[]> {
  const linhas = db
    .query("SELECT produto_id, quantidade_minima_mil, preco_centavos FROM precos_quantidade ORDER BY produto_id, quantidade_minima_mil")
    .all() as Array<FaixaPreco & { produto_id: number }>;
  const mapa = new Map<number, FaixaPreco[]>();
  for (const { produto_id, ...f } of linhas) {
    const lista = mapa.get(produto_id) ?? [];
    lista.push(f);
    mapa.set(produto_id, lista);
  }
  return mapa;
}

export function faixasParaApi(faixas: FaixaPreco[]): FaixaPrecoApi[] {
  return faixas.map((f) => ({ quantidade: deMil(f.quantidade_minima_mil), preco_centavos: f.preco_centavos }));
}

/** Preço unitário para a quantidade vendida. `faixa` é null quando vale o preço normal. */
export function precoParaQuantidade(
  precoBaseCentavos: number,
  faixas: FaixaPreco[],
  quantidadeMil: number,
): { preco_centavos: number; faixa: FaixaPreco | null } {
  let escolhida: FaixaPreco | null = null;
  for (const f of faixas) {
    if (quantidadeMil >= f.quantidade_minima_mil && (!escolhida || f.quantidade_minima_mil > escolhida.quantidade_minima_mil)) {
      escolhida = f;
    }
  }
  return escolhida ? { preco_centavos: escolhida.preco_centavos, faixa: escolhida } : { preco_centavos: precoBaseCentavos, faixa: null };
}

/** Confere as faixas antes de gravar. Deve ser chamada dentro da transação do produto. */
export function validarFaixas(faixas: Array<{ quantidade_mil: number; preco_centavos: number }>, unidade: Unidade): void {
  if (faixas.length > MAX_FAIXAS) {
    throw new ErroNegocio(`Use no máximo ${MAX_FAIXAS} faixas de preço por quantidade.`, 422, "precos_quantidade");
  }
  const vistas = new Set<number>();
  for (const f of faixas) {
    const texto = quantidadeTexto(f.quantidade_mil);
    if (f.quantidade_mil <= 1000) {
      throw new ErroNegocio(
        `Preço por quantidade: a faixa precisa começar acima de 1 ${UNIDADES[unidade].nome} (até 1, vale o preço normal).`,
        422,
        "precos_quantidade",
      );
    }
    validarQuantidadeMil(f.quantidade_mil, unidade, "Preço por quantidade");
    if (vistas.has(f.quantidade_mil)) {
      throw new ErroNegocio(`Preço por quantidade: a quantidade ${texto} aparece duas vezes.`, 422, "precos_quantidade");
    }
    vistas.add(f.quantidade_mil);
    if (!Number.isSafeInteger(f.preco_centavos) || f.preco_centavos <= 0) {
      throw new ErroNegocio(`Preço por quantidade: informe o preço para a partir de ${texto}.`, 422, "precos_quantidade");
    }
  }
}

/** Troca todas as faixas do produto pelas informadas (lista vazia apaga a tabela). */
export function gravarFaixas(db: Banco, produtoId: number, faixas: Array<{ quantidade_mil: number; preco_centavos: number }>): void {
  db.query("DELETE FROM precos_quantidade WHERE produto_id = $p").run({ p: produtoId });
  const inserir = db.query(
    "INSERT INTO precos_quantidade (produto_id, quantidade_minima_mil, preco_centavos) VALUES ($p, $q, $preco)",
  );
  for (const f of [...faixas].sort((a, b) => a.quantidade_mil - b.quantidade_mil)) {
    inserir.run({ p: produtoId, q: f.quantidade_mil, preco: f.preco_centavos });
  }
}
