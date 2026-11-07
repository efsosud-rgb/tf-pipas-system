/**
 * Ponto de entrada do TF Pipas.
 *
 * No PC da loja, o programa é um único TFPipas.exe. Ao abrir:
 * 1. se já estiver rodando, só abre a janela da interface;
 * 2. senão, abre o banco (pasta "dados" ao lado do .exe), faz o backup
 *    automático do dia, liga o servidor em http://127.0.0.1:4747 (só este
 *    computador acessa) e abre a interface.
 *
 * Variáveis de ambiente (para desenvolvimento e testes):
 *   TFPIPAS_DADOS              pasta dos dados (padrão: "dados" ao lado do .exe)
 *   TFPIPAS_PORTA              porta (padrão: 4747)
 *   TFPIPAS_ABRIR_NAVEGADOR=0  não abre a interface ao iniciar
 *   TFPIPAS_DEV=1              modo desenvolvimento (interface pelo Vite)
 */
import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import pacote from "../package.json";
import { abrirNavegador, avisarNoWindows } from "./abrir-navegador";
import { abrirBanco, fecharBanco } from "./banco";
import type { Contexto } from "./contexto";
import { backupAutomaticoDoDia, fazerBackup } from "./dominio/backup";
import { iniciarServidor } from "./servidor";

const compilado = import.meta.dir.includes("$bunfs") || import.meta.dir.includes("~BUN");
const modoDev = process.env.TFPIPAS_DEV === "1";
const porta = Number(process.env.TFPIPAS_PORTA ?? 4747);
const pastaDados = resolve(
  process.env.TFPIPAS_DADOS ?? (compilado ? join(dirname(process.execPath), "dados") : join(import.meta.dir, "..", "dados-dev")),
);
const pastaBackups = join(pastaDados, "backups");
const pastaLogs = join(pastaDados, "logs");
const caminhoBanco = join(pastaDados, "tfpipas.db");
const endereco = `http://127.0.0.1:${porta}`;

mkdirSync(pastaBackups, { recursive: true });
mkdirSync(pastaLogs, { recursive: true });

const arquivoLog = join(pastaLogs, "sistema.log");
function log(mensagem: string): void {
  const linha = `[${new Date().toISOString()}] ${mensagem}\n`;
  if (!compilado) process.stdout.write(linha);
  try {
    const tamanho = statSync(arquivoLog, { throwIfNoEntry: false })?.size ?? 0;
    if (tamanho > 5 * 1024 * 1024) {
      renameSync(arquivoLog, join(pastaLogs, "sistema-anterior.log"));
    }
    appendFileSync(arquivoLog, linha);
  } catch {
    // sem log não impede a loja de vender
  }
}

async function jaEstaRodando(): Promise<boolean> {
  try {
    const r = await fetch(`${endereco}/api/saude`, { signal: AbortSignal.timeout(1500) });
    const dados = (await r.json()) as { app?: string };
    return dados.app === "tf-pipas";
  } catch {
    return false;
  }
}

async function iniciar(): Promise<void> {
  const abrir = process.env.TFPIPAS_ABRIR_NAVEGADOR !== "0" && !modoDev;
  if (await jaEstaRodando()) {
    log("O TF Pipas já estava aberto; abrindo só a janela.");
    if (abrir) abrirNavegador(endereco, log);
    setTimeout(() => process.exit(0), 1500);
    return;
  }

  log(`Iniciando TF Pipas ${pacote.version} — dados em ${pastaDados}`);
  const db = abrirBanco(caminhoBanco);
  try {
    const feito = backupAutomaticoDoDia(db, pastaBackups);
    if (feito) log(`Backup automático do dia: ${feito.nome}`);
  } catch (erro) {
    log(`Backup automático falhou: ${String(erro)}`);
  }

  let desligando = false;
  const ctx: Contexto = {
    db,
    caminhoBanco,
    pastaDados,
    pastaBackups,
    versao: pacote.version,
    porta,
    modoDev,
    log,
    desligar: () => {
      if (desligando) return;
      desligando = true;
      log("Desligando o TF Pipas...");
      try {
        fazerBackup(ctx.db, pastaBackups, "desligamento");
      } catch (erro) {
        log(`Backup do desligamento falhou: ${String(erro)}`);
      }
      try {
        servidor.stop(true);
        fecharBanco(ctx.db);
      } finally {
        log("TF Pipas desligado.");
        process.exit(0);
      }
    },
  };

  let servidor: ReturnType<typeof iniciarServidor>;
  try {
    servidor = iniciarServidor(ctx, porta);
  } catch (erro) {
    const msg = `Não consegui iniciar o TF Pipas na porta ${porta}. Outro programa pode estar usando essa porta. Detalhe: ${String(erro)}`;
    log(msg);
    avisarNoWindows(msg);
    fecharBanco(db);
    process.exit(1);
  }
  log(`Pronto em ${endereco}`);
  if (abrir) abrirNavegador(endereco, log);

  process.on("SIGINT", () => ctx.desligar());
  process.on("SIGTERM", () => ctx.desligar());
}

iniciar().catch((erro) => {
  const msg = `O TF Pipas não conseguiu iniciar: ${erro instanceof Error ? erro.message : String(erro)}`;
  log(msg);
  avisarNoWindows(msg);
  process.exit(1);
});
