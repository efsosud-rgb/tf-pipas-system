import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { abrirBanco, fecharBanco } from "../src/banco";
import type { Contexto } from "../src/contexto";
import { zerarTentativas } from "../src/dominio/usuarios";
import { CABECALHO_APP, COOKIE_SESSAO } from "../src/rotas";
import { iniciarServidor } from "../src/servidor";

/**
 * Servidor de verdade (porta livre, pasta temporária) para testar a API como a
 * interface usa: com cookie de sessão e o cabeçalho da interface.
 */
export function servidorDeTeste() {
  const pasta = mkdtempSync(join(tmpdir(), "tfpipas-teste-"));
  const caminhoBanco = join(pasta, "tfpipas.db");
  const ctx: Contexto = {
    db: abrirBanco(caminhoBanco),
    caminhoBanco,
    pastaDados: pasta,
    pastaBackups: join(pasta, "backups"),
    versao: "teste",
    porta: 0,
    modoDev: false,
    log: () => {},
    desligar: () => {},
  };
  const servidor = iniciarServidor(ctx, 0);
  const base = `http://127.0.0.1:${ctx.porta}`;
  zerarTentativas();

  /** Uma "janela do navegador": guarda o cookie da sessão entre os pedidos. */
  function cliente() {
    let cookie = "";
    async function chamar(metodo: string, caminho: string, corpo?: unknown, cabecalhos: Record<string, string> = {}) {
      const r = await fetch(base + caminho, {
        method: metodo,
        headers: {
          "Content-Type": "application/json",
          [CABECALHO_APP]: "1",
          ...(cookie ? { Cookie: cookie } : {}),
          ...cabecalhos,
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
      const novo = r.headers.get("set-cookie");
      if (novo?.startsWith(`${COOKIE_SESSAO}=`)) {
        const valor = novo.split(";")[0]!;
        cookie = valor.endsWith("=") ? "" : valor;
      }
      const texto = await r.text();
      let dados: any = null;
      try {
        dados = texto ? JSON.parse(texto) : null;
      } catch {
        dados = texto;
      }
      return { status: r.status, dados, cabecalhos: r.headers };
    }
    return {
      chamar,
      get cookie() {
        return cookie;
      },
      async primeiroAcesso(nome = "Thiago", senha = "1234") {
        const r = await chamar("POST", "/api/auth/primeiro-acesso", { nome, senha });
        if (r.status !== 200) throw new Error(`primeiro acesso falhou: ${JSON.stringify(r.dados)}`);
        return r.dados as { usuario: { id: number; nome: string }; codigo_recuperacao: string };
      },
      async entrar(nome: string, senha: string) {
        const estado = await chamar("GET", "/api/auth/estado");
        const u = (estado.dados.usuarios as Array<{ id: number; nome: string }>).find((x) => x.nome === nome);
        if (!u) throw new Error(`usuário ${nome} não aparece na entrada`);
        return chamar("POST", "/api/auth/entrar", { usuario_id: u.id, senha });
      },
    };
  }

  return {
    ctx,
    base,
    pasta,
    cliente,
    encerrar() {
      servidor.stop(true);
      fecharBanco(ctx.db);
      rmSync(pasta, { recursive: true, force: true });
    },
  };
}
