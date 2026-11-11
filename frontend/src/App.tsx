import {
  BarChart3,
  Boxes,
  Factory,
  Home,
  KeyRound,
  Landmark,
  LogOut,
  Receipt,
  Settings,
  ShoppingCart,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import logoSelo from "./assets/logo-selo.svg";
import { carregarEstado, pode, sair, useAuth } from "./auth";
import { Avisos, Confirmacoes } from "./componentes/avisos";
import { MinhaSenha } from "./componentes/minha-senha";
import { Carregando, cx } from "./componentes/ui";
import { dataPorExtenso, doisDigitos, hora, plural, reais } from "./formato";
import { useAgora, useApi } from "./hooks";
import { irPara, lerRota, type Rota } from "./rotas";
import { Capa } from "./telas/Capa";
import type { PainelRapido, Permissao, Saude, Usuario } from "./tipos";

const Inicio = lazy(() => import("./telas/Inicio"));
const Pdv = lazy(() => import("./telas/Pdv"));
const Produtos = lazy(() => import("./telas/Produtos"));
const Producao = lazy(() => import("./telas/Producao"));
const Caixa = lazy(() => import("./telas/Caixa"));
const Vendas = lazy(() => import("./telas/Vendas"));
const Financeiro = lazy(() => import("./telas/Financeiro"));
const Relatorios = lazy(() => import("./telas/Relatorios"));
const Configuracoes = lazy(() => import("./telas/Configuracoes"));

const MENU: Array<{ rota: Rota; rotulo: string; icone: LucideIcon; permissao: Permissao }> = [
  { rota: "inicio", rotulo: "Início", icone: Home, permissao: "financeiro" },
  { rota: "pdv", rotulo: "Frente de caixa", icone: ShoppingCart, permissao: "vender" },
  { rota: "produtos", rotulo: "Produtos e estoque", icone: Boxes, permissao: "produtos" },
  { rota: "producao", rotulo: "Produção", icone: Factory, permissao: "produtos" },
  { rota: "caixa", rotulo: "Controle de caixa", icone: Wallet, permissao: "vender" },
  { rota: "vendas", rotulo: "Vendas", icone: Receipt, permissao: "vender" },
  { rota: "financeiro", rotulo: "Financeiro", icone: Landmark, permissao: "financeiro" },
  { rota: "relatorios", rotulo: "Relatórios", icone: BarChart3, permissao: "financeiro" },
  { rota: "configuracoes", rotulo: "Configurações", icone: Settings, permissao: "administrar" },
];

/** Primeira tela de quem entra: o Início para quem vê os números, a frente de caixa para os outros. */
export function rotaInicial(u: Usuario): Rota {
  return pode(u, "financeiro") ? "inicio" : "pdv";
}

function rotaPermitida(rota: Rota, u: Usuario): boolean {
  const item = MENU.find((m) => m.rota === rota);
  return !!item && pode(u, item.permissao);
}

export default function App() {
  const auth = useAuth();
  const [rota, setRota] = useState<Rota>(lerRota);
  const [naCapa, setNaCapa] = useState(() => sessionStorage.getItem("tfpipas.entrou") !== "1");
  const usuario = auth.estado?.usuario ?? null;

  useEffect(() => {
    void carregarEstado().catch(() => undefined);
    const mudou = () => setRota(lerRota());
    window.addEventListener("hashchange", mudou);
    return () => window.removeEventListener("hashchange", mudou);
  }, []);

  if (!auth.carregado) {
    return (
      <div className="grid h-full place-items-center bg-tinta px-6 text-white/70">
        {auth.erro ? (
          <div className="max-w-md text-center">
            <p className="text-[15px] leading-relaxed text-white/85">{auth.erro}</p>
            <button
              type="button"
              onClick={() => void carregarEstado().catch(() => undefined)}
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-[14px] font-bold text-tinta"
            >
              Tentar de novo
            </button>
          </div>
        ) : (
          <Carregando texto="Abrindo o TF Pipas…" />
        )}
      </div>
    );
  }

  if (!usuario || naCapa) {
    return (
      <>
        <Capa
          aoEntrar={(destino, u) => {
            sessionStorage.setItem("tfpipas.entrou", "1");
            const alvo = destino === "pdv" ? "pdv" : rotaPermitida(rota, u) && rota !== "pdv" ? rota : rotaInicial(u);
            irPara(alvo);
            setRota(alvo);
            setNaCapa(false);
          }}
        />
        <Avisos />
      </>
    );
  }

  // tela sem permissão (ex.: link antigo): vai para a tela inicial do usuário
  const rotaEfetiva = rotaPermitida(rota, usuario) ? rota : rotaInicial(usuario);

  return (
    <div className="flex h-full animate-[aparecer_.35s_ease-out]">
      <MenuLateral
        rota={rotaEfetiva}
        usuario={usuario}
        aoVerCapa={() => setNaCapa(true)}
        aoSair={() => {
          setNaCapa(true);
          void sair();
        }}
      />
      <main className={cx("rolagem-fina min-w-0 flex-1", rotaEfetiva === "pdv" ? "overflow-hidden px-5 py-4" : "overflow-y-auto px-8 py-7")}>
        <div key={rotaEfetiva} className={cx("mx-auto animate-[entrarTela_.25s_ease-out]", rotaEfetiva === "pdv" ? "h-full max-w-[1500px]" : "max-w-[1320px]")}>
          <Suspense fallback={<Carregando />}>
            {rotaEfetiva === "inicio" && <Inicio />}
            {rotaEfetiva === "pdv" && <Pdv />}
            {rotaEfetiva === "produtos" && <Produtos />}
            {rotaEfetiva === "producao" && <Producao />}
            {rotaEfetiva === "caixa" && <Caixa />}
            {rotaEfetiva === "vendas" && <Vendas />}
            {rotaEfetiva === "financeiro" && <Financeiro />}
            {rotaEfetiva === "relatorios" && <Relatorios />}
            {rotaEfetiva === "configuracoes" && <Configuracoes />}
          </Suspense>
        </div>
      </main>
      <Avisos />
      <Confirmacoes />
    </div>
  );
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

function MenuLateral({ rota, usuario, aoVerCapa, aoSair }: { rota: Rota; usuario: Usuario; aoVerCapa: () => void; aoSair: () => void }) {
  const painel = useApi<PainelRapido>("/api/painel-rapido");
  const saude = useApi<Saude>("/api/saude");
  const agora = useAgora(20_000);
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const p = painel.dados;
  const selos: Partial<Record<Rota, { n: number; titulo: string }>> = {
    produtos: p?.alertas_estoque ? { n: p.alertas_estoque, titulo: plural(p.alertas_estoque, "produto acabando", "produtos acabando") } : undefined,
    producao: p?.sugestoes_producao ? { n: p.sugestoes_producao, titulo: plural(p.sugestoes_producao, "produto para produzir", "produtos para produzir") } : undefined,
  };
  const itens = MENU.filter((m) => pode(usuario, m.permissao));
  return (
    <aside className="flex w-[244px] shrink-0 flex-col bg-tinta text-white">
      <button type="button" onClick={aoVerCapa} title="Ver a capa" className="group flex items-center gap-3 px-5 pt-5 pb-4 text-left">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white shadow-[0_10px_24px_-12px_rgba(255,255,255,.35)] transition-transform duration-300 group-hover:-rotate-6">
          <img src={logoSelo} alt="" className="size-[52px]" />
        </span>
        <span>
          <span className="block text-[15px] font-extrabold tracking-[.14em]">TF PIPAS</span>
          <span className="block text-[10.5px] font-semibold tracking-[.18em] text-white/50 uppercase">Gestão da loja</span>
        </span>
      </button>
      <div className="mx-5 h-px bg-white/10" />
      <nav className="rolagem-fina flex-1 overflow-y-auto px-3 py-3">
        <p className="mb-2 px-3 text-[10px] font-bold tracking-[.22em] text-white/40 uppercase">Menu</p>
        <ul className="flex flex-col gap-0.5">
          {itens.map(({ rota: r, rotulo, icone: Icone }) => {
            const ativo = r === rota;
            const selo = selos[r];
            return (
              <li key={r}>
                <a
                  href={`#/${r}`}
                  className={cx(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition-colors",
                    ativo ? "bg-white text-tinta shadow-[0_8px_20px_-12px_rgba(255,255,255,.4)]" : "text-white/72 hover:bg-white/8 hover:text-white",
                  )}
                  aria-current={ativo ? "page" : undefined}
                >
                  <Icone className="size-[18px]" strokeWidth={2.1} />
                  <span className="flex-1">{rotulo}</span>
                  {selo && (
                    <span
                      title={selo.titulo}
                      aria-label={selo.titulo}
                      className={cx("min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-bold tabular-nums", ativo ? "bg-[#c4262c] text-white" : "bg-[#f3b54a] text-tinta")}
                    >
                      {selo.n}
                    </span>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mx-3 mb-2 rounded-2xl bg-white/[.06] p-3.5">
        {painel.erro ? (
          <p className="text-[12px] text-[#ffb3b3]">Sem conexão com o programa da loja.</p>
        ) : (
          <>
            <a href="#/caixa" className="block">
              {p?.caixa ? (
                <>
                  <p className="flex items-center gap-2 text-[12.5px] font-bold text-[#7fe0ad]">
                    <span className="size-2 animate-[pulsar_2.4s_ease-in-out_infinite] rounded-full bg-[#5fd39a]" /> Caixa aberto
                  </p>
                  <p className="mt-1 text-[12px] text-white/60">
                    desde {hora(p.caixa.aberto_em)} · {reais(p.caixa.dinheiro_na_gaveta_centavos)} na gaveta
                  </p>
                </>
              ) : (
                <>
                  <p className="flex items-center gap-2 text-[12.5px] font-bold text-white/80">
                    <span className="size-2 rounded-full bg-white/35" /> Caixa fechado
                  </p>
                  <p className="mt-1 text-[12px] text-white/50">Abra para começar a vender</p>
                </>
              )}
            </a>
            <div className="my-2.5 h-px bg-white/10" />
            <p className="text-[10.5px] font-bold tracking-[.16em] text-white/45 uppercase">Vendas de hoje</p>
            <p className="mt-0.5 text-[19px] leading-tight font-extrabold tabular-nums">{p ? reais(p.vendas.total_centavos) : "—"}</p>
            <p className="text-[11.5px] text-white/50">{p ? plural(p.vendas.quantidade, "venda") : ""}</p>
          </>
        )}
      </div>

      <div className="mx-3 mb-2 flex items-center gap-2.5 rounded-2xl bg-white/[.06] p-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/12 text-[13px] font-bold">{iniciais(usuario.nome)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold">{usuario.nome}</p>
          <p className="truncate text-[11px] text-white/45">{usuario.perfil === "administrador" ? "Administrador" : "Funcionário"}</p>
        </div>
        <button type="button" title="Trocar minha senha" aria-label="Trocar minha senha" onClick={() => setTrocandoSenha(true)} className="rounded-lg p-1.5 text-white/55 hover:bg-white/10 hover:text-white">
          <KeyRound className="size-4" />
        </button>
        <button type="button" title="Sair / trocar de usuário" aria-label="Sair" onClick={aoSair} className="rounded-lg p-1.5 text-white/55 hover:bg-white/10 hover:text-white">
          <LogOut className="size-4" />
        </button>
      </div>
      <p className="mb-3 px-5 text-[10.5px] text-white/30 first-letter:uppercase">
        {dataPorExtenso(agora)} · {doisDigitos(agora.getHours())}:{doisDigitos(agora.getMinutes())} · versão {saude.dados?.versao ?? "—"}
      </p>
      {trocandoSenha && <MinhaSenha aoFechar={() => setTrocandoSenha(false)} />}
    </aside>
  );
}
