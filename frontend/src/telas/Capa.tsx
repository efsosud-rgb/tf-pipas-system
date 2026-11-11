import { ArrowLeft, ArrowRight, LogOut, Printer, ShoppingBag, WifiOff } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import fundoUrl from "../assets/capa-fundo.jpg";
import pipaUrl from "../assets/capa-pipa.png";
import meta from "../assets/capa.json";
import logoSelo from "../assets/logo-selo.svg";
import { api, ErroApi, mensagemDeErro } from "../api";
import { definirUsuario, sair, useAuth } from "../auth";
import { criarCena, type Cena } from "../capa/cena";
import { imprimirNoPapel } from "../componentes/comprovante";
import { CampoSenha, cx } from "../componentes/ui";
import { dataHora, dataPorExtenso, doisDigitos, hora, plural, reais, saudacao } from "../formato";
import { gravarLocal, lerLocal, useAgora, useApi } from "../hooks";
import type { EstadoAuth, PainelRapido, Saude, Usuario } from "../tipos";

type Destino = "inicio" | "pdv";
interface CodigoNovo {
  usuario: Usuario;
  codigo: string;
  motivo: "primeiro" | "recuperacao";
}

const ULTIMO_USUARIO = "tfpipas.ultimo_usuario";

/**
 * Capa do sistema e tela de entrada: a foto da praia com a pipa e o mar se
 * mexendo com o vento. Sem usuário logado, mostra quem pode entrar; no
 * primeiro uso, cria o administrador.
 */
