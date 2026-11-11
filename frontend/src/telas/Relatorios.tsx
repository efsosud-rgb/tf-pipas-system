import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { consulta } from "../api";
import { GraficoVendas } from "../componentes/grafico";
import { FiltroPeriodo, periodoDoMes, type Periodo } from "../componentes/periodo";
import { AvisoErro, Botao, Cabecalho, Carregando, Cartao, cx, Etiqueta, Kpi, Vazio } from "../componentes/ui";
import { data, plural, porcento, quantidade, reais } from "../formato";
import { useApi } from "../hooks";
import type { LinhaProdutoVendido, RelatorioEstoque, RelatorioFormas, RelatorioProdutos, RelatorioTempo, RelatorioVendedores, Resultado } from "../tipos";

function baixarCsv(nome: string, cabecalho: string[], linhas: Array<Array<string | number>>) {
  const esc = (v: string | number) => {
    const t = String(v);
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const texto = "﻿" + [cabecalho, ...linhas].map((l) => l.map(esc).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const dinheiroCsv = (c: number) => (c / 100).toFixed(2).replace(".", ",");

export default function Relatorios() {
  const [periodo, setPeriodo] = useState<Periodo>(periodoDoMes);
  const q = consulta(periodo);
  const resultado = useApi<Resultado>(`/api/relatorios/resultado${q}`);
  const tempo = useApi<RelatorioTempo>(`/api/relatorios/tempo${q}`);
  const produtos = useApi<RelatorioProdutos>(`/api/relatorios/produtos${q}`);
  const formas = useApi<RelatorioFormas>(`/api/relatorios/formas${q}`);
  const estoque = useApi<RelatorioEstoque>("/api/relatorios/estoque");
  const vendedores = useApi<RelatorioVendedores>(`/api/relatorios/vendedores${q}`);
  const [ordem, setOrdem] = useState<"lucro" | "receita" | "quantidade" | "margem">("lucro");
  const r = resultado.dados;

  const lista = useMemo(() => {
    const l = [...(produtos.dados?.produtos ?? [])];
    l.sort((a, b) => {
      if (ordem === "receita") return b.receita_centavos - a.receita_centavos;
      if (ordem === "quantidade") return b.quantidade - a.quantidade;
      if (ordem === "margem") return (b.margem_bp ?? -1e9) - (a.margem_bp ?? -1e9);
      return b.lucro_centavos - a.lucro_centavos;
    });
    return l;
  }, [produtos.dados, ordem]);

  const curva = useMemo(() => curvaAbc(produtos.dados?.produtos ?? []), [produtos.dados]);
  const categorias = useMemo(() => porCategoria(produtos.dados?.produtos ?? []), [produtos.dados]);
  const destaques = useMemo(() => {
    const l = produtos.dados?.produtos ?? [];
    if (!l.length) return null;
    const maior = <T,>(f: (x: LinhaProdutoVendido) => T | null) =>
      l.reduce<LinhaProdutoVendido | null>((m, x) => {
        const v = f(x);
        if (v === null) return m;
        return !m || (v as number) > (f(m) as number) ? x : m;
      }, null);
    return {
      maisVendido: maior((x) => x.receita_centavos > 0 ? x.quantidade : null),
      maisLucro: maior((x) => x.lucro_centavos),
      maiorMargem: maior((x) => (x.receita_centavos >= 100_00 ? x.margem_bp : null)),
    };
  }, [produtos.dados]);

  const erro = resultado.erro ?? tempo.erro ?? produtos.erro ?? formas.erro ?? vendedores.erro;
  return (
    <div className="flex flex-col gap-5">
      <Cabecalho rotulo="Análise de vendas" titulo="Relatórios" descricao="Tudo calculado a partir das vendas e lançamentos gravados. Vendas canceladas ficam fora das contas." />
      <FiltroPeriodo valor={periodo} aoMudar={setPeriodo} />
      {erro && <AvisoErro mensagem={erro} />}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Kpi rotulo="Vendas" valor={r ? r.vendas.quantidade.toLocaleString("pt-BR") : "—"} dica={r?.vendas.canceladas_quantidade ? `${plural(r.vendas.canceladas_quantidade, "cancelada")} (fora das contas)` : "concluídas"} />
        <Kpi rotulo="Faturamento" valor={reais(r?.vendas.receita_centavos)} dica={r ? `bruto ${reais(r.vendas.bruto_centavos)} − descontos ${reais(r.vendas.descontos_centavos)}` : undefined} />
        <Kpi rotulo="Ticket médio" valor={reais(r?.vendas.ticket_medio_centavos)} />
        <Kpi rotulo="Lucro bruto" valor={reais(r?.lucro_bruto_centavos)} dica={r ? `margem ${porcento(r.margem_bruta_bp)}` : undefined} />
        <Kpi
          rotulo="Lucro líquido"
          valor={r ? (r.lucro_liquido_centavos < 0 ? `−${reais(-r.lucro_liquido_centavos)}` : reais(r.lucro_liquido_centavos)) : "—"}
          dica={r ? `margem líquida ${porcento(r.margem_liquida_bp)}` : undefined}
          tom={r ? (r.lucro_liquido_centavos < 0 ? "ruim" : r.lucro_liquido_centavos > 0 ? "bom" : "neutro") : "neutro"}
        />
      </div>

      <Cartao rotulo={tempo.dados?.agrupamento === "mes" ? "Por mês" : "Por dia"} titulo="Vendas no período">
        {!tempo.dados ? (
          <Carregando />
        ) : tempo.dados.pontos.every((p) => p.vendas === 0) ? (
          <Vazio titulo="Nenhuma venda no período" texto="O gráfico aparece quando houver vendas concluídas." />
        ) : (
          <GraficoVendas pontos={tempo.dados.pontos} agrupamento={tempo.dados.agrupamento} />
        )}
      </Cartao>

      {destaques && (
        <div className="grid gap-3 md:grid-cols-3">
          <Destaque rotulo="O que mais sai (quantidade)" item={destaques.maisVendido} valor={(x) => quantidade(x.quantidade, x.unidade)} />
          <Destaque rotulo="O que mais dá lucro" item={destaques.maisLucro} valor={(x) => reais(x.lucro_centavos)} />
          <Destaque rotulo="Maior margem (vendeu R$ 100+)" item={destaques.maiorMargem} valor={(x) => porcento(x.margem_bp)} />
        </div>
      )}

      <div className="grid gap-4 2xl:grid-cols-[1.6fr_1fr]">
        <Cartao
          rotulo="Produtos"
          titulo="O que mais vende e mais dá lucro"
          acoes={
            <Botao
              variante="secundario"
              tamanho="sm"
              icone={<Download className="size-3.5" />}
              disabled={!lista.length}
              onClick={() =>
                baixarCsv(
                  `vendas-por-produto_${periodo.de}_${periodo.ate}.csv`,
                  ["Produto", "Categoria", "Quantidade", "Unidade", "Faturamento", "Custo", "Lucro bruto", "Margem %", "Curva ABC"],
                  lista.map((l) => [l.nome, l.categoria, String(l.quantidade).replace(".", ","), l.unidade, dinheiroCsv(l.receita_centavos), dinheiroCsv(l.custo_centavos), dinheiroCsv(l.lucro_centavos), l.margem_bp === null ? "" : (l.margem_bp / 100).toFixed(2).replace(".", ","), curva.get(l.produto_id) ?? ""]),
                )
              }
            >
              Exportar CSV
            </Botao>
          }
          corpo={false}
        >
          {!produtos.dados ? (
            <Carregando />
          ) : lista.length === 0 ? (
            <Vazio titulo="Nenhum produto vendido no período" />
          ) : (
            <div className="overflow-x-auto">
              <table className="tabela mt-2">
                <thead>
                  <tr>
                    <th>Produto</th>
                    {(
                      [
                        ["quantidade", "Qtd."],
                        ["receita", "Faturamento"],
                        ["lucro", "Lucro bruto"],
                        ["margem", "Margem"],
                      ] as const
                    ).map(([id, rot]) => (
                      <th key={id} className="num">
                        <button type="button" onClick={() => setOrdem(id)} className={cx("uppercase", ordem === id ? "text-tinta" : "")}>
                          {rot} {ordem === id ? "↓" : ""}
                        </button>
                      </th>
                    ))}
                    <th className="num">Parte do lucro</th>
                    <th className="num" title="Curva ABC pelo faturamento do período">
                      Curva
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((l) => (
                    <tr key={l.produto_id}>
                      <td>
                        <p className="font-semibold">{l.nome}</p>
                        {l.categoria && <p className="text-[12px] text-suave">{l.categoria}</p>}
                      </td>
                      <td className="num">{quantidade(l.quantidade, l.unidade)}</td>
                      <td className="num">{reais(l.receita_centavos)}</td>
                      <td className={cx("num font-semibold", l.lucro_centavos < 0 && "text-perigo")}>{reais(l.lucro_centavos)}</td>
                      <td className="num">{porcento(l.margem_bp)}</td>
                      <td className="num">
                        {l.participacao_lucro_bp === null ? (
                          "—"
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-[#ececE8]">
                              <span className="block h-full rounded-full bg-tinta" style={{ width: `${Math.max(0, Math.min(100, l.participacao_lucro_bp / 100))}%` }} />
                            </span>
                            {porcento(l.participacao_lucro_bp)}
                          </span>
                        )}
                      </td>
                      <td className="num">
                        {curva.get(l.produto_id) ? <Etiqueta tom={curva.get(l.produto_id) === "A" ? "escuro" : curva.get(l.produto_id) === "B" ? "info" : "neutro"}>{curva.get(l.produto_id)}</Etiqueta> : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold">
                    <td className="px-3 py-2.5">Total</td>
                    <td />
                    <td className="num px-3">{reais(produtos.dados.totais.receita_centavos)}</td>
                    <td className="num px-3">{reais(produtos.dados.totais.lucro_centavos)}</td>
                    <td className="num px-3">{porcento(produtos.dados.totais.margem_bp)}</td>
                    <td />
                    <td />
                  </tr>
                </tfoot>
              </table>
              <p className="border-t border-[#efefeb] px-4 py-3 text-[12px] text-suave">
                Curva ABC pelo faturamento do período: <b>A</b> = os produtos que somam os primeiros 80% do faturamento, <b>B</b> = os próximos 15%, <b>C</b> = os últimos 5%. Clique
                nos títulos das colunas para ordenar.
              </p>
            </div>
          )}
        </Cartao>

        <div className="grid content-start gap-4 lg:grid-cols-2 2xl:grid-cols-1">
          <Cartao rotulo="Meios de recebimento" titulo="Vendas por forma de pagamento" corpo={false}>
            {!formas.dados ? (
              <Carregando />
            ) : formas.dados.formas.length === 0 ? (
              <Vazio titulo="Sem vendas no período" />
            ) : (
              <table className="tabela mt-2">
                <thead>
                  <tr>
                    <th>Forma</th>
                    <th className="num">Valor</th>
                    <th className="num">Taxas</th>
                    <th className="num">Parte</th>
                  </tr>
                </thead>
                <tbody>
                  {formas.dados.formas.map((f) => (
                    <tr key={f.forma_id}>
                      <td>
                        <p className="font-semibold">{f.nome}</p>
                        <p className="text-[12px] text-suave">{plural(f.vendas, "venda")}</p>
                      </td>
                      <td className="num font-semibold">{reais(f.valor_centavos)}</td>
                      <td className="num text-suave">{reais(f.taxas_centavos)}</td>
                      <td className="num">{porcento(f.participacao_bp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Cartao>
          <Cartao rotulo="Rentabilidade" titulo="Por categoria" corpo={false}>
            {!produtos.dados ? (
              <Carregando />
            ) : categorias.length === 0 ? (
              <Vazio titulo="Sem vendas no período" />
            ) : (
              <table className="tabela mt-2">
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th className="num">Faturamento</th>
                    <th className="num">Lucro bruto</th>
                    <th className="num">Margem</th>
                  </tr>
                </thead>
                <tbody>
                  {categorias.map((c) => (
                    <tr key={c.nome}>
                      <td>
                        <p className="font-semibold">{c.nome}</p>
                        <span className="mt-1 block h-1.5 w-full max-w-[140px] overflow-hidden rounded-full bg-[#ececE8]">
                          <span className="block h-full rounded-full bg-[#2a78d6]" style={{ width: `${c.parte}%` }} />
                        </span>
                      </td>
                      <td className="num font-semibold">{reais(c.receita)}</td>
                      <td className={cx("num", c.lucro < 0 && "text-perigo")}>{reais(c.lucro)}</td>
                      <td className="num">{porcento(c.margem)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Cartao>
          <Cartao rotulo="Equipe" titulo="Vendas por vendedor" corpo={false}>
            {!vendedores.dados ? (
              <Carregando />
            ) : vendedores.dados.vendedores.length === 0 ? (
              <Vazio titulo="Sem vendas no período" />
            ) : (
              <>
                <table className="tabela mt-2">
                  <thead>
                    <tr>
                      <th>Vendedor</th>
                      <th className="num">Vendas</th>
                      <th className="num">Faturamento</th>
                      <th className="num">Ticket</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendedores.dados.vendedores.map((v) => (
                      <tr key={v.nome || "-"}>
                        <td className="font-semibold">{v.nome || <span className="font-normal text-suave">antes dos usuários</span>}</td>
                        <td className="num">{v.vendas}</td>
                        <td className="num font-semibold">
                          {reais(v.total_centavos)}
                          {v.descontos_centavos > 0 && <span className="block text-[11.5px] font-normal text-suave">descontos {reais(v.descontos_centavos)}</span>}
                        </td>
                        <td className="num">{reais(v.ticket_medio_centavos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {vendedores.dados.cancelamentos.length > 0 && (
                  <p className="border-t border-[#efefeb] px-4 py-3 text-[12px] text-suave">
                    Cancelamentos no período:{" "}
                    {vendedores.dados.cancelamentos.map((c) => `${c.nome || "sem usuário"} (${c.quantidade})`).join(" · ")}
                  </p>
                )}
              </>
            )}
          </Cartao>
          <Cartao rotulo="Hoje" titulo="Estoque parado na loja">
            {!estoque.dados ? (
              <Carregando />
            ) : (
              <div className="space-y-2 text-[14px]">
                <div className="flex justify-between">
                  <span>A preço de custo</span>
                  <strong className="tabular-nums">{reais(estoque.dados.valor_a_custo_centavos)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>A preço de venda</span>
                  <strong className="tabular-nums">{reais(estoque.dados.valor_a_preco_de_venda_centavos)}</strong>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Etiqueta tom={estoque.dados.zerados ? "perigo" : "neutro"}>{estoque.dados.zerados} zerados</Etiqueta>
                  <Etiqueta tom={estoque.dados.abaixo_do_minimo ? "alerta" : "neutro"}>{estoque.dados.abaixo_do_minimo} abaixo do mínimo</Etiqueta>
                  <Etiqueta tom={estoque.dados.negativos ? "perigo" : "neutro"}>{estoque.dados.negativos} negativos</Etiqueta>
                </div>
              </div>
            )}
          </Cartao>
          {r && (r.perdas.total_centavos > 0 || r.taxas_centavos > 0) && (
            <Cartao rotulo="Custos que comem o lucro" titulo={`${data(periodo.de)} a ${data(periodo.ate)}`}>
              <div className="space-y-1.5 text-[14px]">
                <div className="flex justify-between">
                  <span>Taxas de cartão e PIX</span>
                  <strong className="tabular-nums">{reais(r.taxas_centavos)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Perdas</span>
                  <strong className="tabular-nums">{reais(r.perdas.perda_centavos)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Brindes</span>
                  <strong className="tabular-nums">{reais(r.perdas.brinde_centavos)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Uso na loja</span>
                  <strong className="tabular-nums">{reais(r.perdas.uso_centavos)}</strong>
                </div>
              </div>
            </Cartao>
          )}
        </div>
      </div>
    </div>
  );
}

/** Curva ABC pelo faturamento: A até 80% acumulado, B até 95%, C o resto. */
function curvaAbc(produtos: LinhaProdutoVendido[]): Map<number, "A" | "B" | "C"> {
  const lista = [...produtos].filter((p) => p.receita_centavos > 0).sort((a, b) => b.receita_centavos - a.receita_centavos);
  const total = lista.reduce((s, p) => s + p.receita_centavos, 0);
  const mapa = new Map<number, "A" | "B" | "C">();
  let acumulado = 0;
  for (const p of lista) {
    // a classe é decidida pelo acumulado ANTES do produto: o que cruza os 80% ainda é A
    const antes = total > 0 ? acumulado / total : 0;
    mapa.set(p.produto_id, antes < 0.8 ? "A" : antes < 0.95 ? "B" : "C");
    acumulado += p.receita_centavos;
  }
  return mapa;
}

function porCategoria(produtos: LinhaProdutoVendido[]) {
  const mapa = new Map<string, { nome: string; receita: number; lucro: number }>();
  for (const p of produtos) {
    const nome = p.categoria || "Sem categoria";
    const c = mapa.get(nome) ?? { nome, receita: 0, lucro: 0 };
    c.receita += p.receita_centavos;
    c.lucro += p.lucro_centavos;
    mapa.set(nome, c);
  }
  const lista = [...mapa.values()].sort((a, b) => b.receita - a.receita);
  const maior = Math.max(1, ...lista.map((c) => c.receita));
  return lista.map((c) => ({ ...c, margem: c.receita > 0 ? Math.round((c.lucro * 10_000) / c.receita) : null, parte: Math.max(2, (c.receita / maior) * 100) }));
}

function Destaque({ rotulo, item, valor }: { rotulo: string; item: LinhaProdutoVendido | null; valor: (x: LinhaProdutoVendido) => string }) {
  return (
    <div className="rounded-[16px] border border-borda/80 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,.04)]">
      <p className="rotulo">{rotulo}</p>
      {item ? (
        <>
          <p className="mt-1.5 truncate text-[15px] font-bold text-tinta" title={item.nome}>
            {item.nome}
          </p>
          <p className="text-[13px] text-suave">{valor(item)}</p>
        </>
      ) : (
        <p className="mt-1.5 text-[13px] text-suave">—</p>
      )}
    </div>
  );
}
