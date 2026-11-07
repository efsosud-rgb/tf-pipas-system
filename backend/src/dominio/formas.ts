import type { Banco } from "../banco";
import { transacao } from "../banco";
import { ErroNegocio, naoEncontrado } from "../erros";

/**
 * Formas de pagamento. "Dinheiro" é a única do tipo dinheiro: só ela entra na
 * gaveta e permite troco. As outras (PIX, cartões, vale...) têm uma taxa em
 * pontos-base (1,99% = 199) que é descontada do lucro.
 */
export interface FormaPagamento {
  id: number;
  nome: string;
  tipo: "dinheiro" | "outro";
  taxa_bp: number;
  ativo: boolean;
  ordem: number;
}

interface Linha extends Omit<FormaPagamento, "ativo"> {
  ativo: number;
}

const para = (l: Linha): FormaPagamento => ({ ...l, ativo: l.ativo === 1 });

export function listarFormas(db: Banco, incluirInativas = false): FormaPagamento[] {
  const linhas = db
    .query(`SELECT * FROM formas_pagamento ${incluirInativas ? "" : "WHERE ativo = 1"} ORDER BY ordem, nome`)
    .all() as Linha[];
  return linhas.map(para);
}

function exigirForma(db: Banco, id: number): Linha {
  const l = db.query("SELECT * FROM formas_pagamento WHERE id = $id").get({ id }) as Linha | null;
  if (!l) throw naoEncontrado("Forma de pagamento não encontrada.");
  return l;
}

function validarTaxa(taxaBp: number): void {
  if (!Number.isInteger(taxaBp) || taxaBp < 0 || taxaBp > 10_000) {
    throw new ErroNegocio("A taxa precisa estar entre 0% e 100%.", 422, "taxa_bp");
  }
}

function nomeDisponivel(db: Banco, nome: string, idAtual: number): void {
  const outro = db
    .query("SELECT id FROM formas_pagamento WHERE nome = $nome COLLATE NOCASE AND id <> $id")
    .get({ nome, id: idAtual }) as { id: number } | null;
  if (outro) throw new ErroNegocio("Já existe uma forma de pagamento com esse nome.", 409, "nome");
}

export function criarForma(db: Banco, dados: { nome: string; taxa_bp: number }): FormaPagamento {
  return transacao(db, () => {
    const nome = dados.nome.trim();
    if (!nome) throw new ErroNegocio("Informe o nome da forma de pagamento.", 422, "nome");
    validarTaxa(dados.taxa_bp);
    nomeDisponivel(db, nome, 0);
    const { ordem } = db.query("SELECT COALESCE(MAX(ordem), 0) + 1 AS ordem FROM formas_pagamento").get() as { ordem: number };
    const { id } = db
      .query("INSERT INTO formas_pagamento (nome, tipo, taxa_bp, ordem) VALUES ($nome, 'outro', $taxa, $ordem) RETURNING id")
      .get({ nome, taxa: dados.taxa_bp, ordem }) as { id: number };
    return para(exigirForma(db, id));
  });
}

export function atualizarForma(
  db: Banco,
  id: number,
  dados: { nome?: string; taxa_bp?: number; ativo?: boolean },
): FormaPagamento {
  return transacao(db, () => {
    const atual = exigirForma(db, id);
    const nome = dados.nome?.trim() ?? atual.nome;
    if (!nome) throw new ErroNegocio("Informe o nome da forma de pagamento.", 422, "nome");
    nomeDisponivel(db, nome, id);
    const taxa = dados.taxa_bp ?? atual.taxa_bp;
    validarTaxa(taxa);
    if (atual.tipo === "dinheiro") {
      if (taxa !== 0) throw new ErroNegocio("Dinheiro não tem taxa.", 422, "taxa_bp");
      if (dados.ativo === false) throw new ErroNegocio("Dinheiro não pode ser desativado: é ele que entra na gaveta do caixa.", 422);
    }
    db.query("UPDATE formas_pagamento SET nome = $nome, taxa_bp = $taxa, ativo = $ativo WHERE id = $id").run({
      id,
      nome,
      taxa,
      ativo: dados.ativo === undefined ? atual.ativo : dados.ativo ? 1 : 0,
    });
    return para(exigirForma(db, id));
  });
}
