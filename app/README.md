# AI Workbench

Aplicativo pessoal de IA com React, TypeScript, Vite e Capacitor. O site é publicado no GitHub Pages e o backend usa Supabase.

## Arquitetura

- **Site:** GitHub Pages — `https://lorenzosella99.github.io/LuaWorks-Studio/`.
- **Backend:** Supabase Auth, PostgreSQL com RLS e Edge Functions.
- **Aplicativo Android:** Capacitor; usa o mesmo projeto Supabase.
- **Instalador Zorin OS:** pacote `.deb` com a interface local em navegador.
- **Código-fonte editável:** pasta `app/`. A pasta raiz contém a versão compilada para Pages.

## Desenvolvimento local

Requisitos: Node.js 22 ou superior.

```bash
cd app
cp .env.example .env
npm install
npm run dev
```

Variáveis públicas do frontend:

```env
VITE_SUPABASE_URL=https://zmwgrlvgzcxmepfnltal.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=chave_publishable_do_projeto
```

Use somente a chave publishable/anon no frontend. Nunca coloque `service_role`, secret key ou chaves de provedores em `VITE_*`, no navegador ou no Git.

## Supabase

Projeto conectado: `zmwgrlvgzcxmepfnltal`.

Tabelas utilizadas:
- `conversations`
- `messages`
- `github_connections`

As três tabelas têm RLS habilitado. A aplicação usa Supabase Auth com conta autorizada; o cadastro público permanece desativado. As Edge Functions `chat-ai` e `github-integration` exigem JWT e validam a sessão e o e-mail autorizado.

### Secrets das Edge Functions

Adicione apenas no painel Supabase, em **Edge Functions → Secrets**:

| Secret | Finalidade |
|---|---|
| `CODE_API_KEY` | Chave do provedor configurado para Código Geral |
| `STORMWORKS_PRIMARY_API_KEY` | Chave do provedor configurado para geração Stormworks |
| `PERSONALITY_API_KEY` | Chave do provedor configurado para Personalidade |
| `POLLINATIONS_API_KEY` | Chave do provedor de imagens |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | Segredo aleatório de pelo menos 32 caracteres para criptografar o token GitHub |

Gere o segredo de criptografia do GitHub com `openssl rand -hex 32`. Guarde uma cópia segura: se ele for trocado, tokens anteriormente criptografados não poderão ser lidos e será necessário reconectar o GitHub.

Antes de criar ou usar uma chave de API, confira a idade mínima e os termos do provedor. Não falsifique idade nem use credenciais de outra pessoa sem autorização. Sem uma chave válida, somente o modo correspondente ficará indisponível; o Validador Lua funciona localmente sem API.

### Modos

- **Código Geral:** usa o histórico de conversa.
- **Stormworks Lua:** usa o histórico e faz análise estática no servidor para limite de 4.096 caracteres, APIs bloqueadas e callback básico. Não usa Gemini nem exige `STORMWORKS_REVIEW_API_KEY`.
- **Gerar Imagem:** combina o pedido atual com as mensagens anteriores recentes para manter contexto visual. A geração pode consumir créditos do provedor.
- **Personalidade:** envia as mensagens anteriores para manter tom e contexto.
- **Validador Lua:** análise local no navegador; não envia o código para IA.

A análise estática não executa Lua e não substitui testar o código no jogo.

## Diagnóstico de APIs

Entre na aplicação, abra **Configurações → Diagnóstico das APIs** e clique em **Testar todas as APIs**. O teste:
1. verifica uma leitura no banco Supabase usando a sessão atual;
2. testa Código Geral, Stormworks e Personalidade com mensagens de contexto + pergunta de recuperação;
3. solicita uma imagem com descrição anterior do personagem;
4. consulta a Edge Function de integração GitHub.

O teste de imagens faz uma chamada real e pode consumir créditos. A consulta GitHub verifica o estado da conexão; só testa gravar commits quando um repositório e um token forem configurados.

## Integração GitHub

Na aplicação, abra **Configurações → Integração com GitHub** e conecte um fine-grained Personal Access Token. Dê somente permissões necessárias, como `Contents: Read and write` nos repositórios desejados. O backend cifra o token com AES-GCM antes de salvá-lo no Supabase.

## Publicação e pacotes

Os workflows em `.github/workflows/` usam a pasta `app/` como fonte principal:

- `publish-site.yml`: compila e publica a interface estática no GitHub Pages.
- `build-packages.yml`: compila os pacotes Android (APK), Windows (instalador e portátil) e Linux (AppImage, DEB, RPM e TAR.GZ portátil). Publica os arquivos na release `latest`, usada também pelo aviso de atualização dentro do aplicativo.

Ambos rodam automaticamente quando arquivos em `app/` ou no próprio workflow mudam. Os pacotes aparecem como artefatos nas execuções do GitHub Actions. Para abrir o site, ative GitHub Pages em **Settings → Pages**, usando a branch `main` e a pasta raiz (`/(root)`).

No Supabase, inclua o endereço HTTPS do Pages em **Authentication → URL Configuration → Redirect URLs**. Para o app Capacitor, inclua também `https://localhost/**`.

## Segurança

- Nunca comite `.env`, chaves secretas, tokens de provedor ou service role.
- RLS deve permanecer habilitado nas tabelas expostas.
- APK de depuração é para instalação pessoal/testes, não para publicação na Play Store.
- O instalador Zorin abre uma cópia local da interface; login, histórico e IA ainda precisam de internet.
