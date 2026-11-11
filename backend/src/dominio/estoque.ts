import type { Banco } from "../banco";
import { transacao } from "../banco";
import { custoMedio, valorDaQuantidade } from "../dinheiro";
import { ErroNegocio, naoEncontrado } from "../erros";
import { deMil, quantidadeTexto, validarQuantidadeMil } from "../quantidade";
import { agoraIso, dataLocal } from "../relogio";
import { categoriaDoSistema, criarLancamento, type Origem } from "./financeiro";
import { movimentarEstoque } from "./movimento-estoque";
import { exigirProduto, obterProduto, registrarAlteracaoPreco, type Produto } from "./produtos";

export interface ItemEntrada {
  produto_id: number;
  quantidade_mil: number;
  custo_unitario_centavos: number;
}

export type FinanceiroDaEntrada =
  | null
  | { pago: true; origem: Origem }
  | { pago: false; vencimento: string };

export type TipoEntrada = "compra" | "producao";

export interface DadosEntrada {
  itens: ItemEntrada[];
  fornecedor: string;
  observacao: string;
  /** Lança o valor da compra no financeiro (categoria "Compra de mercadoria"). */
  financeiro: FinanceiroDaEntrada;
}

export interface Entrada {
  id: number;
  tipo: TipoEntrada;
  usuario_nome: string;
  fornecedor: string;
  total_centavos: number;
  lancamento_id: number | null;
  observacao: string;
  data: string;
  criado_em: string;
  itens: Array<{
    produto_id: number;
    nome: string;
    unidade: string;
    quantidade: number;
    custo_unitario_centavos: number;
    total_centavos: number;
    custo_medio_antes_centavos: number;
    custo_medio_depois_centavos: number;
  }>;
}

export function obterEntrada(db: Banco, id: number): Entrada {
  const e = db.query("SELECT * FROM entradas_estoque WHERE id = $id").get({ id }) as Omit<Entrada, "itens"> | null;
  if (!e) throw naoEncontrado("Entrada de mercadoria não encontrada.");
  const itens = db
    .query(
      `SELECT i.produto_id, p.nome, p.unidade, i.quantidade_mil, i.custo_unitario_centavos, i.total_centavos,
              i.custo_medio_antes_centavos, i.custo_medio_depois_centavos
       FROM entradas_estoque_itens i JOIN produtos p ON p.id = i.produto_id
       WHERE i.entrada_id = $id ORDER BY i.id`,
    )
    .all({ id }) as Array<Omit<Entrada["itens"][number], "quantidade"> & { quantidade_mil: number }>;
  return {
    ...e,
    itens: itens.map(({ quantidade_mil, ...i }) => ({ ...i, quantidade: deMil(quantidade_mil) })),
  };
}

export function listarEntradas(
  db: Banco,
  filtro: { tipo?: TipoEntrada; limite?: number } = {},
): Array<Omit<Entrada, "itens"> & { itens_quantidade: number; quantidade_total: number }> {
  return db
    .query(
      `SELECT e.*,
              (SELECT COUNT(*) FROM entradas_estoque_itens i WHERE i.entrada_id = e.id) AS itens_quantidade,
              (SELECT COALESCE(SUM(i.quantidade_mil), 0) / 1000.0 FROM entradas_estoque_itens i WHERE i.entrada_id = e.id) AS quantidade_total
       FROM entradas_estoque e
       WHERE ($tipo IS NULL OR e.tipo = $tipo)
       ORDER BY e.id DESC LIMIT $limite`,
    )
    .all({ limite: Math.min(filtro.limite ?? 100, 500), tipo: filtro.tipo ?? null }) as Array<
    Omit<Entrada, "itens"> & { itens_quantidade: number; quantidade_total: number }
  >;
}

/**
 * Entrada de mercadoria (compra): soma no estoque e atualiza o custo do
 * produto pelo custo médio ponderado. Opcionalmente lança a despesa no
 * financeiro, na categoria "Compra de mercadoria", que não conta no lucro
 * (o custo entra no lucro quando o produto for vendido).
 */
