import { describe, expect, test } from "bun:test";
import { listarEntradas, registrarEntrada, registrarProducao } from "../src/dominio/estoque";
import { precoParaQuantidade } from "../src/dominio/precos";
import { alertasDeEstoque, salvarParametrosProducao, sugestaoDeProducao } from "../src/dominio/producao";
import { atualizarProduto, definirFabricado, historicoDoProduto, obterProduto } from "../src/dominio/produtos";
import { resultado } from "../src/dominio/relatorios";
import { cancelarVenda } from "../src/dominio/vendas";
import { abrirCaixaCom, bancoDeTeste, DINHEIRO, erroDe, fixarRelogio, novoProduto, vender } from "./ajuda";

const faixas = (...f: Array<[number, number]>) => f.map(([q, preco]) => ({ quantidade_mil: q * 1000, preco_centavos: preco }));

describe("preço por quantidade", () => {
  test("escolhe a maior faixa alcançada; abaixo da primeira vale o preço normal", () => {
    const tabela = [
      { quantidade_minima_mil: 10_000, preco_centavos: 1200 },
      { quantidade_minima_mil: 50_000, preco_centavos: 1000 },
    ];
    expect(precoParaQuantidade(1500, tabela, 9_000).preco_centavos).toBe(1500);
    expect(precoParaQuantidade(1500, tabela, 10_000).preco_centavos).toBe(1200);
    expect(precoParaQuantidade(1500, tabela, 49_000).preco_centavos).toBe(1200);
    expect(precoParaQuantidade(1500, tabela, 50_000)).toEqual({ preco_centavos: 1000, faixa: tabela[1]! });
    expect(precoParaQuantidade(1500, [], 100_000).faixa).toBeNull();
  });

  test("a venda usa o preço da faixa, guarda o preço normal e o desconto vem por cima", () => {
    fixarRelogio("2026-11-11T10:00:00-03:00");
    const db = bancoDeTeste();
    const pipa = novoProduto(db, { nome: "Pipa raia", custo_centavos: 600, preco_centavos: 1500, estoque_inicial_mil: 100_000, faixas_preco: faixas([10, 1200], [50, 1000]) });
    expect(obterProduto(db, pipa.id).precos_quantidade).toEqual([
      { quantidade: 10, preco_centavos: 1200 },
      { quantidade: 50, preco_centavos: 1000 },
    ]);
    abrirCaixaCom(db);

    const pouco = vender(db, [[pipa.id, 9]], [[DINHEIRO, 13_500]]);
    expect(pouco.itens[0]).toMatchObject({ preco_unitario_centavos: 1500, preco_base_centavos: 1500, subtotal_centavos: 13_500 });

    // 6 + 6 do mesmo produto somam 12 → faixa de 10
    const atacado = vender(db, [[pipa.id, 6], [pipa.id, 6]], [[DINHEIRO, 14_000]], { desconto_centavos: 400 });
    expect(atacado.itens).toHaveLength(1);
    expect(atacado.itens[0]).toMatchObject({ quantidade: 12, preco_unitario_centavos: 1200, preco_base_centavos: 1500, subtotal_centavos: 14_400 });
    expect(atacado.total_centavos).toBe(14_000);
    expect(atacado.lucro_bruto_centavos).toBe(14_000 - 12 * 600);

    // mudar a tabela depois não muda a venda antiga
    atualizarProduto(db, pipa.id, { ...obterProduto(db, pipa.id), estoque_minimo_mil: 0, faixas_preco: faixas([10, 900]) });
    const r = resultado(db, "2026-11-11", "2026-11-11");
    expect(r.vendas.receita_centavos).toBe(13_500 + 14_000);

    // cancelar devolve tudo certo
    cancelarVenda(db, atacado.id, "teste");
    expect(obterProduto(db, pipa.id).estoque).toBe(100 - 9);
  });

  test("faixa por metro aceita fração; por unidade, só número inteiro", () => {
    fixarRelogio("2026-11-11T10:00:00-03:00");
    const db = bancoDeTeste();
    const linha = novoProduto(db, { nome: "Linha por metro", unidade: "m", custo_centavos: 5, preco_centavos: 15, estoque_inicial_mil: 1_000_000, faixas_preco: [{ quantidade_mil: 100_500, preco_centavos: 12 }] });
    abrirCaixaCom(db);
    const v = vender(db, [[linha.id, 100.5]], [[DINHEIRO, 1206]]);
    expect(v.itens[0]).toMatchObject({ preco_unitario_centavos: 12, subtotal_centavos: 1206 });

    const e = erroDe(() => novoProduto(db, { nome: "Pipa", faixas_preco: [{ quantidade_mil: 2_500, preco_centavos: 100 }] }));
    expect(e.mensagem).toContain("só número inteiro");
  });

  test("recusa faixa de 1 unidade, quantidade repetida, mais de 10 faixas e troca de unidade que quebra a tabela", () => {
    fixarRelogio("2026-11-11T10:00:00-03:00");
    const db = bancoDeTeste();
    expect(erroDe(() => novoProduto(db, { nome: "A", faixas_preco: faixas([1, 100]) })).mensagem).toContain("acima de 1");
    expect(erroDe(() => novoProduto(db, { nome: "B", faixas_preco: faixas([5, 100], [5, 90]) })).mensagem).toContain("duas vezes");
    expect(erroDe(() => novoProduto(db, { nome: "C", faixas_preco: faixas(...Array.from({ length: 11 }, (_, i): [number, number] => [i + 2, 100])) })).mensagem).toContain("no máximo 10");
    const m = novoProduto(db, { nome: "Rabiola", unidade: "m", faixas_preco: [{ quantidade_mil: 2_500, preco_centavos: 80 }] });
    expect(erroDe(() => atualizarProduto(db, m.id, { ...obterProduto(db, m.id), unidade: "un", estoque_minimo_mil: 0 })).mensagem).toContain("só número inteiro");
    // lista vazia apaga a tabela
    atualizarProduto(db, m.id, { ...obterProduto(db, m.id), estoque_minimo_mil: 0, faixas_preco: [] });
    expect(obterProduto(db, m.id).precos_quantidade).toEqual([]);
  });
});

