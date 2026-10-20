/**
 * Adaptador EXPERIMENTAL da Claude CLI para ensaios locais do agente.
 *
 * Não é uma credencial do CRM: a sessão continua pertencendo à instalação
 * local da Claude CLI. O processo filho roda sem ferramentas próprias, sem
 * MCP, sem persistir sessão e sem herdar chaves de API da Anthropic. As tools
 * do atendimento continuam sendo executadas pelo runtime do CRM, uma por vez,
 * a partir da decisão estruturada devolvida pela CLI.
 *
 * CLAUDE_CLI_PATH diferente de `disabled` é o opt-in. Valor vazio significa
 * `claude` no PATH. Em produção a configuração é ignorada de todo modo.
 */
import "server-only";

import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

import type { LanguageModel } from "ai";

import type { ProviderRegistry } from "@/lib/agent-engine/edge/llm/providers";

const LIMITE_STDOUT = 2 * 1024 * 1024;
const LIMITE_STDERR = 16 * 1024;
const TEMPO_LIMITE_MS = 90_000;
const TEMPO_STATUS_MS = 5_000;

/** Id canônico usado só para atravessar a validação provider/model do seam. */
export const MODELO_DO_SEAM_CLAUDE_CLI_LOCAL = "claude-sonnet-5";

export interface ConfigClaudeCliLocal {
  caminho: string;
  modelo: string;
}

export interface EstadoClaudeCliLocal {
  habilitado: boolean;
  instalado: boolean;
  autenticado: boolean;
  assinatura: boolean;
  metodo: string | null;
  modelo: string;
}

interface ResultadoDoProcesso {
  codigo: number | null;
  sinal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  naoEncontrado: boolean;
  expirou: boolean;
}

interface SaidaClaudeJson {
  type?: unknown;
  subtype?: unknown;
  is_error?: unknown;
  result?: unknown;
  structured_output?: unknown;
}

type AcaoDaClaude =
  | { type: "text"; text: string }
  | { type: "tool_call"; tool_name: string; input: Record<string, unknown> };

const SCHEMA_DA_ACAO = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["text", "tool_call"] },
    text: { type: "string" },
    tool_name: { type: "string" },
    input: { type: "object", additionalProperties: true },
  },
  required: ["type"],
  additionalProperties: false,
} as const;

function temAPropriedade(source: NodeJS.ProcessEnv, nome: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, nome);
}

export function configClaudeCliLocal(
  source: NodeJS.ProcessEnv = process.env,
): ConfigClaudeCliLocal | null {
  const caminhoConfigurado = source.CLAUDE_CLI_PATH?.trim() ?? "";
  if (
    source.NODE_ENV === "production" ||
    !temAPropriedade(source, "CLAUDE_CLI_PATH") ||
    caminhoConfigurado.toLowerCase() === "disabled"
  ) {
    return null;
  }
  return {
    caminho: caminhoConfigurado || "claude",
    modelo: source.CLAUDE_CLI_MODEL?.trim() || "sonnet",
  };
}

/**
 * A CLI deve usar a sessão local, nunca uma chave herdada do processo do CRM.
 * Manter o restante do ambiente preserva HOME/configDir e PATH, que são
 * justamente onde o binário e o login do usuário vivem.
 */
function ambienteDaAssinatura(): NodeJS.ProcessEnv {
  const childEnv = { ...process.env };
  for (const nome of [
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX",
    "CLAUDE_CODE_USE_FOUNDRY",
  ]) {
    delete childEnv[nome];
  }
  return childEnv;
}

function acrescentarComTeto(atual: string, pedaco: string, teto: number): string {
  if (atual.length >= teto) return atual;
  return (atual + pedaco).slice(0, teto);
}

async function executar(
  config: ConfigClaudeCliLocal,
  args: string[],
  entrada = "",
  abortSignal?: AbortSignal,
  tempoLimiteMs = TEMPO_LIMITE_MS,
): Promise<ResultadoDoProcesso> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let naoEncontrado = false;
    let expirou = false;
    let encerrado = false;

    const child = spawn(config.caminho, args, {
      cwd: tmpdir(),
      env: ambienteDaAssinatura(),
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });

    const finalizar = (codigo: number | null, sinal: NodeJS.Signals | null) => {
      if (encerrado) return;
      encerrado = true;
      clearTimeout(timer);
      abortSignal?.removeEventListener("abort", abortar);
      resolve({ codigo, sinal, stdout, stderr, naoEncontrado, expirou });
    };
    const abortar = () => child.kill("SIGTERM");
    const timer = setTimeout(() => {
      expirou = true;
      child.kill("SIGTERM");
    }, tempoLimiteMs);

    abortSignal?.addEventListener("abort", abortar, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = acrescentarComTeto(stdout, chunk.toString("utf8"), LIMITE_STDOUT);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = acrescentarComTeto(stderr, chunk.toString("utf8"), LIMITE_STDERR);
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      naoEncontrado = err.code === "ENOENT";
      stderr = acrescentarComTeto(stderr, err.message, LIMITE_STDERR);
      finalizar(null, null);
    });
    child.on("close", finalizar);
    child.stdin.on("error", () => {
      // O processo pode encerrar antes de consumir a entrada; `close` é quem
      // fecha o resultado e preserva o código real.
    });
    child.stdin.end(entrada);
  });
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