export function registrarEntrada(db: Banco, dados: DadosEntrada, autor?: { nome: string }): Entrada {
  return transacao(db, () => entrarNoEstoque(db, "compra", dados, autor));
}

/**
 * Produção própria (pipas feitas na loja): soma no estoque com o custo de
 * fabricação informado (material + mão de obra por unidade) e atualiza o
 * custo pelo custo médio. Não lança nada no financeiro: o material já foi
 * lançado quando foi comprado.
 */
export function registrarProducao(
  db: Banco,
  dados: { itens: ItemEntrada[]; observacao: string },
  autor?: { nome: string },
): Entrada {
  return transacao(db, () => {
    for (const item of dados.itens) {
      const p = exigirProduto(db, item.produto_id);
      if (!p.fabricado) {
        throw new ErroNegocio(
          `"${p.nome}" está marcado como revenda. Marque "Produzido pela TF Pipas" no cadastro (ou registre como entrada de mercadoria).`,
          422,
          "itens",
        );
      }
    }
    return entrarNoEstoque(db, "producao", { itens: dados.itens, fornecedor: "", observacao: dados.observacao, financeiro: null }, autor);
  });
}

function entrarNoEstoque(db: Banco, tipo: TipoEntrada, dados: DadosEntrada, autor?: { nome: string }): Entrada {
  if (dados.itens.length === 0) throw new ErroNegocio("Adicione pelo menos um produto.", 422, "itens");
  const vistos = new Set<number>();
  for (const item of dados.itens) {
    if (vistos.has(item.produto_id)) {
      throw new ErroNegocio("O mesmo produto aparece duas vezes. Junte as quantidades numa linha só.", 422, "itens");
    }
    vistos.add(item.produto_id);
  }

  const agora = agoraIso();
  const hoje = dataLocal();
  const { id: entradaId } = db
    .query(
      `INSERT INTO entradas_estoque (fornecedor, total_centavos, observacao, data, criado_em, tipo, usuario_nome)
       VALUES ($fornecedor, 0, $obs, $hoje, $agora, $tipo, $usuario) RETURNING id`,
    )
    .get({ fornecedor: dados.fornecedor.trim(), obs: dados.observacao.trim(), hoje, agora, tipo, usuario: autor?.nome ?? "" }) as {
    id: number;
  };

  let total = 0;
  for (const item of dados.itens) {
    const p = exigirProduto(db, item.produto_id);
    if (!p.ativo) throw new ErroNegocio(`O produto "${p.nome}" está desativado.`, 422, "itens");
    if (!p.controla_estoque) {
      throw new ErroNegocio(`O produto "${p.nome}" não controla estoque. Ative o controle de estoque no cadastro dele.`, 422, "itens");
    }
    validarQuantidadeMil(item.quantidade_mil, p.unidade, `Quantidade de "${p.nome}"`);
    if (!Number.isSafeInteger(item.custo_unitario_centavos) || item.custo_unitario_centavos < 0) {
      throw new ErroNegocio(`Custo de "${p.nome}" inválido.`, 422, "itens");
    }
    const totalItem = valorDaQuantidade(item.quantidade_mil, item.custo_unitario_centavos);
    total += totalItem;
    const novoCusto = custoMedio(p.estoque_mil, p.custo_centavos, item.quantidade_mil, item.custo_unitario_centavos);

    db.query(
      `INSERT INTO entradas_estoque_itens
         (entrada_id, produto_id, quantidade_mil, custo_unitario_centavos, total_centavos,
          custo_medio_antes_centavos, custo_medio_depois_centavos)
       VALUES ($entrada, $produto, $q, $custo, $total, $antes, $depois)`,
    ).run({
      entrada: entradaId,
      produto: p.id,
      q: item.quantidade_mil,
      custo: item.custo_unitario_centavos,
      total: totalItem,
      antes: p.custo_centavos,
      depois: novoCusto,
    });
    if (novoCusto !== p.custo_centavos) {
      db.query("UPDATE produtos SET custo_centavos = $c, atualizado_em = $agora WHERE id = $id").run({
        c: novoCusto,
        agora,
        id: p.id,
      });
      registrarAlteracaoPreco(
        db,
        p.id,
        { custo: p.custo_centavos, preco: p.preco_centavos },
        { custo: novoCusto, preco: p.preco_centavos },
        "entrada",
      );
    }
    const fornecedor = dados.fornecedor.trim();
    movimentarEstoque(db, {
      produtoId: p.id,
      tipo: tipo === "producao" ? "producao" : "entrada",
      quantidadeMil: item.quantidade_mil,
      custoUnitarioCentavos: item.custo_unitario_centavos,
      entradaId,
      observacao: tipo === "producao" ? `Produção nº ${entradaId}` : fornecedor ? `Compra de ${fornecedor}` : "Compra de mercadoria",
    });
  }

  let lancamentoId: number | null = null;
  if (tipo === "compra" && dados.financeiro && total > 0) {
    const categoria = categoriaDoSistema(db, "compra_mercadoria");
    const fornecedor = dados.fornecedor.trim();
    const [lancamento] = criarLancamento(db, {
      tipo: "despesa",
      descricao: fornecedor ? `Compra de mercadoria — ${fornecedor}` : "Compra de mercadoria",
      categoria_id: categoria.id,
      valor_centavos: total,
      data: hoje,
      observacao: `Entrada de mercadoria nº ${entradaId}`,
      pagamento: dados.financeiro.pago
        ? { pago: true, data_pagamento: hoje, origem: dados.financeiro.origem }
        : { pago: false, vencimento: dados.financeiro.vencimento },
      repetir_meses: 1,
    });
    lancamentoId = lancamento!.id;
  }
  db.query("UPDATE entradas_estoque SET total_centavos = $total, lancamento_id = $l WHERE id = $id").run({
    total,
    l: lancamentoId,
    id: entradaId,
  });
  return obterEntrada(db, entradaId);
}

