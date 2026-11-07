import { describe, expect, test } from "bun:test";
import { resumoDoCaixa } from "../src/dominio/caixa";
import { ajustarEstoque, registrarEntrada } from "../src/dominio/estoque";
import { listarLancamentos } from "../src/dominio/financeiro";
import {
  atualizarProduto,
  buscarPorCodigo,
  categoriasDeProduto,
  excluirProduto,
  historicoDoProduto,
  listarProdutos,
  obterProduto,
} from "../src/dominio/produtos";
import { relatorioEstoque, resultado } from "../src/dominio/relatorios";
import { abrirCaixaCom, bancoDeTeste, erroDe, fixarRelogio, novoProduto, PIX, vender } from "./ajuda";

describe("cadastro de produtos", () => {
  test("calcula lucro e margem por unidade e registra o estoque inicial", () => {
    fixarRelogio("2026-11-07T10:00:00-03:00");
    const db = bancoDeTeste();
    const p = novoProduto(db, { nome: "Pipa raia", custo_centavos: 120, preco_centavos: 350, estoque_inicial_mil: 40_000, estoque_minimo_mil: 10_000 });
    expect(p).toMatchObject({ lucro_centavos: 230, margem_bp: 6571, estoque: 40, estoque_minimo: 10, situacao_estoque: "ok" });
    expect(historicoDoProduto(db, p.id).movimentos[0]).toMatchObject({ tipo: "inicial", quantidade: 40, saldo: 40 });
  });

  test("busca sem acento e por código; códigos não se repetem", () => {
    const db = bancoDeTeste();
    novoProduto(db, { nome: "Balão Chinês", categoria: "Acessórios", codigo_barras: "7891000100101" });
    novoProduto(db, { nome: "Carretilha de madeira", categoria: "Carretilhas", codigo: "CAR-21" });
    expect(listarProdutos(db, { busca: "balao chines" }).map((p) => p.nome)).toEqual(["Balão Chinês"]);
    expect(listarProdutos(db, { busca: "madeira car" })).toHaveLength(1);
    expect(listarProdutos(db, { busca: "100%" })).toHaveLength(0);
    expect(buscarPorCodigo(db, "7891000100101")?.nome).toBe("Balão Chinês");
    expect(buscarPorCodigo(db, "CAR-21")?.nome).toBe("Carretilha de madeira");
    expect(categoriasDeProduto(db)).toEqual(["Acessórios", "Carretilhas"]);
    const e = erroDe(() => novoProduto(db, { nome: "Outro", codigo_barras: "7891000100101" }));
    expect(e.status).toBe(409);
    expect(e.mensagem).toContain("Balão Chinês");
  });

  test("validações do cadastro", () => {
    const db = bancoDeTeste();
    expect(erroDe(() => novoProduto(db, { nome: "  " })).mensagem).toContain("nome");
    expect(erroDe(() => novoProduto(db, { nome: "X", preco_centavos: 0 })).mensagem).toContain("preço de venda");
    expect(erroDe(() => novoProduto(db, { nome: "X", estoque_inicial_mil: 1_500 })).mensagem).toContain("só número inteiro");
    const m = novoProduto(db, { nome: "Linha a metro", unidade: "m", estoque_inicial_mil: 1_500 });
    expect(m.estoque).toBe(1.5);
    expect(erroDe(() => atualizarProduto(db, m.id, { ...obterProduto(db, m.id), unidade: "un", estoque_minimo_mil: 0 })).mensagem).toContain(
      "tem fração",
    );
  });

  test("excluir: apaga se nunca foi usado; desativa se já vendeu", () => {
    fixarRelogio("2026-11-07T10:00:00-03:00");
    const db = bancoDeTeste();
    const novo = novoProduto(db, { nome: "Nunca vendido", estoque_inicial_mil: 5_000 });
    expect(excluirProduto(db, novo.id).acao).toBe("excluido");
    const vendido = novoProduto(db, { nome: "Vendido", estoque_inicial_mil: 5_000 });
    abrirCaixaCom(db);
    vender(db, [[vendido.id, 1]], [[PIX, 300]]);
    expect(excluirProduto(db, vendido.id).acao).toBe("inativado");
    expect(listarProdutos(db).map((p) => p.nome)).toEqual([]);
    expect(listarProdutos(db, { incluirInativos: true }).map((p) => p.nome)).toEqual(["Vendido"]);
  });
});

