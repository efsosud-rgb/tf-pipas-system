import { describe, expect, test } from "bun:test";
import { fecharCaixa, resumoDoCaixa, saldoDaGaveta } from "../src/dominio/caixa";
import { salvarConfig } from "../src/dominio/config";
import { atualizarForma } from "../src/dominio/formas";
import { atualizarProduto, obterProduto } from "../src/dominio/produtos";
import { resultado } from "../src/dominio/relatorios";
import { cancelarVenda, listarVendas, obterVenda } from "../src/dominio/vendas";
import { abrirCaixaCom, bancoDeTeste, CREDITO, DINHEIRO, erroDe, fixarRelogio, novoProduto, PIX, vender } from "./ajuda";

function cenario() {
  fixarRelogio("2026-11-07T10:00:00-03:00");
  const db = bancoDeTeste();
  const pipa = novoProduto(db, { nome: "Pipa raia 40 cm", custo_centavos: 120, preco_centavos: 350, estoque_inicial_mil: 50_000 });
  const linha = novoProduto(db, { nome: "Linha 10 carretel", custo_centavos: 800, preco_centavos: 1500, estoque_inicial_mil: 10_000 });
  const rabiola = novoProduto(db, { nome: "Rabiola", unidade: "m", custo_centavos: 30, preco_centavos: 100, estoque_inicial_mil: 20_500 });
  return { db, pipa, linha, rabiola };
}