export function Capa({ aoEntrar }: { aoEntrar: (destino: Destino, usuario: Usuario) => void }) {
  const auth = useAuth();
  const estado = auth.estado;
  const usuario = estado?.usuario ?? null;
  const refGl = useRef<HTMLCanvasElement>(null);
  const ref2d = useRef<HTMLCanvasElement>(null);
  const cena = useRef<Cena | null>(null);
  const [semAnimacao, setSemAnimacao] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [codigo, setCodigo] = useState<CodigoNovo | null>(null);
  const [recuperando, setRecuperando] = useState(false);
  const agora = useAgora(1000);
  const saude = useApi<Saude>("/api/saude");

  useEffect(() => {
    const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let ativo = true;
    criarCena(refGl.current!, ref2d.current!, { reduzido })
      .then((c) => {
        if (!ativo) return c?.parar();
        if (!c) setSemAnimacao(true);
        cena.current = c;
      })
      .catch(() => ativo && setSemAnimacao(true));
    return () => {
      ativo = false;
      cena.current?.parar();
      cena.current = null;
    };
  }, []);

  useEffect(() => {
    const mover = (e: PointerEvent) => cena.current?.apontar((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    window.addEventListener("pointermove", mover);
    return () => window.removeEventListener("pointermove", mover);
  }, []);

  /** Rajada de vento na cena e entra no sistema já com o usuário. */
  const entrar = (destino: Destino, u: Usuario) => {
    if (saindo) return;
    setSaindo(true);
    cena.current?.rajada();
    setTimeout(() => {
      definirUsuario(u);
      aoEntrar(destino, u);
    }, 520);
  };

  // Enter continua com o usuário que já está logado (fora de campos e botões)
  const continuarCom = usuario && !codigo ? usuario : null;
  useEffect(() => {
    if (!continuarCom) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.defaultPrevented) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo?.closest("input, textarea, select, button, a")) return;
      e.preventDefault();
      entrar("inicio", continuarCom);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  const formulario = !continuarCom;
  let conteudo: ReactNode = null;
  if (codigo) {
    conteudo = <PainelCodigo dados={codigo} lojaNome={estado?.loja_nome ?? ""} aoContinuar={() => entrar("inicio", codigo.usuario)} />;
  } else if (estado?.primeiro_acesso) {
    conteudo = <PrimeiroAcesso aoCriar={(u, c) => setCodigo({ usuario: u, codigo: c, motivo: "primeiro" })} />;
  } else if (usuario) {
    conteudo = <Continuar usuario={usuario} aoEntrar={(d) => entrar(d, usuario)} />;
  } else if (estado && recuperando) {
    conteudo = (
      <Recuperar
        estado={estado}
        aoVoltar={() => setRecuperando(false)}
        aoTrocar={(u, c) => {
          setRecuperando(false);
          setCodigo({ usuario: u, codigo: c, motivo: "recuperacao" });
        }}
      />
    );
  } else if (estado) {
    conteudo = <Entrar estado={estado} aviso={auth.aviso} aoEntrar={(u) => entrar("inicio", u)} aoEsquecer={() => setRecuperando(true)} />;
  }

  return (
    <div className={cx("fixed inset-0 overflow-hidden bg-[#0b0c0e] text-white transition-[opacity,transform] duration-500", saindo && "scale-[1.015] opacity-0")}>
      {semAnimacao && <CapaParada />}
      <canvas ref={refGl} className={cx("absolute inset-0 h-full w-full", semAnimacao && "hidden")} aria-hidden="true" />
      <canvas ref={ref2d} className={cx("pointer-events-none absolute inset-0 h-full w-full", semAnimacao && "hidden")} aria-hidden="true" />

      {/* véu escuro à esquerda para o texto, como num cartaz */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(9,10,12,.94) 0%, rgba(9,10,12,.86) 24%, rgba(9,10,12,.55) 40%, rgba(9,10,12,.12) 56%, rgba(9,10,12,0) 66%), linear-gradient(0deg, rgba(9,10,12,.55) 0%, rgba(9,10,12,0) 22%)",
        }}
      />

      <main className="rolagem-fina relative flex h-full max-w-[min(640px,52vw)] min-w-[380px] flex-col overflow-y-auto px-[clamp(28px,5vw,80px)]">
        {/* margens automáticas centralizam quando cabe e deixam rolar quando não cabe */}
        <div className={cx("my-auto flex flex-col", formulario ? "gap-5 py-7" : "gap-7 py-10")}>
          <img
            src={logoSelo}
            alt="TF Pipas"
            className={cx(
              "animate-[subir_.7s_.05s_both] drop-shadow-[0_18px_30px_rgba(0,0,0,.45)] transition-transform duration-500 hover:-rotate-6",
              formulario ? "size-[clamp(72px,9vh,112px)]" : "size-[clamp(92px,11vh,132px)]",
            )}
          />
          <div className="animate-[subir_.7s_.15s_both]">
            <p className="text-[11px] font-bold tracking-[.32em] text-white/60 uppercase">{estado?.loja_nome || "TF Pipas"} · Gestão da loja</p>
            <h1
              className={cx(
                "font-marca mt-2 leading-[.86] font-extrabold italic tracking-[-0.01em]",
                formulario ? "text-[clamp(44px,7.2vh,80px)]" : "text-[clamp(52px,9vh,92px)]",
              )}
            >
              {saudacao(agora)}!
            </h1>
            <p className="mt-3 text-[15px] text-white/75 first-letter:uppercase">
              {dataPorExtenso(agora, true)} · {doisDigitos(agora.getHours())}:{doisDigitos(agora.getMinutes())}
            </p>
          </div>

          <div className="animate-[subir_.7s_.25s_both]">{conteudo}</div>

          <p className="animate-[subir_.7s_.45s_both] text-[12px] leading-relaxed text-white/45">
            <WifiOff className="mr-1.5 inline size-3.5 align-[-2px]" />
            Funciona sem internet · os dados ficam neste computador
            {saude.dados && <span className="text-white/30"> · versão {saude.dados.versao}</span>}
          </p>
        </div>
      </main>

      <p className="pointer-events-none absolute right-6 bottom-5 text-[12px] font-semibold tracking-wide text-white/70 drop-shadow">@tfpipas_</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Peças visuais da capa                                                */
/* ------------------------------------------------------------------ */
function Cartao({ titulo, subtitulo, children }: { titulo?: ReactNode; subtitulo?: ReactNode; children: ReactNode }) {
  return (
    <section className="w-full max-w-[470px] rounded-[22px] border border-white/12 bg-[#0d0f12]/72 p-5 shadow-[0_30px_60px_-30px_rgba(0,0,0,.85)] backdrop-blur-md">
      {titulo && <h2 className="text-[17px] font-extrabold tracking-tight">{titulo}</h2>}
      {subtitulo && <p className="mt-1 text-[13px] leading-relaxed text-white/60">{subtitulo}</p>}
      <div className={cx(titulo || subtitulo ? "mt-4" : "")}>{children}</div>
    </section>
  );
}

function Rotulo({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[12px] font-semibold tracking-wide text-white/70">
      {children}
    </label>
  );
}

function CampoEscuro(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "h-12 w-full rounded-xl border border-white/15 bg-white/[.08] px-4 text-[16px] text-white placeholder:text-white/35 focus:border-white/45 focus:ring-4 focus:ring-white/10 focus:outline-none",
        props.className,
      )}
    />
  );
}

