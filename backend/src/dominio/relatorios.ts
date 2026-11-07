import type { Banco } from "../banco";
import { margemBp, valorDaQuantidade } from "../dinheiro";
import { deMil } from "../quantidade";
import { dataLocal, diferencaEmDias, primeiroDiaDoMes, somarDias, somarMeses } from "../relogio";
import { resumoDoCaixa, saldoDaGaveta, sessaoAberta } from "./caixa";
import { contasPendentes } from "./financeiro";
import { listarProdutos, paraProduto, type LinhaProduto } from "./produtos";
import { listarVendas } from "./vendas";

/**
 * Relatórios. Tudo sai das vendas e lançamentos gravados: nenhum número é
 * estimado. Quando não há base para um número (ex.: margem sem venda), o
 * valor vem null e a tela mostra "—".
 *
 * Lucro (resultado) usa a data de referência dos lançamentos (competência).
 * Vendas canceladas ficam fora de todos os totais.
 */

export interface LinhaCategoriaResultado {
  categoria_id: number;
  nome: string;
  total_centavos: number;
  pendente_centavos: number;
}

export interface Resultado {
  de: string;
  ate: string;
  vendas: {
    quantidade: number;
    bruto_centavos: number;
    descontos_centavos: number;
    receita_centavos: number;
    ticket_medio_centavos: number | null;
    canceladas_quantidade: number;
    canceladas_total_centavos: number;
  };
  cmv_centavos: number;
  lucro_bruto_centavos: number;
  margem_bruta_bp: number | null;
  taxas_centavos: number;
  perdas: { total_centavos: number; perda_centavos: number; brinde_centavos: number; uso_centavos: number };
  outras_receitas: { total_centavos: number; pendente_centavos: number; por_categoria: LinhaCategoriaResultado[] };
  despesas: { total_centavos: number; pendente_centavos: number; por_categoria: LinhaCategoriaResultado[] };
  lucro_liquido_centavos: number;
  margem_liquida_bp: number | null;
  fora_do_resultado: { receitas: LinhaCategoriaResultado[]; despesas: LinhaCategoriaResultado[] };
}

function lancamentosPorCategoria(
  db: Banco,
  de: string,
  ate: string,
  tipo: "receita" | "despesa",
  contaNoResultado: 0 | 1,
): LinhaCategoriaResultado[] {
  return db
    .query(
      `SELECT c.id AS categoria_id, c.nome, SUM(l.valor_centavos) AS total_centavos,
              SUM(CASE WHEN l.pago = 0 THEN l.valor_centavos ELSE 0 END) AS pendente_centavos
       FROM lancamentos l JOIN categorias_financeiras c ON c.id = l.categoria_id
       WHERE l.tipo = $tipo AND c.conta_no_resultado = $conta AND l.data BETWEEN $de AND $ate
       GROUP BY c.id ORDER BY total_centavos DESC, c.nome`,
    )
    .all({ tipo, conta: contaNoResultado, de, ate }) as LinhaCategoriaResultado[];
}

const somar = (linhas: LinhaCategoriaResultado[], campo: "total_centavos" | "pendente_centavos") =>
  linhas.reduce((s, l) => s + l[campo], 0);

