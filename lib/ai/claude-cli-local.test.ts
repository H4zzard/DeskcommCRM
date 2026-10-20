import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  configClaudeCliLocal,
  createClaudeCliLocalRegistry,
  estadoClaudeCliLocal,
} from "./claude-cli-local";

const temporarios: string[] = [];

afterEach(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  await Promise.all(temporarios.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function cliFingida(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "claude-cli-local-test-"));
  temporarios.push(dir);
  const file = join(dir, "claude-fingida.mjs");
  await writeFile(
    file,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "auth" && args[1] === "status") {
  const authMethod = process.env.ANTHROPIC_API_KEY ? "api_key" : "claude.ai";
  process.stdout.write(JSON.stringify({ authMethod }));
  process.exit(0);
}
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const temFerramenta = input.includes("send_message");
  process.stdout.write(JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    structured_output: temFerramenta
      ? { type: "tool_call", tool_name: "send_message", input: { body: "Olá pela assinatura Claude." } }
      : { type: "text", text: "Resumo local." },
  }));
});
`,
    "utf8",
  );
  await chmod(file, 0o755);
  return file;
}

describe("Claude CLI local", () => {
  it("só liga por opt-in e nunca liga em produção", () => {
    expect(configClaudeCliLocal({ NODE_ENV: "development" })).toBeNull();
    expect(
      configClaudeCliLocal({ NODE_ENV: "development", CLAUDE_CLI_PATH: "disabled" }),
    ).toBeNull();
    expect(configClaudeCliLocal({ NODE_ENV: "production", CLAUDE_CLI_PATH: "" })).toBeNull();
    expect(configClaudeCliLocal({ NODE_ENV: "development", CLAUDE_CLI_PATH: "" })).toEqual({
      caminho: "claude",
      modelo: "sonnet",
    });
  });

  it("remove a API key do filho e reconhece somente a sessão claude.ai", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-nao-deve-chegar-ao-filho";
    const caminho = await cliFingida();
    const estado = await estadoClaudeCliLocal({ caminho, modelo: "sonnet" });
    expect(estado).toMatchObject({
      habilitado: true,
      instalado: true,
      autenticado: true,
      assinatura: true,
      metodo: "claude.ai",
    });
  });

  it("traduz a decisão estruturada da CLI em tool-call do AI SDK", async () => {
    const caminho = await cliFingida();
    const model = createClaudeCliLocalRegistry({ caminho, modelo: "sonnet" }).anthropic!(
      "marcador-local",
      "claude-sonnet-5",
    ) as unknown as {
      doGenerate(options: { prompt: unknown[]; tools: unknown[] }): Promise<{
        content: Array<{ type: string; toolName?: string; input?: string }>;
        finishReason: { unified: string };
      }>;
    };
    const result = await model.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "Oi" }] }],
      tools: [
        {
          type: "function",
          name: "send_message",
          description: "responde ao cliente",
          inputSchema: { type: "object", properties: { body: { type: "string" } } },
        },
      ],
    });
    expect(result.finishReason.unified).toBe("tool-calls");
    expect(result.content[0]).toMatchObject({
      type: "tool-call",
      toolName: "send_message",
    });
    expect(JSON.parse(result.content[0]?.input ?? "{}")).toEqual({
      body: "Olá pela assinatura Claude.",
    });
  });
});
