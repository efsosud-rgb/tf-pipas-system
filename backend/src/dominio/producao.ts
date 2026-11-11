import type { Banco } from "../banco";
import { transacao } from "../banco";
import { valorDaQuantidade } from "../dinheiro";
import { ErroNegocio } from "../erros";
import { deMil, UNIDADES, type Unidade } from "../quantidade";
import { dataLocal, dataLocalDeIso, diferencaEmDias, somarDias } from "../relogio";
import type { LinhaProduto } from "./produtos";

/**
 * Sugestão de produção e reposição, e alertas de estoque acabando.
 *
 * Tudo sai do que foi registrado: o ritmo de venda é a quantidade vendida
 * (vendas concluídas) nos últimos N dias dividida pelos dias em que o produto
 * existia no sistema dentro desse período. Sem venda no período não há ritmo:
 * aí só o estoque mínimo do cadastro gera sugestão. Nada é estimado além dessa
 * conta, e a tela mostra de onde cada número veio.
 */

export interface ParametrosProducao {
  /** Quantos dias de venda o estoque deve aguentar depois de produzir/comprar. */
  dias_alvo: number;
  /** Quantos dias de vendas olhar para medir o ritmo. */
  dias_historico: number;
  /** Avisa "acabando" quando o estoque dura menos que isso no ritmo atual. */
  alerta_dias: number;
}

const LIMITES = {
  dias_alvo: [1, 180],
  dias_historico: [7, 365],
  alerta_dias: [1, 60],
} as const;

const CHAVES = { dias_alvo: "producao_dias_alvo", dias_historico: "producao_dias_historico", alerta_dias: "alerta_dias_cobertura" } as const;
const PADRAO: ParametrosProducao = { dias_alvo: 30, dias_historico: 30, alerta_dias: 7 };

export function lerParametrosProducao(db: Banco): ParametrosProducao {
  const linhas = db
    .query("SELECT chave, valor FROM config WHERE chave IN ('producao_dias_alvo', 'producao_dias_historico', 'alerta_dias_cobertura')")
    .all() as Array<{ chave: string; valor: string }>;
  const mapa = new Map(linhas.map((l) => [l.chave, Number(l.valor)]));
  const ler = (k: keyof ParametrosProducao) => {
    const v = mapa.get(CHAVES[k]);
    return v !== undefined && Number.isInteger(v) ? v : PADRAO[k];
  };
  return { dias_alvo: ler("dias_alvo"), dias_historico: ler("dias_historico"), alerta_dias: ler("alerta_dias") };
}

export function salvarParametrosProducao(db: Banco, dados: Partial<ParametrosProducao>): ParametrosProducao {
  return transacao(db, () => {
    const gravar = db.query(
      "INSERT INTO config (chave, valor) VALUES ($chave, $valor) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor",
    );
    for (const k of Object.keys(CHAVES) as Array<keyof ParametrosProducao>) {
      const v = dados[k];
      if (v === undefined) continue;
      const [min, max] = LIMITES[k];
      if (!Number.isInteger(v) || v < min || v > max) {
        throw new ErroNegocio(`Use de ${min} a ${max} dias.`, 422, k);
      }
      gravar.run({ chave: CHAVES[k], valor: String(v) });
    }
    return lerParametrosProducao(db);
  });
}

export type MotivoSugestao = "negativo" | "zerado" | "abaixo_minimo" | "cobertura_curta";

export interface ItemSugestao {
  produto_id: number;
  nome: string;
  categoria: string;
  unidade: Unidade;
  fabricado: boolean;
  estoque: number;
  estoque_minimo: number;
  lote: number;
  /** Quantidade vendida nos dias considerados. */
  vendido_periodo: number;
  /** Dias usados no cálculo do ritmo (menos que o período se o produto é novo). */
  dias_considerados: number;
  /** Média vendida por dia; null quando não houve venda no período. */
  media_diaria: number | null;
  /** Quantos dias o estoque dura no ritmo atual; 0 se acabou; null sem ritmo de venda. */
  cobertura_dias: number | null;
  /** Estoque que se quer ter: o maior entre o mínimo e o ritmo × dias desejados. */
  alvo: number;
  /** Quanto produzir/comprar (já arredondado para unidade inteira e para o lote). */
  sugestao: number;
  custo_unitario_centavos: number;
  /** sugestão × custo atual do produto. */
  custo_estimado_centavos: number;
  motivo: MotivoSugestao | null;
  /** Produto com menos de 7 dias no sistema: o ritmo ainda é pouco confiável. */
  pouco_historico: boolean;
}

