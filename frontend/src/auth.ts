import { useSyncExternalStore } from "react";
import { api, mensagemDeErro, quandoPerderSessao } from "./api";
import type { EstadoAuth, Permissao, Usuario } from "./tipos";

/**
 * Quem está usando o sistema. A sessão fica num cookie que só o servidor lê;
 * aqui fica só o usuário atual e as permissões dele (para mostrar/esconder
 * telas). Quem decide de verdade o que pode é sempre o servidor.
 */

interface Estado {
  carregado: boolean;
  estado: EstadoAuth | null;
  /** Mensagem para a tela de entrada (ex.: "sua sessão terminou"). */
  aviso: string | null;
  /** Não deu para falar com o servidor ao abrir. */
  erro: string | null;
}

let atual: Estado = { carregado: false, estado: null, aviso: null, erro: null };
const ouvintes = new Set<() => void>();

function mudar(novo: Partial<Estado>): void {
  atual = { ...atual, ...novo };
  ouvintes.forEach((f) => f());
}

export function useAuth(): Estado {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => atual,
  );
}

export function useUsuario(): Usuario | null {
  return useAuth().estado?.usuario ?? null;
}

export function pode(usuario: Usuario | null | undefined, permissao: Permissao): boolean {
  return !!usuario && usuario.permissoes.includes(permissao);
}

export function usePode(permissao: Permissao): boolean {
  return pode(useUsuario(), permissao);
}

export async function carregarEstado(): Promise<EstadoAuth> {
  try {
    const e = await api.get<EstadoAuth>("/api/auth/estado");
    mudar({ carregado: true, estado: e, erro: null });
    return e;
  } catch (erro) {
    mudar({ erro: mensagemDeErro(erro) });
    throw erro;
  }
}

export function definirUsuario(usuario: Usuario): void {
  mudar({ estado: atual.estado ? { ...atual.estado, usuario, primeiro_acesso: false } : null, aviso: null });
}

export async function sair(aviso: string | null = null): Promise<void> {
  // tira o usuário da tela antes de falar com o servidor: assim um pedido que
  // volte 401 no meio do caminho não vira o aviso de "sessão terminou"
  sessionStorage.removeItem("tfpipas.entrou");
  mudar({ estado: atual.estado ? { ...atual.estado, usuario: null } : null, aviso });
  try {
    await api.post("/api/auth/sair");
  } catch {
    // mesmo sem resposta, a tela volta para a entrada
  }
  await carregarEstado().catch(() => undefined);
}

/** Chamado pela api quando o servidor responde 401 (sessão vencida ou encerrada). */
export function sessaoTerminou(): void {
  if (!atual.estado?.usuario) return;
  sessionStorage.removeItem("tfpipas.entrou");
  mudar({ aviso: "Sua sessão terminou. Entre de novo para continuar." });
  void carregarEstado().catch(() => undefined);
}

quandoPerderSessao(sessaoTerminou);