export function resultado(db: Banco, de: string, ate: string): Resultado {
  const v = db
    .query(
      `SELECT COUNT(*) AS quantidade,
              COALESCE(SUM(subtotal_centavos), 0) AS bruto, COALESCE(SUM(desconto_centavos), 0) AS descontos,
              COALESCE(SUM(total_centavos), 0) AS receita, COALESCE(SUM(custo_centavos), 0) AS custo,
              COALESCE(SUM(taxas_centavos), 0) AS taxas
       FROM vendas WHERE status = 'concluida' AND data BETWEEN $de AND $ate`,
    )
    .get({ de, ate }) as { quantidade: number; bruto: number; descontos: number; receita: number; custo: number; taxas: number };
  const c = db
    .query(
      `SELECT COUNT(*) AS quantidade, COALESCE(SUM(total_centavos), 0) AS total
       FROM vendas WHERE status = 'cancelada' AND data BETWEEN $de AND $ate`,
    )
    .get({ de, ate }) as { quantidade: number; total: number };

  const movimentosPerda = db
    .query(
      `SELECT tipo, quantidade_mil, custo_unitario_centavos FROM movimentos_estoque
       WHERE tipo IN ('perda', 'brinde', 'uso') AND data BETWEEN $de AND $ate`,
    )
    .all({ de, ate }) as Array<{ tipo: "perda" | "brinde" | "uso"; quantidade_mil: number; custo_unitario_centavos: number }>;
  const perdas = { total_centavos: 0, perda_centavos: 0, brinde_centavos: 0, uso_centavos: 0 };
  for (const m of movimentosPerda) {
    const valor = valorDaQuantidade(-m.quantidade_mil, m.custo_unitario_centavos);
    perdas.total_centavos += valor;
    perdas[`${m.tipo}_centavos`] += valor;
  }

  const receitas = lancamentosPorCategoria(db, de, ate, "receita", 1);
  const despesas = lancamentosPorCategoria(db, de, ate, "despesa", 1);
  const lucroBruto = v.receita - v.custo;
  const outras = somar(receitas, "total_centavos");
  const totalDespesas = somar(despesas, "total_centavos");
  const lucroLiquido = lucroBruto - v.taxas - perdas.total_centavos + outras - totalDespesas;

  return {
    de,
    ate,
    vendas: {
      quantidade: v.quantidade,
      bruto_centavos: v.bruto,
      descontos_centavos: v.descontos,
      receita_centavos: v.receita,
      ticket_medio_centavos: v.quantidade > 0 ? Math.round(v.receita / v.quantidade) : null,
      canceladas_quantidade: c.quantidade,
      canceladas_total_centavos: c.total,
    },
    cmv_centavos: v.custo,
    lucro_bruto_centavos: lucroBruto,
    margem_bruta_bp: margemBp(lucroBruto, v.receita),
    taxas_centavos: v.taxas,
    perdas,
    outras_receitas: { total_centavos: outras, pendente_centavos: somar(receitas, "pendente_centavos"), por_categoria: receitas },
    despesas: { total_centavos: totalDespesas, pendente_centavos: somar(despesas, "pendente_centavos"), por_categoria: despesas },
    lucro_liquido_centavos: lucroLiquido,
    margem_liquida_bp: margemBp(lucroLiquido, v.receita + outras),
    fora_do_resultado: {
      receitas: lancamentosPorCategoria(db, de, ate, "receita", 0),
      despesas: lancamentosPorCategoria(db, de, ate, "despesa", 0),
    },
  };
}

export interface LinhaProdutoVendido {
  produto_id: number;
  nome: string;
  categoria: string;
  unidade: string;
  quantidade: number;
  receita_centavos: number;
  custo_centavos: number;
  lucro_centavos: number;
  margem_bp: number | null;
  /** Participação no lucro bruto do período, em pontos-base; null quando o lucro total não é positivo. */
  participacao_lucro_bp: number | null;
}

export function porProduto(db: Banco, de: string, ate: string) {
  const linhas = db
    .query(
      `SELECT i.produto_id, p.nome, p.categoria, p.unidade, SUM(i.quantidade_mil) AS quantidade_mil,
              SUM(i.total_centavos) AS receita, SUM(i.custo_total_centavos) AS custo
       FROM venda_itens i
       JOIN vendas v ON v.id = i.venda_id
       JOIN produtos p ON p.id = i.produto_id
       WHERE v.status = 'concluida' AND v.data BETWEEN $de AND $ate
       GROUP BY i.produto_id`,
    )
    .all({ de, ate }) as Array<{
    produto_id: number;
    nome: string;
    categoria: string;
    unidade: string;
    quantidade_mil: number;
    receita: number;
    custo: number;
  }>;
  const lucroTotal = linhas.reduce((s, l) => s + (l.receita - l.custo), 0);
  const produtos: LinhaProdutoVendido[] = linhas
    .map((l) => {
      const lucro = l.receita - l.custo;
      return {
        produto_id: l.produto_id,
        nome: l.nome,
        categoria: l.categoria,
        unidade: l.unidade,
        quantidade: deMil(l.quantidade_mil),
        receita_centavos: l.receita,
        custo_centavos: l.custo,
        lucro_centavos: lucro,
        margem_bp: margemBp(lucro, l.receita),
        participacao_lucro_bp: lucroTotal > 0 ? Math.round((lucro * 10_000) / lucroTotal) : null,
      };
    })
    .sort((a, b) => b.lucro_centavos - a.lucro_centavos || b.receita_centavos - a.receita_centavos || a.nome.localeCompare(b.nome));
  const receita = linhas.reduce((s, l) => s + l.receita, 0);
  const custo = linhas.reduce((s, l) => s + l.custo, 0);
  return {
    de,
    ate,
    produtos,
    totais: { receita_centavos: receita, custo_centavos: custo, lucro_centavos: receita - custo, margem_bp: margemBp(receita - custo, receita) },
  };
}

