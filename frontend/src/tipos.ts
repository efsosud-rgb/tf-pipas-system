// Tipos das respostas da API (espelham backend/src/dominio). Dinheiro em centavos.

export type Unidade = "un" | "pct" | "cx" | "dz" | "par" | "kit" | "rolo" | "folha" | "m" | "kg" | "l";

export interface UnidadeInfo {
  sigla: Unidade;
  nome: string;
  fracionavel: boolean;
}

export type SituacaoEstoque = "sem_controle" | "negativo" | "zerado" | "baixo" | "ok";

export interface FaixaPreco {
  quantidade: number;
  preco_centavos: number;
}

export interface Produto {
  id: number;
  nome: string;
  codigo: string | null;
  codigo_barras: string | null;
  categoria: string;
  unidade: Unidade;
  custo_centavos: number;
  preco_centavos: number;
  lucro_centavos: number;
  margem_bp: number | null;
  estoque: number;
  estoque_minimo: number;
  controla_estoque: boolean;
  situacao_estoque: SituacaoEstoque;
  ativo: boolean;
  observacao: string;
  criado_em: string;
  atualizado_em: string;
  fabricado: boolean;
  lote_producao: number;
  precos_quantidade: FaixaPreco[];
}

export interface HistoricoProduto {
  movimentos: Array<{
    id: number;
    tipo: string;
    quantidade: number;
    saldo: number;
    custo_unitario_centavos: number;
    venda_id: number | null;
    entrada_id: number | null;
    observacao: string;
    data: string;
    criado_em: string;
  }>;
  alteracoes_preco: Array<{
    custo_antes_centavos: number | null;
    custo_depois_centavos: number;
    preco_antes_centavos: number | null;
    preco_depois_centavos: number;
    motivo: string;
    criado_em: string;
  }>;
}

export interface FormaPagamento {
  id: number;
  nome: string;
  tipo: "dinheiro" | "outro";
  taxa_bp: number;
  ativo: boolean;
  ordem: number;
}

export interface Config {
  loja_nome: string;
  loja_telefone: string;
  loja_endereco: string;
  loja_instagram: string;
  loja_documento: string;
  comprovante_mensagem: string;
  comprovante_largura: "80" | "58";
  permitir_estoque_negativo: boolean;
}

export type Permissao = "vender" | "desconto" | "cancelar_venda" | "produtos" | "financeiro" | "administrar";
export type Perfil = "administrador" | "funcionario";

export interface Usuario {
  id: number;
  nome: string;
  perfil: Perfil;
  permissoes: Permissao[];
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
  ultimo_acesso_em: string | null;
}

export interface EstadoAuth {
  primeiro_acesso: boolean;
  usuarios: Array<{ id: number; nome: string; perfil: Perfil }>;
  usuario: Usuario | null;
  loja_nome: string;
}

export interface PainelRapido {
  hoje: string;
  vendas: {
    quantidade: number;
    total_centavos: number;
    ticket_medio_centavos: number | null;
    canceladas_quantidade: number;
    canceladas_total_centavos: number;
  };
  por_forma: Array<{ forma_id: number; nome: string; tipo: string; vendas: number; valor_centavos: number }>;
  caixa: { sessao_id: number; aberto_em: string; operador: string; dinheiro_na_gaveta_centavos: number } | null;
  produtos_ativos: number;
  alertas_estoque: number;
  sugestoes_producao: number;
}

export type MotivoSugestao = "negativo" | "zerado" | "abaixo_minimo" | "cobertura_curta";

export interface AlertaEstoque {
  produto_id: number;
  nome: string;
  unidade: Unidade;
  fabricado: boolean;
  estoque: number;
  estoque_minimo: number;
  cobertura_dias: number | null;
  motivo: MotivoSugestao;
  texto: string;
}

export interface ParametrosProducao {
  dias_alvo: number;
  dias_historico: number;
  alerta_dias: number;
}

export interface ItemSugestao {
  produto_id: number;
  nome: string;
  categoria: string;
  unidade: Unidade;
  fabricado: boolean;
  estoque: number;
  estoque_minimo: number;
  lote: number;
  vendido_periodo: number;
  dias_considerados: number;
  media_diaria: number | null;
  cobertura_dias: number | null;
  alvo: number;
  sugestao: number;
  custo_unitario_centavos: number;
  custo_estimado_centavos: number;
  motivo: MotivoSugestao | null;
  pouco_historico: boolean;
}

