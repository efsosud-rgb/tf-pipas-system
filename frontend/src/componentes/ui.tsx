import { AlertTriangle, Loader2, RotateCw, X } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { centavosParaTexto, textoParaCentavos } from "../formato";

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/* Botão                                                                */
/* ------------------------------------------------------------------ */
type Variante = "primario" | "secundario" | "perigo" | "fantasma" | "claro" | "sucesso";
type Tamanho = "sm" | "md" | "lg";

const VARIANTES: Record<Variante, string> = {
  primario: "bg-tinta text-white hover:bg-[#23262b] shadow-[0_1px_0_rgba(255,255,255,.08)_inset,0_8px_18px_-10px_rgba(0,0,0,.6)]",
  secundario: "bg-white text-tinta border border-borda hover:border-[#c9c9c3] hover:bg-[#fafaf8]",
  perigo: "bg-perigo text-white hover:bg-[#a82025]",
  sucesso: "bg-sucesso text-white hover:bg-[#0f6a41]",
  fantasma: "text-tinta hover:bg-black/[.05]",
  claro: "bg-white text-tinta hover:bg-[#f1f1ee] shadow-[0_10px_30px_-12px_rgba(0,0,0,.55)]",
};
const TAMANHOS: Record<Tamanho, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-5 text-[15px] gap-2.5 rounded-xl",
};

export interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamanho?: Tamanho;
  icone?: ReactNode;
  carregando?: boolean;
  atalho?: string;
}

export const Botao = forwardRef<HTMLButtonElement, BotaoProps>(function Botao(
  { variante = "primario", tamanho = "md", icone, carregando, atalho, className, children, disabled, type = "button", ...resto },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || carregando}
      className={cx(
        "inline-flex select-none items-center justify-center font-semibold whitespace-nowrap transition-[background,border,transform,box-shadow] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco focus-visible:ring-offset-2",
        VARIANTES[variante],
        TAMANHOS[tamanho],
        className,
      )}
      {...resto}
    >
      {carregando ? <Loader2 className="size-4 animate-spin" /> : icone}
      {children}
      {atalho && (
        <kbd className="ml-1 rounded-md border border-current/25 px-1.5 py-px font-mono text-[10px] font-medium opacity-70">{atalho}</kbd>
      )}
    </button>
  );
});

/* ------------------------------------------------------------------ */
/* Campos                                                               */
/* ------------------------------------------------------------------ */
const ESTILO_CAMPO =
  "w-full rounded-xl border border-borda bg-white px-3 text-[14px] text-tinta placeholder:text-[#a2a39e] transition-[border,box-shadow] focus:border-[#9aa3ad] focus:outline-none focus:ring-4 focus:ring-foco/15 disabled:bg-[#f4f4f1] disabled:text-suave";

export function Campo({
  rotulo,
  dica,
  erro,
  children,
  className,
  htmlFor,
  extra,
}: {
  rotulo?: ReactNode;
  dica?: ReactNode;
  erro?: string | null;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
  extra?: ReactNode;
}) {
  // Sem htmlFor, o próprio <label> envolve o campo (clicar no rótulo foca o campo).
  const Raiz = htmlFor ? "div" : "label";
  return (
    <Raiz className={cx("flex flex-col gap-1.5", className)}>
      {(rotulo || extra) && (
        <span className="flex items-baseline justify-between gap-2">
          {rotulo &&
            (htmlFor ? (
              <label htmlFor={htmlFor} className="text-[12.5px] font-semibold text-[#3d4045]">
                {rotulo}
              </label>
            ) : (
              <span className="text-[12.5px] font-semibold text-[#3d4045]">{rotulo}</span>
            ))}
          {extra}
        </span>
      )}
      {children}
      {erro ? <span className="text-[12.5px] font-medium text-perigo">{erro}</span> : dica ? <span className="text-[12px] text-suave">{dica}</span> : null}
    </Raiz>
  );
}

