import { AlertTriangle, ArrowRight, Boxes, CalendarClock, CheckCircle2, Circle, Factory, PackagePlus, Receipt, ShoppingCart, TrendingUp, Wallet } from "lucide-react";
import { usePode } from "../auth";
import { AvisoErro, Botao, Cabecalho, Carregando, Cartao, cx, Etiqueta, Kpi, Vazio } from "../componentes/ui";
import { data, dataHora, hora, plural, porcento, quantidade, reais, relativoAoDia, saudacao } from "../formato";
import { useApi } from "../hooks";
import { irPara } from "../rotas";
import type { AlertaEstoque, Config, FormaPagamento, PainelInicio, SugestaoProducao } from "../tipos";

export default function Inicio() {
  const painel = useApi<PainelInicio>("/api/inicio");
  const config = useApi<Config>("/api/config");
  const formas = useApi<FormaPagamento[]>("/api/formas-pagamento");
  const alertas = useApi<AlertaEstoque[]>("/api/estoque/alertas");
  const veProducao = usePode("produtos");
  const producao = useApi<SugestaoProducao>(veProducao ? "/api/producao/sugestao" : null);
  const p = painel.dados;

  if (painel.erro && !p) return <AvisoErro mensagem={painel.erro} aoTentar={painel.recarregar} />;
  if (!p) return <Carregando />;

  const passos = [
    {
      feito: !!(config.dados && (config.dados.loja_telefone || config.dados.loja_endereco || config.dados.loja_documento)),
      titulo: "Dados da loja no comprovante",
      texto: "Endereço, telefone e CNPJ que saem impressos.",
      ir: () => irPara("configuracoes"),
    },
    {
      feito: p.produtos_ativos > 0,
      titulo: "Cadastrar os produtos",
      texto: "Nome, preço de venda, custo e código de barras.",
      ir: () => irPara("produtos", "novo=1"),
    },
    {
      feito: (formas.dados ?? []).some((f) => f.taxa_bp > 0),
      titulo: "Taxas das maquininhas",
      texto: "Para o lucro descontar o que fica com o cartão e o PIX.",
      ir: () => irPara("configuracoes", "secao=formas"),
    },
    { feito: p.caixa.aberto, titulo: "Abrir o caixa", texto: "Informe o fundo de troco e comece a vender.", ir: () => irPara("pdv") },
  ];
  const faltam = passos.filter((x) => !x.feito).length;

  return (
    <div className="flex flex-col gap-5">
      <Cabecalho
        rotulo="Início"
        titulo={`${saudacao()}!`}
        descricao="Resumo do dia e do mês, só com o que foi registrado no sistema."
        acoes={
          <Botao icone={<ShoppingCart className="size-4" />} onClick={() => irPara("pdv")}>
            Frente de caixa
          </Botao>
        }
      />

      {faltam > 0 && (p.produtos_ativos === 0 || faltam >= 2) && (
        <Cartao rotulo="Primeiros passos" titulo={`Falta${faltam === 1 ? "" : "m"} ${faltam} de ${passos.length} para a loja ficar pronta`}>
          <ol className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
            {passos.map((passo, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={passo.ir}
                  className={cx(
                    "flex h-full w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors",
                    passo.feito ? "border-[#cfe9da] bg-[#f3fbf6]" : "border-borda hover:border-[#bdbdb7] hover:bg-[#fafaf8]",
                  )}
                >
                  {passo.feito ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-sucesso" /> : <Circle className="mt-0.5 size-5 shrink-0 text-[#b5b6b1]" />}
                  <span>
                    <span className="block text-[13.5px] font-bold">
                      {i + 1}. {passo.titulo}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-suave">{passo.texto}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </Cartao>
      )}

      <div>
        <p className="rotulo mb-2">Hoje · {data(p.hoje)}</p>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Kpi rotulo="Vendas" valor={p.dia.vendas.toLocaleString("pt-BR")} dica="vendas concluídas" icone={<Receipt className="size-4" />} />
          <Kpi rotulo="Faturamento" valor={reais(p.dia.receita_centavos)} dica="já com descontos" icone={<TrendingUp className="size-4" />} />
          <Kpi
            rotulo="Lucro bruto"
            valor={reais(p.dia.lucro_bruto_centavos)}
            dica={p.dia.margem_bruta_bp === null ? "sem vendas para calcular a margem" : `margem de ${porcento(p.dia.margem_bruta_bp)}`}
            tom={p.dia.lucro_bruto_centavos < 0 ? "ruim" : "neutro"}
          />
          <Kpi rotulo="Ticket médio" valor={reais(p.dia.ticket_medio_centavos)} dica={p.dia.ticket_medio_centavos === null ? "sem vendas hoje" : "valor médio por venda"} />
        </div>
      </div>

      <div>
        <p className="rotulo mb-2">
          Este mês · {data(p.mes.de)} a {data(p.mes.ate)}
        </p>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Kpi rotulo="Faturamento do mês" valor={reais(p.mes.receita_centavos)} dica={plural(p.mes.vendas, "venda")} />
          <Kpi rotulo="Lucro bruto do mês" valor={reais(p.mes.lucro_bruto_centavos)} dica="faturamento − custo das mercadorias" />
          <Kpi rotulo="Despesas do mês" valor={reais(p.mes.despesas_centavos)} dica="lançadas no financeiro" />
          <Kpi
            rotulo="Lucro líquido do mês"
            valor={p.mes.lucro_liquido_centavos < 0 ? `−${reais(-p.mes.lucro_liquido_centavos)}` : reais(p.mes.lucro_liquido_centavos)}
            dica={p.mes.margem_liquida_bp === null ? "sem receita no mês" : `margem líquida de ${porcento(p.mes.margem_liquida_bp)}`}
            tom={p.mes.lucro_liquido_centavos < 0 ? "ruim" : p.mes.lucro_liquido_centavos > 0 ? "bom" : "neutro"}
          />
        </div>
        {p.produtos_sem_custo > 0 && (
          <p className="mt-2.5 flex items-center gap-2 text-[12.5px] text-alerta">
            <AlertTriangle className="size-3.5" />
            {plural(p.produtos_sem_custo, "produto ativo está", "produtos ativos estão")} sem preço de custo: o lucro deles aparece maior do que é.
            <button type="button" className="font-semibold underline" onClick={() => irPara("produtos")}>
              Corrigir
            </button>
          </p>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Cartao rotulo="Caixa" titulo={p.caixa.aberto ? "Caixa aberto" : "Caixa fechado"} acoes={<Wallet className="size-5 text-suave" />}>
          {p.caixa.aberto ? (
            <div className="space-y-3">
              <p className="text-[13.5px] text-[#4a4d52]">
                Desde {hora(p.caixa.aberto_em)}
                {p.caixa.operador ? ` · ${p.caixa.operador}` : ""} · {plural(p.caixa.vendas, "venda")} ({reais(p.caixa.vendas_total_centavos)})
              </p>
              <div className="rounded-2xl bg-[#f4f4f1] px-4 py-3">
                <p className="rotulo">Dinheiro esperado na gaveta</p>
                <p className="mt-1 text-[26px] leading-none font-black tracking-tight tabular-nums">{reais(p.caixa.dinheiro_na_gaveta_centavos)}</p>
              </div>
              <Botao variante="secundario" className="w-full" onClick={() => irPara("caixa")}>
                Sangria, suprimento ou fechamento
              </Botao>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[13.5px] text-[#4a4d52]">
                {p.caixa.ultimo_fechamento
                  ? `Último fechamento: ${dataHora(p.caixa.ultimo_fechamento.fechado_em)} · diferença de ${reais(p.caixa.ultimo_fechamento.diferenca_centavos)}.`
                  : "O caixa ainda não foi aberto nenhuma vez."}
              </p>
              <Botao className="w-full" onClick={() => irPara("pdv")}>
                Abrir caixa e vender
              </Botao>
            </div>
          )}
        </Cartao>

        <Cartao
          rotulo="Contas"
          titulo="Vencidas e próximos 7 dias"
          acoes={
            <Botao variante="fantasma" tamanho="sm" onClick={() => irPara("financeiro")}>
              Ver tudo <ArrowRight className="size-3.5" />
            </Botao>
          }
        >
          {p.contas.vencidas.length + p.contas.proximas.length === 0 ? (
            <Vazio icone={<CalendarClock className="size-5" />} titulo="Nada vencendo" texto="Contas a pagar e a receber lançadas no financeiro aparecem aqui." />
          ) : (
            <ul className="divide-y divide-[#efefeb]">
              {[...p.contas.vencidas, ...p.contas.proximas].slice(0, 6).map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold">{l.descricao}</p>
                    <p className={cx("text-[12px]", l.situacao === "vencido" ? "font-semibold text-perigo" : "text-suave")}>
                      {l.tipo === "despesa" ? "Pagar" : "Receber"} · vence {l.vencimento ? relativoAoDia(l.vencimento) : "—"}
                    </p>
                  </div>
                  <span className={cx("text-[13.5px] font-bold tabular-nums", l.tipo === "receita" ? "text-sucesso" : "text-tinta")}>{reais(l.valor_centavos)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-2 text-[12.5px]">
            <Etiqueta tom="neutro">A pagar {reais(p.contas.a_pagar_centavos)}</Etiqueta>
            <Etiqueta tom="neutro">A receber {reais(p.contas.a_receber_centavos)}</Etiqueta>
          </div>
        </Cartao>

        <Cartao
          rotulo="Estoque"
          titulo={alertas.dados?.length ? `${plural(alertas.dados.length, "produto acabando", "produtos acabando")}` : "Estoque em dia"}
          acoes={
            alertas.dados?.length ? (
              <Botao variante="fantasma" tamanho="sm" onClick={() => irPara("produtos", "filtro=acabando")}>
                Ver <ArrowRight className="size-3.5" />
              </Botao>
            ) : (
              <Boxes className="size-5 text-suave" />
            )
          }
        >
          {alertas.erro ? (
            <AvisoErro mensagem={alertas.erro} aoTentar={alertas.recarregar} />
          ) : !alertas.dados ? (
            <Carregando />
          ) : alertas.dados.length === 0 ? (
            <Vazio
              icone={<PackagePlus className="size-5" />}
              titulo={p.produtos_ativos ? "Nada acabando" : "Sem produtos cadastrados"}
              texto={
                p.produtos_ativos
                  ? "Nenhum produto zerado, no mínimo ou durando pouco no ritmo de venda. Defina o estoque mínimo nos produtos para o aviso ficar mais preciso."
                  : "Cadastre os produtos para controlar o estoque."
              }
            />
          ) : (
            <ul className="divide-y divide-[#efefeb]">
              {alertas.dados.slice(0, 6).map((a) => (
                <li key={a.produto_id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold">{a.nome}</p>
                    <p className="truncate text-[12px] text-suave">{a.texto}</p>
                  </div>
                  <Etiqueta tom={a.motivo === "zerado" || a.motivo === "negativo" ? "perigo" : "alerta"}>
                    {a.motivo === "zerado" ? "Esgotado" : a.motivo === "negativo" ? "Negativo" : a.motivo === "abaixo_minimo" ? "No mínimo" : "Dura pouco"}
                  </Etiqueta>
                </li>
              ))}
            </ul>
          )}
          {alertas.dados && alertas.dados.length > 6 && <p className="mt-2 text-[12px] text-suave">e mais {alertas.dados.length - 6}…</p>}
          {producao.dados && (producao.dados.resumo.produzir_itens > 0 || producao.dados.resumo.comprar_itens > 0) && (
            <button
              type="button"
              onClick={() => irPara("producao")}
              className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-borda px-3.5 py-2.5 text-left hover:border-[#bdbdb7] hover:bg-[#fafaf8]"
            >
              <Factory className="size-5 shrink-0 text-suave" />
              <span className="min-w-0 flex-1 text-[13px]">
                <b>Sugestão de produção:</b> {plural(producao.dados.resumo.produzir_itens, "produto para produzir", "produtos para produzir")} ·{" "}
                {plural(producao.dados.resumo.comprar_itens, "para comprar", "para comprar")}
              </span>
              <ArrowRight className="size-4 shrink-0 text-suave" />
            </button>
          )}
        </Cartao>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Cartao
          rotulo="Movimento"
          titulo="Últimas vendas"
          acoes={
            <Botao variante="fantasma" tamanho="sm" onClick={() => irPara("vendas")}>
              Ver vendas <ArrowRight className="size-3.5" />
            </Botao>
          }
          corpo={false}
        >
          {p.ultimas_vendas.length === 0 ? (
            <Vazio icone={<Receipt className="size-5" />} titulo="Nenhuma venda registrada" texto="As vendas feitas na frente de caixa aparecem aqui." />
          ) : (
            <table className="tabela mt-2">
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Quando</th>
                  <th>Pagamento</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {p.ultimas_vendas.map((v) => (
                  <tr key={v.id} className="clicavel" onClick={() => irPara("vendas", `id=${v.id}`)}>
                    <td className="font-semibold">{v.numero}</td>
                    <td className="text-[#55585e]">{dataHora(v.criado_em)}</td>
                    <td className="text-[#55585e]">{v.formas || "—"}</td>
                    <td className={cx("num font-semibold", v.status === "cancelada" && "text-suave line-through")}>{reais(v.total_centavos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Cartao>

        <Cartao rotulo="Este mês" titulo="Produtos que mais deram lucro" corpo={false}>
          {p.mais_vendidos_mes.length === 0 ? (
            <Vazio icone={<TrendingUp className="size-5" />} titulo="Sem vendas no mês" texto="O ranking aparece depois das primeiras vendas." />
          ) : (
            <table className="tabela mt-2">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th className="num">Qtd.</th>
                  <th className="num">Faturamento</th>
                  <th className="num">Lucro bruto</th>
                </tr>
              </thead>
              <tbody>
                {p.mais_vendidos_mes.map((l) => (
                  <tr key={l.produto_id}>
                    <td className="font-semibold">{l.nome}</td>
                    <td className="num">{quantidade(l.quantidade)}</td>
                    <td className="num">{reais(l.receita_centavos)}</td>
                    <td className="num font-semibold">{reais(l.lucro_centavos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Cartao>
      </div>
    </div>
  );
}
