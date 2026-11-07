import type { Banco } from "../banco";
import { transacao } from "../banco";
import { ErroNegocio, naoEncontrado } from "../erros";
import { agoraIso, dataLocal, ehDataValida, somarMeses } from "../relogio";
import { exigirCaixaAberto, lancarNaGaveta, sessaoAberta } from "./caixa";

/**
 * Financeiro: receitas e despesas que não são venda de balcão (aluguel, luz,
 * compra de mercadoria, serviço extra...).
 *
 * - `data` é o dia a que o lançamento se refere (entra no lucro desse período);
 * - `vencimento` é quando uma conta pendente precisa ser paga ou recebida;
 * - `data_pagamento` é quando o dinheiro de fato saiu ou entrou.
 * Pagamento com origem "gaveta" mexe no dinheiro do caixa aberto.
 */

export type TipoLancamento = "receita" | "despesa";
export type Origem = "gaveta" | "conta";

interface LinhaCategoria {
  id: number;
  nome: string;
  tipo: TipoLancamento;
  conta_no_resultado: number;
  sistema: string | null;
  ativo: number;
}

export interface Categoria {
  id: number;
  nome: string;
  tipo: TipoLancamento;
  /** Se entra no cálculo do lucro. Compra de mercadoria e retiradas do dono não entram. */
  conta_no_resultado: boolean;
  sistema: string | null;
  ativo: boolean;
  lancamentos: number;
}

export function listarCategorias(
  db: Banco,
  filtro: { tipo?: TipoLancamento; incluirInativas?: boolean } = {},
): Categoria[] {
  const linhas = db
    .query(
      `SELECT c.*, (SELECT COUNT(*) FROM lancamentos l WHERE l.categoria_id = c.id) AS lancamentos
       FROM categorias_financeiras c
       WHERE ($tipo IS NULL OR c.tipo = $tipo) AND ($todas = 1 OR c.ativo = 1)
       ORDER BY c.tipo, c.conta_no_resultado DESC, c.nome COLLATE NOCASE`,
    )
    .all({ tipo: filtro.tipo ?? null, todas: filtro.incluirInativas ? 1 : 0 }) as Array<
    LinhaCategoria & { lancamentos: number }
  >;
  return linhas.map((l) => ({
    id: l.id,
    nome: l.nome,
    tipo: l.tipo,
    conta_no_resultado: l.conta_no_resultado === 1,
    sistema: l.sistema,
    ativo: l.ativo === 1,
    lancamentos: l.lancamentos,
  }));
}

function exigirCategoria(db: Banco, id: number): LinhaCategoria {
  const c = db.query("SELECT * FROM categorias_financeiras WHERE id = $id").get({ id }) as LinhaCategoria | null;
  if (!c) throw naoEncontrado("Categoria não encontrada.");
  return c;
}

export function categoriaDoSistema(db: Banco, sistema: string): LinhaCategoria {
  const c = db
    .query("SELECT * FROM categorias_financeiras WHERE sistema = $s")
    .get({ s: sistema }) as LinhaCategoria | null;
  if (!c) throw new Error(`Categoria do sistema "${sistema}" não existe.`);
  return c;
}

function nomeCategoriaDisponivel(db: Banco, nome: string, tipo: TipoLancamento, idAtual: number): void {
  const outra = db
    .query("SELECT id FROM categorias_financeiras WHERE tipo = $tipo AND nome = $nome AND id <> $id")
    .get({ tipo, nome, id: idAtual }) as { id: number } | null;
  if (outra) throw new ErroNegocio("Já existe uma categoria com esse nome.", 409, "nome");
}

export function criarCategoria(
  db: Banco,
  dados: { nome: string; tipo: TipoLancamento; conta_no_resultado: boolean },
): Categoria {
  return transacao(db, () => {
    const nome = dados.nome.trim();
    if (!nome) throw new ErroNegocio("Informe o nome da categoria.", 422, "nome");
    nomeCategoriaDisponivel(db, nome, dados.tipo, 0);
    const { id } = db
      .query(
        `INSERT INTO categorias_financeiras (nome, tipo, conta_no_resultado) VALUES ($nome, $tipo, $conta) RETURNING id`,
      )
      .get({ nome, tipo: dados.tipo, conta: dados.conta_no_resultado ? 1 : 0 }) as { id: number };
    return listarCategorias(db, { incluirInativas: true }).find((c) => c.id === id)!;
  });
}

