import type { BunRequest } from "bun";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Contexto } from "./contexto";
import { restaurarBanco } from "./contexto";
import { caminhoDoBackup, conferirArquivoDeBanco, fazerBackup, listarBackups } from "./dominio/backup";
import {
  abrirCaixa,
  fecharCaixa,
  listarSessoes,
  resumoDoCaixa,
  sangriaOuSuprimento,
  sessaoAberta,
} from "./dominio/caixa";
import { lerConfig, salvarConfig } from "./dominio/config";
import { ajustarEstoque, listarEntradas, obterEntrada, registrarEntrada } from "./dominio/estoque";
import {
  atualizarCategoria,
  atualizarLancamento,
  contasPendentes,
  criarCategoria,
  criarLancamento,
  desfazerPagamento,
  excluirLancamento,
  listarCategorias,
  listarLancamentos,
  pagarLancamento,
  resumoFinanceiro,
} from "./dominio/financeiro";
import { atualizarForma, criarForma, listarFormas } from "./dominio/formas";
import {
  atualizarProduto,
  buscarPorCodigo,
  categoriasDeProduto,
  criarProduto,
  excluirProduto,
  historicoDoProduto,
  listarProdutos,
  obterProduto,
} from "./dominio/produtos";
import {
  painelInicio,
  porFormaPagamento,
  porProduto,
  relatorioEstoque,
  resultado,
  vendasNoTempo,
} from "./dominio/relatorios";
import { cancelarVenda, listarVendas, obterVenda, registrarVenda } from "./dominio/vendas";
import { ErroNegocio } from "./erros";
import { UNIDADES } from "./quantidade";
import { agora, dataLocal, diferencaEmDias, ehDataValida, primeiroDiaDoMes, ultimoDiaDoMes } from "./relogio";
import {
  validar,
  zAbrirCaixa,
  zAjuste,
  zCancelamento,
  zConfig,
  zEdicaoCategoria,
  zEdicaoForma,
  zEdicaoLancamento,
  zEdicaoProduto,
  zEntrada,
  zFecharCaixa,
  zMovimentoCaixa,
  zNovaCategoria,
  zNovaForma,
  zNovaVenda,
  zNovoLancamento,
  zNovoProduto,
  zPagarLancamento,
} from "./validacao";

/** Cabeçalho que a interface manda em toda alteração (bloqueia pedidos de outros sites). */
export const CABECALHO_APP = "x-tf-pipas";

const SEM_CACHE = { "Cache-Control": "no-store" };

export function respostaJson(dados: unknown, status = 200): Response {
  return Response.json(dados, { status, headers: SEM_CACHE });
}

export function respostaDeErro(erro: unknown, ctx: Contexto): Response {
  if (erro instanceof ErroNegocio) return respostaJson({ erro: erro.message, campo: erro.campo ?? null }, erro.status);
  ctx.log(`ERRO: ${erro instanceof Error ? (erro.stack ?? erro.message) : String(erro)}`);
  return respostaJson({ erro: "Algo deu errado no sistema. Tente de novo; se continuar, reinicie o TF Pipas." }, 500);
}

function hostPermitido(req: Request, ctx: Contexto): boolean {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  return [`127.0.0.1:${ctx.porta}`, `localhost:${ctx.porta}`, `[::1]:${ctx.porta}`].includes(host);
}

async function lerJson(req: Request): Promise<unknown> {
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) {
    throw new ErroNegocio("O pedido precisa ser enviado em JSON.", 415);
  }
  try {
    return await req.json();
  } catch {
    throw new ErroNegocio("Os dados enviados estão incompletos.", 400);
  }
}

function idDaRota(req: BunRequest<string>, nome = "id"): number {
  const id = Number((req.params as Record<string, string>)[nome]);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ErroNegocio("Endereço inválido.", 404);
  return id;
}

/** Período da consulta (?de=AAAA-MM-DD&ate=AAAA-MM-DD). Sem período: o mês atual inteiro. */
function periodo(req: Request): { de: string; ate: string } {
  const u = new URL(req.url);
  const hoje = dataLocal();
  const de = u.searchParams.get("de") ?? primeiroDiaDoMes(hoje);
  const ate = u.searchParams.get("ate") ?? ultimoDiaDoMes(hoje);
  if (!ehDataValida(de) || !ehDataValida(ate)) throw new ErroNegocio("Período inválido.", 400);
  if (de > ate) throw new ErroNegocio("A data inicial é depois da data final.", 400);
  if (diferencaEmDias(de, ate) > 366 * 5) throw new ErroNegocio("Escolha um período de até 5 anos.", 400);
  return { de, ate };
}