describe("venda", () => {
  test("não vende com o caixa fechado", () => {
    const { db, pipa } = cenario();
    const e = erroDe(() => vender(db, [[pipa.id, 1]], [[DINHEIRO, 350]]));
    expect(e.status).toBe(409);
    expect(e.mensagem).toContain("caixa está fechado");
  });

  test("pagamento dividido em dinheiro + PIX, com troco e desconto rateado", () => {
    const { db, pipa, linha } = cenario();
    abrirCaixaCom(db, 5000);
    const v = vender(db, [[pipa.id, 3], [linha.id, 1]], [[DINHEIRO, 2000], [PIX, 1000]], { desconto_centavos: 50 });

    expect(v.subtotal_centavos).toBe(2550);
    expect(v.desconto_centavos).toBe(50);
    expect(v.total_centavos).toBe(2500);
    expect(v.troco_centavos).toBe(500);
    expect(v.custo_centavos).toBe(3 * 120 + 800);
    expect(v.lucro_bruto_centavos).toBe(2500 - 1160);

    // desconto de R$ 0,50 dividido entre R$ 10,50 e R$ 15,00 sem perder centavo
    expect(v.itens.map((i) => i.desconto_centavos)).toEqual([21, 29]);
    expect(v.itens.map((i) => i.total_centavos)).toEqual([1029, 1471]);
    expect(v.itens.reduce((s, i) => s + i.total_centavos, 0)).toBe(v.total_centavos);

    const dinheiro = v.pagamentos.find((p) => p.forma_id === DINHEIRO)!;
    expect(dinheiro).toMatchObject({ recebido_centavos: 2000, troco_centavos: 500, valor_centavos: 1500 });
    expect(v.pagamentos.reduce((s, p) => s + p.valor_centavos, 0)).toBe(v.total_centavos);

    // estoque baixou e só o dinheiro (sem o troco) entrou na gaveta
    expect(obterProduto(db, pipa.id).estoque).toBe(47);
    expect(obterProduto(db, linha.id).estoque).toBe(9);
    expect(saldoDaGaveta(db, v.sessao_id)).toBe(5000 + 1500);
  });

  test("taxa do cartão é calculada e congelada na venda", () => {
    const { db, pipa } = cenario();
    atualizarForma(db, CREDITO, { taxa_bp: 499 });
    abrirCaixaCom(db);
    const v = vender(db, [[pipa.id, 1]], [[CREDITO, 350]]);
    expect(v.taxas_centavos).toBe(17);
    atualizarForma(db, CREDITO, { taxa_bp: 999 });
    expect(obterVenda(db, v.id).taxas_centavos).toBe(17);
  });

  test("preço e custo ficam congelados: mudar o produto depois não muda a venda", () => {
    const { db, pipa } = cenario();
    abrirCaixaCom(db);
    const v = vender(db, [[pipa.id, 2]], [[PIX, 700]]);
    atualizarProduto(db, pipa.id, { ...obterProduto(db, pipa.id), custo_centavos: 200, preco_centavos: 500, estoque_minimo_mil: 0 });
    const depois = obterVenda(db, v.id);
    expect(depois.total_centavos).toBe(700);
    expect(depois.custo_centavos).toBe(240);
    expect(resultado(db, "2026-11-07", "2026-11-07").cmv_centavos).toBe(240);
  });

  test("quantidade fracionada só em produto vendido por metro, quilo ou litro", () => {
    const { db, pipa, rabiola } = cenario();
    abrirCaixaCom(db);
    const v = vender(db, [[rabiola.id, 2.5]], [[PIX, 250]]);
    expect(v.total_centavos).toBe(250);
    expect(v.itens[0]!.quantidade).toBe(2.5);
    expect(obterProduto(db, rabiola.id).estoque).toBe(18);
    expect(erroDe(() => vender(db, [[pipa.id, 1.5]], [[PIX, 525]])).mensagem).toContain("só número inteiro");
  });

  test("o mesmo produto em duas linhas vira uma linha só", () => {
    const { db, pipa } = cenario();
    abrirCaixaCom(db);
    const v = vender(db, [[pipa.id, 1], [pipa.id, 2]], [[PIX, 1050]]);
    expect(v.itens).toHaveLength(1);
    expect(v.itens[0]!.quantidade).toBe(3);
  });

  test("recusa pagamentos errados", () => {
    const { db, pipa } = cenario();
    abrirCaixaCom(db);
    expect(erroDe(() => vender(db, [[pipa.id, 2]], [[PIX, 600]])).mensagem).toContain("Falta receber R$ 1,00");
    expect(erroDe(() => vender(db, [[pipa.id, 2]], [[PIX, 800]])).mensagem).toContain("Troco só sai do dinheiro");
    expect(erroDe(() => vender(db, [[pipa.id, 2]], [[PIX, 300], [PIX, 400]])).mensagem).toContain("aparece duas vezes");
    expect(erroDe(() => vender(db, [[pipa.id, 2]], [[PIX, 700], [DINHEIRO, 100]])).mensagem).toContain("volta todo como troco");
    expect(erroDe(() => vender(db, [[pipa.id, 2]], [[PIX, 700]], { desconto_centavos: 700 })).mensagem).toContain(
      "desconto não pode",
    );
    expect(erroDe(() => vender(db, [[pipa.id, 2]], [])).mensagem).toContain("forma de pagamento");
    atualizarForma(db, PIX, { ativo: false });
    expect(erroDe(() => vender(db, [[pipa.id, 2]], [[PIX, 700]])).mensagem).toContain("desativada");
  });

  test("troco quando o dinheiro cobre a diferença do cartão", () => {
    const { db, pipa } = cenario();
    abrirCaixaCom(db);
    // R$ 35,00 de venda: R$ 30,00 no cartão e uma nota de R$ 10,00 → R$ 5,00 de troco
    const v = vender(db, [[pipa.id, 10]], [[CREDITO, 3000], [DINHEIRO, 1000]]);
    expect(v.troco_centavos).toBe(500);
    expect(v.pagamentos.find((p) => p.forma_id === DINHEIRO)!.valor_centavos).toBe(500);
  });

  test("estoque: avisa e permite negativo por padrão; bloqueia quando desligado", () => {
    const { db, linha } = cenario();
    abrirCaixaCom(db);
    vender(db, [[linha.id, 11]], [[PIX, 16500]]);
    expect(obterProduto(db, linha.id).estoque).toBe(-1);
    expect(obterProduto(db, linha.id).situacao_estoque).toBe("negativo");
    salvarConfig(db, { permitir_estoque_negativo: false });
    expect(erroDe(() => vender(db, [[linha.id, 1]], [[PIX, 1500]])).mensagem).toContain("Estoque insuficiente");
  });

  test("produto desativado não pode ser vendido", () => {
    const { db, pipa } = cenario();
    abrirCaixaCom(db);
    atualizarProduto(db, pipa.id, { ...obterProduto(db, pipa.id), estoque_minimo_mil: 0, ativo: false });
    expect(erroDe(() => vender(db, [[pipa.id, 1]], [[PIX, 350]])).mensagem).toContain("desativado");
  });

  test("produto sem controle de estoque não mexe no estoque", () => {
    const { db } = cenario();
    const servico = novoProduto(db, { nome: "Montagem de pipa", controla_estoque: false, custo_centavos: 0, preco_centavos: 500 });
    abrirCaixaCom(db);
    vender(db, [[servico.id, 2]], [[PIX, 1000]]);
    expect(obterProduto(db, servico.id).estoque).toBe(0);
    expect(obterProduto(db, servico.id).situacao_estoque).toBe("sem_controle");
  });

  test("numera as vendas em sequência e lista as do dia", () => {
    const { db, pipa } = cenario();
    abrirCaixaCom(db);
    const a = vender(db, [[pipa.id, 1]], [[PIX, 350]]);
    const b = vender(db, [[pipa.id, 1]], [[DINHEIRO, 350]]);
    expect(b.numero).toBe(a.numero + 1);
    const lista = listarVendas(db, { de: "2026-11-07", ate: "2026-11-07" });
    expect(lista.map((v) => v.numero)).toEqual([b.numero, a.numero]);
    expect(lista[0]!.formas).toBe("Dinheiro");
  });
});