export function porFormaPagamento(db: Banco, de: string, ate: string) {
  const formas = db
    .query(
      `SELECT vp.forma_id, f.nome, f.tipo, COUNT(DISTINCT vp.venda_id) AS vendas,
              SUM(vp.valor_centavos) AS valor_centavos, SUM(vp.taxa_centavos) AS taxas_centavos
       FROM venda_pagamentos vp
       JOIN vendas v ON v.id = vp.venda_id
       JOIN formas_pagamento f ON f.id = vp.forma_id
       WHERE v.status = 'concluida' AND v.data BETWEEN $de AND $ate
       GROUP BY vp.forma_id ORDER BY valor_centavos DESC`,
    )
    .all({ de, ate }) as Array<{
    forma_id: number;
    nome: string;
    tipo: string;
    vendas: number;
    valor_centavos: number;
    taxas_centavos: number;
  }>;
  const total = formas.reduce((s, f) => s + f.valor_centavos, 0);
  return {
    de,
    ate,
    formas: formas.map((f) => ({
      ...f,
      liquido_centavos: f.valor_centavos - f.taxas_centavos,
      participacao_bp: total > 0 ? Math.round((f.valor_centavos * 10_000) / total) : null,
    })),
    totais: {
      valor_centavos: total,
      taxas_centavos: formas.reduce((s, f) => s + f.taxas_centavos, 0),
    },
  };
}

export interface PontoPeriodo {
  chave: string;
  vendas: number;
  receita_centavos: number;
  lucro_bruto_centavos: number;
}

/** Vendas por dia (até 62 dias) ou por mês (períodos maiores). Dias sem venda aparecem com zero. */
export function vendasNoTempo(db: Banco, de: string, ate: string): { agrupamento: "dia" | "mes"; pontos: PontoPeriodo[] } {
  const porMes = diferencaEmDias(de, ate) > 62;
  const chaveSql = porMes ? "substr(data, 1, 7)" : "data";
  const linhas = db
    .query(
      `SELECT ${chaveSql} AS chave, COUNT(*) AS vendas, SUM(total_centavos) AS receita, SUM(total_centavos - custo_centavos) AS lucro
       FROM vendas WHERE status = 'concluida' AND data BETWEEN $de AND $ate
       GROUP BY chave`,
    )
    .all({ de, ate }) as Array<{ chave: string; vendas: number; receita: number; lucro: number }>;
  const mapa = new Map(linhas.map((l) => [l.chave, l]));
  const chaves: string[] = [];
  if (porMes) {
    for (let m = primeiroDiaDoMes(de); m <= ate; m = somarMeses(m, 1)) chaves.push(m.slice(0, 7));
  } else {
    for (let d = de; d <= ate; d = somarDias(d, 1)) chaves.push(d);
  }
  return {
    agrupamento: porMes ? "mes" : "dia",
    pontos: chaves.map((chave) => {
      const l = mapa.get(chave);
      return { chave, vendas: l?.vendas ?? 0, receita_centavos: l?.receita ?? 0, lucro_bruto_centavos: l?.lucro ?? 0 };
    }),
  };
}

