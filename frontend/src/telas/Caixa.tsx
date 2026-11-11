import { ArrowDownCircle, ArrowUpCircle, Lock, LockOpen, Printer } from "lucide-react";
import { useState } from "react";
import { api, mensagemDeErro } from "../api";
import { useUsuario } from "../auth";
import { avisar } from "../componentes/avisos";
import { ComprovanteFechamento, imprimirNoPapel } from "../componentes/comprovante";
import {
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
  Kpi,
  Linha,
  Modal,
  Vazio,
} from "../componentes/ui";
import { dataHora, hora, plural, reais } from "../formato";
import { avisarMudanca, useApi } from "../hooks";
import type { Config, ResumoCaixa, SessaoNaLista } from "../tipos";

const NOMES: Record<string, string> = {
  abertura: "Fundo de troco",
  venda: "Venda em dinheiro",
  sangria: "Sangria",
  suprimento: "Suprimento",
  cancelamento: "Devolução (venda cancelada)",
  despesa: "Despesa paga com a gaveta",
  receita: "Receita recebida na gaveta",
};

export default function Caixa() {
  const atual = useApi<{ caixa: ResumoCaixa | null }>("/api/caixa/atual");
  const sessoes = useApi<SessaoNaLista[]>("/api/caixa/sessoes");
  const [movimento, setMovimento] = useState<"sangria" | "suprimento" | null>(null);
  const [fechando, setFechando] = useState(false);
  const [detalhe, setDetalhe] = useState<number | null>(null);
  const caixa = atual.dados?.caixa ?? null;

  return (
    <div className="flex flex-col gap-5">
      <Cabecalho
        rotulo="Dinheiro da gaveta"
        titulo="Controle de caixa"
        descricao="Abertura com fundo de troco, sangrias, suprimentos e fechamento com a contagem do dinheiro. PIX e cartão não passam pela gaveta."
        acoes={
          caixa && (
            <>
              <Botao variante="secundario" icone={<ArrowDownCircle className="size-4" />} onClick={() => setMovimento("sangria")}>
                Sangria
              </Botao>
              <Botao variante="secundario" icone={<ArrowUpCircle className="size-4" />} onClick={() => setMovimento("suprimento")}>
                Suprimento
              </Botao>
              <Botao icone={<Lock className="size-4" />} onClick={() => setFechando(true)}>
                Fechar caixa
              </Botao>
            </>
          )
        }
      />
      {atual.erro && <AvisoErro mensagem={atual.erro} aoTentar={atual.recarregar} />}
      {!atual.dados ? (
        <Carregando />
      ) : caixa ? (
        <ResumoAberto resumo={caixa} />
      ) : (
        <AbrirCaixa />
      )}

      <Cartao rotulo="Histórico" titulo="Caixas anteriores" corpo={false}>
        {!sessoes.dados ? (
          <Carregando />
        ) : sessoes.dados.length === 0 ? (
          <Vazio titulo="Nenhum caixa aberto ainda" />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela mt-2">
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Abertura</th>
                  <th>Fechamento</th>
                  <th className="num">Vendas</th>
                  <th className="num">Esperado</th>
                  <th className="num">Contado</th>
                  <th className="num">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {sessoes.dados.map((s) => (
                  <tr key={s.id} className="clicavel" onClick={() => setDetalhe(s.id)}>
                    <td className="font-semibold">{s.id}</td>
                    <td>
                      {dataHora(s.aberto_em)}
                      {s.operador_abertura && <span className="text-suave"> · {s.operador_abertura}</span>}
                    </td>
                    <td>{s.aberta ? <Etiqueta tom="ok" ponto>Aberto</Etiqueta> : dataHora(s.fechado_em)}</td>
                    <td className="num">
                      {s.vendas_quantidade} · {reais(s.vendas_total_centavos)}
                    </td>
                    <td className="num">{s.aberta ? "—" : reais(s.esperado_centavos)}</td>
                    <td className="num">{s.aberta ? "—" : reais(s.contado_centavos)}</td>
                    <td className="num">{s.aberta ? "—" : <Diferenca valor={s.diferenca_centavos ?? 0} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      {movimento && caixa && <MovimentoGaveta tipo={movimento} gaveta={caixa.gaveta.esperado_centavos} aoFechar={() => setMovimento(null)} />}
      {fechando && caixa && <FecharCaixa resumo={caixa} aoFechar={() => setFechando(false)} />}
      {detalhe && <DetalheSessao id={detalhe} aoFechar={() => setDetalhe(null)} />}
    </div>
  );
}

function Diferenca({ valor }: { valor: number }) {
  if (valor === 0) return <span className="font-semibold text-sucesso">Bateu</span>;
  return (
    <span className={cx("font-semibold", valor < 0 ? "text-perigo" : "text-alerta")}>
      {valor > 0 ? "Sobrou " : "Faltou "}
      {reais(Math.abs(valor))}
    </span>
  );
}

function ResumoAberto({ resumo }: { resumo: ResumoCaixa }) {
  const g = resumo.gaveta;
  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Kpi rotulo="Dinheiro esperado na gaveta" valor={reais(g.esperado_centavos)} dica={`aberto às ${hora(resumo.sessao.aberto_em)}${resumo.sessao.operador_abertura ? ` por ${resumo.sessao.operador_abertura}` : ""}`} />
          <Kpi rotulo="Vendas neste caixa" valor={reais(resumo.vendas.total_centavos)} dica={`${plural(resumo.vendas.quantidade, "venda")}${resumo.canceladas.quantidade ? ` · ${resumo.canceladas.quantidade} cancelada(s)` : ""}`} />
        </div>
        <Cartao rotulo="Composição" titulo="Dinheiro na gaveta">
          <div className="divide-y divide-[#efefeb] text-[14px]">
            <Linha rotulo="Fundo de troco" valor={reais(g.fundo_troco_centavos)} />
            <Linha rotulo="+ Vendas em dinheiro" valor={reais(g.vendas_centavos)} />
            <Linha rotulo="+ Suprimentos" valor={reais(g.suprimentos_centavos)} />
            {g.receitas_centavos > 0 && <Linha rotulo="+ Receitas recebidas na gaveta" valor={reais(g.receitas_centavos)} />}
            <Linha rotulo="− Sangrias" valor={reais(g.sangrias_centavos)} />
            {g.despesas_centavos > 0 && <Linha rotulo="− Despesas pagas com a gaveta" valor={reais(g.despesas_centavos)} />}
            {g.cancelamentos_centavos > 0 && <Linha rotulo="− Devoluções de vendas canceladas" valor={reais(g.cancelamentos_centavos)} />}
            <Linha rotulo="= Esperado na gaveta" valor={reais(g.esperado_centavos)} forte />
          </div>
        </Cartao>
        <Cartao rotulo="Vendas" titulo="Por forma de pagamento">
          {resumo.vendas.por_forma.length === 0 ? (
            <p className="text-[13px] text-suave">Nenhuma venda neste caixa ainda.</p>
          ) : (
            <table className="tabela">
              <thead>
                <tr>
                  <th>Forma</th>
                  <th className="num">Vendas</th>
                  <th className="num">Valor</th>
                  <th className="num">Taxas</th>
                </tr>
              </thead>
              <tbody>
                {resumo.vendas.por_forma.map((f) => (
                  <tr key={f.forma_id}>
                    <td className="font-semibold">{f.nome}</td>
                    <td className="num">{f.quantidade}</td>
                    <td className="num font-semibold">{reais(f.valor_centavos)}</td>
                    <td className="num text-suave">{reais(f.taxas_centavos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Cartao>
      </div>
      <Cartao rotulo="Gaveta" titulo="Movimentos deste caixa" corpo={false}>
        <ul className="divide-y divide-[#efefeb] px-5 pb-3">
          {[...resumo.movimentos].reverse().map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold">{NOMES[m.tipo] ?? m.tipo}</p>
                <p className="truncate text-[12px] text-suave">
                  {[hora(m.criado_em), m.descricao, m.usuario_nome].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className={cx("text-[14px] font-bold tabular-nums", m.valor_centavos < 0 ? "text-perigo" : "text-sucesso")}>
                {m.valor_centavos < 0 ? "−" : "+"}
                {reais(Math.abs(m.valor_centavos))}
              </span>
            </li>
          ))}
        </ul>
      </Cartao>
    </div>
  );
}

function AbrirCaixa() {
  const [fundo, setFundo] = useState<number | null>(null);
  const usuario = useUsuario();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  async function abrir(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      await api.post("/api/caixa/abrir", { fundo_troco_centavos: fundo ?? 0 });
      avisar("Caixa aberto.");
      avisarMudanca();
    } catch (er) {
      setErro(mensagemDeErro(er));
    } finally {
      setEnviando(false);
    }
  }
  return (
    <Cartao>
      <form onSubmit={abrir} className="grid items-end gap-4 md:grid-cols-[auto_1fr_auto]">
        <div className="grid size-14 place-items-center rounded-2xl bg-[#f1f1ee]">
          <LockOpen className="size-6" />
        </div>
        <Campo rotulo="Fundo de troco" dica={`Dinheiro que já está na gaveta agora (pode ser zero). O caixa fica no nome de ${usuario?.nome ?? "quem está logado"}.`}>
          <CampoDinheiro valor={fundo} aoMudar={setFundo} placeholder="0,00" autoFocus />
        </Campo>
        <Botao type="submit" tamanho="lg" carregando={enviando}>
          Abrir caixa
        </Botao>
        {erro && (
          <div className="md:col-span-3">
            <AvisoErro mensagem={erro} />
          </div>
        )}
      </form>
    </Cartao>
  );
}

function MovimentoGaveta({ tipo, gaveta, aoFechar }: { tipo: "sangria" | "suprimento"; gaveta: number; aoFechar: () => void }) {
  const [valor, setValor] = useState<number | null>(null);
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!valor) return setErro("Informe um valor maior que zero.");
    setEnviando(true);
    setErro(null);
    try {
      await api.post("/api/caixa/movimentos", { tipo, valor_centavos: valor, descricao });
      avisar(tipo === "sangria" ? "Sangria registrada." : "Suprimento registrado.");
      avisarMudanca();
      aoFechar();
    } catch (er) {
      setErro(mensagemDeErro(er));
    } finally {
      setEnviando(false);
    }
  }
  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      largura="sm"
      titulo={tipo === "sangria" ? "Sangria (tirar dinheiro da gaveta)" : "Suprimento (colocar dinheiro na gaveta)"}
      subtitulo={`Hoje a gaveta deve ter ${reais(gaveta)}.`}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-mov" carregando={enviando}>
            Registrar
          </Botao>
        </>
      }
    >
      <form id="form-mov" onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Valor">
          <CampoDinheiro valor={valor} aoMudar={setValor} grande autoFocus />
        </Campo>
        <Campo rotulo="Motivo">
          <Entrada value={descricao} maxLength={120} onChange={(e) => setDescricao(e.target.value)} placeholder={tipo === "sangria" ? "Ex.: depósito no banco" : "Ex.: troco extra"} />
        </Campo>
        {erro && <AvisoErro mensagem={erro} />}
      </form>
    </Modal>
  );
}

function FecharCaixa({ resumo, aoFechar }: { resumo: ResumoCaixa; aoFechar: () => void }) {
  const [contado, setContado] = useState<number | null>(null);
  const [obs, setObs] = useState("");
  const usuario = useUsuario();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [fechado, setFechado] = useState<ResumoCaixa | null>(null);
  const config = useApi<Config>("/api/config");
  const esperado = resumo.gaveta.esperado_centavos;
  const diferenca = contado === null ? null : contado - esperado;

  async function fechar() {
    if (contado === null) return setErro("Conte o dinheiro da gaveta e informe o total.");
    setEnviando(true);
    setErro(null);
    try {
      const r = await api.post<ResumoCaixa>("/api/caixa/fechar", { contado_centavos: contado, observacao: obs });
      setFechado(r);
      avisarMudanca();
    } catch (er) {
      setErro(mensagemDeErro(er));
    } finally {
      setEnviando(false);
    }
  }

  if (fechado) {
    return (
      <Modal
        aberto
        aoFechar={aoFechar}
        titulo="Caixa fechado"
        subtitulo="Um backup do banco foi feito no fechamento."
        largura="sm"
        rodape={
          <>
            <Botao variante="secundario" icone={<Printer className="size-4" />} onClick={() => imprimirNoPapel(<ComprovanteFechamento resumo={fechado} config={config.dados} />)}>
              Imprimir resumo
            </Botao>
            <Botao onClick={aoFechar}>Pronto</Botao>
          </>
        }
      >
        <div className="divide-y divide-[#efefeb] text-[14px]">
          <Linha rotulo="Esperado na gaveta" valor={reais(fechado.sessao.esperado_centavos)} />
          <Linha rotulo="Contado" valor={reais(fechado.sessao.contado_centavos)} />
          <Linha rotulo="Resultado" valor={<Diferenca valor={fechado.sessao.diferenca_centavos ?? 0} />} forte />
          <Linha rotulo="Vendas do caixa" valor={`${plural(fechado.vendas.quantidade, "venda")} · ${reais(fechado.vendas.total_centavos)}`} />
          {fechado.vendas.por_forma.map((f) => (
            <Linha key={f.forma_id} recuo rotulo={f.nome} valor={reais(f.valor_centavos)} />
          ))}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Fechar caixa"
      subtitulo="Conte o dinheiro que está na gaveta, sem olhar o valor esperado primeiro."
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao onClick={() => void fechar()} carregando={enviando} disabled={contado === null}>
            Fechar caixa
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        <Campo rotulo="Dinheiro contado na gaveta">
          <CampoDinheiro valor={contado} aoMudar={setContado} grande autoFocus />
        </Campo>
        {diferenca !== null && (
          <div className={cx("rounded-2xl px-4 py-3 text-[14px]", diferenca === 0 ? "bg-[#e8f6ee]" : diferenca < 0 ? "bg-[#fde6e6]" : "bg-[#fdf1dc]")}>
            <Linha rotulo="Esperado pelo sistema" valor={reais(esperado)} />
            <Linha rotulo="Diferença" valor={<Diferenca valor={diferenca} />} forte />
          </div>
        )}
        <Campo rotulo="Observação" dica={`Fechamento no nome de ${usuario?.nome ?? "quem está logado"}.`}>
          <Entrada value={obs} maxLength={300} onChange={(e) => setObs(e.target.value)} placeholder={diferenca ? "Explique a diferença, se souber" : "Opcional"} />
        </Campo>
        <p className="text-[12.5px] text-suave">
          PIX e cartões deste caixa: {resumo.vendas.por_forma.filter((f) => f.tipo !== "dinheiro").map((f) => `${f.nome} ${reais(f.valor_centavos)}`).join(" · ") || "nenhum"}. Confira com o extrato da maquininha e do banco.
        </p>
        {erro && <AvisoErro mensagem={erro} />}
      </div>
    </Modal>
  );
}

function DetalheSessao({ id, aoFechar }: { id: number; aoFechar: () => void }) {
  const r = useApi<ResumoCaixa>(`/api/caixa/sessoes/${id}`);
  const s = r.dados?.sessao;
  return (
    <Modal aberto aoFechar={aoFechar} lado largura="lg" titulo={`Caixa nº ${id}`} subtitulo={s ? `${dataHora(s.aberto_em)} → ${s.fechado_em ? dataHora(s.fechado_em) : "aberto"}` : undefined}>
      {!r.dados ? (
        <Carregando />
      ) : (
        <div className="space-y-5 text-[14px]">
          <div className="divide-y divide-[#efefeb]">
            <Linha rotulo="Fundo de troco" valor={reais(r.dados.gaveta.fundo_troco_centavos)} />
            <Linha rotulo="Vendas em dinheiro" valor={reais(r.dados.gaveta.vendas_centavos)} />
            <Linha rotulo="Suprimentos" valor={reais(r.dados.gaveta.suprimentos_centavos)} />
            <Linha rotulo="Sangrias" valor={reais(r.dados.gaveta.sangrias_centavos)} />
            <Linha rotulo="Despesas pela gaveta" valor={reais(r.dados.gaveta.despesas_centavos)} />
            <Linha rotulo="Devoluções" valor={reais(r.dados.gaveta.cancelamentos_centavos)} />
            <Linha rotulo="Esperado" valor={reais(r.dados.gaveta.esperado_centavos)} forte />
            {s && !s.aberta && (
              <>
                <Linha rotulo="Contado" valor={reais(s.contado_centavos)} />
                <Linha rotulo="Diferença" valor={<Diferenca valor={s.diferenca_centavos ?? 0} />} forte />
              </>
            )}
          </div>
          {s?.observacao_fechamento && <p className="rounded-xl bg-[#f6f6f3] p-3 text-[13px]">Obs.: {s.observacao_fechamento}</p>}
          <div>
            <p className="rotulo mb-2">Vendas por forma</p>
            {r.dados.vendas.por_forma.map((f) => (
              <Linha key={f.forma_id} rotulo={`${f.nome} (${f.quantidade})`} valor={reais(f.valor_centavos)} />
            ))}
            {r.dados.vendas.por_forma.length === 0 && <p className="text-suave">Sem vendas.</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}
