import { useMemo, useState, type KeyboardEvent } from "react";
import { data, dataCurta, mesAno, porcento, reais } from "../formato";
import type { DiaDoFluxo, ResultadoDoMes } from "../tipos";

/*
 * Gráficos do financeiro. Só desenham números que vieram do servidor; dia ou
 * mês sem movimento fica no zero. Cores (validadas para daltonismo sobre o
 * fundo branco): azul #2a78d6 para a série principal / lucro, vermelho
 * #e34948 para prejuízo. Grade e eixo em cinza fino, nunca tracejados.
 */
const AZUL = "#2a78d6";
const VERMELHO = "#e34948";
const GRADE = "#ececE8";
const BASE = "#c3c2b7";
const TEXTO_EIXO = "#8b8d91";

function passoBonito(bruto: number): number {
  const exp = Math.pow(10, Math.floor(Math.log10(bruto)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * exp >= bruto) return m * exp;
  return 10 * exp;
}

/** Eixo com marcas redondas que sempre inclui o zero (valores podem ser negativos). */
function escala(valores: number[], divisoes = 4): { ini: number; fim: number; marcas: number[] } {
  let min = Math.min(0, ...valores);
  let max = Math.max(0, ...valores);
  if (min === max) max = min + 100_00;
  const passo = passoBonito((max - min) / divisoes);
  const ini = Math.floor(min / passo) * passo;
  const fim = Math.ceil(max / passo) * passo;
  const marcas: number[] = [];
  for (let v = ini; v <= fim + passo / 2; v += passo) marcas.push(Math.round(v));
  return { ini, fim, marcas };
}

function rotuloEixo(centavos: number): string {
  const sinal = centavos < 0 ? "−" : "";
  const r = Math.abs(centavos) / 100;
  if (r >= 1000) return `${sinal}R$ ${(r / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `${sinal}R$ ${r.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

function reaisComSinal(centavos: number): string {
  return centavos < 0 ? `−${reais(-centavos)}` : reais(centavos);
}

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
function diaComSemana(aaaammdd: string): string {
  const [a, m, d] = aaaammdd.split("-").map(Number);
  return `${DIAS_SEMANA[new Date(a!, m! - 1, d!).getDay()]}, ${data(aaaammdd).slice(0, 5)}`;
}

function Dica({ x, largura, children }: { x: number; largura: number; children: React.ReactNode }) {
  const pct = (x / largura) * 100;
  const direita = pct > 58;
  return (
    <div
      className="pointer-events-none absolute top-1 z-10 min-w-[190px] rounded-xl bg-tinta px-3 py-2 text-[12px] leading-relaxed text-white shadow-lg"
      style={direita ? { right: `${100 - pct + 1.5}%` } : { left: `${pct + 1.5}%` }}
      role="status"
    >
      {children}
    </div>
  );
}

function LinhaDica({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <p className="flex justify-between gap-4">
      <span className="text-white/65">{rotulo}</span>
      <span className={forte ? "font-bold tabular-nums" : "tabular-nums"}>{valor}</span>
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Saldo acumulado dia a dia (realizado + previsto)                     */
/* ------------------------------------------------------------------ */
export function GraficoSaldo({ dias, hoje }: { dias: DiaDoFluxo[]; hoje: string }) {
  const [foco, setFoco] = useState<number | null>(null);
  const L = 920;
  const A = 250;
  const m = { e: 72, d: 104, t: 18, b: 30 };
  const n = Math.max(dias.length, 1);
  const faixa = (L - m.e - m.d) / n;
  const x = (i: number) => m.e + faixa * i + faixa / 2;

  // índice do último dia realizado (hoje ou antes)
  const ultimoReal = dias.reduce((acc, d, i) => (d.data <= hoje ? i : acc), -1);
  const valorDoDia = (i: number) => (i <= ultimoReal ? dias[i]!.acumulado_centavos : dias[i]!.acumulado_previsto_centavos);
  const temPrevisao = ultimoReal < dias.length - 1;

  const { ini, fim, marcas } = escala(dias.map((_, i) => valorDoDia(i)));
  const y = (v: number) => m.t + (A - m.t - m.b) * (1 - (v - ini) / (fim - ini));

  const caminho = (indices: number[]) => indices.map((i, k) => `${k === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(valorDoDia(i)).toFixed(1)}`).join(" ");
  const real = dias.map((_, i) => i).filter((i) => i <= ultimoReal);
  // a previsão começa no último ponto realizado (ou no primeiro dia, se o período é todo futuro)
  const previsto = temPrevisao ? dias.map((_, i) => i).filter((i) => i >= Math.max(ultimoReal, 0)) : [];
  const passoRotulo = Math.ceil(n / 10);
  // o rótulo "hoje" tem prioridade: a data vizinha some para não encavalar
  const indiceHoje = dias.findIndex((d) => d.data === hoje);
  const fimReal = ultimoReal >= 0 ? ultimoReal : null;
  const fimPrev = temPrevisao ? dias.length - 1 : null;

  function apontar(e: React.PointerEvent<SVGRectElement>) {
    const caixa = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = ((e.clientX - caixa.left) / caixa.width) * L;
    setFoco(Math.min(n - 1, Math.max(0, Math.floor((px - m.e) / faixa))));
  }
  function teclado(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key === "ArrowRight") setFoco((f) => Math.min(n - 1, (f ?? -1) + 1));
    else if (e.key === "ArrowLeft") setFoco((f) => Math.max(0, (f ?? n) - 1));
    else if (e.key === "Escape") setFoco(null);
  }

  const d = foco !== null ? dias[foco] : null;
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${L} ${A}`}
        className="h-auto w-full outline-none focus-visible:ring-2 focus-visible:ring-foco/40"
        role="img"
        aria-label="Saldo acumulado do período, dia a dia. Use as setas para percorrer os dias; os valores também estão na tabela abaixo."
        tabIndex={0}
        onKeyDown={teclado}
        onBlur={() => setFoco(null)}
      >
        {marcas.map((v) => (
          <g key={v}>
            <line x1={m.e} x2={L - m.d} y1={y(v)} y2={y(v)} stroke={v === 0 ? BASE : GRADE} strokeWidth={1} />
            <text x={m.e - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill={TEXTO_EIXO} style={{ fontVariantNumeric: "tabular-nums" }}>
              {rotuloEixo(v)}
            </text>
          </g>
        ))}
        {dias.map((dia, i) =>
          dia.data === hoje || (i % passoRotulo === 0 && (indiceHoje < 0 || Math.abs(i - indiceHoje) >= Math.max(1, Math.ceil(passoRotulo / 2)))) ? (
            <text
              key={dia.data}
              x={x(i)}
              y={A - 9}
              textAnchor="middle"
              fontSize={11}
              fill={dia.data === hoje ? "#0b0c0e" : TEXTO_EIXO}
              fontWeight={dia.data === hoje ? 700 : 400}
            >
              {dia.data === hoje ? "hoje" : dataCurta(dia.data)}
            </text>
          ) : null,
        )}
        {foco !== null && <line x1={x(foco)} x2={x(foco)} y1={m.t} y2={A - m.b} stroke="#9a9c98" strokeWidth={1} />}
        {real.length > 1 && <path d={caminho(real)} fill="none" stroke={AZUL} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {previsto.length > 1 && (
          <path d={caminho(previsto)} fill="none" stroke={AZUL} strokeWidth={2} strokeDasharray="5 5" strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
        )}
        {fimReal !== null && (
          <g>
            <circle cx={x(fimReal)} cy={y(valorDoDia(fimReal))} r={5} fill={AZUL} stroke="#fff" strokeWidth={2} />
            <text
              x={x(fimReal) + (fimPrev === null ? 10 : 0)}
              y={y(valorDoDia(fimReal)) + (fimPrev === null ? 4 : -12)}
              textAnchor={fimPrev === null ? "start" : "middle"}
              fontSize={12}
              fontWeight={700}
              fill="#0b0c0e"
              stroke="#fff"
              strokeWidth={4}
              paintOrder="stroke"
            >
              {reaisComSinal(valorDoDia(fimReal))}
            </text>
          </g>
        )}
        {fimPrev !== null && (
          <g>
            <circle cx={x(fimPrev)} cy={y(valorDoDia(fimPrev))} r={4.5} fill="#fff" stroke={AZUL} strokeWidth={2} />
            <text x={x(fimPrev) + 10} y={y(valorDoDia(fimPrev)) - 2} fontSize={12} fontWeight={700} fill="#0b0c0e">
              {reaisComSinal(valorDoDia(fimPrev))}
            </text>
            <text x={x(fimPrev) + 10} y={y(valorDoDia(fimPrev)) + 12} fontSize={11} fill={TEXTO_EIXO}>
              previsto
            </text>
          </g>
        )}
        {foco !== null && <circle cx={x(foco)} cy={y(valorDoDia(foco))} r={4.5} fill={AZUL} stroke="#fff" strokeWidth={2} />}
        <rect x={m.e} y={m.t} width={L - m.e - m.d} height={A - m.t - m.b} fill="transparent" onPointerMove={apontar} onPointerLeave={() => setFoco(null)} />
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-[12px] text-[#55585e]">
        <span className="inline-flex items-center gap-1.5">
          <svg width="22" height="6" aria-hidden="true">
            <line x1="1" x2="21" y1="3" y2="3" stroke={AZUL} strokeWidth="2" strokeLinecap="round" />
          </svg>
          Realizado (dinheiro que entrou menos o que saiu)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="22" height="6" aria-hidden="true">
            <line x1="1" x2="21" y1="3" y2="3" stroke={AZUL} strokeWidth="2" strokeDasharray="5 5" />
          </svg>
          Previsto (contas a receber e a pagar em aberto, pelo vencimento)
        </span>
      </div>
      {d && foco !== null && (
        <Dica x={x(foco)} largura={L}>
          <p className="font-semibold first-letter:uppercase">
            {diaComSemana(d.data)}
            {d.data === hoje ? " · hoje" : d.futuro ? " · previsão" : ""}
          </p>
          {!d.futuro && (
            <>
              <LinhaDica rotulo="Entradas" valor={reais(d.entradas.total_centavos)} />
              <LinhaDica rotulo="Saídas" valor={reais(d.saidas.total_centavos)} />
              <LinhaDica rotulo="Saldo do dia" valor={reaisComSinal(d.saldo_dia_centavos)} />
            </>
          )}
          {(d.futuro || d.data === hoje) && (d.previsto.a_receber_centavos > 0 || d.previsto.a_pagar_centavos > 0) && (
            <>
              <LinhaDica rotulo="A receber (em aberto)" valor={reais(d.previsto.a_receber_centavos)} />
              <LinhaDica rotulo="A pagar (em aberto)" valor={reais(d.previsto.a_pagar_centavos)} />
            </>
          )}
          <LinhaDica rotulo={foco <= ultimoReal ? "Acumulado" : "Acumulado previsto"} valor={reaisComSinal(valorDoDia(foco))} forte />
        </Dica>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lucro líquido mês a mês (colunas acima/abaixo do zero)               */
/* ------------------------------------------------------------------ */
/** Coluna com cantos arredondados só na ponta (a base no zero fica reta). */
function coluna(cx: number, largura: number, yZero: number, yValor: number): string {
  const x0 = cx - largura / 2;
  const x1 = cx + largura / 2;
  const altura = Math.abs(yZero - yValor);
  const r = Math.min(4, largura / 2, altura);
  if (yValor <= yZero) {
    // para cima
    return `M${x0},${yZero} L${x0},${yValor + r} Q${x0},${yValor} ${x0 + r},${yValor} L${x1 - r},${yValor} Q${x1},${yValor} ${x1},${yValor + r} L${x1},${yZero} Z`;
  }
  return `M${x0},${yZero} L${x0},${yValor - r} Q${x0},${yValor} ${x0 + r},${yValor} L${x1 - r},${yValor} Q${x1},${yValor} ${x1},${yValor - r} L${x1},${yZero} Z`;
}

export function GraficoLucroMensal({ meses }: { meses: ResultadoDoMes[] }) {
  const [foco, setFoco] = useState<number | null>(null);
  const L = 920;
  const A = 240;
  const m = { e: 72, d: 16, t: 22, b: 30 };
  const n = Math.max(meses.length, 1);
  const faixa = (L - m.e - m.d) / n;
  const largura = Math.max(6, Math.min(24, faixa * 0.55));
  const x = (i: number) => m.e + faixa * i + faixa / 2;
  const { ini, fim, marcas } = useMemo(() => escala(meses.map((mm) => mm.lucro_liquido_centavos)), [meses]);
  const y = (v: number) => m.t + (A - m.t - m.b) * (1 - (v - ini) / (fim - ini));

  // rótulos só no último mês e nos extremos (o resto fica na tabela e na dica)
  const rotular = useMemo(() => {
    const s = new Set<number>();
    if (!meses.length) return s;
    s.add(meses.length - 1);
    let imax = 0;
    let imin = 0;
    meses.forEach((mm, i) => {
      if (mm.lucro_liquido_centavos > meses[imax]!.lucro_liquido_centavos) imax = i;
      if (mm.lucro_liquido_centavos < meses[imin]!.lucro_liquido_centavos) imin = i;
    });
    if (meses[imax]!.lucro_liquido_centavos > 0) s.add(imax);
    if (meses[imin]!.lucro_liquido_centavos < 0) s.add(imin);
    return s;
  }, [meses]);

  function teclado(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key === "ArrowRight") setFoco((f) => Math.min(n - 1, (f ?? -1) + 1));
    else if (e.key === "ArrowLeft") setFoco((f) => Math.max(0, (f ?? n) - 1));
    else if (e.key === "Escape") setFoco(null);
  }

  const atual = foco !== null ? meses[foco] : null;
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${L} ${A}`}
        className="h-auto w-full outline-none focus-visible:ring-2 focus-visible:ring-foco/40"
        role="img"
        aria-label="Lucro líquido mês a mês. Use as setas para percorrer os meses; os valores também estão na tabela."
        tabIndex={0}
        onKeyDown={teclado}
        onBlur={() => setFoco(null)}
      >
        {marcas.map((v) => (
          <g key={v}>
            <line x1={m.e} x2={L - m.d} y1={y(v)} y2={y(v)} stroke={v === 0 ? BASE : GRADE} strokeWidth={1} />
            <text x={m.e - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill={TEXTO_EIXO} style={{ fontVariantNumeric: "tabular-nums" }}>
              {rotuloEixo(v)}
            </text>
          </g>
        ))}
        {meses.map((mm, i) => {
          const v = mm.lucro_liquido_centavos;
          const positivo = v >= 0;
          return (
            <g key={mm.mes} onPointerEnter={() => setFoco(i)} onPointerLeave={() => setFoco(null)}>
              <rect x={m.e + faixa * i} y={m.t} width={faixa} height={A - m.t - m.b} fill={foco === i ? "#f3f3f0" : "transparent"} />
              {v !== 0 && <path d={coluna(x(i), largura, y(0), y(v))} fill={positivo ? AZUL : VERMELHO} opacity={foco === null || foco === i ? 1 : 0.55} />}
              {rotular.has(i) && v !== 0 && (
                <text x={x(i)} y={positivo ? y(v) - 7 : y(v) + 15} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="#0b0c0e">
                  {reaisComSinal(v)}
                </text>
              )}
              <text x={x(i)} y={A - 9} textAnchor="middle" fontSize={11} fill={TEXTO_EIXO}>
                {mesAno(mm.mes)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-[12px] text-[#55585e]">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: AZUL }} /> Lucro
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: VERMELHO }} /> Prejuízo
        </span>
      </div>
      {atual && foco !== null && (
        <Dica x={x(foco)} largura={L}>
          <p className="font-semibold">
            {mesAno(atual.mes)}
            {atual.de.slice(8) !== "01" || atual.ate !== ultimoDia(atual.mes) ? ` (${data(atual.de).slice(0, 5)} a ${data(atual.ate).slice(0, 5)})` : ""}
          </p>
          <LinhaDica rotulo="Receita líquida" valor={reais(atual.receita_centavos)} />
          <LinhaDica rotulo="Lucro bruto" valor={reaisComSinal(atual.lucro_bruto_centavos)} />
          <LinhaDica rotulo="Taxas, perdas e despesas" valor={reais(atual.taxas_centavos + atual.perdas_centavos + atual.despesas_centavos)} />
          <LinhaDica rotulo="Lucro líquido" valor={reaisComSinal(atual.lucro_liquido_centavos)} forte />
          {atual.margem_liquida_bp !== null && <LinhaDica rotulo="Margem líquida" valor={porcento(atual.margem_liquida_bp)} />}
        </Dica>
      )}
    </div>
  );
}

function ultimoDia(aaaamm: string): string {
  const [a, m] = aaaamm.split("-").map(Number);
  const d = new Date(a!, m!, 0).getDate();
  return `${aaaamm}-${String(d).padStart(2, "0")}`;
}
