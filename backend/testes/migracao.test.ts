import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { abrirBanco, fecharBanco, migrar, versaoDoBanco } from "../src/banco";
import { MIGRACOES } from "../src/migracoes";

/**
 * Banco como a versão 1.0.0 deixava (só a migração 1), com uma venda, um
 * cancelamento e movimentos de estoque. A migração 2 precisa manter tudo.
 */
function bancoDaVersao1(): Database {
  const db = new Database(":memory:", { strict: true });
  db.exec("PRAGMA foreign_keys = ON;");
  db.transaction(() => {
    MIGRACOES[0]!(db);
    db.exec("PRAGMA user_version = 1");
  })();
  const agora = "2026-11-08T13:00:00.000Z";
  db.exec(`
    INSERT INTO produtos (id, nome, categoria, unidade, custo_centavos, preco_centavos, estoque_mil, estoque_minimo_mil, busca, criado_em, atualizado_em)
      VALUES (1, 'Pipa raia', 'Pipas', 'un', 600, 1500, 8000, 2000, 'pipa raia pipas', '${agora}', '${agora}');
    INSERT INTO movimentos_estoque (produto_id, tipo, quantidade_mil, saldo_mil, custo_unitario_centavos, observacao, data, criado_em)
      VALUES (1, 'inicial', 10000, 10000, 600, 'Estoque inicial', '2026-11-08', '${agora}');
    INSERT INTO sessoes_caixa (id, aberto_em, data_abertura, operador_abertura, fundo_troco_centavos)
      VALUES (1, '${agora}', '2026-11-08', 'Thiago', 5000);
    INSERT INTO movimentos_caixa (sessao_id, tipo, valor_centavos, descricao, criado_em)
      VALUES (1, 'abertura', 5000, 'Fundo de troco', '${agora}');
    INSERT INTO vendas (id, sessao_id, data, criado_em, subtotal_centavos, desconto_centavos, total_centavos, custo_centavos)
      VALUES (1, 1, '2026-11-08', '${agora}', 3000, 0, 3000, 1200);
    INSERT INTO venda_itens (venda_id, produto_id, nome, unidade, quantidade_mil, preco_unitario_centavos, custo_unitario_centavos, subtotal_centavos, total_centavos, custo_total_centavos)
      VALUES (1, 1, 'Pipa raia', 'un', 2000, 1500, 600, 3000, 3000, 1200);
    INSERT INTO venda_pagamentos (venda_id, forma_id, forma_nome, forma_tipo, recebido_centavos, valor_centavos)
      VALUES (1, 1, 'Dinheiro', 'dinheiro', 3000, 3000);
    INSERT INTO movimentos_estoque (produto_id, tipo, quantidade_mil, saldo_mil, custo_unitario_centavos, venda_id, observacao, data, criado_em)
      VALUES (1, 'venda', -2000, 8000, 600, 1, 'Venda nº 1', '2026-11-08', '${agora}');
  `);
  return db;
}

describe("migração da versão 1.0.0", () => {
  test("mantém produtos, vendas e o histórico de estoque e acrescenta o que é novo", () => {
    const db = bancoDaVersao1();
    expect(versaoDoBanco(db)).toBe(1);
    migrar(db);
    expect(versaoDoBanco(db)).toBe(MIGRACOES.length);

    const produto = db.query("SELECT * FROM produtos WHERE id = 1").get() as Record<string, unknown>;
    expect(produto).toMatchObject({ nome: "Pipa raia", estoque_mil: 8000, fabricado: 0, lote_producao_mil: 0 });

    const movimentos = db.query("SELECT tipo, quantidade_mil, saldo_mil, venda_id FROM movimentos_estoque ORDER BY id").all();
    expect(movimentos).toEqual([
      { tipo: "inicial", quantidade_mil: 10000, saldo_mil: 10000, venda_id: null },
      { tipo: "venda", quantidade_mil: -2000, saldo_mil: 8000, venda_id: 1 },
    ]);

    const venda = db.query("SELECT total_centavos, usuario_id, usuario_nome, cancelada_por FROM vendas WHERE id = 1").get();
    expect(venda).toEqual({ total_centavos: 3000, usuario_id: null, usuario_nome: "", cancelada_por: "" });
    const item = db.query("SELECT preco_unitario_centavos, preco_base_centavos FROM venda_itens").get();
    expect(item).toEqual({ preco_unitario_centavos: 1500, preco_base_centavos: null });

    // o novo tipo de movimento é aceito; um tipo inventado continua recusado
    db.query(
      `INSERT INTO movimentos_estoque (produto_id, tipo, quantidade_mil, saldo_mil, custo_unitario_centavos, data, criado_em)
       VALUES (1, 'producao', 5000, 13000, 550, '2026-11-09', '2026-11-09T12:00:00Z')`,
    ).run();
    expect(() =>
      db
        .query(
          `INSERT INTO movimentos_estoque (produto_id, tipo, quantidade_mil, saldo_mil, custo_unitario_centavos, data, criado_em)
           VALUES (1, 'roubo', -1000, 12000, 550, '2026-11-09', '2026-11-09T12:00:00Z')`,
        )
        .run(),
    ).toThrow();

    // nenhuma chave estrangeira quebrada e banco íntegro
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
    expect((db.query("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check).toBe("ok");

    // tabelas novas, sem usuário nenhum (o dono cria no primeiro acesso)
    expect((db.query("SELECT COUNT(*) AS n FROM usuarios").get() as { n: number }).n).toBe(0);
    const categoria = db.query("SELECT conta_no_resultado FROM categorias_financeiras WHERE sistema = 'material_producao'").get();
    expect(categoria).toEqual({ conta_no_resultado: 0 });
    const config = db.query("SELECT valor FROM config WHERE chave = 'producao_dias_alvo'").get();
    expect(config).toEqual({ valor: "30" });
  });

  test("rodar a migração de novo não muda nada", () => {
    const db = bancoDaVersao1();
    migrar(db);
    migrar(db);
    expect(versaoDoBanco(db)).toBe(MIGRACOES.length);
    expect((db.query("SELECT COUNT(*) AS n FROM movimentos_estoque").get() as { n: number }).n).toBe(2);
  });
});

describe("abrir um banco de versão anterior", () => {
  test("chama antesDeMigrar só quando o banco já existia numa versão anterior", () => {
    const pasta = mkdtempSync(join(tmpdir(), "tfpipas-migra-"));
    try {
      const caminho = join(pasta, "antigo.db");
      const antigo = new Database(caminho, { create: true, strict: true });
      antigo.transaction(() => {
        MIGRACOES[0]!(antigo);
        antigo.exec("PRAGMA user_version = 1");
      })();
      antigo.close();

      const chamadas: Array<[number, number, number]> = [];
      const db = abrirBanco(caminho, {
        antesDeMigrar: (banco, de, para) => chamadas.push([de, para, versaoDoBanco(banco)]),
      });
      // a cópia é feita com o banco ainda na estrutura antiga
      expect(chamadas).toEqual([[1, MIGRACOES.length, 1]]);
      expect(versaoDoBanco(db)).toBe(MIGRACOES.length);
      fecharBanco(db);

      // já atualizado: não chama de novo
      const db2 = abrirBanco(caminho, { antesDeMigrar: () => chamadas.push([0, 0, 0]) });
      expect(chamadas.length).toBe(1);
      fecharBanco(db2);

      // banco novo: não chama
      const db3 = abrirBanco(join(pasta, "novo.db"), { antesDeMigrar: () => chamadas.push([0, 0, 0]) });
      expect(chamadas.length).toBe(1);
      fecharBanco(db3);
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });
});