export interface SugestaoProducao {
  parametros: ParametrosProducao;
  de: string;
  ate: string;
  itens: ItemSugestao[];
  resumo: {
    produzir_itens: number;
    produzir_custo_centavos: number;
    comprar_itens: number;
    comprar_custo_centavos: number;
    sem_ritmo: number;
  };
}

export interface ItemVenda {
  produto_id: number;
  nome: string;
  unidade: string;
  quantidade: number;
  preco_unitario_centavos: number;
  preco_base_centavos: number | null;
  custo_unitario_centavos: number;
  subtotal_centavos: number;
  desconto_centavos: number;
  total_centavos: number;
  custo_total_centavos: number;
}

export interface PagamentoVenda {
  forma_id: number;
  forma_nome: string;
  forma_tipo: "dinheiro" | "outro";
  recebido_centavos: number;
  troco_centavos: number;
  valor_centavos: number;
  taxa_bp: number;
  taxa_centavos: number;
}

export interface Venda {
  id: number;
  numero: number;
  sessao_id: number;
  data: string;
  criado_em: string;
  subtotal_centavos: number;
  desconto_centavos: number;
  total_centavos: number;
  custo_centavos: number;
  taxas_centavos: number;
  lucro_bruto_centavos: number;
  troco_centavos: number;
  cliente: string;
  observacao: string;
  status: "concluida" | "cancelada";
  cancelada_em: string | null;
  motivo_cancelamento: string;
  sessao_cancelamento_id: number | null;
  usuario_nome: string;
  usuario_id: number | null;
  cancelada_por: string;
  itens: ItemVenda[];
  pagamentos: PagamentoVenda[];
  /** Só na resposta de uma venda nova: produtos que ficaram no mínimo ou zerados. */
  alertas_estoque?: Array<{ produto_id: number; nome: string; unidade: string; estoque: number; estoque_minimo: number; situacao: "baixo" | "zerado" | "negativo" }>;
}

export interface VendaNaLista {
  id: number;
  numero: number;
  data: string;
  criado_em: string;
  total_centavos: number;
  desconto_centavos: number;
  custo_centavos: number;
  taxas_centavos: number;
  lucro_bruto_centavos: number;
  status: "concluida" | "cancelada";
  cliente: string;
  itens_quantidade: number;
  formas: string;
  sessao_id: number;
  usuario_nome: string;
}

export type TipoMovimentoCaixa = "abertura" | "venda" | "sangria" | "suprimento" | "cancelamento" | "despesa" | "receita";

export interface Sessao {
  id: number;
  aberto_em: string;
  data_abertura: string;
  operador_abertura: string;
  fundo_troco_centavos: number;
  fechado_em: string | null;
  data_fechamento: string | null;
  operador_fechamento: string;
  esperado_centavos: number | null;
  contado_centavos: number | null;
  diferenca_centavos: number | null;
  observacao_fechamento: string;
  aberta: boolean;
}

export interface SessaoNaLista extends Sessao {
  vendas_quantidade: number;
  vendas_total_centavos: number;
}

export interface ResumoCaixa {
  sessao: Sessao;
  gaveta: {
    esperado_centavos: number;
    fundo_troco_centavos: number;
    vendas_centavos: number;
    suprimentos_centavos: number;
    sangrias_centavos: number;
    receitas_centavos: number;
    despesas_centavos: number;
    cancelamentos_centavos: number;
  };
  vendas: {
    quantidade: number;
    total_centavos: number;
    descontos_centavos: number;
    taxas_centavos: number;
    por_forma: Array<{
      forma_id: number;
      nome: string;
      tipo: string;
      quantidade: number;
      valor_centavos: number;
      taxas_centavos: number;
    }>;
  };
  canceladas: { quantidade: number; total_centavos: number };
  movimentos: Array<{
    id: number;
    tipo: TipoMovimentoCaixa;
    valor_centavos: number;
    descricao: string;
    venda_id: number | null;
    lancamento_id: number | null;
    criado_em: string;
    usuario_nome: string;
  }>;
}

