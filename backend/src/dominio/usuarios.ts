import type { Banco } from "../banco";
import { transacao } from "../banco";
import { ErroNegocio, naoEncontrado } from "../erros";
import { agora, agoraIso } from "../relogio";

/**
 * Usuários do sistema, senhas e sessões.
 *
 * - Perfil "administrador" (o dono) pode tudo, inclusive cadastrar usuários.
 * - Perfil "funcionario" sempre pode vender e cuidar do caixa; o resto o dono
 *   libera por usuário (desconto, cancelar venda, produtos, financeiro).
 * - Senhas são guardadas só como hash argon2id (nunca a senha em si).
 * - Sessão: um código aleatório num cookie; no banco fica só o hash dele.
 *   Expira depois de 14 horas sem uso.
 * - Código de recuperação: criado no primeiro acesso, serve para o dono
 *   trocar a senha se esquecer. Também guardado só como hash.
 */

export type Perfil = "administrador" | "funcionario";
export type Permissao = "vender" | "desconto" | "cancelar_venda" | "produtos" | "financeiro" | "administrar";

/** Permissões que o dono pode dar a um funcionário (vender ele sempre pode). */
export const PERMISSOES_LIBERAVEIS: Permissao[] = ["desconto", "cancelar_venda", "produtos", "financeiro"];
export const TODAS_PERMISSOES: Permissao[] = ["vender", "desconto", "cancelar_venda", "produtos", "financeiro", "administrar"];

export const HORAS_SESSAO = 14;
const MINIMO_SENHA = 4;
const OPCOES_HASH = { algorithm: "argon2id" as const, memoryCost: 19456, timeCost: 2 };

interface LinhaUsuario {
  id: number;
  nome: string;
  senha_hash: string;
  perfil: Perfil;
  permissoes: string;
  ativo: number;
  criado_em: string;
  atualizado_em: string;
  ultimo_acesso_em: string | null;
}

export interface Usuario {
  id: number;
  nome: string;
  perfil: Perfil;
  /** Permissões efetivas (o administrador tem todas). */
  permissoes: Permissao[];
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
  ultimo_acesso_em: string | null;
}

export function permissoesEfetivas(perfil: Perfil, extras: Permissao[]): Permissao[] {
  if (perfil === "administrador") return [...TODAS_PERMISSOES];
  const liberadas = extras.filter((p) => PERMISSOES_LIBERAVEIS.includes(p));
  return ["vender", ...PERMISSOES_LIBERAVEIS.filter((p) => liberadas.includes(p))];
}

function paraUsuario(l: LinhaUsuario): Usuario {
  const extras = l.permissoes.split(",").filter(Boolean) as Permissao[];
  return {
    id: l.id,
    nome: l.nome,
    perfil: l.perfil,
    permissoes: permissoesEfetivas(l.perfil, extras),
    ativo: l.ativo === 1,
    criado_em: l.criado_em,
    atualizado_em: l.atualizado_em,
    ultimo_acesso_em: l.ultimo_acesso_em,
  };
}

export function pode(usuario: Usuario | null | undefined, permissao: Permissao): boolean {
  return !!usuario && usuario.permissoes.includes(permissao);
}

function linha(db: Banco, id: number): LinhaUsuario {
  const l = db.query("SELECT * FROM usuarios WHERE id = $id").get({ id }) as LinhaUsuario | null;
  if (!l) throw naoEncontrado("Usuário não encontrado.");
  return l;
}

export function obterUsuario(db: Banco, id: number): Usuario {
  return paraUsuario(linha(db, id));
}

export function listarUsuarios(db: Banco): Usuario[] {
  const linhas = db.query("SELECT * FROM usuarios ORDER BY ativo DESC, perfil, nome COLLATE NOCASE").all() as LinhaUsuario[];
  return linhas.map(paraUsuario);
}

export function existemUsuarios(db: Banco): boolean {
  return (db.query("SELECT COUNT(*) AS n FROM usuarios").get() as { n: number }).n > 0;
}

/** Usuários que aparecem na tela de entrada (só nome, sem nada sensível). */
export function usuariosParaEntrar(db: Banco): Array<{ id: number; nome: string; perfil: Perfil }> {
  return db
    .query("SELECT id, nome, perfil FROM usuarios WHERE ativo = 1 ORDER BY perfil, nome COLLATE NOCASE")
    .all() as Array<{ id: number; nome: string; perfil: Perfil }>;
}

