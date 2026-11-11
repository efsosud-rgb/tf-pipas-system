/**
 * Conversa com o servidor do TF Pipas (no mesmo computador). Toda alteração
 * leva o cabeçalho x-tf-pipas: o servidor recusa pedidos sem ele, o que
 * impede outro site aberto no navegador de mexer nos dados da loja.
 */

export class ErroApi extends Error {
  readonly status: number;
  readonly campo: string | null;

  constructor(mensagem: string, status: number, campo: string | null = null) {
    super(mensagem);
    this.name = "ErroApi";
    this.status = status;
    this.campo = campo;
  }
}

const SEM_CONEXAO =
  "Não consegui falar com o programa TF Pipas neste computador. Se ele foi fechado, abra de novo pelo atalho da área de trabalho.";

async function pedir<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const cabecalhos: Record<string, string> = {};
  if (metodo !== "GET") cabecalhos["x-tf-pipas"] = "1";
  let body: BodyInit | undefined;
  if (corpo instanceof FormData) {
    body = corpo;
  } else if (corpo !== undefined) {
    cabecalhos["Content-Type"] = "application/json";
    body = JSON.stringify(corpo);
  }
  let resposta: Response;
  try {
    resposta = await fetch(caminho, { method: metodo, headers: cabecalhos, body, cache: "no-store" });
  } catch {
    throw new ErroApi(SEM_CONEXAO, 0);
  }
  const tipo = resposta.headers.get("content-type") ?? "";
  const dados = tipo.includes("application/json") ? await resposta.json().catch(() => null) : null;
  if (!resposta.ok) {
    const d = dados as { erro?: string; campo?: string | null } | null;
    throw new ErroApi(d?.erro ?? `O sistema respondeu com erro (${resposta.status}).`, resposta.status, d?.campo ?? null);
  }
  return dados as T;
}

export const api = {
  get: <T>(caminho: string) => pedir<T>("GET", caminho),
  post: <T>(caminho: string, corpo?: unknown) => pedir<T>("POST", caminho, corpo ?? {}),
  put: <T>(caminho: string, corpo: unknown) => pedir<T>("PUT", caminho, corpo),
  delete: <T>(caminho: string) => pedir<T>("DELETE", caminho),
  enviarArquivo: <T>(caminho: string, form: FormData) => pedir<T>("POST", caminho, form),
};

export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroApi) return erro.message;
  if (erro instanceof Error) return erro.message;
  return "Algo deu errado.";
}

/** Monta ?a=1&b=2 ignorando valores vazios. */
export function consulta(parametros: object): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(parametros) as Array<[string, unknown]>) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}
