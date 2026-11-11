/**
 * Empacota o TF Pipas num único executável (servidor + banco + interface).
 *
 *   bun run scripts/build.ts windows   → dist/TFPipas.exe  (Windows 10/11, 64 bits)
 *   bun run scripts/build.ts linux     → dist/tfpipas      (para testes)
 *
 * Passos: gera a interface (frontend/dist), lista os arquivos dela num módulo
 * que o Bun embute no executável e compila. O módulo gerado volta ao estado
 * vazio no fim, para o desenvolvimento continuar servindo a interface pelo Vite.
 *
 * Usa a variante "baseline" do Bun, que roda também em processadores sem AVX2
 * (Celeron/Pentium comuns em PCs de loja).
 */
import { $ } from "bun";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

const alvo = process.argv[2] ?? "windows";
if (alvo !== "windows" && alvo !== "linux") {
  console.error('Use: bun run scripts/build.ts windows|linux');
  process.exit(1);
}

const raiz = join(import.meta.dir, "..");
const frontend = join(raiz, "..", "frontend");
const distWeb = join(frontend, "dist");
const moduloWeb = join(raiz, "src", "web", "arquivos-web.ts");
const vazio = readFileSync(moduloWeb, "utf8");

function listar(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    return statSync(caminho).isDirectory() ? listar(caminho) : [caminho];
  });
}

console.log("1/4 Conferindo os tipos do servidor…");
await $`bunx tsc --noEmit`.cwd(raiz);
console.log("2/4 Gerando a interface…");
await $`npm run build`.cwd(frontend);

const arquivos = listar(distWeb).sort();
if (!arquivos.some((a) => a.endsWith(`${sep}index.html`))) throw new Error("frontend/dist/index.html não foi gerado.");
const importacoes = arquivos.map((a, i) => {
  let rel = relative(dirname(moduloWeb), a).split(sep).join("/");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return `import a${i} from ${JSON.stringify(rel)} with { type: "file" };`;
});
const entradas = arquivos.map((a, i) => `  ${JSON.stringify(`/${relative(distWeb, a).split(sep).join("/")}`)}: a${i},`);
writeFileSync(
  moduloWeb,
  [
    "// @ts-nocheck — GERADO por scripts/build.ts durante o empacotamento. Não edite.",
    ...importacoes,
    "",
    "export const arquivosWeb: Record<string, string> = {",
    ...entradas,
    "};",
    "",
  ].join("\n"),
);
console.log(`   ${arquivos.length} arquivos da interface vão dentro do executável.`);

try {
  console.log(`3/4 Compilando para ${alvo}…`);
  mkdirSync(join(raiz, "dist"), { recursive: true });
  const saida = join(raiz, "dist", alvo === "windows" ? "TFPipas.exe" : "tfpipas");
  const opcoes = [
    "build",
    "src/principal.ts",
    "--compile",
    "--minify",
    "--no-compile-autoload-dotenv",
    "--no-compile-autoload-bunfig",
    `--target=${alvo === "windows" ? "bun-windows-x64-baseline" : "bun-linux-x64-baseline"}`,
    ...(alvo === "windows" ? ["--windows-hide-console"] : []),
    "--outfile",
    saida,
  ];
  await $`bun ${opcoes}`.cwd(raiz);
  console.log(`4/4 Pronto: ${saida} (${(statSync(saida).size / 1024 / 1024).toFixed(1)} MB)`);
} finally {
  writeFileSync(moduloWeb, vazio);
}