export const Entrada = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalido?: boolean }>(
  function Entrada({ className, invalido, ...resto }, ref) {
    return <input ref={ref} className={cx(ESTILO_CAMPO, "h-10", invalido && "border-perigo focus:border-perigo", className)} {...resto} />;
  },
);

export const Selecao = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalido?: boolean }>(
  function Selecao({ className, invalido, children, ...resto }, ref) {
    return (
      <select ref={ref} className={cx(ESTILO_CAMPO, "h-10 pr-8", invalido && "border-perigo", className)} {...resto}>
        {children}
      </select>
    );
  },
);

export function AreaTexto({ className, ...resto }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(ESTILO_CAMPO, "min-h-20 py-2.5", className)} {...resto} />;
}

/**
 * Campo de dinheiro: a pessoa digita "12,50" e o componente devolve centavos
 * (ou null se estiver vazio/inválido). Formata ao sair do campo.
 */
export const CampoDinheiro = forwardRef<
  HTMLInputElement,
  {
    valor: number | null;
    aoMudar: (centavos: number | null) => void;
    id?: string;
    placeholder?: string;
    invalido?: boolean;
    autoFocus?: boolean;
    disabled?: boolean;
    className?: string;
    grande?: boolean;
    onKeyDown?: InputHTMLAttributes<HTMLInputElement>["onKeyDown"];
    "aria-label"?: string;
  }
>(function CampoDinheiro({ valor, aoMudar, grande, className, invalido, ...resto }, ref) {
  const [texto, setTexto] = useState(valor === null ? "" : centavosParaTexto(valor));
  const focado = useRef(false);
  useEffect(() => {
    if (!focado.current) setTexto(valor === null ? "" : centavosParaTexto(valor));
  }, [valor]);
  return (
    <div className="relative">
      <span className={cx("pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-medium text-suave", grande ? "text-base" : "text-[13px]")}>
        R$
      </span>
      <input
        ref={ref}
        inputMode="decimal"
        autoComplete="off"
        className={cx(
          ESTILO_CAMPO,
          "pl-9 text-right tabular-nums",
          grande ? "h-12 text-lg font-semibold" : "h-10",
          invalido && "border-perigo",
          className,
        )}
        value={texto}
        onFocus={(e) => {
          focado.current = true;
          e.currentTarget.select();
        }}
        onBlur={() => {
          focado.current = false;
          const c = textoParaCentavos(texto);
          setTexto(c === null ? "" : centavosParaTexto(c));
        }}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d,.\s]/g, "");
          setTexto(t);
          aoMudar(textoParaCentavos(t));
        }}
        {...resto}
      />
    </div>
  );
});

