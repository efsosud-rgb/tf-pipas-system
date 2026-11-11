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
import { ajustarEstoque, listarEntradas, obterEntrada, registrarEntrada, registrarProducao } from "./dominio/estoque";
import {
  atualizarCategoria,
  atualizarLancamento,
  contasPendentes,
  criarCategoria,
  criarLancamento,
  desfazerPagamento,
  excluirLancamento,
  fluxoDiario,
  listarCategorias,
  listarLancamentos,
  pagarLancamento,
  resumoFinanceiro,
} from "./dominio/financeiro";
import { atualizarForma, criarForma, listarFormas } from "./dominio/formas";
import { alertasDeEstoque, lerParametrosProducao, salvarParametrosProducao, sugestaoDeProducao } from "./dominio/producao";
import {
  atualizarProduto,
  buscarPorCodigo,
  categoriasDeProduto,
  criarProduto,
  definirFabricado,
  excluirProduto,
  historicoDoProduto,
  listarProdutos,
  obterProduto,
  type Produto,
} from "./dominio/produtos";
import {
  painelInicio,
  painelRapido,
  porFormaPagamento,
  porProduto,
  porVendedor,
  relatorioEstoque,
  resultado,
  resultadoMensal,
  vendasNoTempo,
} from "./dominio/relatorios";
import {
  atualizarUsuario,
  conferirBloqueio,
  conferirSenha,
  criarSessao,
  criarUsuario,
  definirSenha,
  encerrarSessao,
  encerrarTodasAsSessoes,
  existemUsuarios,
  limparErrosDeSenha,
  listarUsuarios,
  novoCodigoRecuperacao,
  obterUsuario,
  pode,
  primeiroAcesso,
  recuperarSenha,
  registrarErroDeSenha,
  usuarioDaSessao,
  usuariosParaEntrar,
  validarSenha,
  HORAS_SESSAO,
  type Permissao,
  type Usuario,
} from "./dominio/usuarios";
import { alertasDaVenda, cancelarVenda, listarVendas, obterVenda, registrarVenda, type Venda, type VendaNaLista } from "./dominio/vendas";
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
  zEdicaoUsuario,
  zEntrada,
  zEntrar,
  zFabricado,
  zFecharCaixa,
  zMinhaSenha,
  zMovimentoCaixa,
  zNovaCategoria,
  zNovaForma,
  zNovaVenda,
  zNovoLancamento,
  zNovoProduto,
  zNovoUsuario,
  zPagarLancamento,
  zParametrosProducao,
  zPrimeiroAcesso,
  zProducao,
  zRecuperar,
  zSenhaUsuario,
} from "./validacao";

/** Cabeçalho que a interface manda em toda alteração (bloqueia pedidos de outros sites). */
export const CABECALHO_APP = "x-tf-pipas";
export const COOKIE_SESSAO = "tfpipas_sessao";

const SEM_CACHE = { "Cache-Control": "no-store" };

export function respostaJson(dados: unknown, status = 200, extras: Record<string, string> = {}): Response {
  return Response.json(dados, { status, headers: { ...SEM_CACHE, ...extras } });
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

/* ------------------------------------------------------------------ */
/* Sessão (cookie)                                                      */
/* ------------------------------------------------------------------ */
function lerCookie(req: Request, nome: string): string | null {
  const bruto = req.headers.get("cookie") ?? "";
  for (const parte of bruto.split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === nome) return decodeURIComponent(v.join("="));
  }
  return null;
}

function cabecalhoCookie(token: string | null): Record<string, string> {
  const base = `${COOKIE_SESSAO}=${token ?? ""}; Path=/; HttpOnly; SameSite=Strict`;
  // o servidor controla o prazo de verdade (14 h sem uso); o cookie só precisa durar mais que isso
  return { "Set-Cookie": token ? `${base}; Max-Age=${30 * 24 * 3600}` : `${base}; Max-Age=0` };
}

interface Sessao {
  usuario: Usuario;
  token: string;
  token_hash: string;
}

