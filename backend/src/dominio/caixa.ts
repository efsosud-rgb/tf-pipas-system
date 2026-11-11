import type { Banco } from "../banco";
import { transacao } from "../banco";
import { reais } from "../dinheiro";
import { ErroNegocio, naoEncontrado } from "../erros";
import { agoraIso, dataLocal } from "../relogio";

/**
 * Caixa = sessão da gaveta de dinheiro: abre com o fundo de troco, recebe as
 * vendas, sangrias e suprimentos, e fecha com a contagem do dinheiro.
 *
 * O dinheiro esperado na gaveta é sempre a soma dos movimentos da sessão
 * (movimentos_caixa). PIX e cartão não entram na gaveta: aparecem só no
 * resumo de vendas por forma de pagamento.
 */

export type TipoMovimentoCaixa =
  | "abertura"
  | "venda"
  | "sangria"
  | "suprimento"
  | "cancelamento"
  | "despesa"
  | "receita";

interface LinhaSessao {
  id: number;
  aberto_em: string;
  data_abertura: string;
  operador_abertura: string;
  fundo_troco_centavos: number;
  fechado_em: string | null;
  data_fechamento: string | null;
  operador_fechamento: string;
  esperado_centavos: number | null;
  contado_centavos: number | null;
  diferenca_centavos: number | null;
  observacao_fechamento: string;
}

export interface Sessao extends LinhaSessao {
  aberta: boolean;
}

function paraSessao(l: LinhaSessao): Sessao {
  return { ...l, aberta: l.fechado_em === null };
}

export function sessaoAberta(db: Banco): Sessao | null {
  const l = db.query("SELECT * FROM sessoes_caixa WHERE fechado_em IS NULL").get() as LinhaSessao | null;
  return l ? paraSessao(l) : null;
}

export function exigirCaixaAberto(db: Banco, paraQue: string): Sessao {
  const s = sessaoAberta(db);
  if (!s) throw new ErroNegocio(`O caixa está fechado. Abra o caixa para ${paraQue}.`, 409);
  return s;
}

export function obterSessao(db: Banco, id: number): Sessao {
  const l = db.query("SELECT * FROM sessoes_caixa WHERE id = $id").get({ id }) as LinhaSessao | null;
  if (!l) throw naoEncontrado("Caixa não encontrado.");
  return paraSessao(l);
}

export function saldoDaGaveta(db: Banco, sessaoId: number): number {
  const l = db
    .query("SELECT COALESCE(SUM(valor_centavos), 0) AS saldo FROM movimentos_caixa WHERE sessao_id = $id")
    .get({ id: sessaoId }) as { saldo: number };
  return l.saldo;
}

export interface MovimentoGaveta {
  sessaoId: number;
  tipo: TipoMovimentoCaixa;
  /** Com sinal: positivo entra na gaveta, negativo sai. */
  valorCentavos: number;
  descricao: string;
  vendaId?: number | null;
  lancamentoId?: number | null;
  /** Quem fez o movimento (usuário logado). */
  usuarioNome?: string;
}

/**
 * Registra dinheiro entrando ou saindo da gaveta. Nunca deixa o saldo
 * esperado ficar negativo: não dá para tirar da gaveta o que não está nela.
 * Deve ser chamado dentro de uma transação.
 */
export function lancarNaGaveta(db: Banco, m: MovimentoGaveta): void {
  if (!Number.isSafeInteger(m.valorCentavos)) throw new RangeError("Valor inválido para a gaveta.");
  const sessao = obterSessao(db, m.sessaoId);
  if (!sessao.aberta) throw new ErroNegocio("Esse caixa já foi fechado.", 409);
  if (m.valorCentavos < 0) {
    const saldo = saldoDaGaveta(db, m.sessaoId);
    if (saldo + m.valorCentavos < 0) {
      throw new ErroNegocio(
        `A gaveta tem ${reais(saldo)} em dinheiro; não dá para tirar ${reais(-m.valorCentavos)}.`,
        422,
      );
    }
  }
  db.query(
    `INSERT INTO movimentos_caixa (sessao_id, tipo, valor_centavos, descricao, venda_id, lancamento_id, criado_em, usuario_nome)
     VALUES ($sessao, $tipo, $valor, $descricao, $venda, $lancamento, $agora, $usuario)`,
  ).run({
    sessao: m.sessaoId,
    tipo: m.tipo,
    valor: m.valorCentavos,
    descricao: m.descricao,
    venda: m.vendaId ?? null,
    lancamento: m.lancamentoId ?? null,
    agora: agoraIso(),
    usuario: m.usuarioNome ?? "",
  });
}

