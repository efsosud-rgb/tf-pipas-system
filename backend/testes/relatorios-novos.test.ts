import { describe, expect, test } from "bun:test";
import { criarLancamento, fluxoDiario, listarCategorias } from "../src/dominio/financeiro";
import { atualizarForma } from "../src/dominio/formas";
import { painelRapido, porVendedor, resultado, resultadoMensal } from "../src/dominio/relatorios";
import { criarUsuario } from "../src/dominio/usuarios";
import { cancelarVenda, registrarVenda } from "../src/dominio/vendas";
import type { Banco } from "../src/banco";
import { abrirCaixaCom, bancoDeTeste, CREDITO, DINHEIRO, fixarRelogio, novoProduto, PIX, vender } from "./ajuda";

function categoria(db: Banco, nome: string): number {
  return listarCategorias(db, { incluirInativas: true }).find((c) => c.nome === nome)!.id;
}

describe("resumo do dia (frente de caixa)", () => {
  test("total, quantidade, ticket e formas de hoje; cancelada fica de fora; sem custo nem lucro", () => {
    fixarRelogio("2026-11-11T09:00:00-03:00");
    const db = bancoDeTeste();
    const pipa = novoProduto(db, { nome: "Pipa", custo_centavos: 600, preco_centavos: 1500, estoque_inicial_mil: 50_000 });
    abrirCaixaCom(db, 2000);
    vender(db, [[pipa.id, 2]], [[DINHEIRO, 3000]]);
    vender(db, [[pipa.id, 1]], [[PIX, 1500]]);
    const c = vender(db, [[pipa.id, 1]], [[PIX, 1500]]);
    cancelarVenda(db, c.id, "teste");
    fixarRelogio("2026-11-11T17:00:00-03:00");
    const p = painelRapido(db, 3, 1);
    expect(p.vendas).toEqual({ quantidade: 2, total_centavos: 4500, ticket_medio_centavos: 2250, canceladas_quantidade: 1, canceladas_total_centavos: 1500 });
    expect(p.por_forma.map((f) => [f.nome, f.valor_centavos])).toEqual([
      ["Dinheiro", 3000],
      ["PIX", 1500],
    ]);
    expect(p.caixa?.dinheiro_na_gaveta_centavos).toBe(5000);
    expect(p).toMatchObject({ produtos_ativos: 1, alertas_estoque: 3, sugestoes_producao: 1 });
    expect(JSON.stringify(p)).not.toContain("custo");
    expect(JSON.stringify(p)).not.toContain("lucro");

    // dia seguinte: zera
    fixarRelogio("2026-11-12T08:00:00-03:00");
    expect(painelRapido(db, 0, 0).vendas).toMatchObject({ quantidade: 0, total_centavos: 0, ticket_medio_centavos: null });
  });
});

describe("fluxo de caixa dia a dia", () => {
  test("entradas e saídas realizadas por dia, previsto nos dias seguintes e atrasadas à parte", () => {
    fixarRelogio("2026-11-03T10:00:00-03:00");
    const db = bancoDeTeste();
    atualizarForma(db, CREDITO, { taxa_bp: 500 });
    const pipa = novoProduto(db, { nome: "Pipa", custo_centavos: 600, preco_centavos: 2000, estoque_inicial_mil: 50_000 });
    abrirCaixaCom(db);
    // dia 3: venda em dinheiro de R$ 20 e no crédito de R$ 40 (taxa 5% = R$ 2)
    vender(db, [[pipa.id, 1]], [[DINHEIRO, 2000]]);
    vender(db, [[pipa.id, 2]], [[CREDITO, 4000]]);
    // conta atrasada (venceu dia 2), luz paga hoje pelo banco, aluguel a pagar dia 10, receita a receber dia 8
    const base = { observacao: "", repetir_meses: 1 };
    criarLancamento(db, { ...base, tipo: "despesa", descricao: "Internet", categoria_id: categoria(db, "Internet e telefone"), valor_centavos: 9_900, data: "2026-11-02", pagamento: { pago: false, vencimento: "2026-11-02" } });
    criarLancamento(db, { ...base, tipo: "despesa", descricao: "Luz", categoria_id: categoria(db, "Energia elétrica"), valor_centavos: 15_000, data: "2026-11-03", pagamento: { pago: true, data_pagamento: "2026-11-03", origem: "conta" } });
    criarLancamento(db, { ...base, tipo: "despesa", descricao: "Aluguel", categoria_id: categoria(db, "Aluguel"), valor_centavos: 80_000, data: "2026-11-10", pagamento: { pago: false, vencimento: "2026-11-10" } });
    criarLancamento(db, { ...base, tipo: "receita", descricao: "Encomenda", categoria_id: categoria(db, "Outras receitas"), valor_centavos: 30_000, data: "2026-11-08", pagamento: { pago: false, vencimento: "2026-11-08" } });

    const f = fluxoDiario(db, "2026-11-01", "2026-11-10");
    expect(f.dias).toHaveLength(10);
    const dia = (d: string) => f.dias.find((x) => x.data === d)!;
    expect(dia("2026-11-03")).toMatchObject({
      futuro: false,
      entradas: { vendas_centavos: 6000, receitas_centavos: 0, total_centavos: 6000 },
      saidas: { taxas_centavos: 200, despesas_centavos: 15_000, total_centavos: 15_200 },
      saldo_dia_centavos: -9_200,
      acumulado_centavos: -9_200,
      previsto: { a_receber_centavos: 0, a_pagar_centavos: 0 },
    });
    expect(dia("2026-11-08")).toMatchObject({ futuro: true, previsto: { a_receber_centavos: 30_000, a_pagar_centavos: 0 }, acumulado_previsto_centavos: -9_200 + 30_000 });
    expect(dia("2026-11-10")).toMatchObject({ previsto: { a_pagar_centavos: 80_000 }, acumulado_previsto_centavos: -9_200 + 30_000 - 80_000 });
    expect(f.totais).toEqual({ entradas_centavos: 6000, saidas_centavos: 15_200, saldo_centavos: -9_200, a_receber_centavos: 30_000, a_pagar_centavos: 80_000 });
    // a internet atrasada não entra no previsto de nenhum dia, aparece à parte
    expect(f.atrasadas).toEqual({ a_receber_centavos: 0, a_pagar_centavos: 9_900, quantidade: 1 });
  });
});

