---
impacto: capacidade_nova
secao: adicionado
titulo: O teste do agente pode usar uma assinatura Claude pela CLI local
---

Em desenvolvimento local, quem instala a Claude CLI pode conectar a própria conta Claude e escolher essa sessão ao testar um agente, sem cadastrar uma chave de API. O estado do login aparece em IA › Credenciais e o ensaio continua usando as ferramentas e verificações do modo de teste, sem enviar mensagens ao WhatsApp. O recurso fica desligado por padrão e não existe em produção; para ativar, troque `CLAUDE_CLI_PATH=disabled` por `CLAUDE_CLI_PATH=` no `.env.local` e rode `pnpm dev` ou `pnpm claude:login`.
