import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const OWNER = "lorenzosella99@gmail.com";
const GROQ = "https://api.groq.com/openai/v1/chat/completions";
const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
const STORM_MODEL = "qwen/qwen3.8-27b";
const CODE_MODEL = "openai/gpt-oss-120b";
const PERSONA_MODEL = "openrouter/free";
const IMAGE_MODEL = "google/gemini-3-pro-image";
const IMAGE_PROMPT_MODEL = STORM_MODEL;
const CHAT_PROMPT = "Você é o AI Workbench, um assistente conversacional útil, natural e atento ao contexto. Responda no idioma usado pelo usuário. Em conversas comuns, seja direto, simpático e proporcional ao pedido; uma saudação como 'bom dia' merece uma saudação breve, não um texto longo. Não gere código, blocos de código, arquivos ou projetos a menos que o usuário peça isso claramente. Para perguntas, explique normalmente e use exemplos simples quando ajudarem. Use o histórico fornecido para manter continuidade e respeitar os requisitos já mencionados. Não invente fatos, ações ou testes executados.";
const CODE_PROMPT = "Você é o AI Workbench, engenheiro full-stack sênior. Ajude com TypeScript, JavaScript, Python, SQL, APIs, arquitetura, segurança, testes e desenvolvimento web. Quando o usuário pedir código, entregue código completo e executável, com validação, tratamento de erros e instruções. Não invente testes que não executou. Priorize soluções corretas, legíveis e seguras.";
const STORM_PROMPT = "Você é especialista em microcontroladores vanilla de Stormworks. REGRAS: cada bloco Lua tem no máximo 4096 caracteres; use somente callbacks onTick() e onDraw(); use apenas APIs input, output, screen, property, map, async, math, table e string. Nunca use os, io, require, package, debug, filesystem, rede ou bibliotecas externas. Não invente APIs, canais ou portas. Entregue código completo, explique canais de entrada/saída, valide divisões por zero e inicialização. Não prometa ausência de bugs; inclua testes. Retorne no máximo um bloco Markdown Lua com até 4096 caracteres. Se foi pedido código inteiro, nunca retorne trecho.";
const PERSONALITY_PROMPT = "Você é o modo Personalidade do AI Workbench. Adote o tom, papel, personagem ou estilo descrito pelo usuário e mantenha consistência. Pode usar humor e expressividade. Não alegue ser pessoa real, não invente lembranças reais e não confunda interpretação com fatos. Seja útil e honesto.";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
}
function errText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "message" in value) return String((value as { message: unknown }).message);
  return "O provedor não retornou detalhes.";
}
function keyMap(raw?: string): string | undefined {
  if (!raw) return undefined;
  try { const parsed = JSON.parse(raw); return parsed.default ?? Object.values(parsed)[0] as string | undefined; } catch { return undefined; }
}
async function authorize(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) throw new Error("Sessão ausente. Entre novamente.");
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? keyMap(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"));
  if (!url || !key) throw new Error("Configuração Supabase incompleta.");
  const client = createClient(url, key, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Sessão inválida ou expirada.");
  if (data.user.email?.trim().toLowerCase() !== OWNER) throw new Error("Acesso negado. Conta não autorizada.");
}
async function openAI(url: string, key: string, model: string, messages: Array<{ role: string; content: string }>, temperature = 0.2, extraHeaders: Record<string, string> = {}, maxTokens = 8192) {
  const res = await fetch(url, { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", ...extraHeaders }, body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: false }) });
  const raw = await res.text();
  let data: any = {};
  try { data = JSON.parse(raw); } catch {}
  if (!res.ok) throw new Error(model + " HTTP " + res.status + ": " + errText(data.error ?? raw.slice(0, 350)));
  const answer = data?.choices?.[0]?.message?.content;
  if (typeof answer !== "string" || !answer.trim()) throw new Error(model + " retornou resposta vazia.");
  return answer.trim();
}
function luaBlocks(response: string): string[] {
  const matches = Array.from(response.matchAll(/\x60{3}(?:lua)?[ \t]*\r?\n([\s\S]*?)\x60{3}/gi));
  return matches.map((match) => (match[1] ?? "").replace(/\r?\n$/, ""));
}

type EffortLevel = "low" | "medium" | "ultra";
type WorkMode = "general" | "stormworks" | "image" | "personality";

function isEffortLevel(value: unknown): value is EffortLevel {
  return value === "low" || value === "medium" || value === "ultra";
}

function resolveMode(prompt: string): WorkMode {
  if (/stormworks|microcontrolador|micro\s*controlador|\bonTick\b|\bonDraw\b|lua\s+vanilla/i.test(prompt)) return "stormworks";
  if (/(?:gere|gerar|crie|criar|desenhe|desenhar)\s+(?:uma?\s+)?(?:imagem|arte|ilustra[cç][aã]o)|imagem\s+de\s+refer[eê]ncia|ilustra[cç][aã]o\s+digital/i.test(prompt)) return "image";
  if (/modo personalidade|personalidade|interprete|finja\s+ser|aja\s+como|roleplay|converse\s+como|estilo\s+de\s+fala/i.test(prompt)) return "personality";
  return "general";
}

function isCodeRequest(prompt: string): boolean {
  if (/\x60{3}/.test(prompt)) return true;

  const explicitArtifact = /\b(?:c[oó]digo|script|programa|fun[cç][aã]o|classe|componente|aplica[cç][aã]o|aplicativo|app|site|website|p[aá]gina|endpoint|bot|microcontrolador|plugin|extens[aã]o|macro|jogo)\b/i;
  const explanationRequest = /\b(?:explique|explica|explicar|resuma|resumo|o que [eé]|como funciona|qual a diferen[cç]a|compare|me fale|me diz|me conte)\b/i;
  if (explanationRequest.test(prompt) && !explicitArtifact.test(prompt)) return false;

  if (/\b(?:quero|preciso|necessito)\b.{0,60}\b(?:c[oó]digo|script|programa|fun[cç][aã]o|site|app|aplicativo)\b/i.test(prompt)) return true;

  const action = /\b(?:crie|criar|gere|gerar|escreva|escrever|implemente|implementar|desenvolva|desenvolver|construa|construir|programe|programar|codifique|codificar|fa[cç]a|fazer|faz|monte|montar|mande|mandar|manda|passa|mostrar|mostra|mostre|me\s+d[eê])\b/i;
  const artifact = /\b(?:c[oó]digo|script|programa|fun[cç][aã]o|classe|componente|aplica[cç][aã]o|aplicativo|app|site|website|p[aá]gina|api|endpoint|bot|microcontrolador|lua|python|typescript|javascript|html|css|sql|stormworks|roblox|plugin|extens[aã]o|macro|jogo)\b/i;
  if (action.test(prompt) && artifact.test(prompt)) return true;

  const repair = /\b(?:corrija|corrigir|conserte|consertar|depure|debugue|refatore|refatorar|otimize|otimizar|edite|editar|modifique|modificar|revise|revisar)\b/i;
  const technicalReference = /\b(?:c[oó]digo|script|programa|fun[cç][aã]o|arquivo|bug|erro|api|componente|lua|python|typescript|javascript|html|css|sql)\b/i;
  return repair.test(prompt) && technicalReference.test(prompt);
}

function luaIssues(answer: string): string[] {
  const blocks = luaBlocks(answer);
  const issues: string[] = [];
  if (!blocks.length) return ["A resposta não contém um bloco Markdown Lua completo."];
  blocks.forEach((code, index) => {
    if (Array.from(code).length > 4096) issues.push("Bloco " + (index + 1) + " excede 4.096 caracteres.");
    if (/\b(?:os|io)\s*[.:]|\b(?:package|debug)\s*[.:]|\b(?:require|dofile|loadfile)\s*\(/i.test(code)) {
      issues.push("Bloco " + (index + 1) + " contém uma API bloqueada para o ambiente vanilla.");
    }
    if (!/\bfunction\s+(?:onTick|onDraw)\s*\(/i.test(code)) {
      issues.push("Bloco " + (index + 1) + " não apresenta onTick() nem onDraw().");
    }
  });
  return issues;
}

async function reviewAndImprove(
  url: string,
  key: string,
  model: string,
  systemPrompt: string,
  messages: Array<{role:"user"|"assistant";content:string}>,
  initialAnswer: string,
  effort: EffortLevel,
  headers: Record<string, string> = {},
  kind: "code" | "stormworks" | "personality" = "code",
) {
  const request = messages.filter((message) => message.role === "user").slice(-12)
    .map((message, index) => "Pedido " + (index + 1) + ":\n" + message.content).join("\n\n");
  const packageText = "PEDIDOS DO USUÁRIO:\n" + request + "\n\nRESPOSTA INICIAL:\n" + initialAnswer;
  const checks = kind === "personality"
    ? "Verifique consistência de voz, aderência ao papel pedido, clareza, contexto e ausência de afirmações inventadas."
    : "Faça auditoria de lógica, requisitos, casos extremos, segurança, tratamento de erros e compatibilidade. Simule mentalmente os casos de teste apropriados; NÃO afirme que executou o código.";
  const count = effort === "low" ? "2 cenários essenciais" : effort === "medium" ? "4 cenários representativos" : "8 cenários, incluindo limites, falhas e segurança";
  let finalAnswer = initialAnswer;

  if (effort === "low") {
    finalAnswer = await openAI(url, key, model, [
      { role: "system", content: systemPrompt + "\n\nVocê também é revisor técnico. Faça uma revisão rápida e corrija os problemas encontrados em uma única rodada. " + checks + " Considere " + count + ". Devolva a resposta final COMPLETA, não um diff. Preserve todos os requisitos originais. Não diga que executou testes." },
      { role: "user", content: packageText },
    ], 0.1, headers);
  } else {
    const review = await openAI(url, key, model, [
      { role: "system", content: "Você é um revisor técnico em uma etapa separada e criterioso. " + checks + " Liste falhas concretas, riscos, requisitos esquecidos e " + count + " casos de teste simulados. Não reescreva o projeto e não declare testes executados." },
      { role: "user", content: packageText },
    ], 0.05, headers);
    finalAnswer = await openAI(url, key, model, [
      { role: "system", content: systemPrompt + "\n\nAplique a revisão técnica a seguir. Corrija todos os problemas justificáveis, confira a resposta requisito por requisito e faça a simulação lógica dos casos de teste. Devolva a resposta COMPLETA e pronta para uso; nunca apenas trechos ou diff. Não afirme execução real de testes." },
      { role: "user", content: packageText + "\n\nRELATÓRIO DA REVISÃO:\n" + review },
    ], 0.1, headers);

    if (effort === "ultra") {
      finalAnswer = await openAI(url, key, model, [
        { role: "system", content: systemPrompt + "\n\nFaça uma terceira rodada: auditoria final independente da solução revisada. Procure regressões, inconsistências, problemas de segurança, limites e falhas nos cenários de teste. Corrija o que encontrar e entregue novamente a resposta completa, sem diff. Diferencie claramente simulação lógica de execução real." },
        { role: "user", content: "PEDIDO ORIGINAL:\n" + request + "\n\nRESPOSTA REVISADA:\n" + finalAnswer },
      ], 0.05, headers);
    }
  }

  const effortLabel = effort === "low" ? "Baixo (1 rodada de revisão)" : effort === "medium" ? "Médio (auditoria separada + correção)" : "Ultra (3 rodadas de revisão e verificação)";
  const checkLabel = kind === "personality"
    ? "consistência e aderência ao contexto revisadas por IA"
    : "casos de teste simulados por análise lógica, sem execução local";
  return finalAnswer + "\n\n_Revisão assistida por IA: esforço " + effortLabel + "; " + checkLabel + ".";
}

async function stormworks(messages: Array<{role:"user"|"assistant";content:string}>, effort: EffortLevel) {
  const key = Deno.env.get("STORMWORKS_PRIMARY_API_KEY");
  if (!key) throw new Error("Falta STORMWORKS_PRIMARY_API_KEY no servidor.");
  const context = messages.map((m) => ({ role: m.role, content: m.content }));
  let answer = await openAI(GROQ, key, STORM_MODEL, [{ role: "system", content: STORM_PROMPT }, ...context], 0.12);
  answer = await reviewAndImprove(GROQ, key, STORM_MODEL, STORM_PROMPT, messages, answer, effort, {}, "stormworks");
  let issues = luaIssues(answer);
  if (issues.length) {
    answer = await openAI(GROQ, key, STORM_MODEL, [
      { role: "system", content: STORM_PROMPT + "\n\nCorrija obrigatoriamente os problemas estáticos informados. Retorne o código completo, em um único bloco Lua, com até 4096 caracteres." },
      { role: "user", content: "PEDIDO ORIGINAL:\n" + messages[messages.length - 1].content + "\n\nRESPOSTA A CORRIGIR:\n" + answer + "\n\nPROBLEMAS:\n" + issues.join("\n") },
    ], 0.05);
    issues = luaIssues(answer);
  }
  if (issues.length) throw new Error("A verificação estática do Stormworks ainda encontrou problemas: " + issues.join(" "));
  return answer + "\n\n_Análise estática Lua aprovada: limite de 4.096 caracteres por bloco, APIs bloqueadas e callback onTick/onDraw verificados. A execução real ainda deve ser conferida dentro do Stormworks._";
}

async function image(messages: Array<{role:"user"|"assistant";content:string}>) {
  const imageKey = Deno.env.get("POLLINATIONS_API_KEY");
  const promptKey = Deno.env.get("STORMWORKS_PRIMARY_API_KEY");
  if (!imageKey) throw new Error("Falta POLLINATIONS_API_KEY no servidor.");
  if (!promptKey) throw new Error("Falta STORMWORKS_PRIMARY_API_KEY para o modelo de interpretação visual.");

  const latest = messages[messages.length - 1]?.content?.trim() ?? "";
  if (!latest) throw new Error("Descreva a imagem que deseja gerar.");

  // Só reutiliza o histórico quando o usuário pede explicitamente continuidade visual.
  const asksForContinuity = /\b(?:mesm[oa]s?\s+(?:personagem|pessoa|rosto|roupa|cen[aá]rio|estilo|rob[oô]|animal)|continue|continua(?:r)?|continua[cç][aã]o|imagem\s+anterior|foto\s+anterior|igual\s+[àa]\s+anterior|mantenha\s+(?:o|a)\s+(?:mesm[oa]|visual|apar[eê]ncia)|n[aã]o\s+mude)\b/i.test(latest);
  const context = asksForContinuity
    ? messages.slice(-7, -1).map((m) => (m.role === "user" ? "Pedido anterior: " : "Referência anterior: ") + m.content).join("\n").slice(-5000)
    : "";

  const visualBrief = context
    ? "CONTEXTO PARA CONTINUIDADE VISUAL (use apenas o que for relevante):\n" + context + "\n\nNOVO PEDIDO, QUE TEM PRIORIDADE:\n" + latest
    : latest;

  // Modelo 1: interpreta o pedido e o converte em uma descrição visual precisa.
  const refinedPrompt = await openAI(GROQ, promptKey, IMAGE_PROMPT_MODEL, [
    {
      role: "system",
      content: "Você é um tradutor de instruções visuais extremamente fiel. Sua prioridade absoluta é obedecer ao pedido, não embelezá-lo nem torná-lo mais convencional. Antes de escrever, extraia mentalmente cada requisito e preserve TODOS: objetos e quantidades exatas, características, cores, roupas, proporções, posições relativas, orientação, ações, cenário, época, estilo, enquadramento, perspectiva, iluminação e quaisquer relações espaciais. Não substitua objetos por similares. Não adicione personagens, objetos, textos, acessórios, cenários ou efeitos que não foram pedidos. Não remova detalhes aparentemente estranhos. Para pedidos aleatórios, absurdos, contraditórios ou surrealistas, mantenha a combinação exatamente como foi solicitada em vez de corrigi-la. Descreva relações espaciais como acima, abaixo, dentro, fora e à esquerda de forma explícita. Separe o prompt em: SUBJECTS AND EXACT COUNT; APPEARANCE; ACTIONS AND SPATIAL RELATIONSHIPS; ENVIRONMENT; CAMERA AND COMPOSITION; LIGHTING AND STYLE; MUST INCLUDE; MUST NOT INCLUDE. Use frases concretas e sem ambiguidades. Não transforme uma solicitação simples em uma cena cinematográfica genérica. Se houver texto, preserve cada palavra e a grafia literal. Retorne somente o prompt final, sem comentários, sem alternativas e sem inventar conteúdo."
    },
    { role: "user", content: visualBrief }
  ], 0.25, {}, 1800);

  if (!refinedPrompt.trim()) throw new Error("O modelo de interpretação visual não retornou um prompt.");

  // Modelo 2: gera a imagem usando o prompt interpretado pelo primeiro modelo.
  const res = await fetch("https://gen.pollinations.ai/v1/images/generations", {
    method: "POST",
    headers: { Authorization: "Bearer " + imageKey, "Content-Type": "application/json" },
    body: JSON.stringify({ model: IMAGE_MODEL, prompt: refinedPrompt.slice(0, 7000), n: 1, size: "1024x1024", response_format: "url" }),
  });
  const raw = await res.text();
  let data: any = {};
  try { data = JSON.parse(raw); } catch {}
  if (!res.ok) throw new Error("Pollinations HTTP " + res.status + ": " + errText(data.error ?? raw.slice(0, 350)));
  const url = data?.data?.[0]?.url;
  if (typeof url !== "string" || !url.startsWith("https://")) throw new Error("Pollinations não retornou uma URL pública válida.");
  return { url, refinedPrompt };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  try {
    await authorize(req);
    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.messages)) return json({ error: "Envie messages[]." }, 400);
    const requestedMode = body.mode;
    if (!["auto", "general", "stormworks", "image", "personality"].includes(requestedMode)) return json({ error: "Modo inválido." }, 400);
    const messages: Array<{role:"user"|"assistant";content:string}> = [];
    let total = 0;
    for (const item of body.messages.slice(-40)) {
      if ((item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string") continue;
      const content = item.content.slice(0, 16000);
      total += content.length;
      if (total > 90000) return json({ error: "Histórico muito longo. Inicie conversa nova." }, 413);
      messages.push({ role: item.role, content });
    }
    if (!messages.length || messages[messages.length - 1].role !== "user") return json({ error: "A última mensagem deve ser do usuário." }, 400);

    const mode: WorkMode = requestedMode === "auto" ? resolveMode(messages[messages.length - 1].content) : requestedMode;
    const effortSettings = body.effortByMode && typeof body.effortByMode === "object" ? body.effortByMode : {};
    const effort: EffortLevel = isEffortLevel(effortSettings[mode]) ? effortSettings[mode] : "medium";

    if (mode === "image") {
      const generated = await image(messages);
      return json({ image_url: generated.url, model: IMAGE_MODEL, prompt_model: IMAGE_PROMPT_MODEL, enhanced_prompt: generated.refinedPrompt, selected_mode: mode, effort: "n/a" });
    }
    if (mode === "stormworks") return json({ answer: await stormworks(messages, effort), model: STORM_MODEL, selected_mode: mode, effort });
    if (mode === "personality") {
      const key = Deno.env.get("PERSONALITY_API_KEY");
      if (!key) return json({ error: "Falta PERSONALITY_API_KEY (OpenRouter)." }, 503);
      const headers = { "HTTP-Referer": "https://ai-workbench.app", "X-Title": "AI Workbench Private" };
      const initial = await openAI(OPENROUTER, key, PERSONA_MODEL, [{ role: "system", content: PERSONALITY_PROMPT }, ...messages], 0.8, headers);
      const answer = await reviewAndImprove(OPENROUTER, key, PERSONA_MODEL, PERSONALITY_PROMPT, messages, initial, effort, headers, "personality");
      return json({ answer, model: PERSONA_MODEL, selected_mode: mode, effort });
    }
    const codeKey = Deno.env.get("CODE_API_KEY");
    if (!codeKey) return json({ error: "Falta CODE_API_KEY (Groq)." }, 503);

    const latestPrompt = messages[messages.length - 1].content;
    const wantsCode = isCodeRequest(latestPrompt);
    const systemPrompt = wantsCode ? CODE_PROMPT : CHAT_PROMPT;
    const initial = await openAI(
      GROQ,
      codeKey,
      CODE_MODEL,
      [{ role: "system", content: systemPrompt }, ...messages],
      wantsCode ? 0.2 : 0.65,
      {},
      wantsCode ? 8192 : 1100,
    );

    if (!wantsCode) {
      return json({
        answer: initial,
        model: CODE_MODEL,
        selected_mode: mode,
        answer_kind: "conversation",
        effort: "n/a",
      });
    }

    const answer = await reviewAndImprove(GROQ, codeKey, CODE_MODEL, CODE_PROMPT, messages, initial, effort);
    return json({ answer, model: CODE_MODEL, selected_mode: mode, answer_kind: "code", effort });
  } catch (error) {
    const message = errText(error);
    const status = /sessão ausente|sessão inválida/i.test(message) ? 401 : /acesso negado/i.test(message) ? 403 : /Falta .*API_KEY/i.test(message) ? 503 : 502;
    console.error("chat-ai:", message);
    return json({ error: message }, status);
  }
});