function validarNome(db: Banco, nome: string, idAtual: number): string {
  const n = nome.trim().replace(/\s+/g, " ");
  if (n.length < 2) throw new ErroNegocio("Informe o nome (pelo menos 2 letras).", 422, "nome");
  if (n.length > 40) throw new ErroNegocio("O nome pode ter no máximo 40 letras.", 422, "nome");
  const outro = db.query("SELECT id FROM usuarios WHERE nome = $n COLLATE NOCASE AND id <> $id").get({ n, id: idAtual });
  if (outro) throw new ErroNegocio("Já existe um usuário com esse nome.", 409, "nome");
  return n;
}

export function validarSenha(senha: string, campo = "senha"): void {
  if (typeof senha !== "string" || senha.length < MINIMO_SENHA) {
    throw new ErroNegocio(`A senha precisa ter pelo menos ${MINIMO_SENHA} caracteres (pode ser só números).`, 422, campo);
  }
  if (senha.length > 72) throw new ErroNegocio("A senha pode ter no máximo 72 caracteres.", 422, campo);
}

function normalizarPermissoes(perfil: Perfil, permissoes: Permissao[]): string {
  if (perfil === "administrador") return "";
  return PERMISSOES_LIBERAVEIS.filter((p) => permissoes.includes(p)).join(",");
}

export async function hashSenha(senha: string): Promise<string> {
  return Bun.password.hash(senha, OPCOES_HASH);
}

export interface NovoUsuario {
  nome: string;
  perfil: Perfil;
  permissoes: Permissao[];
  senha: string;
}

function inserirUsuario(db: Banco, dados: Omit<NovoUsuario, "senha">, hash: string): Usuario {
  const nome = validarNome(db, dados.nome, 0);
  const momento = agoraIso();
  const { id } = db
    .query(
      `INSERT INTO usuarios (nome, senha_hash, perfil, permissoes, ativo, criado_em, atualizado_em)
       VALUES ($nome, $hash, $perfil, $permissoes, 1, $agora, $agora) RETURNING id`,
    )
    .get({ nome, hash, perfil: dados.perfil, permissoes: normalizarPermissoes(dados.perfil, dados.permissoes), agora: momento }) as {
    id: number;
  };
  return obterUsuario(db, id);
}

export async function criarUsuario(db: Banco, dados: NovoUsuario): Promise<Usuario> {
  validarSenha(dados.senha);
  const hash = await hashSenha(dados.senha);
  return transacao(db, () => inserirUsuario(db, dados, hash));
}

function administradoresAtivos(db: Banco, excetoId: number): number {
  return (
    db.query("SELECT COUNT(*) AS n FROM usuarios WHERE perfil = 'administrador' AND ativo = 1 AND id <> $id").get({ id: excetoId }) as {
      n: number;
    }
  ).n;
}

export function atualizarUsuario(
  db: Banco,
  id: number,
  dados: { nome?: string; perfil?: Perfil; permissoes?: Permissao[]; ativo?: boolean },
): Usuario {
  return transacao(db, () => {
    const atual = linha(db, id);
    const nome = dados.nome === undefined ? atual.nome : validarNome(db, dados.nome, id);
    const perfil = dados.perfil ?? atual.perfil;
    const ativo = dados.ativo === undefined ? atual.ativo === 1 : dados.ativo;
    const perdeAdmin = atual.perfil === "administrador" && atual.ativo === 1 && (perfil !== "administrador" || !ativo);
    if (perdeAdmin && administradoresAtivos(db, id) === 0) {
      throw new ErroNegocio("Esse é o único administrador ativo. Cadastre ou ative outro administrador antes.", 422);
    }
    const extras = dados.permissoes ?? (atual.permissoes.split(",").filter(Boolean) as Permissao[]);
    db.query(
      `UPDATE usuarios SET nome = $nome, perfil = $perfil, permissoes = $permissoes, ativo = $ativo, atualizado_em = $agora
       WHERE id = $id`,
    ).run({ id, nome, perfil, permissoes: normalizarPermissoes(perfil, extras), ativo: ativo ? 1 : 0, agora: agoraIso() });
    if (!ativo) db.query("DELETE FROM sessoes_usuario WHERE usuario_id = $id").run({ id });
    return obterUsuario(db, id);
  });
}