function BotaoPrincipal({ children, carregando, ...resto }: React.ButtonHTMLAttributes<HTMLButtonElement> & { carregando?: boolean }) {
  return (
    <button
      {...resto}
      disabled={resto.disabled || carregando}
      className={cx(
        "group inline-flex h-12 items-center justify-center gap-2.5 rounded-2xl bg-white px-6 text-[15px] font-bold text-tinta shadow-[0_20px_40px_-16px_rgba(0,0,0,.7)] transition-[transform,opacity] hover:-translate-y-0.5 active:translate-y-0 disabled:translate-y-0 disabled:opacity-55",
        resto.className,
      )}
    >
      {carregando ? <span className="size-4 animate-spin rounded-full border-2 border-tinta/25 border-t-tinta" /> : null}
      {children}
    </button>
  );
}

function BotaoVidro({ children, ...resto }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...resto}
      className={cx(
        "inline-flex h-12 items-center gap-2 rounded-2xl border border-white/25 bg-white/5 px-5 text-[14px] font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/12 disabled:opacity-50",
        resto.className,
      )}
    >
      {children}
    </button>
  );
}

function Erro({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mt-3 rounded-xl border border-[#ff8a8a]/35 bg-[#3a0d0f]/60 px-3.5 py-2.5 text-[13px] leading-snug text-[#ffd9d9]">
      {children}
    </p>
  );
}

function Iniciais({ nome, ativo }: { nome: string; ativo?: boolean }) {
  const partes = nome.trim().split(/\s+/);
  const texto = ((partes[0]?.[0] ?? "") + (partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "")).toUpperCase();
  return (
    <span className={cx("grid size-9 shrink-0 place-items-center rounded-xl text-[13px] font-bold", ativo ? "bg-tinta text-white" : "bg-white/12 text-white")}>{texto}</span>
  );
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

/* ------------------------------------------------------------------ */
/* Entrar: escolhe o usuário e digita a senha                           */
/* ------------------------------------------------------------------ */
function Entrar({
  estado,
  aviso,
  aoEntrar,
  aoEsquecer,
}: {
  estado: EstadoAuth;
  aviso: string | null;
  aoEntrar: (u: Usuario) => void;
  aoEsquecer: () => void;
}) {
  const usuarios = estado.usuarios;
  const [escolhido, setEscolhido] = useState<number | null>(() => {
    const ultimo = lerLocal<number | null>(ULTIMO_USUARIO, null);
    if (ultimo && usuarios.some((u) => u.id === ultimo)) return ultimo;
    return usuarios.length === 1 ? usuarios[0]!.id : null;
  });
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const refSenha = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (escolhido) refSenha.current?.focus();
  }, [escolhido]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!escolhido) return setErro("Escolha quem está entrando.");
    if (!senha) {
      setErro("Digite a senha.");
      refSenha.current?.focus();
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const r = await api.post<{ usuario: Usuario }>("/api/auth/entrar", { usuario_id: escolhido, senha });
      gravarLocal(ULTIMO_USUARIO, escolhido);
      aoEntrar(r.usuario);
    } catch (er) {
      setErro(mensagemDeErro(er));
      setSenha("");
      setEnviando(false);
      refSenha.current?.focus();
    }
  }

  const nomeEscolhido = usuarios.find((u) => u.id === escolhido)?.nome;
  return (
    <Cartao titulo="Quem vai usar o sistema?">
      <form onSubmit={enviar} noValidate>
        {aviso && (
          <p role="status" className="mb-3 rounded-xl border border-[#f3b54a]/35 bg-[#3a2808]/55 px-3.5 py-2.5 text-[13px] leading-snug text-[#fde7c0]">
            {aviso}
          </p>
        )}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Usuários">
          {usuarios.map((u) => {
            const ativo = u.id === escolhido;
            return (
              <button
                key={u.id}
                type="button"
                aria-pressed={ativo}
                onClick={() => {
                  setEscolhido(u.id);
                  setErro(null);
                  refSenha.current?.focus();
                }}
                className={cx(
                  "flex min-w-0 items-center gap-2.5 rounded-2xl border py-1.5 pr-4 pl-1.5 text-left transition-colors",
                  ativo ? "border-white bg-white text-tinta" : "border-white/12 bg-white/[.05] text-white/90 hover:bg-white/10",
                )}
              >
                <Iniciais nome={u.nome} ativo={ativo} />
                <span className="min-w-0">
                  <span className="block max-w-[180px] truncate text-[14px] font-bold">{u.nome}</span>
                  <span className={cx("block text-[11px]", ativo ? "text-tinta/60" : "text-white/45")}>
                    {u.perfil === "administrador" ? "Administrador" : "Funcionário"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <Rotulo htmlFor="senha-entrar">{nomeEscolhido ? `Senha de ${nomeEscolhido}` : "Senha"}</Rotulo>
          <CampoSenha
            id="senha-entrar"
            ref={refSenha}
            escuro
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder={escolhido ? "Digite a senha" : "Escolha o usuário acima"}
            disabled={!escolhido}
            autoComplete="current-password"
          />
        </div>
        {erro && <Erro>{erro}</Erro>}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <BotaoPrincipal type="submit" carregando={enviando} disabled={!escolhido}>
            Entrar
            <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
          </BotaoPrincipal>
          <button type="button" onClick={aoEsquecer} className="text-[12.5px] font-semibold text-white/55 underline-offset-4 hover:text-white hover:underline">
            Esqueci a senha
          </button>
        </div>
      </form>
    </Cartao>
  );
}

/* ------------------------------------------------------------------ */
/* Primeiro acesso: cria o administrador                                */
/* ------------------------------------------------------------------ */
function PrimeiroAcesso({ aoCriar }: { aoCriar: (u: Usuario, codigo: string) => void }) {
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (nome.trim().length < 2) return setErro("Digite o seu nome (pelo menos 2 letras).");
    if (senha.length < 4) return setErro("A senha precisa ter pelo menos 4 caracteres (pode ser só números).");
    if (senha !== confirma) return setErro("A confirmação não é igual à senha.");
    setEnviando(true);
    setErro(null);
    try {
      const r = await api.post<{ usuario: Usuario; codigo_recuperacao: string }>("/api/auth/primeiro-acesso", { nome: nome.trim(), senha });
      aoCriar(r.usuario, r.codigo_recuperacao);
    } catch (er) {
      setErro(mensagemDeErro(er));
      setEnviando(false);
    }
  }

  return (
    <Cartao
      titulo="Primeiro acesso: crie o administrador"
      subtitulo="O administrador vê tudo, cadastra os funcionários e escolhe o que cada um pode fazer. Use o nome de quem cuida da loja."
    >
      <form onSubmit={enviar} noValidate className="space-y-3">
        <div>
          <Rotulo htmlFor="pa-nome">Seu nome</Rotulo>
          <CampoEscuro id="pa-nome" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} maxLength={40} placeholder="Como você quer aparecer no sistema" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Rotulo htmlFor="pa-senha">Senha</Rotulo>
            <CampoSenha id="pa-senha" escuro value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo 4" autoComplete="new-password" />
          </div>
          <div>
            <Rotulo htmlFor="pa-confirma">Repita a senha</Rotulo>
            <CampoSenha id="pa-confirma" escuro value={confirma} onChange={(e) => setConfirma(e.target.value)} autoComplete="new-password" />
          </div>
        </div>
        {erro && <Erro>{erro}</Erro>}
        <div className="pt-1">
          <BotaoPrincipal type="submit" carregando={enviando}>
            Criar administrador
            <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
          </BotaoPrincipal>
        </div>
      </form>
    </Cartao>
  );
}

/* ------------------------------------------------------------------ */
/* Esqueci a senha (administrador, com o código de recuperação)         */
/* ------------------------------------------------------------------ */
function formatarCodigo(texto: string): string {
  const limpo = texto.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
  return limpo.replace(/(.{4})(?=.)/g, "$1-");
}

function Recuperar({ estado, aoVoltar, aoTrocar }: { estado: EstadoAuth; aoVoltar: () => void; aoTrocar: (u: Usuario, codigo: string) => void }) {
  const admins = estado.usuarios.filter((u) => u.perfil === "administrador");
  const [alvo, setAlvo] = useState<number | null>(admins.length === 1 ? admins[0]!.id : null);
  const [codigo, setCodigo] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!alvo) return setErro("Escolha o administrador.");
    if (codigo.replace(/-/g, "").length !== 16) return setErro("O código tem 16 letras e números (4 grupos de 4).");
    if (nova.length < 4) return setErro("A nova senha precisa ter pelo menos 4 caracteres.");
    if (nova !== confirma) return setErro("A confirmação não é igual à nova senha.");
    setEnviando(true);
    setErro(null);
    try {
      const r = await api.post<{ usuario: Usuario; codigo_recuperacao: string }>("/api/auth/recuperar", { usuario_id: alvo, codigo, nova_senha: nova });
      gravarLocal(ULTIMO_USUARIO, alvo);
      aoTrocar(r.usuario, r.codigo_recuperacao);
    } catch (er) {
      setErro(er instanceof ErroApi && er.campo === "codigo" ? er.message : mensagemDeErro(er));
      setEnviando(false);
    }
  }

  return (
    <Cartao
      titulo="Esqueci a senha"
      subtitulo="Funcionário: peça ao administrador para trocar a sua senha em Configurações › Usuários. Administrador: use o código de recuperação guardado no primeiro acesso."
    >
      <form onSubmit={enviar} noValidate className="space-y-3">
        {admins.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Administrador">
            {admins.map((u) => (
              <button
                key={u.id}
                type="button"
                aria-pressed={alvo === u.id}
                onClick={() => setAlvo(u.id)}
                className={cx(
                  "rounded-xl border px-3.5 py-2 text-[13.5px] font-bold",
                  alvo === u.id ? "border-white bg-white text-tinta" : "border-white/12 bg-white/[.05] text-white/90 hover:bg-white/10",
                )}
              >
                {u.nome}
              </button>
            ))}
          </div>
        )}
        {admins.length === 1 && (
          <p className="text-[13px] text-white/70">
            Administrador: <b className="text-white">{admins[0]!.nome}</b>
          </p>
        )}
        <div>
          <Rotulo htmlFor="rec-codigo">Código de recuperação</Rotulo>
          <CampoEscuro
            id="rec-codigo"
            autoFocus
            value={codigo}
            onChange={(e) => setCodigo(formatarCodigo(e.target.value))}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            spellCheck={false}
            autoComplete="off"
            className="font-mono tracking-[.12em] uppercase"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Rotulo htmlFor="rec-nova">Nova senha</Rotulo>
            <CampoSenha id="rec-nova" escuro value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Mínimo 4" autoComplete="new-password" />
          </div>
          <div>
            <Rotulo htmlFor="rec-confirma">Repita a nova senha</Rotulo>
            <CampoSenha id="rec-confirma" escuro value={confirma} onChange={(e) => setConfirma(e.target.value)} autoComplete="new-password" />
          </div>
        </div>
        {erro && <Erro>{erro}</Erro>}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <BotaoPrincipal type="submit" carregando={enviando}>
            Trocar a senha e entrar
          </BotaoPrincipal>
          <BotaoVidro onClick={aoVoltar}>
            <ArrowLeft className="size-4" /> Voltar
          </BotaoVidro>
        </div>
      </form>
    </Cartao>
  );
}