export interface ResumoCaixa {
  sessao: Sessao;
  gaveta: {
    esperado_centavos: number;
    fundo_troco_centavos: number;
    vendas_centavos: number;
    suprimentos_centavos: number;
    sangrias_centavos: number;
    receitas_centavos: number;
    despesas_centavos: number;
    cancelamentos_centavos: number;
  };
  vendas: {
    quantidade: number;
    total_centavos: number;
    descontos_centavos: number;
    taxas_centavos: number;
    por_forma: Array<{
      forma_id: number;
      nome: string;
      tipo: string;
      quantidade: number;
      valor_centavos: number;
      taxas_centavos: number;
    }>;
  };
  canceladas: { quantidade: number; total_centavos: number };
  movimentos: Array<{
    id: number;
    tipo: TipoMovimentoCaixa;
    valor_centavos: number;
    descricao: string;
    venda_id: number | null;
    lancamento_id: number | null;
    criado_em: string;
    usuario_nome: string;
  }>;
}

export function resumoDoCaixa(db: Banco, sessaoId: number): ResumoCaixa {
  const sessao = obterSessao(db, sessaoId);
  const movimentos = db
    .query(
      `SELECT id, tipo, valor_centavos, descricao, venda_id, lancamento_id, criado_em, usuario_nome
       FROM movimentos_caixa WHERE sessao_id = $id ORDER BY id`,
    )
    .all({ id: sessaoId }) as ResumoCaixa["movimentos"];

  const soma = (tipo: TipoMovimentoCaixa) =>
    movimentos.filter((m) => m.tipo === tipo).reduce((s, m) => s + m.valor_centavos, 0);
  const esperadoAgora = movimentos.reduce((s, m) => s + m.valor_centavos, 0);

  const vendas = db
    .query(
      `SELECT COUNT(*) AS quantidade, COALESCE(SUM(total_centavos), 0) AS total,
              COALESCE(SUM(desconto_centavos), 0) AS descontos, COALESCE(SUM(taxas_centavos), 0) AS taxas
       FROM vendas WHERE sessao_id = $id AND status = 'concluida'`,
    )
    .get({ id: sessaoId }) as { quantidade: number; total: number; descontos: number; taxas: number };

  const porForma = db
    .query(
      `SELECT vp.forma_id, f.nome, f.tipo, COUNT(DISTINCT vp.venda_id) AS quantidade,
              SUM(vp.valor_centavos) AS valor_centavos, SUM(vp.taxa_centavos) AS taxas_centavos
       FROM venda_pagamentos vp
       JOIN vendas v ON v.id = vp.venda_id
       JOIN formas_pagamento f ON f.id = vp.forma_id
       WHERE v.sessao_id = $id AND v.status = 'concluida'
       GROUP BY vp.forma_id
       ORDER BY f.ordem, f.nome`,
    )
    .all({ id: sessaoId }) as ResumoCaixa["vendas"]["por_forma"];

  const canceladas = db
    .query(
      `SELECT COUNT(*) AS quantidade, COALESCE(SUM(total_centavos), 0) AS total
       FROM vendas WHERE sessao_id = $id AND status = 'cancelada'`,
    )
    .get({ id: sessaoId }) as { quantidade: number; total: number };

  return {
    sessao,
    gaveta: {
      esperado_centavos: sessao.aberta ? esperadoAgora : (sessao.esperado_centavos ?? esperadoAgora),
      fundo_troco_centavos: soma("abertura"),
      vendas_centavos: soma("venda"),
      suprimentos_centavos: soma("suprimento"),
      sangrias_centavos: -soma("sangria"),
      receitas_centavos: soma("receita"),
      despesas_centavos: -soma("despesa"),
      cancelamentos_centavos: -soma("cancelamento"),
    },
    vendas: {
      quantidade: vendas.quantidade,
      total_centavos: vendas.total,
      descontos_centavos: vendas.descontos,
      taxas_centavos: vendas.taxas,
      por_forma: porForma,
    },
    canceladas: { quantidade: canceladas.quantidade, total_centavos: canceladas.total },
    movimentos,
  };
}

