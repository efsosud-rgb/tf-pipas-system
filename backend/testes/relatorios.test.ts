import { describe, expect, test } from "bun:test";
import type { Banco } from "../src/banco";
import { fecharCaixa } from "../src/dominio/caixa";
import { ajustarEstoque } from "../src/dominio/estoque";
import { criarLancamento, listarCategorias } from "../src/dominio/financeiro";
import { atualizarForma } from "../src/dominio/formas";
import { painelInicio, porFormaPagamento, porProduto, resultado, vendasNoTempo } from "../src/dominio/relatorios";
import { cancelarVenda } from "../src/dominio/vendas";
import { abrirCaixaCom, bancoDeTeste, CREDITO, DEBITO, DINHEIRO, fixarRelogio, novoProduto, PIX, vender } from "./ajuda";

const cat = (db: Banco, nome: string) => listarCategorias(db).find((c) => c.nome === nome)!.id;

/**
 * Mês com vendas em dias diferentes, desconto, três formas de pagamento com
 * taxa, uma venda cancelada, uma perda e lançamentos que contam e que não
 * contam no lucro. Todos os números esperados foram calculados à mão.
 */
function mesDeTeste() {
  const relogio = fixarRelogio("2026-11-02T09:00:00-03:00");
  const db = bancoDeTeste();
  const pipa = novoProduto(db, { nome: "Pipa raia", custo_centavos: 120, preco_centavos: 350, estoque_inicial_mil: 200_000 });
  const linha = novoProduto(db, { nome: "Linha 10", custo_centavos: 800, preco_centavos: 1500, estoque_inicial_mil: 50_000 });
  const carretilha = novoProduto(db, { nome: "Carretilha", custo_centavos: 2200, preco_centavos: 4500, estoque_inicial_mil: 10_000 });
  atualizarForma(db, DEBITO, { taxa_bp: 199 });
  atualizarForma(db, CREDITO, { taxa_bp: 499 });

  abrirCaixaCom(db, 5000);
  // 02/11 — 10 pipas no dinheiro (35,00); 1 carretilha + 2 linhas no crédito (75,00)
  vender(db, [[pipa.id, 10]], [[DINHEIRO, 5000]]);
  vender(db, [[carretilha.id, 1], [linha.id, 2]], [[CREDITO, 7500]]);
  // venda cancelada no mesmo dia: não pode aparecer em nada
  const cancelada = vender(db, [[linha.id, 3]], [[PIX, 4500]]);
  cancelarVenda(db, cancelada.id, "Cliente desistiu");
  fecharCaixa(db, { contado_centavos: 8500, operador: "", observacao: "" });

  relogio.definir("2026-11-05T15:00:00-03:00");
  abrirCaixaCom(db, 5000);
  // 05/11 — 20 pipas + 1 linha com desconto de 2,00 (83,00): 40,00 no débito e uma nota de 50,00 (troco 7,00)
  vender(db, [[pipa.id, 20], [linha.id, 1]], [[DEBITO, 4000], [DINHEIRO, 5000]], { desconto_centavos: 200 });
  ajustarEstoque(db, { produto_id: pipa.id, tipo: "perda", quantidade_mil: 3_000, observacao: "Chuva" });
  fecharCaixa(db, { contado_centavos: 9300, operador: "", observacao: "" });

  // lançamentos do mês
  const lanc = (dados: { tipo?: "receita" | "despesa"; nome: string; valor: number; pago: boolean; data?: string }) =>
    criarLancamento(db, {
      tipo: dados.tipo ?? "despesa",
      descricao: dados.nome,
      categoria_id: cat(db, dados.nome),
      valor_centavos: dados.valor,
      data: dados.data ?? "2026-11-05",
      observacao: "",
      pagamento: dados.pago
        ? { pago: true, data_pagamento: "2026-11-05", origem: "conta" }
        : { pago: false, vencimento: "2026-11-25" },
      repetir_meses: 1,
    });
  lanc({ nome: "Aluguel", valor: 60_000, pago: false });
  lanc({ nome: "Energia elétrica", valor: 9_000, pago: true });
  lanc({ nome: "Compra de mercadoria", valor: 30_000, pago: true });
  lanc({ nome: "Retirada do dono", valor: 10_000, pago: true });
  lanc({ tipo: "receita", nome: "Outras receitas", valor: 2_000, pago: true });
  lanc({ nome: "Energia elétrica", valor: 8_888, pago: true, data: "2026-10-31" }); // outubro: fora do período

  return { db, pipa, linha, carretilha, relogio };
}