export interface SugestaoProducao {
  parametros: ParametrosProducao;
  de: string;
  ate: string;
  itens: ItemSugestao[];
  resumo: {
    produzir_itens: number;
    produzir_custo_centavos: number;
    comprar_itens: number;
    comprar_custo_centavos: number;
    sem_ritmo: number;
  };
}

const ORDEM_MOTIVO: Record<MotivoSugestao, number> = { negativo: 0, zerado: 1, abaixo_minimo: 2, cobertura_curta: 3 };

function arredondarParaCima(mil: number, unidade: Unidade, loteMil: number): number {
  if (mil <= 0) return 0;
  if (loteMil > 0) return Math.ceil(mil / loteMil) * loteMil;
  if (!UNIDADES[unidade].fracionavel) return Math.ceil(mil / 1000) * 1000;
  return Math.ceil(mil);
}

export function sugestaoDeProducao(db: Banco, parametros = lerParametrosProducao(db)): SugestaoProducao {
  const ate = dataLocal();
  const de = somarDias(ate, -(parametros.dias_historico - 1));
  const vendidos = new Map(
    (
      db
        .query(
          `SELECT i.produto_id, SUM(i.quantidade_mil) AS vendido
           FROM venda_itens i JOIN vendas v ON v.id = i.venda_id
           WHERE v.status = 'concluida' AND v.data BETWEEN $de AND $ate
           GROUP BY i.produto_id`,
        )
        .all({ de, ate }) as Array<{ produto_id: number; vendido: number }>
    ).map((l) => [l.produto_id, l.vendido]),
  );
  const produtos = db
    .query("SELECT * FROM produtos WHERE ativo = 1 AND controla_estoque = 1 ORDER BY nome COLLATE NOCASE")
    .all() as LinhaProduto[];

  const itens: ItemSugestao[] = produtos.map((p) => {
    const vendidoMil = vendidos.get(p.id) ?? 0;
    const criado = dataLocalDeIso(p.criado_em);
    const desde = criado > de ? criado : de;
    const dias = Math.max(1, Math.min(parametros.dias_historico, diferencaEmDias(desde, ate) + 1));
    const mediaMil = vendidoMil > 0 ? vendidoMil / dias : 0;
    const cobertura = p.estoque_mil <= 0 ? 0 : mediaMil > 0 ? p.estoque_mil / mediaMil : null;
    const pelaVenda = mediaMil > 0 ? Math.ceil(mediaMil * parametros.dias_alvo) : 0;
    const alvoMil = Math.max(p.estoque_minimo_mil, arredondarParaCima(pelaVenda, p.unidade, 0));
    const falta = alvoMil - p.estoque_mil;
    const sugestaoMil = arredondarParaCima(falta, p.unidade, p.lote_producao_mil);

    let motivo: MotivoSugestao | null = null;
    if (p.estoque_mil < 0) motivo = "negativo";
    else if (p.estoque_mil === 0) motivo = "zerado";
    else if (p.estoque_minimo_mil > 0 && p.estoque_mil <= p.estoque_minimo_mil) motivo = "abaixo_minimo";
    else if (cobertura !== null && cobertura < parametros.dias_alvo) motivo = "cobertura_curta";

    return {
      produto_id: p.id,
      nome: p.nome,
      categoria: p.categoria,
      unidade: p.unidade,
      fabricado: p.fabricado === 1,
      estoque: deMil(p.estoque_mil),
      estoque_minimo: deMil(p.estoque_minimo_mil),
      lote: deMil(p.lote_producao_mil),
      vendido_periodo: deMil(vendidoMil),
      dias_considerados: dias,
      media_diaria: mediaMil > 0 ? Math.round(mediaMil) / 1000 : null,
      cobertura_dias: cobertura === null ? null : Math.floor(cobertura * 10) / 10,
      alvo: deMil(alvoMil),
      sugestao: deMil(sugestaoMil),
      custo_unitario_centavos: p.custo_centavos,
      custo_estimado_centavos: sugestaoMil > 0 ? valorDaQuantidade(sugestaoMil, p.custo_centavos) : 0,
      motivo,
      pouco_historico: vendidoMil > 0 && dias < 7,
    };
  });

  itens.sort((a, b) => {
    if ((a.sugestao > 0) !== (b.sugestao > 0)) return a.sugestao > 0 ? -1 : 1;
    const ma = a.motivo ? ORDEM_MOTIVO[a.motivo] : 9;
    const mb = b.motivo ? ORDEM_MOTIVO[b.motivo] : 9;
    if (ma !== mb) return ma - mb;
    const ca = a.cobertura_dias ?? Number.POSITIVE_INFINITY;
    const cb = b.cobertura_dias ?? Number.POSITIVE_INFINITY;
    if (ca !== cb) return ca - cb;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });

  const comSugestao = itens.filter((i) => i.sugestao > 0);
  const soma = (lista: ItemSugestao[]) => lista.reduce((s, i) => s + i.custo_estimado_centavos, 0);
  const produzir = comSugestao.filter((i) => i.fabricado);
  const comprar = comSugestao.filter((i) => !i.fabricado);
  return {
    parametros,
    de,
    ate,
    itens,
    resumo: {
      produzir_itens: produzir.length,
      produzir_custo_centavos: soma(produzir),
      comprar_itens: comprar.length,
      comprar_custo_centavos: soma(comprar),
      sem_ritmo: itens.filter((i) => i.media_diaria === null).length,
    },
  };
}

