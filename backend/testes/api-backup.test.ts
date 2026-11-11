import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { abrirBanco, fecharBanco } from "../src/banco";
import { conferirArquivoDeBanco, fazerBackup, listarBackups } from "../src/dominio/backup";
import { CABECALHO_APP } from "../src/rotas";
import { servidorDeTeste } from "./ajuda-api";

let srv: ReturnType<typeof servidorDeTeste>;
let navegador: ReturnType<ReturnType<typeof servidorDeTeste>["cliente"]>;
let base: string;
let pasta: string;
let ctx: ReturnType<typeof servidorDeTeste>["ctx"];

beforeAll(async () => {
  srv = servidorDeTeste();
  ({ base, pasta, ctx } = srv);
  navegador = srv.cliente();
  await navegador.primeiroAcesso("Thiago", "1234");
});

afterAll(() => srv.encerrar());

function chamar(metodo: string, caminho: string, corpo?: unknown, cabecalhos: Record<string, string> = {}) {
  return navegador.chamar(metodo, caminho, corpo, cabecalhos);
}

describe("API", () => {
  test("saúde e rotas desconhecidas", async () => {
    expect((await chamar("GET", "/api/saude")).dados).toMatchObject({ app: "tf-pipas", versao: "teste" });
    const r = await chamar("GET", "/api/nao-existe");
    expect(r.status).toBe(404);
    expect(r.dados.erro).toBeTruthy();
  });

  test("recusa alteração sem o cabeçalho da interface (pedido vindo de outro site)", async () => {
    const r = await fetch(`${base}/api/caixa/abrir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fundo_troco_centavos: 0 }),
    });
    expect(r.status).toBe(403);
  });

  test("recusa endereço que não é deste computador", async () => {
    const r = await fetch(`${base}/api/saude`, { headers: { Host: "loja.exemplo.com" } });
    expect(r.status).toBe(403);
  });

  test("valida os dados com mensagem em português", async () => {
    const r = await chamar("POST", "/api/produtos", { nome: "", custo_centavos: 10, preco_centavos: 50 });
    expect(r.status).toBe(400);
    expect(r.dados).toMatchObject({ erro: "Nome: é obrigatório.", campo: "nome" });
    const q = await chamar("POST", "/api/produtos", { nome: "Pipa", custo_centavos: 10, preco_centavos: 50, estoque_inicial: 1.2345 });
    expect(q.dados.erro).toBe("Estoque inicial: use no máximo 3 casas decimais.");
  });

  test("configuração da largura do papel do comprovante (80 mm padrão, 58 mm opcional)", async () => {
    expect((await chamar("GET", "/api/config")).dados.comprovante_largura).toBe("80");
    const r = await chamar("PUT", "/api/config", { comprovante_largura: "58" });
    expect(r.status).toBe(200);
    expect(r.dados.comprovante_largura).toBe("58");
    expect(r.dados.loja_nome).toBe("TF Pipas");
    const ruim = await chamar("PUT", "/api/config", { comprovante_largura: "110" });
    expect(ruim.status).toBe(400);
    expect((await chamar("GET", "/api/config")).dados.comprovante_largura).toBe("58");
    await chamar("PUT", "/api/config", { comprovante_largura: "80" });
  });

  test("fluxo completo: produto, caixa, venda com troco, resultado e cancelamento", async () => {
    const p = await chamar("POST", "/api/produtos", {
      nome: "Pipa raia",
      categoria: "Pipas",
      custo_centavos: 120,
      preco_centavos: 350,
      estoque_inicial: 30,
      codigo_barras: "789100100101",
    });
    expect(p.status).toBe(200);
    expect((await chamar("GET", "/api/produtos/codigo/789100100101")).dados.nome).toBe("Pipa raia");

    expect((await chamar("POST", "/api/vendas", { itens: [{ produto_id: p.dados.id, quantidade: 1 }], pagamentos: [{ forma_id: 1, valor_centavos: 350 }] })).status).toBe(409);
    expect((await chamar("POST", "/api/caixa/abrir", { fundo_troco_centavos: 2000 })).status).toBe(200);

    const v = await chamar("POST", "/api/vendas", {
      itens: [{ produto_id: p.dados.id, quantidade: 4 }],
      pagamentos: [{ forma_id: 1, valor_centavos: 2000 }],
    });
    expect(v.status).toBe(200);
    expect(v.dados).toMatchObject({ total_centavos: 1400, troco_centavos: 600 });

    const caixa = await chamar("GET", "/api/caixa/atual");
    expect(caixa.dados.caixa.gaveta.esperado_centavos).toBe(3400);

    const r = await chamar("GET", "/api/relatorios/resultado");
    expect(r.dados.vendas.receita_centavos).toBe(1400);
    expect(r.dados.cmv_centavos).toBe(480);

    const c = await chamar("POST", `/api/vendas/${v.dados.id}/cancelar`, { motivo: "Teste" });
    expect(c.dados.status).toBe("cancelada");
    expect((await chamar("GET", "/api/caixa/atual")).dados.caixa.gaveta.esperado_centavos).toBe(2000);
    expect((await chamar("GET", `/api/produtos/${p.dados.id}`)).dados.estoque).toBe(30);
  });

  test("período inválido nos relatórios", async () => {
    expect((await chamar("GET", "/api/relatorios/resultado?de=2026-11-30&ate=2026-11-01")).status).toBe(400);
    expect((await chamar("GET", "/api/relatorios/resultado?de=ontem")).status).toBe(400);
  });
});

describe("backup", () => {
  test("cria, lista, baixa e restaura; guarda uma cópia antes de restaurar", async () => {
    const criado = await chamar("POST", "/api/backups");
    expect(criado.status).toBe(200);
    expect(criado.dados.motivo).toBe("manual");

    // muda o banco depois do backup
    await chamar("POST", "/api/produtos", { nome: "Produto depois do backup", custo_centavos: 1, preco_centavos: 2 });
    const antes = (await chamar("GET", "/api/produtos")).dados.length;

    const baixado = await fetch(`${base}/api/backups/${criado.dados.nome}`, { headers: { Cookie: navegador.cookie } });
    expect(baixado.headers.get("content-disposition")).toContain(criado.dados.nome);
    expect((await baixado.arrayBuffer()).byteLength).toBe(criado.dados.tamanho_bytes);

    const restaurado = await chamar("POST", `/api/backups/${criado.dados.nome}/restaurar`);
    expect(restaurado.status).toBe(200);
    expect(restaurado.dados.entrar_de_novo).toBe(true);
    // depois de restaurar, todo mundo entra de novo (as sessões do banco antigo não valem)
    expect((await chamar("GET", "/api/produtos")).status).toBe(401);
    expect((await navegador.entrar("Thiago", "1234")).status).toBe(200);
    expect((await chamar("GET", "/api/produtos")).dados.length).toBe(antes - 1);
    expect(listarBackups(ctx.pastaBackups).some((b) => b.motivo === "antes-de-restaurar")).toBe(true);
  });

  test("restaurar a partir de um arquivo enviado (pendrive)", async () => {
    const outro = abrirBanco(join(pasta, "outro.db"));
    outro.exec("INSERT INTO produtos (nome, custo_centavos, preco_centavos, criado_em, atualizado_em) VALUES ('Do pendrive', 1, 2, 'x', 'x')");
    const backup = fazerBackup(outro, join(pasta, "pendrive"), "manual");
    fecharBanco(outro);

    const form = new FormData();
    form.append("arquivo", Bun.file(join(pasta, "pendrive", backup.nome)));
    const r = await fetch(`${base}/api/backups/restaurar-arquivo`, {
      method: "POST",
      headers: { [CABECALHO_APP]: "1", Cookie: navegador.cookie },
      body: form,
    });
    expect(r.status).toBe(200);
    // o backup do pendrive não tem usuários: o sistema volta ao primeiro acesso
    expect((await chamar("GET", "/api/auth/estado")).dados.primeiro_acesso).toBe(true);
    await navegador.primeiroAcesso("Thiago", "1234");
    expect(((await chamar("GET", "/api/produtos")).dados as Array<{ nome: string }>).map((p) => p.nome)).toEqual(["Do pendrive"]);
  });

  test("recusa arquivo que não é backup e nome fora da pasta", async () => {
    const lixo = join(pasta, "lixo.db");
    writeFileSync(lixo, "isto não é um banco");
    expect(() => conferirArquivoDeBanco(lixo)).toThrow("Não consegui abrir");
    expect((await chamar("GET", "/api/backups/..%2Ftfpipas.db")).status).toBe(404);
    expect((await chamar("POST", "/api/backups/tfpipas-2026-01-01-000000-manual.db/restaurar")).status).toBe(404);
  });
});
