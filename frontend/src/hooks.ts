import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api, mensagemDeErro } from "./api";

/* ------------------------------------------------------------------ */
/* Aviso global de "os dados mudaram" (venda feita, caixa aberto...):   */
/* as telas que mostram números recarregam sozinhas.                    */
/* ------------------------------------------------------------------ */
let versaoDados = 0;
const ouvintes = new Set<() => void>();

export function avisarMudanca(): void {
  versaoDados++;
  ouvintes.forEach((f) => f());
}

export function useVersaoDados(): number {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => versaoDados,
  );
}

export interface Carregado<T> {
  dados: T | null;
  erro: string | null;
  carregando: boolean;
  recarregar: () => void;
}

/** Busca `caminho` na API e recarrega quando ele muda ou quando os dados mudam. */
export function useApi<T>(caminho: string | null): Carregado<T> {
  const versao = useVersaoDados();
  const [estado, setEstado] = useState<{ dados: T | null; erro: string | null; carregando: boolean }>({
    dados: null,
    erro: null,
    carregando: caminho !== null,
  });
  const [pedido, setPedido] = useState(0);

  useEffect(() => {
    if (caminho === null) return;
    let vivo = true;
    setEstado((e) => ({ ...e, carregando: true }));
    api
      .get<T>(caminho)
      .then((dados) => vivo && setEstado({ dados, erro: null, carregando: false }))
      .catch((e) => vivo && setEstado((s) => ({ dados: s.dados, erro: mensagemDeErro(e), carregando: false })));
    return () => {
      vivo = false;
    };
  }, [caminho, versao, pedido]);

  const recarregar = useCallback(() => setPedido((n) => n + 1), []);
  return { ...estado, recarregar };
}

/** Atalhos de teclado enquanto o componente está na tela. */
export function useAtalhos(mapa: Record<string, (e: KeyboardEvent) => void>, ativo = true): void {
  const ref = useRef(mapa);
  ref.current = mapa;
  useEffect(() => {
    if (!ativo) return;
    const ouvir = (e: KeyboardEvent) => {
      const chave = [e.ctrlKey ? "Ctrl+" : "", e.altKey ? "Alt+" : "", e.key].join("");
      const fn = ref.current[chave];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    window.addEventListener("keydown", ouvir);
    return () => window.removeEventListener("keydown", ouvir);
  }, [ativo]);
}

export function useAgora(intervaloMs = 15_000): Date {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), intervaloMs);
    return () => clearInterval(t);
  }, [intervaloMs]);
  return agora;
}

/** Guarda um valor no armazenamento do navegador (só conveniência local). */
export function lerLocal<T>(chave: string, padrao: T): T {
  try {
    const v = localStorage.getItem(chave);
    return v ? (JSON.parse(v) as T) : padrao;
  } catch {
    return padrao;
  }
}

export function gravarLocal(chave: string, valor: unknown): void {
  try {
    if (valor === null || valor === undefined) localStorage.removeItem(chave);
    else localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // sem armazenamento: só perde a conveniência
  }
}