/** Troca a senha. Encerra as sessões do usuário, menos a indicada (a de quem está trocando). */
export async function definirSenha(db: Banco, id: number, senha: string, manterSessaoHash?: string): Promise<Usuario> {
  validarSenha(senha);
  const hash = await hashSenha(senha);
  return transacao(db, () => {
    linha(db, id);
    db.query("UPDATE usuarios SET senha_hash = $hash, atualizado_em = $agora WHERE id = $id").run({ id, hash, agora: agoraIso() });
    db.query("DELETE FROM sessoes_usuario WHERE usuario_id = $id AND token_hash <> $manter").run({ id, manter: manterSessaoHash ?? "" });
    return obterUsuario(db, id);
  });
}

export async function conferirSenha(db: Banco, id: number, senha: string): Promise<boolean> {
  const l = db.query("SELECT senha_hash FROM usuarios WHERE id = $id").get({ id }) as { senha_hash: string } | null;
  if (!l || typeof senha !== "string" || !senha) return false;
  try {
    return await Bun.password.verify(senha, l.senha_hash);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Tentativas de senha: depois de 5 erros seguidos, espera um pouco.    */
/* ------------------------------------------------------------------ */
const tentativas = new Map<string, { erros: number; liberaEm: number }>();

export function conferirBloqueio(chave: string): void {
  const t = tentativas.get(chave);
  if (t && t.liberaEm > Date.now()) {
    const s = Math.ceil((t.liberaEm - Date.now()) / 1000);
    throw new ErroNegocio(`Muitas tentativas erradas. Espere ${s} segundos e tente de novo.`, 429);
  }
}

export function registrarErroDeSenha(chave: string): void {
  const t = tentativas.get(chave) ?? { erros: 0, liberaEm: 0 };
  t.erros++;
  if (t.erros >= 5) t.liberaEm = Date.now() + Math.min(300, 30 * 2 ** (t.erros - 5)) * 1000;
  tentativas.set(chave, t);
}

export function limparErrosDeSenha(chave: string): void {
  tentativas.delete(chave);
}

/** Só para os testes. */
export function zerarTentativas(): void {
  tentativas.clear();
}

/* ------------------------------------------------------------------ */
/* Sessões                                                              */
/* ------------------------------------------------------------------ */
function hashToken(token: string): string {
  return new Bun.CryptoHasher("sha256").update(token).digest("hex");
}

function tokenAleatorio(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

export function criarSessao(db: Banco, usuarioId: number): { token: string; token_hash: string } {
  const token = tokenAleatorio();
  const tokenHash = hashToken(token);
  const momento = agora();
  const expira = new Date(momento.getTime() + HORAS_SESSAO * 3600_000).toISOString();
  transacao(db, () => {
    db.query(
      "INSERT INTO sessoes_usuario (token_hash, usuario_id, criado_em, expira_em, usado_em) VALUES ($t, $u, $agora, $expira, $agora)",
    ).run({ t: tokenHash, u: usuarioId, agora: momento.toISOString(), expira });
    db.query("UPDATE usuarios SET ultimo_acesso_em = $agora WHERE id = $u").run({ u: usuarioId, agora: momento.toISOString() });
    // limpa sessões vencidas
    db.query("DELETE FROM sessoes_usuario WHERE expira_em < $agora").run({ agora: momento.toISOString() });
  });
  return { token, token_hash: tokenHash };
}

/** Usuário dono da sessão (ativo e dentro do prazo). Renova o prazo a cada uso. */
export function usuarioDaSessao(db: Banco, token: string | null | undefined): { usuario: Usuario; token_hash: string } | null {
  if (!token || token.length > 200) return null;
  const tokenHash = hashToken(token);
  const momento = agora();
  const l = db
    .query(
      `SELECT u.*, s.usado_em AS sessao_usada_em FROM sessoes_usuario s JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.token_hash = $t AND s.expira_em > $agora AND u.ativo = 1`,
    )
    .get({ t: tokenHash, agora: momento.toISOString() }) as (LinhaUsuario & { sessao_usada_em: string }) | null;
  if (!l) return null;
  // renova no máximo uma vez por minuto (evita gravar no banco a cada pedido)
  if (momento.getTime() - new Date(l.sessao_usada_em).getTime() > 60_000) {
    db.query("UPDATE sessoes_usuario SET usado_em = $agora, expira_em = $expira WHERE token_hash = $t").run({
      t: tokenHash,
      agora: momento.toISOString(),
      expira: new Date(momento.getTime() + HORAS_SESSAO * 3600_000).toISOString(),
    });
  }
  return { usuario: paraUsuario(l), token_hash: tokenHash };
}

export function encerrarSessao(db: Banco, token: string | null | undefined): void {
  if (!token) return;
  db.query("DELETE FROM sessoes_usuario WHERE token_hash = $t").run({ t: hashToken(token) });
}

export function encerrarTodasAsSessoes(db: Banco): void {
  db.query("DELETE FROM sessoes_usuario").run();
}

/* ------------------------------------------------------------------ */
/* Primeiro acesso e código de recuperação                              */
/* ------------------------------------------------------------------ */
const ALFABETO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // sem 0/O e 1/I/L, que confundem

function novoCodigo(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const letras = [...bytes].map((b) => ALFABETO[b % ALFABETO.length]).join("");
  return letras.match(/.{4}/g)!.join("-");
}

/** Só letras e números, em maiúsculas (aceita o código digitado com ou sem traços). */
function normalizarCodigo(codigo: string): string {
  return codigo.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function gravarHashCodigo(db: Banco, hash: string): void {
  db.query(
    "INSERT INTO config (chave, valor) VALUES ('recuperacao_hash', $h) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor",
  ).run({ h: hash });
}

async function gravarCodigo(db: Banco): Promise<string> {
  const codigo = novoCodigo();
  gravarHashCodigo(db, await Bun.password.hash(codigo.replace(/-/g, ""), OPCOES_HASH));
  return codigo;
}

/** Cria o primeiro usuário (o dono). Só funciona com o sistema sem nenhum usuário. */
export async function primeiroAcesso(db: Banco, dados: { nome: string; senha: string }): Promise<{ usuario: Usuario; codigo_recuperacao: string }> {
  if (existemUsuarios(db)) throw new ErroNegocio("O sistema já tem usuários. Entre com o seu usuário.", 409);
  validarSenha(dados.senha);
  const hash = await hashSenha(dados.senha);
  const codigo = novoCodigo();
  const hashCodigo = await Bun.password.hash(codigo.replace(/-/g, ""), OPCOES_HASH);
  const usuario = transacao(db, () => {
    // confere de novo dentro da transação (dois primeiros acessos ao mesmo tempo)
    if (existemUsuarios(db)) throw new ErroNegocio("O sistema já tem usuários. Entre com o seu usuário.", 409);
    const u = inserirUsuario(db, { nome: dados.nome, perfil: "administrador", permissoes: [] }, hash);
    gravarHashCodigo(db, hashCodigo);
    return u;
  });
  return { usuario, codigo_recuperacao: codigo };
}

/** Gera um novo código de recuperação (o anterior deixa de valer). */
export async function novoCodigoRecuperacao(db: Banco): Promise<string> {
  return gravarCodigo(db);
}

/** Troca a senha de um administrador usando o código de recuperação. Gera um código novo. */
export async function recuperarSenha(
  db: Banco,
  dados: { usuario_id: number; codigo: string; nova_senha: string },
): Promise<{ usuario: Usuario; novo_codigo: string }> {
  validarSenha(dados.nova_senha, "nova_senha");
  const chave = "recuperacao";
  conferirBloqueio(chave);
  const salvo = db.query("SELECT valor FROM config WHERE chave = 'recuperacao_hash'").get() as { valor: string } | null;
  const codigo = normalizarCodigo(dados.codigo ?? "");
  const confere = !!salvo && codigo.length === 16 && (await Bun.password.verify(codigo, salvo.valor).catch(() => false));
  if (!confere) {
    registrarErroDeSenha(chave);
    throw new ErroNegocio("Código de recuperação errado. Confira as letras e os números.", 401, "codigo");
  }
  const alvo = linha(db, dados.usuario_id);
  if (alvo.perfil !== "administrador" || !alvo.ativo) {
    throw new ErroNegocio("O código de recuperação só troca a senha de um administrador ativo.", 422, "usuario_id");
  }
  limparErrosDeSenha(chave);
  const usuario = await definirSenha(db, alvo.id, dados.nova_senha);
  const novo = await gravarCodigo(db);
  return { usuario, novo_codigo: novo };
}