describe("resultado do mês (lucro)", () => {
  test("números conferidos à mão", () => {
    const { db } = mesDeTeste();
    const r = resultado(db, "2026-11-01", "2026-11-30");

    // vendas: 35,00 + 75,00 + (70,00 + 15,00 − 2,00) = 193,00
    expect(r.vendas).toEqual({
      quantidade: 3,
      bruto_centavos: 3500 + 7500 + 8500,
      descontos_centavos: 200,
      receita_centavos: 19_300,
      ticket_medio_centavos: Math.round(19_300 / 3),
      canceladas_quantidade: 1,
      canceladas_total_centavos: 4500,
    });
    // custo: 10×1,20 + (22,00 + 2×8,00) + (20×1,20 + 8,00) = 12,00 + 38,00 + 32,00 = 82,00
    expect(r.cmv_centavos).toBe(8_200);
    expect(r.lucro_bruto_centavos).toBe(11_100);
    expect(r.margem_bruta_bp).toBe(5751);
    // taxas: crédito 4,99% de 75,00 = 3,74; débito 1,99% de 40,00 = 0,80 → 4,54 (o dinheiro não tem taxa)
    expect(r.taxas_centavos).toBe(374 + 80);
    // perda: 3 pipas a 1,20
    expect(r.perdas.total_centavos).toBe(360);
    // despesas que contam no lucro: aluguel (pendente) + energia de novembro
    expect(r.despesas.total_centavos).toBe(69_000);
    expect(r.despesas.pendente_centavos).toBe(60_000);
    expect(r.outras_receitas.total_centavos).toBe(2_000);
    expect(r.lucro_liquido_centavos).toBe(11_100 - 454 - 360 + 2_000 - 69_000);
    // compra de mercadoria e retirada do dono não entram no lucro
    expect(r.fora_do_resultado.despesas.map((c) => [c.nome, c.total_centavos])).toEqual([
      ["Compra de mercadoria", 30_000],
      ["Retirada do dono", 10_000],
    ]);
  });

  test("os relatórios batem entre si (produto, forma de pagamento e dia somam o mesmo total)", () => {
    const { db } = mesDeTeste();
    const de = "2026-11-01";
    const ate = "2026-11-30";
    const r = resultado(db, de, ate);
    const produtos = porProduto(db, de, ate);
    const formas = porFormaPagamento(db, de, ate);
    const tempo = vendasNoTempo(db, de, ate);

    expect(produtos.totais.receita_centavos).toBe(r.vendas.receita_centavos);
    expect(produtos.totais.custo_centavos).toBe(r.cmv_centavos);
    expect(produtos.produtos.reduce((s, p) => s + p.receita_centavos, 0)).toBe(r.vendas.receita_centavos);
    expect(formas.totais.valor_centavos).toBe(r.vendas.receita_centavos);
    expect(formas.totais.taxas_centavos).toBe(r.taxas_centavos);
    expect(tempo.pontos.reduce((s, p) => s + p.receita_centavos, 0)).toBe(r.vendas.receita_centavos);
    expect(tempo.pontos.reduce((s, p) => s + p.lucro_bruto_centavos, 0)).toBe(r.lucro_bruto_centavos);

    expect(tempo.agrupamento).toBe("dia");
    expect(tempo.pontos).toHaveLength(30);
    expect(tempo.pontos.find((p) => p.chave === "2026-11-03")).toEqual({
      chave: "2026-11-03",
      vendas: 0,
      receita_centavos: 0,
      lucro_bruto_centavos: 0,
    });
    // a linha vendida 3 vezes na venda cancelada não conta
    expect(produtos.produtos.find((p) => p.nome === "Linha 10")!.quantidade).toBe(3);
    expect(formas.formas.map((f) => [f.nome, f.valor_centavos])).toEqual([
      ["Dinheiro", 3_500 + 4_300],
      ["Cartão de crédito", 7_500],
      ["Cartão de débito", 4_000],
    ]);
  });

  test("sem vendas: margens e ticket médio vêm vazios (a tela mostra —)", () => {
    const { db } = mesDeTeste();
    const r = resultado(db, "2026-12-01", "2026-12-31");
    expect(r.vendas.receita_centavos).toBe(0);
    expect(r.margem_bruta_bp).toBeNull();
    expect(r.margem_liquida_bp).toBeNull();
    expect(r.vendas.ticket_medio_centavos).toBeNull();
    expect(porProduto(db, "2026-12-01", "2026-12-31").totais.margem_bp).toBeNull();
  });

  test("período longo agrupa por mês", () => {
    const { db } = mesDeTeste();
    const t = vendasNoTempo(db, "2026-01-01", "2026-12-31");
    expect(t.agrupamento).toBe("mes");
    expect(t.pontos).toHaveLength(12);
    expect(t.pontos.find((p) => p.chave === "2026-11")!.receita_centavos).toBe(19_300);
  });

  test("painel da tela inicial", () => {
    const { db, relogio } = mesDeTeste();
    relogio.definir("2026-11-05T18:00:00-03:00");
    const p = painelInicio(db);
    expect(p.dia).toMatchObject({ vendas: 1, receita_centavos: 8_300 });
    expect(p.mes).toMatchObject({ vendas: 3, receita_centavos: 19_300 });
    expect(p.caixa.aberto).toBe(false);
    expect(p.contas.proximas).toHaveLength(0);
    expect(p.produtos_ativos).toBe(3);
    relogio.definir("2026-11-24T18:00:00-03:00");
    expect(painelInicio(db).contas.proximas.map((l) => l.descricao)).toEqual(["Aluguel"]);
  });
});
