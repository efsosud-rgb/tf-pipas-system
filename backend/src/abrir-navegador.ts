import { existsSync } from "node:fs";

/**
 * Abre a interface. No Windows tenta o Edge (ou o Chrome) em "modo aplicativo",
 * numa janela própria, sem barra de endereço; se não achar, usa o navegador padrão.
 */
export function abrirNavegador(url: string, log: (m: string) => void): void {
  try {
    if (process.platform === "win32") {
      const env = process.env;
      const candidatos = [
        `${env["ProgramFiles(x86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
        `${env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
        `${env.LOCALAPPDATA}\\Microsoft\\Edge\\Application\\msedge.exe`,
        `${env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
        `${env["ProgramFiles(x86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
        `${env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      ].filter((c) => !c.startsWith("undefined"));
      const navegador = candidatos.find((c) => existsSync(c));
      if (navegador) {
        Bun.spawn([navegador, `--app=${url}`, "--start-maximized"], { stdio: ["ignore", "ignore", "ignore"] });
        log(`Interface aberta em modo aplicativo: ${navegador}`);
        return;
      }
      Bun.spawn(["explorer.exe", url], { stdio: ["ignore", "ignore", "ignore"] });
      log("Interface aberta no navegador padrão.");
      return;
    }
    const comando = process.platform === "darwin" ? "open" : "xdg-open";
    Bun.spawn([comando, url], { stdio: ["ignore", "ignore", "ignore"] });
  } catch (erro) {
    log(`Não consegui abrir o navegador: ${String(erro)}. Abra ${url} manualmente.`);
  }
}

/** Mostra uma janela de aviso no Windows (o programa roda sem janela de console). */
export function avisarNoWindows(mensagem: string): void {
  if (process.platform !== "win32") return;
  try {
    const texto = mensagem.replace(/'/g, "''");
    Bun.spawn(
      [
        "powershell.exe",
        "-NoProfile",
        "-WindowStyle",
        "Hidden",
        "-Command",
        `Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('${texto}', 'TF Pipas') | Out-Null`,
      ],
      { stdio: ["ignore", "ignore", "ignore"] },
    );
  } catch {
    // sem PowerShell: o erro fica só no arquivo de log
  }
}