export async function estadoClaudeCliLocal(
  config: ConfigClaudeCliLocal | null = configClaudeCliLocal(),
): Promise<EstadoClaudeCliLocal> {
  if (config === null) {
    return {
      habilitado: false,
      instalado: false,
      autenticado: false,
      assinatura: false,
      metodo: null,
      modelo: "sonnet",
    };
  }
  const result = await executar(config, ["auth", "status"], "", undefined, TEMPO_STATUS_MS);
  if (result.naoEncontrado) {
    return {
      habilitado: true,
      instalado: false,
      autenticado: false,
      assinatura: false,
      metodo: null,
      modelo: config.modelo,
    };
  }
  let metodo: string | null = null;
  try {
    const parsed = objeto(JSON.parse(result.stdout));
    metodo = typeof parsed?.authMethod === "string" ? parsed.authMethod : null;
  } catch {
    metodo = null;
  }
  const autenticado = result.codigo === 0 && metodo !== null && metodo !== "none";
  return {
    habilitado: true,
    instalado: true,
    autenticado,
    // O modo local existe para a assinatura. Console/API é recusado para não
    // prometer economia enquanto a CLI cobra por outra origem sem avisar.
    assinatura: autenticado && metodo === "claude.ai",
    metodo,
    modelo: config.modelo,
  };
}

function ferramentasParaPrompt(tools: unknown[] | undefined): Array<Record<string, unknown>> {
  return (tools ?? []).flatMap((tool) => {
    const row = objeto(tool);
    if (row?.type !== "function" || typeof row.name !== "string") return [];
    return [
      {
        name: row.name,
        description: typeof row.description === "string" ? row.description : "",
        input_schema: row.inputSchema ?? {},
      },
    ];
  });
}

function promptDaChamada(options: { prompt: unknown[]; tools?: unknown[] }): string {
  return [
    "Você está ensaiando um turno de atendimento ao cliente dentro de um CRM.",
    "O conteúdo abaixo já traz o prompt do agente e toda a conversa. Siga-o como a regra principal do atendimento.",
    "Você não pode ler arquivos, executar comandos, navegar ou usar ferramentas próprias da Claude CLI.",
    "Decida apenas a PRÓXIMA ação do modelo:",
    "- use type=tool_call para chamar exatamente uma ferramenta disponível; tool_name deve ser idêntico ao catálogo e input deve respeitar o schema;",
    "- use type=text somente quando nenhuma ferramenta for necessária. Texto direto não é enviado ao cliente pelo CRM; para responder ao cliente, use send_message quando ela estiver disponível.",
    "Não escreva explicações fora da saída estruturada.",
    "",
    `FERRAMENTAS DISPONÍVEIS:\n${JSON.stringify(ferramentasParaPrompt(options.tools))}`,
    "",
    `CONVERSA COMPLETA:\n${JSON.stringify(options.prompt)}`,
  ].join("\n");
}

function acaoDaSaida(stdout: string): AcaoDaClaude {
  let envelope: SaidaClaudeJson;
  try {
    envelope = JSON.parse(stdout) as SaidaClaudeJson;
  } catch {
    throw new Error("claude_cli_resposta_nao_json");
  }
  if (envelope.type !== "result" || envelope.subtype !== "success" || envelope.is_error === true) {
    throw new Error("claude_cli_execucao_recusada");
  }
  let raw = envelope.structured_output;
  if (raw === undefined && typeof envelope.result === "string") {
    try {
      raw = JSON.parse(envelope.result);
    } catch {
      raw = { type: "text", text: envelope.result };
    }
  }
  const action = objeto(raw);
  if (action?.type === "text" && typeof action.text === "string") {
    return { type: "text", text: action.text };
  }
  if (
    action?.type === "tool_call" &&
    typeof action.tool_name === "string" &&
    objeto(action.input) !== null
  ) {
    return {
      type: "tool_call",
      tool_name: action.tool_name,
      input: objeto(action.input)!,
    };
  }
  throw new Error("claude_cli_acao_invalida");
}

/** Registry usado somente pelo POST de prévia quando o operador marca a CLI. */
export function createClaudeCliLocalRegistry(config: ConfigClaudeCliLocal): ProviderRegistry {
  const factory = (_apiKey: string, modelId: string): LanguageModel =>
    ({
      specificationVersion: "v3",
      provider: "anthropic",
      modelId,
      doGenerate: async (options: {
        prompt: unknown[];
        tools?: unknown[];
        abortSignal?: AbortSignal;
      }) => {
        const result = await executar(
          config,
          [
            "-p",
            "--bare",
            "--tools",
            "",
            "--disallowedTools",
            "mcp__*",
            "--permission-prompts",
            "none",
            "--disable-slash-commands",
            "--no-session-persistence",
            "--max-turns",
            "2",
            "--model",
            config.modelo,
            "--output-format",
            "json",
            "--json-schema",
            JSON.stringify(SCHEMA_DA_ACAO),
          ],
          promptDaChamada(options),
          options.abortSignal,
        );
        if (options.abortSignal?.aborted) throw options.abortSignal.reason;
        if (result.naoEncontrado) throw new Error("claude_cli_nao_encontrada");
        if (result.expirou) throw new Error("claude_cli_tempo_esgotado");
        if (result.codigo !== 0) throw new Error("claude_cli_execucao_falhou");
        const action = acaoDaSaida(result.stdout);
        const content =
          action.type === "text"
            ? [{ type: "text" as const, text: action.text }]
            : [
                {
                  type: "tool-call" as const,
                  toolCallId: randomUUID(),
                  toolName: action.tool_name,
                  input: JSON.stringify(action.input),
                },
              ];
        return {
          content,
          finishReason: {
            unified: action.type === "tool_call" ? "tool-calls" : "stop",
            raw: undefined,
          },
          // A assinatura não expõe contagem faturável pela CLI. Zero é
          // deliberado: estimar caracteres como tokens fabricaria custo.
          usage: {
            inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 0, text: 0, reasoning: 0 },
          },
          warnings: [],
        };
      },
      doStream: async () => {
        throw new Error("claude_cli_local_sem_stream");
      },
    }) as unknown as LanguageModel;

  return { anthropic: factory };
}
