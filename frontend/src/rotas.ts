export type Rota = "inicio" | "pdv" | "produtos" | "producao" | "caixa" | "vendas" | "financeiro" | "relatorios" | "configuracoes";

export const ROTAS: Rota[] = ["inicio", "pdv", "produtos", "producao", "caixa", "vendas", "financeiro", "relatorios", "configuracoes"];

export function lerRota(): Rota {
  const r = window.location.hash.replace(/^#\/?/, "").split("?")[0] as Rota;
  return ROTAS.includes(r) ? r : "inicio";
}

/** Vai para outra tela (ex.: irPara("vendas", "id=12")). */
export function irPara(rota: Rota, parametros?: string): void {
  window.location.hash = `/${rota}${parametros ? `?${parametros}` : ""}`;
}

/** Parâmetros da rota atual (#/vendas?id=12). */
export function parametrosDaRota(): URLSearchParams {
  return new URLSearchParams(window.location.hash.split("?")[1] ?? "");
}
