import type { Banco } from "../banco";
import { transacao } from "../banco";
import { margemBp } from "../dinheiro";
import { ErroNegocio, naoEncontrado } from "../erros";
import { UNIDADES, deMil, quantidadeTexto, validarQuantidadeMil, type Unidade } from "../quantidade";
import { agoraIso } from "../relogio";
import { movimentarEstoque } from "./movimento-estoque";
import { faixasDeTodos, faixasDoProduto, faixasParaApi, gravarFaixas, validarFaixas, type FaixaPreco, type FaixaPrecoApi } from "./precos";

export interface DadosProduto {
  nome: string;
  categoria: string;
  unidade: Unidade;
  codigo: string | null;
  codigo_barras: string | null;
  custo_centavos: number;
  preco_centavos: number;
  estoque_minimo_mil: number;
  controla_estoque: boolean;
  observacao: string;
  /** Produzido pela própria loja (entra em "Produzir" na sugestão de produção). Sem valor: mantém o atual. */
  fabricado?: boolean;
  /** Produz em lotes deste tamanho (0 = sem lote). Sem valor: mantém o atual. */
  lote_producao_mil?: number;
  /** Tabela de preços por quantidade. Sem valor: mantém a atual; lista vazia: apaga. */
  faixas_preco?: Array<{ quantidade_mil: number; preco_centavos: number }>;
}

export interface NovoProduto extends DadosProduto {
  estoque_inicial_mil: number;
}

export interface LinhaProduto {
  id: number;
  nome: string;
  codigo: string | null;
  codigo_barras: string | null;
  categoria: string;
  unidade: Unidade;
  custo_centavos: number;
  preco_centavos: number;
  estoque_mil: number;
  estoque_minimo_mil: number;
  controla_estoque: number;
  ativo: number;
  observacao: string;
  criado_em: string;
  atualizado_em: string;
  fabricado: number;
  lote_producao_mil: number;
}

export type SituacaoEstoque = "sem_controle" | "negativo" | "zerado" | "baixo" | "ok";

export interface Produto {
  id: number;
  nome: string;
  codigo: string | null;
  codigo_barras: string | null;
  categoria: string;
  unidade: Unidade;
  custo_centavos: number;
  preco_centavos: number;
  /** Lucro bruto por unidade: preço − custo. */
  lucro_centavos: number;
  /** Margem sobre o preço de venda, em pontos-base (6570 = 65,70%). */
  margem_bp: number | null;
  estoque: number;
  estoque_minimo: number;
  controla_estoque: boolean;
  situacao_estoque: SituacaoEstoque;
  ativo: boolean;
  observacao: string;
  criado_em: string;
  atualizado_em: string;
  fabricado: boolean;
  lote_producao: number;
  /** "A partir de X, cada um sai por Y", em ordem crescente de quantidade. */
  precos_quantidade: FaixaPrecoApi[];
}

/** Texto em minúsculas e sem acentos, para a busca achar "balao" em "Balão". */
export function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function textoDeBusca(d: Pick<DadosProduto, "nome" | "categoria" | "codigo" | "codigo_barras">): string {
  return normalizarBusca([d.nome, d.categoria, d.codigo ?? "", d.codigo_barras ?? ""].join(" "));
}

export function situacaoEstoque(l: Pick<LinhaProduto, "controla_estoque" | "estoque_mil" | "estoque_minimo_mil">): SituacaoEstoque {
  if (!l.controla_estoque) return "sem_controle";
  if (l.estoque_mil < 0) return "negativo";
  if (l.estoque_mil === 0) return "zerado";
  if (l.estoque_minimo_mil > 0 && l.estoque_mil <= l.estoque_minimo_mil) return "baixo";
  return "ok";
}

export function paraProduto(l: LinhaProduto, faixas: FaixaPreco[] = []): Produto {
  const lucro = l.preco_centavos - l.custo_centavos;
  return {
    id: l.id,
    nome: l.nome,
    codigo: l.codigo,
    codigo_barras: l.codigo_barras,
    categoria: l.categoria,
    unidade: l.unidade,
    custo_centavos: l.custo_centavos,
    preco_centavos: l.preco_centavos,
    lucro_centavos: lucro,
    margem_bp: margemBp(lucro, l.preco_centavos),
    estoque: deMil(l.estoque_mil),
    estoque_minimo: deMil(l.estoque_minimo_mil),
    controla_estoque: l.controla_estoque === 1,
    situacao_estoque: situacaoEstoque(l),
    ativo: l.ativo === 1,
    observacao: l.observacao,
    criado_em: l.criado_em,
    atualizado_em: l.atualizado_em,
    fabricado: l.fabricado === 1,
    lote_producao: deMil(l.lote_producao_mil),
    precos_quantidade: faixasParaApi(faixas),
  };
}