/* ------------------------------------------------------------------ */
/* Código de recuperação (aparece uma vez)                              */
/* ------------------------------------------------------------------ */
function PainelCodigo({ dados, lojaNome, aoContinuar }: { dados: CodigoNovo; lojaNome: string; aoContinuar: () => void }) {
  const [anotou, setAnotou] = useState(false);
  const [geradoEm] = useState(() => new Date().toISOString());
  return (
    <Cartao
      titulo={dados.motivo === "primeiro" ? "Guarde o código de recuperação" : "Senha trocada — guarde o novo código"}
      subtitulo={
        dados.motivo === "primeiro"
          ? "Se a senha do administrador for esquecida, só este código permite criar outra. Ele aparece só agora: anote num papel ou imprima, e guarde longe do caixa."
          : "O código antigo deixou de valer. Guarde este no lugar dele: ele aparece só agora."
      }
    >
      <p
        data-testid="codigo-recuperacao"
        className="rounded-2xl border border-white/20 bg-white/[.07] px-4 py-4 text-center font-mono text-[clamp(20px,2.4vw,27px)] font-bold tracking-[.14em] select-all"
      >
        {dados.codigo}
      </p>
      <label className="mt-4 flex cursor-pointer items-start gap-3 text-[13.5px] text-white/85">
        <input type="checkbox" checked={anotou} onChange={(e) => setAnotou(e.target.checked)} className="mt-0.5 size-4.5 accent-white" />
        Anotei (ou imprimi) o código e guardei num lugar seguro.
      </label>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <BotaoPrincipal type="button" disabled={!anotou} onClick={aoContinuar}>
          Entrar no sistema
          <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
        </BotaoPrincipal>
        <BotaoVidro onClick={() => imprimirNoPapel(<FolhaCodigo codigo={dados.codigo} lojaNome={lojaNome} usuario={dados.usuario.nome} geradoEm={geradoEm} />)}>
          <Printer className="size-4" /> Imprimir
        </BotaoVidro>
      </div>
    </Cartao>
  );
}