export function atualizarCategoria(
  db: Banco,
  id: number,
  dados: { nome?: string; conta_no_resultado?: boolean; ativo?: boolean },
): Categoria {
  return transacao(db, () => {
    const atual = exigirCategoria(db, id);
    const nome = dados.nome?.trim() ?? atual.nome;
    if (!nome) throw new ErroNegocio("Informe o nome da categoria.", 422, "nome");
    nomeCategoriaDisponivel(db, nome, atual.tipo, id);
    if (atual.sistema === "compra_mercadoria") {
      if (dados.conta_no_resultado === true) {
        throw new ErroNegocio(
          "Compra de mercadoria não conta no lucro: o custo entra quando o produto é vendido. Contar as duas vezes dobraria o custo.",
          422,
        );
      }
      if (dados.ativo === false) throw new ErroNegocio("Essa categoria é usada pelas compras de mercadoria e não pode ser desativada.", 422);
    }
    db.query(
      "UPDATE categorias_financeiras SET nome = $nome, conta_no_resultado = $conta, ativo = $ativo WHERE id = $id",
    ).run({
      id,
      nome,
      conta: dados.conta_no_resultado === undefined ? atual.conta_no_resultado : dados.conta_no_resultado ? 1 : 0,
      ativo: dados.ativo === undefined ? atual.ativo : dados.ativo ? 1 : 0,
    });
    return listarCategorias(db, { incluirInativas: true }).find((c) => c.id === id)!;
  });
}

interface LinhaLancamento {
  id: number;
  tipo: TipoLancamento;
  descricao: string;
  categoria_id: number;
  valor_centavos: number;
  data: string;
  vencimento: string | null;
  pago: number;
  data_pagamento: string | null;
  origem: Origem | null;
  sessao_id: number | null;
  grupo_repeticao: string | null;
  parcela: number | null;
  parcelas: number | null;
  observacao: string;
  criado_em: string;
  atualizado_em: string;
  categoria_nome: string;
  conta_no_resultado: number;
  entrada_estoque_id: number | null;
}

export interface Lancamento extends Omit<LinhaLancamento, "pago" | "conta_no_resultado"> {
  pago: boolean;
  conta_no_resultado: boolean;
  situacao: "pago" | "pendente" | "vencido";
}

const SELECT_LANCAMENTO = `
  SELECT l.*, c.nome AS categoria_nome, c.conta_no_resultado,
         (SELECT e.id FROM entradas_estoque e WHERE e.lancamento_id = l.id) AS entrada_estoque_id
  FROM lancamentos l JOIN categorias_financeiras c ON c.id = l.categoria_id`;

function paraLancamento(l: LinhaLancamento, hoje: string): Lancamento {
  const pago = l.pago === 1;
  return {
    ...l,
    pago,
    conta_no_resultado: l.conta_no_resultado === 1,
    situacao: pago ? "pago" : l.vencimento && l.vencimento < hoje ? "vencido" : "pendente",
  };
}

function linhaLancamento(db: Banco, id: number): LinhaLancamento {
  const l = db.query(`${SELECT_LANCAMENTO} WHERE l.id = $id`).get({ id }) as LinhaLancamento | null;
  if (!l) throw naoEncontrado("Lançamento não encontrado.");
  return l;
}

export function obterLancamento(db: Banco, id: number): Lancamento {
  return paraLancamento(linhaLancamento(db, id), dataLocal());
}

export interface FiltroLancamentos {
  de?: string;
  ate?: string;
  tipo?: TipoLancamento;
  situacao?: "pago" | "pendente" | "vencido";
  categoria_id?: number;
}