describe("produção", () => {
  test("registrar produção soma no estoque, atualiza o custo médio e fica no histórico como produção", () => {
    fixarRelogio("2026-11-11T10:00:00-03:00");
    const db = bancoDeTeste();
    const pipa = novoProduto(db, { nome: "Pipa raia", custo_centavos: 500, preco_centavos: 1500, estoque_inicial_mil: 10_000, fabricado: true });
    const e = registrarProducao(db, { itens: [{ produto_id: pipa.id, quantidade_mil: 30_000, custo_unitario_centavos: 700 }], observacao: "lote de sábado" }, { nome: "Thiago" });
    expect(e).toMatchObject({ tipo: "producao", usuario_nome: "Thiago", total_centavos: 21_000, lancamento_id: null });
    const p = obterProduto(db, pipa.id);
    expect(p.estoque).toBe(40);
    expect(p.custo_centavos).toBe(Math.round((10 * 500 + 30 * 700) / 40)); // 650
    expect(historicoDoProduto(db, pipa.id).movimentos[0]).toMatchObject({ tipo: "producao", quantidade: 30, saldo: 40 });
    expect(listarEntradas(db, { tipo: "producao" })).toHaveLength(1);
    expect(listarEntradas(db, { tipo: "compra" })).toHaveLength(0);
  });

  test("produto de revenda não entra como produção (entra como compra)", () => {
    fixarRelogio("2026-11-11T10:00:00-03:00");
    const db = bancoDeTeste();
    const carretilha = novoProduto(db, { nome: "Carretilha", custo_centavos: 5000, preco_centavos: 9000 });
    expect(erroDe(() => registrarProducao(db, { itens: [{ produto_id: carretilha.id, quantidade_mil: 1000, custo_unitario_centavos: 5000 }], observacao: "" })).mensagem).toContain("revenda");
    const compra = registrarEntrada(db, { itens: [{ produto_id: carretilha.id, quantidade_mil: 2000, custo_unitario_centavos: 5000 }], fornecedor: "Distribuidora", observacao: "", financeiro: null });
    expect(compra.tipo).toBe("compra");
  });
});

