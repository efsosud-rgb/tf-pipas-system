import {
  BarChart3,
  Boxes,
  Home,
  Landmark,
  Receipt,
  Settings,
  ShoppingCart,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import logoSelo from "./assets/logo-selo.svg";
import { Avisos, Confirmacoes } from "./componentes/avisos";
import { Carregando, cx } from "./componentes/ui";
import { dataPorExtenso, doisDigitos, hora, reais } from "./formato";
import { useAgora, useApi } from "./hooks";
import { Capa } from "./telas/Capa";
import type { ResumoCaixa, Saude } from "./tipos";
import { irPara, lerRota, type Rota } from "./rotas";

const Inicio = lazy(() => import("./telas/Inicio"));
const Pdv = lazy(() => import("./telas/Pdv"));
const Produtos = lazy(() => import("./telas/Produtos"));
const Caixa = lazy(() => import("./telas/Caixa"));
const Vendas = lazy(() => import("./telas/Vendas"));
const Financeiro = lazy(() => import("./telas/Financeiro"));
const Relatorios = lazy(() => import("./telas/Relatorios"));
const Configuracoes = lazy(() => import("./telas/Configuracoes"));

const MENU: Array<{ rota: Rota; rotulo: string; icone: LucideIcon; atalho?: string }> = [
  { rota: "inicio", rotulo: "Início", icone: Home },
  { rota: "pdv", rotulo: "Frente de caixa", icone: ShoppingCart },
  { rota: "produtos", rotulo: "Produtos e estoque", icone: Boxes },
  { rota: "caixa", rotulo: "Controle de caixa", icone: Wallet },
  { rota: "vendas", rotulo: "Vendas", icone: Receipt },
  { rota: "financeiro", rotulo: "Financeiro", icone: Landmark },
  { rota: "relatorios", rotulo: "Relatórios", icone: BarChart3 },
  { rota: "configuracoes", rotulo: "Configurações", icone: Settings },
];

export default function App() {
  const [naCapa, setNaCapa] = useState(() => sessionStorage.getItem("tfpipas.entrou") !== "1");
  const [rota, setRota] = useState<Rota>(lerRota);

  useEffect(() => {
    const mudou = () => setRota(lerRota());
    window.addEventListener("hashchange", mudou);
    return () => window.removeEventListener("hashchange", mudou);
  }, []);

  if (naCapa) {
    return (
      <>
        <Capa
          aoEntrar={(destino) => {
            sessionStorage.setItem("tfpipas.entrou", "1");
            irPara(destino);
            setRota(destino);
            setNaCapa(false);
          }}
        />
        <Avisos />
      </>
    );
  }

  return (
    <div className="flex h-full animate-[aparecer_.35s_ease-out]">
      <MenuLateral rota={rota} aoVerCapa={() => setNaCapa(true)} />
      <main className={cx("rolagem-fina min-w-0 flex-1", rota === "pdv" ? "overflow-hidden px-5 py-4" : "overflow-y-auto px-8 py-7")}>
        <div key={rota} className={cx("mx-auto animate-[entrarTela_.25s_ease-out]", rota === "pdv" ? "h-full max-w-[1500px]" : "max-w-[1320px]")}>
          <Suspense fallback={<Carregando />}>
            {rota === "inicio" && <Inicio />}
            {rota === "pdv" && <Pdv />}
            {rota === "produtos" && <Produtos />}
            {rota === "caixa" && <Caixa />}
            {rota === "vendas" && <Vendas />}
            {rota === "financeiro" && <Financeiro />}
            {rota === "relatorios" && <Relatorios />}
            {rota === "configuracoes" && <Configuracoes />}
          </Suspense>
        </div>
      </main>
      <Avisos />
      <Confirmacoes />
    </div>
  );
}

function MenuLateral({ rota, aoVerCapa }: { rota: Rota; aoVerCapa: () => void }) {
  const caixa = useApi<{ caixa: ResumoCaixa | null }>("/api/caixa/atual");
  const saude = useApi<Saude>("/api/saude");
  const agora = useAgora(20_000);
  const aberto = caixa.dados?.caixa ?? null;
  return (
    <aside className="flex w-[244px] shrink-0 flex-col bg-tinta text-white">
      <button type="button" onClick={aoVerCapa} title="Ver a capa" className="group flex items-center gap-3 px-5 pt-6 pb-5 text-left">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white shadow-[0_10px_24px_-12px_rgba(255,255,255,.35)] transition-transform duration-300 group-hover:-rotate-6">
          <img src={logoSelo} alt="" className="size-[52px]" />
        </span>
        <span>
          <span className="block text-[15px] font-extrabold tracking-[.14em]">TF PIPAS</span>
          <span className="block text-[10.5px] font-semibold tracking-[.18em] text-white/50 uppercase">Gestão da loja</span>
        </span>
      </button>
      <div className="mx-5 h-px bg-white/10" />
      <nav className="rolagem-fina flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-3 text-[10px] font-bold tracking-[.22em] text-white/40 uppercase">Menu</p>
        <ul className="flex flex-col gap-0.5">
          {MENU.map(({ rota: r, rotulo, icone: Icone }) => {
            const ativo = r === rota;
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
                  {rotulo}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="mx-3 mb-3 rounded-2xl bg-white/[.06] p-3.5">
        {caixa.erro ? (
          <p className="text-[12px] text-[#ffb3b3]">Sem conexão com o programa da loja.</p>
        ) : aberto ? (
          <a href="#/caixa" className="block">
            <p className="flex items-center gap-2 text-[12.5px] font-bold text-[#7fe0ad]">
              <span className="size-2 animate-[pulsar_2.4s_ease-in-out_infinite] rounded-full bg-[#5fd39a]" /> Caixa aberto
            </p>
            <p className="mt-1 text-[12px] text-white/60">
              desde {hora(aberto.sessao.aberto_em)} · {reais(aberto.gaveta.esperado_centavos)} na gaveta
            </p>
          </a>
        ) : (
          <a href="#/caixa" className="block">
            <p className="flex items-center gap-2 text-[12.5px] font-bold text-white/80">
              <span className="size-2 rounded-full bg-white/35" /> Caixa fechado
            </p>
            <p className="mt-1 text-[12px] text-white/50">Abra para começar a vender</p>
          </a>
        )}
        <div className="my-3 h-px bg-white/10" />
        <p className="text-[11.5px] text-white/45 first-letter:uppercase">
          {dataPorExtenso(agora)} · {doisDigitos(agora.getHours())}:{doisDigitos(agora.getMinutes())}
        </p>
        <p className="mt-0.5 text-[11px] text-white/30">Sem internet · versão {saude.dados?.versao ?? "—"}</p>
      </div>
    </aside>
  );
}
