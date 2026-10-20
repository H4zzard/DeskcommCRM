# Ensaio local do agente pela Claude CLI

Este modo permite comparar o comportamento de um agente com a assinatura
Claude **somente no ambiente de desenvolvimento local**, antes de contratar a
API. Ele não é um provedor publicável e não atende conversas reais.

## Ativar

Instale a Claude CLI oficial e troque `disabled` por vazio no `.env.local`:

```dotenv
CLAUDE_CLI_PATH=
CLAUDE_CLI_MODEL=sonnet
```

`CLAUDE_CLI_PATH=` vazio significa procurar o comando `claude` no `PATH`. Um
caminho absoluto também pode ser usado. Ao executar `pnpm dev`, o preflight
confere `claude auth status`; se não houver uma sessão de assinatura em um
terminal interativo, ele abre `claude auth login`. O mesmo fluxo pode ser
iniciado manualmente com:

```bash
pnpm claude:login
```

O estado aparece em **IA → Credenciais**, no cartão “Claude CLI local”. O CRM
aceita somente `authMethod=claude.ai` neste modo. Se a CLI estiver usando API
key, Bedrock, Vertex ou Foundry, o ensaio fica indisponível para não cobrar uma
origem diferente sem avisar.

## Usar

Abra um agente já salvo, entre na aba **Teste**, ligue **Usar Claude CLI local
neste ensaio** e execute a prévia. A versão não é alterada: provider, modelo e
credencial persistidos continuam exatamente como estavam.

A CLI recebe o prompt e a fita do turno por `stdin`, decide uma ação estruturada
por vez e devolve texto ou uma chamada de ferramenta. As ferramentas continuam
sendo executadas pelo runtime de prévia do CRM; portanto `send_message`, busca,
guardrails e resultados de tools voltam ao laço do agente como no teste normal.
A CLI roda com as ferramentas próprias, MCPs, comandos, leitura de arquivos e
persistência de sessão desligados.

## Limites e segurança

- `NODE_ENV=production` desliga o recurso em código, mesmo que a variável exista.
- O worker de atendimento real não lê `CLAUDE_CLI_PATH`; só a rota autenticada de prévia usa o adaptador.
- Nenhum token da conta é lido, copiado ou gravado no banco. A sessão fica sob responsabilidade da própria CLI e do usuário do sistema operacional.
- Variáveis de API da Anthropic e de clouds são removidas do ambiente do processo filho.
- A prévia não envia WhatsApp, mas consome os limites da assinatura Claude.
- A CLI não expõe uma contagem faturável equivalente à API; por isso o ensaio registra zero token/custo em vez de inventar uma estimativa.
- Embeddings e outros serviços fora do chat continuam seguindo a configuração normal da instalação.

Este caminho é uma bancada de avaliação local. Para publicar um agente e
atender clientes, use uma credencial de API ou outro provedor suportado em
produção.
