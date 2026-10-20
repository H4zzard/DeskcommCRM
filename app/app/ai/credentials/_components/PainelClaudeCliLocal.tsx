import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EstadoClaudeCliLocal } from "@/lib/ai/claude-cli-local";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

export function PainelClaudeCliLocal({
  estado,
  idioma,
}: {
  estado: EstadoClaudeCliLocal;
  idioma: Idioma;
}) {
  const t = (texto: string) => traduzir(texto, idioma);
  const pronto = estado.instalado && estado.assinatura;

  return (
    <Card data-testid="painel-claude-cli-local">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{t("Claude CLI local (experimental)")}</CardTitle>
          <Badge variant={pronto ? "default" : "secondary"}>
            {pronto
              ? t("Assinatura conectada")
              : !estado.instalado
                ? t("CLI não encontrada")
                : t("Login necessário")}
          </Badge>
        </div>
        <CardDescription>
          {t(
            "Usa a sessão da Claude CLI desta máquina somente para ensaiar o comportamento do agente. Nenhum token da conta é copiado ou salvo pelo CRM.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid gap-2 rounded-lg border p-4 sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">{t("Modelo da CLI:")}</span>{" "}
            <code>{estado.modelo}</code>
          </p>
          <p>
            <span className="text-muted-foreground">{t("Tipo de acesso:")}</span>{" "}
            <code>{estado.metodo ?? t("nenhum")}</code>
          </p>
        </div>

        {!pronto ? (
          <div className="space-y-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
            <p className="font-medium">{t("Como conectar")}</p>
            <p>
              {estado.instalado
                ? t("Rode o comando abaixo no mesmo usuário que inicia a aplicação:")
                : t(
                    "Instale a Claude CLI oficial, confirme que o comando claude está no PATH e então rode:",
                  )}
            </p>
            <code className="block rounded bg-background p-2">pnpm claude:login</code>
            {estado.autenticado && !estado.assinatura ? (
              <p className="text-muted-foreground">
                {t(
                  "A CLI está autenticada, mas não por uma conta claude.ai. Este modo recusa API key para não gerar cobrança sem avisar.",
                )}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
            {t(
              "Pronto. Abra um agente, vá à aba Teste e ligue “Usar Claude CLI local neste ensaio”.",
            )}
          </p>
        )}

        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            {t(
              "Disponível somente em desenvolvimento local; em produção fica desligado por código.",
            )}
          </li>
          <li>
            {t(
              "A Claude CLI decide as chamadas, mas as ferramentas e os guardrails continuam sendo executados pelo modo de prévia do CRM.",
            )}
          </li>
          <li>
            {t(
              "Nada é enviado ao WhatsApp. O ensaio pode consumir os limites de uso da sua assinatura Claude.",
            )}
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}
