import { useMemo, useState } from "react";
import { dataCurta, mesAno, reais } from "../formato";

export interface PontoGrafico {
  chave: string;
  vendas: number;
  receita_centavos: number;
  lucro_bruto_centavos: number;
}

/** Topo do eixo com 4 divisões redondas (ex.: 37 → 40, divisões de 10). */
function teto(v: number): number {
  if (v <= 0) return 100_00;
  const passoBruto = v / 4;
  const exp = Math.pow(10, Math.floor(Math.log10(passoBruto)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * exp >= passoBruto) return m * exp * 4;
  return 40 * exp;
}

function rotuloEixo(centavos: number): string {
  const r = centavos / 100;
  if (r >= 1000) return `R$ ${(r / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `R$ ${r.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

/** Barras de faturamento por dia/mês, com o lucro bruto por dentro. Só dados reais; dias sem venda ficam vazios. */
export function GraficoVendas({ pontos, agrupamento }: { pontos: PontoGrafico[]; agrupamento: "dia" | "mes" }) {
  const [foco, setFoco] = useState<number | null>(null);
  const L = 920;
  const A = 240;
  const m = { e: 64, d: 12, t: 12, b: 28 };
  const max = useMemo(() => teto(Math.max(0, ...pontos.map((p) => p.receita_centavos))), [pontos]);
  const n = Math.max(pontos.length, 1);
  const larguraFaixa = (L - m.e - m.d) / n;
  const larguraBarra = Math.max(2, Math.min(34, larguraFaixa * 0.68));
  const y = (v: number) => m.t + (A - m.t - m.b) * (1 - Math.max(v, 0) / max);
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const passoRotulo = Math.ceil(n / 12);
  const fmt = (chave: string) => (agrupamento === "mes" ? mesAno(chave) : dataCurta(chave));
  const p = foco !== null ? pontos[foco] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${L} ${A}`} className="h-auto w-full" role="img" aria-label="Faturamento e lucro bruto no período">
        {marcas.map((v) => (
          <g key={v}>
            <line x1={m.e} x2={L - m.d} y1={y(v)} y2={y(v)} stroke="#ececE8" strokeWidth={1} />
            <text x={m.e - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#8b8d91">
              {rotuloEixo(v)}
            </text>
          </g>
        ))}
        {pontos.map((pt, i) => {
          const cxBarra = m.e + larguraFaixa * i + larguraFaixa / 2;
          const ativo = foco === i;
          return (
            <g key={pt.chave} onMouseEnter={() => setFoco(i)} onMouseLeave={() => setFoco(null)}>
              <rect x={m.e + larguraFaixa * i} y={m.t} width={larguraFaixa} height={A - m.t - m.b} fill={ativo ? "#f3f3f0" : "transparent"} />
              {pt.receita_centavos > 0 && (
                <rect
                  x={cxBarra - larguraBarra / 2}
                  y={y(pt.receita_centavos)}
                  width={larguraBarra}
                  height={Math.max(1, y(0) - y(pt.receita_centavos))}
                  rx={Math.min(4, larguraBarra / 3)}
                  fill="#9fc2e6"
                />
              )}
              {pt.lucro_bruto_centavos > 0 && (
                <rect
                  x={cxBarra - larguraBarra * 0.28}
                  y={y(pt.lucro_bruto_centavos)}
                  width={larguraBarra * 0.56}
                  height={Math.max(1, y(0) - y(pt.lucro_bruto_centavos))}
                  rx={Math.min(3, larguraBarra / 4)}
                  fill="#0b0c0e"
                />
              )}
              {i % passoRotulo === 0 && (
                <text x={cxBarra} y={A - 8} textAnchor="middle" fontSize={11} fill="#8b8d91">
                  {fmt(pt.chave)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={m.e} x2={L - m.d} y1={y(0)} y2={y(0)} stroke="#cfcfc9" strokeWidth={1} />
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-[12px] text-[#55585e]">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[#9fc2e6]" /> Faturamento
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[#0b0c0e]" /> Lucro bruto (faturamento − custo das mercadorias)
        </span>
      </div>
      {p && (
        <div className="pointer-events-none absolute top-0 right-0 rounded-xl bg-tinta px-3 py-2 text-[12px] text-white shadow-lg">
          <p className="font-semibold">{fmt(p.chave)}</p>
          <p className="tabular-nums">
            {p.vendas} {p.vendas === 1 ? "venda" : "vendas"} · {reais(p.receita_centavos)}
          </p>
          <p className="tabular-nums text-white/70">Lucro bruto {reais(p.lucro_bruto_centavos)}</p>
        </div>
      )}
    </div>
  );
}
