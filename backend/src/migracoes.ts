import type { Database } from "bun:sqlite";

/**
 * Migrações do banco. Cada item roda uma única vez, em ordem, e o número da
 * versão fica em PRAGMA user_version. Nunca altere uma migração que já foi
 * publicada: crie uma nova no fim da lista.
 *
 * Convenções:
 * - dinheiro em centavos inteiros (colunas *_centavos);
 * - quantidades em milésimos inteiros (colunas *_mil);
 * - taxas em pontos-base (1,99% = 199, colunas *_bp);
 * - datas de negócio como texto AAAA-MM-DD no fuso da loja (colunas data, vencimento...);
 * - instantes como ISO 8601 UTC (colunas *_em).
 */
export const MIGRACOES: Array<(db: Database) => void> = [
  // 1 — estrutura inicial
  (db) => {
    db.exec(`
      CREATE TABLE config (
        chave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
      );

      CREATE TABLE produtos (
        id INTEGER PRIMARY KEY,
        nome TEXT NOT NULL,
        codigo TEXT,
        codigo_barras TEXT,
        categoria TEXT NOT NULL DEFAULT '',
        unidade TEXT NOT NULL DEFAULT 'un',
        custo_centavos INTEGER NOT NULL CHECK (custo_centavos >= 0),
        preco_centavos INTEGER NOT NULL CHECK (preco_centavos > 0),
        estoque_mil INTEGER NOT NULL DEFAULT 0,
        estoque_minimo_mil INTEGER NOT NULL DEFAULT 0 CHECK (estoque_minimo_mil >= 0),
        controla_estoque INTEGER NOT NULL DEFAULT 1 CHECK (controla_estoque IN (0, 1)),
        ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
        observacao TEXT NOT NULL DEFAULT '',
        busca TEXT NOT NULL DEFAULT '',
        criado_em TEXT NOT NULL,
        atualizado_em TEXT NOT NULL
      );
      CREATE UNIQUE INDEX produtos_codigo_barras_unico ON produtos (codigo_barras)
        WHERE codigo_barras IS NOT NULL;
      CREATE UNIQUE INDEX produtos_codigo_unico ON produtos (codigo)
        WHERE codigo IS NOT NULL;

      CREATE TABLE alteracoes_preco (
        id INTEGER PRIMARY KEY,
        produto_id INTEGER NOT NULL REFERENCES produtos (id) ON DELETE CASCADE,
        custo_antes_centavos INTEGER,
        custo_depois_centavos INTEGER NOT NULL,
        preco_antes_centavos INTEGER,
        preco_depois_centavos INTEGER NOT NULL,
        motivo TEXT NOT NULL CHECK (motivo IN ('cadastro', 'edicao', 'entrada')),
        criado_em TEXT NOT NULL
      );
      CREATE INDEX alteracoes_preco_produto ON alteracoes_preco (produto_id);

      CREATE TABLE formas_pagamento (
        id INTEGER PRIMARY KEY,
        nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
        tipo TEXT NOT NULL CHECK (tipo IN ('dinheiro', 'outro')),
        taxa_bp INTEGER NOT NULL DEFAULT 0 CHECK (taxa_bp >= 0 AND taxa_bp <= 10000),
        ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
        ordem INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE sessoes_caixa (
        id INTEGER PRIMARY KEY,
        aberto_em TEXT NOT NULL,
        data_abertura TEXT NOT NULL,
        operador_abertura TEXT NOT NULL DEFAULT '',
        fundo_troco_centavos INTEGER NOT NULL CHECK (fundo_troco_centavos >= 0),
        fechado_em TEXT,
        data_fechamento TEXT,
        operador_fechamento TEXT NOT NULL DEFAULT '',
        esperado_centavos INTEGER,
        contado_centavos INTEGER,
        diferenca_centavos INTEGER,
        observacao_fechamento TEXT NOT NULL DEFAULT ''
      );
      -- No máximo um caixa aberto por vez.
      CREATE UNIQUE INDEX sessoes_caixa_uma_aberta ON sessoes_caixa ((fechado_em IS NULL))
        WHERE fechado_em IS NULL;

      CREATE TABLE categorias_financeiras (
        id INTEGER PRIMARY KEY,
        nome TEXT NOT NULL COLLATE NOCASE,
        tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa')),
        conta_no_resultado INTEGER NOT NULL DEFAULT 1 CHECK (conta_no_resultado IN (0, 1)),
        sistema TEXT UNIQUE,
        ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
        UNIQUE (tipo, nome)
      );

      CREATE TABLE lancamentos (
        id INTEGER PRIMARY KEY,
        tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa')),
        descricao TEXT NOT NULL,
        categoria_id INTEGER NOT NULL REFERENCES categorias_financeiras (id),
        valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
        data TEXT NOT NULL,
        vencimento TEXT,
        pago INTEGER NOT NULL DEFAULT 0 CHECK (pago IN (0, 1)),
        data_pagamento TEXT,
        origem TEXT CHECK (origem IN ('gaveta', 'conta')),
        sessao_id INTEGER REFERENCES sessoes_caixa (id),
        grupo_repeticao TEXT,
        parcela INTEGER,
        parcelas INTEGER,
        observacao TEXT NOT NULL DEFAULT '',
        criado_em TEXT NOT NULL,
        atualizado_em TEXT NOT NULL,
        CHECK ((pago = 1 AND data_pagamento IS NOT NULL AND origem IS NOT NULL)
            OR (pago = 0 AND data_pagamento IS NULL AND origem IS NULL AND sessao_id IS NULL))
      );
      CREATE INDEX lancamentos_data ON lancamentos (data);
      CREATE INDEX lancamentos_vencimento ON lancamentos (vencimento) WHERE pago = 0;
      CREATE INDEX lancamentos_pagamento ON lancamentos (data_pagamento) WHERE pago = 1;

      CREATE TABLE vendas (
        id INTEGER PRIMARY KEY,
        sessao_id INTEGER NOT NULL REFERENCES sessoes_caixa (id),
        data TEXT NOT NULL,
        criado_em TEXT NOT NULL,
        subtotal_centavos INTEGER NOT NULL CHECK (subtotal_centavos > 0),
        desconto_centavos INTEGER NOT NULL DEFAULT 0 CHECK (desconto_centavos >= 0),
        total_centavos INTEGER NOT NULL CHECK (total_centavos > 0),
        custo_centavos INTEGER NOT NULL CHECK (custo_centavos >= 0),
        taxas_centavos INTEGER NOT NULL DEFAULT 0 CHECK (taxas_centavos >= 0),
        troco_centavos INTEGER NOT NULL DEFAULT 0 CHECK (troco_centavos >= 0),
        cliente TEXT NOT NULL DEFAULT '',
        observacao TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'concluida' CHECK (status IN ('concluida', 'cancelada')),
        cancelada_em TEXT,
        motivo_cancelamento TEXT NOT NULL DEFAULT '',
        sessao_cancelamento_id INTEGER REFERENCES sessoes_caixa (id),
        CHECK (total_centavos = subtotal_centavos - desconto_centavos)
      );
      CREATE INDEX vendas_data ON vendas (data);
      CREATE INDEX vendas_sessao ON vendas (sessao_id);

      CREATE TABLE venda_itens (
        id INTEGER PRIMARY KEY,
        venda_id INTEGER NOT NULL REFERENCES vendas (id),
        produto_id INTEGER NOT NULL REFERENCES produtos (id),
        nome TEXT NOT NULL,
        unidade TEXT NOT NULL,
        quantidade_mil INTEGER NOT NULL CHECK (quantidade_mil > 0),
        preco_unitario_centavos INTEGER NOT NULL CHECK (preco_unitario_centavos > 0),
        custo_unitario_centavos INTEGER NOT NULL CHECK (custo_unitario_centavos >= 0),
        subtotal_centavos INTEGER NOT NULL,
        desconto_centavos INTEGER NOT NULL DEFAULT 0 CHECK (desconto_centavos >= 0),
        total_centavos INTEGER NOT NULL CHECK (total_centavos >= 0),
        custo_total_centavos INTEGER NOT NULL CHECK (custo_total_centavos >= 0),
        CHECK (total_centavos = subtotal_centavos - desconto_centavos)
      );
      CREATE INDEX venda_itens_venda ON venda_itens (venda_id);
      CREATE INDEX venda_itens_produto ON venda_itens (produto_id);

      CREATE TABLE venda_pagamentos (
        id INTEGER PRIMARY KEY,
        venda_id INTEGER NOT NULL REFERENCES vendas (id),
        forma_id INTEGER NOT NULL REFERENCES formas_pagamento (id),
        forma_nome TEXT NOT NULL,
        forma_tipo TEXT NOT NULL CHECK (forma_tipo IN ('dinheiro', 'outro')),
        recebido_centavos INTEGER NOT NULL CHECK (recebido_centavos > 0),
        troco_centavos INTEGER NOT NULL DEFAULT 0 CHECK (troco_centavos >= 0),
        valor_centavos INTEGER NOT NULL CHECK (valor_centavos >= 0),
        taxa_bp INTEGER NOT NULL DEFAULT 0,
        taxa_centavos INTEGER NOT NULL DEFAULT 0 CHECK (taxa_centavos >= 0),
        CHECK (valor_centavos = recebido_centavos - troco_centavos)
      );
      CREATE INDEX venda_pagamentos_venda ON venda_pagamentos (venda_id);

      CREATE TABLE movimentos_caixa (
        id INTEGER PRIMARY KEY,
        sessao_id INTEGER NOT NULL REFERENCES sessoes_caixa (id),
        tipo TEXT NOT NULL CHECK (tipo IN
          ('abertura', 'venda', 'sangria', 'suprimento', 'cancelamento', 'despesa', 'receita')),
        valor_centavos INTEGER NOT NULL,
        descricao TEXT NOT NULL DEFAULT '',
        venda_id INTEGER REFERENCES vendas (id),
        lancamento_id INTEGER REFERENCES lancamentos (id),
        criado_em TEXT NOT NULL
      );
      CREATE INDEX movimentos_caixa_sessao ON movimentos_caixa (sessao_id);

      CREATE TABLE entradas_estoque (
        id INTEGER PRIMARY KEY,
        fornecedor TEXT NOT NULL DEFAULT '',
        total_centavos INTEGER NOT NULL CHECK (total_centavos >= 0),
        lancamento_id INTEGER REFERENCES lancamentos (id) ON DELETE SET NULL,
        observacao TEXT NOT NULL DEFAULT '',
        data TEXT NOT NULL,
        criado_em TEXT NOT NULL
      );

      CREATE TABLE entradas_estoque_itens (
        id INTEGER PRIMARY KEY,
        entrada_id INTEGER NOT NULL REFERENCES entradas_estoque (id),
        produto_id INTEGER NOT NULL REFERENCES produtos (id),
        quantidade_mil INTEGER NOT NULL CHECK (quantidade_mil > 0),
        custo_unitario_centavos INTEGER NOT NULL CHECK (custo_unitario_centavos >= 0),
        total_centavos INTEGER NOT NULL CHECK (total_centavos >= 0),
        custo_medio_antes_centavos INTEGER NOT NULL,
        custo_medio_depois_centavos INTEGER NOT NULL
      );
      CREATE INDEX entradas_estoque_itens_produto ON entradas_estoque_itens (produto_id);

      CREATE TABLE movimentos_estoque (
        id INTEGER PRIMARY KEY,
        produto_id INTEGER NOT NULL REFERENCES produtos (id),
        tipo TEXT NOT NULL CHECK (tipo IN
          ('inicial', 'entrada', 'venda', 'cancelamento', 'contagem', 'perda', 'brinde', 'uso')),
        quantidade_mil INTEGER NOT NULL CHECK (quantidade_mil <> 0),
        saldo_mil INTEGER NOT NULL,
        custo_unitario_centavos INTEGER NOT NULL CHECK (custo_unitario_centavos >= 0),
        venda_id INTEGER REFERENCES vendas (id),
        entrada_id INTEGER REFERENCES entradas_estoque (id),
        observacao TEXT NOT NULL DEFAULT '',
        data TEXT NOT NULL,
        criado_em TEXT NOT NULL
      );
      CREATE INDEX movimentos_estoque_produto ON movimentos_estoque (produto_id);
      CREATE INDEX movimentos_estoque_data ON movimentos_estoque (data);
    `);

    // Configurações iniciais da loja (só texto de identificação; nenhum número de negócio).
    const config = db.query("INSERT INTO config (chave, valor) VALUES ($chave, $valor)");
    for (const [chave, valor] of Object.entries({
      loja_nome: "TF Pipas",
      loja_telefone: "",
      loja_endereco: "",
      loja_instagram: "@tfpipas_",
      loja_documento: "",
      comprovante_mensagem: "Obrigado e volte sempre!",
      permitir_estoque_negativo: "1",
    })) {
      config.run({ chave, valor });
    }

    // Formas de pagamento. As taxas começam em 0: cada loja informa a taxa da
    // própria maquininha em Configurações.
    const forma = db.query(
      "INSERT INTO formas_pagamento (nome, tipo, taxa_bp, ordem) VALUES ($nome, $tipo, 0, $ordem)",
    );
    [
      ["Dinheiro", "dinheiro"],
      ["PIX", "outro"],
      ["Cartão de débito", "outro"],
      ["Cartão de crédito", "outro"],
    ].forEach(([nome, tipo], ordem) => forma.run({ nome: nome!, tipo: tipo!, ordem }));

    // Categorias do financeiro. "Conta no lucro" = 0 para dinheiro que não é
    // receita nem despesa da operação (compra de mercadoria vira estoque e só
    // entra no lucro como custo quando o produto é vendido).
    const categoria = db.query(
      `INSERT INTO categorias_financeiras (nome, tipo, conta_no_resultado, sistema)
       VALUES ($nome, $tipo, $conta, $sistema)`,
    );
    const despesas: Array<[string, number, string | null]> = [
      ["Aluguel", 1, null],
      ["Energia elétrica", 1, null],
      ["Água", 1, null],
      ["Internet e telefone", 1, null],
      ["Salários e encargos", 1, null],
      ["Pró-labore", 1, null],
      ["Impostos e taxas", 1, null],
      ["Embalagens e sacolas", 1, null],
      ["Manutenção e limpeza", 1, null],
      ["Transporte e frete", 1, null],
      ["Divulgação", 1, null],
      ["Tarifas bancárias", 1, null],
      ["Outras despesas", 1, null],
      ["Compra de mercadoria", 0, "compra_mercadoria"],
      ["Retirada do dono", 0, null],
    ];
    for (const [nome, conta, sistema] of despesas) {
      categoria.run({ nome, tipo: "despesa", conta, sistema });
    }
    const receitas: Array<[string, number]> = [
      ["Outras receitas", 1],
      ["Dinheiro colocado pelo dono", 0],
    ];
    for (const [nome, conta] of receitas) {
      categoria.run({ nome, tipo: "receita", conta, sistema: null });
    }
  },

  // 2 — usuários e permissões, preços por quantidade, produção e quem fez cada venda.
  // Mantém todos os dados da versão 1.0.0.
  (db) => {
    db.exec(`
      CREATE TABLE usuarios (
        id INTEGER PRIMARY KEY,
        nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
        senha_hash TEXT NOT NULL,
        perfil TEXT NOT NULL CHECK (perfil IN ('administrador', 'funcionario')),
        permissoes TEXT NOT NULL DEFAULT '',
        ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
        criado_em TEXT NOT NULL,
        atualizado_em TEXT NOT NULL,
        ultimo_acesso_em TEXT
      );

      CREATE TABLE sessoes_usuario (
        token_hash TEXT PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
        criado_em TEXT NOT NULL,
        expira_em TEXT NOT NULL,
        usado_em TEXT NOT NULL
      );
      CREATE INDEX sessoes_usuario_usuario ON sessoes_usuario (usuario_id);

      -- "A partir de X unidades, cada uma sai por Y."
      CREATE TABLE precos_quantidade (
        id INTEGER PRIMARY KEY,
        produto_id INTEGER NOT NULL REFERENCES produtos (id) ON DELETE CASCADE,
        quantidade_minima_mil INTEGER NOT NULL CHECK (quantidade_minima_mil > 1000),
        preco_centavos INTEGER NOT NULL CHECK (preco_centavos > 0),
        UNIQUE (produto_id, quantidade_minima_mil)
      );

      ALTER TABLE produtos ADD COLUMN fabricado INTEGER NOT NULL DEFAULT 0 CHECK (fabricado IN (0, 1));
      ALTER TABLE produtos ADD COLUMN lote_producao_mil INTEGER NOT NULL DEFAULT 0 CHECK (lote_producao_mil >= 0);

      -- preço normal do produto no momento da venda (o item pode ter saído pelo preço por quantidade)
      ALTER TABLE venda_itens ADD COLUMN preco_base_centavos INTEGER;

      ALTER TABLE vendas ADD COLUMN usuario_id INTEGER REFERENCES usuarios (id);
      ALTER TABLE vendas ADD COLUMN usuario_nome TEXT NOT NULL DEFAULT '';
      ALTER TABLE vendas ADD COLUMN cancelada_por TEXT NOT NULL DEFAULT '';
      ALTER TABLE movimentos_caixa ADD COLUMN usuario_nome TEXT NOT NULL DEFAULT '';
      ALTER TABLE entradas_estoque ADD COLUMN tipo TEXT NOT NULL DEFAULT 'compra' CHECK (tipo IN ('compra', 'producao'));
      ALTER TABLE entradas_estoque ADD COLUMN usuario_nome TEXT NOT NULL DEFAULT '';

      -- Novo tipo de movimento de estoque: 'producao'. O SQLite não altera CHECK,
      -- então a tabela é recriada com os mesmos dados.
      CREATE TABLE movimentos_estoque_novo (
        id INTEGER PRIMARY KEY,
        produto_id INTEGER NOT NULL REFERENCES produtos (id),
        tipo TEXT NOT NULL CHECK (tipo IN
          ('inicial', 'entrada', 'producao', 'venda', 'cancelamento', 'contagem', 'perda', 'brinde', 'uso')),
        quantidade_mil INTEGER NOT NULL CHECK (quantidade_mil <> 0),
        saldo_mil INTEGER NOT NULL,
        custo_unitario_centavos INTEGER NOT NULL CHECK (custo_unitario_centavos >= 0),
        venda_id INTEGER REFERENCES vendas (id),
        entrada_id INTEGER REFERENCES entradas_estoque (id),
        observacao TEXT NOT NULL DEFAULT '',
        data TEXT NOT NULL,
        criado_em TEXT NOT NULL
      );
      INSERT INTO movimentos_estoque_novo
        (id, produto_id, tipo, quantidade_mil, saldo_mil, custo_unitario_centavos, venda_id, entrada_id, observacao, data, criado_em)
        SELECT id, produto_id, tipo, quantidade_mil, saldo_mil, custo_unitario_centavos, venda_id, entrada_id, observacao, data, criado_em
        FROM movimentos_estoque;
      DROP TABLE movimentos_estoque;
      ALTER TABLE movimentos_estoque_novo RENAME TO movimentos_estoque;
      CREATE INDEX movimentos_estoque_produto ON movimentos_estoque (produto_id);
      CREATE INDEX movimentos_estoque_data ON movimentos_estoque (data);
    `);

    // Material comprado para fabricar pipas vira custo da pipa (no cadastro do
    // produto), então não conta no lucro na hora da compra — senão contaria duas vezes.
    db.query(
      `INSERT INTO categorias_financeiras (nome, tipo, conta_no_resultado, sistema)
       VALUES ('Material para produção', 'despesa', 0, 'material_producao')
       ON CONFLICT DO NOTHING`,
    ).run();

    // Parâmetros da sugestão de produção (a pessoa muda na tela Produção).
    const config = db.query("INSERT INTO config (chave, valor) VALUES ($chave, $valor) ON CONFLICT (chave) DO NOTHING");
    for (const [chave, valor] of Object.entries({
      producao_dias_alvo: "30",
      producao_dias_historico: "30",
      alerta_dias_cobertura: "7",
      comprovante_largura: "80",
    })) {
      config.run({ chave, valor });
    }
  },
];
