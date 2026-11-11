import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { zerarTentativas } from "../src/dominio/usuarios";
import { definirRelogio, restaurarRelogio } from "../src/relogio";
import { servidorDeTeste } from "./ajuda-api";

let srv: ReturnType<typeof servidorDeTeste>;
let dono: ReturnType<ReturnType<typeof servidorDeTeste>["cliente"]>;
let codigoRecuperacao = "";

beforeAll(() => {
  srv = servidorDeTeste();
  dono = srv.cliente();
});
afterAll(() => srv.encerrar());

describe("primeiro acesso e entrada", () => {
  test("sem usuários, só o primeiro acesso funciona; ele cria o dono e já entra", async () => {
    const estado = await dono.chamar("GET", "/api/auth/estado");
    expect(estado.dados).toMatchObject({ primeiro_acesso: true, usuarios: [], usuario: null });

    // nada do sistema abre sem entrar
    expect((await dono.chamar("GET", "/api/produtos")).status).toBe(401);
    expect((await dono.chamar("GET", "/api/painel-rapido")).status).toBe(401);
    expect((await dono.chamar("POST", "/api/caixa/abrir", { fundo_troco_centavos: 0 })).status).toBe(401);

    // senha curta é recusada
    const curta = await dono.chamar("POST", "/api/auth/primeiro-acesso", { nome: "Thiago", senha: "12" });
    expect(curta.status).toBe(422);
    expect(curta.dados.erro).toContain("pelo menos 4");

    const r = await dono.primeiroAcesso("Thiago", "pipa123");
    expect(r.usuario).toMatchObject({ nome: "Thiago", perfil: "administrador" });
    expect((r.usuario as Record<string, unknown>).senha_hash).toBeUndefined();
    expect(r.codigo_recuperacao).toMatch(/^[2-9A-HJ-NP-Z]{4}(-[2-9A-HJ-NP-Z]{4}){3}$/);
    codigoRecuperacao = r.codigo_recuperacao;

    const depois = await dono.chamar("GET", "/api/auth/estado");
    expect(depois.dados.primeiro_acesso).toBe(false);
    expect(depois.dados.usuario.nome).toBe("Thiago");
    expect((await dono.chamar("GET", "/api/produtos")).status).toBe(200);

    // um segundo "primeiro acesso" não passa
    const outro = srv.cliente();
    expect((await outro.chamar("POST", "/api/auth/primeiro-acesso", { nome: "Intruso", senha: "123456" })).status).toBe(409);
  });

  test("cookie da sessão é HttpOnly e SameSite=Strict, e a senha nunca volta na resposta", async () => {
    const outro = srv.cliente();
    const r = await outro.entrar("Thiago", "pipa123");
    expect(r.status).toBe(200);
    const cookie = r.cabecalhos.get("set-cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(JSON.stringify(r.dados)).not.toContain("argon2");
    const hash = srv.ctx.db.query("SELECT senha_hash FROM usuarios WHERE nome = 'Thiago'").get() as { senha_hash: string };
    expect(hash.senha_hash.startsWith("$argon2id$")).toBe(true);
    expect(hash.senha_hash).not.toContain("pipa123");
    // no banco fica só o hash do código da sessão, não o código
    const valor = outro.cookie.split("=")[1]!;
    const sessoes = srv.ctx.db.query("SELECT token_hash FROM sessoes_usuario").all() as Array<{ token_hash: string }>;
    expect(sessoes.some((s) => s.token_hash === valor)).toBe(false);
  });

  test("senha errada é recusada e, depois de 5 erros, espera um pouco", async () => {
    const outro = srv.cliente();
    for (let i = 0; i < 5; i++) {
      const r = await outro.entrar("Thiago", "errada");
      expect(r.status).toBe(401);
    }
    const bloqueado = await outro.entrar("Thiago", "pipa123");
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.dados.erro).toContain("Espere");
    zerarTentativas(); // na loja, basta esperar os segundos indicados
  });

  test("sair encerra a sessão", async () => {
    const outro = srv.cliente();
    // o bloqueio do teste anterior é por usuário; outro usuário entra normalmente
    expect((await dono.chamar("POST", "/api/usuarios", { nome: "Ana", perfil: "funcionario", permissoes: [], senha: "4321" })).status).toBe(200);
    expect((await outro.entrar("Ana", "4321")).status).toBe(200);
    expect((await outro.chamar("GET", "/api/painel-rapido")).status).toBe(200);
    const cookieAntigo = outro.cookie;
    await outro.chamar("POST", "/api/auth/sair");
    expect((await outro.chamar("GET", "/api/painel-rapido")).status).toBe(401);
    // o código antigo também não vale mais
    expect((await outro.chamar("GET", "/api/painel-rapido", undefined, { Cookie: cookieAntigo })).status).toBe(401);
  });

  test("sessão expira depois de 14 horas sem uso", async () => {
    const agora = Date.parse("2026-11-11T12:00:00Z");
    definirRelogio(() => new Date(agora));
    const outro = srv.cliente();
    expect((await outro.entrar("Ana", "4321")).status).toBe(200);
    definirRelogio(() => new Date(agora + 13 * 3600_000));
    expect((await outro.chamar("GET", "/api/painel-rapido")).status).toBe(200); // usou: renova
    definirRelogio(() => new Date(agora + 26 * 3600_000));
    expect((await outro.chamar("GET", "/api/painel-rapido")).status).toBe(200); // 13 h depois do último uso
    definirRelogio(() => new Date(agora + 41 * 3600_000));
    expect((await outro.chamar("GET", "/api/painel-rapido")).status).toBe(401); // 15 h parado
    restaurarRelogio();
  });
});