describe("sugestão de produção e alertas de estoque", () => {
  function cenario() {
    fixarRelogio("2026-10-01T09:00:00-03:00");
    const db = bancoDeTeste();
    const raia = novoProduto(db, { nome: "Pipa raia", custo_centavos: 600, preco_centavos: 1500, estoque_inicial_mil: 100_000, fabricado: true, lote_producao_mil: 20_000 });
    const lenta = novoProduto(db, { nome: "Pipa grande", custo_centavos: 2000, preco_centavos: 4500, estoque_inicial_mil: 50_000, fabricado: true });
    const linha = novoProduto(db, { nome: "Linha 10", custo_centavos: 540, preco_centavos: 1200, estoque_inicial_mil: 30_000, estoque_minimo_mil: 5_000 });
    const parada = novoProduto(db, { nome: "Pipa antiga", custo_centavos: 300, preco_centavos: 800, estoque_inicial_mil: 12_000 });
    abrirCaixaCom(db);
    // 30 dias: 3 raias por dia, 1 pipa grande a cada 3 dias e 1 linha por dia
    for (let dia = 1; dia <= 30; dia++) {
      fixarRelogio(`2026-10-${String(dia).padStart(2, "0")}T15:00:00-03:00`);
      vender(db, [[raia.id, 3], [linha.id, 1]], [[DINHEIRO, 5700]]);
      if (dia % 3 === 0) vender(db, [[lenta.id, 1]], [[DINHEIRO, 4500]]);
    }
    fixarRelogio("2026-10-30T18:00:00-03:00");
    return { db, raia, lenta, linha, parada };
  }

  test("calcula o ritmo, quantos dias o estoque dura e quanto produzir, arredondando para o lote", () => {
    const { db, raia, lenta, linha, parada } = cenario();
    const s = sugestaoDeProducao(db);
    expect(s.parametros).toEqual({ dias_alvo: 30, dias_historico: 30, alerta_dias: 7 });
    expect(s.de).toBe("2026-10-01");
    expect(s.ate).toBe("2026-10-30");
    const item = (id: number) => s.itens.find((i) => i.produto_id === id)!;

    // raia: vendeu 90 em 30 dias = 3/dia; sobrou 10 → dura 3,3 dias; alvo 90; falta 80 → lote de 20 → 80
    expect(item(raia.id)).toMatchObject({ vendido_periodo: 90, media_diaria: 3, estoque: 10, cobertura_dias: 3.3, alvo: 90, sugestao: 80, motivo: "cobertura_curta", fabricado: true });
    expect(item(raia.id).custo_estimado_centavos).toBe(80 * 600);
    // pipa grande: 10 em 30 dias; sobrou 40 → dura 120 dias: não precisa
    expect(item(lenta.id)).toMatchObject({ vendido_periodo: 10, estoque: 40, cobertura_dias: 120, sugestao: 0, motivo: null });
    // linha: 30 vendidas, 0 sobrando → zerada; alvo = 30 (ritmo) > mínimo 5 → comprar 30
    expect(item(linha.id)).toMatchObject({ estoque: 0, cobertura_dias: 0, alvo: 30, sugestao: 30, motivo: "zerado", fabricado: false });
    // sem venda: sem ritmo; sem mínimo; não sugere
    expect(item(parada.id)).toMatchObject({ media_diaria: null, cobertura_dias: null, sugestao: 0, motivo: null });

    // ordem: urgentes primeiro
    expect(s.itens.map((i) => i.nome)).toEqual(["Linha 10", "Pipa raia", "Pipa grande", "Pipa antiga"]);
    expect(s.resumo).toMatchObject({ produzir_itens: 1, comprar_itens: 1, produzir_custo_centavos: 48_000, comprar_custo_centavos: 30 * 540, sem_ritmo: 1 });
  });

  test("alerta de estoque acabando: zerado, no mínimo, ou que dura menos que o aviso", () => {
    const { db, raia, linha } = cenario();
    const alertas = alertasDeEstoque(db);
    expect(alertas.map((a) => [a.nome, a.motivo])).toEqual([
      ["Linha 10", "zerado"],
      ["Pipa raia", "cobertura_curta"],
    ]);
    expect(alertas[1]!.texto).toBe("10 un · dura ~3 dias no ritmo atual");
    // com aviso de 2 dias, a raia (3,3 dias) sai da lista
    salvarParametrosProducao(db, { alerta_dias: 2 });
    expect(alertasDeEstoque(db).map((a) => a.produto_id)).toEqual([linha.id]);
    expect(raia.id).toBeGreaterThan(0);
  });

  test("produto novo usa só os dias desde o cadastro e avisa que o histórico é curto", () => {
    fixarRelogio("2026-11-08T09:00:00-03:00");
    const db = bancoDeTeste();
    const nova = novoProduto(db, { nome: "Pipa nova", custo_centavos: 600, preco_centavos: 1500, estoque_inicial_mil: 20_000, fabricado: true });
    abrirCaixaCom(db);
    vender(db, [[nova.id, 6]], [[DINHEIRO, 9000]]);
    fixarRelogio("2026-11-10T18:00:00-03:00");
    const i = sugestaoDeProducao(db).itens[0]!;
    expect(i).toMatchObject({ dias_considerados: 3, vendido_periodo: 6, media_diaria: 2, pouco_historico: true, alvo: 60, sugestao: 46 });
  });

  test("negativo (vendeu sem estoque registrado) sugere repor o que falta + o alvo", () => {
    fixarRelogio("2026-11-10T09:00:00-03:00");
    const db = bancoDeTeste();
    const p = novoProduto(db, { nome: "Rabiola", custo_centavos: 100, preco_centavos: 300, estoque_minimo_mil: 5_000, fabricado: true });
    abrirCaixaCom(db);
    vender(db, [[p.id, 3]], [[DINHEIRO, 900]]);
    salvarParametrosProducao(db, { dias_historico: 7, dias_alvo: 1 });
    const i = sugestaoDeProducao(db).itens[0]!;
    // ritmo 3/dia (1 dia de cadastro) × 1 dia = 3; mínimo 5 → alvo 5; estoque −3 → produzir 8
    expect(i).toMatchObject({ estoque: -3, motivo: "negativo", alvo: 5, sugestao: 8 });
  });

  test("parâmetros fora do limite são recusados; produto marcado como feito aqui passa para Produzir", () => {
    const { db, linha } = cenario();
    expect(erroDe(() => salvarParametrosProducao(db, { dias_alvo: 0 })).mensagem).toContain("de 1 a 180");
    expect(erroDe(() => salvarParametrosProducao(db, { dias_historico: 3 })).mensagem).toContain("de 7 a 365");
    definirFabricado(db, linha.id, true);
    expect(sugestaoDeProducao(db).resumo).toMatchObject({ produzir_itens: 2, comprar_itens: 0 });
  });
});
