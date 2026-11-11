import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { dataHora, quantidade, reais } from "../formato";
import type { Config, ResumoCaixa, Venda } from "../tipos";

/**
 * Comprovante de venda para impressora térmica (80 mm ou 58 mm).
 * Não é cupom fiscal: a emissão de NFC-e ainda não está ligada no sistema,
 * e o papel diz isso claramente.
 */
export function Comprovante({ venda, config }: { venda: Venda; config: Config | null }) {
  const largura = config?.comprovante_largura === "58" ? "48mm" : "72mm";
  const fonte = config?.comprovante_largura === "58" ? "10.5px" : "11.5px";
  const linha = { borderTop: "1px dashed #000", margin: "6px 0" } as const;
  const troco = venda.pagamentos.reduce((s, p) => s + p.troco_centavos, 0);
  return (
    <div style={{ width: largura, padding: "4mm 0 6mm", margin: "0 auto", fontFamily: "'Courier New', ui-monospace, monospace", fontSize: fonte, color: "#000", lineHeight: 1.35 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontWeight: 800, fontSize: "1.35em", letterSpacing: "0.04em" }}>{config?.loja_nome || "TF Pipas"}</div>
        {config?.loja_documento && <div>{config.loja_documento}</div>}
        {config?.loja_endereco && <div>{config.loja_endereco}</div>}
        {(config?.loja_telefone || config?.loja_instagram) && (
          <div>{[config?.loja_telefone, config?.loja_instagram].filter(Boolean).join(" · ")}</div>
        )}
      </div>
      <div style={linha} />
      <div style={{ textAlign: "center", fontWeight: 700 }}>COMPROVANTE DE VENDA</div>
      <div style={{ textAlign: "center" }}>NÃO É DOCUMENTO FISCAL</div>
      <div style={linha} />
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>Venda nº {venda.numero}</span>
        <span>{dataHora(venda.criado_em)}</span>
      </div>
      {venda.usuario_nome && <div>Atendido por: {venda.usuario_nome}</div>}
      {venda.cliente && <div>Cliente: {venda.cliente}</div>}
      {venda.status === "cancelada" && <div style={{ fontWeight: 800, textAlign: "center", margin: "4px 0" }}>*** VENDA CANCELADA ***</div>}
      <div style={linha} />
      {venda.itens.map((i, n) => (
        <div key={n} style={{ marginBottom: 3 }}>
          <div>{i.nome}</div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>
              {quantidade(i.quantidade)} {i.unidade} x {reais(i.preco_unitario_centavos)}
            </span>
            <span>{reais(i.subtotal_centavos)}</span>
          </div>
          {i.preco_base_centavos !== null && i.preco_base_centavos !== i.preco_unitario_centavos && (
            <div style={{ fontSize: "0.92em" }}>
              preço de atacado (normal {reais(i.preco_base_centavos)})
            </div>
          )}
        </div>
      ))}
      <div style={linha} />
      <Linha rotulo="Subtotal" valor={reais(venda.subtotal_centavos)} />
      {venda.desconto_centavos > 0 && <Linha rotulo="Desconto" valor={`-${reais(venda.desconto_centavos)}`} />}
      <Linha rotulo="TOTAL" valor={reais(venda.total_centavos)} forte />
      <div style={linha} />
      {venda.pagamentos.map((p, n) => (
        <Linha key={n} rotulo={p.forma_nome} valor={reais(p.recebido_centavos)} />
      ))}
      {troco > 0 && <Linha rotulo="Troco" valor={reais(troco)} forte />}
      {venda.observacao && (
        <>
          <div style={linha} />
          <div>Obs.: {venda.observacao}</div>
        </>
      )}
      <div style={linha} />
      {config?.comprovante_mensagem && <div style={{ textAlign: "center" }}>{config.comprovante_mensagem}</div>}
    </div>
  );
}

function Linha({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: forte ? 800 : 400, fontSize: forte ? "1.15em" : undefined }}>
      <span>{rotulo}</span>
      <span>{valor}</span>
    </div>
  );
}