export function FolhaCodigo({ codigo, lojaNome, usuario, geradoEm }: { codigo: string; lojaNome: string; usuario: string; geradoEm: string }) {
  const linha = { borderTop: "1px dashed #000", margin: "6px 0" } as const;
  return (
    <div style={{ width: "72mm", padding: "4mm 0 6mm", margin: "0 auto", fontFamily: "'Courier New', ui-monospace, monospace", fontSize: "11.5px", color: "#000", lineHeight: 1.4 }}>
      <div style={{ textAlign: "center", fontWeight: 800, fontSize: "1.3em" }}>{lojaNome || "TF Pipas"}</div>
      <div style={{ textAlign: "center", fontWeight: 700 }}>CÓDIGO DE RECUPERAÇÃO</div>
      <div style={linha} />
      <div style={{ textAlign: "center", fontWeight: 800, fontSize: "1.45em", letterSpacing: "0.08em", margin: "8px 0" }}>{codigo}</div>
      <div style={linha} />
      <div>Serve para trocar a senha de um administrador na tela de entrada (Esqueci a senha).</div>
      <div style={{ marginTop: 4 }}>Gerado em {dataHora(geradoEm)} · administrador: {usuario}</div>
      <div style={{ marginTop: 4 }}>Guarde em lugar seguro, longe do caixa. Quando for usado, o sistema gera outro.</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Já logado: resumo do dia e continuar                                 */
/* ------------------------------------------------------------------ */
function Continuar({ usuario, aoEntrar }: { usuario: Usuario; aoEntrar: (destino: Destino) => void }) {
  const painel = useApi<PainelRapido>("/api/painel-rapido");
  const [saindo, setSaindo] = useState(false);
  const p = painel.dados;
  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-2.5">
        {painel.erro ? (
          <Chip tom="erro">Não consegui ler os dados da loja: {painel.erro}</Chip>
        ) : !p ? (
          <Chip tom="neutro">Lendo os dados da loja…</Chip>
        ) : (
          <>
            {p.caixa ? (
              <Chip tom="ok">
                Caixa aberto desde {hora(p.caixa.aberto_em)}
                {p.caixa.operador ? ` por ${p.caixa.operador}` : ""} · {reais(p.caixa.dinheiro_na_gaveta_centavos)} na gaveta
              </Chip>
            ) : (
              <Chip tom="neutro">Caixa fechado — abra na frente de caixa para começar a vender</Chip>
            )}
            <Chip tom="neutro">
              Hoje: {p.vendas.quantidade === 0 ? "nenhuma venda ainda" : `${plural(p.vendas.quantidade, "venda")} · ${reais(p.vendas.total_centavos)}`}
            </Chip>
            {p.alertas_estoque > 0 && <Chip tom="alerta">{plural(p.alertas_estoque, "produto acabando", "produtos acabando")} no estoque</Chip>}
            {p.produtos_ativos === 0 && <Chip tom="alerta">Nenhum produto cadastrado ainda — comece pelo cadastro de produtos</Chip>}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <BotaoPrincipal type="button" onClick={() => aoEntrar("inicio")} className="h-13">
          Continuar como {primeiroNome(usuario.nome)}
          <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
          <kbd className="rounded-md border border-black/15 px-1.5 py-px font-mono text-[10px] text-black/55">Enter</kbd>
        </BotaoPrincipal>
        <BotaoVidro onClick={() => aoEntrar("pdv")} className="h-13">
          <ShoppingBag className="size-4.5" /> Frente de caixa
        </BotaoVidro>
      </div>
      <button
        type="button"
        disabled={saindo}
        onClick={() => {
          setSaindo(true);
          void sair();
        }}
        className="-mt-3 inline-flex w-fit items-center gap-1.5 text-[12.5px] font-semibold text-white/55 underline-offset-4 hover:text-white hover:underline"
      >
        <LogOut className="size-3.5" /> Não é {primeiroNome(usuario.nome)}? Trocar de usuário
      </button>
    </div>
  );
}

function Chip({ tom, children }: { tom: "ok" | "neutro" | "alerta" | "erro"; children: ReactNode }) {
  return (
    <p
      className={cx(
        "inline-flex w-fit max-w-full items-center gap-2.5 rounded-xl border px-3.5 py-2 text-[13px] leading-snug backdrop-blur-sm",
        tom === "ok" && "border-[#5fd39a]/30 bg-[#0f2b1d]/55 text-[#d9f7e6]",
        tom === "neutro" && "border-white/12 bg-white/[.06] text-white/80",
        tom === "alerta" && "border-[#f3b54a]/35 bg-[#3a2808]/55 text-[#fde7c0]",
        tom === "erro" && "border-[#ff8a8a]/35 bg-[#3a0d0f]/60 text-[#ffd9d9]",
      )}
    >
      <span
        className={cx(
          "size-2 shrink-0 rounded-full",
          tom === "ok" && "animate-[pulsar_2.4s_ease-in-out_infinite] bg-[#5fd39a]",
          tom === "neutro" && "bg-white/45",
          tom === "alerta" && "bg-[#f3b54a]",
          tom === "erro" && "bg-[#ff8a8a]",
        )}
      />
      {children}
    </p>
  );
}

/** Capa sem WebGL: a mesma foto, com a pipa balançando por CSS. */
function CapaParada() {
  const [tam, setTam] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const r = () => setTam({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", r);
    return () => window.removeEventListener("resize", r);
  }, []);
  const k = (tam.h / meta.fundo.altura) * 1.045;
  const corte = (meta.fundo.altura - meta.fundo.altura / 1.045) / 2;
  const ox = tam.w - (meta.fundo.largura - corte) * k;
  const oy = (tam.h - meta.fundo.altura * k) * 0.22;
  const px = (meta.pipa.x + meta.extensao) * k + ox;
  const py = meta.pipa.y * k + oy;
  const pivoX = ((meta.pivo[0]! - meta.pipa.x) / meta.pipa.largura) * 100;
  const pivoY = ((meta.pivo[1]! - meta.pipa.y) / meta.pipa.altura) * 100;
  return (
    <div className="absolute inset-0">
      <img src={fundoUrl} alt="" className="absolute max-w-none" style={{ left: ox, top: oy, width: meta.fundo.largura * k, height: meta.fundo.altura * k }} />
      <img
        src={pipaUrl}
        alt=""
        className="absolute max-w-none animate-[balanco_5s_ease-in-out_infinite]"
        style={{ left: px, top: py, width: meta.pipa.largura * k, height: meta.pipa.altura * k, transformOrigin: `${pivoX}% ${pivoY}%` }}
      />
      <style>{`@keyframes balanco{0%,100%{transform:rotate(-2deg) translate(0,0)}50%{transform:rotate(2deg) translate(6px,-5px)}}`}</style>
    </div>
  );
}