export function linhaProduto(db: Banco, id: number): LinhaProduto | null {
  return db.query("SELECT * FROM produtos WHERE id = $id").get({ id }) as LinhaProduto | null;
}

export function exigirProduto(db: Banco, id: number): LinhaProduto {
  const l = linhaProduto(db, id);
  if (!l) throw naoEncontrado("Produto não encontrado.");
  return l;
}

export function obterProduto(db: Banco, id: number): Produto {
  return paraProduto(exigirProduto(db, id), faixasDoProduto(db, id));
}

export interface FiltroProdutos {
  busca?: string;
  categoria?: string;
  incluirInativos?: boolean;
}

export function listarProdutos(db: Banco, filtro: FiltroProdutos = {}): Produto[] {
  const condicoes: string[] = [];
  const params: Record<string, string | number> = {};
  if (!filtro.incluirInativos) condicoes.push("ativo = 1");
  if (filtro.categoria) {
    condicoes.push("categoria = $categoria");
    params.categoria = filtro.categoria;
  }
  const palavras = normalizarBusca(filtro.busca ?? "").split(" ").filter(Boolean).slice(0, 8);
  palavras.forEach((p, i) => {
    condicoes.push(`busca LIKE $p${i} ESCAPE '\\'`);
    params[`p${i}`] = `%${p.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  });
  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const linhas = db
    .query(`SELECT * FROM produtos ${where} ORDER BY ativo DESC, nome COLLATE NOCASE`)
    .all(params) as LinhaProduto[];
  const faixas = faixasDeTodos(db);
  return linhas.map((l) => paraProduto(l, faixas.get(l.id)));
}

/** Procura pelo código de barras ou código interno exato (só produtos ativos). */
export function buscarPorCodigo(db: Banco, codigo: string): Produto | null {
  const c = codigo.trim();
  if (!c) return null;
  const l = db
    .query("SELECT * FROM produtos WHERE ativo = 1 AND (codigo_barras = $c OR codigo = $c) ORDER BY codigo_barras = $c DESC LIMIT 1")
    .get({ c }) as LinhaProduto | null;
  return l ? paraProduto(l, faixasDoProduto(db, l.id)) : null;
}

export function categoriasDeProduto(db: Banco): string[] {
  const linhas = db
    .query("SELECT DISTINCT categoria FROM produtos WHERE categoria <> '' ORDER BY categoria COLLATE NOCASE")
    .all() as Array<{ categoria: string }>;
  return linhas.map((l) => l.categoria);
}

function validarDados(db: Banco, d: DadosProduto, idAtual: number | null): void {
  if (!d.nome.trim()) throw new ErroNegocio("Informe o nome do produto.", 422, "nome");
  if (!(d.unidade in UNIDADES)) throw new ErroNegocio("Unidade de medida inválida.", 422, "unidade");
  if (d.preco_centavos <= 0) throw new ErroNegocio("Informe o preço de venda.", 422, "preco_centavos");
  if (d.custo_centavos < 0) throw new ErroNegocio("O preço de custo não pode ser negativo.", 422, "custo_centavos");
  if (d.estoque_minimo_mil < 0) throw new ErroNegocio("O estoque mínimo não pode ser negativo.", 422, "estoque_minimo");
  if (d.estoque_minimo_mil > 0) validarQuantidadeMil(d.estoque_minimo_mil, d.unidade, "Estoque mínimo");
  if (d.lote_producao_mil !== undefined) {
    if (!Number.isSafeInteger(d.lote_producao_mil) || d.lote_producao_mil < 0) {
      throw new ErroNegocio("O lote de produção não pode ser negativo.", 422, "lote_producao");
    }
    if (d.lote_producao_mil > 0) validarQuantidadeMil(d.lote_producao_mil, d.unidade, "Lote de produção");
  }
  if (d.faixas_preco) validarFaixas(d.faixas_preco, d.unidade);

  for (const [campo, rotulo] of [
    ["codigo_barras", "código de barras"],
    ["codigo", "código"],
  ] as const) {
    const valor = d[campo];
    if (!valor) continue;
    const outro = db
      .query(`SELECT id, nome, ativo FROM produtos WHERE ${campo} = $v AND id <> $id`)
      .get({ v: valor, id: idAtual ?? 0 }) as { id: number; nome: string; ativo: number } | null;
    if (outro) {
      const inativo = outro.ativo ? "" : " (inativo)";
      throw new ErroNegocio(`Esse ${rotulo} já é usado no produto "${outro.nome}"${inativo}.`, 409, campo);
    }
  }
}

function registrarAlteracaoPreco(
  db: Banco,
  produtoId: number,
  antes: { custo: number | null; preco: number | null },
  depois: { custo: number; preco: number },
  motivo: "cadastro" | "edicao" | "entrada",
): void {
  db.query(
    `INSERT INTO alteracoes_preco
       (produto_id, custo_antes_centavos, custo_depois_centavos, preco_antes_centavos, preco_depois_centavos, motivo, criado_em)
     VALUES ($p, $ca, $cd, $pa, $pd, $motivo, $agora)`,
  ).run({
    p: produtoId,
    ca: antes.custo,
    cd: depois.custo,
    pa: antes.preco,
    pd: depois.preco,
    motivo,
    agora: agoraIso(),
  });
}

export { registrarAlteracaoPreco };

export function criarProduto(db: Banco, dados: NovoProduto): Produto {
  return transacao(db, () => {
    validarDados(db, dados, null);
    const estoqueInicial = dados.controla_estoque ? dados.estoque_inicial_mil : 0;
    if (estoqueInicial < 0) throw new ErroNegocio("O estoque inicial não pode ser negativo.", 422, "estoque_inicial");
    if (estoqueInicial > 0) validarQuantidadeMil(estoqueInicial, dados.unidade, "Estoque inicial");

    const agora = agoraIso();
    const { id } = db
      .query(
        `INSERT INTO produtos
           (nome, codigo, codigo_barras, categoria, unidade, custo_centavos, preco_centavos,
            estoque_mil, estoque_minimo_mil, controla_estoque, ativo, observacao, busca, criado_em, atualizado_em,
            fabricado, lote_producao_mil)
         VALUES ($nome, $codigo, $barras, $categoria, $unidade, $custo, $preco,
                 0, $minimo, $controla, 1, $obs, $busca, $agora, $agora, $fabricado, $lote)
         RETURNING id`,
      )
      .get({
        nome: dados.nome.trim(),
        codigo: dados.codigo,
        barras: dados.codigo_barras,
        categoria: dados.categoria.trim(),
        unidade: dados.unidade,
        custo: dados.custo_centavos,
        preco: dados.preco_centavos,
        minimo: dados.estoque_minimo_mil,
        controla: dados.controla_estoque ? 1 : 0,
        obs: dados.observacao.trim(),
        busca: textoDeBusca(dados),
        agora,
        fabricado: dados.fabricado ? 1 : 0,
        lote: dados.lote_producao_mil ?? 0,
      }) as { id: number };
    if (dados.faixas_preco?.length) gravarFaixas(db, id, dados.faixas_preco);

    registrarAlteracaoPreco(
      db,
      id,
      { custo: null, preco: null },
      { custo: dados.custo_centavos, preco: dados.preco_centavos },
      "cadastro",
    );
    if (estoqueInicial > 0) {
      movimentarEstoque(db, {
        produtoId: id,
        tipo: "inicial",
        quantidadeMil: estoqueInicial,
        custoUnitarioCentavos: dados.custo_centavos,
        observacao: "Estoque inicial no cadastro",
      });
    }
    return obterProduto(db, id);
  });
}

export function atualizarProduto(db: Banco, id: number, dados: DadosProduto & { ativo?: boolean }): Produto {
  return transacao(db, () => {
    const atual = exigirProduto(db, id);
    validarDados(db, dados, id);
    if (dados.faixas_preco === undefined && dados.unidade !== atual.unidade) {
      validarFaixas(
        faixasDoProduto(db, id).map((f) => ({ quantidade_mil: f.quantidade_minima_mil, preco_centavos: f.preco_centavos })),
        dados.unidade,
      );
    }
    if (!UNIDADES[dados.unidade].fracionavel && atual.estoque_mil % 1000 !== 0) {
      throw new ErroNegocio(
        `O estoque atual (${quantidadeTexto(atual.estoque_mil)}) tem fração; ajuste o estoque antes de mudar para ${UNIDADES[dados.unidade].nome}.`,
        422,
        "unidade",
      );
    }
    db.query(
      `UPDATE produtos SET
         nome = $nome, codigo = $codigo, codigo_barras = $barras, categoria = $categoria, unidade = $unidade,
         custo_centavos = $custo, preco_centavos = $preco, estoque_minimo_mil = $minimo,
         controla_estoque = $controla, ativo = $ativo, observacao = $obs, busca = $busca, atualizado_em = $agora,
         fabricado = $fabricado, lote_producao_mil = $lote
       WHERE id = $id`,
    ).run({
      id,
      nome: dados.nome.trim(),
      codigo: dados.codigo,
      barras: dados.codigo_barras,
      categoria: dados.categoria.trim(),
      unidade: dados.unidade,
      custo: dados.custo_centavos,
      preco: dados.preco_centavos,
      minimo: dados.estoque_minimo_mil,
      controla: dados.controla_estoque ? 1 : 0,
      ativo: dados.ativo === undefined ? atual.ativo : dados.ativo ? 1 : 0,
      obs: dados.observacao.trim(),
      busca: textoDeBusca(dados),
      agora: agoraIso(),
      fabricado: dados.fabricado === undefined ? atual.fabricado : dados.fabricado ? 1 : 0,
      lote: dados.lote_producao_mil ?? atual.lote_producao_mil,
    });
    if (dados.faixas_preco !== undefined) gravarFaixas(db, id, dados.faixas_preco);
    if (atual.custo_centavos !== dados.custo_centavos || atual.preco_centavos !== dados.preco_centavos) {
      registrarAlteracaoPreco(
        db,
        id,
        { custo: atual.custo_centavos, preco: atual.preco_centavos },
        { custo: dados.custo_centavos, preco: dados.preco_centavos },
        "edicao",
      );
    }
    return obterProduto(db, id);
  });
}

/**
 * Exclui o produto se ele nunca foi usado. Se já teve venda, compra ou ajuste,
 * só desativa (o histórico e os relatórios continuam certos).
 */
export function excluirProduto(db: Banco, id: number): { acao: "excluido" | "inativado" } {
  return transacao(db, () => {
    exigirProduto(db, id);
    const usado = db
      .query(
        `SELECT
           EXISTS (SELECT 1 FROM venda_itens WHERE produto_id = $id)
        OR EXISTS (SELECT 1 FROM entradas_estoque_itens WHERE produto_id = $id)
        OR EXISTS (SELECT 1 FROM movimentos_estoque WHERE produto_id = $id AND tipo <> 'inicial') AS usado`,
      )
      .get({ id }) as { usado: number };
    if (usado.usado) {
      db.query("UPDATE produtos SET ativo = 0, atualizado_em = $agora WHERE id = $id").run({ id, agora: agoraIso() });
      return { acao: "inativado" as const };
    }
    db.query("DELETE FROM movimentos_estoque WHERE produto_id = $id").run({ id });
    db.query("DELETE FROM alteracoes_preco WHERE produto_id = $id").run({ id });
    db.query("DELETE FROM precos_quantidade WHERE produto_id = $id").run({ id });
    db.query("DELETE FROM produtos WHERE id = $id").run({ id });
    return { acao: "excluido" as const };
  });
}

export interface HistoricoProduto {
  movimentos: Array<{
    id: number;
    tipo: string;
    quantidade: number;
    saldo: number;
    custo_unitario_centavos: number;
    venda_id: number | null;
    entrada_id: number | null;
    observacao: string;
    data: string;
    criado_em: string;
  }>;
  alteracoes_preco: Array<{
    custo_antes_centavos: number | null;
    custo_depois_centavos: number;
    preco_antes_centavos: number | null;
    preco_depois_centavos: number;
    motivo: string;
    criado_em: string;
  }>;
}

export function historicoDoProduto(db: Banco, id: number): HistoricoProduto {
  exigirProduto(db, id);
  const movimentos = db
    .query(
      `SELECT id, tipo, quantidade_mil, saldo_mil, custo_unitario_centavos, venda_id, entrada_id, observacao, data, criado_em
       FROM movimentos_estoque WHERE produto_id = $id ORDER BY id DESC LIMIT 200`,
    )
    .all({ id }) as Array<Record<string, number | string | null>>;
  const alteracoes = db
    .query(
      `SELECT custo_antes_centavos, custo_depois_centavos, preco_antes_centavos, preco_depois_centavos, motivo, criado_em
       FROM alteracoes_preco WHERE produto_id = $id ORDER BY id DESC LIMIT 100`,
    )
    .all({ id }) as HistoricoProduto["alteracoes_preco"];
  return {
    movimentos: movimentos.map((m) => ({
      id: m.id as number,
      tipo: m.tipo as string,
      quantidade: deMil(m.quantidade_mil as number),
      saldo: deMil(m.saldo_mil as number),
      custo_unitario_centavos: m.custo_unitario_centavos as number,
      venda_id: m.venda_id as number | null,
      entrada_id: m.entrada_id as number | null,
      observacao: m.observacao as string,
      data: m.data as string,
      criado_em: m.criado_em as string,
    })),
    alteracoes_preco: alteracoes,
  };
}

/** Marca se o produto é feito pela loja (Produzir) ou comprado para revenda (Comprar). */
export function definirFabricado(db: Banco, id: number, fabricado: boolean): Produto {
  return transacao(db, () => {
    exigirProduto(db, id);
    db.query("UPDATE produtos SET fabricado = $f, atualizado_em = $agora WHERE id = $id").run({ id, f: fabricado ? 1 : 0, agora: agoraIso() });
    return obterProduto(db, id);
  });
}