/** Resumo do fechamento de caixa para a impressora de comprovante. */
export function ComprovanteFechamento({ resumo, config }: { resumo: ResumoCaixa; config: Config | null }) {
  const s = resumo.sessao;
  const largura = config?.comprovante_largura === "58" ? "48mm" : "72mm";
  const linha = { borderTop: "1px dashed #000", margin: "6px 0" } as const;
  const g = resumo.gaveta;
  return (
    <div style={{ width: largura, padding: "4mm 0 6mm", margin: "0 auto", fontFamily: "'Courier New', ui-monospace, monospace", fontSize: "11.5px", color: "#000", lineHeight: 1.35 }}>
      <div style={{ textAlign: "center", fontWeight: 800, fontSize: "1.3em" }}>{config?.loja_nome || "TF Pipas"}</div>
      <div style={{ textAlign: "center", fontWeight: 700 }}>FECHAMENTO DE CAIXA Nº {s.id}</div>
      <div style={linha} />
      <Linha rotulo="Abertura" valor={dataHora(s.aberto_em)} />
      <Linha rotulo="Fechamento" valor={dataHora(s.fechado_em)} />
      {s.operador_fechamento && <Linha rotulo="Operador" valor={s.operador_fechamento} />}
      <div style={linha} />
      <Linha rotulo="Fundo de troco" valor={reais(g.fundo_troco_centavos)} />
      <Linha rotulo="Vendas em dinheiro" valor={reais(g.vendas_centavos)} />
      <Linha rotulo="Suprimentos" valor={reais(g.suprimentos_centavos)} />
      <Linha rotulo="Sangrias" valor={`-${reais(g.sangrias_centavos)}`} />
      {g.despesas_centavos > 0 && <Linha rotulo="Despesas" valor={`-${reais(g.despesas_centavos)}`} />}
      {g.receitas_centavos > 0 && <Linha rotulo="Receitas" valor={reais(g.receitas_centavos)} />}
      {g.cancelamentos_centavos > 0 && <Linha rotulo="Devoluções" valor={`-${reais(g.cancelamentos_centavos)}`} />}
      <Linha rotulo="Esperado" valor={reais(s.esperado_centavos)} forte />
      <Linha rotulo="Contado" valor={reais(s.contado_centavos)} forte />
      <Linha rotulo="Diferença" valor={reais(s.diferenca_centavos)} forte />
      <div style={linha} />
      <div style={{ fontWeight: 700 }}>Vendas ({resumo.vendas.quantidade})</div>
      {resumo.vendas.por_forma.map((f) => (
        <Linha key={f.forma_id} rotulo={f.nome} valor={reais(f.valor_centavos)} />
      ))}
      <Linha rotulo="Total" valor={reais(resumo.vendas.total_centavos)} forte />
      {resumo.canceladas.quantidade > 0 && <Linha rotulo={`Canceladas (${resumo.canceladas.quantidade})`} valor={reais(resumo.canceladas.total_centavos)} />}
      {s.observacao_fechamento && (
        <>
          <div style={linha} />
          <div>Obs.: {s.observacao_fechamento}</div>
        </>
      )}
    </div>
  );
}

/** Desenha algo na área de impressão e abre a janela de impressão do Windows. */
export function imprimirNoPapel(conteudo: ReactNode): void {
  const alvo = document.getElementById("impressao");
  if (!alvo) return;
  const raiz = createRoot(alvo);
  raiz.render(conteudo);
  // espera o React desenhar antes de imprimir
  setTimeout(() => {
    const limpar = () => {
      window.removeEventListener("afterprint", limpar);
      setTimeout(() => raiz.unmount(), 50);
    };
    window.addEventListener("afterprint", limpar);
    window.print();
  }, 60);
}

export function imprimirComprovante(venda: Venda, config: Config | null): void {
  imprimirNoPapel(<Comprovante venda={venda} config={config} />);
}
