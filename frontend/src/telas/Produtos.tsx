import { Boxes, ClipboardList, FileUp, History, PackageMinus, PackagePlus, Pencil, Plus, Search, Trash2, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { api, consulta, ErroApi, mensagemDeErro } from "../api";
import { avisar, confirmar } from "../componentes/avisos";
import { SeletorProduto } from "../componentes/seletor-produto";
import {
  Abas,
  AreaTexto,
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
  Modal,
  Selecao,
  Vazio,
} from "../componentes/ui";
import { data, dataHora, normalizar, plural, porcento, quantidade, reais, textoParaCentavos, textoParaQuantidade } from "../formato";
import { avisarMudanca, useApi } from "../hooks";
import { parametrosDaRota } from "../rotas";
import type { Entrada as EntradaMercadoria, HistoricoProduto, Produto, RelatorioEstoque, SituacaoEstoque, Unidade, UnidadeInfo } from "../tipos";

const ROTULO_SITUACAO: Record<SituacaoEstoque, { texto: string; tom: "ok" | "alerta" | "perigo" | "neutro" }> = {
  ok: { texto: "Em estoque", tom: "ok" },
  baixo: { texto: "Abaixo do mínimo", tom: "alerta" },
  zerado: { texto: "Zerado", tom: "perigo" },
  negativo: { texto: "Negativo", tom: "perigo" },
  sem_controle: { texto: "Sem controle", tom: "neutro" },
};

export default function Produtos() {
  const [aba, setAba] = useState<"produtos" | "entradas">("produtos");
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [inativos, setInativos] = useState(false);
  const lista = useApi<Produto[]>(`/api/produtos${consulta({ inativos: inativos ? 1 : undefined })}`);
  const estoque = useApi<RelatorioEstoque>("/api/relatorios/estoque");
  const unidades = useApi<UnidadeInfo[]>("/api/unidades");
  const [editando, setEditando] = useState<Produto | "novo" | null>(() => (parametrosDaRota().get("novo") === "1" ? "novo" : null));
  const [ajuste, setAjuste] = useState<Produto | null>(null);
  const [historico, setHistorico] = useState<Produto | null>(null);
  const [entradaAberta, setEntradaAberta] = useState(false);
  const [importar, setImportar] = useState(false);

  const categorias = useMemo(() => [...new Set((lista.dados ?? []).map((p) => p.categoria).filter(Boolean))].sort(), [lista.dados]);
  const filtrados = useMemo(() => {
    const termos = normalizar(busca).split(/\s+/).filter(Boolean);
    return (lista.dados ?? []).filter((p) => {
      if (categoria && p.categoria !== categoria) return false;
      const alvo = normalizar(`${p.nome} ${p.categoria} ${p.codigo ?? ""} ${p.codigo_barras ?? ""}`);
      return termos.every((t) => alvo.includes(t));
    });
  }, [lista.dados, busca, categoria]);

  async function excluir(p: Produto) {
    const r = await confirmar({
      titulo: `Excluir "${p.nome}"?`,
      texto: "Se o produto já teve venda, compra ou ajuste, ele só é desativado: o histórico e os relatórios continuam certos.",
      confirmar: "Excluir",
      perigo: true,
    });
    if (!r.ok) return;
    try {
      const res = await api.delete<{ acao: "excluido" | "inativado" }>(`/api/produtos/${p.id}`);
      avisar(res.acao === "excluido" ? "Produto excluído." : "Produto desativado (já tinha movimento).");
      avisarMudanca();
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Cabecalho
        rotulo="Cadastro e estoque"
        titulo="Produtos"
        descricao="Preço, custo, margem e estoque de cada produto. A entrada de mercadoria atualiza o custo pelo custo médio."
        acoes={
          <>
            <Botao variante="secundario" icone={<FileUp className="size-4" />} onClick={() => setImportar(true)}>
              Importar planilha
            </Botao>
            <Botao variante="secundario" icone={<Truck className="size-4" />} onClick={() => setEntradaAberta(true)}>
              Entrada de mercadoria
            </Botao>
            <Botao icone={<Plus className="size-4" />} onClick={() => setEditando("novo")}>
              Novo produto
            </Botao>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi rotulo="Produtos ativos" valor={lista.dados ? lista.dados.filter((p) => p.ativo).length : "—"} />
        <Kpi rotulo="Estoque a preço de custo" valor={reais(estoque.dados?.valor_a_custo_centavos)} dica="só o que tem saldo positivo" />
        <Kpi rotulo="Estoque a preço de venda" valor={reais(estoque.dados?.valor_a_preco_de_venda_centavos)} dica={estoque.dados ? `lucro potencial ${reais(estoque.dados.lucro_potencial_centavos)}` : undefined} />
        <Kpi
          rotulo="Pedem atenção"
          valor={estoque.dados ? estoque.dados.atencao.length : "—"}
          dica={estoque.dados ? `${estoque.dados.zerados} zerados · ${estoque.dados.abaixo_do_minimo} no mínimo · ${estoque.dados.negativos} negativos` : undefined}
          tom={estoque.dados && estoque.dados.atencao.length ? "alerta" : "neutro"}
        />
      </div>

      <Abas
        abas={[
          { id: "produtos", rotulo: "Produtos" },
          { id: "entradas", rotulo: "Entradas de mercadoria" },
        ]}
        ativa={aba}
        aoMudar={setAba}
      />

      {aba === "entradas" ? (
        <ListaEntradas aoNova={() => setEntradaAberta(true)} />
      ) : (
        <Cartao corpo={false}>
          <div className="flex flex-wrap items-center gap-3 border-b border-[#efefeb] p-4">
            <div className="relative min-w-[260px] flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-suave" />
              <Entrada className="pl-9" placeholder="Buscar por nome, categoria ou código…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <div className="w-[220px]">
              <Selecao value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Filtrar por categoria">
                <option value="">Todas as categorias</option>
                {categorias.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Selecao>
            </div>
            <Interruptor ligado={inativos} aoMudar={setInativos} rotulo="Mostrar desativados" />
          </div>
          {lista.erro && (
            <div className="p-4">
              <AvisoErro mensagem={lista.erro} aoTentar={lista.recarregar} />
            </div>
          )}
          {!lista.dados ? (
            <Carregando />
          ) : lista.dados.length === 0 ? (
            <Vazio
              icone={<Boxes className="size-6" />}
              titulo="Nenhum produto cadastrado"
              texto="Comece pelos produtos mais vendidos. Se já tiver uma planilha, use “Importar planilha”."
              acao={
                <Botao icone={<Plus className="size-4" />} onClick={() => setEditando("novo")}>
                  Cadastrar o primeiro produto
                </Botao>
              }
            />
          ) : filtrados.length === 0 ? (
            <Vazio icone={<Search className="size-6" />} titulo="Nenhum produto com esse filtro" />
          ) : (
            <div className="overflow-x-auto">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th className="num">Preço</th>
                    <th className="num">Custo</th>
                    <th className="num">Margem</th>
                    <th className="num">Estoque</th>
                    <th>Situação</th>
                    <th className="num">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((p) => (
                    <tr key={p.id} className={cx(!p.ativo && "opacity-55")}>
                      <td>
                        <p className="font-semibold">{p.nome}</p>
                        <p className="text-[12px] text-suave">{[p.categoria, p.codigo, p.codigo_barras].filter(Boolean).join(" · ") || "—"}</p>
                      </td>
                      <td className="num font-semibold">{reais(p.preco_centavos)}</td>
                      <td className="num">{p.custo_centavos === 0 ? <span className="text-alerta">sem custo</span> : reais(p.custo_centavos)}</td>
                      <td className={cx("num", p.margem_bp !== null && p.margem_bp < 0 && "text-perigo")}>{porcento(p.margem_bp)}</td>
                      <td className="num">{p.controla_estoque ? quantidade(p.estoque, p.unidade) : "—"}</td>
                      <td>
                        {!p.ativo ? <Etiqueta>Desativado</Etiqueta> : <Etiqueta tom={ROTULO_SITUACAO[p.situacao_estoque].tom}>{ROTULO_SITUACAO[p.situacao_estoque].texto}</Etiqueta>}
                      </td>
                      <td className="num">
                        <div className="inline-flex gap-0.5">
                          <BotaoIcone rotulo="Editar" onClick={() => setEditando(p)}>
                            <Pencil className="size-4" />
                          </BotaoIcone>
                          <BotaoIcone rotulo="Ajustar estoque" onClick={() => setAjuste(p)} disabled={!p.controla_estoque || !p.ativo}>
                            <PackageMinus className="size-4" />
                          </BotaoIcone>
                          <BotaoIcone rotulo="Histórico" onClick={() => setHistorico(p)}>
                            <History className="size-4" />
                          </BotaoIcone>
                          <BotaoIcone rotulo="Excluir" onClick={() => void excluir(p)} perigo>
                            <Trash2 className="size-4" />
                          </BotaoIcone>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Cartao>
      )}

      {editando && (
        <FormularioProduto produto={editando === "novo" ? null : editando} categorias={categorias} unidades={unidades.dados ?? []} aoFechar={() => setEditando(null)} />
      )}
      {ajuste && <AjusteEstoque produto={ajuste} aoFechar={() => setAjuste(null)} />}
      {historico && <HistoricoDoProduto produto={historico} aoFechar={() => setHistorico(null)} />}
      {entradaAberta && <NovaEntrada produtos={(lista.dados ?? []).filter((p) => p.ativo && p.controla_estoque)} aoFechar={() => setEntradaAberta(false)} />}
      {importar && <ImportarPlanilha aoFechar={() => setImportar(false)} />}
    </div>
  );
}

function BotaoIcone({ rotulo, children, perigo, ...resto }: { rotulo: string; children: React.ReactNode; perigo?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      title={rotulo}
      aria-label={rotulo}
      className={cx("grid size-8 place-items-center rounded-lg text-[#6c6f75] transition-colors disabled:opacity-30", perigo ? "hover:bg-[#fde6e6] hover:text-perigo" : "hover:bg-black/5 hover:text-tinta")}
      {...resto}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Cadastro / edição                                                    */
/* ------------------------------------------------------------------ */
function FormularioProduto({
  produto,
  categorias,
  unidades,
  aoFechar,
}: {
  produto: Produto | null;
  categorias: string[];
  unidades: UnidadeInfo[];
  aoFechar: () => void;
}) {
  const [f, setF] = useState({
    nome: produto?.nome ?? "",
    categoria: produto?.categoria ?? "",
    unidade: (produto?.unidade ?? "un") as Unidade,
    codigo: produto?.codigo ?? "",
    codigo_barras: produto?.codigo_barras ?? "",
    preco: produto?.preco_centavos ?? null,
    custo: produto?.custo_centavos ?? null,
    controla_estoque: produto?.controla_estoque ?? true,
    estoque_inicial: "",
    estoque_minimo: produto ? quantidade(produto.estoque_minimo) : "",
    observacao: produto?.observacao ?? "",
    ativo: produto?.ativo ?? true,
  });
  const [erro, setErro] = useState<{ texto: string; campo: string | null } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [continuar, setContinuar] = useState(false);
  const lucro = f.preco !== null ? f.preco - (f.custo ?? 0) : null;
  const margem = f.preco ? Math.round(((lucro ?? 0) * 10_000) / f.preco) : null;
  const erroDe = (campo: string) => (erro?.campo === campo ? erro.texto : null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const estoqueInicial = f.estoque_inicial.trim() ? textoParaQuantidade(f.estoque_inicial) : 0;
    const estoqueMinimo = f.estoque_minimo.trim() ? textoParaQuantidade(f.estoque_minimo) : 0;
    if (!f.nome.trim()) return setErro({ texto: "Informe o nome do produto.", campo: "nome" });
    if (!f.preco) return setErro({ texto: "Informe o preço de venda.", campo: "preco_centavos" });
    if (estoqueInicial === null) return setErro({ texto: "Estoque inicial inválido.", campo: "estoque_inicial" });
    if (estoqueMinimo === null) return setErro({ texto: "Estoque mínimo inválido.", campo: "estoque_minimo" });
    setEnviando(true);
    setErro(null);
    const corpo = {
      nome: f.nome,
      categoria: f.categoria,
      unidade: f.unidade,
      codigo: f.codigo.trim() || null,
      codigo_barras: f.codigo_barras.trim() || null,
      preco_centavos: f.preco,
      custo_centavos: f.custo ?? 0,
      controla_estoque: f.controla_estoque,
      estoque_minimo: estoqueMinimo,
      observacao: f.observacao,
    };
    try {
      if (produto) {
        await api.put(`/api/produtos/${produto.id}`, { ...corpo, ativo: f.ativo });
        avisar("Produto atualizado.");
      } else {
        await api.post("/api/produtos", { ...corpo, estoque_inicial: f.controla_estoque ? estoqueInicial : 0 });
        avisar(`"${f.nome.trim()}" cadastrado.`);
      }
      avisarMudanca();
      if (!produto && continuar) {
        setF((x) => ({ ...x, nome: "", codigo: "", codigo_barras: "", preco: null, custo: null, estoque_inicial: "", observacao: "" }));
      } else {
        aoFechar();
      }
    } catch (e) {
      setErro({ texto: mensagemDeErro(e), campo: e instanceof ErroApi ? e.campo : null });
    } finally {
      setEnviando(false);
    }
  }

  const frac = unidades.find((u) => u.sigla === f.unidade)?.fracionavel ?? false;
  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={produto ? `Editar ${produto.nome}` : "Novo produto"}
      subtitulo={produto ? `Cadastrado em ${dataHora(produto.criado_em)}` : "Campos com * são obrigatórios."}
      largura="lg"
      rodape={
        <>
          {!produto && <Interruptor ligado={continuar} aoMudar={setContinuar} rotulo="Cadastrar outro em seguida" />}
          <span className="flex-1" />
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-produto" carregando={enviando}>
            {produto ? "Salvar alterações" : "Cadastrar produto"}
          </Botao>
        </>
      }
    >
      <form id="form-produto" onSubmit={salvar} className="grid gap-4 md:grid-cols-6">
        {erro && !erro.campo && (
          <div className="md:col-span-6">
            <AvisoErro mensagem={erro.texto} />
          </div>
        )}
        <Campo rotulo="Nome *" erro={erroDe("nome")} className="md:col-span-4">
          <Entrada autoFocus value={f.nome} maxLength={120} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Pipa raia 50 cm" invalido={!!erroDe("nome")} />
        </Campo>
        <Campo rotulo="Categoria" className="md:col-span-2">
          <Entrada list="categorias-produto" value={f.categoria} maxLength={60} onChange={(e) => setF({ ...f, categoria: e.target.value })} placeholder="Ex.: Pipas" />
          <datalist id="categorias-produto">
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Campo>
        <Campo rotulo="Preço de venda *" erro={erroDe("preco_centavos")} className="md:col-span-2">
          <CampoDinheiro valor={f.preco} aoMudar={(v) => setF({ ...f, preco: v })} invalido={!!erroDe("preco_centavos")} />
        </Campo>
        <Campo rotulo="Preço de custo" erro={erroDe("custo_centavos")} dica="Quanto a loja paga (ou gasta para fazer)." className="md:col-span-2">
          <CampoDinheiro valor={f.custo} aoMudar={(v) => setF({ ...f, custo: v })} />
        </Campo>
        <div className="flex flex-col justify-center rounded-2xl bg-[#f6f6f3] px-4 py-2.5 md:col-span-2">
          <p className="rotulo">Lucro por unidade</p>
          <p className={cx("text-[18px] font-extrabold tabular-nums", lucro !== null && lucro < 0 && "text-perigo")}>
            {lucro === null ? "—" : reais(lucro)} <span className="text-[13px] font-semibold text-suave">{margem === null ? "" : `· ${porcento(margem)}`}</span>
          </p>
        </div>
        <Campo rotulo="Unidade de venda" className="md:col-span-2">
          <Selecao value={f.unidade} onChange={(e) => setF({ ...f, unidade: e.target.value as Unidade })}>
            {unidades.map((u) => (
              <option key={u.sigla} value={u.sigla}>
                {u.nome} ({u.sigla})
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Código interno" erro={erroDe("codigo")} className="md:col-span-2">
          <Entrada value={f.codigo} maxLength={48} onChange={(e) => setF({ ...f, codigo: e.target.value })} placeholder="Opcional" invalido={!!erroDe("codigo")} />
        </Campo>
        <Campo rotulo="Código de barras" erro={erroDe("codigo_barras")} dica="Clique aqui e passe o leitor." className="md:col-span-2">
          <Entrada
            value={f.codigo_barras}
            maxLength={48}
            onChange={(e) => setF({ ...f, codigo_barras: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
            placeholder="Opcional"
            invalido={!!erroDe("codigo_barras")}
          />
        </Campo>
        <div className="rounded-2xl border border-borda p-4 md:col-span-6">
          <Interruptor
            ligado={f.controla_estoque}
            aoMudar={(v) => setF({ ...f, controla_estoque: v })}
            rotulo="Controlar estoque deste produto"
            descricao="Desligue para serviços ou itens que não precisam de contagem."
          />
          {f.controla_estoque && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {!produto && (
                <Campo rotulo="Estoque inicial" erro={erroDe("estoque_inicial")} dica={frac ? "Aceita fração (ex.: 1,5)." : "Número inteiro."}>
                  <Entrada inputMode="decimal" value={f.estoque_inicial} onChange={(e) => setF({ ...f, estoque_inicial: e.target.value })} placeholder="0" />
                </Campo>
              )}
              {produto && (
                <Campo rotulo="Estoque atual" dica="Para mudar, use “Ajustar estoque” ou uma entrada de mercadoria.">
                  <Entrada value={quantidade(produto.estoque, produto.unidade)} disabled />
                </Campo>
              )}
              <Campo rotulo="Estoque mínimo" erro={erroDe("estoque_minimo")} dica="Avisa quando chegar nesse número.">
                <Entrada inputMode="decimal" value={f.estoque_minimo} onChange={(e) => setF({ ...f, estoque_minimo: e.target.value })} placeholder="0" />
              </Campo>
            </div>
          )}
        </div>
        <Campo rotulo="Observação" className="md:col-span-6">
          <AreaTexto value={f.observacao} maxLength={500} onChange={(e) => setF({ ...f, observacao: e.target.value })} placeholder="Opcional" />
        </Campo>
        {produto && (
          <div className="md:col-span-6">
            <Interruptor ligado={f.ativo} aoMudar={(v) => setF({ ...f, ativo: v })} rotulo="Produto ativo" descricao="Desativado não aparece na frente de caixa." />
          </div>
        )}
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Ajuste de estoque                                                    */
/* ------------------------------------------------------------------ */
function AjusteEstoque({ produto, aoFechar }: { produto: Produto; aoFechar: () => void }) {
  const [tipo, setTipo] = useState<"contagem" | "perda" | "brinde" | "uso">("contagem");
  const [qtd, setQtd] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const opcoes = [
    { id: "contagem", titulo: "Contagem", texto: "Informar quanto tem na prateleira" },
    { id: "perda", titulo: "Perda", texto: "Rasgou, quebrou, sumiu" },
    { id: "brinde", titulo: "Brinde", texto: "Saiu de graça" },
    { id: "uso", titulo: "Uso na loja", texto: "Usado pela própria loja" },
  ] as const;
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const q = textoParaQuantidade(qtd);
    if (q === null) return setErro("Informe a quantidade.");
    setEnviando(true);
    setErro(null);
    try {
      await api.post(
        "/api/estoque/ajustes",
        tipo === "contagem"
          ? { produto_id: produto.id, tipo, nova_quantidade: q, observacao: obs }
          : { produto_id: produto.id, tipo, quantidade: q, observacao: obs },
      );
      avisar("Estoque ajustado.");
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
      titulo="Ajustar estoque"
      subtitulo={`${produto.nome} · hoje: ${quantidade(produto.estoque, produto.unidade)}`}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-ajuste" carregando={enviando}>
            Registrar ajuste
          </Botao>
        </>
      }
    >
      <form id="form-ajuste" onSubmit={salvar} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {opcoes.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setTipo(o.id)}
              className={cx("rounded-2xl border p-3 text-left", tipo === o.id ? "border-tinta bg-[#f6f6f3] ring-1 ring-tinta" : "border-borda hover:border-[#bdbdb7]")}
            >
              <p className="text-[13.5px] font-bold">{o.titulo}</p>
              <p className="text-[12px] text-suave">{o.texto}</p>
            </button>
          ))}
        </div>
        <Campo
          rotulo={tipo === "contagem" ? "Quantidade contada" : "Quantidade que saiu"}
          dica={tipo === "contagem" ? "O sistema calcula a diferença e registra no histórico." : "Entra no relatório de resultado como custo, pelo custo atual do produto."}
        >
          <Entrada autoFocus inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder="0" />
        </Campo>
        <Campo rotulo="Observação">
          <Entrada value={obs} maxLength={200} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" />
        </Campo>
        {erro && <AvisoErro mensagem={erro} />}
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Histórico                                                            */
/* ------------------------------------------------------------------ */
const NOMES_MOVIMENTO: Record<string, string> = {
  inicial: "Estoque inicial",
  entrada: "Entrada (compra)",
  venda: "Venda",
  cancelamento: "Venda cancelada",
  contagem: "Contagem",
  perda: "Perda",
  brinde: "Brinde",
  uso: "Uso na loja",
};

function HistoricoDoProduto({ produto, aoFechar }: { produto: Produto; aoFechar: () => void }) {
  const h = useApi<HistoricoProduto>(`/api/produtos/${produto.id}/historico`);
  return (
    <Modal aberto aoFechar={aoFechar} lado largura="lg" titulo={produto.nome} subtitulo="Movimentos de estoque e mudanças de preço (os mais recentes primeiro)">
      {h.erro && <AvisoErro mensagem={h.erro} />}
      {!h.dados ? (
        <Carregando />
      ) : (
        <div className="space-y-6">
          <section>
            <p className="rotulo mb-2">Estoque</p>
            {h.dados.movimentos.length === 0 ? (
              <p className="text-[13px] text-suave">Nenhum movimento ainda.</p>
            ) : (
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Movimento</th>
                    <th className="num">Qtd.</th>
                    <th className="num">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {h.dados.movimentos.map((m) => (
                    <tr key={m.id}>
                      <td className="text-[#55585e]">{dataHora(m.criado_em)}</td>
                      <td>
                        <p className="font-semibold">{NOMES_MOVIMENTO[m.tipo] ?? m.tipo}</p>
                        {m.observacao && <p className="text-[12px] text-suave">{m.observacao}</p>}
                      </td>
                      <td className={cx("num font-semibold", m.quantidade < 0 ? "text-perigo" : "text-sucesso")}>
                        {m.quantidade > 0 ? "+" : ""}
                        {quantidade(m.quantidade)}
                      </td>
                      <td className="num">{quantidade(m.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section>
            <p className="rotulo mb-2">Preço e custo</p>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Motivo</th>
                  <th className="num">Custo</th>
                  <th className="num">Preço</th>
                </tr>
              </thead>
              <tbody>
                {h.dados.alteracoes_preco.map((a, i) => (
                  <tr key={i}>
                    <td className="text-[#55585e]">{dataHora(a.criado_em)}</td>
                    <td>{a.motivo === "cadastro" ? "Cadastro" : a.motivo === "entrada" ? "Entrada (custo médio)" : "Edição"}</td>
                    <td className="num">
                      {a.custo_antes_centavos !== null && a.custo_antes_centavos !== a.custo_depois_centavos && (
                        <span className="mr-1 text-suave line-through">{reais(a.custo_antes_centavos)}</span>
                      )}
                      {reais(a.custo_depois_centavos)}
                    </td>
                    <td className="num">
                      {a.preco_antes_centavos !== null && a.preco_antes_centavos !== a.preco_depois_centavos && (
                        <span className="mr-1 text-suave line-through">{reais(a.preco_antes_centavos)}</span>
                      )}
                      {reais(a.preco_depois_centavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Entrada de mercadoria (compra)                                       */
/* ------------------------------------------------------------------ */
interface ItemEntradaForm {
  produto: Produto;
  qtd: string;
  custo: number | null;
}

function NovaEntrada({ produtos, aoFechar }: { produtos: Produto[]; aoFechar: () => void }) {
  const [itens, setItens] = useState<ItemEntradaForm[]>([]);
  const [fornecedor, setFornecedor] = useState("");
  const [obs, setObs] = useState("");
  const [fin, setFin] = useState<"nao" | "gaveta" | "conta" | "pendente">("conta");
  const [vencimento, setVencimento] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const totalItem = (i: ItemEntradaForm) => {
    const q = textoParaQuantidade(i.qtd);
    return q === null || i.custo === null ? null : Math.floor((2 * Math.round(q * 1000) * i.custo + 1000) / 2000);
  };
  const total = itens.reduce((s, i) => s + (totalItem(i) ?? 0), 0);

  async function salvar() {
    if (!itens.length) return setErro("Adicione pelo menos um produto.");
    for (const i of itens) {
      if (textoParaQuantidade(i.qtd) === null || !textoParaQuantidade(i.qtd)) return setErro(`Informe a quantidade de "${i.produto.nome}".`);
      if (i.custo === null) return setErro(`Informe o custo unitário de "${i.produto.nome}".`);
    }
    if (fin === "pendente" && !vencimento) return setErro("Informe o vencimento da conta a pagar.");
    setEnviando(true);
    setErro(null);
    try {
      await api.post("/api/estoque/entradas", {
        fornecedor,
        observacao: obs,
        itens: itens.map((i) => ({ produto_id: i.produto.id, quantidade: textoParaQuantidade(i.qtd), custo_unitario_centavos: i.custo })),
        financeiro: fin === "nao" ? null : fin === "pendente" ? { pago: false, vencimento } : { pago: true, origem: fin },
      });
      avisar("Entrada registrada. Estoque e custo atualizados.");
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
      titulo="Entrada de mercadoria"
      subtitulo="Soma no estoque e recalcula o custo pelo custo médio. Opcionalmente lança a compra no financeiro."
      largura="xl"
      rodape={
        <>
          <p className="mr-auto text-[14px]">
            Total da compra: <strong className="tabular-nums">{reais(total)}</strong>
          </p>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao onClick={() => void salvar()} carregando={enviando} disabled={!itens.length}>
            Registrar entrada
          </Botao>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Campo rotulo="Fornecedor">
            <Entrada value={fornecedor} maxLength={80} onChange={(e) => setFornecedor(e.target.value)} placeholder="Opcional" />
          </Campo>
          <Campo rotulo="Observação">
            <Entrada value={obs} maxLength={300} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: nota 1234" />
          </Campo>
        </div>
        <div>
          <p className="mb-2 text-[12.5px] font-semibold text-[#3d4045]">Produtos da compra</p>
          {produtos.length === 0 ? (
            <p className="text-[13px] text-suave">Nenhum produto ativo com controle de estoque.</p>
          ) : (
            <SeletorProduto
              produtos={produtos}
              excluir={itens.map((i) => i.produto.id)}
              aoEscolher={(p) => setItens((l) => [...l, { produto: p, qtd: "", custo: p.custo_centavos || null }])}
            />
          )}
          {itens.length > 0 && (
            <table className="tabela mt-3">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th className="num">Estoque hoje</th>
                  <th className="num">Quantidade</th>
                  <th className="num">Custo unitário</th>
                  <th className="num">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {itens.map((i, n) => (
                  <tr key={i.produto.id}>
                    <td className="font-semibold">{i.produto.nome}</td>
                    <td className="num text-suave">{quantidade(i.produto.estoque, i.produto.unidade)}</td>
                    <td className="num">
                      <Entrada
                        autoFocus={n === itens.length - 1}
                        className="ml-auto w-24 text-right"
                        inputMode="decimal"
                        value={i.qtd}
                        onChange={(e) => setItens((l) => l.map((x, k) => (k === n ? { ...x, qtd: e.target.value } : x)))}
                        placeholder="0"
                      />
                    </td>
                    <td className="num">
                      <div className="ml-auto w-36">
                        <CampoDinheiro valor={i.custo} aoMudar={(v) => setItens((l) => l.map((x, k) => (k === n ? { ...x, custo: v } : x)))} />
                      </div>
                    </td>
                    <td className="num font-semibold">{reais(totalItem(i))}</td>
                    <td className="num">
                      <BotaoIcone rotulo="Tirar" perigo onClick={() => setItens((l) => l.filter((_, k) => k !== n))}>
                        <Trash2 className="size-4" />
                      </BotaoIcone>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="rounded-2xl border border-borda p-4">
          <p className="mb-3 text-[13.5px] font-bold">Lançar a compra no financeiro?</p>
          <div className="grid gap-2 md:grid-cols-4">
            {(
              [
                ["conta", "Paga (banco, PIX ou cartão)"],
                ["gaveta", "Paga com dinheiro da gaveta"],
                ["pendente", "A pagar (fica em contas a pagar)"],
                ["nao", "Não lançar"],
              ] as const
            ).map(([id, texto]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFin(id)}
                className={cx("rounded-xl border px-3 py-2.5 text-left text-[13px] font-semibold", fin === id ? "border-tinta bg-[#f6f6f3] ring-1 ring-tinta" : "border-borda hover:border-[#bdbdb7]")}
              >
                {texto}
              </button>
            ))}
          </div>
          {fin === "pendente" && (
            <Campo rotulo="Vencimento" className="mt-3 max-w-xs">
              <Entrada type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
            </Campo>
          )}
          <p className="mt-3 text-[12px] text-suave">
            A compra entra na categoria “Compra de mercadoria”, que não conta no lucro: o custo entra quando o produto é vendido (assim não conta duas vezes).
          </p>
        </div>
        {erro && <AvisoErro mensagem={erro} />}
      </div>
    </Modal>
  );
}

function ListaEntradas({ aoNova }: { aoNova: () => void }) {
  const lista = useApi<EntradaMercadoria[]>("/api/estoque/entradas");
  const [aberta, setAberta] = useState<number | null>(null);
  const detalhe = useApi<EntradaMercadoria>(aberta ? `/api/estoque/entradas/${aberta}` : null);
  return (
    <Cartao corpo={false}>
      {lista.erro && <AvisoErro mensagem={lista.erro} />}
      {!lista.dados ? (
        <Carregando />
      ) : lista.dados.length === 0 ? (
        <Vazio
          icone={<ClipboardList className="size-6" />}
          titulo="Nenhuma entrada registrada"
          texto="Quando chegar mercadoria, registre aqui para somar no estoque e atualizar o custo."
          acao={
            <Botao icone={<PackagePlus className="size-4" />} onClick={aoNova}>
              Registrar entrada
            </Botao>
          }
        />
      ) : (
        <table className="tabela">
          <thead>
            <tr>
              <th>Nº</th>
              <th>Data</th>
              <th>Fornecedor</th>
              <th className="num">Itens</th>
              <th className="num">Total</th>
              <th>Financeiro</th>
            </tr>
          </thead>
          <tbody>
            {lista.dados.map((e) => (
              <tr key={e.id} className="clicavel" onClick={() => setAberta(e.id)}>
                <td className="font-semibold">{e.id}</td>
                <td>{data(e.data)}</td>
                <td>{e.fornecedor || "—"}</td>
                <td className="num">{e.itens_quantidade}</td>
                <td className="num font-semibold">{reais(e.total_centavos)}</td>
                <td>{e.lancamento_id ? <Etiqueta tom="info">Lançada</Etiqueta> : <Etiqueta>Não lançada</Etiqueta>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {aberta && (
        <Modal aberto aoFechar={() => setAberta(null)} lado largura="lg" titulo={`Entrada nº ${aberta}`} subtitulo={detalhe.dados ? `${data(detalhe.dados.data)} · ${detalhe.dados.fornecedor || "sem fornecedor"}` : undefined}>
          {!detalhe.dados ? (
            <Carregando />
          ) : (
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
          )}
        </Modal>
      )}
    </Cartao>
  );
}

/* ------------------------------------------------------------------ */
/* Importar planilha (CSV)                                              */
/* ------------------------------------------------------------------ */
const COLUNAS: Record<string, string> = {
  nome: "nome",
  produto: "nome",
  descricao: "nome",
  preco: "preco",
  "preco de venda": "preco",
  venda: "preco",
  custo: "custo",
  "preco de custo": "custo",
  categoria: "categoria",
  codigo: "codigo",
  "codigo interno": "codigo",
  "codigo de barras": "codigo_barras",
  ean: "codigo_barras",
  barras: "codigo_barras",
  estoque: "estoque",
  quantidade: "estoque",
  "estoque minimo": "estoque_minimo",
  minimo: "estoque_minimo",
  unidade: "unidade",
};

function lerCsv(texto: string): string[][] {
  const sep = (texto.split("\n")[0] ?? "").split(";").length > (texto.split("\n")[0] ?? "").split(",").length ? ";" : ",";
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!;
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo);
      if (linha.some((x) => x.trim())) linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((x) => x.trim())) linhas.push(linha);
  return linhas;
}

function ImportarPlanilha({ aoFechar }: { aoFechar: () => void }) {
  const [linhas, setLinhas] = useState<Array<Record<string, string>> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<{ feitos: number; erros: string[] } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function lerArquivo(arquivo: File) {
    setErro(null);
    setProgresso(null);
    const bruto = await arquivo.arrayBuffer();
    let texto = new TextDecoder("utf-8").decode(bruto);
    if (texto.includes("�")) texto = new TextDecoder("windows-1252").decode(bruto);
    const tabela = lerCsv(texto.replace(/^﻿/, ""));
    if (tabela.length < 2) return setErro("A planilha precisa de uma linha de títulos e pelo menos um produto.");
    const titulos = tabela[0]!.map((t) => COLUNAS[normalizar(t)] ?? "");
    if (!titulos.includes("nome") || !titulos.includes("preco")) {
      return setErro('Não achei as colunas "nome" e "preço". Use o modelo abaixo (salve como CSV).');
    }
    setLinhas(
      tabela.slice(1).map((l) => {
        const o: Record<string, string> = {};
        titulos.forEach((t, i) => {
          if (t) o[t] = (l[i] ?? "").trim();
        });
        return o;
      }),
    );
  }

  async function importar() {
    if (!linhas) return;
    setEnviando(true);
    const erros: string[] = [];
    let feitos = 0;
    for (const [n, l] of linhas.entries()) {
      const preco = textoParaCentavos(l.preco ?? "");
      const custo = l.custo ? textoParaCentavos(l.custo) : 0;
      const estoque = l.estoque ? textoParaQuantidade(l.estoque) : 0;
      const minimo = l.estoque_minimo ? textoParaQuantidade(l.estoque_minimo) : 0;
      const linhaN = n + 2;
      if (!l.nome) {
        erros.push(`Linha ${linhaN}: sem nome.`);
        continue;
      }
      if (!preco) {
        erros.push(`Linha ${linhaN} (${l.nome}): preço inválido.`);
        continue;
      }
      if (custo === null || estoque === null || minimo === null) {
        erros.push(`Linha ${linhaN} (${l.nome}): custo ou estoque inválido.`);
        continue;
      }
      try {
        await api.post("/api/produtos", {
          nome: l.nome,
          categoria: l.categoria ?? "",
          unidade: l.unidade ? normalizar(l.unidade) : "un",
          codigo: l.codigo || null,
          codigo_barras: l.codigo_barras || null,
          preco_centavos: preco,
          custo_centavos: custo,
          controla_estoque: true,
          estoque_inicial: estoque,
          estoque_minimo: minimo,
          observacao: "",
        });
        feitos++;
      } catch (e) {
        erros.push(`Linha ${linhaN} (${l.nome}): ${mensagemDeErro(e)}`);
      }
      setProgresso({ feitos, erros: [...erros] });
    }
    setProgresso({ feitos, erros });
    setEnviando(false);
    avisarMudanca();
    if (feitos) avisar(`${plural(feitos, "produto importado", "produtos importados")}.`);
  }

  const modelo = "nome;preco;custo;categoria;codigo de barras;estoque;estoque minimo;unidade\n";
  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Importar produtos de planilha"
      subtitulo="Salve a planilha como CSV (Excel: Arquivo › Salvar como › CSV). Cada linha vira um produto."
      largura="lg"
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Fechar
          </Botao>
          <Botao onClick={() => void importar()} disabled={!linhas?.length || enviando || !!progresso} carregando={enviando}>
            {linhas ? `Importar ${plural(linhas.length, "produto")}` : "Importar"}
          </Botao>
        </>
      }
    >
      <div className="space-y-4 text-[13.5px]">
        <div className="rounded-2xl bg-[#f6f6f3] p-4">
          <p className="font-semibold">Colunas aceitas</p>
          <p className="mt-1 text-suave">
            <strong className="text-tinta">nome</strong> e <strong className="text-tinta">preço</strong> (obrigatórias), custo, categoria, código, código de barras, estoque, estoque mínimo e unidade (un, pct, cx, m, kg…).
          </p>
          <a
            className="mt-2 inline-block font-semibold text-foco underline-offset-2 hover:underline"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent("﻿" + modelo)}`}
            download="modelo-produtos-tf-pipas.csv"
          >
            Baixar modelo em branco (CSV)
          </a>
        </div>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const a = e.target.files?.[0];
            if (a) void lerArquivo(a);
          }}
          className="block w-full text-[13px] file:mr-3 file:rounded-xl file:border-0 file:bg-tinta file:px-4 file:py-2 file:font-semibold file:text-white"
        />
        {erro && <AvisoErro mensagem={erro} />}
        {linhas && !progresso && (
          <div className="max-h-64 overflow-auto rounded-xl border border-borda">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th className="num">Preço</th>
                  <th className="num">Custo</th>
                  <th>Categoria</th>
                  <th className="num">Estoque</th>
                </tr>
              </thead>
              <tbody>
                {linhas.slice(0, 50).map((l, i) => (
                  <tr key={i}>
                    <td>{l.nome || <span className="text-perigo">sem nome</span>}</td>
                    <td className="num">{reais(textoParaCentavos(l.preco ?? ""))}</td>
                    <td className="num">{l.custo ? reais(textoParaCentavos(l.custo)) : "—"}</td>
                    <td>{l.categoria || "—"}</td>
                    <td className="num">{l.estoque || "0"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {progresso && (
          <div className="space-y-2">
            <p className="font-semibold">
              {plural(progresso.feitos, "produto importado", "produtos importados")}
              {progresso.erros.length > 0 && `, ${plural(progresso.erros.length, "linha com problema", "linhas com problema")}`}.
            </p>
            {progresso.erros.length > 0 && (
              <ul className="max-h-48 list-disc overflow-auto rounded-xl bg-[#fff5f5] py-2 pr-3 pl-7 text-[12.5px] text-[#8f1d21]">
                {progresso.erros.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