describe("DRE mês a mês", () => {
  test("um resultado por mês; a soma dos meses bate com o período inteiro", () => {
    fixarRelogio("2026-09-10T10:00:00-03:00");
    const db = bancoDeTeste();
    const pipa = novoProduto(db, { nome: "Pipa", custo_centavos: 600, preco_centavos: 1500, estoque_inicial_mil: 100_000 });
    abrirCaixaCom(db);
    vender(db, [[pipa.id, 4]], [[DINHEIRO, 6000]]);
    fixarRelogio("2026-10-15T10:00:00-03:00");
    vender(db, [[pipa.id, 10]], [[DINHEIRO, 15_000]]);
    criarLancamento(db, {
      tipo: "despesa",
      descricao: "Aluguel",
      categoria_id: categoria(db, "Aluguel"),
      valor_centavos: 5_000,
      data: "2026-10-05",
      observacao: "",
      pagamento: { pago: true, data_pagamento: "2026-10-05", origem: "conta" },
      repetir_meses: 1,
    });
    const meses = resultadoMensal(db, "2026-09-01", "2026-11-30");
    expect(meses.map((m) => m.mes)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(meses.map((m) => m.receita_centavos)).toEqual([6000, 15_000, 0]);
    expect(meses[1]).toMatchObject({ cmv_centavos: 6000, lucro_bruto_centavos: 9000, despesas_centavos: 5000, lucro_liquido_centavos: 4000 });
    expect(meses[2]!.margem_liquida_bp).toBeNull(); // sem venda no mês: margem "—"
    const total = resultado(db, "2026-09-01", "2026-11-30");
    expect(meses.reduce((s, m) => s + m.lucro_liquido_centavos, 0)).toBe(total.lucro_liquido_centavos);
    // período começando no meio do mês respeita a data
    expect(resultadoMensal(db, "2026-10-10", "2026-10-31")[0]).toMatchObject({ de: "2026-10-10", ate: "2026-10-31", despesas_centavos: 0 });
  });
});

describe("vendas por vendedor", () => {
  test("agrupa pelo usuário que vendeu; vendas antigas sem usuário ficam juntas", async () => {
    fixarRelogio("2026-11-11T10:00:00-03:00");
    const db = bancoDeTeste();
    const ana = await criarUsuario(db, { nome: "Ana", perfil: "funcionario", permissoes: [], senha: "1234" });
    const thiago = await criarUsuario(db, { nome: "Thiago", perfil: "administrador", permissoes: [], senha: "1234" });
    const pipa = novoProduto(db, { nome: "Pipa", custo_centavos: 600, preco_centavos: 1500, estoque_inicial_mil: 100_000 });
    abrirCaixaCom(db);
    const item = (q: number) => ({ itens: [{ produto_id: pipa.id, quantidade_mil: q * 1000 }], desconto_centavos: 0, cliente: "", observacao: "" });
    registrarVenda(db, { ...item(2), pagamentos: [{ forma_id: DINHEIRO, valor_centavos: 3000 }] }, ana);
    registrarVenda(db, { ...item(4), pagamentos: [{ forma_id: DINHEIRO, valor_centavos: 6000 }] }, ana);
    registrarVenda(db, { ...item(1), pagamentos: [{ forma_id: DINHEIRO, valor_centavos: 1500 }] }, thiago);
    vender(db, [[pipa.id, 1]], [[DINHEIRO, 1500]]);
    const r = porVendedor(db, "2026-11-11", "2026-11-11");
    expect(r.vendedores.map((v) => [v.nome, v.vendas, v.total_centavos, v.ticket_medio_centavos])).toEqual([
      ["Ana", 2, 9000, 4500],
      ["Thiago", 1, 1500, 1500],
      ["", 1, 1500, 1500],
    ]);
  });
});
