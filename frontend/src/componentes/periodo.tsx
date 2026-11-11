import { useState } from "react";
import { hojeLocal, primeiroDiaDoMes, somarDias, somarMeses, ultimoDiaDoMes } from "../formato";
import { Botao, cx } from "./ui";

export interface Periodo {
  de: string;
  ate: string;
}

export function periodoDoMes(d = hojeLocal()): Periodo {
  return { de: primeiroDiaDoMes(d), ate: ultimoDiaDoMes(d) };
}

const ATALHOS: Array<{ id: string; rotulo: string; calcular: () => Periodo }> = [
  { id: "hoje", rotulo: "Hoje", calcular: () => ({ de: hojeLocal(), ate: hojeLocal() }) },
  { id: "7d", rotulo: "7 dias", calcular: () => ({ de: somarDias(hojeLocal(), -6), ate: hojeLocal() }) },
  { id: "mes", rotulo: "Este mês", calcular: () => periodoDoMes() },
  {
    id: "mes-passado",
    rotulo: "Mês passado",
    calcular: () => periodoDoMes(somarMeses(primeiroDiaDoMes(hojeLocal()), -1)),
  },
  { id: "ano", rotulo: "Este ano", calcular: () => ({ de: `${hojeLocal().slice(0, 4)}-01-01`, ate: `${hojeLocal().slice(0, 4)}-12-31` }) },
];

/** Escolha de período: atalhos + datas livres. Só aplica ao clicar (ou no atalho). */
export function FiltroPeriodo({ valor, aoMudar }: { valor: Periodo; aoMudar: (p: Periodo) => void }) {
  const [rascunho, setRascunho] = useState(valor);
  const [mostrado, setMostrado] = useState(valor);
  if (mostrado.de !== valor.de || mostrado.ate !== valor.ate) {
    setMostrado(valor);
    setRascunho(valor);
  }
  const ativo = ATALHOS.find((a) => {
    const p = a.calcular();
    return p.de === valor.de && p.ate === valor.ate;
  })?.id;
  const invalido = !rascunho.de || !rascunho.ate || rascunho.de > rascunho.ate;
  const mudou = rascunho.de !== valor.de || rascunho.ate !== valor.ate;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[18px] border border-borda/80 bg-white p-2 shadow-[0_1px_2px_rgba(0,0,0,.04)]">
      <div className="flex flex-wrap gap-1">
        {ATALHOS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => aoMudar(a.calcular())}
            className={cx(
              "rounded-xl px-3 py-1.5 text-[13px] font-semibold transition-colors",
              ativo === a.id ? "bg-tinta text-white" : "text-[#4a4d52] hover:bg-black/5",
            )}
          >
            {a.rotulo}
          </button>
        ))}
      </div>
      <div className="mx-1 hidden h-6 w-px bg-borda sm:block" />
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalido) aoMudar(rascunho);
        }}
      >
        <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#4a4d52]">
          De
          <input
            type="date"
            value={rascunho.de}
            onChange={(e) => setRascunho({ ...rascunho, de: e.target.value })}
            className="h-9 rounded-xl border border-borda px-2.5 text-[13px] focus:border-[#9aa3ad] focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#4a4d52]">
          Até
          <input
            type="date"
            value={rascunho.ate}
            onChange={(e) => setRascunho({ ...rascunho, ate: e.target.value })}
            className="h-9 rounded-xl border border-borda px-2.5 text-[13px] focus:border-[#9aa3ad] focus:outline-none"
          />
        </label>
        <Botao type="submit" tamanho="sm" variante={mudou ? "primario" : "secundario"} disabled={invalido || !mudou}>
          Aplicar
        </Botao>
      </form>
    </div>
  );
}
