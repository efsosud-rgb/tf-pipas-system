import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CreditCard,
  Minus,
  PackagePlus,
  Plus,
  Printer,
  QrCode,
  ScanBarcode,
  Search,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, mensagemDeErro } from "../api";
import { avisar, confirmar } from "../componentes/avisos";
import { imprimirComprovante } from "../componentes/comprovante";
import { AvisoErro, Botao, Campo, CampoDinheiro, Carregando, cx, Entrada, Etiqueta, Modal, Vazio } from "../componentes/ui";
import { normalizar, plural, porcento, quantidade, reais, textoParaBp, textoParaCentavos, textoParaQuantidade } from "../formato";
import { avisarMudanca, gravarLocal, lerLocal, useApi, useAtalhos } from "../hooks";
import { irPara } from "../rotas";
import type { Config, FormaPagamento, PainelInicio, Produto, ResumoCaixa, UnidadeInfo, Venda } from "../tipos";

interface ItemCarrinho {
  produto_id: number;
  nome: string;
  unidade: string;
  preco_centavos: number;
  quantidade: number;
}
interface LinhaPagamento {
  chave: number;
  forma_id: number;
  valor: number | null;
  /** Acompanha o total sozinho até a pessoa digitar um valor. */
  automatico: boolean;
}
interface Rascunho {
  itens: ItemCarrinho[];
  descontoTexto: string;
  descontoModo: "valor" | "porcento";
  cliente: string;
  observacao: string;
}

const CHAVE_RASCUNHO = "tfpipas.venda-em-andamento";
const RASCUNHO_VAZIO: Rascunho = { itens: [], descontoTexto: "", descontoModo: "valor", cliente: "", observacao: "" };

/** Mesmo arredondamento do servidor: quantidade (em milésimos) × preço, meio centavo para cima. */
function valorItem(qtd: number, preco: number): number {
  const mil = Math.round(qtd * 1000);
  return Math.floor((2 * mil * preco + 1000) / 2000);
}

function iconeForma(f: FormaPagamento) {
  const n = normalizar(f.nome);
  if (f.tipo === "dinheiro") return <Banknote className="size-4" />;
  if (n.includes("pix")) return <QrCode className="size-4" />;
  if (n.includes("cart") || n.includes("credito") || n.includes("debito")) return <CreditCard className="size-4" />;
  return <Wallet className="size-4" />;
}

