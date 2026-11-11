import { ArrowDownRight, ArrowUpRight, CalendarClock, Check, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { api, consulta, ErroApi, mensagemDeErro } from "../api";
import { avisar, confirmar } from "../componentes/avisos";
import { GraficoLucroMensal, GraficoSaldo } from "../componentes/grafico-financeiro";
import { FiltroPeriodo, periodoDoMes, type Periodo } from "../componentes/periodo";
import {
  Abas,
  AvisoErro,
  Botao,
  Cabecalho,
  Campo,
  CampoDinheiro,
  Carregando,
  Cartao,
  cx,
  Entrada,
  Etiqueta,
  Interruptor,
  Kpi,
  Linha,
  Modal,
  Selecao,
  Vazio,
} from "../componentes/ui";
import { data, hojeLocal, mesAno, plural, porcento, primeiroDiaDoMes, reais, reaisSaida, relativoAoDia, somarMeses, ultimoDiaDoMes } from "../formato";
import { avisarMudanca, useApi } from "../hooks";
import type { Categoria, ContasPendentes, FluxoDiario, Lancamento, Origem, Resultado, ResultadoDoMes, ResumoFinanceiro, TipoLancamento } from "../tipos";

type Aba = "pagar" | "receber" | "lancamentos" | "fluxo" | "dre";

export default function Financeiro() {
  const [aba, setAba] = useState<Aba>("pagar");
  const [periodo, setPeriodo] = useState<Periodo>(periodoDoMes);
  const pendentes = useApi<ContasPendentes>("/api/financeiro/pendentes");
  const [novo, setNovo] = useState<TipoLancamento | null>(null);
  const [editando, setEditando] = useState<Lancamento | null>(null);
  const [pagando, setPagando] = useState<Lancamento | null>(null);
  const p = pendentes.dados;
  const vencidas = p?.lancamentos.filter((l) => l.situacao === "vencido") ?? [];

  const acoes = { editar: setEditando, pagar: setPagando };

  return (
    <div className="flex flex-col gap-5">
      <Cabecalho
        rotulo="Gestão financeira"
        titulo="Financeiro"
        descricao="Contas a pagar e a receber, lançamentos, fluxo de caixa e o resultado (DRE gerencial) da loja."
        acoes={
          <>
            <Botao variante="secundario" icone={<ArrowUpRight className="size-4" />} onClick={() => setNovo("receita")}>
              Nova receita
            </Botao>
            <Botao icone={<ArrowDownRight className="size-4" />} onClick={() => setNovo("despesa")}>
              Nova despesa
            </Botao>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi rotulo="A pagar (pendente)" valor={reais(p?.a_pagar_centavos)} />
        <Kpi rotulo="A receber (pendente)" valor={reais(p?.a_receber_centavos)} />
        <Kpi
          rotulo="Vencidas"
          valor={p ? vencidas.length : "—"}
          dica={p ? `pagar ${reais(p.vencidas_a_pagar_centavos)} · receber ${reais(p.vencidas_a_receber_centavos)}` : undefined}
          tom={vencidas.length ? "ruim" : "neutro"}
        />
        <Kpi rotulo="Próximos 7 dias" valor={p ? p.lancamentos.filter((l) => l.situacao === "pendente" && l.vencimento && l.vencimento <= somar7()).length : "—"} dica="contas pendentes vencendo" />
      </div>

      <Abas
        abas={[
          { id: "pagar", rotulo: "Contas a pagar", contagem: p?.lancamentos.filter((l) => l.tipo === "despesa").length },
          { id: "receber", rotulo: "Contas a receber", contagem: p?.lancamentos.filter((l) => l.tipo === "receita").length },
          { id: "lancamentos", rotulo: "Lançamentos" },
          { id: "fluxo", rotulo: "Fluxo de caixa" },
          { id: "dre", rotulo: "DRE" },
        ]}
        ativa={aba}
        aoMudar={setAba}
      />

      {(aba === "pagar" || aba === "receber") && (
        <Cartao corpo={false}>
          {pendentes.erro && <AvisoErro mensagem={pendentes.erro} />}
          {!p ? (
            <Carregando />
          ) : (
            <TabelaLancamentos
              lista={p.lancamentos.filter((l) => l.tipo === (aba === "pagar" ? "despesa" : "receita"))}
              vazio={
                <Vazio
                  icone={<CalendarClock className="size-6" />}
                  titulo={aba === "pagar" ? "Nenhuma conta a pagar" : "Nada a receber"}
                  texto={aba === "pagar" ? "Lance aluguel, luz, fornecedores… como “a pagar” para não esquecer o vencimento." : "Receitas lançadas como “a receber” aparecem aqui."}
                  acao={
                    <Botao icone={<Plus className="size-4" />} onClick={() => setNovo(aba === "pagar" ? "despesa" : "receita")}>
                      {aba === "pagar" ? "Lançar despesa" : "Lançar receita"}
                    </Botao>
                  }
                />
              }
              acoes={acoes}
              pendentes
            />
          )}
        </Cartao>
      )}

      {aba === "lancamentos" && <AbaLancamentos periodo={periodo} aoPeriodo={setPeriodo} acoes={acoes} />}
      {aba === "fluxo" && <AbaFluxo periodo={periodo} aoPeriodo={setPeriodo} />}
      {aba === "dre" && <AbaDre periodo={periodo} aoPeriodo={setPeriodo} />}

      {novo && <FormularioLancamento tipo={novo} aoFechar={() => setNovo(null)} />}
      {editando && <FormularioLancamento tipo={editando.tipo} lancamento={editando} aoFechar={() => setEditando(null)} />}
      {pagando && <PagarLancamento lancamento={pagando} aoFechar={() => setPagando(null)} />}
    </div>
  );
}

function somar7(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return hojeLocal(d);
}

interface Acoes {
  editar: (l: Lancamento) => void;
  pagar: (l: Lancamento) => void;
}

function TabelaLancamentos({ lista, vazio, acoes, pendentes }: { lista: Lancamento[]; vazio: React.ReactNode; acoes: Acoes; pendentes?: boolean }) {
  async function excluir(l: Lancamento) {
    const r = await confirmar({
      titulo: "Excluir este lançamento?",
      texto: (
        <p>
          {l.descricao} · {reais(l.valor_centavos)}
          {l.pago && l.origem === "gaveta" && <><br />O valor volta para a gaveta do caixa (só funciona com o mesmo caixa aberto).</>}
        </p>
      ),
      confirmar: "Excluir",
      perigo: true,
    });
    if (!r.ok) return;
    let futuros = false;
    if (l.grupo_repeticao) {
      const r2 = await confirmar({
        titulo: "Excluir também as próximas repetições?",
        texto: "Este lançamento se repete todo mês. Posso excluir também as repetições seguintes que ainda não foram pagas.",
        confirmar: "Sim, excluir as próximas",
        cancelar: "Não, só esta",
      });
      futuros = r2.ok;
    }
    try {
      const res = await api.delete<{ excluidos: number }>(`/api/financeiro/lancamentos/${l.id}${futuros ? "?futuros=1" : ""}`);
      avisar(res.excluidos > 1 ? `${res.excluidos} lançamentos excluídos.` : "Lançamento excluído.");
      avisarMudanca();
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    }
  }
  async function desfazer(l: Lancamento) {
    const r = await confirmar({ titulo: "Desfazer o pagamento?", texto: "O lançamento volta a ficar pendente.", confirmar: "Desfazer" });
    if (!r.ok) return;
    try {
      await api.post(`/api/financeiro/lancamentos/${l.id}/desfazer-pagamento`);
      avisar("Pagamento desfeito.");
      avisarMudanca();
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    }
  }
  if (!lista.length) return <>{vazio}</>;
  return (
    <div className="overflow-x-auto">
      <table className="tabela">
        <thead>
          <tr>
            <th>{pendentes ? "Vencimento" : "Data"}</th>
            <th>Descrição</th>
            <th>Categoria</th>
            <th className="num">Valor</th>
            <th>Situação</th>
            <th className="num">Ações</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((l) => (
            <tr key={l.id}>
              <td>
                {pendentes ? (
                  <>
                    <p className="font-semibold">{data(l.vencimento)}</p>
                    <p className={cx("text-[12px]", l.situacao === "vencido" ? "font-semibold text-perigo" : "text-suave")}>{l.vencimento ? relativoAoDia(l.vencimento) : ""}</p>
                  </>
                ) : (
                  data(l.data)
                )}
              </td>
              <td>
                <p className="font-semibold">{l.descricao}</p>
                <p className="text-[12px] text-suave">
                  {l.parcelas ? `${l.parcela}/${l.parcelas} · ` : ""}
                  {l.tipo === "receita" ? "Receita" : "Despesa"}
                  {l.pago && l.data_pagamento ? ` · ${l.tipo === "receita" ? "recebida" : "paga"} em ${data(l.data_pagamento)} (${l.origem === "gaveta" ? "gaveta" : "banco/PIX/cartão"})` : ""}
                </p>
              </td>
              <td className="text-[#55585e]">
                {l.categoria_nome}
                {!l.conta_no_resultado && <span className="block text-[11px] text-suave">fora do resultado</span>}
              </td>
              <td className={cx("num font-bold", l.tipo === "receita" ? "text-sucesso" : "text-tinta")}>
                {l.tipo === "receita" ? "+" : "−"}
                {reais(l.valor_centavos)}
              </td>
              <td>
                {l.situacao === "pago" ? (
                  <Etiqueta tom="ok">{l.tipo === "receita" ? "Recebida" : "Paga"}</Etiqueta>
                ) : l.situacao === "vencido" ? (
                  <Etiqueta tom="perigo">Vencida</Etiqueta>
                ) : (
                  <Etiqueta tom="alerta">Pendente</Etiqueta>
                )}
              </td>
              <td className="num">
                <div className="inline-flex items-center gap-1">
                  {!l.pago ? (
                    <Botao tamanho="sm" variante="secundario" icone={<Check className="size-3.5" />} onClick={() => acoes.pagar(l)}>
                      {l.tipo === "receita" ? "Receber" : "Pagar"}
                    </Botao>
                  ) : (
                    <button type="button" title="Desfazer pagamento" aria-label="Desfazer pagamento" onClick={() => void desfazer(l)} className="grid size-8 place-items-center rounded-lg text-[#6c6f75] hover:bg-black/5 hover:text-tinta">
                      <Undo2 className="size-4" />
                    </button>
                  )}
                  <button type="button" title="Editar" aria-label="Editar" onClick={() => acoes.editar(l)} className="grid size-8 place-items-center rounded-lg text-[#6c6f75] hover:bg-black/5 hover:text-tinta">
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    title={l.entrada_estoque_id ? "Lançamento de uma entrada de mercadoria" : "Excluir"}
                    aria-label="Excluir"
                    onClick={() => void excluir(l)}
                    className="grid size-8 place-items-center rounded-lg text-[#6c6f75] hover:bg-[#fde6e6] hover:text-perigo"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AbaLancamentos({ periodo, aoPeriodo, acoes }: { periodo: Periodo; aoPeriodo: (p: Periodo) => void; acoes: Acoes }) {
  const [tipo, setTipo] = useState<"" | TipoLancamento>("");
  const [situacao, setSituacao] = useState<"" | "pago" | "pendente" | "vencido">("");
  const lista = useApi<Lancamento[]>(`/api/financeiro/lancamentos${consulta({ de: periodo.de, ate: periodo.ate, tipo, situacao })}`);
  const receitas = (lista.dados ?? []).filter((l) => l.tipo === "receita").reduce((s, l) => s + l.valor_centavos, 0);
  const despesas = (lista.dados ?? []).filter((l) => l.tipo === "despesa").reduce((s, l) => s + l.valor_centavos, 0);
  return (
    <div className="flex flex-col gap-4">
      <FiltroPeriodo valor={periodo} aoMudar={aoPeriodo} />
      <Cartao corpo={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-[#efefeb] p-3">
          <div className="w-[200px]">
            <Selecao value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} aria-label="Tipo">
              <option value="">Receitas e despesas</option>
              <option value="receita">Só receitas</option>
              <option value="despesa">Só despesas</option>
            </Selecao>
          </div>
          <div className="w-[200px]">
            <Selecao value={situacao} onChange={(e) => setSituacao(e.target.value as typeof situacao)} aria-label="Situação">
              <option value="">Todas as situações</option>
              <option value="pago">Pagas/recebidas</option>
              <option value="pendente">Pendentes</option>
              <option value="vencido">Vencidas</option>
            </Selecao>
          </div>
          <p className="ml-auto text-[13px] text-suave">
            Pela data de referência · receitas <strong className="text-sucesso">{reais(receitas)}</strong> · despesas <strong className="text-tinta">{reais(despesas)}</strong>
          </p>
        </div>
        {lista.erro && <AvisoErro mensagem={lista.erro} />}
        {!lista.dados ? <Carregando /> : <TabelaLancamentos lista={lista.dados} vazio={<Vazio titulo="Nenhum lançamento no período" />} acoes={acoes} />}
      </Cartao>
      <p className="text-[12px] text-suave">As vendas da frente de caixa não aparecem aqui: elas entram direto no fluxo de caixa e na DRE.</p>
    </div>
  );
}

function AbaFluxo({ periodo, aoPeriodo }: { periodo: Periodo; aoPeriodo: (p: Periodo) => void }) {
  const fluxo = useApi<FluxoDiario>(`/api/financeiro/fluxo-diario${consulta(periodo)}`);
  const r = useApi<ResumoFinanceiro>(`/api/financeiro/resumo${consulta(periodo)}`);
  const [soMovimento, setSoMovimento] = useState(true);
  const f = fluxo.dados;
  const linhas = useMemo(() => {
    if (!f) return [];
    return f.dias.filter(
      (d) =>
        !soMovimento ||
        d.data === f.hoje ||
        d.entradas.total_centavos > 0 ||
        d.saidas.total_centavos > 0 ||
        d.previsto.a_receber_centavos > 0 ||
        d.previsto.a_pagar_centavos > 0,
    );
  }, [f, soMovimento]);
  const previstoLiquido = f ? f.totais.a_receber_centavos - f.totais.a_pagar_centavos : 0;
  const temFuturo = !!f && f.ate >= f.hoje;

  return (
    <div className="flex flex-col gap-4">
      <FiltroPeriodo valor={periodo} aoMudar={aoPeriodo} />
      {fluxo.erro && <AvisoErro mensagem={fluxo.erro} aoTentar={fluxo.recarregar} />}
      {!f ? (
        fluxo.erro ? null : <Carregando />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi rotulo="Entradas realizadas" valor={reais(f.totais.entradas_centavos)} dica="vendas + receitas recebidas" tom="bom" />
            <Kpi rotulo="Saídas realizadas" valor={reais(f.totais.saidas_centavos)} dica="taxas + despesas pagas" />
            <Kpi rotulo="Saldo realizado" valor={reaisComSinal(f.totais.saldo_centavos)} dica="entradas − saídas no período" tom={f.totais.saldo_centavos < 0 ? "ruim" : "neutro"} />
            <Kpi
              rotulo={temFuturo ? `Previsto até ${data(f.ate).slice(0, 5)}` : "Previsto"}
              valor={temFuturo ? reaisComSinal(previstoLiquido) : "—"}
              dica={temFuturo ? `a receber ${reais(f.totais.a_receber_centavos)} · a pagar ${reais(f.totais.a_pagar_centavos)}` : "o período já terminou"}
              tom={previstoLiquido < 0 ? "ruim" : "neutro"}
            />
          </div>
          {f.atrasadas.quantidade > 0 && (
            <p className="rounded-2xl border border-[#f1d9a8] bg-[#fff8ea] px-4 py-3 text-[13px] text-[#7a4a00]">
              {plural(f.atrasadas.quantidade, "conta vencida", "contas vencidas")} em aberto (a receber {reais(f.atrasadas.a_receber_centavos)} · a pagar{" "}
              {reais(f.atrasadas.a_pagar_centavos)}). Elas não entram na previsão dia a dia porque o vencimento já passou — veja em Contas a pagar / a receber.
            </p>
          )}
          <Cartao rotulo={`Começa em R$ 0,00 em ${data(f.de)} — não é o saldo do banco`} titulo="Saldo acumulado do período">
            <GraficoSaldo dias={f.dias} hoje={f.hoje} />
          </Cartao>
          <Cartao
            corpo={false}
            rotulo="Dia a dia"
            titulo="Entradas e saídas por dia"
            acoes={<Interruptor ligado={soMovimento} aoMudar={setSoMovimento} rotulo="Só dias com movimento" />}
          >
            <div className="mt-3 overflow-x-auto">
              {linhas.length === 0 ? (
                <Vazio titulo="Nenhum movimento no período" texto="Vendas, despesas pagas e receitas recebidas aparecem aqui pelo dia em que aconteceram." />
              ) : (
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Dia</th>
                      <th className="num">Entradas</th>
                      <th className="num">Saídas</th>
                      <th className="num">Saldo do dia</th>
                      <th className="num">Acumulado</th>
                      <th className="num">A receber (aberto)</th>
                      <th className="num">A pagar (aberto)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((d) => (
                      <tr key={d.data} className={cx(d.futuro && "text-[#6c6f75]", d.data === f.hoje && "bg-[#f7f7f4]")}>
                        <td className="font-semibold whitespace-nowrap">
                          {data(d.data)}
                          {d.data === f.hoje && <span className="ml-1.5 text-[11px] font-bold text-suave">hoje</span>}
                          {d.futuro && <span className="ml-1.5 text-[11px] text-suave">previsão</span>}
                        </td>
                        <td className="num">
                          {d.futuro ? (
                            "—"
                          ) : (
                            <>
                              {reais(d.entradas.total_centavos)}
                              {d.entradas.receitas_centavos > 0 && (
                                <span className="block text-[11.5px] text-suave">
                                  vendas {reais(d.entradas.vendas_centavos)} · outras {reais(d.entradas.receitas_centavos)}
                                </span>
                              )}
                            </>
                          )}
                        </td>
                        <td className="num">
                          {d.futuro ? (
                            "—"
                          ) : (
                            <>
                              {reais(d.saidas.total_centavos)}
                              {d.saidas.taxas_centavos > 0 && (
                                <span className="block text-[11.5px] text-suave">
                                  taxas {reais(d.saidas.taxas_centavos)} · despesas {reais(d.saidas.despesas_centavos)}
                                </span>
                              )}
                            </>
                          )}
                        </td>
                        <td className={cx("num font-semibold", d.saldo_dia_centavos < 0 && "text-perigo")}>{d.futuro ? "—" : reaisComSinal(d.saldo_dia_centavos)}</td>
                        <td className={cx("num", (d.futuro ? d.acumulado_previsto_centavos : d.acumulado_centavos) < 0 && "text-perigo")}>
                          {reaisComSinal(d.futuro ? d.acumulado_previsto_centavos : d.acumulado_centavos)}
                        </td>
                        <td className="num">{d.previsto.a_receber_centavos ? reais(d.previsto.a_receber_centavos) : "—"}</td>
                        <td className="num">{d.previsto.a_pagar_centavos ? reais(d.previsto.a_pagar_centavos) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Cartao>
          {r.dados && (
            <div className="grid gap-4 xl:grid-cols-2">
              <Cartao rotulo="Entrou no período" titulo="Entradas">
                <div className="divide-y divide-[#efefeb] text-[14px]">
                  <Linha rotulo="Vendas (frente de caixa)" valor={reais(r.dados.entradas.vendas_centavos)} />
                  <Linha rotulo="Outras receitas recebidas" valor={reais(r.dados.entradas.receitas_centavos)} />
                  <Linha rotulo="Total" valor={reais(r.dados.entradas.total_centavos)} forte />
                </div>
              </Cartao>
              <Cartao rotulo="Saiu no período" titulo="Saídas por categoria">
                <div className="divide-y divide-[#efefeb] text-[14px]">
                  <Linha rotulo="Taxas das maquininhas e PIX" valor={reais(r.dados.saidas.taxas_centavos)} />
                  {r.dados.saidas.por_categoria.map((c) => (
                    <Linha key={c.categoria_id} rotulo={c.nome} valor={reais(c.total_centavos)} />
                  ))}
                  <Linha rotulo="Total" valor={reais(r.dados.saidas.total_centavos)} forte />
                </div>
              </Cartao>
            </div>
          )}
          <p className="text-[12px] text-suave">
            Fluxo de caixa = dinheiro que de fato entrou e saiu, pela data da venda e pela data do pagamento. A previsão usa só as contas em aberto lançadas no Financeiro, pelo
            vencimento. As taxas são calculadas com as porcentagens cadastradas em Configurações.
          </p>
        </>
      )}
    </div>
  );
}

function reaisComSinal(centavos: number): string {
  return centavos < 0 ? `−${reais(-centavos)}` : reais(centavos);
}

function AbaDre({ periodo, aoPeriodo }: { periodo: Periodo; aoPeriodo: (p: Periodo) => void }) {
  const [visao, setVisao] = useState<"periodo" | "meses">("periodo");
  const [meses, setMeses] = useState(12);
  const r = useApi<Resultado>(visao === "periodo" ? `/api/relatorios/resultado${consulta(periodo)}` : null);
  const hoje = hojeLocal();
  const deMeses = primeiroDiaDoMes(somarMeses(hoje, -(meses - 1)));
  const mensal = useApi<ResultadoDoMes[]>(visao === "meses" ? `/api/relatorios/resultado-mensal${consulta({ de: deMeses, ate: ultimoDiaDoMes(hoje) })}` : null);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Abas
          abas={[
            { id: "periodo", rotulo: "Período escolhido" },
            { id: "meses", rotulo: "Mês a mês" },
          ]}
          ativa={visao}
          aoMudar={setVisao}
        />
        {visao === "meses" && (
          <div className="inline-flex gap-1 rounded-xl border border-borda bg-white p-1 text-[12.5px] font-semibold">
            {[6, 12, 24].map((q) => (
              <button
                key={q}
                type="button"
                aria-pressed={meses === q}
                onClick={() => setMeses(q)}
                className={cx("rounded-lg px-2.5 py-1", meses === q ? "bg-tinta text-white" : "text-[#5f6268] hover:text-tinta")}
              >
                Últimos {q} meses
              </button>
            ))}
          </div>
        )}
      </div>
      {visao === "periodo" ? (
        <>
          <FiltroPeriodo valor={periodo} aoMudar={aoPeriodo} />
          {r.erro && <AvisoErro mensagem={r.erro} aoTentar={r.recarregar} />}
          {!r.dados ? r.erro ? null : <Carregando /> : <Dre r={r.dados} />}
        </>
      ) : (
        <>
          {mensal.erro && <AvisoErro mensagem={mensal.erro} aoTentar={mensal.recarregar} />}
          {!mensal.dados ? mensal.erro ? null : <Carregando /> : <ResultadoMesAMes meses={mensal.dados} />}
        </>
      )}
    </div>
  );
}

function ResultadoMesAMes({ meses }: { meses: ResultadoDoMes[] }) {
  const soma = (f: (m: ResultadoDoMes) => number) => meses.reduce((s, m) => s + f(m), 0);
  const receita = soma((m) => m.receita_centavos);
  const liquido = soma((m) => m.lucro_liquido_centavos);
  const comVenda = meses.filter((m) => m.vendas > 0).length;
  // média só dos meses que tiveram algum movimento (antes de usar o sistema não há dado, e zero não é resultado)
  const comMovimento = meses.filter((m) => m.vendas > 0 || m.despesas_centavos > 0 || m.outras_receitas_centavos > 0 || m.perdas_centavos > 0 || m.taxas_centavos > 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi rotulo="Receita líquida" valor={reais(receita)} dica={`${meses.length} meses · ${plural(comVenda, "mês com venda", "meses com venda")}`} />
        <Kpi rotulo="Lucro bruto" valor={reaisComSinal(soma((m) => m.lucro_bruto_centavos))} />
        <Kpi rotulo="Lucro líquido" valor={reaisComSinal(liquido)} tom={liquido < 0 ? "ruim" : "bom"} dica={receita > 0 ? `margem ${porcento(Math.round((liquido * 10_000) / receita))}` : "sem receita"} />
        <Kpi
          rotulo="Média por mês com movimento"
          valor={comMovimento.length ? reaisComSinal(Math.round(comMovimento.reduce((t, m) => t + m.lucro_liquido_centavos, 0) / comMovimento.length)) : "—"}
          dica={comMovimento.length ? `lucro líquido · ${plural(comMovimento.length, "mês", "meses")}` : "nenhum mês com movimento"}
        />
      </div>
      <Cartao rotulo="Resultado de cada mês" titulo="Lucro líquido mês a mês">
        <GraficoLucroMensal meses={meses} />
      </Cartao>
      <Cartao corpo={false} rotulo="Tabela" titulo="DRE mês a mês">
        <div className="mt-3 overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Mês</th>
                <th className="num">Vendas</th>
                <th className="num">Receita líquida</th>
                <th className="num">CMV</th>
                <th className="num">Lucro bruto</th>
                <th className="num">Taxas e perdas</th>
                <th className="num">Outras receitas</th>
                <th className="num">Despesas</th>
                <th className="num">Lucro líquido</th>
              </tr>
            </thead>
            <tbody>
              {[...meses].reverse().map((m) =>
                comMovimento.includes(m) ? (
                  <tr key={m.mes}>
                    <td className="font-semibold">{mesAno(m.mes)}</td>
                    <td className="num">{m.vendas}</td>
                    <td className="num">{reais(m.receita_centavos)}</td>
                    <td className="num text-suave">{reais(m.cmv_centavos)}</td>
                    <td className="num">{reaisComSinal(m.lucro_bruto_centavos)}</td>
                    <td className="num text-suave">{reais(m.taxas_centavos + m.perdas_centavos)}</td>
                    <td className="num text-suave">{reais(m.outras_receitas_centavos)}</td>
                    <td className="num text-suave">{reais(m.despesas_centavos)}</td>
                    <td className={cx("num font-bold", m.lucro_liquido_centavos < 0 && "text-perigo")}>
                      {reaisComSinal(m.lucro_liquido_centavos)}
                      {m.margem_liquida_bp !== null && <span className="block text-[11.5px] font-normal text-suave">margem {porcento(m.margem_liquida_bp)}</span>}
                    </td>
                  </tr>
                ) : (
                  <tr key={m.mes} className="text-suave">
                    <td className="font-semibold">{mesAno(m.mes)}</td>
                    <td colSpan={8} className="text-[12.5px]">
                      — sem movimento registrado no sistema
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </Cartao>
      <p className="text-[12px] text-suave">
        Lucro líquido = receita líquida − custo das mercadorias vendidas − taxas − perdas + outras receitas − despesas operacionais (por competência). Compras de mercadoria e de
        material não entram aqui: o custo entra quando o produto é vendido. DRE gerencial, feita com os dados do sistema — não substitui a contabilidade.
      </p>
    </div>
  );
}

export function Dre({ r }: { r: Resultado }) {
  const linhas: Array<{ rotulo: string; valor: number; tipo?: "total" | "sub" | "saida"; dica?: string }> = [
    { rotulo: "Receita bruta de vendas", valor: r.vendas.bruto_centavos },
    { rotulo: "(−) Descontos concedidos", valor: -r.vendas.descontos_centavos, tipo: "saida" },
    { rotulo: "= Receita líquida de vendas", valor: r.vendas.receita_centavos, tipo: "total" },
    { rotulo: "(−) Custo das mercadorias vendidas (CMV)", valor: -r.cmv_centavos, tipo: "saida" },
    { rotulo: "= Lucro bruto", valor: r.lucro_bruto_centavos, tipo: "total", dica: r.margem_bruta_bp === null ? undefined : `margem ${porcento(r.margem_bruta_bp)}` },
    { rotulo: "(−) Taxas de cartão e PIX", valor: -r.taxas_centavos, tipo: "saida" },
    { rotulo: "(−) Perdas, brindes e uso na loja", valor: -r.perdas.total_centavos, tipo: "saida" },
    { rotulo: "(+) Outras receitas", valor: r.outras_receitas.total_centavos },
    ...r.outras_receitas.por_categoria.map((c) => ({ rotulo: c.nome, valor: c.total_centavos, tipo: "sub" as const })),
    { rotulo: "(−) Despesas operacionais", valor: -r.despesas.total_centavos, tipo: "saida" },
    ...r.despesas.por_categoria.map((c) => ({ rotulo: c.nome, valor: -c.total_centavos, tipo: "sub" as const })),
    { rotulo: "= Lucro líquido do período", valor: r.lucro_liquido_centavos, tipo: "total", dica: r.margem_liquida_bp === null ? undefined : `margem ${porcento(r.margem_liquida_bp)}` },
  ];
  const fora = [...r.fora_do_resultado.receitas.map((c) => ({ ...c, tipo: "receita" })), ...r.fora_do_resultado.despesas.map((c) => ({ ...c, tipo: "despesa" }))];
  return (
    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <Cartao rotulo={`${data(r.de)} a ${data(r.ate)}`} titulo="Demonstração do resultado (gerencial)">
        <table className="w-full text-[14px]">
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i} className={cx(l.tipo === "total" && "border-t border-borda font-extrabold", l.tipo === "sub" && "text-[13px] text-[#6c6f75]")}>
                <td className={cx("py-2", l.tipo === "sub" && "pl-6")}>
                  {l.rotulo}
                  {l.dica && <span className="ml-2 text-[12px] font-semibold text-suave">{l.dica}</span>}
                </td>
                <td className={cx("py-2 text-right tabular-nums", l.valor < 0 && l.tipo !== "sub" && "text-[#8f1d21]", l.tipo === "total" && l.valor < 0 && "text-perigo")}>
                  {l.valor < 0 ? reaisSaida(l.valor) : reais(l.valor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(r.despesas.pendente_centavos > 0 || r.outras_receitas.pendente_centavos > 0) && (
          <p className="mt-3 text-[12px] text-alerta">
            Inclui valores ainda não pagos ou recebidos (o resultado é por competência): despesas {reais(r.despesas.pendente_centavos)}, receitas {reais(r.outras_receitas.pendente_centavos)}.
          </p>
        )}
      </Cartao>
      <div className="flex flex-col gap-4">
        <div className={cx("rounded-[18px] border px-5 py-4", r.lucro_liquido_centavos < 0 ? "border-[#f3c2c2] bg-[#fff5f5]" : "border-[#bfe3cd] bg-[#f0faf4]")}>
          <p className="rotulo">{r.lucro_liquido_centavos < 0 ? "Prejuízo do período" : "Lucro líquido do período"}</p>
          <p className={cx("mt-1 text-[38px] leading-none font-black tracking-tight", r.lucro_liquido_centavos < 0 ? "text-perigo" : "text-[#0f6a41]")} data-testid="lucro-liquido">
            {r.lucro_liquido_centavos < 0 ? `−${reais(-r.lucro_liquido_centavos)}` : reais(r.lucro_liquido_centavos)}
          </p>
          <p className="mt-1.5 text-[12.5px] text-[#4a4d52]">
            {r.margem_liquida_bp === null ? "sem receita no período" : `margem líquida ${porcento(r.margem_liquida_bp)} sobre a receita de ${reais(r.vendas.receita_centavos)}`}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Kpi rotulo="Vendas" valor={r.vendas.quantidade} dica={r.vendas.canceladas_quantidade ? `${plural(r.vendas.canceladas_quantidade, "cancelada")} fora da conta` : "concluídas"} />
          <Kpi rotulo="Ticket médio" valor={reais(r.vendas.ticket_medio_centavos)} />
        </div>
        <Cartao rotulo="Fora do resultado" titulo="Movimentos que não são lucro nem prejuízo">
          {fora.length === 0 ? (
            <p className="text-[13px] text-suave">Nenhum no período.</p>
          ) : (
            <div className="divide-y divide-[#efefeb] text-[14px]">
              {fora.map((c) => (
                <Linha key={`${c.tipo}-${c.categoria_id}`} rotulo={c.nome} valor={c.tipo === "despesa" ? reaisSaida(-c.total_centavos) : reais(c.total_centavos)} />
              ))}
            </div>
          )}
          <p className="mt-3 text-[12px] text-suave">Compra de mercadoria vira estoque (o custo entra no CMV quando vende). Retiradas e aportes do dono mexem no caixa, mas não no lucro.</p>
        </Cartao>
        <p className="text-[12px] text-suave">DRE gerencial, feita com os dados do sistema. Não substitui a contabilidade oficial da empresa.</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Formulários                                                          */
/* ------------------------------------------------------------------ */
function FormularioLancamento({ tipo, lancamento, aoFechar }: { tipo: TipoLancamento; lancamento?: Lancamento; aoFechar: () => void }) {
  const categorias = useApi<Categoria[]>(`/api/financeiro/categorias?tipo=${tipo}`);
  const hoje = hojeLocal();
  const [f, setF] = useState({
    descricao: lancamento?.descricao ?? "",
    categoria_id: lancamento?.categoria_id ?? 0,
    valor: lancamento?.valor_centavos ?? null,
    data: lancamento?.data ?? hoje,
    pago: lancamento ? lancamento.pago : true,
    data_pagamento: hoje,
    origem: "conta" as Origem,
    vencimento: lancamento?.vencimento ?? hoje,
    repetir: 1,
    observacao: lancamento?.observacao ?? "",
  });
  const [erro, setErro] = useState<{ texto: string; campo: string | null } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const cats = useMemo(() => (categorias.dados ?? []).filter((c) => c.sistema !== "compra_mercadoria" || c.id === lancamento?.categoria_id), [categorias.dados, lancamento]);
  const categoriaId = f.categoria_id || cats[0]?.id || 0;
  const despesa = tipo === "despesa";

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!f.descricao.trim()) return setErro({ texto: "Informe a descrição.", campo: "descricao" });
    if (!f.valor) return setErro({ texto: "Informe o valor.", campo: "valor_centavos" });
    setEnviando(true);
    setErro(null);
    try {
      if (lancamento) {
        await api.put(`/api/financeiro/lancamentos/${lancamento.id}`, {
          descricao: f.descricao,
          categoria_id: categoriaId,
          valor_centavos: f.valor,
          data: f.data,
          vencimento: lancamento.pago ? null : f.vencimento,
          observacao: f.observacao,
        });
        avisar("Lançamento atualizado.");
      } else {
        await api.post("/api/financeiro/lancamentos", {
          tipo,
          descricao: f.descricao,
          categoria_id: categoriaId,
          valor_centavos: f.valor,
          data: f.data,
          observacao: f.observacao,
          pagamento: f.pago ? { pago: true, data_pagamento: f.data_pagamento, origem: f.origem } : { pago: false, vencimento: f.vencimento },
          repetir_meses: f.repetir,
        });
        avisar(f.repetir > 1 ? `Lançado para ${f.repetir} meses.` : despesa ? "Despesa lançada." : "Receita lançada.");
      }
      avisarMudanca();
      aoFechar();
    } catch (er) {
      setErro({ texto: mensagemDeErro(er), campo: er instanceof ErroApi ? er.campo : null });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={lancamento ? "Editar lançamento" : despesa ? "Nova despesa" : "Nova receita"}
      subtitulo={despesa ? "Aluguel, luz, fornecedor, salário… (vendas da frente de caixa entram sozinhas)" : "Dinheiro que entra fora da frente de caixa."}
      largura="lg"
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-lanc" carregando={enviando}>
            {lancamento ? "Salvar" : "Lançar"}
          </Botao>
        </>
      }
    >
      <form id="form-lanc" onSubmit={salvar} className="grid gap-4 md:grid-cols-2">
        {erro && !["descricao", "valor_centavos"].includes(erro.campo ?? "") && (
          <div className="md:col-span-2">
            <AvisoErro mensagem={erro.texto} />
          </div>
        )}
        <Campo rotulo="Descrição *" erro={erro?.campo === "descricao" ? erro.texto : null} className="md:col-span-2">
          <Entrada autoFocus value={f.descricao} maxLength={120} onChange={(e) => setF({ ...f, descricao: e.target.value })} placeholder={despesa ? "Ex.: Aluguel da loja" : "Ex.: Encomenda de pipas personalizadas"} />
        </Campo>
        <Campo rotulo="Categoria">
          <Selecao value={categoriaId} onChange={(e) => setF({ ...f, categoria_id: Number(e.target.value) })}>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
                {c.conta_no_resultado ? "" : " (fora do resultado)"}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Valor *" erro={erro?.campo === "valor_centavos" ? erro.texto : null}>
          <CampoDinheiro valor={f.valor} aoMudar={(v) => setF({ ...f, valor: v })} />
        </Campo>
        <Campo rotulo="Data de referência" dica="Mês em que entra no resultado (DRE).">
          <Entrada type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} />
        </Campo>
        {lancamento ? (
          !lancamento.pago && (
            <Campo rotulo="Vencimento">
              <Entrada type="date" value={f.vencimento} onChange={(e) => setF({ ...f, vencimento: e.target.value })} />
            </Campo>
          )
        ) : (
          <div className="rounded-2xl border border-borda p-4 md:col-span-2">
            <div className="grid grid-cols-2 gap-2">
              {[true, false].map((pago) => (
                <button
                  key={String(pago)}
                  type="button"
                  onClick={() => setF({ ...f, pago })}
                  className={cx("rounded-xl border px-3 py-2.5 text-left text-[13.5px] font-semibold", f.pago === pago ? "border-tinta bg-[#f6f6f3] ring-1 ring-tinta" : "border-borda")}
                >
                  {pago ? (despesa ? "Já está paga" : "Já foi recebida") : despesa ? "A pagar" : "A receber"}
                </button>
              ))}
            </div>
            {f.pago ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Campo rotulo={despesa ? "Data do pagamento" : "Data do recebimento"}>
                  <Entrada type="date" value={f.data_pagamento} max={hoje} onChange={(e) => setF({ ...f, data_pagamento: e.target.value })} />
                </Campo>
                <Campo rotulo="De onde saiu / para onde foi o dinheiro" dica={f.origem === "gaveta" ? "Mexe no dinheiro do caixa aberto (só hoje)." : undefined}>
                  <Selecao value={f.origem} onChange={(e) => setF({ ...f, origem: e.target.value as Origem })}>
                    <option value="conta">Banco, PIX ou cartão</option>
                    <option value="gaveta">Dinheiro da gaveta do caixa</option>
                  </Selecao>
                </Campo>
              </div>
            ) : (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Campo rotulo="Vencimento">
                  <Entrada type="date" value={f.vencimento} onChange={(e) => setF({ ...f, vencimento: e.target.value })} />
                </Campo>
              </div>
            )}
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Campo rotulo="Repetir todo mês" dica={f.repetir > 1 ? `Cria ${f.repetir} lançamentos, um por mês (só o primeiro como pago, se marcado).` : "Para contas fixas (aluguel, internet…)."}>
                <Selecao value={f.repetir} onChange={(e) => setF({ ...f, repetir: Number(e.target.value) })}>
                  <option value={1}>Não repetir</option>
                  {[2, 3, 6, 12, 24].map((n) => (
                    <option key={n} value={n}>
                      Por {n} meses
                    </option>
                  ))}
                </Selecao>
              </Campo>
            </div>
          </div>
        )}
        <Campo rotulo="Observação" className="md:col-span-2">
          <Entrada value={f.observacao} maxLength={500} onChange={(e) => setF({ ...f, observacao: e.target.value })} placeholder="Opcional" />
        </Campo>
      </form>
    </Modal>
  );
}

function PagarLancamento({ lancamento, aoFechar }: { lancamento: Lancamento; aoFechar: () => void }) {
  const hoje = hojeLocal();
  const [dataPg, setDataPg] = useState(hoje);
  const [origem, setOrigem] = useState<Origem>("conta");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const despesa = lancamento.tipo === "despesa";
  async function salvar() {
    setEnviando(true);
    setErro(null);
    try {
      await api.post(`/api/financeiro/lancamentos/${lancamento.id}/pagar`, { data_pagamento: dataPg, origem });
      avisar(despesa ? "Conta paga." : "Recebimento registrado.");
      avisarMudanca();
      aoFechar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }
  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      largura="sm"
      titulo={despesa ? "Registrar pagamento" : "Registrar recebimento"}
      subtitulo={`${lancamento.descricao} · ${reais(lancamento.valor_centavos)}`}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao onClick={() => void salvar()} carregando={enviando}>
            Confirmar
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        <Campo rotulo="Data">
          <Entrada type="date" value={dataPg} max={hoje} onChange={(e) => setDataPg(e.target.value)} />
        </Campo>
        <Campo rotulo={despesa ? "Pago com" : "Recebido em"}>
          <Selecao value={origem} onChange={(e) => setOrigem(e.target.value as Origem)}>
            <option value="conta">Banco, PIX ou cartão</option>
            <option value="gaveta">Dinheiro da gaveta do caixa (só hoje, com o caixa aberto)</option>
          </Selecao>
        </Campo>
        {erro && <AvisoErro mensagem={erro} />}
      </div>
    </Modal>
  );
}
