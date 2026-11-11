import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { Banco } from "../banco";
import { ErroNegocio, naoEncontrado } from "../erros";
import { MIGRACOES } from "../migracoes";
import { agora, dataLocal } from "../relogio";

/**
 * Cópias de segurança do banco (arquivos .db na pasta dados/backups).
 * São feitas com VACUUM INTO, que gera uma cópia consistente mesmo com o
 * sistema em uso. As mais antigas são apagadas para não encher o disco.
 */

export type MotivoBackup = "automatico" | "manual" | "fechamento" | "antes-de-restaurar" | "desligamento" | "antes-de-atualizar";

const RE_NOME = /^tfpipas-(\d{4}-\d{2}-\d{2})-(\d{6})(?:-\d+)?-(automatico|manual|fechamento|antes-de-restaurar|desligamento|antes-de-atualizar)\.db$/;
const MANTER = 90;

export interface InfoBackup {
  nome: string;
  data: string;
  hora: string;
  motivo: MotivoBackup;
  tamanho_bytes: number;
}

function info(pasta: string, nome: string): InfoBackup | null {
  const m = RE_NOME.exec(nome);
  if (!m) return null;
  const hhmmss = m[2]!;
  return {
    nome,
    data: m[1]!,
    hora: `${hhmmss.slice(0, 2)}:${hhmmss.slice(2, 4)}:${hhmmss.slice(4, 6)}`,
    motivo: m[3] as MotivoBackup,
    tamanho_bytes: statSync(join(pasta, nome)).size,
  };
}

export function listarBackups(pasta: string): InfoBackup[] {
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta)
    .map((n) => info(pasta, n))
    .filter((b): b is InfoBackup => b !== null)
    .sort((a, b) => (a.nome < b.nome ? 1 : -1));
}

export function fazerBackup(db: Banco, pasta: string, motivo: MotivoBackup): InfoBackup {
  mkdirSync(pasta, { recursive: true });
  const d = agora();
  const hora = [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join("");
  let nome = `tfpipas-${dataLocal(d)}-${hora}-${motivo}.db`;
  for (let n = 2; existsSync(join(pasta, nome)); n++) nome = `tfpipas-${dataLocal(d)}-${hora}-${n}-${motivo}.db`;
  const caminho = join(pasta, nome);
  db.exec(`VACUUM INTO '${caminho.replace(/'/g, "''")}'`);
  limparAntigos(pasta);
  return info(pasta, nome)!;
}

function limparAntigos(pasta: string): void {
  const todos = listarBackups(pasta);
  for (const b of todos.slice(MANTER)) {
    try {
      unlinkSync(join(pasta, b.nome));
    } catch {
      // arquivo em uso ou já apagado: tenta de novo no próximo backup
    }
  }
}

/** Faz o backup automático do dia, se ainda não houver um de hoje. */
export function backupAutomaticoDoDia(db: Banco, pasta: string): InfoBackup | null {
  const hoje = dataLocal();
  const jaTem = listarBackups(pasta).some((b) => b.data === hoje && b.motivo === "automatico");
  return jaTem ? null : fazerBackup(db, pasta, "automatico");
}

/** Caminho de um backup da lista, sem permitir sair da pasta. */
export function caminhoDoBackup(pasta: string, nome: string): string {
  if (!RE_NOME.test(nome)) throw naoEncontrado("Backup não encontrado.");
  const caminho = join(pasta, nome);
  if (!existsSync(caminho)) throw naoEncontrado("Backup não encontrado.");
  return caminho;
}

export interface ConferenciaBanco {
  versao: number;
  produtos: number;
  vendas: number;
  lancamentos: number;
}

/** Confere se um arquivo é um banco válido do TF Pipas antes de restaurar. */
export function conferirArquivoDeBanco(caminho: string): ConferenciaBanco {
  let db: Database | null = null;
  try {
    db = new Database(caminho, { readonly: true });
    const integridade = db.query("PRAGMA integrity_check").get() as { integrity_check: string };
    if (integridade.integrity_check !== "ok") throw new ErroNegocio("O arquivo está corrompido e não pode ser usado.", 422);
    const versao = (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
    const tabelas = db
      .query(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('produtos', 'vendas', 'sessoes_caixa', 'lancamentos', 'formas_pagamento')",
      )
      .get() as { n: number };
    if (versao < 1 || tabelas.n !== 5) throw new ErroNegocio("Esse arquivo não é um backup do TF Pipas.", 422);
    if (versao > MIGRACOES.length) {
      throw new ErroNegocio("Esse backup foi feito por uma versão mais nova do TF Pipas. Atualize o programa antes.", 422);
    }
    const contar = (t: string) => (db!.query(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
    return { versao, produtos: contar("produtos"), vendas: contar("vendas"), lancamentos: contar("lancamentos") };
  } catch (e) {
    if (e instanceof ErroNegocio) throw e;
    throw new ErroNegocio("Não consegui abrir esse arquivo como backup do TF Pipas.", 422);
  } finally {
    db?.close();
  }
}
