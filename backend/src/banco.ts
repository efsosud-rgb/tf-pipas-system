import { Database } from "bun:sqlite";
import { MIGRACOES } from "./migracoes";

export type Banco = Database;

/**
 * Abre (ou cria) o banco SQLite e aplica as migrações pendentes.
 * Use ":memory:" nos testes.
 */
export function abrirBanco(caminho: string): Banco {
  const db = new Database(caminho, { create: true, strict: true });
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  if (caminho !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
    // FULL: uma venda confirmada não se perde nem se faltar luz logo depois.
    db.exec("PRAGMA synchronous = FULL;");
  }
  migrar(db);
  return db;
}

export function versaoDoBanco(db: Banco): number {
  const linha = db.query("PRAGMA user_version").get() as { user_version: number };
  return linha.user_version;
}

export function migrar(db: Banco): void {
  const atual = versaoDoBanco(db);
  if (atual > MIGRACOES.length) {
    throw new Error(
      `Este banco foi criado por uma versão mais nova do TF Pipas (estrutura ${atual}). ` +
        "Use a versão mais nova do programa.",
    );
  }
  for (let v = atual; v < MIGRACOES.length; v++) {
    db.transaction(() => {
      MIGRACOES[v]!(db);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    })();
  }
}

/** Executa `fn` dentro de uma transação: ou tudo é gravado, ou nada é. */
export function transacao<T>(db: Banco, fn: () => T): T {
  return db.transaction(fn)();
}

/** Fecha o banco gravando tudo no arquivo principal (sem deixar o -wal pendente). */
export function fecharBanco(db: Banco): void {
  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  } catch {
    // banco em memória ou já fechado
  }
  db.close();
}