export interface AlertaEstoque {
  produto_id: number;
  nome: string;
  unidade: Unidade;
  fabricado: boolean;
  estoque: number;
  estoque_minimo: number;
  cobertura_dias: number | null;
  motivo: MotivoSugestao;
  /** Texto curto para a tela: "Zerado", "Dura ~3 dias no ritmo atual"... */
  texto: string;
}

/**
 * Produtos acabando: zerados, negativos, no estoque mínimo, ou que no ritmo de
 * venda atual duram menos que `alerta_dias`.
 */
export function alertasDeEstoque(db: Banco, sugestao = sugestaoDeProducao(db)): AlertaEstoque[] {
  const alerta = sugestao.parametros.alerta_dias;
  const alertas: AlertaEstoque[] = [];
  for (const i of sugestao.itens) {
    let motivo: MotivoSugestao | null = null;
    let texto = "";
    const u = i.unidade;
    const qtd = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${u}`;
    if (i.motivo === "negativo") {
      motivo = "negativo";
      texto = `Negativo (${qtd(i.estoque)}): vendeu mais do que estava registrado`;
    } else if (i.motivo === "zerado") {
      motivo = "zerado";
      texto = "Esgotado";
    } else if (i.motivo === "abaixo_minimo") {
      motivo = "abaixo_minimo";
      texto = `${qtd(i.estoque)} (mínimo ${qtd(i.estoque_minimo)})`;
    } else if (i.cobertura_dias !== null && i.cobertura_dias < alerta) {
      motivo = "cobertura_curta";
      const dias = Math.max(1, Math.floor(i.cobertura_dias));
      texto = `${qtd(i.estoque)} · dura ~${dias} ${dias === 1 ? "dia" : "dias"} no ritmo atual`;
    }
    if (motivo) {
      alertas.push({
        produto_id: i.produto_id,
        nome: i.nome,
        unidade: i.unidade,
        fabricado: i.fabricado,
        estoque: i.estoque,
        estoque_minimo: i.estoque_minimo,
        cobertura_dias: i.cobertura_dias,
        motivo,
        texto,
      });
    }
  }
  return alertas.sort((a, b) => ORDEM_MOTIVO[a.motivo] - ORDEM_MOTIVO[b.motivo] || (a.cobertura_dias ?? 0) - (b.cobertura_dias ?? 0));
}
