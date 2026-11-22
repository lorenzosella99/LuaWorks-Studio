# AI Workbench Private

Aplicação pessoal com login `loren`, histórico de conversas no Supabase, quatro modos de IA, integração GitHub e versão Android leve em Capacitor.

## O que vem neste pacote

- Tela de login aparece antes do aplicativo; somente `lorenzosella99@gmail.com` é autorizado pelo frontend, RLS e Edge Function.
- Modos: Código Geral, Lua/Stormworks (gerador + revisor em dois passos), Gerar Imagem e Personalidade.
- Histórico no PostgreSQL/Supabase.
- Blocos Markdown e syntax highlighting, contador de 4.096 caracteres para Lua.
- Conexão GitHub por fine-grained Personal Access Token; o token é cifrado no servidor e usado para criar/atualizar arquivos e commits.
- PWA instalável e app Android Capacitor. O APK é compilado no GitHub Actions.

## Configuração do site

O pacote inclui `.env.example` pré-preenchido com a URL e a chave publishable deste projeto. Copie-o para `.env` antes de iniciar. Não publique `.env` no Git. A chave publishable é pública por desenho; `service_role`/secret keys nunca podem ir para o frontend.

```bash
npm install
npm run dev
```

A tela de login aparece quando a sessão não existe. O nome `loren` é convertido para `lorenzosella99@gmail.com`; a senha é validada pelo Supabase Auth. O cadastro público no projeto Supabase está desativado.

## Integrações de IA

As chaves de provedores ficam somente em **Supabase Dashboard → Edge Functions → Secrets**. Nenhuma chave deve ser colocada em `VITE_...`, no `.env` do frontend ou no GitHub. O Validador Lua funciona localmente e não pede chave do Google.

| Secret no Supabase | Provedor e finalidade | Modelo/uso inicial |
|---|---|---|
| `POLLINATIONS_API_KEY` | Pollinations — geração de imagens | `black-forest-labs/flux.1-schnell` |
| `STORMWORKS_PRIMARY_API_KEY` | Groq — geração dos scripts Lua | `qwen/qwen3.8-27b` |
| `PERSONALITY_API_KEY` | OpenRouter — modo Personalidade | `openrouter/free` |
| `CODE_API_KEY` | Groq — Código Geral | `openai/gpt-oss-120b` |

Páginas oficiais para criar as chaves:

1. Pollinations: https://enter.pollinations.ai/keys — crie uma Secret Key (`sk_`) de servidor e limite a permissão a imagens/modelo escolhido. O serviço usa saldo/limites de Pollen; **não é ilimitado nem posso garantir que gerar imagens seja grátis**. Configure orçamento baixo na chave para evitar surpresas. A documentação atual diz que chaves `sk_` são somente de servidor e que a chave `pk_` é um identificador para OAuth/BYOP, não uma credencial direta de geração.
2. Groq: https://console.groq.com/keys — crie duas chaves diferentes: uma para Stormworks e outra para Código Geral. Os modelos `qwen/qwen3.8-27b` e `openai/gpt-oss-120b` constam da tabela de limites do plano gratuito (os limites de referência publicados são 30 RPM, 1.000 RPD e 8.000 TPM por modelo). As quotas são aplicadas no nível da organização; duas chaves não duplicam os limites. Confira o painel da sua organização, porque a Groq pode mudar cotas e elegibilidade.
4. OpenRouter: https://openrouter.ai/settings/keys — crie a key para Personalidade e mantenha o modelo `openrouter/free`. A página atual de modelos gratuitos informa 20 req/min e 50 req/dia para IDs com sufixo `:free`; `openrouter/free` escolhe um modelo gratuito disponível. A disponibilidade e as cotas mudam.

### Secret adicional do GitHub (não é uma das cinco APIs)

A criptografia do token do GitHub precisa de mais uma variável de ambiente: `GITHUB_TOKEN_ENCRYPTION_KEY`. Gere uma chave aleatória forte no terminal: `openssl rand -hex 32`. Cole o valor também em **Edge Functions → Secrets**. Guarde uma cópia segura: trocar essa chave faz os tokens GitHub já salvos não poderem ser descriptografados; nesse caso, será necessário reconectar o GitHub.