export function listarLancamentos(db: Banco, filtro: FiltroLancamentos = {}): Lancamento[] {
  const hoje = dataLocal();
  const cond: string[] = [];
  const p: Record<string, string | number> = {};
  if (filtro.de) {
    cond.push("l.data >= $de");
    p.de = filtro.de;
  }
  if (filtro.ate) {
    cond.push("l.data <= $ate");
    p.ate = filtro.ate;
  }
  if (filtro.tipo) {
    cond.push("l.tipo = $tipo");
    p.tipo = filtro.tipo;
  }
  if (filtro.categoria_id) {
    cond.push("l.categoria_id = $cat");
    p.cat = filtro.categoria_id;
  }
  if (filtro.situacao === "pago") cond.push("l.pago = 1");
  if (filtro.situacao === "pendente") cond.push("l.pago = 0");
  if (filtro.situacao === "vencido") {
    cond.push("l.pago = 0 AND l.vencimento < $hoje");
    p.hoje = hoje;
  }
  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  const linhas = db.query(`${SELECT_LANCAMENTO} ${where} ORDER BY l.data DESC, l.id DESC`).all(p) as LinhaLancamento[];
  return linhas.map((l) => paraLancamento(l, hoje));
}

export type Pagamento =
  | { pago: true; data_pagamento: string; origem: Origem }
  | { pago: false; vencimento: string };

function validarPagamento(pagamento: Pagamento): void {
  const hoje = dataLocal();
  if (pagamento.pago) {
    if (!ehDataValida(pagamento.data_pagamento)) throw new ErroNegocio("Data do pagamento inválida.", 422, "data_pagamento");
    if (pagamento.data_pagamento > hoje) {
      throw new ErroNegocio("A data do pagamento não pode ser depois de hoje. Para uma conta futura, marque como pendente.", 422, "data_pagamento");
    }
    if (pagamento.origem === "gaveta" && pagamento.data_pagamento !== hoje) {
      throw new ErroNegocio(
        "Dinheiro da gaveta só pode ser usado hoje. Para um pagamento de outro dia, escolha \"Banco / PIX / cartão\".",
        422,
        "origem",
      );
    }
  } else if (!ehDataValida(pagamento.vencimento)) {
    throw new ErroNegocio("Informe a data de vencimento.", 422, "vencimento");
  }
}

/** Move o dinheiro na gaveta quando o pagamento é feito com o dinheiro do caixa. */
function movimentarGavetaDoLancamento(db: Banco, l: { id: number; tipo: TipoLancamento; descricao: string; valor_centavos: number }): number {
  const sessao = exigirCaixaAberto(db, "usar o dinheiro da gaveta");
  lancarNaGaveta(db, {
    sessaoId: sessao.id,
    tipo: l.tipo,
    valorCentavos: l.tipo === "despesa" ? -l.valor_centavos : l.valor_centavos,
    descricao: l.descricao,
    lancamentoId: l.id,
  });
  return sessao.id;
}

export interface NovoLancamento {
  tipo: TipoLancamento;
  descricao: string;
  categoria_id: number;
  valor_centavos: number;
  data: string;
  observacao: string;
  pagamento: Pagamento;
  /** 1 = não repete. Até 60 meses. */
  repetir_meses: number;
}

