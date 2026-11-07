import type { Contexto } from "./contexto";
import { criarRotas, respostaJson } from "./rotas";
import { arquivosWeb } from "./web/arquivos-web";

/**
 * Política de segurança da página: tudo vem do próprio programa. Se alguém
 * colocar uma fonte ou script de fora (CDN), o navegador bloqueia e o teste
 * de ponta a ponta acusa — o sistema precisa funcionar sem internet.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

function cabecalhosEstaticos(caminho: string): Record<string, string> {
  return {
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": caminho.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
  };
}

const PAGINA_DEV = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>TF Pipas (desenvolvimento)</title>
<body style="font-family:system-ui;padding:40px">
<h1>Servidor do TF Pipas rodando</h1>
<p>Em desenvolvimento, a interface é servida pelo Vite: abra <a href="http://localhost:5173">http://localhost:5173</a>.</p>
</body></html>`;

/** Entrega a interface embutida no executável (e o index.html para qualquer tela). */
function servirInterface(req: Request, ctx: Contexto): Response {
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) return respostaJson({ erro: "Endereço não encontrado." }, 404);
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Método não permitido", { status: 405 });
  const caminho = url.pathname === "/" ? "/index.html" : url.pathname;
  const arquivo = arquivosWeb[caminho] ?? (caminho.includes(".") ? undefined : arquivosWeb["/index.html"]);
  if (!arquivo) {
    if (Object.keys(arquivosWeb).length === 0 && ctx.modoDev) {
      return new Response(PAGINA_DEV, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    return new Response("Arquivo não encontrado", { status: 404 });
  }
  const servido = arquivosWeb[caminho] ? caminho : "/index.html";
  return new Response(Bun.file(arquivo), { headers: cabecalhosEstaticos(servido) });
}

export function opcoesDoServidor(ctx: Contexto, porta: number) {
  return {
    hostname: "127.0.0.1",
    port: porta,
    development: false,
    maxRequestBodySize: 512 * 1024 * 1024,
    routes: criarRotas(ctx),
    fetch: (req: Request) => servirInterface(req, ctx),
    error: (erro: Error) => {
      ctx.log(`ERRO no servidor: ${erro.stack ?? erro.message}`);
      return respostaJson({ erro: "Algo deu errado no sistema." }, 500);
    },
  };
}

export function iniciarServidor(ctx: Contexto, porta: number) {
  const servidor = Bun.serve(opcoesDoServidor(ctx, porta));
  ctx.porta = servidor.port ?? porta;
  return servidor;
}
