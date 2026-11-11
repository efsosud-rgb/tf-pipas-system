import type { Banco } from "../banco";
import { transacao } from "../banco";

export interface Config {
  loja_nome: string;
  loja_telefone: string;
  loja_endereco: string;
  loja_instagram: string;
  loja_documento: string;
  comprovante_mensagem: string;
  /** Largura do papel da impressora de comprovante, em milímetros. */
  comprovante_largura: "80" | "58";
  /** Permite vender um produto mesmo sem estoque registrado (o estoque fica negativo). */
  permitir_estoque_negativo: boolean;
}

const CHAVES_TEXTO = [
  "loja_nome",
  "loja_telefone",
  "loja_endereco",
  "loja_instagram",
  "loja_documento",
  "comprovante_mensagem",
] as const;

export function lerConfig(db: Banco): Config {
  const linhas = db.query("SELECT chave, valor FROM config").all() as Array<{ chave: string; valor: string }>;
  const mapa = new Map(linhas.map((l) => [l.chave, l.valor]));
  return {
    loja_nome: mapa.get("loja_nome") ?? "",
    loja_telefone: mapa.get("loja_telefone") ?? "",
    loja_endereco: mapa.get("loja_endereco") ?? "",
    loja_instagram: mapa.get("loja_instagram") ?? "",
    loja_documento: mapa.get("loja_documento") ?? "",
    comprovante_mensagem: mapa.get("comprovante_mensagem") ?? "",
    comprovante_largura: mapa.get("comprovante_largura") === "58" ? "58" : "80",
    permitir_estoque_negativo: mapa.get("permitir_estoque_negativo") !== "0",
  };
}

export function salvarConfig(db: Banco, dados: Partial<Config>): Config {
  return transacao(db, () => {
    const gravar = db.query(
      "INSERT INTO config (chave, valor) VALUES ($chave, $valor) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor",
    );
    for (const chave of CHAVES_TEXTO) {
      const valor = dados[chave];
      if (typeof valor === "string") gravar.run({ chave, valor: valor.trim() });
    }
    if (dados.comprovante_largura === "80" || dados.comprovante_largura === "58") {
      gravar.run({ chave: "comprovante_largura", valor: dados.comprovante_largura });
    }
    if (typeof dados.permitir_estoque_negativo === "boolean") {
      gravar.run({ chave: "permitir_estoque_negativo", valor: dados.permitir_estoque_negativo ? "1" : "0" });
    }
    return lerConfig(db);
  });
}
