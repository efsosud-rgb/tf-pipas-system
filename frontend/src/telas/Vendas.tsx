import { Ban, Printer, Receipt } from "lucide-react";
import { useState } from "react";
import { api, consulta, mensagemDeErro } from "../api";
import { usePode } from "../auth";
import { avisar, confirmar } from "../componentes/avisos";
import { imprimirComprovante } from "../componentes/comprovante";
import { FiltroPeriodo, periodoDoMes, type Periodo } from "../componentes/periodo";
import { Abas, AvisoErro, Botao, Cabecalho, Carregando, Cartao, cx, Etiqueta, Kpi, Linha, Modal, Selecao, Vazio } from "../componentes/ui";
import { dataHora, plural, quantidade, reais } from "../formato";
import { avisarMudanca, useApi } from "../hooks";
import { parametrosDaRota } from "../rotas";
import type { Config, Venda, VendaNaLista } from "../tipos";

export default function Vendas() {
  const [periodo, setPeriodo] = useState<Periodo>(periodoDoMes);
  const [status, setStatus] = useState<"" | "concluida" | "cancelada">("");
  const lista = useApi<VendaNaLista[]>(`/api/vendas${consulta({ de: periodo.de, ate: periodo.ate, status })}`);
  const veLucro = usePode("financeiro");
  const [vendedor, setVendedor] = useState("");
  const [aberta, setAberta] = useState<number | null>(() => {
    const id = Number(parametrosDaRota().get("id"));
    return id > 0 ? id : null;
  });

  const vendedores = [...new Set((lista.dados ?? []).map((v) => v.usuario_nome).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const mostradas = (lista.dados ?? []).filter((v) => !vendedor || v.usuario_nome === vendedor);
  const concluidas = mostradas.filter((v) => v.status === "concluida");
  const total = concluidas.reduce((s, v) => s + v.total_centavos, 0);
  const lucro = concluidas.reduce((s, v) => s + (v.lucro_bruto_centavos ?? 0), 0);
  const canceladas = mostradas.filter((v) => v.status === "cancelada").length;

  return (
    <div className="flex flex-col gap-5">
      <Cabecalho rotulo="Movimento" titulo="Vendas" descricao="Todas as vendas da frente de caixa. Clique numa venda para ver os itens, reimprimir ou cancelar." />
      <FiltroPeriodo valor={periodo} aoMudar={setPeriodo} />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi rotulo="Vendas concluídas" valor={lista.dados ? concluidas.length : "—"} />
        <Kpi rotulo="Faturamento" valor={lista.dados ? reais(total) : "—"} />
        {veLucro ? (
          <Kpi rotulo="Lucro bruto" valor={lista.dados ? reais(lucro) : "—"} dica="antes das taxas e despesas" />
        ) : (
          <Kpi rotulo="Ticket médio" valor={lista.dados && concluidas.length ? reais(Math.round(total / concluidas.length)) : "—"} />
        )}
        <Kpi rotulo="Canceladas" valor={lista.dados ? canceladas : "—"} tom={canceladas ? "alerta" : "neutro"} />
      </div>
      {(lista.dados?.length ?? 0) >= 300 && <p className="text-[12.5px] text-alerta">Mostrando as 300 vendas mais recentes do período. Escolha um período menor para ver todas.</p>}
      <Cartao corpo={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#efefeb] p-3">
          <Abas
            abas={[
              { id: "", rotulo: "Todas" },
              { id: "concluida", rotulo: "Concluídas" },
              { id: "cancelada", rotulo: "Canceladas" },
            ]}
            ativa={status}
            aoMudar={setStatus}
          />
          {vendedores.length > 1 && (
            <div className="w-[220px]">
              <Selecao value={vendedor} onChange={(e) => setVendedor(e.target.value)} aria-label="Filtrar por vendedor">
                <option value="">Todos os vendedores</option>
                {vendedores.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </Selecao>
            </div>
          )}
        </div>
        {lista.erro && (
          <div className="p-4">
            <AvisoErro mensagem={lista.erro} aoTentar={lista.recarregar} />
          </div>
        )}
        {!lista.dados ? (
          <Carregando />
        ) : mostradas.length === 0 ? (
          <Vazio icone={<Receipt className="size-6" />} titulo="Nenhuma venda no período" texto="Escolha outro período ou faça vendas na frente de caixa." />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Data e hora</th>
                  <th>Vendedor</th>
                  <th>Cliente</th>
                  <th className="num">Itens</th>
                  <th>Pagamento</th>
                  <th className="num">Desconto</th>
                  <th className="num">Total</th>
                  {veLucro && <th className="num">Lucro bruto</th>}
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {mostradas.map((v) => (
                  <tr key={v.id} className="clicavel" onClick={() => setAberta(v.id)}>
                    <td className="font-semibold">{v.numero}</td>
                    <td>{dataHora(v.criado_em)}</td>
                    <td className="text-[#55585e]">{v.usuario_nome || "—"}</td>
                    <td className="text-[#55585e]">{v.cliente || "—"}</td>
                    <td className="num">{v.itens_quantidade}</td>
                    <td className="text-[#55585e]">{v.formas}</td>
                    <td className="num text-[#55585e]">{v.desconto_centavos ? reais(v.desconto_centavos) : "—"}</td>
                    <td className={cx("num font-semibold", v.status === "cancelada" && "text-suave line-through")}>{reais(v.total_centavos)}</td>
                    {veLucro && <td className="num">{v.status === "cancelada" ? "—" : reais(v.lucro_bruto_centavos)}</td>}
                    <td>{v.status === "cancelada" ? <Etiqueta tom="perigo">Cancelada</Etiqueta> : <Etiqueta tom="ok">Concluída</Etiqueta>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
      {aberta && <DetalheVenda id={aberta} aoFechar={() => setAberta(null)} />}
    </div>
  );
}

export function DetalheVenda({ id, aoFechar }: { id: number; aoFechar: () => void }) {
  const venda = useApi<Venda>(`/api/vendas/${id}`);
  const config = useApi<Config>("/api/config");
  const [erro, setErro] = useState<string | null>(null);
  const veLucro = usePode("financeiro");
  const podeCancelar = usePode("cancelar_venda");
  const v = venda.dados;

  async function cancelar() {
    if (!v) return;
    const dinheiro = v.pagamentos.filter((p) => p.forma_tipo === "dinheiro").reduce((s, p) => s + p.valor_centavos, 0);
    const outros = v.pagamentos.filter((p) => p.forma_tipo !== "dinheiro");
    const r = await confirmar({
      titulo: `Cancelar a venda nº ${v.numero}?`,
      texto: (
        <div className="space-y-2">
          <p>Os produtos voltam para o estoque e a venda sai dos relatórios.</p>
          {dinheiro > 0 && <p>• {reais(dinheiro)} em dinheiro saem da gaveta do caixa aberto (devolução ao cliente).</p>}
          {outros.length > 0 && <p>• {outros.map((p) => `${p.forma_nome} ${reais(p.valor_centavos)}`).join(", ")}: devolva pela maquininha ou pelo banco — o sistema não estorna sozinho.</p>}
        </div>
      ),
      confirmar: "Cancelar venda",
      perigo: true,
      pedirTexto: { rotulo: "Motivo do cancelamento", placeholder: "Ex.: cliente desistiu", minimo: 3 },
    });
    if (!r.ok) return;
    setErro(null);
    try {
      await api.post(`/api/vendas/${v.id}/cancelar`, { motivo: r.texto });
      avisar(`Venda nº ${v.numero} cancelada.`);
      avisarMudanca();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      lado
      largura="lg"
      titulo={v ? `Venda nº ${v.numero}` : `Venda nº ${id}`}
      subtitulo={v ? `${dataHora(v.criado_em)} · caixa nº ${v.sessao_id}${v.usuario_nome ? ` · vendida por ${v.usuario_nome}` : ""}` : undefined}
      rodape={
        v && (
          <>
            {v.status === "concluida" && podeCancelar && (
              <Botao variante="perigo" icone={<Ban className="size-4" />} onClick={() => void cancelar()} className="mr-auto">
                Cancelar venda
              </Botao>
            )}
            {v.status === "concluida" && !podeCancelar && <p className="mr-auto text-[12.5px] text-suave">Cancelar venda: só com permissão do administrador.</p>}
            <Botao variante="secundario" icone={<Printer className="size-4" />} onClick={() => imprimirComprovante(v, config.dados)}>
              Reimprimir comprovante
            </Botao>
          </>
        )
      }
    >
      {venda.erro && <AvisoErro mensagem={venda.erro} />}
      {!v ? (
        <Carregando />
      ) : (
        <div className="space-y-5">
          {v.status === "cancelada" && (
            <div className="rounded-2xl bg-[#fde6e6] p-4 text-[13.5px] text-[#8f1d21]">
              <p className="font-bold">
                Venda cancelada em {dataHora(v.cancelada_em)}
                {v.cancelada_por ? ` por ${v.cancelada_por}` : ""}
              </p>
              <p>Motivo: {v.motivo_cancelamento}</p>
            </div>
          )}
          {erro && <AvisoErro mensagem={erro} />}
          <table className="tabela">
            <thead>
              <tr>
                <th>Produto</th>
                <th className="num">Qtd.</th>
                <th className="num">Preço</th>
                <th className="num">Desconto</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {v.itens.map((i) => (
                <tr key={i.produto_id}>
                  <td className="font-semibold">{i.nome}</td>
                  <td className="num">{quantidade(i.quantidade, i.unidade)}</td>
                  <td className="num">
                    {i.preco_base_centavos !== null && i.preco_base_centavos !== i.preco_unitario_centavos ? (
                      <span title={`Preço normal ${reais(i.preco_base_centavos)} — preço por quantidade aplicado`}>
                        <s className="mr-1 text-[12px] text-suave">{reais(i.preco_base_centavos)}</s>
                        {reais(i.preco_unitario_centavos)}
                        <span className="ml-1 rounded bg-[#e3f4ea] px-1 text-[10.5px] font-bold text-[#12663f]">atacado</span>
                      </span>
                    ) : (
                      reais(i.preco_unitario_centavos)
                    )}
                  </td>
                  <td className="num text-suave">{i.desconto_centavos ? reais(i.desconto_centavos) : "—"}</td>
                  <td className="num font-semibold">{reais(i.total_centavos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-[#f6f6f3] p-4 text-[14px]">
              <Linha rotulo="Subtotal" valor={reais(v.subtotal_centavos)} />
              <Linha rotulo="Desconto" valor={`− ${reais(v.desconto_centavos)}`} />
              <Linha rotulo="Total" valor={reais(v.total_centavos)} forte />
              {veLucro && (
                <>
                  <div className="my-2 h-px bg-borda" />
                  <Linha rotulo="Custo das mercadorias" valor={reais(v.custo_centavos)} recuo />
                  <Linha rotulo="Taxas (cartão/PIX)" valor={reais(v.taxas_centavos)} recuo />
                  <Linha rotulo="Lucro bruto" valor={reais(v.lucro_bruto_centavos)} recuo />
                </>
              )}
            </div>
            <div className="rounded-2xl border border-borda p-4 text-[14px]">
              <p className="rotulo mb-1">Pagamento</p>
              {v.pagamentos.map((p) => (
                <Linha key={p.forma_id} rotulo={p.forma_nome} valor={reais(p.recebido_centavos)} />
              ))}
              {v.troco_centavos > 0 && <Linha rotulo="Troco" valor={reais(v.troco_centavos)} forte />}
              {v.cliente && <p className="mt-2 text-[13px] text-suave">Cliente: {v.cliente}</p>}
              {v.observacao && <p className="text-[13px] text-suave">Obs.: {v.observacao}</p>}
            </div>
          </div>
          <p className="text-[12px] text-suave">{plural(v.itens.length, "item", "itens")} · preços e custos ficam congelados na venda (mudar o produto depois não altera esta venda).</p>
        </div>
      )}
    </Modal>
  );
}
