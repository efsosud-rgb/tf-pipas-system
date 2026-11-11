import { z } from "zod";
import { ErroNegocio } from "./erros";
import { LISTA_UNIDADES, paraMil, temNoMaximoTresCasas } from "./quantidade";
import { ehDataValida } from "./relogio";

/**
 * Validação dos dados que chegam pela API. A tela já valida antes de enviar;
 * isto aqui é a última barreira, então as mensagens também vão para a tela.
 */

z.config({
  customError: (iss) => {
    switch (iss.code) {
      case "invalid_type":
        return iss.input === undefined ? "é obrigatório" : "valor inválido";
      case "too_small":
        if (iss.origin === "string") return Number(iss.minimum) <= 1 ? "é obrigatório" : `precisa ter pelo menos ${iss.minimum} letras`;
        if (iss.origin === "array") return "adicione pelo menos um item";
        return `precisa ser no mínimo ${iss.minimum}`;
      case "too_big":
        if (iss.origin === "string") return `pode ter no máximo ${iss.maximum} letras`;
        if (iss.origin === "array") return `pode ter no máximo ${iss.maximum} itens`;
        return `pode ser no máximo ${iss.maximum}`;
      case "invalid_value":
        return "opção inválida";
      case "invalid_union":
        return "dados incompletos ou inválidos";
      default:
        return undefined;
    }
  },
});

const ROTULOS: Record<string, string> = {
  nome: "Nome",
  categoria: "Categoria",
  unidade: "Unidade",
  codigo: "Código",
  codigo_barras: "Código de barras",
  custo_centavos: "Preço de custo",
  preco_centavos: "Preço de venda",
  estoque_inicial: "Estoque inicial",
  estoque_minimo: "Estoque mínimo",
  observacao: "Observação",
  itens: "Itens",
  quantidade: "Quantidade",
  nova_quantidade: "Quantidade contada",
  custo_unitario_centavos: "Custo unitário",
  desconto_centavos: "Desconto",
  pagamentos: "Pagamento",
  valor_centavos: "Valor",
  forma_id: "Forma de pagamento",
  cliente: "Cliente",
  fundo_troco_centavos: "Fundo de troco",
  contado_centavos: "Dinheiro contado",
  operador: "Operador",
  descricao: "Descrição",
  tipo: "Tipo",
  categoria_id: "Categoria",
  data: "Data",
  vencimento: "Vencimento",
  data_pagamento: "Data do pagamento",
  origem: "Origem do dinheiro",
  repetir_meses: "Repetir",
  taxa_bp: "Taxa",
  motivo: "Motivo",
  fornecedor: "Fornecedor",
};

export function validar<T extends z.ZodType>(esquema: T, dados: unknown): z.output<T> {
  const r = esquema.safeParse(dados);
  if (r.success) return r.data;
  const issue = r.error.issues[0]!;
  const campo = [...issue.path].reverse().find((p) => typeof p === "string") as string | undefined;
  const rotulo = campo ? (ROTULOS[campo] ?? campo) : "Dados";
  throw new ErroNegocio(`${rotulo}: ${issue.message}.`, 400, campo);
}

export const zId = z.number().int().positive();
export const zCentavos = z.number().int().min(0).max(1_000_000_000);
export const zCentavosPositivo = z.number().int().min(1, "precisa ser maior que zero").max(1_000_000_000);
export const zQuantidade = z
  .number()
  .positive("precisa ser maior que zero")
  .max(1_000_000)
  .refine(temNoMaximoTresCasas, "use no máximo 3 casas decimais")
  .transform(paraMil);
export const zQuantidadeOuZero = z
  .number()
  .min(0)
  .max(1_000_000)
  .refine(temNoMaximoTresCasas, "use no máximo 3 casas decimais")
  .transform(paraMil);
export const zData = z.string().refine(ehDataValida, "data inválida");
export const zTexto = (max: number) => z.string().trim().max(max).default("");
export const zTextoObrigatorio = (max: number) => z.string().trim().min(1).max(max);
const zCodigo = z
  .string()
  .trim()
  .max(48)
  .nullable()
  .default(null)
  .transform((s) => (s ? s : null));
export const zOrigem = z.enum(["gaveta", "conta"]);