export function Interruptor({
  ligado,
  aoMudar,
  rotulo,
  descricao,
  disabled,
}: {
  ligado: boolean;
  aoMudar: (v: boolean) => void;
  rotulo: ReactNode;
  descricao?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={cx("flex cursor-pointer items-start gap-3", disabled && "cursor-not-allowed opacity-50")}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={ligado}
        disabled={disabled}
        onClick={() => aoMudar(!ligado)}
        className={cx(
          "relative mt-0.5 inline-flex h-6 w-10 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco focus-visible:ring-offset-2",
          ligado ? "bg-tinta" : "bg-[#d7d7d2]",
        )}
      >
        <span className={cx("absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform", ligado && "translate-x-4")} />
      </button>
      <span className="flex flex-col">
        <span className="text-sm font-semibold text-tinta">{rotulo}</span>
        {descricao && <span className="text-[12.5px] text-suave">{descricao}</span>}
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Estrutura                                                            */
/* ------------------------------------------------------------------ */
export function Cartao({
  titulo,
  rotulo,
  acoes,
  children,
  className,
  corpo = true,
}: {
  titulo?: ReactNode;
  rotulo?: ReactNode;
  acoes?: ReactNode;
  children?: ReactNode;
  className?: string;
  corpo?: boolean;
}) {
  return (
    <section className={cx("rounded-[18px] border border-borda/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,.04),0_12px_32px_-24px_rgba(0,0,0,.35)]", className)}>
      {(titulo || rotulo || acoes) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4">
          <div>
            {rotulo && <p className="rotulo">{rotulo}</p>}
            {titulo && <h3 className="mt-0.5 text-[17px] font-bold tracking-tight text-tinta">{titulo}</h3>}
          </div>
          {acoes && <div className="flex shrink-0 items-center gap-2">{acoes}</div>}
        </header>
      )}
      {corpo ? <div className="p-5">{children}</div> : children}
    </section>
  );
}

export function Kpi({
  rotulo,
  valor,
  dica,
  tom = "neutro",
  icone,
}: {
  rotulo: ReactNode;
  valor: ReactNode;
  dica?: ReactNode;
  tom?: "neutro" | "bom" | "ruim" | "alerta";
  icone?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-[16px] border border-borda/80 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,.04)]">
      <div className="flex items-center justify-between gap-2">
        <p className="rotulo truncate">{rotulo}</p>
        {icone && <span className="text-suave">{icone}</span>}
      </div>
      <p
        className={cx(
          "truncate text-[22px] leading-none font-extrabold tracking-tight tabular-nums",
          tom === "bom" && "text-sucesso",
          tom === "ruim" && "text-perigo",
          tom === "alerta" && "text-alerta",
          tom === "neutro" && "text-tinta",
        )}
      >
        {valor}
      </p>
      {dica && <p className="truncate text-[12px] text-suave">{dica}</p>}
    </div>
  );
}

type Tom = "neutro" | "ok" | "alerta" | "perigo" | "info" | "escuro";
const TONS: Record<Tom, string> = {
  neutro: "bg-[#efefec] text-[#4a4d52]",
  ok: "bg-[#e3f4ea] text-[#12663f]",
  alerta: "bg-[#fdf1dc] text-[#8a5300]",
  perigo: "bg-[#fde6e6] text-[#a3191e]",
  info: "bg-[#e5f0fb] text-[#1d5c9a]",
  escuro: "bg-tinta text-white",
};