export type DadosAjuste =
  | { produto_id: number; tipo: "contagem"; nova_quantidade_mil: number; observacao: string }
  | { produto_id: number; tipo: "perda" | "brinde" | "uso"; quantidade_mil: number; observacao: string };

const NOMES_AJUSTE = { contagem: "Contagem de estoque", perda: "Perda", brinde: "Brinde", uso: "Uso na loja" } as const;

/**
 * Corrige o estoque. "contagem" informa quanto há de fato na prateleira;
 * "perda", "brinde" e "uso" tiram uma quantidade (e entram no relatório de
 * resultado como custo, pelo custo atual do produto).
 */
export function ajustarEstoque(db: Banco, dados: DadosAjuste): Produto {
  return transacao(db, () => {
    const p = exigirProduto(db, dados.produto_id);
    if (!p.controla_estoque) throw new ErroNegocio(`O produto "${p.nome}" não controla estoque.`, 422);
    let diferenca: number;
    if (dados.tipo === "contagem") {
      if (!Number.isSafeInteger(dados.nova_quantidade_mil) || dados.nova_quantidade_mil < 0) {
        throw new ErroNegocio("A quantidade contada não pode ser negativa.", 422, "nova_quantidade");
      }
      if (dados.nova_quantidade_mil > 0) validarQuantidadeMil(dados.nova_quantidade_mil, p.unidade, "Quantidade contada");
      diferenca = dados.nova_quantidade_mil - p.estoque_mil;
      if (diferenca === 0) {
        throw new ErroNegocio(`O estoque já está em ${quantidadeTexto(p.estoque_mil)}; nada a ajustar.`, 422, "nova_quantidade");
      }
    } else {
      validarQuantidadeMil(dados.quantidade_mil, p.unidade);
      diferenca = -dados.quantidade_mil;
    }
    const obs = dados.observacao.trim();
    movimentarEstoque(db, {
      produtoId: p.id,
      tipo: dados.tipo,
      quantidadeMil: diferenca,
      custoUnitarioCentavos: p.custo_centavos,
      observacao: obs ? `${NOMES_AJUSTE[dados.tipo]}: ${obs}` : NOMES_AJUSTE[dados.tipo],
    });
    return obterProduto(db, p.id);
  });
}