export function criarLancamento(db: Banco, dados: NovoLancamento): Lancamento[] {
  return transacao(db, () => {
    const descricao = dados.descricao.trim();
    if (!descricao) throw new ErroNegocio("Informe a descrição.", 422, "descricao");
    if (!Number.isSafeInteger(dados.valor_centavos) || dados.valor_centavos <= 0) {
      throw new ErroNegocio("Informe um valor maior que zero.", 422, "valor_centavos");
    }
    if (!ehDataValida(dados.data)) throw new ErroNegocio("Data inválida.", 422, "data");
    const categoria = exigirCategoria(db, dados.categoria_id);
    if (categoria.tipo !== dados.tipo) throw new ErroNegocio("Essa categoria não é do tipo escolhido.", 422, "categoria_id");
    if (!categoria.ativo) throw new ErroNegocio("Essa categoria está desativada.", 422, "categoria_id");
    validarPagamento(dados.pagamento);
    const repetir = dados.repetir_meses;
    if (!Number.isInteger(repetir) || repetir < 1 || repetir > 60) {
      throw new ErroNegocio("Repita de 1 a 60 meses.", 422, "repetir_meses");
    }

    const grupo = repetir > 1 ? crypto.randomUUID() : null;
    const baseVencimento = dados.pagamento.pago ? dados.pagamento.data_pagamento : dados.pagamento.vencimento;
    const agora = agoraIso();
    const inserir = db.query(
      `INSERT INTO lancamentos
         (tipo, descricao, categoria_id, valor_centavos, data, vencimento, pago, data_pagamento, origem,
          grupo_repeticao, parcela, parcelas, observacao, criado_em, atualizado_em)
       VALUES ($tipo, $descricao, $categoria, $valor, $data, $vencimento, $pago, $pagamento, $origem,
               $grupo, $parcela, $parcelas, $obs, $agora, $agora)
       RETURNING id`,
    );
    const ids: number[] = [];
    for (let k = 0; k < repetir; k++) {
      const primeiro = k === 0;
      const pago = primeiro && dados.pagamento.pago ? dados.pagamento : null;
      const { id } = inserir.get({
        tipo: dados.tipo,
        descricao,
        categoria: categoria.id,
        valor: dados.valor_centavos,
        data: somarMeses(dados.data, k),
        vencimento: pago ? null : somarMeses(baseVencimento, k),
        pago: pago ? 1 : 0,
        pagamento: pago ? pago.data_pagamento : null,
        origem: pago ? pago.origem : null,
        grupo,
        parcela: grupo ? k + 1 : null,
        parcelas: grupo ? repetir : null,
        obs: dados.observacao.trim(),
        agora,
      }) as { id: number };
      ids.push(id);
      if (pago && pago.origem === "gaveta") {
        const sessaoId = movimentarGavetaDoLancamento(db, {
          id,
          tipo: dados.tipo,
          descricao,
          valor_centavos: dados.valor_centavos,
        });
        db.query("UPDATE lancamentos SET sessao_id = $s WHERE id = $id").run({ s: sessaoId, id });
      }
    }
    return ids.map((id) => obterLancamento(db, id));
  });
}

export interface EdicaoLancamento {
  descricao: string;
  categoria_id: number;
  valor_centavos: number;
  data: string;
  vencimento: string | null;
  observacao: string;
}

export function atualizarLancamento(db: Banco, id: number, dados: EdicaoLancamento): Lancamento {
  return transacao(db, () => {
    const atual = linhaLancamento(db, id);
    const descricao = dados.descricao.trim();
    if (!descricao) throw new ErroNegocio("Informe a descrição.", 422, "descricao");
    if (!Number.isSafeInteger(dados.valor_centavos) || dados.valor_centavos <= 0) {
      throw new ErroNegocio("Informe um valor maior que zero.", 422, "valor_centavos");
    }
    if (!ehDataValida(dados.data)) throw new ErroNegocio("Data inválida.", 422, "data");
    const categoria = exigirCategoria(db, dados.categoria_id);
    if (categoria.tipo !== atual.tipo) throw new ErroNegocio("Essa categoria não é do mesmo tipo do lançamento.", 422, "categoria_id");
    if (atual.pago && atual.origem === "gaveta" && dados.valor_centavos !== atual.valor_centavos) {
      throw new ErroNegocio(
        "Esse valor já saiu (ou entrou) na gaveta do caixa. Para mudar o valor, desfaça o pagamento primeiro.",
        409,
        "valor_centavos",
      );
    }
    let vencimento = atual.vencimento;
    if (!atual.pago) {
      if (!dados.vencimento || !ehDataValida(dados.vencimento)) throw new ErroNegocio("Informe a data de vencimento.", 422, "vencimento");
      vencimento = dados.vencimento;
    }
    db.query(
      `UPDATE lancamentos SET descricao = $descricao, categoria_id = $categoria, valor_centavos = $valor,
         data = $data, vencimento = $vencimento, observacao = $obs, atualizado_em = $agora
       WHERE id = $id`,
    ).run({
      id,
      descricao,
      categoria: categoria.id,
      valor: dados.valor_centavos,
      data: dados.data,
      vencimento,
      obs: dados.observacao.trim(),
      agora: agoraIso(),
    });
    return obterLancamento(db, id);
  });
}

