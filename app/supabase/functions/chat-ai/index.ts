import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const OWNER = "lorenzosella99@gmail.com";
const GROQ = "https://api.groq.com/openai/v1/chat/completions";
const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
const STORM_MODEL = "qwen/qwen3.8-27b";
const CODE_MODEL = "openai/gpt-oss-120b";
const PERSONA_MODEL = "openrouter/free";
const IMAGE_MODEL = "black-forest-labs/flux.1-schnell";
const GENERAL_PROMPT = "Você é o AI Workbench, engenheiro full-stack sênior. Ajude com TypeScript, JavaScript, Python, SQL, APIs, arquitetura, segurança, testes e desenvolvimento web. Entregue código completo e executável, com validação, tratamento de erros e instruções. Não invente testes que não executou. Priorize soluções corretas, legíveis e seguras.";
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
async function openAI(url: string, key: string, model: string, messages: Array<{ role: string; content: string }>, temperature = 0.2, extraHeaders: Record<string, string> = {}) {
  const res = await fetch(url, { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", ...extraHeaders }, body: JSON.stringify({ model, messages, temperature, max_tokens: 8192, stream: false }) });
  const raw = await res.text();
  let data: any = {};
  try { data = JSON.parse(raw); } catch {}
  if (!res.ok) throw new Error(model + " HTTP " + res.status + ": " + errText(data.error ?? raw.slice(0, 350)));
  const answer = data?.choices?.[0]?.message?.content;
  if (typeof answer !== "string" || !answer.trim()) throw new Error(model + " retornou resposta vazia.");
  return answer.trim();
}
function luaBlocks(text: string) {
  const pattern = /```(?:lua)?[^\S\r\n]*\r?\n([\s\S]*?)```/gi;
  return [...text.matchAll(pattern)].map((match) => match[1].replace(/\r?\n$/, ""));
}
function analyzeLua(code: string) {
  const masked = code
    .replace(/--\[\[[\s\S]*?\]\]/g, (value) => value.replace(/[^\r\n]/g, " "))
    .replace(/--[^\r\n]*/g, (value) => " ".repeat(value.length))
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (value) => value.replace(/[^\r\n]/g, " "));
  const errors: string[] = [];
  const warnings: string[] = [];
  const count = Array.from(code).length;
  if (count > 4096) errors.push(`bloco com ${count} caracteres (máximo 4096)`);
  const blocked = masked.match(/\b(?:os|io|package|debug)\s*[.:]|\b(?:require|dofile|loadfile)\s*\(/gi);
  if (blocked?.length) errors.push("API não permitida: " + [...new Set(blocked.map((item) => item.trim()))].join(", "));
  const stack: string[] = [];
  for (const token of masked.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
    const word = token[0].toLowerCase();
    if (["function", "if", "do", "repeat"].includes(word)) stack.push(word);
    else if (word === "end") {
      if (!stack.length || stack[stack.length - 1] === "repeat") { errors.push("end sem bloco compatível"); break; }
      stack.pop();
    } else if (word === "until") {
      if (stack[stack.length - 1] !== "repeat") { errors.push("until sem repeat correspondente"); break; }
      stack.pop();
    }
  }
  if (stack.length) errors.push("bloco não fechado: " + stack[stack.length - 1]);
  const delimiters: string[] = [];
  const pair: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  for (const char of masked) {
    if (["(", "[", "{"].includes(char)) delimiters.push(char);
    if ([")", "]", "}"].includes(char)) {
      if (delimiters.pop() !== pair[char]) { errors.push("parênteses ou delimitadores incompatíveis"); break; }
    }
  }
  if (delimiters.length) errors.push("delimitador não fechado");
  if (/\/\s*0+(?:\.0*)?(?![\d.])/.test(masked)) warnings.push("possível divisão por literal zero");
  const channels = [...masked.matchAll(/\b(?:input\.(?:getNumber|getBool)|output\.setNumber|output\.setBool)\s*\(\s*(-?\d+)/gi)];
  if (channels.some((match) => Number(match[1]) < 1 || Number(match[1]) > 32)) warnings.push("canal fora da faixa 1–32; confira a numeração");
  if (!/\bfunction\s+onTick\s*\(/.test(masked) && !/\bfunction\s+onDraw\s*\(/.test(masked)) warnings.push("callback onTick() ou onDraw() não identificado");
  return { errors, warnings };
}
async function stormworks(messages: Array<{role:"user"|"assistant";content:string}>) {
  const key = Deno.env.get("STORMWORKS_PRIMARY_API_KEY");
  if (!key) throw new Error("Falta STORMWORKS_PRIMARY_API_KEY para a geração de Lua.");
  const context = messages.map((m) => ({ role: m.role, content: m.content }));
  const answer = await openAI(GROQ, key, STORM_MODEL, [{ role: "system", content: STORM_PROMPT }, ...context], 0.12);
  const blocks = luaBlocks(answer);
  if (!blocks.length) throw new Error("A resposta não trouxe um bloco Markdown Lua. Peça explicitamente o código completo.");
  const reports = blocks.map((code, index) => ({ index: index + 1, ...analyzeLua(code) }));
  const errors = reports.flatMap((report) => report.errors.map((item) => `bloco ${report.index}: ${item}`));
  const warnings = reports.flatMap((report) => report.warnings.map((item) => `bloco ${report.index}: ${item}`));
  if (errors.length) throw new Error("A análise local encontrou problemas que impedem entregar o código: " + errors.join("; ") + ". Peça uma versão corrigida e mais simples.");
  const reportText = warnings.length
    ? "\n\n**Análise estática local (sem Gemini):**\n" + warnings.map((item) => "- " + item).join("\n")
    : "\n\n**Análise estática local (sem Gemini):** sem problemas estruturais básicos detectados.";
  return answer + reportText + "\n\n_A análise não executa o código no Stormworks e não garante que todas as APIs ou a lógica estejam corretas. Teste na montagem real._";
}
async function image(prompt: string) {
  const key = Deno.env.get("POLLINATIONS_API_KEY");
  if (!key) throw new Error("Falta POLLINATIONS_API_KEY (Pollinations).");
  const res = await fetch("https://gen.pollinations.ai/v1/images/generations", { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" }, body: JSON.stringify({ model: IMAGE_MODEL, prompt, n: 1, size: "1024x1024", response_format: "url" }) });
  const raw = await res.text();
  let data: any = {};
  try { data = JSON.parse(raw); } catch {}
  if (!res.ok) throw new Error("Pollinations HTTP " + res.status + ": " + errText(data.error ?? raw.slice(0, 350)));
  const url = data?.data?.[0]?.url;
  if (typeof url !== "string" || !url.startsWith("https://")) throw new Error("Pollinations não retornou URL pública. Confira saldo e permissões.");
  return url;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  try {
    await authorize(req);
    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.messages)) return json({ error: "Envie messages[]." }, 400);
    const mode = body.mode;
    if (!["general", "stormworks", "image", "personality"].includes(mode)) return json({ error: "Modo inválido." }, 400);
    const messages: Array<{role:"user"|"assistant";content:string}> = [];
    let total = 0;
    for (const item of body.messages.slice(-24)) {
      if ((item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string") continue;
      const content = item.content.slice(0, 16000);
      total += content.length;
      if (total > 60000) return json({ error: "Histórico muito longo. Inicie conversa nova." }, 413);
      messages.push({ role: item.role, content });
    }
    if (!messages.length || messages[messages.length - 1].role !== "user") return json({ error: "A última mensagem deve ser do usuário." }, 400);
    if (mode === "image") return json({ image_url: await image(messages[messages.length - 1].content), model: IMAGE_MODEL });
    if (mode === "stormworks") return json({ answer: await stormworks(messages), model: STORM_MODEL, validator: "lua-static-v1" });
    if (mode === "personality") {
      const key = Deno.env.get("PERSONALITY_API_KEY");
      if (!key) return json({ error: "Falta PERSONALITY_API_KEY (OpenRouter)." }, 503);
      const answer = await openAI(OPENROUTER, key, PERSONA_MODEL, [{ role: "system", content: PERSONALITY_PROMPT }, ...messages], 0.8, { "HTTP-Referer": "https://ai-workbench.app", "X-Title": "AI Workbench Private" });
      return json({ answer, model: PERSONA_MODEL });
    }
    const codeKey = Deno.env.get("CODE_API_KEY");
    if (!codeKey) return json({ error: "Falta CODE_API_KEY (Groq)." }, 503);
    const answer = await openAI(GROQ, codeKey, CODE_MODEL, [{ role: "system", content: GENERAL_PROMPT }, ...messages], 0.2);
    return json({ answer, model: CODE_MODEL });
  } catch (error) {
    const message = errText(error);
    const status = /sessão ausente|sessão inválida/i.test(message) ? 401 : /acesso negado/i.test(message) ? 403 : /Falta .*API_KEY/i.test(message) ? 503 : 502;
    console.error("chat-ai:", message);
    return json({ error: message }, status);
  }
});
