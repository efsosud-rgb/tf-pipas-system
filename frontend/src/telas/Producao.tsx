import { ClipboardList, Factory, PackagePlus, Printer, Search, Settings2, ShoppingBasket, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { api, ErroApi, mensagemDeErro } from "../api";
import { avisar } from "../componentes/avisos";
import { imprimirNoPapel } from "../componentes/comprovante";
import { SeletorProduto } from "../componentes/seletor-produto";
import { Abas, AvisoErro, Botao, Cabecalho, Campo, CampoDinheiro, Carregando, Cartao, cx, Entrada, Etiqueta, Kpi, Modal, Vazio } from "../componentes/ui";
import { data, dataHora, normalizar, plural, quantidade, quantidadeParaCampo, reais, textoParaQuantidade } from "../formato";
import { avisarMudanca, useApi } from "../hooks";
import { irPara } from "../rotas";
import type { Config, Entrada as EntradaEstoque, ItemSugestao, MotivoSugestao, ParametrosProducao, Produto, SugestaoProducao } from "../tipos";

const MOTIVOS: Record<MotivoSugestao, { texto: string; tom: "perigo" | "alerta" }> = {
  negativo: { texto: "Negativo", tom: "perigo" },
  zerado: { texto: "Esgotado", tom: "perigo" },
  abaixo_minimo: { texto: "No mínimo", tom: "alerta" },
  cobertura_curta: { texto: "Dura pouco", tom: "alerta" },
};

type Aba = "produzir" | "comprar" | "todos" | "registradas";

function duracao(i: ItemSugestao): { texto: string; titulo?: string } {
  if (i.cobertura_dias === null) return { texto: "—", titulo: "Sem venda no período: não dá para medir o ritmo" };
  if (i.cobertura_dias <= 0) return { texto: "acabou" };
  if (i.cobertura_dias < 1) return { texto: "menos de 1 dia" };
  const d = Math.floor(i.cobertura_dias);
  return { texto: `~${d} ${d === 1 ? "dia" : "dias"}` };
}

export default function Producao() {
  const sugestao = useApi<SugestaoProducao>("/api/producao/sugestao");
  const config = useApi<Config>("/api/config");
  const [aba, setAba] = useState<Aba>("produzir");
  const [registrar, setRegistrar] = useState<ItemSugestao[] | null>(null);
  const [selecionados, setSelecionados] = useState<Set<number>>(() => new Set());
  const [ajustando, setAjustando] = useState(false);
  const [busca, setBusca] = useState("");
  const s = sugestao.dados;

  const produzir = useMemo(() => s?.itens.filter((i) => i.fabricado && i.sugestao > 0) ?? [], [s]);
  const comprar = useMemo(() => s?.itens.filter((i) => !i.fabricado && i.sugestao > 0) ?? [], [s]);
  const todos = useMemo(() => {
    const termos = normalizar(busca).split(/\s+/).filter(Boolean);
    return (s?.itens ?? []).filter((i) => termos.every((t) => normalizar(`${i.nome} ${i.categoria}`).includes(t)));
  }, [s, busca]);
  const fabricados = s?.itens.filter((i) => i.fabricado).length ?? 0;
  const marcados = produzir.filter((i) => selecionados.has(i.produto_id));

  const alternar = (id: number) =>
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const lista = aba === "produzir" ? produzir : aba === "comprar" ? comprar : todos;

  return (
    <div className="flex flex-col gap-5">
      <Cabecalho
        rotulo="Fábrica e reposição"
        titulo="Produção"
        descricao="O que produzir e o que comprar, calculado pelo estoque e pelo ritmo de venda registrado. Registrar uma produção soma no estoque e atualiza o custo pelo custo médio."
        acoes={
          <>
            <Botao
              variante="secundario"
              icone={<Printer className="size-4" />}
              disabled={!s || (aba === "comprar" ? comprar.length === 0 : produzir.length === 0)}
              onClick={() =>
                s &&
                imprimirNoPapel(
                  <ListaImpressa
                    titulo={aba === "comprar" ? "LISTA DE COMPRAS" : "LISTA DE PRODUÇÃO"}
                    itens={aba === "comprar" ? comprar : produzir}
                    sugestao={s}
                    config={config.dados}
                    geradaEm={new Date().toISOString()}
                  />,
                )
              }
            >
              {aba === "comprar" ? "Imprimir lista de compras" : "Imprimir lista de produção"}
            </Botao>
            <Botao icone={<PackagePlus className="size-4" />} onClick={() => setRegistrar(marcados)}>
              {marcados.length ? `Registrar produção (${marcados.length})` : "Registrar produção"}
            </Botao>
          </>
        }
      />

      {sugestao.erro && <AvisoErro mensagem={sugestao.erro} aoTentar={sugestao.recarregar} />}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi
          rotulo="Para produzir"
          valor={s ? plural(s.resumo.produzir_itens, "produto") : "—"}
          dica={s ? (s.resumo.produzir_itens ? `custo pelo cadastro: ${reais(s.resumo.produzir_custo_centavos)}` : "nada abaixo da meta") : undefined}
          tom={s?.resumo.produzir_itens ? "alerta" : "neutro"}
          icone={<Factory className="size-4" />}
        />
        <Kpi
          rotulo="Para comprar (revenda)"
          valor={s ? plural(s.resumo.comprar_itens, "produto") : "—"}
          dica={s ? (s.resumo.comprar_itens ? `custo pelo cadastro: ${reais(s.resumo.comprar_custo_centavos)}` : "nada abaixo da meta") : undefined}
          tom={s?.resumo.comprar_itens ? "alerta" : "neutro"}
          icone={<ShoppingBasket className="size-4" />}
        />
        <Kpi
          rotulo="Sem ritmo de venda"
          valor={s ? s.resumo.sem_ritmo : "—"}
          dica={s ? `sem venda nos últimos ${s.parametros.dias_historico} dias` : undefined}
        />
        <Kpi rotulo="Vendas analisadas" valor={s ? `${data(s.de).slice(0, 5)} a ${data(s.ate).slice(0, 5)}` : "—"} dica={s ? `${s.parametros.dias_historico} dias de vendas concluídas` : undefined} />
      </div>

      {s && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-borda/80 bg-white px-4 py-3 text-[13px] text-[#4a4d52]">
          <span>
            <b className="text-tinta">Meta:</b> estoque para {plural(s.parametros.dias_alvo, "dia")} de venda (ou o estoque mínimo, o que for maior)
          </span>
          <span className="text-borda">|</span>
          <span>
            <b className="text-tinta">Acabando:</b> quando dura menos de {plural(s.parametros.alerta_dias, "dia")}
          </span>
          <span className="flex-1" />
          <Botao variante="fantasma" tamanho="sm" icone={<Settings2 className="size-4" />} onClick={() => setAjustando(true)}>
            Ajustar a conta
          </Botao>
        </div>
      )}

      <Abas
        abas={[
          { id: "produzir", rotulo: "Produzir", contagem: produzir.length },
          { id: "comprar", rotulo: "Comprar", contagem: comprar.length },
          { id: "todos", rotulo: "Todos os produtos" },
          { id: "registradas", rotulo: "Produções registradas" },
        ]}
        ativa={aba}
        aoMudar={setAba}
      />

      {aba === "registradas" ? (
        <ProducoesRegistradas aoNova={() => setRegistrar([])} />
      ) : !s ? (
        sugestao.erro ? null : <Carregando />
      ) : s.itens.length === 0 ? (
        <Cartao>
          <Vazio
            icone={<Factory className="size-6" />}
            titulo="Nenhum produto com controle de estoque"
            texto="A sugestão usa o estoque dos produtos. Cadastre os produtos com “Controlar estoque” ligado."
            acao={
              <Botao variante="secundario" onClick={() => irPara("produtos")}>
                Ir para Produtos
              </Botao>
            }
          />
        </Cartao>
      ) : (
        <Cartao corpo={false}>
          {aba === "todos" && (
            <div className="flex flex-wrap items-center gap-3 border-b border-[#efefeb] p-4">
              <div className="relative min-w-[260px] flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-suave" />
                <Entrada className="pl-9" placeholder="Buscar produto…" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
              <p className="text-[12.5px] text-suave">Marque “Produzo” nos itens que a loja fabrica: eles vão para a lista de produção.</p>
            </div>
          )}
          {aba === "comprar" && comprar.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-b border-[#efefeb] px-4 py-3 text-[12.5px] text-suave">
              Quando a mercadoria chegar, registre em Produtos › Entrada de mercadoria (soma no estoque e atualiza o custo).
              <Botao variante="secundario" tamanho="sm" onClick={() => irPara("produtos")}>
                Ir para Produtos
              </Botao>
            </div>
          )}
          {lista.length === 0 ? (
            aba === "produzir" ? (
              <Vazio
                icone={<Factory className="size-6" />}
                titulo={fabricados === 0 ? "Nenhum produto marcado como fabricado" : "Nada para produzir agora"}
                texto={
                  fabricados === 0
                    ? "Na aba “Todos os produtos”, marque “Produzo” nas pipas e itens que a loja faz."
                    : `O estoque dos ${plural(fabricados, "produto fabricado", "produtos fabricados")} cobre a meta de ${plural(s.parametros.dias_alvo, "dia")} no ritmo de venda registrado.`
                }
                acao={
                  fabricados === 0 ? (
                    <Botao variante="secundario" onClick={() => setAba("todos")}>
                      Ver todos os produtos
                    </Botao>
                  ) : undefined
                }
              />
            ) : aba === "comprar" ? (
              <Vazio icone={<ShoppingBasket className="size-6" />} titulo="Nada para comprar agora" texto="Os produtos de revenda estão acima da meta de estoque." />
            ) : (
              <Vazio icone={<Search className="size-6" />} titulo="Nenhum produto com esse nome" />
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="tabela">
                <thead>
                  <tr>
                    {aba === "produzir" && (
                      <th className="w-10">
                        <input
                          type="checkbox"
                          aria-label="Marcar todos"
                          className="size-4 accent-tinta"
                          checked={produzir.every((i) => selecionados.has(i.produto_id))}
                          onChange={(e) => setSelecionados(e.target.checked ? new Set(produzir.map((i) => i.produto_id)) : new Set())}
                        />
                      </th>
                    )}
                    <th>Produto</th>
                    <th className="num">Estoque</th>
                    <th className="num" title="Vendas concluídas no período analisado">
                      Vendido
                    </th>
                    <th className="num">Média/dia</th>
                    <th className="num" title="Quanto tempo o estoque dura no ritmo de venda registrado">
                      Dura
                    </th>
                    <th className="num" title="O maior entre o estoque mínimo e a média × dias da meta">
                      Meta
                    </th>
                    <th className="num">{aba === "comprar" ? "Comprar" : aba === "produzir" ? "Produzir" : "Sugestão"}</th>
                    <th className="num" title="Sugestão × custo atual do cadastro do produto">
                      Custo (cadastro)
                    </th>
                    <th>Situação</th>
                    <th>Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((i) => {
                    const d = duracao(i);
                    return (
                      <tr key={i.produto_id}>
                        {aba === "produzir" && (
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Marcar ${i.nome}`}
                              className="size-4 accent-tinta"
                              checked={selecionados.has(i.produto_id)}
                              onChange={() => alternar(i.produto_id)}
                            />
                          </td>
                        )}
                        <td>
                          <p className="font-semibold">{i.nome}</p>
                          <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-suave">
                            {i.categoria || "sem categoria"}
                            {i.lote > 0 && <span>· lote de {quantidade(i.lote, i.unidade)}</span>}
                            {i.pouco_historico && (
                              <span title="Produto com menos de 7 dias no sistema: o ritmo ainda é pouco confiável">
                                <Etiqueta tom="info">pouco histórico</Etiqueta>
                              </span>
                            )}
                          </p>
                        </td>
                        <td className={cx("num", i.estoque <= 0 && "font-semibold text-perigo")}>
                          {quantidade(i.estoque, i.unidade)}
                          {i.estoque_minimo > 0 && <span className="block text-[11.5px] font-normal text-suave">mín. {quantidade(i.estoque_minimo)}</span>}
                        </td>
                        <td className="num">
                          {quantidade(i.vendido_periodo)}
                          <span className="block text-[11.5px] text-suave">em {plural(i.dias_considerados, "dia")}</span>
                        </td>
                        <td className="num" title={i.media_diaria === null ? `Sem venda nos últimos ${s.parametros.dias_historico} dias` : undefined}>
                          {i.media_diaria === null ? "—" : quantidade(i.media_diaria)}
                        </td>
                        <td className={cx("num", i.cobertura_dias !== null && i.cobertura_dias < s.parametros.alerta_dias && "font-semibold text-alerta")} title={d.titulo}>
                          {d.texto}
                        </td>
                        <td className="num">{quantidade(i.alvo)}</td>
                        <td className="num text-[15px] font-extrabold">{i.sugestao > 0 ? quantidade(i.sugestao, i.unidade) : <span className="font-normal text-suave">—</span>}</td>
                        <td className="num">{i.sugestao > 0 ? (i.custo_unitario_centavos > 0 ? reais(i.custo_estimado_centavos) : <span className="text-alerta">sem custo</span>) : "—"}</td>
                        <td>{i.motivo ? <Etiqueta tom={MOTIVOS[i.motivo].tom}>{MOTIVOS[i.motivo].texto}</Etiqueta> : <Etiqueta tom="ok">Ok</Etiqueta>}</td>
                        <td>
                          <OrigemProduto item={i} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t border-[#efefeb] px-4 py-3 text-[12px] leading-relaxed text-suave">
            Como a conta é feita: média/dia = quantidade vendida (vendas concluídas) ÷ dias do período — ou desde o cadastro, se o produto é mais novo. Meta = o maior entre o
            estoque mínimo e a média × {plural(s.parametros.dias_alvo, "dia")}. Sugestão = meta − estoque, arredondada para cima (unidades inteiras e lote de produção). Sem venda
            no período, só o estoque mínimo gera sugestão.
          </p>
        </Cartao>
      )}

      {registrar && (
        <RegistrarProducao
          inicial={registrar}
          aoFechar={(registrou) => {
            setRegistrar(null);
            if (registrou) setSelecionados(new Set());
          }}
        />
      )}
      {ajustando && s && <AjustarParametros atuais={s.parametros} aoFechar={() => setAjustando(false)} />}
    </div>
  );
}

/** "Produzo / Compro": decide se o produto entra na lista de produção ou na de compras. */
function OrigemProduto({ item }: { item: ItemSugestao }) {
  const [enviando, setEnviando] = useState(false);
  async function mudar(fabricado: boolean) {
    if (fabricado === item.fabricado || enviando) return;
    setEnviando(true);
    try {
      await api.post(`/api/produtos/${item.produto_id}/fabricado`, { fabricado });
      avisar(fabricado ? `"${item.nome}" vai para a lista de produção.` : `"${item.nome}" vai para a lista de compras.`);
      avisarMudanca();
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setEnviando(false);
    }
  }
  const opcoes: Array<[boolean, string]> = [
    [true, "Produzo"],
    [false, "Compro"],
  ];
  return (
    <div className="inline-flex rounded-lg border border-borda bg-white p-0.5 text-[11.5px] font-semibold" role="group" aria-label={`Origem de ${item.nome}`}>
      {opcoes.map(([valor, texto]) => (
        <button
          key={texto}
          type="button"
          aria-pressed={item.fabricado === valor}
          disabled={enviando}
          onClick={() => void mudar(valor)}
          className={cx("rounded-md px-2 py-0.5 transition-colors", item.fabricado === valor ? "bg-tinta text-white" : "text-suave hover:text-tinta")}
        >
          {texto}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Registrar produção                                                   */
/* ------------------------------------------------------------------ */
interface ItemProducaoForm {
  produto_id: number;
  nome: string;
  unidade: string;
  estoque: number;
  qtd: string;
  custo: number | null;
}

function RegistrarProducao({ inicial, aoFechar }: { inicial: ItemSugestao[]; aoFechar: (registrou: boolean) => void }) {
  const produtos = useApi<Produto[]>("/api/produtos");
  const [itens, setItens] = useState<ItemProducaoForm[]>(() =>
    inicial.map((i) => ({
      produto_id: i.produto_id,
      nome: i.nome,
      unidade: i.unidade,
      estoque: i.estoque,
      qtd: quantidadeParaCampo(i.sugestao),
      custo: i.custo_unitario_centavos > 0 ? i.custo_unitario_centavos : null,
    })),
  );
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const fabricados = (produtos.dados ?? []).filter((p) => p.fabricado && p.ativo && p.controla_estoque);
  const totalItem = (i: ItemProducaoForm) => {
    const q = textoParaQuantidade(i.qtd);
    return q === null || i.custo === null ? null : Math.floor((2 * Math.round(q * 1000) * i.custo + 1000) / 2000);
  };
  const total = itens.reduce((s, i) => s + (totalItem(i) ?? 0), 0);
  const mudar = (n: number, parte: Partial<ItemProducaoForm>) => setItens((l) => l.map((x, k) => (k === n ? { ...x, ...parte } : x)));

  async function salvar() {
    if (!itens.length) return setErro("Adicione pelo menos um produto.");
    for (const i of itens) {
      const q = textoParaQuantidade(i.qtd);
      if (q === null || q <= 0) return setErro(`Informe quanto foi produzido de "${i.nome}".`);
      if (i.custo === null) return setErro(`Informe o custo por unidade de "${i.nome}".`);
    }
    setEnviando(true);
    setErro(null);
    try {
      await api.post("/api/producao", {
        observacao: obs,
        itens: itens.map((i) => ({ produto_id: i.produto_id, quantidade: textoParaQuantidade(i.qtd), custo_unitario_centavos: i.custo })),
      });
      avisar("Produção registrada. Estoque e custo atualizados.");
      avisarMudanca();
      aoFechar(true);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : mensagemDeErro(e));
      setEnviando(false);
    }
  }

  return (
    <Modal
      aberto
      aoFechar={() => aoFechar(false)}
      titulo="Registrar produção"
      subtitulo="O que ficou pronto entra no estoque. O custo do produto é recalculado pela média com o custo desta produção."
      largura="xl"
      rodape={
        <>
          <p className="mr-auto text-[14px]">
            Custo total da produção: <strong className="tabular-nums">{reais(total)}</strong>
          </p>
          <Botao variante="secundario" onClick={() => aoFechar(false)}>
            Cancelar
          </Botao>
          <Botao onClick={() => void salvar()} carregando={enviando} disabled={!itens.length}>
            Registrar produção
          </Botao>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-[12.5px] font-semibold text-[#3d4045]">Produtos fabricados</p>
          {produtos.erro ? (
            <AvisoErro mensagem={produtos.erro} aoTentar={produtos.recarregar} />
          ) : !produtos.dados ? (
            <Carregando />
          ) : fabricados.length === 0 ? (
            <p className="rounded-xl bg-[#fdf1dc] px-4 py-3 text-[13px] text-[#8a5300]">
              Nenhum produto marcado como fabricado. Na aba “Todos os produtos”, marque “Produzo” nos itens que a loja faz.
            </p>
          ) : (
            <SeletorProduto
              produtos={fabricados}
              excluir={itens.map((i) => i.produto_id)}
              placeholder="Adicionar produto fabricado (nome ou código)…"
              aoEscolher={(p) => setItens((l) => [...l, { produto_id: p.id, nome: p.nome, unidade: p.unidade, estoque: p.estoque, qtd: "", custo: p.custo_centavos > 0 ? p.custo_centavos : null }])}
            />
          )}
          {itens.length > 0 && (
            <table className="tabela mt-3">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th className="num">Estoque hoje</th>
                  <th className="num">Quantidade produzida</th>
                  <th className="num">Custo por unidade</th>
                  <th className="num">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {itens.map((i, n) => (
                  <tr key={i.produto_id}>
                    <td className="font-semibold">{i.nome}</td>
                    <td className="num text-suave">{quantidade(i.estoque, i.unidade)}</td>
                    <td className="num">
                      <Entrada
                        autoFocus={n === itens.length - 1 && !i.qtd}
                        className="ml-auto w-24 text-right"
                        inputMode="decimal"
                        aria-label={`Quantidade produzida de ${i.nome}`}
                        value={i.qtd}
                        onChange={(e) => mudar(n, { qtd: e.target.value })}
                        placeholder="0"
                      />
                    </td>
                    <td className="num">
                      <div className="ml-auto w-36">
                        <CampoDinheiro valor={i.custo} aria-label={`Custo por unidade de ${i.nome}`} aoMudar={(v) => mudar(n, { custo: v })} />
                      </div>
                    </td>
                    <td className="num font-semibold">{reais(totalItem(i))}</td>
                    <td className="num">
                      <button
                        type="button"
                        title="Tirar"
                        aria-label={`Tirar ${i.nome}`}
                        onClick={() => setItens((l) => l.filter((_, k) => k !== n))}
                        className="grid size-8 place-items-center rounded-lg text-[#6c6f75] hover:bg-[#fde6e6] hover:text-perigo"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <Campo rotulo="Observação">
          <Entrada value={obs} maxLength={300} onChange={(e) => setObs(e.target.value)} placeholder="Opcional — ex.: lote de pipas para o fim de semana" />
        </Campo>
        <p className="text-[12px] leading-relaxed text-suave">
          Custo por unidade: quanto se gasta (material e, se quiser, mão de obra) para fazer uma unidade. Já vem preenchido com o custo atual do cadastro. Registrar a produção não lança
          despesa: lance a compra do material no Financeiro, na categoria “Material para produção” — ela não conta no lucro, porque o custo entra quando a pipa é vendida.
        </p>
        {erro && <AvisoErro mensagem={erro} />}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Produções já registradas                                             */
/* ------------------------------------------------------------------ */
function ProducoesRegistradas({ aoNova }: { aoNova: () => void }) {
  const lista = useApi<EntradaEstoque[]>("/api/producao");
  const [aberta, setAberta] = useState<number | null>(null);
  const detalhe = useApi<EntradaEstoque>(aberta ? `/api/estoque/entradas/${aberta}` : null);
  return (
    <Cartao corpo={false}>
      {lista.erro && (
        <div className="p-4">
          <AvisoErro mensagem={lista.erro} aoTentar={lista.recarregar} />
        </div>
      )}
      {!lista.dados ? (
        lista.erro ? null : <Carregando />
      ) : lista.dados.length === 0 ? (
        <Vazio
          icone={<ClipboardList className="size-6" />}
          titulo="Nenhuma produção registrada"
          texto="Quando um lote ficar pronto, registre aqui para somar no estoque."
          acao={
            <Botao icone={<PackagePlus className="size-4" />} onClick={aoNova}>
              Registrar produção
            </Botao>
          }
        />
      ) : (
        <table className="tabela">
          <thead>
            <tr>
              <th>Nº</th>
              <th>Data</th>
              <th>Registrada por</th>
              <th className="num">Produtos</th>
              <th className="num">Quantidade</th>
              <th className="num">Custo total</th>
              <th>Observação</th>
            </tr>
          </thead>
          <tbody>
            {lista.dados.map((e) => (
              <tr key={e.id} className="clicavel" onClick={() => setAberta(e.id)}>
                <td className="font-semibold">{e.id}</td>
                <td>{dataHora(e.criado_em)}</td>
                <td>{e.usuario_nome || "—"}</td>
                <td className="num">{e.itens_quantidade ?? "—"}</td>
                <td className="num">{quantidade(e.quantidade_total)}</td>
                <td className="num font-semibold">{reais(e.total_centavos)}</td>
                <td className="max-w-[260px] truncate text-suave">{e.observacao || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {aberta && (
        <Modal
          aberto
          aoFechar={() => setAberta(null)}
          lado
          largura="lg"
          titulo={`Produção nº ${aberta}`}
          subtitulo={detalhe.dados ? `${dataHora(detalhe.dados.criado_em)}${detalhe.dados.usuario_nome ? ` · por ${detalhe.dados.usuario_nome}` : ""}` : undefined}
        >
          {detalhe.erro ? (
            <AvisoErro mensagem={detalhe.erro} aoTentar={detalhe.recarregar} />
          ) : !detalhe.dados ? (
            <Carregando />
          ) : (
            <>
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th className="num">Qtd.</th>
                    <th className="num">Custo unit.</th>
                    <th className="num">Custo médio</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {detalhe.dados.itens?.map((i) => (
                    <tr key={i.produto_id}>
                      <td className="font-semibold">{i.nome}</td>
                      <td className="num">{quantidade(i.quantidade, i.unidade)}</td>
                      <td className="num">{reais(i.custo_unitario_centavos)}</td>
                      <td className="num text-[12.5px]">
                        {reais(i.custo_medio_antes_centavos)} → <strong>{reais(i.custo_medio_depois_centavos)}</strong>
                      </td>
                      <td className="num font-semibold">{reais(i.total_centavos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {detalhe.dados.observacao && <p className="mt-4 text-[13px] text-[#4a4d52]">Obs.: {detalhe.dados.observacao}</p>}
            </>
          )}
        </Modal>
      )}
    </Cartao>
  );
}

/* ------------------------------------------------------------------ */
/* Parâmetros da conta                                                  */
/* ------------------------------------------------------------------ */
function AjustarParametros({ atuais, aoFechar }: { atuais: ParametrosProducao; aoFechar: () => void }) {
  const [f, setF] = useState({ dias_historico: String(atuais.dias_historico), dias_alvo: String(atuais.dias_alvo), alerta_dias: String(atuais.alerta_dias) });
  const [erro, setErro] = useState<{ texto: string; campo: string | null } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const erroDe = (c: string) => (erro?.campo === c ? erro.texto : null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const n = (t: string) => (/^\d+$/.test(t.trim()) ? Number(t.trim()) : NaN);
    const corpo = { dias_historico: n(f.dias_historico), dias_alvo: n(f.dias_alvo), alerta_dias: n(f.alerta_dias) };
    for (const [campo, v] of Object.entries(corpo)) {
      if (!Number.isInteger(v)) return setErro({ texto: "Use um número inteiro de dias.", campo });
    }
    setEnviando(true);
    setErro(null);
    try {
      await api.put<ParametrosProducao>("/api/producao/parametros", corpo);
      avisar("Conta da produção ajustada.");
      avisarMudanca();
      aoFechar();
    } catch (er) {
      setErro({ texto: mensagemDeErro(er), campo: er instanceof ErroApi ? er.campo : null });
      setEnviando(false);
    }
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Ajustar a conta da produção"
      subtitulo="Vale para a sugestão de produção, a lista de compras e o aviso de estoque acabando."
      largura="sm"
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-parametros" carregando={enviando}>
            Salvar
          </Botao>
        </>
      }
    >
      <form id="form-parametros" onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Medir o ritmo de venda pelos últimos" dica="De 7 a 365 dias. Em época de vento forte, um período menor acompanha melhor a procura." erro={erroDe("dias_historico")}>
          <div className="flex items-center gap-2">
            <Entrada className="w-24 text-right" inputMode="numeric" value={f.dias_historico} onChange={(e) => setF({ ...f, dias_historico: e.target.value })} />
            <span className="text-[13.5px] text-[#4a4d52]">dias</span>
          </div>
        </Campo>
        <Campo rotulo="Produzir/comprar para ter estoque por" dica="De 1 a 180 dias de venda no ritmo medido." erro={erroDe("dias_alvo")}>
          <div className="flex items-center gap-2">
            <Entrada className="w-24 text-right" inputMode="numeric" value={f.dias_alvo} onChange={(e) => setF({ ...f, dias_alvo: e.target.value })} />
            <span className="text-[13.5px] text-[#4a4d52]">dias</span>
          </div>
        </Campo>
        <Campo rotulo="Avisar “acabando” quando o estoque durar menos de" dica="De 1 a 60 dias. Zerado e abaixo do mínimo sempre avisam." erro={erroDe("alerta_dias")}>
          <div className="flex items-center gap-2">
            <Entrada className="w-24 text-right" inputMode="numeric" value={f.alerta_dias} onChange={(e) => setF({ ...f, alerta_dias: e.target.value })} />
            <span className="text-[13.5px] text-[#4a4d52]">dias</span>
          </div>
        </Campo>
        {erro && !["dias_historico", "dias_alvo", "alerta_dias"].includes(erro.campo ?? "") && <AvisoErro mensagem={erro.texto} />}
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Lista para imprimir (impressora de comprovante)                      */
/* ------------------------------------------------------------------ */
function ListaImpressa({
  titulo,
  itens,
  sugestao,
  config,
  geradaEm,
}: {
  titulo: string;
  itens: ItemSugestao[];
  sugestao: SugestaoProducao;
  config: Config | null;
  geradaEm: string;
}) {
  const largura = config?.comprovante_largura === "58" ? "48mm" : "72mm";
  const linha = { borderTop: "1px dashed #000", margin: "6px 0" } as const;
  const custo = itens.reduce((s, i) => s + i.custo_estimado_centavos, 0);
  return (
    <div style={{ width: largura, padding: "4mm 0 6mm", margin: "0 auto", fontFamily: "'Courier New', ui-monospace, monospace", fontSize: "11.5px", color: "#000", lineHeight: 1.35 }}>
      <div style={{ textAlign: "center", fontWeight: 800, fontSize: "1.3em" }}>{config?.loja_nome || "TF Pipas"}</div>
      <div style={{ textAlign: "center", fontWeight: 700 }}>{titulo}</div>
      <div style={{ textAlign: "center" }}>{dataHora(geradaEm)}</div>
      <div style={linha} />
      <div>Meta: estoque para {plural(sugestao.parametros.dias_alvo, "dia")}</div>
      <div>
        Vendas de {data(sugestao.de)} a {data(sugestao.ate)}
      </div>
      <div style={linha} />
      {itens.map((i) => (
        <div key={i.produto_id} style={{ marginBottom: 4 }}>
          <div style={{ fontWeight: 700 }}>[ ] {i.nome}</div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>
              tem {quantidade(i.estoque)}
              {i.estoque_minimo > 0 ? ` (mín. ${quantidade(i.estoque_minimo)})` : ""}
            </span>
            <span style={{ fontWeight: 800 }}>{quantidade(i.sugestao, i.unidade)}</span>
          </div>
        </div>
      ))}
      <div style={linha} />
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{plural(itens.length, "produto")}</span>
        <span>custo cadastro {reais(custo)}</span>
      </div>
    </div>
  );
}