function sessaoDoPedido(req: Request, ctx: Contexto): Sessao | null {
  const token = lerCookie(req, COOKIE_SESSAO);
  const s = usuarioDaSessao(ctx.db, token);
  return s && token ? { ...s, token } : null;
}

/* ------------------------------------------------------------------ */
/* Custo e lucro só para quem pode ver                                  */
/* ------------------------------------------------------------------ */
function veCusto(u: Usuario): boolean {
  return pode(u, "financeiro") || pode(u, "produtos");
}

function produtoParaUsuario(p: Produto, u: Usuario): Partial<Produto> {
  if (veCusto(u)) return p;
  const { custo_centavos: _c, lucro_centavos: _l, margem_bp: _m, ...resto } = p;
  return resto;
}

function vendaParaUsuario(v: Venda, u: Usuario): unknown {
  if (pode(u, "financeiro")) return v;
  const { custo_centavos: _c, lucro_bruto_centavos: _l, ...resto } = v;
  return {
    ...resto,
    itens: v.itens.map(({ custo_unitario_centavos: _cu, custo_total_centavos: _ct, ...i }) => i),
  };
}

function vendaListaParaUsuario(v: VendaNaLista, u: Usuario): unknown {
  if (pode(u, "financeiro")) return v;
  const { custo_centavos: _c, lucro_bruto_centavos: _l, ...resto } = v;
  return resto;
}

/* ------------------------------------------------------------------ */
/* Envoltórios das rotas                                                */
/* ------------------------------------------------------------------ */
type Resultado = unknown | Promise<unknown>;

function responder(r: unknown): Response {
  return r instanceof Response ? r : respostaJson(r ?? { ok: true });
}

function conferirPedido(req: Request, ctx: Contexto): Response | null {
  if (!hostPermitido(req, ctx)) return respostaJson({ erro: "Acesso permitido só neste computador." }, 403);
  if (req.method !== "GET" && req.headers.get(CABECALHO_APP) !== "1") return respostaJson({ erro: "Pedido recusado." }, 403);
  return null;
}

/** Rota aberta (antes de entrar no sistema). */
function publica(ctx: Contexto, fn: (req: BunRequest<string>, sessao: Sessao | null) => Resultado) {
  return async (req: BunRequest<string>): Promise<Response> => {
    try {
      const recusa = conferirPedido(req, ctx);
      if (recusa) return recusa;
      return responder(await fn(req, sessaoDoPedido(req, ctx)));
    } catch (erro) {
      return respostaDeErro(erro, ctx);
    }
  };
}

/**
 * Rota que exige usuário logado com a permissão indicada (ou uma delas).
 * Sem sessão: 401 (a tela volta para a entrada). Sem permissão: 403.
 */
function protegida(
  ctx: Contexto,
  permissao: Permissao | Permissao[],
  fn: (req: BunRequest<string>, u: Usuario, sessao: Sessao) => Resultado,
) {
  const exigidas = Array.isArray(permissao) ? permissao : [permissao];
  return async (req: BunRequest<string>): Promise<Response> => {
    try {
      const recusa = conferirPedido(req, ctx);
      if (recusa) return recusa;
      const sessao = sessaoDoPedido(req, ctx);
      if (!sessao) return respostaJson({ erro: "Entre com o seu usuário para continuar.", sessao: false }, 401);
      if (!exigidas.some((p) => pode(sessao.usuario, p))) {
        return respostaJson({ erro: "Seu usuário não tem permissão para isso. Peça ao administrador." }, 403);
      }
      return responder(await fn(req, sessao.usuario, sessao));
    } catch (erro) {
      return respostaDeErro(erro, ctx);
    }
  };
}