export type TipoLancamento = "receita" | "despesa";
export type Origem = "gaveta" | "conta";

export interface Categoria {
  id: number;
  nome: string;
  tipo: TipoLancamento;
  conta_no_resultado: boolean;
  sistema: string | null;
  ativo: boolean;
  lancamentos: number;
}

export interface Lancamento {
  id: number;
  tipo: TipoLancamento;
  descricao: string;
  categoria_id: number;
  categoria_nome: string;
  conta_no_resultado: boolean;
  valor_centavos: number;
  data: string;
  vencimento: string | null;
  pago: boolean;
  data_pagamento: string | null;
  origem: Origem | null;
  sessao_id: number | null;
  grupo_repeticao: string | null;
  parcela: number | null;
  parcelas: number | null;
  observacao: string;
  criado_em: string;
  atualizado_em: string;
  entrada_estoque_id: number | null;
  situacao: "pago" | "pendente" | "vencido";
}

export interface ContasPendentes {
  lancamentos: Lancamento[];
  a_pagar_centavos: number;
  a_receber_centavos: number;
  vencidas_a_pagar_centavos: number;
  vencidas_a_receber_centavos: number;
  vencidas_quantidade: number;
}

export interface ResumoFinanceiro {
  de: string;
  ate: string;
  entradas: { vendas_centavos: number; receitas_centavos: number; total_centavos: number };
  saidas: {
    taxas_centavos: number;
    despesas_centavos: number;
    total_centavos: number;
    por_categoria: Array<{ categoria_id: number; nome: string; conta_no_resultado: boolean; total_centavos: number }>;
  };
  saldo_centavos: number;
  pendentes_no_periodo: { a_pagar_centavos: number; a_receber_centavos: number };
}

export interface LinhaCategoriaResultado {
  categoria_id: number;
  nome: string;
  total_centavos: number;
  pendente_centavos: number;
}

export interface Resultado {
  de: string;
  ate: string;
  vendas: {
    quantidade: number;
    bruto_centavos: number;
    descontos_centavos: number;
    receita_centavos: number;
    ticket_medio_centavos: number | null;
    canceladas_quantidade: number;
    canceladas_total_centavos: number;
  };
  cmv_centavos: number;
  lucro_bruto_centavos: number;
  margem_bruta_bp: number | null;
  taxas_centavos: number;
  perdas: { total_centavos: number; perda_centavos: number; brinde_centavos: number; uso_centavos: number };
  outras_receitas: { total_centavos: number; pendente_centavos: number; por_categoria: LinhaCategoriaResultado[] };
  despesas: { total_centavos: number; pendente_centavos: number; por_categoria: LinhaCategoriaResultado[] };
  lucro_liquido_centavos: number;
  margem_liquida_bp: number | null;
  fora_do_resultado: { receitas: LinhaCategoriaResultado[]; despesas: LinhaCategoriaResultado[] };
}

export interface LinhaProdutoVendido {
  produto_id: number;
  nome: string;
  categoria: string;
  unidade: string;
  quantidade: number;
  receita_centavos: number;
  custo_centavos: number;
  lucro_centavos: number;
  margem_bp: number | null;
  participacao_lucro_bp: number | null;
}

export interface RelatorioProdutos {
  de: string;
  ate: string;
  produtos: LinhaProdutoVendido[];
  totais: { receita_centavos: number; custo_centavos: number; lucro_centavos: number; margem_bp: number | null };
}

export interface RelatorioFormas {
  de: string;
  ate: string;
  formas: Array<{
    forma_id: number;
    nome: string;
    tipo: string;
    vendas: number;
    valor_centavos: number;
    taxas_centavos: number;
    liquido_centavos: number;
    participacao_bp: number | null;
  }>;
  totais: { valor_centavos: number; taxas_centavos: number };
}

export interface RelatorioTempo {
  agrupamento: "dia" | "mes";
  pontos: Array<{ chave: string; vendas: number; receita_centavos: number; lucro_bruto_centavos: number }>;
}

export interface RelatorioEstoque {
  produtos_com_estoque: number;
  valor_a_custo_centavos: number;
  valor_a_preco_de_venda_centavos: number;
  lucro_potencial_centavos: number;
  negativos: number;
  zerados: number;
  abaixo_do_minimo: number;
  atencao: Produto[];
}

