import type { Banco } from "../banco";
import { agoraIso, dataLocal } from "../relogio";

export type TipoMovimentoEstoque =
  | "inicial"
  | "entrada"
  | "venda"
  | "cancelamento"
  | "contagem"
  | "perda"
  | "brinde"
  | "uso";

export interface Movimento {
  produtoId: number;
  tipo: TipoMovimentoEstoque;
  /** Com sinal: positivo entra no estoque, negativo sai. Em milésimos. */
  quantidadeMil: number;
  /** Custo unitário do produto no momento do movimento (para perdas a custo e histórico). */
  custoUnitarioCentavos: number;
  vendaId?: number | null;
  entradaId?: number | null;
  observacao?: string;
}

/**
 * Único ponto que altera o estoque: atualiza o saldo do produto e grava o
 * movimento com o saldo resultante. Deve ser chamado dentro de uma transação.
 */
export function movimentarEstoque(db: Banco, m: Movimento): number {
  if (!Number.isSafeInteger(m.quantidadeMil) || m.quantidadeMil === 0) {
    throw new RangeError("Movimento de estoque precisa de quantidade diferente de zero.");
  }
  const agora = agoraIso();
  const linha = db
    .query(
      "UPDATE produtos SET estoque_mil = estoque_mil + $q, atualizado_em = $agora WHERE id = $id RETURNING estoque_mil",
    )
    .get({ q: m.quantidadeMil, agora, id: m.produtoId }) as { estoque_mil: number } | null;
  if (!linha) throw new RangeError(`Produto ${m.produtoId} não existe.`);

  db.query(
    `INSERT INTO movimentos_estoque
       (produto_id, tipo, quantidade_mil, saldo_mil, custo_unitario_centavos, venda_id, entrada_id, observacao, data, criado_em)
     VALUES ($produto, $tipo, $q, $saldo, $custo, $venda, $entrada, $obs, $data, $agora)`,
  ).run({
    produto: m.produtoId,
    tipo: m.tipo,
    q: m.quantidadeMil,
    saldo: linha.estoque_mil,
    custo: m.custoUnitarioCentavos,
    venda: m.vendaId ?? null,
    entrada: m.entradaId ?? null,
    obs: m.observacao ?? "",
    data: dataLocal(),
    agora,
  });
  return linha.estoque_mil;
}
