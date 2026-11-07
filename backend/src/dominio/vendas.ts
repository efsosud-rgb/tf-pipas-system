import type { Banco } from "../banco";
import { transacao } from "../banco";
import { calcularTaxa, ratear, reais, valorDaQuantidade } from "../dinheiro";
import { ErroNegocio, naoEncontrado } from "../erros";
import { deMil, quantidadeTexto, validarQuantidadeMil } from "../quantidade";
import { agoraIso, dataLocal } from "../relogio";
import { exigirCaixaAberto, lancarNaGaveta, sessaoAberta } from "./caixa";
import { lerConfig } from "./config";
import { movimentarEstoque } from "./movimento-estoque";
import { exigirProduto, type LinhaProduto } from "./produtos";

/**
 * Venda de balcão.
 *
 * - O preço e o custo de cada item ficam congelados na venda: mudar o produto
 *   depois não altera o lucro das vendas antigas.
 * - O desconto geral é dividido entre os itens na proporção do valor de cada
 *   um, sem sobrar nem faltar centavo, para o lucro por produto somar certo.
 * - Pode pagar com várias formas ao mesmo tempo. Troco só sai do dinheiro.
 * - A taxa da maquininha é calculada sobre o valor de cada forma e congelada.
 */

export interface NovaVenda {
  itens: Array<{ produto_id: number; quantidade_mil: number }>;
  desconto_centavos: number;
  /** Valor entregue pelo cliente em cada forma (no dinheiro, pode passar do total e gerar troco). */
  pagamentos: Array<{ forma_id: number; valor_centavos: number }>;
  cliente: string;
  observacao: string;
}

export interface ItemVenda {
  produto_id: number;
  nome: string;
  unidade: string;
  quantidade: number;
  preco_unitario_centavos: number;
  custo_unitario_centavos: number;
  subtotal_centavos: number;
  desconto_centavos: number;
  total_centavos: number;
  custo_total_centavos: number;
}

export interface PagamentoVenda {
  forma_id: number;
  forma_nome: string;
  forma_tipo: "dinheiro" | "outro";
  recebido_centavos: number;
  troco_centavos: number;
  valor_centavos: number;
  taxa_bp: number;
  taxa_centavos: number;
}

export interface Venda {
  id: number;
  numero: number;
  sessao_id: number;
  data: string;
  criado_em: string;
  subtotal_centavos: number;
  desconto_centavos: number;
  total_centavos: number;
  custo_centavos: number;
  taxas_centavos: number;
  /** total − custo das mercadorias (antes das taxas e despesas). */
  lucro_bruto_centavos: number;
  troco_centavos: number;
  cliente: string;
  observacao: string;
  status: "concluida" | "cancelada";
  cancelada_em: string | null;
  motivo_cancelamento: string;
  sessao_cancelamento_id: number | null;
  itens: ItemVenda[];
  pagamentos: PagamentoVenda[];
}

interface LinhaVenda extends Omit<Venda, "numero" | "lucro_bruto_centavos" | "itens" | "pagamentos"> {}

interface LinhaForma {
  id: number;
  nome: string;
  tipo: "dinheiro" | "outro";
  taxa_bp: number;
  ativo: number;
}

export function obterVenda(db: Banco, id: number): Venda {
  const v = db.query("SELECT * FROM vendas WHERE id = $id").get({ id }) as LinhaVenda | null;
  if (!v) throw naoEncontrado("Venda não encontrada.");
  const itens = db
    .query(
      `SELECT produto_id, nome, unidade, quantidade_mil, preco_unitario_centavos, custo_unitario_centavos,
              subtotal_centavos, desconto_centavos, total_centavos, custo_total_centavos
       FROM venda_itens WHERE venda_id = $id ORDER BY id`,
    )
    .all({ id }) as Array<Omit<ItemVenda, "quantidade"> & { quantidade_mil: number }>;
  const pagamentos = db
    .query(
      `SELECT forma_id, forma_nome, forma_tipo, recebido_centavos, troco_centavos, valor_centavos, taxa_bp, taxa_centavos
       FROM venda_pagamentos WHERE venda_id = $id ORDER BY id`,
    )
    .all({ id }) as PagamentoVenda[];
  return {
    ...v,
    numero: v.id,
    lucro_bruto_centavos: v.total_centavos - v.custo_centavos,
    itens: itens.map(({ quantidade_mil, ...i }) => ({ ...i, quantidade: deMil(quantidade_mil) })),
    pagamentos,
  };
}