export interface Entrada {
  id: number;
  tipo: "compra" | "producao";
  usuario_nome: string;
  fornecedor: string;
  total_centavos: number;
  lancamento_id: number | null;
  observacao: string;
  data: string;
  criado_em: string;
  itens?: Array<{
    produto_id: number;
    nome: string;
    unidade: string;
    quantidade: number;
    custo_unitario_centavos: number;
    total_centavos: number;
    custo_medio_antes_centavos: number;
    custo_medio_depois_centavos: number;
  }>;
  itens_quantidade?: number;
  quantidade_total?: number;
}

export interface PainelInicio {
  hoje: string;
  dia: {
    vendas: number;
    receita_centavos: number;
    lucro_bruto_centavos: number;
    margem_bruta_bp: number | null;
    ticket_medio_centavos: number | null;
  };
  mes: {
    de: string;
    ate: string;
    vendas: number;
    receita_centavos: number;
    lucro_bruto_centavos: number;
    despesas_centavos: number;
    lucro_liquido_centavos: number;
    margem_liquida_bp: number | null;
  };
  caixa:
    | {
        aberto: true;
        sessao_id: number;
        aberto_em: string;
        operador: string;
        dinheiro_na_gaveta_centavos: number;
        vendas: number;
        vendas_total_centavos: number;
      }
    | {
        aberto: false;
        ultimo_fechamento: {
          id: number;
          fechado_em: string;
          esperado_centavos: number;
          contado_centavos: number;
          diferenca_centavos: number;
        } | null;
      };
  contas: {
    vencidas: Lancamento[];
    proximas: Lancamento[];
    vencidas_quantidade: number;
    a_pagar_centavos: number;
    a_receber_centavos: number;
  };
  estoque: { atencao: Produto[]; atencao_quantidade: number };
  ultimas_vendas: VendaNaLista[];
  produtos_ativos: number;
  mais_vendidos_mes: LinhaProdutoVendido[];
  produtos_sem_custo: number;
}

export interface InfoBackup {
  nome: string;
  data: string;
  hora: string;
  motivo: "automatico" | "manual" | "fechamento" | "antes-de-restaurar" | "desligamento" | "antes-de-atualizar";
  tamanho_bytes: number;
}

export interface Saude {
  app: string;
  versao: string;
  pasta_dados: string;
  hoje: string;
  agora: string;
}

export interface DiaDoFluxo {
  data: string;
  futuro: boolean;
  entradas: { vendas_centavos: number; receitas_centavos: number; total_centavos: number };
  saidas: { taxas_centavos: number; despesas_centavos: number; total_centavos: number };
  saldo_dia_centavos: number;
  acumulado_centavos: number;
  previsto: { a_receber_centavos: number; a_pagar_centavos: number };
  acumulado_previsto_centavos: number;
}

export interface FluxoDiario {
  de: string;
  ate: string;
  hoje: string;
  dias: DiaDoFluxo[];
  totais: { entradas_centavos: number; saidas_centavos: number; saldo_centavos: number; a_receber_centavos: number; a_pagar_centavos: number };
  atrasadas: { a_receber_centavos: number; a_pagar_centavos: number; quantidade: number };
}

export interface ResultadoDoMes {
  mes: string;
  de: string;
  ate: string;
  vendas: number;
  bruto_centavos: number;
  descontos_centavos: number;
  receita_centavos: number;
  cmv_centavos: number;
  lucro_bruto_centavos: number;
  margem_bruta_bp: number | null;
  taxas_centavos: number;
  perdas_centavos: number;
  outras_receitas_centavos: number;
  despesas_centavos: number;
  despesas_por_categoria: Array<{ categoria_id: number; nome: string; total_centavos: number }>;
  lucro_liquido_centavos: number;
  margem_liquida_bp: number | null;
}

export interface RelatorioVendedores {
  de: string;
  ate: string;
  vendedores: Array<{
    nome: string;
    vendas: number;
    total_centavos: number;
    lucro_bruto_centavos: number;
    descontos_centavos: number;
    ticket_medio_centavos: number | null;
  }>;
  cancelamentos: Array<{ nome: string; quantidade: number }>;
}