export default function Pdv() {
  const produtos = useApi<Produto[]>("/api/produtos");
  const formas = useApi<FormaPagamento[]>("/api/formas-pagamento");
  const config = useApi<Config>("/api/config");
  const caixa = useApi<{ caixa: ResumoCaixa | null }>("/api/caixa/atual");
  const unidades = useApi<UnidadeInfo[]>("/api/unidades");
  const painel = useApi<PainelInicio>("/api/inicio");

  const [rascunho, setRascunho] = useState<Rascunho>(() => lerLocal(CHAVE_RASCUNHO, RASCUNHO_VAZIO));
  const [pagamentosBase, setPagamentos] = useState<LinhaPagamento[]>([]);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [destaque, setDestaque] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [concluida, setConcluida] = useState<Venda | null>(null);
  const [maisOpcoes, setMaisOpcoes] = useState(false);
  const refBusca = useRef<HTMLInputElement>(null);
  const refDesconto = useRef<HTMLInputElement>(null);
  const chavePg = useRef(1);

  useEffect(() => gravarLocal(CHAVE_RASCUNHO, rascunho.itens.length ? rascunho : null), [rascunho]);
  useEffect(() => refBusca.current?.focus(), []);

  const fracionavel = useMemo(() => new Map((unidades.dados ?? []).map((u) => [u.sigla as string, u.fracionavel])), [unidades.dados]);
  const porId = useMemo(() => new Map((produtos.dados ?? []).map((p) => [p.id, p])), [produtos.dados]);
  const categorias = useMemo(() => [...new Set((produtos.dados ?? []).map((p) => p.categoria).filter(Boolean))].sort(), [produtos.dados]);

  const filtrados = useMemo(() => {
    const lista = produtos.dados ?? [];
    const termos = normalizar(busca.replace(/^\d+(?:[.,]\d+)?\s*[*xX]\s*/, "")).split(/\s+/).filter(Boolean);
    return lista.filter((p) => {
      if (categoria && p.categoria !== categoria) return false;
      if (!termos.length) return true;
      const alvo = normalizar(`${p.nome} ${p.categoria} ${p.codigo ?? ""} ${p.codigo_barras ?? ""}`);
      return termos.every((t) => alvo.includes(t));
    });
  }, [produtos.dados, busca, categoria]);

  // ---- contas da venda -------------------------------------------------------
  const subtotal = rascunho.itens.reduce((s, i) => s + valorItem(i.quantidade, i.preco_centavos), 0);
  const descontoBp = rascunho.descontoModo === "porcento" ? textoParaBp(rascunho.descontoTexto) : null;
  const desconto = (() => {
    if (!rascunho.descontoTexto.trim()) return 0;
    if (rascunho.descontoModo === "porcento") return descontoBp === null ? NaN : Math.round((subtotal * descontoBp) / 10_000);
    const v = textoParaCentavos(rascunho.descontoTexto);
    return v === null ? NaN : v;
  })();
  const descontoInvalido = Number.isNaN(desconto) || (subtotal > 0 && desconto >= subtotal);
  const total = Math.max(0, subtotal - (Number.isNaN(desconto) ? 0 : desconto));

  // a forma "automática" (a primeira escolhida) acompanha o total sozinha
  const fixos = pagamentosBase.filter((p) => !p.automatico).reduce((s, p) => s + (p.valor ?? 0), 0);
  const pagamentos = pagamentosBase.map((p) => (p.automatico ? { ...p, valor: Math.max(0, total - fixos) } : p));

  const formaPorId = useMemo(() => new Map((formas.dados ?? []).map((f) => [f.id, f])), [formas.dados]);
  const recebido = pagamentos.reduce((s, p) => s + (p.valor ?? 0), 0);
  const dinheiroRecebido = pagamentos.filter((p) => formaPorId.get(p.forma_id)?.tipo === "dinheiro").reduce((s, p) => s + (p.valor ?? 0), 0);
  const falta = Math.max(0, total - recebido);
  const troco = Math.max(0, recebido - total);
  const trocoInvalido = troco > dinheiroRecebido;
  const caixaAberto = caixa.dados?.caixa ?? null;
  const podeConcluir =
    rascunho.itens.length > 0 && !descontoInvalido && total > 0 && pagamentos.length > 0 && falta === 0 && !trocoInvalido && !!caixaAberto && !enviando;

  // ---- ações -----------------------------------------------------------------
  function alterar(fn: (r: Rascunho) => Rascunho) {
    setRascunho((r) => fn(r));
    setErro(null);
  }

  function adicionar(p: Produto, qtd = 1) {
    alterar((r) => {
      const existe = r.itens.find((i) => i.produto_id === p.id);
      const itens = existe
        ? r.itens.map((i) => (i.produto_id === p.id ? { ...i, quantidade: Math.round((i.quantidade + qtd) * 1000) / 1000 } : i))
        : [...r.itens, { produto_id: p.id, nome: p.nome, unidade: p.unidade, preco_centavos: p.preco_centavos, quantidade: qtd }];
      return { ...r, itens };
    });
  }

  function mudarQuantidade(id: number, qtd: number) {
    if (qtd <= 0) return remover(id);
    alterar((r) => ({ ...r, itens: r.itens.map((i) => (i.produto_id === id ? { ...i, quantidade: qtd } : i)) }));
  }

  function remover(id: number) {
    alterar((r) => ({ ...r, itens: r.itens.filter((i) => i.produto_id !== id) }));
  }

  function limparVenda() {
    setRascunho(RASCUNHO_VAZIO);
    setPagamentos([]);
    setBusca("");
    setErro(null);
    setMaisOpcoes(false);
    refBusca.current?.focus();
  }

  async function confirmarLimpeza() {
    if (!rascunho.itens.length) return limparVenda();
    const r = await confirmar({ titulo: "Limpar a venda?", texto: "Os itens desta venda saem da tela. Nada foi gravado ainda.", confirmar: "Limpar venda", perigo: true });
    if (r.ok) limparVenda();
  }

  function enviarBusca() {
    const texto = busca.trim();
    if (!texto) return;
    let qtd = 1;
    let codigo = texto;
    const m = /^(\d+(?:[.,]\d+)?)\s*[*xX]\s*(.+)$/.exec(texto);
    if (m) {
      qtd = textoParaQuantidade(m[1]!) ?? 1;
      codigo = m[2]!.trim();
    }
    const lista = produtos.dados ?? [];
    const exato = lista.find((p) => p.codigo_barras === codigo || (p.codigo && p.codigo.toLowerCase() === codigo.toLowerCase()));
    const escolhido = exato ?? filtrados[Math.min(destaque, filtrados.length - 1)];
    if (!escolhido) {
      setErro(`Nenhum produto encontrado para "${codigo}".`);
      return;
    }
    if (!fracionavel.get(escolhido.unidade) && !Number.isInteger(qtd)) {
      setErro(`"${escolhido.nome}" é vendido por ${escolhido.unidade}: use quantidade inteira.`);
      return;
    }
    adicionar(escolhido, qtd);
    setBusca("");
    setDestaque(0);
  }

  function escolherForma(f: FormaPagamento) {
    setErro(null);
    if (pagamentos.some((p) => p.forma_id === f.id)) return;
    // a primeira forma escolhida acompanha o total; as outras pegam o que falta
    if (pagamentos.length === 0) {
      setPagamentos([{ chave: chavePg.current++, forma_id: f.id, valor: null, automatico: true }]);
      return;
    }
    const pagos = pagamentos.reduce((s, p) => s + (p.valor ?? 0), 0);
    setPagamentos([
      ...pagamentos.map((p) => ({ ...p, automatico: false })),
      { chave: chavePg.current++, forma_id: f.id, valor: Math.max(0, total - pagos), automatico: false },
    ]);
  }

  async function concluir() {
    if (!podeConcluir) return;
    setEnviando(true);
    setErro(null);
    try {
      const venda = await api.post<Venda>("/api/vendas", {
        itens: rascunho.itens.map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade })),
        desconto_centavos: desconto || 0,
        pagamentos: pagamentos.filter((p) => (p.valor ?? 0) > 0).map((p) => ({ forma_id: p.forma_id, valor_centavos: p.valor })),
        cliente: rascunho.cliente,
        observacao: rascunho.observacao,
      });
      setConcluida(venda);
      setRascunho(RASCUNHO_VAZIO);
      setPagamentos([]);
      setMaisOpcoes(false);
      avisarMudanca();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  useAtalhos(
    {
      F2: () => refBusca.current?.focus(),
      F4: () => refDesconto.current?.focus(),
      F8: () => {
        const dinheiro = (formas.dados ?? []).find((f) => f.tipo === "dinheiro");
        if (dinheiro && rascunho.itens.length) escolherForma(dinheiro);
      },
      F9: () => void concluir(),
      "Ctrl+Delete": () => void confirmarLimpeza(),
    },
    !concluida,
  );

  // ---- tela ------------------------------------------------------------------
  if (produtos.carregando && !produtos.dados) return <Carregando texto="Abrindo a frente de caixa…" />;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <p className="rotulo">Loja · Frente de caixa</p>
          <h1 className="mt-1 text-[30px] leading-none font-black tracking-[-0.035em]">
            PDV <span className="font-light text-[#b9bab5]">/</span> Nova venda
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Etiqueta tom="neutro">Hoje: {painel.dados ? `${plural(painel.dados.dia.vendas, "venda")} · ${reais(painel.dados.dia.receita_centavos)}` : "—"}</Etiqueta>
          <Etiqueta tom="neutro">Sem NFC-e · comprovante não fiscal</Etiqueta>
          <Botao variante="secundario" tamanho="sm" icone={<X className="size-4" />} onClick={() => void confirmarLimpeza()} atalho="Ctrl+Del">
            Limpar venda
          </Botao>
        </div>
      </header>

      {produtos.erro && <AvisoErro mensagem={produtos.erro} aoTentar={produtos.recarregar} />}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(400px,450px)]">
        {/* ------------------------------ catálogo ------------------------------ */}
        <section className="flex min-h-0 flex-col rounded-[20px] border border-borda/80 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,.04)]">
          <div className="relative">
            <ScanBarcode className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-suave" />
            <input
              ref={refBusca}
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setDestaque(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  enviarBusca();
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setDestaque((d) => Math.min(d + 1, Math.max(filtrados.length - 1, 0)));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setDestaque((d) => Math.max(d - 1, 0));
                } else if (e.key === "Escape") {
                  setBusca("");
                }
              }}
              placeholder="Escaneie o código de barras ou digite o nome (ex.: 3*pipa)"
              className="h-12 w-full rounded-2xl border border-borda bg-[#fafaf8] pr-16 pl-11 text-[15px] focus:border-[#9aa3ad] focus:bg-white focus:ring-4 focus:ring-foco/15 focus:outline-none"
              aria-label="Buscar produto"
            />
            <kbd className="absolute top-1/2 right-3 -translate-y-1/2 rounded-md border border-borda bg-white px-1.5 py-0.5 font-mono text-[10.5px] text-suave">F2</kbd>
          </div>

          {categorias.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["", ...categorias].map((c) => (
                <button
                  key={c || "todas"}
                  type="button"
                  onClick={() => setCategoria(c)}
                  className={cx(
                    "rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors",
                    categoria === c ? "border-tinta bg-tinta text-white" : "border-borda text-[#4a4d52] hover:border-[#c9c9c3]",
                  )}
                >
                  {c || "Todas"}
                </button>
              ))}
            </div>
          )}

          {erro && (
            <div className="mt-3">
              <AvisoErro mensagem={erro} />
            </div>
          )}

          <div className="rolagem-fina -mr-2 mt-3 min-h-0 flex-1 overflow-y-auto pt-1 pr-2">
            {(produtos.dados ?? []).length === 0 ? (
              <Vazio
                icone={<PackagePlus className="size-6" />}
                titulo="Nenhum produto cadastrado"
                texto="Cadastre os produtos da loja (nome, preço e, se quiser, código de barras) para começar a vender."
                acao={
                  <Botao icone={<Plus className="size-4" />} onClick={() => irPara("produtos", "novo=1")}>
                    Cadastrar produtos
                  </Botao>
                }
              />
            ) : filtrados.length === 0 ? (
              <Vazio icone={<Search className="size-6" />} titulo="Nada encontrado" texto="Confira o nome ou o código. Produtos desativados não aparecem aqui." />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(178px,1fr))] gap-2.5">
                {filtrados.slice(0, 120).map((p, i) => {
                  const semEstoque = p.controla_estoque && p.estoque <= 0;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        adicionar(p);
                        refBusca.current?.focus();
                      }}
                      className={cx(
                        "group relative flex min-h-[104px] flex-col justify-between rounded-2xl border bg-white p-3.5 text-left transition-[border,box-shadow,transform] hover:-translate-y-0.5 hover:border-[#bdbdb7] hover:shadow-[0_12px_24px_-16px_rgba(0,0,0,.45)] active:translate-y-0",
                        busca && i === destaque ? "border-tinta ring-2 ring-tinta/15" : "border-borda",
                      )}
                    >
                      <span className="line-clamp-2 pr-6 text-[13.5px] leading-snug font-semibold text-tinta">{p.nome}</span>
                      <span className="mt-2 flex items-end justify-between gap-2">
                        <span className="text-[16px] font-extrabold tracking-tight tabular-nums">{reais(p.preco_centavos)}</span>
                        {p.controla_estoque ? (
                          <span className={cx("text-[11.5px] font-semibold tabular-nums", semEstoque ? "text-perigo" : p.situacao_estoque === "baixo" ? "text-alerta" : "text-suave")}>
                            {semEstoque ? "sem estoque" : quantidade(p.estoque, p.unidade)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-suave">{p.unidade}</span>
                        )}
                      </span>
                      <Plus className="absolute top-3 right-3 size-4 text-[#b5b6b1] transition-colors group-hover:text-tinta" />
                    </button>
                  );
                })}
              </div>
            )}
            {filtrados.length > 120 && <p className="mt-3 text-center text-[12px] text-suave">Mostrando 120 de {filtrados.length}. Digite mais do nome para filtrar.</p>}
          </div>
        </section>

        {/* ------------------------------ venda atual ------------------------------ */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-[20px] border border-borda/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,.04),0_24px_48px_-32px_rgba(0,0,0,.35)]">
          <header className="flex shrink-0 items-center justify-between gap-2 px-5 pt-3.5">
            <div>
              <p className="rotulo">Venda atual</p>
              <h2 className="mt-0.5 text-[18px] font-bold tracking-tight">{rascunho.itens.length ? plural(rascunho.itens.length, "item", "itens") : "Nenhum item"}</h2>
            </div>
            {caixaAberto ? <Etiqueta tom="ok" ponto>Caixa aberto</Etiqueta> : <Etiqueta tom="alerta" ponto>Caixa fechado</Etiqueta>}
          </header>

          <div className="rolagem-fina mt-2 min-h-[84px] flex-1 overflow-y-auto border-y border-[#efefeb] px-5">
            {rascunho.itens.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-suave">Escaneie ou clique nos produtos para adicionar.</p>
            ) : (
              <ul className="divide-y divide-[#efefeb]">
                {rascunho.itens.map((i) => {
                  const p = porId.get(i.produto_id);
                  const frac = fracionavel.get(i.unidade) ?? false;
                  const passo = 1;
                  const alertaEstoque = p && p.controla_estoque && p.estoque < i.quantidade;
                  return (
                    <li key={i.produto_id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-semibold">{i.nome}</p>
                        <p className="text-[11.5px] text-suave tabular-nums">
                          {reais(i.preco_centavos)} / {i.unidade}
                          {alertaEstoque && <span className="ml-1.5 font-semibold text-alerta">· estoque {quantidade(Math.max(p!.estoque, 0))}</span>}
                        </p>
                      </div>
                      <div className="flex items-center rounded-xl border border-borda">
                        <button type="button" aria-label="Diminuir" className="grid size-7 place-items-center text-suave hover:text-tinta" onClick={() => mudarQuantidade(i.produto_id, Math.round((i.quantidade - passo) * 1000) / 1000)}>
                          <Minus className="size-3.5" />
                        </button>
                        <QuantidadeEditavel valor={i.quantidade} fracionavel={frac} aoMudar={(q) => mudarQuantidade(i.produto_id, q)} />
                        <button type="button" aria-label="Aumentar" className="grid size-7 place-items-center text-suave hover:text-tinta" onClick={() => mudarQuantidade(i.produto_id, Math.round((i.quantidade + passo) * 1000) / 1000)}>
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                      <p className="w-[78px] text-right text-[13.5px] font-bold tabular-nums">{reais(valorItem(i.quantidade, i.preco_centavos))}</p>
                      <button type="button" aria-label={`Remover ${i.nome}`} onClick={() => remover(i.produto_id)} className="text-[#b5b6b1] hover:text-perigo">
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rolagem-fina max-h-[74%] shrink-0 space-y-3 overflow-y-auto px-5 pt-3 pb-4">
            <div className="rounded-2xl bg-[#f7f7f4] px-4 py-2.5 text-[13.5px]">
              <div className="flex justify-between py-0.5 text-[#55585e]">
                <span>Subtotal</span>
                <span className="tabular-nums">{reais(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 py-0.5 text-[#55585e]">
                <label htmlFor="desconto" className="flex items-center gap-1.5">
                  Desconto <kbd className="rounded border border-borda bg-white px-1 font-mono text-[10px] text-suave">F4</kbd>
                </label>
                <div className="flex items-center gap-1.5">
                  <div className="inline-flex rounded-lg border border-borda bg-white p-0.5 text-[11.5px] font-semibold">
                    {(["valor", "porcento"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => alterar((r) => ({ ...r, descontoModo: m }))}
                        className={cx("rounded-md px-1.5 py-px", rascunho.descontoModo === m ? "bg-tinta text-white" : "text-suave")}
                      >
                        {m === "valor" ? "R$" : "%"}
                      </button>
                    ))}
                  </div>
                  <div className="w-[76px]">
                    <Entrada
                      id="desconto"
                      ref={refDesconto}
                      inputMode="decimal"
                      value={rascunho.descontoTexto}
                      onChange={(e) => alterar((r) => ({ ...r, descontoTexto: e.target.value.replace(/[^\d,.]/g, "") }))}
                      placeholder="0"
                      className="h-8! text-right tabular-nums"
                      invalido={descontoInvalido && !!rascunho.descontoTexto}
                    />
                  </div>
                  <span className="w-[86px] text-right tabular-nums">− {reais(Number.isNaN(desconto) ? 0 : desconto)}</span>
                </div>
              </div>
              {descontoInvalido && rascunho.descontoTexto && <p className="text-right text-[12px] font-medium text-perigo">O desconto precisa ser menor que o valor da venda.</p>}
              <div className="mt-1 flex items-baseline justify-between border-t border-[#e6e6e1] pt-2">
                <span className="text-[15px] font-bold">
                  Total
                  {rascunho.descontoModo === "porcento" && descontoBp !== null && rascunho.descontoTexto && !descontoInvalido ? (
                    <span className="ml-1.5 text-[12px] font-semibold text-suave">({porcento(descontoBp, 2)} de desconto)</span>
                  ) : null}
                </span>
                <span className="text-[30px] leading-none font-black tracking-tight tabular-nums">{reais(total)}</span>
              </div>
            </div>

            {/* formas de pagamento */}
            <div>
              <p className="mb-1.5 text-[12.5px] font-semibold text-[#3d4045]">
                Pagamento <span className="font-normal text-suave">— clique em mais de uma para dividir</span>
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {(formas.dados ?? []).map((f) => {
                  const usada = pagamentos.some((p) => p.forma_id === f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      disabled={!rascunho.itens.length}
                      onClick={() => escolherForma(f)}
                      className={cx(
                        "flex h-9 items-center gap-2 rounded-xl border px-3 text-[13px] font-semibold transition-colors disabled:opacity-40",
                        usada ? "border-tinta bg-tinta text-white" : "border-borda hover:border-[#bdbdb7] hover:bg-[#fafaf8]",
                      )}
                    >
                      {iconeForma(f)}
                      <span className="truncate">{f.nome}</span>
                      {f.tipo === "dinheiro" && <kbd className="ml-auto font-mono text-[10px] opacity-60">F8</kbd>}
                    </button>
                  );
                })}
              </div>
              {pagamentos.length > 0 && (
                <ul className="mt-2.5 space-y-1.5">
                  {pagamentos.map((p) => {
                    const f = formaPorId.get(p.forma_id);
                    return (
                      <li key={p.chave} className="flex items-center gap-2">
                        <span className="flex w-[124px] shrink-0 items-center gap-1.5 truncate text-[13px] font-semibold">
                          {f && iconeForma(f)} {f?.tipo === "dinheiro" ? "Recebido" : f?.nome}
                        </span>
                        <div className="flex-1">
                          <CampoDinheiro
                            valor={p.valor}
                            aoMudar={(v) => setPagamentos((l) => l.map((x) => (x.chave === p.chave ? { ...x, valor: v, automatico: false } : x)))}
                            aria-label={`Valor em ${f?.nome ?? "pagamento"}`}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void concluir();
                              }
                            }}
                          />
                        </div>
                        <button type="button" aria-label="Tirar esta forma" onClick={() => setPagamentos((l) => l.filter((x) => x.chave !== p.chave))} className="p-1 text-[#b5b6b1] hover:text-perigo">
                          <X className="size-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {pagamentos.length > 0 && (
                <div className="mt-2.5 text-right text-[13px] font-semibold">
                  {trocoInvalido ? (
                    <span className="text-perigo">Troco só sai do dinheiro: o PIX/cartão passou do total.</span>
                  ) : falta > 0 ? (
                    <span className="text-perigo">Falta receber {reais(falta)}</span>
                  ) : troco > 0 ? (
                    <span className="text-[17px] text-sucesso">Troco: {reais(troco)}</span>
                  ) : (
                    <span className="text-sucesso">Valores conferem</span>
                  )}
                </div>
              )}
            </div>

            <button type="button" onClick={() => setMaisOpcoes((v) => !v)} className="w-fit text-[12.5px] font-semibold text-[#4a4d52] underline-offset-2 hover:underline">
              {maisOpcoes ? "Esconder cliente e observação" : "Adicionar cliente ou observação"}
            </button>
            {maisOpcoes && (
              <div className="grid gap-2.5">
                <Entrada placeholder="Nome do cliente (opcional)" value={rascunho.cliente} maxLength={80} onChange={(e) => alterar((r) => ({ ...r, cliente: e.target.value }))} />
                <Entrada placeholder="Observação (opcional)" value={rascunho.observacao} maxLength={300} onChange={(e) => alterar((r) => ({ ...r, observacao: e.target.value }))} />
              </div>
            )}

            {!caixaAberto && !caixa.carregando ? (
              <AbrirCaixaRapido />
            ) : (
              <Botao tamanho="lg" className="mt-1 w-full justify-between" disabled={!podeConcluir} carregando={enviando} onClick={() => void concluir()}>
                <span>Concluir venda</span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">{reais(total)}</span>
                  <kbd className="rounded-md border border-white/25 px-1.5 py-px font-mono text-[10px] text-white/70">F9</kbd>
                </span>
              </Botao>
            )}
            <p className="text-center text-[11.5px] text-suave">Comprovante sem valor fiscal. A emissão de NFC-e ainda não está ligada.</p>
          </div>
        </section>
      </div>

      <VendaConcluida
        venda={concluida}
        config={config.dados}
        aoFechar={() => {
          setConcluida(null);
          requestAnimationFrame(() => refBusca.current?.focus());
        }}
      />
    </div>
  );
}

function QuantidadeEditavel({ valor, fracionavel, aoMudar }: { valor: number; fracionavel: boolean; aoMudar: (q: number) => void }) {
  const [texto, setTexto] = useState<string | null>(null);
  const mostrado = texto ?? quantidade(valor);
  const confirmarTexto = () => {
    if (texto === null) return;
    const q = textoParaQuantidade(texto);
    setTexto(null);
    if (q === null) return;
    aoMudar(fracionavel ? q : Math.round(q));
  };
  return (
    <input
      value={mostrado}
      onFocus={(e) => {
        setTexto(quantidade(valor));
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmarTexto}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      inputMode="decimal"
      aria-label="Quantidade"
      className="w-11 bg-transparent text-center text-[13px] font-semibold tabular-nums focus:outline-none"
    />
  );
}

function AbrirCaixaRapido() {
  const [fundo, setFundo] = useState<number | null>(null);
  const [operador, setOperador] = useState(() => lerLocal("tfpipas.operador", ""));
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function abrir() {
    setEnviando(true);
    setErro(null);
    try {
      await api.post("/api/caixa/abrir", { fundo_troco_centavos: fundo ?? 0, operador });
      gravarLocal("tfpipas.operador", operador);
      avisar("Caixa aberto. Boas vendas!");
      avisarMudanca();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }
  return (
    <div className="rounded-2xl border border-[#f1d9a8] bg-[#fff8ea] p-4">
      <p className="flex items-center gap-2 text-[13.5px] font-bold text-[#7a4a00]">
        <AlertTriangle className="size-4" /> Abra o caixa para concluir vendas
      </p>
      <p className="mt-1 text-[12.5px] text-[#8a5a10]">Informe o dinheiro que já está na gaveta para troco (pode ser zero).</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Campo rotulo="Fundo de troco">
          <CampoDinheiro valor={fundo} aoMudar={setFundo} placeholder="0,00" />
        </Campo>
        <Campo rotulo="Operador (opcional)">
          <Entrada value={operador} onChange={(e) => setOperador(e.target.value)} maxLength={60} placeholder="Nome" />
        </Campo>
      </div>
      {erro && <p className="mt-2 text-[12.5px] font-medium text-perigo">{erro}</p>}
      <Botao className="mt-3 w-full" carregando={enviando} onClick={() => void abrir()}>
        Abrir caixa
      </Botao>
    </div>
  );
}

function VendaConcluida({ venda, config, aoFechar }: { venda: Venda | null; config: Config | null; aoFechar: () => void }) {
  useAtalhos({ Enter: aoFechar, F4: () => venda && imprimirComprovante(venda, config) }, !!venda);
  if (!venda) return null;
  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={
        <span className="flex items-center gap-2">
          <CheckCircle2 className="size-6 text-sucesso" /> Venda nº {venda.numero} concluída
        </span>
      }
      largura="md"
      rodape={
        <>
          <Botao variante="secundario" icone={<Printer className="size-4" />} onClick={() => imprimirComprovante(venda, config)} atalho="F4">
            Imprimir comprovante
          </Botao>
          <Botao onClick={aoFechar} atalho="Enter" data-foco-inicial>
            Nova venda
          </Botao>
        </>
      }
    >
      <div className="space-y-3">
        {venda.troco_centavos > 0 ? (
          <div className="rounded-2xl bg-[#e8f6ee] px-5 py-4 text-center">
            <p className="rotulo text-[#12663f]!">Troco</p>
            <p className="mt-1 text-[40px] leading-none font-black tracking-tight text-[#0f6a41] tabular-nums">{reais(venda.troco_centavos)}</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-[#f4f4f1] px-5 py-4 text-center">
            <p className="rotulo">Total</p>
            <p className="mt-1 text-[36px] leading-none font-black tracking-tight tabular-nums">{reais(venda.total_centavos)}</p>
          </div>
        )}
        <ul className="divide-y divide-[#efefeb] text-[13.5px]">
          {venda.pagamentos.map((p) => (
            <li key={p.forma_id} className="flex justify-between py-1.5">
              <span>{p.forma_nome}</span>
              <span className="tabular-nums">{reais(p.recebido_centavos)}</span>
            </li>
          ))}
          <li className="flex justify-between py-1.5 font-bold">
            <span>Total da venda</span>
            <span className="tabular-nums">{reais(venda.total_centavos)}</span>
          </li>
        </ul>
      </div>
    </Modal>
  );
}