export function relatorioEstoque(db: Banco) {
  const linhas = db
    .query("SELECT * FROM produtos WHERE ativo = 1 AND controla_estoque = 1 ORDER BY nome COLLATE NOCASE")
    .all() as LinhaProduto[];
  let valorCusto = 0;
  let valorVenda = 0;
  for (const l of linhas) {
    if (l.estoque_mil > 0) {
      valorCusto += valorDaQuantidade(l.estoque_mil, l.custo_centavos);
      valorVenda += valorDaQuantidade(l.estoque_mil, l.preco_centavos);
    }
  }
  const produtos = linhas.map(paraProduto);
  const atencao = produtos
    .filter((p) => p.situacao_estoque !== "ok")
    .sort((a, b) => {
      const ordem = { negativo: 0, zerado: 1, baixo: 2, ok: 3, sem_controle: 4 } as const;
      return ordem[a.situacao_estoque] - ordem[b.situacao_estoque] || a.nome.localeCompare(b.nome);
    });
  return {
    produtos_com_estoque: linhas.length,
    valor_a_custo_centavos: valorCusto,
    valor_a_preco_de_venda_centavos: valorVenda,
    lucro_potencial_centavos: valorVenda - valorCusto,
    negativos: produtos.filter((p) => p.situacao_estoque === "negativo").length,
    zerados: produtos.filter((p) => p.situacao_estoque === "zerado").length,
    abaixo_do_minimo: produtos.filter((p) => p.situacao_estoque === "baixo").length,
    atencao,
  };
}

/** Painel da tela inicial: hoje, o mês até hoje, caixa, contas e estoque. */
export function painelInicio(db: Banco) {
  const hoje = dataLocal();
  const inicioMes = primeiroDiaDoMes(hoje);
  const doDia = resultado(db, hoje, hoje);
  const doMes = resultado(db, inicioMes, hoje);
  const sessao = sessaoAberta(db);
  const ultimoFechamento = db
    .query(
      "SELECT id, fechado_em, esperado_centavos, contado_centavos, diferenca_centavos FROM sessoes_caixa WHERE fechado_em IS NOT NULL ORDER BY id DESC LIMIT 1",
    )
    .get() as { id: number; fechado_em: string; esperado_centavos: number; contado_centavos: number; diferenca_centavos: number } | null;
  const contas = contasPendentes(db);
  const limite7 = somarDias(hoje, 7);
  const estoque = relatorioEstoque(db);
  const totalProdutos = (db.query("SELECT COUNT(*) AS n FROM produtos WHERE ativo = 1").get() as { n: number }).n;
  const resumoSessao = sessao ? resumoDoCaixa(db, sessao.id) : null;
  return {
    hoje,
    dia: {
      vendas: doDia.vendas.quantidade,
      receita_centavos: doDia.vendas.receita_centavos,
      lucro_bruto_centavos: doDia.lucro_bruto_centavos,
      margem_bruta_bp: doDia.margem_bruta_bp,
      ticket_medio_centavos: doDia.vendas.ticket_medio_centavos,
    },
    mes: {
      de: inicioMes,
      ate: hoje,
      vendas: doMes.vendas.quantidade,
      receita_centavos: doMes.vendas.receita_centavos,
      lucro_bruto_centavos: doMes.lucro_bruto_centavos,
      despesas_centavos: doMes.despesas.total_centavos,
      lucro_liquido_centavos: doMes.lucro_liquido_centavos,
      margem_liquida_bp: doMes.margem_liquida_bp,
    },
    caixa: sessao
      ? {
          aberto: true as const,
          sessao_id: sessao.id,
          aberto_em: sessao.aberto_em,
          operador: sessao.operador_abertura,
          dinheiro_na_gaveta_centavos: saldoDaGaveta(db, sessao.id),
          vendas: resumoSessao!.vendas.quantidade,
          vendas_total_centavos: resumoSessao!.vendas.total_centavos,
        }
      : { aberto: false as const, ultimo_fechamento: ultimoFechamento },
    contas: {
      vencidas: contas.lancamentos.filter((l) => l.situacao === "vencido").slice(0, 6),
      proximas: contas.lancamentos.filter((l) => l.situacao === "pendente" && l.vencimento! <= limite7).slice(0, 6),
      vencidas_quantidade: contas.vencidas_quantidade,
      a_pagar_centavos: contas.a_pagar_centavos,
      a_receber_centavos: contas.a_receber_centavos,
    },
    estoque: {
      atencao: estoque.atencao.slice(0, 6),
      atencao_quantidade: estoque.atencao.length,
    },
    ultimas_vendas: listarVendas(db, { limite: 6 }),
    produtos_ativos: totalProdutos,
    mais_vendidos_mes: porProduto(db, inicioMes, hoje).produtos.slice(0, 5),
    produtos_sem_custo: listarProdutos(db).filter((p) => p.custo_centavos === 0).length,
  };
}