export function criarRotas(ctx: Contexto) {
  const livre = (fn: (req: BunRequest<string>, sessao: Sessao | null) => Resultado) => publica(ctx, fn);
  const com = (permissao: Permissao | Permissao[], fn: (req: BunRequest<string>, u: Usuario, sessao: Sessao) => Resultado) =>
    protegida(ctx, permissao, fn);
  const filtroData = (req: Request, nome: string) => {
    const v = new URL(req.url).searchParams.get(nome);
    if (v === null || v === "") return undefined;
    if (!ehDataValida(v)) throw new ErroNegocio("Data inválida.", 400);
    return v;
  };
  const parametro = (req: Request, nome: string) => new URL(req.url).searchParams.get(nome) ?? undefined;
  const autor = (u: Usuario) => ({ id: u.id, nome: u.nome });

  return {
    "/api/saude": {
      GET: livre(() => ({
        app: "tf-pipas",
        versao: ctx.versao,
        pasta_dados: ctx.pastaDados,
        hoje: dataLocal(),
        agora: agora().toISOString(),
      })),
    },

    // Entrada no sistema
    "/api/auth/estado": {
      GET: livre((_req, sessao) => {
        const primeiro = !existemUsuarios(ctx.db);
        return {
          primeiro_acesso: primeiro,
          usuarios: primeiro ? [] : usuariosParaEntrar(ctx.db),
          usuario: sessao?.usuario ?? null,
          loja_nome: lerConfig(ctx.db).loja_nome,
        };
      }),
    },
    "/api/auth/primeiro-acesso": {
      POST: livre(async (req) => {
        const d = validar(zPrimeiroAcesso, await lerJson(req));
        const { usuario, codigo_recuperacao } = await primeiroAcesso(ctx.db, d);
        const { token } = criarSessao(ctx.db, usuario.id);
        ctx.log(`Primeiro acesso: administrador "${usuario.nome}" criado.`);
        return respostaJson({ usuario, codigo_recuperacao }, 200, cabecalhoCookie(token));
      }),
    },
    "/api/auth/entrar": {
      POST: livre(async (req) => {
        const d = validar(zEntrar, await lerJson(req));
        const chave = `usuario:${d.usuario_id}`;
        conferirBloqueio(chave);
        const usuario = (() => {
          try {
            return obterUsuario(ctx.db, d.usuario_id);
          } catch {
            return null;
          }
        })();
        if (!usuario || !usuario.ativo || !(await conferirSenha(ctx.db, d.usuario_id, d.senha))) {
          registrarErroDeSenha(chave);
          throw new ErroNegocio("Senha errada. Confira e tente de novo.", 401, "senha");
        }
        limparErrosDeSenha(chave);
        const { token } = criarSessao(ctx.db, usuario.id);
        return respostaJson({ usuario: obterUsuario(ctx.db, usuario.id) }, 200, cabecalhoCookie(token));
      }),
    },
    "/api/auth/recuperar": {
      POST: livre(async (req) => {
        const d = validar(zRecuperar, await lerJson(req));
        const { usuario, novo_codigo } = await recuperarSenha(ctx.db, d);
        limparErrosDeSenha(`usuario:${usuario.id}`);
        const { token } = criarSessao(ctx.db, usuario.id);
        ctx.log(`Senha de "${usuario.nome}" trocada com o código de recuperação.`);
        return respostaJson({ usuario, codigo_recuperacao: novo_codigo }, 200, cabecalhoCookie(token));
      }),
    },
    "/api/auth/sair": {
      POST: livre((req) => {
        encerrarSessao(ctx.db, lerCookie(req, COOKIE_SESSAO));
        return respostaJson({ ok: true }, 200, cabecalhoCookie(null));
      }),
    },
    "/api/auth/minha-senha": {
      POST: com("vender", async (req, u, sessao) => {
        const d = validar(zMinhaSenha, await lerJson(req));
        const chave = `usuario:${u.id}`;
        conferirBloqueio(chave);
        if (!(await conferirSenha(ctx.db, u.id, d.senha_atual))) {
          registrarErroDeSenha(chave);
          throw new ErroNegocio("A senha atual está errada.", 401, "senha_atual");
        }
        limparErrosDeSenha(chave);
        validarSenha(d.nova_senha, "nova_senha");
        return definirSenha(ctx.db, u.id, d.nova_senha, sessao.token_hash);
      }),
    },

    // Usuários (só administrador)
    "/api/usuarios": {
      GET: com("administrar", () => listarUsuarios(ctx.db)),
      POST: com("administrar", async (req, u) => {
        const d = validar(zNovoUsuario, await lerJson(req));
        const novo = await criarUsuario(ctx.db, d);
        ctx.log(`Usuário "${novo.nome}" (${novo.perfil}) cadastrado por ${u.nome}.`);
        return novo;
      }),
    },
    "/api/usuarios/codigo-recuperacao": {
      POST: com("administrar", async (_req, u) => {
        const codigo = await novoCodigoRecuperacao(ctx.db);
        ctx.log(`Novo código de recuperação gerado por ${u.nome}.`);
        return { codigo_recuperacao: codigo };
      }),
    },
    "/api/usuarios/:id": {
      PUT: com("administrar", async (req) => atualizarUsuario(ctx.db, idDaRota(req), validar(zEdicaoUsuario, await lerJson(req)))),
    },
    "/api/usuarios/:id/senha": {
      POST: com("administrar", async (req, u, sessao) => {
        const id = idDaRota(req);
        const d = validar(zSenhaUsuario, await lerJson(req));
        const alterado = await definirSenha(ctx.db, id, d.senha, id === u.id ? sessao.token_hash : undefined);
        limparErrosDeSenha(`usuario:${id}`);
        return alterado;
      }),
    },

    // Painéis
    "/api/inicio": { GET: com("financeiro", () => painelInicio(ctx.db)) },
    "/api/painel-rapido": {
      GET: com("vender", () => {
        const sugestao = sugestaoDeProducao(ctx.db);
        return painelRapido(ctx.db, alertasDeEstoque(ctx.db, sugestao).length, sugestao.itens.filter((i) => i.sugestao > 0 && i.fabricado).length);
      }),
    },
    "/api/unidades": {
      GET: com("vender", () => Object.entries(UNIDADES).map(([sigla, u]) => ({ sigla, nome: u.nome, fracionavel: u.fracionavel }))),
    },
    "/api/config": {
      GET: com("vender", () => lerConfig(ctx.db)),
      PUT: com("administrar", async (req) => salvarConfig(ctx.db, validar(zConfig, await lerJson(req)))),
    },

    // Produtos e estoque
    "/api/produtos": {
      GET: com("vender", (req, u) =>
        listarProdutos(ctx.db, {
          busca: parametro(req, "busca"),
          categoria: parametro(req, "categoria"),
          incluirInativos: parametro(req, "inativos") === "1",
        }).map((p) => produtoParaUsuario(p, u)),
      ),
      POST: com("produtos", async (req) => {
        const d = validar(zNovoProduto, await lerJson(req));
        return criarProduto(ctx.db, {
          ...d,
          estoque_minimo_mil: d.estoque_minimo,
          estoque_inicial_mil: d.estoque_inicial,
          lote_producao_mil: d.lote_producao,
          faixas_preco: d.precos_quantidade?.map((f) => ({ quantidade_mil: f.quantidade, preco_centavos: f.preco_centavos })),
        });
      }),
    },
    "/api/produtos/categorias": { GET: com("vender", () => categoriasDeProduto(ctx.db)) },
    "/api/produtos/codigo/:codigo": {
      GET: com("vender", (req, u) => {
        const p = buscarPorCodigo(ctx.db, decodeURIComponent((req.params as { codigo: string }).codigo));
        if (!p) throw new ErroNegocio("Nenhum produto com esse código.", 404);
        return produtoParaUsuario(p, u);
      }),
    },
    "/api/produtos/:id": {
      GET: com("vender", (req, u) => produtoParaUsuario(obterProduto(ctx.db, idDaRota(req)), u)),
      PUT: com("produtos", async (req) => {
        const d = validar(zEdicaoProduto, await lerJson(req));
        return atualizarProduto(ctx.db, idDaRota(req), {
          ...d,
          estoque_minimo_mil: d.estoque_minimo,
          lote_producao_mil: d.lote_producao,
          faixas_preco: d.precos_quantidade?.map((f) => ({ quantidade_mil: f.quantidade, preco_centavos: f.preco_centavos })),
        });
      }),
      DELETE: com("produtos", (req) => excluirProduto(ctx.db, idDaRota(req))),
    },
    "/api/produtos/:id/historico": { GET: com("produtos", (req) => historicoDoProduto(ctx.db, idDaRota(req))) },
    "/api/produtos/:id/fabricado": {
      POST: com("produtos", async (req) => definirFabricado(ctx.db, idDaRota(req), validar(zFabricado, await lerJson(req)).fabricado)),
    },
    "/api/estoque/alertas": { GET: com("vender", () => alertasDeEstoque(ctx.db)) },
    "/api/estoque/entradas": {
      GET: com("produtos", (req) => {
        const tipo = parametro(req, "tipo");
        return listarEntradas(ctx.db, { tipo: tipo === "compra" || tipo === "producao" ? tipo : undefined });
      }),
      POST: com("produtos", async (req, u) => {
        const d = validar(zEntrada, await lerJson(req));
        return registrarEntrada(
          ctx.db,
          {
            ...d,
            itens: d.itens.map((i) => ({ produto_id: i.produto_id, quantidade_mil: i.quantidade, custo_unitario_centavos: i.custo_unitario_centavos })),
          },
          autor(u),
        );
      }),
    },
    "/api/estoque/entradas/:id": { GET: com("produtos", (req) => obterEntrada(ctx.db, idDaRota(req))) },
    "/api/estoque/ajustes": {
      POST: com("produtos", async (req) => {
        const d = validar(zAjuste, await lerJson(req));
        return d.tipo === "contagem"
          ? ajustarEstoque(ctx.db, { produto_id: d.produto_id, tipo: "contagem", nova_quantidade_mil: d.nova_quantidade, observacao: d.observacao })
          : ajustarEstoque(ctx.db, { produto_id: d.produto_id, tipo: d.tipo, quantidade_mil: d.quantidade, observacao: d.observacao });
      }),
    },

    // Produção
    "/api/producao/sugestao": { GET: com("produtos", () => sugestaoDeProducao(ctx.db)) },
    "/api/producao/parametros": {
      GET: com("produtos", () => lerParametrosProducao(ctx.db)),
      PUT: com("produtos", async (req) => salvarParametrosProducao(ctx.db, validar(zParametrosProducao, await lerJson(req)))),
    },
    "/api/producao": {
      GET: com("produtos", () => listarEntradas(ctx.db, { tipo: "producao" })),
      POST: com("produtos", async (req, u) => {
        const d = validar(zProducao, await lerJson(req));
        return registrarProducao(
          ctx.db,
          {
            observacao: d.observacao,
            itens: d.itens.map((i) => ({ produto_id: i.produto_id, quantidade_mil: i.quantidade, custo_unitario_centavos: i.custo_unitario_centavos })),
          },
          autor(u),
        );
      }),
    },

    // Formas de pagamento
    "/api/formas-pagamento": {
      GET: com("vender", (req) => listarFormas(ctx.db, parametro(req, "inativas") === "1")),
      POST: com("administrar", async (req) => criarForma(ctx.db, validar(zNovaForma, await lerJson(req)))),
    },
    "/api/formas-pagamento/:id": {
      PUT: com("administrar", async (req) => atualizarForma(ctx.db, idDaRota(req), validar(zEdicaoForma, await lerJson(req)))),
    },

    // Caixa
    "/api/caixa/atual": {
      GET: com("vender", () => {
        const s = sessaoAberta(ctx.db);
        return { caixa: s ? resumoDoCaixa(ctx.db, s.id) : null };
      }),
    },
    "/api/caixa/abrir": {
      POST: com("vender", async (req, u) => abrirCaixa(ctx.db, validar(zAbrirCaixa, await lerJson(req)), autor(u))),
    },
    "/api/caixa/movimentos": {
      POST: com("vender", async (req, u) => sangriaOuSuprimento(ctx.db, validar(zMovimentoCaixa, await lerJson(req)), autor(u))),
    },
    "/api/caixa/fechar": {
      POST: com("vender", async (req, u) => {
        const resumo = fecharCaixa(ctx.db, validar(zFecharCaixa, await lerJson(req)), autor(u));
        try {
          fazerBackup(ctx.db, ctx.pastaBackups, "fechamento");
        } catch (e) {
          ctx.log(`Backup do fechamento falhou: ${String(e)}`);
        }
        return resumo;
      }),
    },
    "/api/caixa/sessoes": { GET: com("vender", () => listarSessoes(ctx.db)) },
    "/api/caixa/sessoes/:id": { GET: com("vender", (req) => resumoDoCaixa(ctx.db, idDaRota(req))) },

    // Vendas
    "/api/vendas": {
      GET: com("vender", (req, u) => {
        const status = parametro(req, "status");
        const sessao = Number(parametro(req, "sessao") ?? 0);
        return listarVendas(ctx.db, {
          de: filtroData(req, "de"),
          ate: filtroData(req, "ate"),
          status: status === "concluida" || status === "cancelada" ? status : undefined,
          sessao_id: Number.isSafeInteger(sessao) && sessao > 0 ? sessao : undefined,
        }).map((v) => vendaListaParaUsuario(v, u));
      }),
      POST: com("vender", async (req, u) => {
        const d = validar(zNovaVenda, await lerJson(req));
        if (d.desconto_centavos > 0 && !pode(u, "desconto")) {
          throw new ErroNegocio("Seu usuário não pode dar desconto. Peça ao administrador.", 403, "desconto_centavos");
        }
        const venda = registrarVenda(
          ctx.db,
          { ...d, itens: d.itens.map((i) => ({ produto_id: i.produto_id, quantidade_mil: i.quantidade })) },
          autor(u),
        );
        return { ...(vendaParaUsuario(venda, u) as object), alertas_estoque: alertasDaVenda(ctx.db, venda) };
      }),
    },
    "/api/vendas/:id": { GET: com("vender", (req, u) => vendaParaUsuario(obterVenda(ctx.db, idDaRota(req)), u)) },
    "/api/vendas/:id/cancelar": {
      POST: com("cancelar_venda", async (req, u) =>
        vendaParaUsuario(cancelarVenda(ctx.db, idDaRota(req), validar(zCancelamento, await lerJson(req)).motivo, autor(u)), u),
      ),
    },

    // Financeiro
    "/api/financeiro/categorias": {
      GET: com("financeiro", (req) => {
        const tipo = parametro(req, "tipo");
        return listarCategorias(ctx.db, {
          tipo: tipo === "receita" || tipo === "despesa" ? tipo : undefined,
          incluirInativas: parametro(req, "inativas") === "1",
        });
      }),
      POST: com("financeiro", async (req) => criarCategoria(ctx.db, validar(zNovaCategoria, await lerJson(req)))),
    },
    "/api/financeiro/categorias/:id": {
      PUT: com("financeiro", async (req) => atualizarCategoria(ctx.db, idDaRota(req), validar(zEdicaoCategoria, await lerJson(req)))),
    },
    "/api/financeiro/lancamentos": {
      GET: com("financeiro", (req) => {
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
      POST: com("financeiro", async (req) => criarLancamento(ctx.db, validar(zNovoLancamento, await lerJson(req)))),
    },
    "/api/financeiro/lancamentos/:id": {
      PUT: com("financeiro", async (req) => atualizarLancamento(ctx.db, idDaRota(req), validar(zEdicaoLancamento, await lerJson(req)))),
      DELETE: com("financeiro", (req) => excluirLancamento(ctx.db, idDaRota(req), { futurosPendentes: parametro(req, "futuros") === "1" })),
    },
    "/api/financeiro/lancamentos/:id/pagar": {
      POST: com("financeiro", async (req) => pagarLancamento(ctx.db, idDaRota(req), validar(zPagarLancamento, await lerJson(req)))),
    },
    "/api/financeiro/lancamentos/:id/desfazer-pagamento": {
      POST: com("financeiro", (req) => desfazerPagamento(ctx.db, idDaRota(req))),
    },
    "/api/financeiro/pendentes": { GET: com("financeiro", () => contasPendentes(ctx.db)) },
    "/api/financeiro/resumo": {
      GET: com("financeiro", (req) => {
        const p = periodo(req);
        return resumoFinanceiro(ctx.db, p.de, p.ate);
      }),
    },
    "/api/financeiro/fluxo-diario": {
      GET: com("financeiro", (req) => {
        const p = periodo(req);
        return fluxoDiario(ctx.db, p.de, p.ate);
      }),
    },

    // Relatórios
    "/api/relatorios/resultado": {
      GET: com("financeiro", (req) => {
        const p = periodo(req);
        return resultado(ctx.db, p.de, p.ate);
      }),
    },
    "/api/relatorios/resultado-mensal": {
      GET: com("financeiro", (req) => {
        const p = periodo(req);
        return resultadoMensal(ctx.db, p.de, p.ate);
      }),
    },
    "/api/relatorios/produtos": {
      GET: com("financeiro", (req) => {
        const p = periodo(req);
        return porProduto(ctx.db, p.de, p.ate);
      }),
    },
    "/api/relatorios/formas": {
      GET: com("financeiro", (req) => {
        const p = periodo(req);
        return porFormaPagamento(ctx.db, p.de, p.ate);
      }),
    },
    "/api/relatorios/vendedores": {
      GET: com("financeiro", (req) => {
        const p = periodo(req);
        return porVendedor(ctx.db, p.de, p.ate);
      }),
    },
    "/api/relatorios/tempo": {
      GET: com("financeiro", (req) => {
        const p = periodo(req);
        return vendasNoTempo(ctx.db, p.de, p.ate);
      }),
    },
    "/api/relatorios/estoque": { GET: com(["produtos", "financeiro"], () => relatorioEstoque(ctx.db)) },

    // Backup
    "/api/backups": {
      GET: com("administrar", () => ({ pasta: ctx.pastaBackups, backups: listarBackups(ctx.pastaBackups) })),
      POST: com("administrar", () => fazerBackup(ctx.db, ctx.pastaBackups, "manual")),
    },
    "/api/backups/restaurar-arquivo": {
      POST: com("administrar", async (req, u) => {
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
        encerrarTodasAsSessoes(ctx.db);
        ctx.log(`Backup restaurado de arquivo por ${u.nome}.`);
        return respostaJson(
          { restaurado: true, conferencia, copia_do_banco_anterior: antes.nome, entrar_de_novo: true },
          200,
          cabecalhoCookie(null),
        );
      }),
    },
    "/api/backups/:nome": {
      GET: com("administrar", (req) => {
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
      POST: com("administrar", (req, u) => {
        const nome = (req.params as { nome: string }).nome;
        const caminho = caminhoDoBackup(ctx.pastaBackups, nome);
        const conferencia = conferirArquivoDeBanco(caminho);
        const { antes } = restaurarBanco(ctx, caminho);
        encerrarTodasAsSessoes(ctx.db);
        ctx.log(`Backup ${nome} restaurado por ${u.nome}.`);
        return respostaJson(
          { restaurado: true, conferencia, copia_do_banco_anterior: antes.nome, entrar_de_novo: true },
          200,
          cabecalhoCookie(null),
        );
      }),
    },

    // Desligar: aberto para o instalador fechar o programa antes de atualizar.
    // Só faz backup e encerra; abrir o atalho liga de novo.
    "/api/sistema/desligar": {
      POST: livre(() => {
        setTimeout(() => ctx.desligar(), 300);
        return { desligando: true };
      }),
    },
  };
}

export { HORAS_SESSAO };
