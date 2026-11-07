import { afterEach } from "bun:test";
import { abrirBanco, type Banco } from "../src/banco";
import { abrirCaixa } from "../src/dominio/caixa";
import { criarProduto, type NovoProduto } from "../src/dominio/produtos";
import { registrarVenda, type NovaVenda } from "../src/dominio/vendas";
import { definirRelogio, restaurarRelogio } from "../src/relogio";

// IDs das formas de pagamento criadas pela migração inicial (na ordem).
export const DINHEIRO = 1;
export const PIX = 2;
export const DEBITO = 3;
export const CREDITO = 4;

afterEach(() => restaurarRelogio());

export function bancoDeTeste(): Banco {
  return abrirBanco(":memory:");
}

/** Fixa o "agora" do sistema. Use horários com fuso: "2026-11-07T10:00:00-03:00". */
export function fixarRelogio(iso: string) {
  let atual = new Date(iso);
  definirRelogio(() => new Date(atual.getTime()));
  return {
    definir(novo: string) {
      atual = new Date(novo);
    },
    avancarMinutos(min: number) {
      atual = new Date(atual.getTime() + min * 60_000);
    },
  };
}

export function novoProduto(db: Banco, dados: Partial<NovoProduto> & { nome: string }) {
  return criarProduto(db, {
    categoria: "",
    unidade: "un",
    codigo: null,
    codigo_barras: null,
    custo_centavos: 100,
    preco_centavos: 300,
    estoque_minimo_mil: 0,
    controla_estoque: true,
    observacao: "",
    estoque_inicial_mil: 0,
    ...dados,
  });
}

export function abrirCaixaCom(db: Banco, fundo = 0) {
  return abrirCaixa(db, { fundo_troco_centavos: fundo, operador: "Teste" });
}

/** Venda simples: [produto, quantidade] e pagamentos [forma, valor]. */
export function vender(
  db: Banco,
  itens: Array<[number, number]>,
  pagamentos: Array<[number, number]>,
  extra: Partial<NovaVenda> = {},
) {
  return registrarVenda(db, {
    itens: itens.map(([produto_id, quantidade]) => ({ produto_id, quantidade_mil: Math.round(quantidade * 1000) })),
    pagamentos: pagamentos.map(([forma_id, valor_centavos]) => ({ forma_id, valor_centavos })),
    desconto_centavos: 0,
    cliente: "",
    observacao: "",
    ...extra,
  });
}

/** Espera que `fn` lance um erro cuja mensagem contenha `trecho`. */
export function erroDe(fn: () => unknown): { mensagem: string; status: number } {
  try {
    fn();
  } catch (e) {
    const erro = e as { message: string; status?: number };
    return { mensagem: erro.message, status: erro.status ?? 0 };
  }
  throw new Error("Era esperado um erro, mas a operação deu certo.");
}