describe("entrada de mercadoria", () => {
  test("soma no estoque, atualiza o custo médio e lança a compra fora do lucro", () => {
    fixarRelogio("2026-11-07T10:00:00-03:00");
    const db = bancoDeTeste();
    const p = novoProduto(db, { nome: "Linha 10", custo_centavos: 100, preco_centavos: 300, estoque_inicial_mil: 10_000 });
    const e = registrarEntrada(db, {
      itens: [{ produto_id: p.id, quantidade_mil: 10_000, custo_unitario_centavos: 200 }],
      fornecedor: "Distribuidora Rio",
      observacao: "",
      financeiro: { pago: false, vencimento: "2026-11-20" },
    });
    expect(e.total_centavos).toBe(2000);
    expect(e.itens[0]).toMatchObject({ custo_medio_antes_centavos: 100, custo_medio_depois_centavos: 150 });
    expect(obterProduto(db, p.id)).toMatchObject({ estoque: 20, custo_centavos: 150 });

    const [l] = listarLancamentos(db);
    expect(l).toMatchObject({
      tipo: "despesa",
      valor_centavos: 2000,
      categoria_nome: "Compra de mercadoria",
      conta_no_resultado: false,
      situacao: "pendente",
      entrada_estoque_id: e.id,
    });
    // a compra não reduz o lucro: o custo entra quando a mercadoria é vendida
    expect(resultado(db, "2026-11-01", "2026-11-30").despesas.total_centavos).toBe(0);
    expect(resultado(db, "2026-11-01", "2026-11-30").fora_do_resultado.despesas[0]).toMatchObject({ total_centavos: 2000 });
  });

  test("paga a compra com o dinheiro da gaveta", () => {
    fixarRelogio("2026-11-07T10:00:00-03:00");
    const db = bancoDeTeste();
    const p = novoProduto(db, { nome: "Seda", custo_centavos: 20, preco_centavos: 50 });
    const caixa = abrirCaixaCom(db, 10_000);
    registrarEntrada(db, {
      itens: [{ produto_id: p.id, quantidade_mil: 100_000, custo_unitario_centavos: 25 }],
      fornecedor: "",
      observacao: "",
      financeiro: { pago: true, origem: "gaveta" },
    });
    expect(resumoDoCaixa(db, caixa.sessao.id).gaveta.esperado_centavos).toBe(10_000 - 2_500);
    // sem estoque antes, o custo passa a ser o da compra
    expect(obterProduto(db, p.id).custo_centavos).toBe(25);
  });

  test("recusa produto repetido ou sem controle de estoque", () => {
    const db = bancoDeTeste();
    const p = novoProduto(db, { nome: "Pipa" });
    const s = novoProduto(db, { nome: "Serviço", controla_estoque: false });
    const item = { produto_id: p.id, quantidade_mil: 1_000, custo_unitario_centavos: 100 };
    expect(erroDe(() => registrarEntrada(db, { itens: [item, item], fornecedor: "", observacao: "", financeiro: null })).mensagem).toContain(
      "duas vezes",
    );
    expect(
      erroDe(() => registrarEntrada(db, { itens: [{ ...item, produto_id: s.id }], fornecedor: "", observacao: "", financeiro: null })).mensagem,
    ).toContain("não controla estoque");
  });
});

describe("ajustes de estoque", () => {
  test("contagem acerta o saldo; perda sai a custo no resultado", () => {
    fixarRelogio("2026-11-07T10:00:00-03:00");
    const db = bancoDeTeste();
    const p = novoProduto(db, { nome: "Pipa", custo_centavos: 120, preco_centavos: 350, estoque_inicial_mil: 20_000, estoque_minimo_mil: 18_000 });
    ajustarEstoque(db, { produto_id: p.id, tipo: "contagem", nova_quantidade_mil: 19_000, observacao: "Inventário" });
    expect(obterProduto(db, p.id)).toMatchObject({ estoque: 19, situacao_estoque: "ok" });
    expect(erroDe(() => ajustarEstoque(db, { produto_id: p.id, tipo: "contagem", nova_quantidade_mil: 19_000, observacao: "" })).mensagem).toContain(
      "nada a ajustar",
    );
    ajustarEstoque(db, { produto_id: p.id, tipo: "perda", quantidade_mil: 2_000, observacao: "Rasgaram" });
    expect(obterProduto(db, p.id)).toMatchObject({ estoque: 17, situacao_estoque: "baixo" });

    const r = resultado(db, "2026-11-07", "2026-11-07");
    expect(r.perdas).toEqual({ total_centavos: 240, perda_centavos: 240, brinde_centavos: 0, uso_centavos: 0 });
    expect(r.lucro_liquido_centavos).toBe(-240);

    const historico = historicoDoProduto(db, p.id).movimentos.map((m) => [m.tipo, m.quantidade, m.saldo]);
    expect(historico).toEqual([
      ["perda", -2, 17],
      ["contagem", -1, 19],
      ["inicial", 20, 20],
    ]);
  });

  test("valor do estoque a custo e a preço de venda", () => {
    const db = bancoDeTeste();
    novoProduto(db, { nome: "A", custo_centavos: 100, preco_centavos: 300, estoque_inicial_mil: 10_000 });
    novoProduto(db, { nome: "B", custo_centavos: 250, preco_centavos: 500, estoque_inicial_mil: 0, estoque_minimo_mil: 1_000 });
    const r = relatorioEstoque(db);
    expect(r).toMatchObject({
      valor_a_custo_centavos: 1000,
      valor_a_preco_de_venda_centavos: 3000,
      lucro_potencial_centavos: 2000,
      zerados: 1,
    });
    expect(r.atencao.map((p) => p.nome)).toEqual(["B"]);
  });
});
