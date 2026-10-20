/**
 * A Claude CLI local aparece como uma capacidade de ensaio, não como uma
 * credencial copiada para o CRM. Estes casos preservam a distinção mais
 * importante da tela: sessão claude.ai aceita; autenticação por API recusada.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PainelClaudeCliLocal } from "@/app/app/ai/credentials/_components/PainelClaudeCliLocal";

afterEach(cleanup);

describe("painel da Claude CLI local", () => {
  it("mostra a assinatura claude.ai pronta sem sugerir que o CRM salvou o token", () => {
    render(
      <PainelClaudeCliLocal
        idioma="pt-BR"
        estado={{
          habilitado: true,
          instalado: true,
          autenticado: true,
          assinatura: true,
          metodo: "claude.ai",
          modelo: "sonnet",
        }}
      />,
    );

    const painel = screen.getByTestId("painel-claude-cli-local");
    expect(painel.textContent).toContain("Assinatura conectada");
    expect(painel.textContent).toContain("Nenhum token da conta é copiado ou salvo pelo CRM");
    expect(painel.textContent).toContain("Usar Claude CLI local neste ensaio");
  });

  it("recusa uma sessão autenticada por API e orienta o login da conta", () => {
    render(
      <PainelClaudeCliLocal
        idioma="pt-BR"
        estado={{
          habilitado: true,
          instalado: true,
          autenticado: true,
          assinatura: false,
          metodo: "apiKey",
          modelo: "sonnet",
        }}
      />,
    );

    const painel = screen.getByTestId("painel-claude-cli-local");
    expect(painel.textContent).toContain("Login necessário");
    expect(painel.textContent).toContain("pnpm claude:login");
    expect(painel.textContent).toContain("não por uma conta claude.ai");
    expect(painel.textContent).toContain("recusa API key");
  });
});