export function abrirCaixa(db: Banco, dados: { fundo_troco_centavos: number; operador: string }, autor?: { nome: string }): ResumoCaixa {
  return transacao(db, () => {
    const aberta = sessaoAberta(db);
    if (aberta) throw new ErroNegocio("Já existe um caixa aberto. Feche esse caixa antes de abrir outro.", 409);
    if (!Number.isSafeInteger(dados.fundo_troco_centavos) || dados.fundo_troco_centavos < 0) {
      throw new ErroNegocio("O fundo de troco não pode ser negativo.", 422, "fundo_troco_centavos");
    }
    const { id } = db
      .query(
        `INSERT INTO sessoes_caixa (aberto_em, data_abertura, operador_abertura, fundo_troco_centavos)
         VALUES ($agora, $hoje, $operador, $fundo) RETURNING id`,
      )
      .get({
        agora: agoraIso(),
        hoje: dataLocal(),
        operador: autor?.nome ?? dados.operador.trim(),
        fundo: dados.fundo_troco_centavos,
      }) as { id: number };
    lancarNaGaveta(db, {
      sessaoId: id,
      tipo: "abertura",
      valorCentavos: dados.fundo_troco_centavos,
      descricao: "Fundo de troco",
      usuarioNome: autor?.nome,
    });
    return resumoDoCaixa(db, id);
  });
}

export function sangriaOuSuprimento(
  db: Banco,
  dados: { tipo: "sangria" | "suprimento"; valor_centavos: number; descricao: string },
  autor?: { nome: string },
): ResumoCaixa {
  return transacao(db, () => {
    const sessao = exigirCaixaAberto(db, dados.tipo === "sangria" ? "fazer uma sangria" : "fazer um suprimento");
    if (!Number.isSafeInteger(dados.valor_centavos) || dados.valor_centavos <= 0) {
      throw new ErroNegocio("Informe um valor maior que zero.", 422, "valor_centavos");
    }
    const padrao = dados.tipo === "sangria" ? "Retirada de dinheiro da gaveta" : "Dinheiro colocado na gaveta";
    lancarNaGaveta(db, {
      sessaoId: sessao.id,
      tipo: dados.tipo,
      valorCentavos: dados.tipo === "sangria" ? -dados.valor_centavos : dados.valor_centavos,
      descricao: dados.descricao.trim() || padrao,
      usuarioNome: autor?.nome,
    });
    return resumoDoCaixa(db, sessao.id);
  });
}

export function fecharCaixa(
  db: Banco,
  dados: { contado_centavos: number; operador: string; observacao: string },
  autor?: { nome: string },
): ResumoCaixa {
  return transacao(db, () => {
    const sessao = exigirCaixaAberto(db, "fechá-lo");
    if (!Number.isSafeInteger(dados.contado_centavos) || dados.contado_centavos < 0) {
      throw new ErroNegocio("Informe quanto dinheiro tem na gaveta.", 422, "contado_centavos");
    }
    const esperado = saldoDaGaveta(db, sessao.id);
    db.query(
      `UPDATE sessoes_caixa SET
         fechado_em = $agora, data_fechamento = $hoje, operador_fechamento = $operador,
         esperado_centavos = $esperado, contado_centavos = $contado, diferenca_centavos = $diferenca,
         observacao_fechamento = $obs
       WHERE id = $id`,
    ).run({
      id: sessao.id,
      agora: agoraIso(),
      hoje: dataLocal(),
      operador: autor?.nome ?? dados.operador.trim(),
      esperado,
      contado: dados.contado_centavos,
      diferenca: dados.contado_centavos - esperado,
      obs: dados.observacao.trim(),
    });
    return resumoDoCaixa(db, sessao.id);
  });
}

export interface SessaoNaLista extends Sessao {
  vendas_quantidade: number;
  vendas_total_centavos: number;
}

export function listarSessoes(db: Banco, limite = 60): SessaoNaLista[] {
  const linhas = db
    .query(
      `SELECT s.*,
              (SELECT COUNT(*) FROM vendas v WHERE v.sessao_id = s.id AND v.status = 'concluida') AS vendas_quantidade,
              (SELECT COALESCE(SUM(total_centavos), 0) FROM vendas v WHERE v.sessao_id = s.id AND v.status = 'concluida') AS vendas_total_centavos
       FROM sessoes_caixa s ORDER BY s.id DESC LIMIT $limite`,
    )
    .all({ limite }) as Array<LinhaSessao & { vendas_quantidade: number; vendas_total_centavos: number }>;
  return linhas.map((l) => ({ ...paraSessao(l), vendas_quantidade: l.vendas_quantidade, vendas_total_centavos: l.vendas_total_centavos }));
}
