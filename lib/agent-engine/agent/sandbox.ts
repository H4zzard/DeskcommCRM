import type pg from "pg";
import { loadAgentVersionConfig } from "./agent-config";
import { runAgentPreview, type InboundTurnDeps } from "./inbound-turn";
import { newPreviewResult, scenarioContext } from "./preview";
import { MODELO_DO_SEAM_CLAUDE_CLI_LOCAL } from "@/lib/ai/claude-cli-local";
export async function testAgentVersion(
  pool: pg.Pool,
  deps: InboundTurnDeps,
  input: {
    organizationId: string;
    agentId: string;
    versionId: string;
    runId: string;
    sampleMessage: string;
    sampleContact?: { name?: string; phone?: string };
    channelId: string | null;
    /** Só a rota local de teste preenche; nunca é persistido na versão. */
    claudeCliLocal?: boolean;
  },
) {
  const loadedAgent = await loadAgentVersionConfig(
    pool,
    input.organizationId,
    input.agentId,
    input.versionId,
  );
  if (!loadedAgent) throw new Error("preview_version_unavailable");
  // O registry local ocupa a porta Anthropic do seam apenas durante esta
  // prévia. Clonar a config faz o modelo/provider caminharem juntos também nas
  // chamadas auxiliares, sem regravar o rascunho nem abrir uma porta no worker.
  const agent = input.claudeCliLocal
    ? {
        ...loadedAgent,
        provider: "anthropic",
        model: MODELO_DO_SEAM_CLAUDE_CLI_LOCAL,
        credentialId: null,
        operatorModel: null,
      }
    : loadedAgent;
  const result = newPreviewResult();
  const context = scenarioContext(
    [
      {
        direction: "inbound",
        body: input.sampleMessage,
        sent_at: (deps.clock?.() ?? new Date()).toISOString(),
      },
    ],
    input.sampleContact,
  );
  await runAgentPreview(deps, pool, {
    kind: "sandbox",
    organizationId: input.organizationId,
    runId: input.runId,
    agent,
    context,
    contactId: null,
    channelId: input.channelId,
    result,
  });
  return result;
}