## Validação Lua sem Google Gemini

O modo Stormworks não faz mais uma segunda chamada ao Google Gemini. Depois da geração, o servidor executa uma análise estática para conferir o limite de 4.096 caracteres, APIs proibidas, blocos básicos e possíveis problemas de canal/divisão. A página **Validador Lua** também permite colar um script e analisar tudo no próprio navegador, sem enviar o código para uma API.

A análise estática não executa Lua e não substitui o teste dentro do jogo. A geração por IA ainda depende da chave do provedor de geração já configurada no servidor; o Validador Lua funciona mesmo sem essa chave.

## Conectar GitHub no site/app

1. No GitHub, abra https://github.com/settings/personal-access-tokens e crie um fine-grained token.
2. Selecione apenas os repositórios necessários e dê permissão `Contents: Read and write`. Para gravar em `.github/workflows`, inclua `Workflows: Read and write`.
3. No AI Workbench, abra Configurações → Integração com GitHub, cole o token e clique em **Conectar GitHub**.
4. Em qualquer bloco de código, use **Salvar no GitHub** e informe `owner/repo`, caminho do arquivo e mensagem do commit.

O token vai para a Edge Function por HTTPS e é cifrado em AES-GCM antes de ser gravado em `github_connections`. O browser não recebe o token de volta.

## Publicar o site com login

O site está configurado para Vite/React e GitHub Pages. Publique o repositório e, em **Settings → Secrets and variables → Actions**, crie os secrets `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Em **Settings → Pages**, escolha GitHub Actions. O workflow `.github/workflows/deploy.yml` vai publicar a pasta `dist/`.

A URL do domínio publicado também deve ser incluída em **Supabase → Authentication → URL Configuration → Redirect URLs**, junto com `http://localhost:5173/**`. Para a aplicação Android, adicione `https://localhost/**` (Capacitor usa o esquema Android `https` configurado neste projeto).

## Instalar no Android / gerar APK

O projeto Android é criado automaticamente no GitHub Actions a partir do bundle web, para não manter uma pasta Android enorme no repositório.

1. Envie o projeto ao GitHub.
2. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` nos secrets de Actions (mesmos nomes acima).
3. Abra **Actions → Build Android APK → Run workflow**.
4. Quando terminar, abra a execução e baixe o artefato `ai-workbench-android-debug`. Dentro do ZIP de artefato estará `app-debug.apk`.
5. Transfira o APK para Android e permita instalar aplicativos dessa fonte.

É um APK debug para instalação pessoal/testes, não publicado na Play Store. Capacitor 8 requer Node.js 22 ou superior para desenvolvimento e Android Studio 2025.2.1 ou superior, mais Android SDK (API 24 ou superior, conforme a documentação atual). O APK contém um WebView com a interface compilada; autenticação, histórico e chamadas de IA continuam usando a internet. Para atualizações, gere novamente o APK pelo workflow.

Para compilar localmente com Android Studio instalado:

```bash
npm install
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

Depois, no Android Studio, gere o APK de depuração (Build → Build Bundle(s) / APK(s) → Build APK(s)).

## Banco e Edge Functions

O projeto Supabase `zmwgrlvgzcxmepfnltal` já tem `conversations`, `messages` e `github_connections` com RLS; a função de acesso aceita apenas o e-mail autorizado por senha. A constraint de modo também precisa incluir `personality` (migration `add_personality_chat_mode`). As Edge Functions `chat-ai` e `github-integration` estão publicadas no projeto. A migration `add_personality_chat_mode` já foi aplicada ao projeto conectado e `chat-ai` está publicada na versão 2. Depois de inserir os secrets, não é preciso republicar a função, a menos que altere seu código. `github-integration` também está publicada.

**Não coloque API keys de IA, chave `service_role` ou `GITHUB_TOKEN_ENCRYPTION_KEY` no frontend ou em arquivos do Git.**
