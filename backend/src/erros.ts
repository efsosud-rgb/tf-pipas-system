/**
 * Erro de regra de negócio: a mensagem vai direto para a tela, então precisa
 * dizer o que aconteceu e como resolver, em português simples.
 */
export class ErroNegocio extends Error {
  readonly status: number;
  readonly campo?: string;

  constructor(mensagem: string, status = 422, campo?: string) {
    super(mensagem);
    this.name = "ErroNegocio";
    this.status = status;
    this.campo = campo;
  }
}

export function naoEncontrado(mensagem: string): ErroNegocio {
  return new ErroNegocio(mensagem, 404);
}