export function registrarVenda(db: Banco, dados: NovaVenda): Venda {
  return transacao(db, () => {
    const sessao = exigirCaixaAberto(db, "vender");
    if (dados.itens.length === 0) throw new ErroNegocio("Adicione pelo menos um produto à venda.", 422, "itens");

    // Junta o mesmo produto em uma linha só, mantendo a ordem em que entrou.
    const quantidades = new Map<number, number>();
    for (const item of dados.itens) {
      if (!Number.isSafeInteger(item.quantidade_mil) || item.quantidade_mil <= 0) {
        throw new ErroNegocio("Quantidade precisa ser maior que zero.", 422, "itens");
      }
      quantidades.set(item.produto_id, (quantidades.get(item.produto_id) ?? 0) + item.quantidade_mil);
    }

    const config = lerConfig(db);
    const linhas: Array<{ p: LinhaProduto; quantidadeMil: number; subtotal: number; custoTotal: number }> = [];
    for (const [produtoId, quantidadeMil] of quantidades) {
      const p = exigirProduto(db, produtoId);
      if (!p.ativo) throw new ErroNegocio(`O produto "${p.nome}" está desativado.`, 422, "itens");
      validarQuantidadeMil(quantidadeMil, p.unidade, `Quantidade de "${p.nome}"`);
      if (p.controla_estoque && !config.permitir_estoque_negativo && p.estoque_mil < quantidadeMil) {
        throw new ErroNegocio(
          `Estoque insuficiente de "${p.nome}": tem ${quantidadeTexto(Math.max(p.estoque_mil, 0))}.`,
          422,
          "itens",
        );
      }
      const subtotal = valorDaQuantidade(quantidadeMil, p.preco_centavos);
      if (subtotal <= 0) {
        throw new ErroNegocio(`A quantidade de "${p.nome}" é pequena demais para ter valor.`, 422, "itens");
      }
      linhas.push({ p, quantidadeMil, subtotal, custoTotal: valorDaQuantidade(quantidadeMil, p.custo_centavos) });
    }

    const subtotal = linhas.reduce((s, l) => s + l.subtotal, 0);
    const desconto = dados.desconto_centavos;
    if (!Number.isSafeInteger(desconto) || desconto < 0) {
      throw new ErroNegocio("Desconto inválido.", 422, "desconto_centavos");
    }
    if (desconto >= subtotal) {
      throw new ErroNegocio("O desconto não pode ser igual ou maior que o valor da venda.", 422, "desconto_centavos");
    }
    const total = subtotal - desconto;
    const descontos = ratear(desconto, linhas.map((l) => l.subtotal));

    // Pagamentos
    if (dados.pagamentos.length === 0) throw new ErroNegocio("Informe a forma de pagamento.", 422, "pagamentos");
    const formasUsadas = new Set<number>();
    const pagamentos: Array<{ forma: LinhaForma; recebido: number }> = [];
    for (const pg of dados.pagamentos) {
      const forma = db.query("SELECT * FROM formas_pagamento WHERE id = $id").get({ id: pg.forma_id }) as LinhaForma | null;
      if (!forma) throw naoEncontrado("Forma de pagamento não encontrada.");
      if (!forma.ativo) throw new ErroNegocio(`A forma de pagamento "${forma.nome}" está desativada.`, 422, "pagamentos");
      if (formasUsadas.has(forma.id)) {
        throw new ErroNegocio(`"${forma.nome}" aparece duas vezes; junte os valores.`, 422, "pagamentos");
      }
      formasUsadas.add(forma.id);
      if (!Number.isSafeInteger(pg.valor_centavos) || pg.valor_centavos <= 0) {
        throw new ErroNegocio(`Informe o valor recebido em "${forma.nome}".`, 422, "pagamentos");
      }
      pagamentos.push({ forma, recebido: pg.valor_centavos });
    }
    const recebido = pagamentos.reduce((s, p) => s + p.recebido, 0);
    if (recebido < total) throw new ErroNegocio(`Falta receber ${reais(total - recebido)}.`, 422, "pagamentos");
    const troco = recebido - total;
    const dinheiroRecebido = pagamentos.filter((p) => p.forma.tipo === "dinheiro").reduce((s, p) => s + p.recebido, 0);
    if (troco > dinheiroRecebido) {
      throw new ErroNegocio(
        "Troco só sai do dinheiro: o valor em PIX ou cartão passou do total da venda.",
        422,
        "pagamentos",
      );
    }
    const finais = pagamentos.map(({ forma, recebido: r }) => {
      const trocoLinha = forma.tipo === "dinheiro" ? troco : 0;
      const valor = r - trocoLinha;
      return { forma, recebido: r, troco: trocoLinha, valor, taxa: calcularTaxa(valor, forma.taxa_bp) };
    });
    if (finais.some((f) => f.valor === 0)) {
      throw new ErroNegocio("O dinheiro informado volta todo como troco; tire o dinheiro do pagamento.", 422, "pagamentos");
    }
    const taxas = finais.reduce((s, f) => s + f.taxa, 0);
    const custo = linhas.reduce((s, l) => s + l.custoTotal, 0);

    const agora = agoraIso();
    const { id } = db
      .query(
        `INSERT INTO vendas
           (sessao_id, data, criado_em, subtotal_centavos, desconto_centavos, total_centavos, custo_centavos,
            taxas_centavos, troco_centavos, cliente, observacao)
         VALUES ($sessao, $data, $agora, $subtotal, $desconto, $total, $custo, $taxas, $troco, $cliente, $obs)
         RETURNING id`,
      )
      .get({
        sessao: sessao.id,
        data: dataLocal(),
        agora,
        subtotal,
        desconto,
        total,
        custo,
        taxas,
        troco,
        cliente: dados.cliente.trim(),
        obs: dados.observacao.trim(),
      }) as { id: number };

    const inserirItem = db.query(
      `INSERT INTO venda_itens
         (venda_id, produto_id, nome, unidade, quantidade_mil, preco_unitario_centavos, custo_unitario_centavos,
          subtotal_centavos, desconto_centavos, total_centavos, custo_total_centavos)
       VALUES ($venda, $produto, $nome, $unidade, $q, $preco, $custo, $subtotal, $desconto, $total, $custoTotal)`,
    );
    linhas.forEach((l, i) => {
      inserirItem.run({
        venda: id,
        produto: l.p.id,
        nome: l.p.nome,
        unidade: l.p.unidade,
        q: l.quantidadeMil,
        preco: l.p.preco_centavos,
        custo: l.p.custo_centavos,
        subtotal: l.subtotal,
        desconto: descontos[i]!,
        total: l.subtotal - descontos[i]!,
        custoTotal: l.custoTotal,
      });
      if (l.p.controla_estoque) {
        movimentarEstoque(db, {
          produtoId: l.p.id,
          tipo: "venda",
          quantidadeMil: -l.quantidadeMil,
          custoUnitarioCentavos: l.p.custo_centavos,
          vendaId: id,
          observacao: `Venda nº ${id}`,
        });
      }
    });

    const inserirPagamento = db.query(
      `INSERT INTO venda_pagamentos
         (venda_id, forma_id, forma_nome, forma_tipo, recebido_centavos, troco_centavos, valor_centavos, taxa_bp, taxa_centavos)
       VALUES ($venda, $forma, $nome, $tipo, $recebido, $troco, $valor, $bp, $taxa)`,
    );
    for (const f of finais) {
      inserirPagamento.run({
        venda: id,
        forma: f.forma.id,
        nome: f.forma.nome,
        tipo: f.forma.tipo,
        recebido: f.recebido,
        troco: f.troco,
        valor: f.valor,
        bp: f.forma.taxa_bp,
        taxa: f.taxa,
      });
      if (f.forma.tipo === "dinheiro") {
        lancarNaGaveta(db, {
          sessaoId: sessao.id,
          tipo: "venda",
          valorCentavos: f.valor,
          descricao: `Venda nº ${id}`,
          vendaId: id,
        });
      }
    }
    return obterVenda(db, id);
  });
}