describe("cancelamento", () => {
  test("devolve estoque, tira o dinheiro da gaveta e some dos relatórios", () => {
    const { db, pipa, linha } = cenario();
    abrirCaixaCom(db, 5000);
    const v = vender(db, [[pipa.id, 3], [linha.id, 1]], [[DINHEIRO, 2000], [PIX, 1000]], { desconto_centavos: 50 });
    const c = cancelarVenda(db, v.id, "Cliente desistiu");
    expect(c.status).toBe("cancelada");
    expect(c.motivo_cancelamento).toBe("Cliente desistiu");
    expect(obterProduto(db, pipa.id).estoque).toBe(50);
    expect(obterProduto(db, linha.id).estoque).toBe(10);
    expect(saldoDaGaveta(db, v.sessao_id)).toBe(5000);

    const r = resultado(db, "2026-11-07", "2026-11-07");
    expect(r.vendas.receita_centavos).toBe(0);
    expect(r.cmv_centavos).toBe(0);
    expect(r.vendas.canceladas_quantidade).toBe(1);
    expect(r.vendas.canceladas_total_centavos).toBe(2500);

    const resumo = resumoDoCaixa(db, v.sessao_id);
    expect(resumo.vendas.quantidade).toBe(0);
    expect(resumo.gaveta.cancelamentos_centavos).toBe(1500);
  });

  test("não cancela duas vezes e exige motivo", () => {
    const { db, pipa } = cenario();
    abrirCaixaCom(db);
    const v = vender(db, [[pipa.id, 1]], [[PIX, 350]]);
    expect(erroDe(() => cancelarVenda(db, v.id, "  ")).mensagem).toContain("motivo");
    cancelarVenda(db, v.id, "Erro no lançamento");
    expect(erroDe(() => cancelarVenda(db, v.id, "De novo")).status).toBe(409);
  });

  test("venda em dinheiro de um caixa já fechado: precisa de caixa aberto para devolver", () => {
    const { db, pipa } = cenario();
    abrirCaixaCom(db, 1000);
    const v = vender(db, [[pipa.id, 1]], [[DINHEIRO, 350]]);
    fecharCaixa(db, { contado_centavos: 1350, operador: "", observacao: "" });
    expect(erroDe(() => cancelarVenda(db, v.id, "Defeito")).mensagem).toContain("devolver o dinheiro");

    const novo = abrirCaixaCom(db, 1000);
    cancelarVenda(db, v.id, "Defeito");
    expect(saldoDaGaveta(db, novo.sessao.id)).toBe(1000 - 350);
    // o caixa antigo continua como foi fechado
    expect(resumoDoCaixa(db, v.sessao_id).gaveta.esperado_centavos).toBe(1350);
  });

  test("não devolve mais dinheiro do que há na gaveta", () => {
    const { db, linha } = cenario();
    abrirCaixaCom(db, 0);
    const v = vender(db, [[linha.id, 1]], [[DINHEIRO, 1500]]);
    fecharCaixa(db, { contado_centavos: 1500, operador: "", observacao: "" });
    abrirCaixaCom(db, 1000);
    expect(erroDe(() => cancelarVenda(db, v.id, "Troca")).mensagem).toContain("A gaveta tem R$ 10,00");
  });
});
