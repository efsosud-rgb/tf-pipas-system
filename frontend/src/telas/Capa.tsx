import { ArrowRight, ShoppingBag, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import fundoUrl from "../assets/capa-fundo.jpg";
import pipaUrl from "../assets/capa-pipa.png";
import meta from "../assets/capa.json";
import logoSelo from "../assets/logo-selo.svg";
import { criarCena, type Cena } from "../capa/cena";
import { cx } from "../componentes/ui";
import { dataPorExtenso, doisDigitos, hora, plural, reais, saudacao } from "../formato";
import { useAgora, useApi } from "../hooks";
import type { PainelInicio, Saude } from "../tipos";

export function Capa({ aoEntrar }: { aoEntrar: (destino: "inicio" | "pdv") => void }) {
  const refGl = useRef<HTMLCanvasElement>(null);
  const ref2d = useRef<HTMLCanvasElement>(null);
  const cena = useRef<Cena | null>(null);
  const [semAnimacao, setSemAnimacao] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const agora = useAgora(1000);
  const painel = useApi<PainelInicio>("/api/inicio");
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

  const entrar = (destino: "inicio" | "pdv") => {
    if (saindo) return;
    setSaindo(true);
    cena.current?.rajada();
    setTimeout(() => aoEntrar(destino), 520);
  };

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        entrar("inicio");
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  const p = painel.dados;
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

      <main className="relative flex h-full max-w-[min(640px,52vw)] min-w-[340px] flex-col justify-center gap-7 px-[clamp(28px,5vw,80px)] py-10">
        <img
          src={logoSelo}
          alt="TF Pipas"
          className="size-[clamp(92px,11vh,132px)] animate-[subir_.7s_.05s_both] drop-shadow-[0_18px_30px_rgba(0,0,0,.45)] transition-transform duration-500 hover:-rotate-6"
        />
        <div className="animate-[subir_.7s_.15s_both]">
          <p className="text-[11px] font-bold tracking-[.32em] text-white/60 uppercase">TF Pipas · Gestão da loja</p>
          <h1 className="font-marca mt-2 text-[clamp(52px,9vh,92px)] leading-[.86] font-extrabold italic tracking-[-0.01em]">
            {saudacao(agora)}!
          </h1>
          <p className="mt-3 text-[15px] text-white/75 first-letter:uppercase">
            {dataPorExtenso(agora, true)} · {doisDigitos(agora.getHours())}:{doisDigitos(agora.getMinutes())}
          </p>
        </div>

        <div className="flex animate-[subir_.7s_.25s_both] flex-col gap-2.5">
          {painel.erro ? (
            <Chip tom="erro">Não consegui ler os dados da loja: {painel.erro}</Chip>
          ) : !p ? (
            <Chip tom="neutro">Lendo os dados da loja…</Chip>
          ) : (
            <>
              {p.caixa.aberto ? (
                <Chip tom="ok">
                  Caixa aberto desde {hora(p.caixa.aberto_em)}
                  {p.caixa.operador ? ` por ${p.caixa.operador}` : ""} · {reais(p.caixa.dinheiro_na_gaveta_centavos)} na gaveta
                </Chip>
              ) : (
                <Chip tom="neutro">Caixa fechado — abra na frente de caixa para começar a vender</Chip>
              )}
              <Chip tom="neutro">
                Hoje: {p.dia.vendas === 0 ? "nenhuma venda ainda" : `${plural(p.dia.vendas, "venda")} · ${reais(p.dia.receita_centavos)}`}
              </Chip>
              {p.produtos_ativos === 0 && <Chip tom="alerta">Nenhum produto cadastrado ainda — comece pelo cadastro de produtos</Chip>}
            </>
          )}
        </div>

        <div className="flex animate-[subir_.7s_.35s_both] flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => entrar("inicio")}
            className="group inline-flex h-13 items-center gap-3 rounded-2xl bg-white px-6 text-[15px] font-bold text-tinta shadow-[0_20px_40px_-16px_rgba(0,0,0,.7)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
          >
            Entrar no sistema
            <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
            <kbd className="rounded-md border border-black/15 px-1.5 py-px font-mono text-[10px] text-black/55">Enter</kbd>
          </button>
          <button
            type="button"
            onClick={() => entrar("pdv")}
            className="inline-flex h-13 items-center gap-2 rounded-2xl border border-white/25 bg-white/5 px-5 text-[14px] font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/12"
          >
            <ShoppingBag className="size-4.5" /> Frente de caixa
          </button>
        </div>

        <p className="animate-[subir_.7s_.45s_both] text-[12px] leading-relaxed text-white/45">
          <WifiOff className="mr-1.5 inline size-3.5 align-[-2px]" />
          Funciona sem internet · os dados ficam neste computador
          {saude.dados && <span className="text-white/30"> · versão {saude.dados.versao}</span>}
        </p>
      </main>

      <p className="pointer-events-none absolute right-6 bottom-5 text-[12px] font-semibold tracking-wide text-white/70 drop-shadow">@tfpipas_</p>
    </div>
  );
}

function Chip({ tom, children }: { tom: "ok" | "neutro" | "alerta" | "erro"; children: React.ReactNode }) {
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