export interface VendaNaLista {
  id: number;
  numero: number;
  data: string;
  criado_em: string;
  total_centavos: number;
  desconto_centavos: number;
  custo_centavos: number;
  taxas_centavos: number;
  lucro_bruto_centavos: number;
  status: "concluida" | "cancelada";
  cliente: string;
  itens_quantidade: number;
  formas: string;
  sessao_id: number;
}

export function listarVendas(
  db: Banco,
  filtro: { de?: string; ate?: string; status?: "concluida" | "cancelada"; sessao_id?: number; limite?: number } = {},
): VendaNaLista[] {
  const cond: string[] = [];
  const p: Record<string, string | number> = { limite: Math.min(filtro.limite ?? 300, 1000) };
  if (filtro.de) {
    cond.push("v.data >= $de");
    p.de = filtro.de;
  }
  if (filtro.ate) {
    cond.push("v.data <= $ate");
    p.ate = filtro.ate;
  }
  if (filtro.status) {
    cond.push("v.status = $status");
    p.status = filtro.status;
  }
  if (filtro.sessao_id) {
    cond.push("v.sessao_id = $sessao");
    p.sessao = filtro.sessao_id;
  }
  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  const linhas = db
    .query(
      `SELECT v.id, v.data, v.criado_em, v.total_centavos, v.desconto_centavos, v.custo_centavos, v.taxas_centavos,
              v.status, v.cliente, v.sessao_id,
              (SELECT COUNT(*) FROM venda_itens i WHERE i.venda_id = v.id) AS itens_quantidade,
              (SELECT GROUP_CONCAT(forma_nome, ' + ') FROM venda_pagamentos pg WHERE pg.venda_id = v.id) AS formas
       FROM vendas v ${where} ORDER BY v.id DESC LIMIT $limite`,
    )
    .all(p) as Array<Omit<VendaNaLista, "numero" | "lucro_bruto_centavos">>;
  return linhas.map((l) => ({
    ...l,
    numero: l.id,
    formas: l.formas ?? "",
    lucro_bruto_centavos: l.total_centavos - l.custo_centavos,
  }));
}

