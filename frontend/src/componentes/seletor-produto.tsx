import { Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { normalizar, quantidade, reais } from "../formato";
import type { Produto } from "../tipos";
import { cx } from "./ui";

/** Campo de busca de produto com lista de sugestões (nome, código ou código de barras). */
export function SeletorProduto({
  produtos,
  aoEscolher,
  placeholder = "Buscar produto pelo nome ou código…",
  excluir = [],
}: {
  produtos: Produto[];
  aoEscolher: (p: Produto) => void;
  placeholder?: string;
  excluir?: number[];
}) {
  const [texto, setTexto] = useState("");
  const [aberto, setAberto] = useState(false);
  const [indice, setIndice] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const lista = useMemo(() => {
    const termos = normalizar(texto).split(/\s+/).filter(Boolean);
    return produtos
      .filter((p) => !excluir.includes(p.id))
      .filter((p) => {
        if (!termos.length) return true;
        const alvo = normalizar(`${p.nome} ${p.categoria} ${p.codigo ?? ""} ${p.codigo_barras ?? ""}`);
        return termos.every((t) => alvo.includes(t));
      })
      .slice(0, 8);
  }, [produtos, texto, excluir]);

  function escolher(p: Produto) {
    aoEscolher(p);
    setTexto("");
    setIndice(0);
    ref.current?.focus();
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-suave" />
      <input
        ref={ref}
        value={texto}
        placeholder={placeholder}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onChange={(e) => {
          setTexto(e.target.value);
          setIndice(0);
          setAberto(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndice((i) => Math.min(i + 1, lista.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndice((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const exato = produtos.find((p) => p.codigo_barras === texto.trim() || p.codigo === texto.trim());
            const p = exato ?? lista[indice];
            if (p && !excluir.includes(p.id)) escolher(p);
          }
        }}
        className="h-10 w-full rounded-xl border border-borda bg-white pr-3 pl-9 text-[14px] focus:border-[#9aa3ad] focus:ring-4 focus:ring-foco/15 focus:outline-none"
      />
      {aberto && lista.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-borda bg-white p-1 shadow-[0_18px_40px_-16px_rgba(0,0,0,.35)]">
          {lista.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(p)}
                className={cx("flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[13.5px]", i === indice ? "bg-[#f1f1ee]" : "hover:bg-[#f7f7f4]")}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.nome}</span>
                  <span className="block text-[11.5px] text-suave">
                    {[p.codigo, p.codigo_barras, p.categoria].filter(Boolean).join(" · ") || "sem código"}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[12px] text-suave tabular-nums">
                  <span className="block font-semibold text-tinta">{reais(p.preco_centavos)}</span>
                  {p.controla_estoque ? quantidade(p.estoque, p.unidade) : "sem controle"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