describe("permissões do funcionário", () => {
  let caixa: ReturnType<ReturnType<typeof servidorDeTeste>["cliente"]>;
  let pipaId = 0;

  beforeAll(async () => {
    caixa = srv.cliente();
    expect((await caixa.entrar("Ana", "4321")).status).toBe(200);
    const p = await dono.chamar("POST", "/api/produtos", { nome: "Pipa raia", custo_centavos: 600, preco_centavos: 1500, estoque_inicial: 20 });
    pipaId = p.dados.id;
  });

  test("vende e cuida do caixa; a venda fica no nome dela", async () => {
    expect((await caixa.chamar("POST", "/api/caixa/abrir", { fundo_troco_centavos: 1000 })).status).toBe(200);
    const atual = await caixa.chamar("GET", "/api/caixa/atual");
    expect(atual.dados.caixa.sessao.operador_abertura).toBe("Ana");
    const v = await caixa.chamar("POST", "/api/vendas", {
      itens: [{ produto_id: pipaId, quantidade: 2 }],
      pagamentos: [{ forma_id: 1, valor_centavos: 3000 }],
    });
    expect(v.status).toBe(200);
    expect(v.dados.usuario_nome).toBe("Ana");
    expect(v.dados.total_centavos).toBe(3000);
    // sem permissão de financeiro: não vê custo nem lucro
    expect(v.dados.custo_centavos).toBeUndefined();
    expect(v.dados.lucro_bruto_centavos).toBeUndefined();
    expect(v.dados.itens[0].custo_unitario_centavos).toBeUndefined();
    const lista = await caixa.chamar("GET", "/api/vendas");
    expect(lista.dados[0].lucro_bruto_centavos).toBeUndefined();
    const produtos = await caixa.chamar("GET", "/api/produtos");
    expect(produtos.dados[0].preco_centavos).toBe(1500);
    expect(produtos.dados[0].custo_centavos).toBeUndefined();
    expect(produtos.dados[0].margem_bp).toBeUndefined();
    // o dono vê tudo
    const doDono = await dono.chamar("GET", `/api/vendas/${v.dados.id}`);
    expect(doDono.dados.custo_centavos).toBe(1200);
    expect(doDono.dados.usuario_nome).toBe("Ana");
  });

  test("não dá desconto, não cancela, não mexe em produto, financeiro, relatório nem configuração", async () => {
    const comDesconto = await caixa.chamar("POST", "/api/vendas", {
      itens: [{ produto_id: pipaId, quantidade: 1 }],
      desconto_centavos: 100,
      pagamentos: [{ forma_id: 1, valor_centavos: 1400 }],
    });
    expect(comDesconto.status).toBe(403);
    expect(comDesconto.dados.erro).toContain("desconto");

    const vendas = await caixa.chamar("GET", "/api/vendas");
    expect((await caixa.chamar("POST", `/api/vendas/${vendas.dados[0].id}/cancelar`, { motivo: "teste" })).status).toBe(403);
    expect((await caixa.chamar("POST", "/api/produtos", { nome: "X", custo_centavos: 1, preco_centavos: 2 })).status).toBe(403);
    expect((await caixa.chamar("GET", "/api/producao/sugestao")).status).toBe(403);
    expect((await caixa.chamar("GET", "/api/financeiro/pendentes")).status).toBe(403);
    expect((await caixa.chamar("GET", "/api/relatorios/resultado")).status).toBe(403);
    expect((await caixa.chamar("GET", "/api/inicio")).status).toBe(403);
    expect((await caixa.chamar("PUT", "/api/config", { loja_nome: "Outra" })).status).toBe(403);
    expect((await caixa.chamar("GET", "/api/usuarios")).status).toBe(403);
    expect((await caixa.chamar("GET", "/api/backups")).status).toBe(403);
  });

  test("o dono libera desconto e cancelamento; vale na hora, sem sair", async () => {
    const usuarios = await dono.chamar("GET", "/api/usuarios");
    const ana = (usuarios.dados as Array<{ id: number; nome: string }>).find((u) => u.nome === "Ana")!;
    const r = await dono.chamar("PUT", `/api/usuarios/${ana.id}`, { permissoes: ["desconto", "cancelar_venda", "permissao_inventada"] });
    expect(r.status).toBe(400); // permissão desconhecida é recusada
    const ok = await dono.chamar("PUT", `/api/usuarios/${ana.id}`, { permissoes: ["desconto", "cancelar_venda"] });
    expect(ok.dados.permissoes).toEqual(["vender", "desconto", "cancelar_venda"]);

    const v = await caixa.chamar("POST", "/api/vendas", {
      itens: [{ produto_id: pipaId, quantidade: 1 }],
      desconto_centavos: 100,
      pagamentos: [{ forma_id: 1, valor_centavos: 1400 }],
    });
    expect(v.status).toBe(200);
    const c = await caixa.chamar("POST", `/api/vendas/${v.dados.id}/cancelar`, { motivo: "cliente desistiu" });
    expect(c.status).toBe(200);
    expect(c.dados.cancelada_por).toBe("Ana");
  });

  test("usuário desativado sai na hora e não entra mais", async () => {
    const usuarios = await dono.chamar("GET", "/api/usuarios");
    const ana = (usuarios.dados as Array<{ id: number; nome: string }>).find((u) => u.nome === "Ana")!;
    expect((await dono.chamar("PUT", `/api/usuarios/${ana.id}`, { ativo: false })).status).toBe(200);
    expect((await caixa.chamar("GET", "/api/painel-rapido")).status).toBe(401);
    expect((await caixa.entrar("Ana", "4321").catch(() => null)) ?? "não aparece na lista").toBe("não aparece na lista");
    expect((await dono.chamar("PUT", `/api/usuarios/${ana.id}`, { ativo: true })).status).toBe(200);
  });
});