export function Etiqueta({ tom = "neutro", children, ponto }: { tom?: Tom; children: ReactNode; ponto?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap", TONS[tom])}>
      {ponto && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Vazio({ icone, titulo, texto, acao }: { icone?: ReactNode; titulo: ReactNode; texto?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icone && <div className="mb-1 grid size-12 place-items-center rounded-2xl bg-[#f1f1ee] text-[#55585e]">{icone}</div>}
      <p className="text-[15px] font-bold text-tinta">{titulo}</p>
      {texto && <p className="max-w-sm text-[13px] text-suave">{texto}</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-suave">
      <Loader2 className="size-4 animate-spin" /> {texto}
    </div>
  );
}

export function AvisoErro({ mensagem, aoTentar }: { mensagem: string; aoTentar?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-[#f3c2c2] bg-[#fff5f5] px-4 py-3 text-[13.5px] text-[#8f1d21]">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <p className="flex-1">{mensagem}</p>
      {aoTentar && (
        <button type="button" onClick={aoTentar} className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
          <RotateCw className="size-3.5" /> Tentar de novo
        </button>
      )}
    </div>
  );
}

export function Abas<T extends string>({
  abas,
  ativa,
  aoMudar,
}: {
  abas: Array<{ id: T; rotulo: ReactNode; contagem?: number }>;
  ativa: T;
  aoMudar: (id: T) => void;
}) {
  return (
    <div role="tablist" className="inline-flex flex-wrap gap-1 rounded-2xl border border-borda/80 bg-[#e9e9e5] p-1">
      {abas.map((a) => (
        <button
          key={a.id}
          role="tab"
          type="button"
          aria-selected={a.id === ativa}
          onClick={() => aoMudar(a.id)}
          className={cx(
            "inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
            a.id === ativa ? "bg-white text-tinta shadow-[0_1px_3px_rgba(0,0,0,.12)]" : "text-[#5f6268] hover:text-tinta",
          )}
        >
          {a.rotulo}
          {a.contagem !== undefined && a.contagem > 0 && (
            <span className={cx("rounded-full px-1.5 text-[11px] tabular-nums", a.id === ativa ? "bg-tinta text-white" : "bg-black/10")}>{a.contagem}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Janela (modal) e gaveta lateral                                      */
/* ------------------------------------------------------------------ */
export function Modal({
  aberto,
  aoFechar,
  titulo,
  subtitulo,
  children,
  rodape,
  largura = "md",
  lado = false,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: "sm" | "md" | "lg" | "xl";
  /** Abre como gaveta à direita. */
  lado?: boolean;
}) {
  const painel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement as HTMLElement | null;
    const ouvir = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        aoFechar();
      }
    };
    window.addEventListener("keydown", ouvir, true);
    // foca o primeiro campo (ou o painel)
    requestAnimationFrame(() => {
      const alvo = painel.current?.querySelector<HTMLElement>("[data-foco-inicial], input:not([type=hidden]):not([disabled]), select, textarea");
      (alvo ?? painel.current)?.focus();
    });
    return () => {
      window.removeEventListener("keydown", ouvir, true);
      anterior?.focus?.();
    };
  }, [aberto, aoFechar]);
  if (!aberto) return null;
  const larguras = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" };
  return createPortal(
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-[aparecer_.15s_ease-out] bg-[#0b0c0e]/45 backdrop-blur-[2px]" onClick={aoFechar} />
      <div
        ref={painel}
        tabIndex={-1}
        className={cx(
          "relative flex max-h-full w-full flex-col bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,.45)] outline-none",
          lado
            ? cx("ml-auto h-full animate-[entrarLado_.2s_cubic-bezier(.2,.8,.2,1)]", larguras[largura])
            : cx("m-auto max-h-[92vh] animate-[entrarModal_.18s_cubic-bezier(.2,.8,.2,1)] rounded-[22px]", larguras[largura]),
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-borda/70 px-6 pt-5 pb-4">
          <div className="min-w-0">
            <h2 className="text-[19px] font-extrabold tracking-tight text-tinta">{titulo}</h2>
            {subtitulo && <p className="mt-0.5 text-[13px] text-suave">{subtitulo}</p>}
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="-mr-2 rounded-xl p-2 text-suave hover:bg-black/5 hover:text-tinta">
            <X className="size-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {rodape && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-borda/70 px-6 py-4">{rodape}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function Cabecalho({
  rotulo,
  titulo,
  descricao,
  acoes,
}: {
  rotulo: ReactNode;
  titulo: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="rotulo">{rotulo}</p>
        <h1 className="mt-1 text-[30px] leading-[1.05] font-black tracking-[-0.035em] text-tinta">{titulo}</h1>
        {descricao && <p className="mt-1.5 max-w-2xl text-[13.5px] text-suave">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}

/** Linha "rótulo ........ valor" usada em resumos. */
export function Linha({ rotulo, valor, forte, tom, recuo }: { rotulo: ReactNode; valor: ReactNode; forte?: boolean; tom?: "bom" | "ruim"; recuo?: boolean }) {
  return (
    <div className={cx("flex items-baseline justify-between gap-4 py-1.5", forte && "font-bold", recuo && "pl-4 text-[13px] text-[#55585e]")}>
      <span className={cx(!forte && !recuo && "text-[#3d4045]")}>{rotulo}</span>
      <span className={cx("tabular-nums", tom === "bom" && "text-sucesso", tom === "ruim" && "text-perigo")}>{valor}</span>
    </div>
  );
}
