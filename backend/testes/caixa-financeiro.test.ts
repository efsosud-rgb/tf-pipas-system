import { describe, expect, test } from "bun:test";
import { abrirCaixa, fecharCaixa, listarSessoes, resumoDoCaixa, sangriaOuSuprimento, sessaoAberta } from "../src/dominio/caixa";
import {
  atualizarCategoria,
  atualizarLancamento,
  contasPendentes,
  criarLancamento,
  desfazerPagamento,
  excluirLancamento,
  listarCategorias,
  listarLancamentos,
  pagarLancamento,
  resumoFinanceiro,
  type NovoLancamento,
} from "../src/dominio/financeiro";
import { atualizarForma } from "../src/dominio/formas";
import { abrirCaixaCom, bancoDeTeste, CREDITO, DINHEIRO, erroDe, fixarRelogio, novoProduto, PIX, vender } from "./ajuda";
import type { Banco } from "../src/banco";

function categoria(db: Banco, nome: string): number {
  return listarCategorias(db, { incluirInativas: true }).find((c) => c.nome === nome)!.id;
}

function lancar(db: Banco, dados: Partial<NovoLancamento> & Pick<NovoLancamento, "pagamento">) {
  return criarLancamento(db, {
    tipo: "despesa",
    descricao: "Conta",
    categoria_id: categoria(db, "Aluguel"),
    valor_centavos: 10_000,
    data: "2026-11-07",
    observacao: "",
    repetir_meses: 1,
    ...dados,
  });
}

describe("caixa", () => {
  test("abre, recebe, faz sangria e suprimento, e fecha com diferença", () => {
    fixarRelogio("2026-11-07T09:00:00-03:00");
    const db = bancoDeTeste();
    const pipa = novoProduto(db, { nome: "Pipa", custo_centavos: 100, preco_centavos: 400, estoque_inicial_mil: 100_000 });
    atualizarForma(db, CREDITO, { taxa_bp: 300 });
    const aberto = abrirCaixa(db, { fundo_troco_centavos: 5000, operador: "Ana" });
    expect(aberto.gaveta.esperado_centavos).toBe(5000);
    expect(erroDe(() => abrirCaixaCom(db)).status).toBe(409);

    vender(db, [[pipa.id, 5]], [[DINHEIRO, 2000]]); // +20,00
    vender(db, [[pipa.id, 2]], [[CREDITO, 800]]); // cartão não entra na gaveta
    vender(db, [[pipa.id, 1]], [[DINHEIRO, 1000]]); // 4,00 com troco de 6,00 → +4,00
    sangriaOuSuprimento(db, { tipo: "sangria", valor_centavos: 3000, descricao: "Depósito" });
    sangriaOuSuprimento(db, { tipo: "suprimento", valor_centavos: 1000, descricao: "" });
    expect(erroDe(() => sangriaOuSuprimento(db, { tipo: "sangria", valor_centavos: 999_999, descricao: "" })).mensagem).toContain(
      "A gaveta tem",
    );

    const r = resumoDoCaixa(db, aberto.sessao.id);
    expect(r.gaveta).toMatchObject({
      fundo_troco_centavos: 5000,
      vendas_centavos: 2400,
      sangrias_centavos: 3000,
      suprimentos_centavos: 1000,
      esperado_centavos: 5000 + 2400 - 3000 + 1000,
    });
    expect(r.vendas.quantidade).toBe(3);
    expect(r.vendas.total_centavos).toBe(3200);
    expect(r.vendas.taxas_centavos).toBe(24);
    expect(r.vendas.por_forma.map((f) => [f.nome, f.valor_centavos])).toEqual([
      ["Dinheiro", 2400],
      ["Cartão de crédito", 800],
    ]);

    const fechado = fecharCaixa(db, { contado_centavos: 5300, operador: "Ana", observacao: "Faltou R$ 1" });
    expect(fechado.sessao.aberta).toBe(false);
    expect(fechado.sessao.esperado_centavos).toBe(5400);
    expect(fechado.sessao.diferenca_centavos).toBe(-100);
    expect(sessaoAberta(db)).toBeNull();
    expect(erroDe(() => fecharCaixa(db, { contado_centavos: 0, operador: "", observacao: "" })).status).toBe(409);
    expect(listarSessoes(db)[0]).toMatchObject({ vendas_quantidade: 3, vendas_total_centavos: 3200 });
  });
});