/**
 * Cancela a venda: devolve os produtos ao estoque e, se teve dinheiro, tira
 * da gaveta do caixa aberto o valor devolvido ao cliente. PIX e cartão são
 * devolvidos fora do sistema (na maquininha ou no banco).
 */
export function cancelarVenda(db: Banco, id: number, motivo: string): Venda {
  return transacao(db, () => {
    const venda = obterVenda(db, id);
    if (venda.status === "cancelada") throw new ErroNegocio("Essa venda já foi cancelada.", 409);
    const texto = motivo.trim();
    if (texto.length < 3) throw new ErroNegocio("Informe o motivo do cancelamento.", 422, "motivo");

    const dinheiro = venda.pagamentos.filter((p) => p.forma_tipo === "dinheiro").reduce((s, p) => s + p.valor_centavos, 0);
    let sessaoCancelamento: number | null = sessaoAberta(db)?.id ?? null;
    if (dinheiro > 0) {
      const sessao = exigirCaixaAberto(db, "devolver o dinheiro ao cliente");
      lancarNaGaveta(db, {
        sessaoId: sessao.id,
        tipo: "cancelamento",
        valorCentavos: -dinheiro,
        descricao: `Cancelamento da venda nº ${id}`,
        vendaId: id,
      });
      sessaoCancelamento = sessao.id;
    }

    const saidas = db
      .query(
        "SELECT produto_id, quantidade_mil, custo_unitario_centavos FROM movimentos_estoque WHERE venda_id = $id AND tipo = 'venda'",
      )
      .all({ id }) as Array<{ produto_id: number; quantidade_mil: number; custo_unitario_centavos: number }>;
    for (const s of saidas) {
      movimentarEstoque(db, {
        produtoId: s.produto_id,
        tipo: "cancelamento",
        quantidadeMil: -s.quantidade_mil,
        custoUnitarioCentavos: s.custo_unitario_centavos,
        vendaId: id,
        observacao: `Cancelamento da venda nº ${id}`,
      });
    }

    db.query(
      `UPDATE vendas SET status = 'cancelada', cancelada_em = $agora, motivo_cancelamento = $motivo,
         sessao_cancelamento_id = $sessao
       WHERE id = $id`,
    ).run({ id, agora: agoraIso(), motivo: texto, sessao: sessaoCancelamento });
    return obterVenda(db, id);
  });
}