type Manipulador = (req: BunRequest<string>) => unknown | Promise<unknown>;

/**
 * Envolve uma rota da API: aceita só pedidos feitos neste computador, exige o
 * cabeçalho da interface nas alterações e transforma erros em JSON.
 */
function api(ctx: Contexto, fn: Manipulador) {
  return async (req: BunRequest<string>): Promise<Response> => {
    try {
      if (!hostPermitido(req, ctx)) return respostaJson({ erro: "Acesso permitido só neste computador." }, 403);
      if (req.method !== "GET" && req.headers.get(CABECALHO_APP) !== "1") {
        return respostaJson({ erro: "Pedido recusado." }, 403);
      }
      const r = await fn(req);
      return r instanceof Response ? r : respostaJson(r ?? { ok: true });
    } catch (erro) {
      return respostaDeErro(erro, ctx);
    }
  };
}

export function criarRotas(ctx: Contexto) {
  const a = (fn: Manipulador) => api(ctx, fn);
  const filtroData = (req: Request, nome: string) => {
    const v = new URL(req.url).searchParams.get(nome);
    if (v === null || v === "") return undefined;
    if (!ehDataValida(v)) throw new ErroNegocio("Data inválida.", 400);
    return v;
  };
  const parametro = (req: Request, nome: string) => new URL(req.url).searchParams.get(nome) ?? undefined;

  return {
    "/api/saude": {
      GET: a(() => ({
        app: "tf-pipas",
        versao: ctx.versao,
        pasta_dados: ctx.pastaDados,
        hoje: dataLocal(),
        agora: agora().toISOString(),
      })),
    },
    "/api/inicio": { GET: a(() => painelInicio(ctx.db)) },
    "/api/unidades": {
      GET: a(() => Object.entries(UNIDADES).map(([sigla, u]) => ({ sigla, nome: u.nome, fracionavel: u.fracionavel }))),
    },
    "/api/config": {
      GET: a(() => lerConfig(ctx.db)),
      PUT: a(async (req) => salvarConfig(ctx.db, validar(zConfig, await lerJson(req)))),
    },

    // Produtos e estoque
    "/api/produtos": {
      GET: a((req) =>
        listarProdutos(ctx.db, {
          busca: parametro(req, "busca"),
          categoria: parametro(req, "categoria"),
          incluirInativos: parametro(req, "inativos") === "1",
        }),
      ),
      POST: a(async (req) => {
        const d = validar(zNovoProduto, await lerJson(req));
        return criarProduto(ctx.db, { ...d, estoque_minimo_mil: d.estoque_minimo, estoque_inicial_mil: d.estoque_inicial });
      }),
    },
    "/api/produtos/categorias": { GET: a(() => categoriasDeProduto(ctx.db)) },
    "/api/produtos/codigo/:codigo": {
      GET: a((req) => {
        const p = buscarPorCodigo(ctx.db, decodeURIComponent((req.params as { codigo: string }).codigo));
        if (!p) throw new ErroNegocio("Nenhum produto com esse código.", 404);
        return p;
      }),
    },
    "/api/produtos/:id": {
      GET: a((req) => obterProduto(ctx.db, idDaRota(req))),
      PUT: a(async (req) => {
        const d = validar(zEdicaoProduto, await lerJson(req));
        return atualizarProduto(ctx.db, idDaRota(req), { ...d, estoque_minimo_mil: d.estoque_minimo });
      }),
      DELETE: a((req) => excluirProduto(ctx.db, idDaRota(req))),
    },
    "/api/produtos/:id/historico": { GET: a((req) => historicoDoProduto(ctx.db, idDaRota(req))) },
    "/api/estoque/entradas": {
      GET: a(() => listarEntradas(ctx.db)),
      POST: a(async (req) => {
        const d = validar(zEntrada, await lerJson(req));
        return registrarEntrada(ctx.db, {
          ...d,
          itens: d.itens.map((i) => ({ produto_id: i.produto_id, quantidade_mil: i.quantidade, custo_unitario_centavos: i.custo_unitario_centavos })),
        });
      }),
    },
    "/api/estoque/entradas/:id": { GET: a((req) => obterEntrada(ctx.db, idDaRota(req))) },
    "/api/estoque/ajustes": {
      POST: a(async (req) => {
        const d = validar(zAjuste, await lerJson(req));
        return d.tipo === "contagem"
          ? ajustarEstoque(ctx.db, { produto_id: d.produto_id, tipo: "contagem", nova_quantidade_mil: d.nova_quantidade, observacao: d.observacao })
          : ajustarEstoque(ctx.db, { produto_id: d.produto_id, tipo: d.tipo, quantidade_mil: d.quantidade, observacao: d.observacao });
      }),
    },

    // Formas de pagamento
    "/api/formas-pagamento": {
      GET: a((req) => listarFormas(ctx.db, parametro(req, "inativas") === "1")),
      POST: a(async (req) => criarForma(ctx.db, validar(zNovaForma, await lerJson(req)))),
    },
    "/api/formas-pagamento/:id": {
      PUT: a(async (req) => atualizarForma(ctx.db, idDaRota(req), validar(zEdicaoForma, await lerJson(req)))),
    },

    // Caixa
    "/api/caixa/atual": {
      GET: a(() => {
        const s = sessaoAberta(ctx.db);
        return { caixa: s ? resumoDoCaixa(ctx.db, s.id) : null };
      }),
    },
    "/api/caixa/abrir": { POST: a(async (req) => abrirCaixa(ctx.db, validar(zAbrirCaixa, await lerJson(req)))) },
    "/api/caixa/movimentos": {
      POST: a(async (req) => sangriaOuSuprimento(ctx.db, validar(zMovimentoCaixa, await lerJson(req)))),
    },
    "/api/caixa/fechar": {
      POST: a(async (req) => {
        const resumo = fecharCaixa(ctx.db, validar(zFecharCaixa, await lerJson(req)));
        try {
          fazerBackup(ctx.db, ctx.pastaBackups, "fechamento");
        } catch (e) {
          ctx.log(`Backup do fechamento falhou: ${String(e)}`);
        }
        return resumo;
      }),
    },
    "/api/caixa/sessoes": { GET: a(() => listarSessoes(ctx.db)) },
    "/api/caixa/sessoes/:id": { GET: a((req) => resumoDoCaixa(ctx.db, idDaRota(req))) },

    // Vendas
    "/api/vendas": {
      GET: a((req) => {
        const status = parametro(req, "status");
        const sessao = Number(parametro(req, "sessao") ?? 0);
        return listarVendas(ctx.db, {
          de: filtroData(req, "de"),
          ate: filtroData(req, "ate"),
          status: status === "concluida" || status === "cancelada" ? status : undefined,
          sessao_id: Number.isSafeInteger(sessao) && sessao > 0 ? sessao : undefined,
        });
      }),
      POST: a(async (req) => {
        const d = validar(zNovaVenda, await lerJson(req));
        return registrarVenda(ctx.db, {
          ...d,
          itens: d.itens.map((i) => ({ produto_id: i.produto_id, quantidade_mil: i.quantidade })),
        });
      }),
    },
    "/api/vendas/:id": { GET: a((req) => obterVenda(ctx.db, idDaRota(req))) },
    "/api/vendas/:id/cancelar": {
      POST: a(async (req) => cancelarVenda(ctx.db, idDaRota(req), validar(zCancelamento, await lerJson(req)).motivo)),
    },

    // Financeiro
    "/api/financeiro/categorias": {
      GET: a((req) => {
        const tipo = parametro(req, "tipo");
        return listarCategorias(ctx.db, {
          tipo: tipo === "receita" || tipo === "despesa" ? tipo : undefined,
          incluirInativas: parametro(req, "inativas") === "1",
        });
      }),
      POST: a(async (req) => criarCategoria(ctx.db, validar(zNovaCategoria, await lerJson(req)))),
    },
    "/api/financeiro/categorias/:id": {
      PUT: a(async (req) => atualizarCategoria(ctx.db, idDaRota(req), validar(zEdicaoCategoria, await lerJson(req)))),
    },
    "/api/financeiro/lancamentos": {
      GET: a((req) => {
        const tipo = parametro(req, "tipo");
        const situacao = parametro(req, "situacao");
        const categoria = Number(parametro(req, "categoria") ?? 0);
        return listarLancamentos(ctx.db, {
          de: filtroData(req, "de"),
          ate: filtroData(req, "ate"),
          tipo: tipo === "receita" || tipo === "despesa" ? tipo : undefined,
          situacao: situacao === "pago" || situacao === "pendente" || situacao === "vencido" ? situacao : undefined,
          categoria_id: Number.isSafeInteger(categoria) && categoria > 0 ? categoria : undefined,
        });
      }),
      POST: a(async (req) => criarLancamento(ctx.db, validar(zNovoLancamento, await lerJson(req)))),
    },
    "/api/financeiro/lancamentos/:id": {
      PUT: a(async (req) => atualizarLancamento(ctx.db, idDaRota(req), validar(zEdicaoLancamento, await lerJson(req)))),
      DELETE: a((req) => excluirLancamento(ctx.db, idDaRota(req), { futurosPendentes: parametro(req, "futuros") === "1" })),
    },
    "/api/financeiro/lancamentos/:id/pagar": {
      POST: a(async (req) => pagarLancamento(ctx.db, idDaRota(req), validar(zPagarLancamento, await lerJson(req)))),
    },
    "/api/financeiro/lancamentos/:id/desfazer-pagamento": {
      POST: a((req) => desfazerPagamento(ctx.db, idDaRota(req))),
    },
    "/api/financeiro/pendentes": { GET: a(() => contasPendentes(ctx.db)) },
    "/api/financeiro/resumo": {
      GET: a((req) => {
        const p = periodo(req);
        return resumoFinanceiro(ctx.db, p.de, p.ate);
      }),
    },

    // Relatórios
    "/api/relatorios/resultado": {
      GET: a((req) => {
        const p = periodo(req);
        return resultado(ctx.db, p.de, p.ate);
      }),
    },
    "/api/relatorios/produtos": {
      GET: a((req) => {
        const p = periodo(req);
        return porProduto(ctx.db, p.de, p.ate);
      }),
    },
    "/api/relatorios/formas": {
      GET: a((req) => {
        const p = periodo(req);
        return porFormaPagamento(ctx.db, p.de, p.ate);
      }),
    },
    "/api/relatorios/tempo": {
      GET: a((req) => {
        const p = periodo(req);
        return vendasNoTempo(ctx.db, p.de, p.ate);
      }),
    },
    "/api/relatorios/estoque": { GET: a(() => relatorioEstoque(ctx.db)) },

    // Backup
    "/api/backups": {
      GET: a(() => ({ pasta: ctx.pastaBackups, backups: listarBackups(ctx.pastaBackups) })),
      POST: a(() => fazerBackup(ctx.db, ctx.pastaBackups, "manual")),
    },
    "/api/backups/restaurar-arquivo": {
      POST: a(async (req) => {
        const form = await req.formData().catch(() => null);
        const arquivo = form?.get("arquivo");
        if (!(arquivo instanceof File) || arquivo.size === 0) throw new ErroNegocio("Escolha o arquivo do backup (.db).", 400);
        if (arquivo.size > 500 * 1024 * 1024) throw new ErroNegocio("Arquivo grande demais para ser um backup.", 413);
        const pasta = join(ctx.pastaDados, "recebidos");
        mkdirSync(pasta, { recursive: true });
        const destino = join(pasta, `recebido-${Date.now()}.db`);
        await Bun.write(destino, arquivo);
        const conferencia = conferirArquivoDeBanco(destino);
        const { antes } = restaurarBanco(ctx, destino);
        return { restaurado: true, conferencia, copia_do_banco_anterior: antes.nome };
      }),
    },
    "/api/backups/:nome": {
      GET: a((req) => {
        const nome = (req.params as { nome: string }).nome;
        const caminho = caminhoDoBackup(ctx.pastaBackups, nome);
        return new Response(Bun.file(caminho), {
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename="${nome}"`,
            ...SEM_CACHE,
          },
        });
      }),
    },
    "/api/backups/:nome/restaurar": {
      POST: a((req) => {
        const nome = (req.params as { nome: string }).nome;
        const caminho = caminhoDoBackup(ctx.pastaBackups, nome);
        const conferencia = conferirArquivoDeBanco(caminho);
        const { antes } = restaurarBanco(ctx, caminho);
        return { restaurado: true, conferencia, copia_do_banco_anterior: antes.nome };
      }),
    },

    "/api/sistema/desligar": {
      POST: a(() => {
        setTimeout(() => ctx.desligar(), 300);
        return { desligando: true };
      }),
    },
  };
}
