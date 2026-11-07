import { copyFileSync, existsSync, unlinkSync } from "node:fs";
import { abrirBanco, fecharBanco, type Banco } from "./banco";
import { conferirArquivoDeBanco, fazerBackup, type InfoBackup } from "./dominio/backup";

/** Estado do programa em execução, compartilhado pelas rotas. */
export interface Contexto {
  db: Banco;
  caminhoBanco: string;
  pastaDados: string;
  pastaBackups: string;
  versao: string;
  porta: number;
  modoDev: boolean;
  log: (mensagem: string) => void;
  desligar: () => void;
}

/**
 * Troca o banco atual pelo conteúdo de um backup. Antes, guarda uma cópia do
 * banco atual ("antes-de-restaurar"); se algo der errado, volta essa cópia.
 */
export function restaurarBanco(ctx: Contexto, arquivoOrigem: string): { antes: InfoBackup } {
  const conferencia = conferirArquivoDeBanco(arquivoOrigem);
  const antes = fazerBackup(ctx.db, ctx.pastaBackups, "antes-de-restaurar");
  fecharBanco(ctx.db);
  const limparWal = () => {
    for (const sufixo of ["-wal", "-shm"]) {
      const f = ctx.caminhoBanco + sufixo;
      if (existsSync(f)) unlinkSync(f);
    }
  };
  try {
    limparWal();
    copyFileSync(arquivoOrigem, ctx.caminhoBanco);
    ctx.db = abrirBanco(ctx.caminhoBanco);
    ctx.log(`Backup restaurado (${conferencia.vendas} vendas, ${conferencia.produtos} produtos).`);
  } catch (erro) {
    ctx.log(`Falha ao restaurar: ${String(erro)}. Voltando o banco anterior.`);
    limparWal();
    copyFileSync(`${ctx.pastaBackups}/${antes.nome}`, ctx.caminhoBanco);
    ctx.db = abrirBanco(ctx.caminhoBanco);
    throw erro;
  }
  return { antes };
}