export function pagarLancamento(db: Banco, id: number, dados: { data_pagamento: string; origem: Origem }): Lancamento {
  return transacao(db, () => {
    const atual = linhaLancamento(db, id);
    if (atual.pago) throw new ErroNegocio("Esse lançamento já está pago.", 409);
    validarPagamento({ pago: true, ...dados });
    let sessaoId: number | null = null;
    if (dados.origem === "gaveta") sessaoId = movimentarGavetaDoLancamento(db, atual);
    db.query(
      `UPDATE lancamentos SET pago = 1, data_pagamento = $data, origem = $origem, sessao_id = $sessao, atualizado_em = $agora
       WHERE id = $id`,
    ).run({ id, data: dados.data_pagamento, origem: dados.origem, sessao: sessaoId, agora: agoraIso() });
    return obterLancamento(db, id);
  });
}

/** Remove o movimento da gaveta de um lançamento pago com dinheiro do caixa (só com o mesmo caixa aberto). */
function estornarGaveta(db: Banco, atual: LinhaLancamento, acao: string): void {
  if (!(atual.pago && atual.origem === "gaveta")) return;
  const aberta = sessaoAberta(db);
  if (!aberta || aberta.id !== atual.sessao_id) {
    throw new ErroNegocio(
      `Esse valor passou pela gaveta de um caixa que já foi fechado, então não dá para ${acao}. Se o dinheiro voltou para a gaveta, registre um suprimento.`,
      409,
    );
  }
  db.query("DELETE FROM movimentos_caixa WHERE lancamento_id = $id").run({ id: atual.id });
}

export function desfazerPagamento(db: Banco, id: number): Lancamento {
  return transacao(db, () => {
    const atual = linhaLancamento(db, id);
    if (!atual.pago) throw new ErroNegocio("Esse lançamento não está pago.", 409);
    estornarGaveta(db, atual, "desfazer o pagamento");
    db.query(
      `UPDATE lancamentos SET pago = 0, data_pagamento = NULL, origem = NULL, sessao_id = NULL,
         vencimento = COALESCE(vencimento, data_pagamento, data), atualizado_em = $agora
       WHERE id = $id`,
    ).run({ id, agora: agoraIso() });
    return obterLancamento(db, id);
  });
}

/**
 * Exclui o lançamento. Com `futurosPendentes`, também exclui as repetições
 * seguintes que ainda não foram pagas (ex.: parar um aluguel mensal).
 */
export function excluirLancamento(db: Banco, id: number, opcoes: { futurosPendentes?: boolean } = {}): { excluidos: number } {
  return transacao(db, () => {
    const atual = linhaLancamento(db, id);
    estornarGaveta(db, atual, "excluir");
    db.query("DELETE FROM lancamentos WHERE id = $id").run({ id });
    let excluidos = 1;
    if (opcoes.futurosPendentes && atual.grupo_repeticao) {
      const r = db
        .query("DELETE FROM lancamentos WHERE grupo_repeticao = $g AND pago = 0 AND data > $data")
        .run({ g: atual.grupo_repeticao, data: atual.data });
      excluidos += r.changes;
    }
    return { excluidos };
  });
}

export interface ContasPendentes {
  lancamentos: Lancamento[];
  a_pagar_centavos: number;
  a_receber_centavos: number;
  vencidas_a_pagar_centavos: number;
  vencidas_a_receber_centavos: number;
  vencidas_quantidade: number;
}