const zBaseProduto = z.object({
  nome: zTextoObrigatorio(120),
  categoria: zTexto(60),
  unidade: z.enum(LISTA_UNIDADES).default("un"),
  codigo: zCodigo,
  codigo_barras: zCodigo,
  custo_centavos: zCentavos,
  preco_centavos: zCentavosPositivo,
  estoque_minimo: zQuantidadeOuZero.default(0),
  controla_estoque: z.boolean().default(true),
  observacao: zTexto(500),
});
export const zNovoProduto = zBaseProduto.extend({ estoque_inicial: zQuantidadeOuZero.default(0) });
export const zEdicaoProduto = zBaseProduto.extend({ ativo: z.boolean().optional() });

export const zNovaVenda = z.object({
  itens: z.array(z.object({ produto_id: zId, quantidade: zQuantidade })).min(1).max(300),
  desconto_centavos: zCentavos.default(0),
  pagamentos: z.array(z.object({ forma_id: zId, valor_centavos: zCentavosPositivo })).min(1).max(10),
  cliente: zTexto(80),
  observacao: zTexto(300),
});

export const zCancelamento = z.object({ motivo: zTextoObrigatorio(200) });

export const zAbrirCaixa = z.object({ fundo_troco_centavos: zCentavos, operador: zTexto(60) });
export const zMovimentoCaixa = z.object({
  tipo: z.enum(["sangria", "suprimento"]),
  valor_centavos: zCentavosPositivo,
  descricao: zTexto(120),
});
export const zFecharCaixa = z.object({ contado_centavos: zCentavos, operador: zTexto(60), observacao: zTexto(300) });

const zPagamento = z.union([
  z.object({ pago: z.literal(true), data_pagamento: zData, origem: zOrigem }),
  z.object({ pago: z.literal(false), vencimento: zData }),
]);
export const zNovoLancamento = z.object({
  tipo: z.enum(["receita", "despesa"]),
  descricao: zTextoObrigatorio(120),
  categoria_id: zId,
  valor_centavos: zCentavosPositivo,
  data: zData,
  observacao: zTexto(500),
  pagamento: zPagamento,
  repetir_meses: z.number().int().min(1).max(60).default(1),
});
export const zEdicaoLancamento = z.object({
  descricao: zTextoObrigatorio(120),
  categoria_id: zId,
  valor_centavos: zCentavosPositivo,
  data: zData,
  vencimento: zData.nullable().default(null),
  observacao: zTexto(500),
});
export const zPagarLancamento = z.object({ data_pagamento: zData, origem: zOrigem });

export const zNovaCategoria = z.object({
  nome: zTextoObrigatorio(60),
  tipo: z.enum(["receita", "despesa"]),
  conta_no_resultado: z.boolean().default(true),
});
export const zEdicaoCategoria = z.object({
  nome: zTextoObrigatorio(60).optional(),
  conta_no_resultado: z.boolean().optional(),
  ativo: z.boolean().optional(),
});

export const zNovaForma = z.object({ nome: zTextoObrigatorio(40), taxa_bp: z.number().int().min(0).max(10_000).default(0) });
export const zEdicaoForma = z.object({
  nome: zTextoObrigatorio(40).optional(),
  taxa_bp: z.number().int().min(0).max(10_000).optional(),
  ativo: z.boolean().optional(),
});

export const zConfig = z.object({
  loja_nome: z.string().trim().max(80).optional(),
  loja_telefone: z.string().trim().max(40).optional(),
  loja_endereco: z.string().trim().max(160).optional(),
  loja_instagram: z.string().trim().max(60).optional(),
  loja_documento: z.string().trim().max(30).optional(),
  comprovante_mensagem: z.string().trim().max(160).optional(),
  comprovante_largura: z.enum(["80", "58"]).optional(),
  permitir_estoque_negativo: z.boolean().optional(),
});

export const zEntrada = z.object({
  itens: z
    .array(z.object({ produto_id: zId, quantidade: zQuantidade, custo_unitario_centavos: zCentavos }))
    .min(1)
    .max(200),
  fornecedor: zTexto(80),
  observacao: zTexto(300),
  financeiro: z
    .union([
      z.null(),
      z.object({ pago: z.literal(true), origem: zOrigem }),
      z.object({ pago: z.literal(false), vencimento: zData }),
    ])
    .default(null),
});

export const zAjuste = z.union([
  z.object({ produto_id: zId, tipo: z.literal("contagem"), nova_quantidade: zQuantidadeOuZero, observacao: zTexto(200) }),
  z.object({ produto_id: zId, tipo: z.enum(["perda", "brinde", "uso"]), quantidade: zQuantidade, observacao: zTexto(200) }),
]);
