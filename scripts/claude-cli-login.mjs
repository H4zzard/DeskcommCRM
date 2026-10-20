#!/usr/bin/env node

/**
 * Preflight opt-in do desenvolvimento local.
 *
 * CLAUDE_CLI_PATH ausente: não faz nada.
 * CLAUDE_CLI_PATH presente e vazio: usa `claude` do PATH.
 * Sem sessão claude.ai e com terminal interativo: abre o login oficial da CLI.
 */
import { spawnSync } from "node:child_process";

const forcado = process.argv.includes("--force");
const caminhoConfigurado = process.env.CLAUDE_CLI_PATH?.trim() ?? "";
const desligado = caminhoConfigurado.toLowerCase() === "disabled";
const habilitado =
  Object.prototype.hasOwnProperty.call(process.env, "CLAUDE_CLI_PATH") &&
  !desligado;
if ((!habilitado && !forcado) || process.env.NODE_ENV === "production" || process.env.CI) {
  process.exit(0);
}

const comando = caminhoConfigurado && !desligado ? caminhoConfigurado : "claude";
const ambiente = { ...process.env };
for (const nome of [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
]) {
  delete ambiente[nome];
}

const status = spawnSync(comando, ["auth", "status"], {
  env: ambiente,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  shell: false,
  timeout: 5_000,
});

if (status.error?.code === "ENOENT") {
  console.warn(
    `[claude-cli-local] CLI não encontrada em ${JSON.stringify(comando)}. Instale a Claude CLI ou ajuste CLAUDE_CLI_PATH.`,
  );
  process.exit(0);
}
if (status.error) {
  console.warn("[claude-cli-local] não foi possível consultar a sessão da Claude CLI.");
  process.exit(0);
}

let metodo = null;
try {
  metodo = JSON.parse(status.stdout || "{}").authMethod ?? null;
} catch {
  metodo = null;
}

if (status.status === 0 && metodo === "claude.ai") {
  console.info("[claude-cli-local] sessão da assinatura Claude pronta para os testes locais.");
  process.exit(0);
}

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.warn(
    "[claude-cli-local] falta login de assinatura. Em um terminal interativo, rode: pnpm claude:login",
  );
  process.exit(0);
}

if (metodo && metodo !== "none") {
  console.warn(
    `[claude-cli-local] a CLI está autenticada por ${metodo}, não pela assinatura claude.ai. Abrindo o login da conta Claude…`,
  );
} else {
  console.info("[claude-cli-local] conecte sua conta Claude para liberar os testes locais.");
}

const login = spawnSync(comando, ["auth", "login"], {
  env: ambiente,
  stdio: "inherit",
  shell: false,
});
if (login.error?.code === "ENOENT") {
  console.warn("[claude-cli-local] não foi possível abrir a Claude CLI.");
}
// O login local nunca impede o servidor de desenvolvimento de subir. A tela de
// credenciais mostra o estado e o teste falha fechado se não houver assinatura.
process.exit(0);