export function contasPendentes(db: Banco): ContasPendentes {
  const hoje = dataLocal();
  const linhas = db
    .query(`${SELECT_LANCAMENTO} WHERE l.pago = 0 ORDER BY l.vencimento, l.id`)
    .all() as LinhaLancamento[];
  const lancamentos = linhas.map((l) => paraLancamento(l, hoje));
  const soma = (f: (l: Lancamento) => boolean) => lancamentos.filter(f).reduce((s, l) => s + l.valor_centavos, 0);
  return {
    lancamentos,
    a_pagar_centavos: soma((l) => l.tipo === "despesa"),
    a_receber_centavos: soma((l) => l.tipo === "receita"),
    vencidas_a_pagar_centavos: soma((l) => l.tipo === "despesa" && l.situacao === "vencido"),
    vencidas_a_receber_centavos: soma((l) => l.tipo === "receita" && l.situacao === "vencido"),
    vencidas_quantidade: lancamentos.filter((l) => l.situacao === "vencido").length,
  };
}

export interface ResumoFinanceiro {
  de: string;
  ate: string;
  entradas: { vendas_centavos: number; receitas_centavos: number; total_centavos: number };
  saidas: {
    taxas_centavos: number;
    despesas_centavos: number;
    total_centavos: number;
    por_categoria: Array<{ categoria_id: number; nome: string; conta_no_resultado: boolean; total_centavos: number }>;
  };
  saldo_centavos: number;
  pendentes_no_periodo: { a_pagar_centavos: number; a_receber_centavos: number };
}

/**
 * Dinheiro que entrou e saiu no período (regime de caixa): vendas pela data da
 * venda e lançamentos pela data em que foram pagos ou recebidos.
 */
export function resumoFinanceiro(db: Banco, de: string, ate: string): ResumoFinanceiro {
  const vendas = db
    .query(
      `SELECT COALESCE(SUM(total_centavos), 0) AS total, COALESCE(SUM(taxas_centavos), 0) AS taxas
       FROM vendas WHERE status = 'concluida' AND data BETWEEN $de AND $ate`,
    )
    .get({ de, ate }) as { total: number; taxas: number };
  const somaPagos = (tipo: TipoLancamento) =>
    (
      db
        .query(
          `SELECT COALESCE(SUM(valor_centavos), 0) AS total FROM lancamentos
           WHERE tipo = $tipo AND pago = 1 AND data_pagamento BETWEEN $de AND $ate`,
        )
        .get({ tipo, de, ate }) as { total: number }
    ).total;
  const receitas = somaPagos("receita");
  const despesas = somaPagos("despesa");
  const porCategoria = db
    .query(
      `SELECT c.id AS categoria_id, c.nome, c.conta_no_resultado, SUM(l.valor_centavos) AS total_centavos
       FROM lancamentos l JOIN categorias_financeiras c ON c.id = l.categoria_id
       WHERE l.tipo = 'despesa' AND l.pago = 1 AND l.data_pagamento BETWEEN $de AND $ate
       GROUP BY c.id ORDER BY total_centavos DESC`,
    )
    .all({ de, ate }) as Array<{ categoria_id: number; nome: string; conta_no_resultado: number; total_centavos: number }>;
  const pendente = (tipo: TipoLancamento) =>
    (
      db
        .query(
          `SELECT COALESCE(SUM(valor_centavos), 0) AS total FROM lancamentos
           WHERE tipo = $tipo AND pago = 0 AND vencimento BETWEEN $de AND $ate`,
        )
        .get({ tipo, de, ate }) as { total: number }
    ).total;

  const entradas = vendas.total + receitas;
  const saidas = vendas.taxas + despesas;
  return {
    de,
    ate,
    entradas: { vendas_centavos: vendas.total, receitas_centavos: receitas, total_centavos: entradas },
    saidas: {
      taxas_centavos: vendas.taxas,
      despesas_centavos: despesas,
      total_centavos: saidas,
      por_categoria: porCategoria.map((c) => ({ ...c, conta_no_resultado: c.conta_no_resultado === 1 })),
    },
    saldo_centavos: entradas - saidas,
    pendentes_no_periodo: { a_pagar_centavos: pendente("despesa"), a_receber_centavos: pendente("receita") },
  };
}