describe("administração de usuários", () => {
  test("o único administrador não pode ser desativado nem virar funcionário", async () => {
    const usuarios = await dono.chamar("GET", "/api/usuarios");
    const thiago = (usuarios.dados as Array<{ id: number; nome: string }>).find((u) => u.nome === "Thiago")!;
    const r1 = await dono.chamar("PUT", `/api/usuarios/${thiago.id}`, { ativo: false });
    expect(r1.status).toBe(422);
    expect(r1.dados.erro).toContain("único administrador");
    expect((await dono.chamar("PUT", `/api/usuarios/${thiago.id}`, { perfil: "funcionario" })).status).toBe(422);
  });

  test("nome repetido é recusado (sem diferença de maiúsculas)", async () => {
    const r = await dono.chamar("POST", "/api/usuarios", { nome: "ana", perfil: "funcionario", senha: "9999" });
    expect(r.status).toBe(409);
  });

  test("trocar a própria senha exige a senha atual e mantém quem trocou logado", async () => {
    expect((await dono.chamar("POST", "/api/auth/minha-senha", { senha_atual: "errada", nova_senha: "nova123" })).status).toBe(401);
    expect((await dono.chamar("POST", "/api/auth/minha-senha", { senha_atual: "pipa123", nova_senha: "nova123" })).status).toBe(200);
    expect((await dono.chamar("GET", "/api/usuarios")).status).toBe(200);
    const outro = srv.cliente();
    expect((await outro.entrar("Thiago", "nova123")).status).toBe(200);
  });

  test("o dono redefine a senha de um funcionário; as sessões dele caem", async () => {
    const ana = srv.cliente();
    expect((await ana.entrar("Ana", "4321")).status).toBe(200);
    const usuarios = await dono.chamar("GET", "/api/usuarios");
    const id = (usuarios.dados as Array<{ id: number; nome: string }>).find((u) => u.nome === "Ana")!.id;
    expect((await dono.chamar("POST", `/api/usuarios/${id}/senha`, { senha: "5555" })).status).toBe(200);
    expect((await ana.chamar("GET", "/api/painel-rapido")).status).toBe(401);
    expect((await ana.entrar("Ana", "4321")).status).toBe(401);
    expect((await ana.entrar("Ana", "5555")).status).toBe(200);
  });

  test("esqueceu a senha: o código de recuperação troca a senha do dono e gera um código novo", async () => {
    const qualquer = srv.cliente();
    const estado = await qualquer.chamar("GET", "/api/auth/estado");
    const thiago = (estado.dados.usuarios as Array<{ id: number; nome: string }>).find((u) => u.nome === "Thiago")!;
    const ana = (estado.dados.usuarios as Array<{ id: number; nome: string }>).find((u) => u.nome === "Ana")!;

    const errado = await qualquer.chamar("POST", "/api/auth/recuperar", { usuario_id: thiago.id, codigo: "AAAA-BBBB-CCCC-DDDD", nova_senha: "abcd" });
    expect(errado.status).toBe(401);
    // o código não troca senha de funcionário
    const deFuncionario = await qualquer.chamar("POST", "/api/auth/recuperar", { usuario_id: ana.id, codigo: codigoRecuperacao, nova_senha: "abcd" });
    expect(deFuncionario.status).toBe(422);

    // aceita digitado em minúsculas e sem traços
    const certo = await qualquer.chamar("POST", "/api/auth/recuperar", {
      usuario_id: thiago.id,
      codigo: codigoRecuperacao.toLowerCase().replace(/-/g, " "),
      nova_senha: "recuperada",
    });
    expect(certo.status).toBe(200);
    expect(certo.dados.codigo_recuperacao).not.toBe(codigoRecuperacao);
    expect((await qualquer.chamar("GET", "/api/usuarios")).status).toBe(200); // já entrou

    // o código antigo não vale mais; as sessões antigas do dono caíram
    expect((await qualquer.chamar("POST", "/api/auth/recuperar", { usuario_id: thiago.id, codigo: codigoRecuperacao, nova_senha: "outra1" })).status).toBe(401);
    expect((await dono.chamar("GET", "/api/usuarios")).status).toBe(401);
    expect((await dono.entrar("Thiago", "recuperada")).status).toBe(200);
  });
});
