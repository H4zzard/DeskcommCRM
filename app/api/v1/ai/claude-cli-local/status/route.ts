import { randomUUID } from "node:crypto";

import { ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { configClaudeCliLocal, estadoClaudeCliLocal } from "@/lib/ai/claude-cli-local";

export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = randomUUID();
  const authz = await requireRole("manager", {
    requestId,
    resource: "ai_credentials",
    allowPlatformAdmin: "leitura",
  });
  if (!authz.ok) return authz.response;

  const estado = await estadoClaudeCliLocal(configClaudeCliLocal());
  return ok(estado, { requestId });
}
