import { CheckCircle2, Info, XCircle } from "lucide-react";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Botao, Campo, Entrada, Modal } from "./ui";

/* ------------------------------------------------------------------ */
/* Avisos rápidos (canto da tela)                                       */
/* ------------------------------------------------------------------ */
type TipoAviso = "sucesso" | "erro" | "info";
interface Aviso {
  id: number;
  tipo: TipoAviso;
  texto: string;
}
let avisos: Aviso[] = [];
let proximo = 1;
const ouvintes = new Set<() => void>();
const emitir = () => ouvintes.forEach((f) => f());

export function avisar(texto: string, tipo: TipoAviso = "sucesso"): void {
  const id = proximo++;
  avisos = [...avisos, { id, tipo, texto }].slice(-4);
  emitir();
  setTimeout(() => {
    avisos = avisos.filter((a) => a.id !== id);
    emitir();
  }, tipo === "erro" ? 7000 : 3800);
}

export function Avisos() {
  const lista = useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => avisos,
  );
  return (
    <div className="pointer-events-none fixed top-4 right-5 z-[60] flex w-[360px] flex-col gap-2" aria-live="polite">
      {lista.map((a) => (
        <div
          key={a.id}
          className="pointer-events-auto flex animate-[entrarAviso_.22s_cubic-bezier(.2,.8,.2,1)] items-start gap-3 rounded-2xl bg-tinta px-4 py-3 text-[13.5px] text-white shadow-[0_18px_40px_-14px_rgba(0,0,0,.6)]"
        >
          {a.tipo === "sucesso" && <CheckCircle2 className="mt-px size-4 shrink-0 text-[#5fd39a]" />}
          {a.tipo === "erro" && <XCircle className="mt-px size-4 shrink-0 text-[#ff8a8a]" />}
          {a.tipo === "info" && <Info className="mt-px size-4 shrink-0 text-[#8cc4ff]" />}
          <p className="leading-snug">{a.texto}</p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Confirmação (substitui o confirm() do navegador)                     */
/* ------------------------------------------------------------------ */
interface PedidoConfirmacao {
  titulo: string;
  texto: ReactNode;
  confirmar: string;
  /** Texto do botão de voltar (padrão: "Voltar"). */
  cancelar?: string;
  perigo?: boolean;
  /** Pede um texto (ex.: motivo do cancelamento). */
  pedirTexto?: { rotulo: string; placeholder?: string; minimo?: number };
  resolver: (r: { ok: boolean; texto: string }) => void;
  id: number;
}
let pedido: PedidoConfirmacao | null = null;
const ouvintesC = new Set<() => void>();

let proximoPedido = 1;
export function confirmar(opcoes: Omit<PedidoConfirmacao, "resolver" | "id">): Promise<{ ok: boolean; texto: string }> {
  return new Promise((resolver) => {
    pedido = { ...opcoes, resolver, id: proximoPedido++ };
    ouvintesC.forEach((f) => f());
  });
}

export function Confirmacoes() {
  const atual = useSyncExternalStore(
    (f) => {
      ouvintesC.add(f);
      return () => ouvintesC.delete(f);
    },
    () => pedido,
  );
  if (!atual) return null;
  return <Dialogo key={atual.id} pedido={atual} />;
}

function Dialogo({ pedido: atual }: { pedido: PedidoConfirmacao }) {
  const [texto, setTexto] = useState("");
  const fechar = (ok: boolean) => {
    atual.resolver({ ok, texto: texto.trim() });
    pedido = null;
    ouvintesC.forEach((f) => f());
  };
  const minimo = atual.pedirTexto?.minimo ?? 0;
  const podeConfirmar = !atual.pedirTexto || texto.trim().length >= minimo;
  return (
    <Modal
      aberto
      aoFechar={() => fechar(false)}
      titulo={atual.titulo}
      largura="sm"
      rodape={
        <>
          <Botao variante="secundario" onClick={() => fechar(false)}>
            {atual.cancelar ?? "Voltar"}
          </Botao>
          <Botao variante={atual.perigo ? "perigo" : "primario"} disabled={!podeConfirmar} onClick={() => fechar(true)} data-foco-inicial={atual.pedirTexto ? undefined : true}>
            {atual.confirmar}
          </Botao>
        </>
      }
    >
      <div className="space-y-4 text-[14px] text-[#3d4045]">
        <div>{atual.texto}</div>
        {atual.pedirTexto && (
          <Campo rotulo={atual.pedirTexto.rotulo}>
            <Entrada
              value={texto}
              placeholder={atual.pedirTexto.placeholder}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && podeConfirmar) fechar(true);
              }}
              maxLength={200}
            />
          </Campo>
        )}
      </div>
    </Modal>
  );
}