describe("financeiro", () => {
  test("despesa pendente vence, é paga pelo banco e pode ser desfeita", () => {
    const relogio = fixarRelogio("2026-11-07T09:00:00-03:00");
    const db = bancoDeTeste();
    const [l] = lancar(db, { descricao: "Aluguel de novembro", valor_centavos: 150_000, pagamento: { pago: false, vencimento: "2026-11-10" } });
    expect(l!.situacao).toBe("pendente");
    relogio.definir("2026-11-11T09:00:00-03:00");
    expect(contasPendentes(db)).toMatchObject({ vencidas_quantidade: 1, vencidas_a_pagar_centavos: 150_000 });

    const pago = pagarLancamento(db, l!.id, { data_pagamento: "2026-11-11", origem: "conta" });
    expect(pago).toMatchObject({ pago: true, situacao: "pago", origem: "conta" });
    expect(erroDe(() => pagarLancamento(db, l!.id, { data_pagamento: "2026-11-11", origem: "conta" })).status).toBe(409);
    const desfeito = desfazerPagamento(db, l!.id);
    expect(desfeito).toMatchObject({ pago: false, situacao: "vencido", vencimento: "2026-11-10" });
  });

  test("datas de pagamento: nada no futuro; gaveta só hoje e com caixa aberto", () => {
    fixarRelogio("2026-11-07T09:00:00-03:00");
    const db = bancoDeTeste();
    expect(erroDe(() => lancar(db, { pagamento: { pago: true, data_pagamento: "2026-11-08", origem: "conta" } })).mensagem).toContain(
      "não pode ser depois de hoje",
    );
    expect(erroDe(() => lancar(db, { pagamento: { pago: true, data_pagamento: "2026-11-06", origem: "gaveta" } })).mensagem).toContain(
      "só pode ser usado hoje",
    );
    expect(erroDe(() => lancar(db, { pagamento: { pago: true, data_pagamento: "2026-11-07", origem: "gaveta" } })).status).toBe(409);
  });

  test("despesa paga com dinheiro da gaveta sai do caixa e trava o valor", () => {
    fixarRelogio("2026-11-07T09:00:00-03:00");
    const db = bancoDeTeste();
    const caixa = abrirCaixaCom(db, 10_000);
    const [l] = lancar(db, {
      descricao: "Lanche da equipe",
      categoria_id: categoria(db, "Outras despesas"),
      valor_centavos: 2_500,
      pagamento: { pago: true, data_pagamento: "2026-11-07", origem: "gaveta" },
    });
    const r = resumoDoCaixa(db, caixa.sessao.id);
    expect(r.gaveta.despesas_centavos).toBe(2_500);
    expect(r.gaveta.esperado_centavos).toBe(7_500);

    const edicao = { descricao: "Lanche", categoria_id: l!.categoria_id, data: l!.data, vencimento: null, observacao: "" };
    expect(erroDe(() => atualizarLancamento(db, l!.id, { ...edicao, valor_centavos: 3_000 })).mensagem).toContain("desfaça o pagamento");
    expect(atualizarLancamento(db, l!.id, { ...edicao, valor_centavos: 2_500 }).descricao).toBe("Lanche");

    // com o caixa ainda aberto, excluir devolve o valor à gaveta
    excluirLancamento(db, l!.id);
    expect(resumoDoCaixa(db, caixa.sessao.id).gaveta.esperado_centavos).toBe(10_000);
  });

  test("não desfaz pagamento feito na gaveta de um caixa já fechado", () => {
    fixarRelogio("2026-11-07T09:00:00-03:00");
    const db = bancoDeTeste();
    abrirCaixaCom(db, 10_000);
    const [l] = lancar(db, { pagamento: { pago: true, data_pagamento: "2026-11-07", origem: "gaveta" } });
    fecharCaixa(db, { contado_centavos: 0, operador: "", observacao: "" });
    expect(erroDe(() => desfazerPagamento(db, l!.id)).mensagem).toContain("já foi fechado");
    expect(erroDe(() => excluirLancamento(db, l!.id)).mensagem).toContain("já foi fechado");
  });

  test("repetição mensal mantém o dia e para no fim do mês curto", () => {
    fixarRelogio("2026-01-31T09:00:00-03:00");
    const db = bancoDeTeste();
    const lancados = lancar(db, {
      data: "2026-01-31",
      repetir_meses: 3,
      pagamento: { pago: true, data_pagamento: "2026-01-31", origem: "conta" },
    });
    expect(lancados.map((l) => [l.data, l.pago, l.vencimento, l.parcela, l.parcelas])).toEqual([
      ["2026-01-31", true, null, 1, 3],
      ["2026-02-28", false, "2026-02-28", 2, 3],
      ["2026-03-31", false, "2026-03-31", 3, 3],
    ]);
    const r = excluirLancamento(db, lancados[0]!.id, { futurosPendentes: true });
    expect(r.excluidos).toBe(3);
  });

  test("categorias: tipo precisa bater e compra de mercadoria nunca conta no lucro", () => {
    fixarRelogio("2026-11-07T09:00:00-03:00");
    const db = bancoDeTeste();
    expect(
      erroDe(() =>
        lancar(db, { tipo: "receita", categoria_id: categoria(db, "Aluguel"), pagamento: { pago: false, vencimento: "2026-11-10" } }),
      ).mensagem,
    ).toContain("não é do tipo");
    const compra = categoria(db, "Compra de mercadoria");
    expect(erroDe(() => atualizarCategoria(db, compra, { conta_no_resultado: true })).mensagem).toContain("dobraria o custo");
    expect(erroDe(() => atualizarCategoria(db, compra, { ativo: false })).mensagem).toContain("não pode ser desativada");
  });

  test("resumo do período: o que entrou e saiu de verdade", () => {
    fixarRelogio("2026-11-07T09:00:00-03:00");
    const db = bancoDeTeste();
    const pipa = novoProduto(db, { nome: "Pipa", custo_centavos: 100, preco_centavos: 1000, estoque_inicial_mil: 100_000 });
    atualizarForma(db, CREDITO, { taxa_bp: 500 });
    abrirCaixaCom(db);
    vender(db, [[pipa.id, 2]], [[CREDITO, 2000]]); // taxa 1,00
    vender(db, [[pipa.id, 1]], [[PIX, 1000]]);
    lancar(db, { valor_centavos: 5_000, pagamento: { pago: true, data_pagamento: "2026-11-07", origem: "conta" } });
    lancar(db, {
      categoria_id: categoria(db, "Compra de mercadoria"),
      valor_centavos: 3_000,
      pagamento: { pago: true, data_pagamento: "2026-11-07", origem: "conta" },
    });
    lancar(db, { tipo: "receita", categoria_id: categoria(db, "Outras receitas"), valor_centavos: 700, pagamento: { pago: true, data_pagamento: "2026-11-05", origem: "conta" } });
    lancar(db, { valor_centavos: 9_999, pagamento: { pago: false, vencimento: "2026-11-20" } });

    const r = resumoFinanceiro(db, "2026-11-01", "2026-11-30");
    expect(r.entradas).toEqual({ vendas_centavos: 3000, receitas_centavos: 700, total_centavos: 3700 });
    expect(r.saidas.taxas_centavos).toBe(100);
    expect(r.saidas.despesas_centavos).toBe(8000);
    expect(r.saldo_centavos).toBe(3700 - 8100);
    expect(r.pendentes_no_periodo.a_pagar_centavos).toBe(9_999);
    expect(listarLancamentos(db, { situacao: "pendente" })).toHaveLength(1);
  });
});
