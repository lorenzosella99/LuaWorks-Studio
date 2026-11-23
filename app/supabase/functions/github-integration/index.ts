import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function encryptionKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("GITHUB_TOKEN_ENCRYPTION_KEY");
  if (!secret || secret.length < 32) throw new Error("Configure GITHUB_TOKEN_ENCRYPTION_KEY com pelo menos 32 caracteres.");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptToken(token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), encoder.encode(token));
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

async function decryptToken(payload: string): Promise<string> {
  const [version, ivPart, dataPart] = payload.split(".");
  if (version !== "v1" || !ivPart || !dataPart) throw new Error("Formato de token criptografado inválido.");
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivPart) },
    await encryptionKey(),
    fromBase64(dataPart),
  );
  return decoder.decode(clear);
}

function base64Utf8(value: string): string {
  return toBase64(encoder.encode(value));
}

async function githubFetch(url: string, token: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "AI-Workbench-App",
      ...(init.headers ?? {}),
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Entre na sua conta antes de continuar." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const legacyKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const publishedKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
    let dictionaryKey: string | undefined;
    if (publishedKeys) {
      try {
        const parsed = JSON.parse(publishedKeys);
        dictionaryKey = parsed.default ?? Object.values(parsed)[0] as string | undefined;
      } catch { /* formato legado ou ausente */ }
    }
    const supabaseKey = legacyKey ?? dictionaryKey;
    if (!supabaseUrl || !supabaseKey) return json({ error: "Configuração do Supabase incompleta." }, 500);

    // Cliente com JWT do próprio usuário: operações protegidas pelas políticas RLS.
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return json({ error: "Sessão inválida ou expirada." }, 401);
    if (authData.user.email?.trim().toLowerCase() !== "lorenzosella99@gmail.com") {
      return json({ error: "Acesso negado. Esta função é exclusiva da conta autorizada." }, 403);
    }
    const userId = authData.user.id;

    const body = await req.json().catch(() => null);
    if (!body || typeof body.action !== "string") return json({ error: "Ação ausente." }, 400);

    if (body.action === "status") {
      const { data, error } = await supabase
        .from("github_connections")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return json({ connected: Boolean(data) });
    }

    if (body.action === "set_token") {
      const token = typeof body.token === "string" ? body.token.trim() : "";
      if (token.length < 20 || token.length > 300) return json({ error: "Token inválido. Cole um Personal Access Token do GitHub." }, 400);
      const encrypted = await encryptToken(token);
      const { error } = await supabase.from("github_connections").upsert({
        user_id: userId,
        token_ciphertext: encrypted,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) throw error;
      return json({ saved: true });
    }

    if (body.action === "remove_token") {
      const { error } = await supabase.from("github_connections").delete().eq("user_id", userId);
      if (error) throw error;
      return json({ removed: true });
    }

    if (body.action === "save_file") {
      const repository = typeof body.repository === "string" ? body.repository.trim() : "";
      const filePath = typeof body.path === "string" ? body.path.trim().replace(/^\/+/, "") : "";
      const content = typeof body.content === "string" ? body.content : "";
      const commitMessage = typeof body.commitMessage === "string" ? body.commitMessage.trim().slice(0, 200) : "Save generated code";
      const repoMatch = repository.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
      if (!repoMatch) return json({ error: "Informe o repositório no formato usuario/repositorio." }, 400);
      if (!filePath || filePath.split("/").some((part: string) => !part || part === "." || part === "..")) {
        return json({ error: "Caminho de arquivo inválido." }, 400);
      }
      if (!content || content.length > 500000) return json({ error: "O código está vazio ou excede 500.000 caracteres." }, 400);

      const { data: row, error: readError } = await supabase
        .from("github_connections")
        .select("token_ciphertext")
        .eq("user_id", userId)
        .maybeSingle();
      if (readError) throw readError;
      if (!row?.token_ciphertext) return json({ error: "Conecte um token do GitHub nas configurações primeiro." }, 409);

      const token = await decryptToken(row.token_ciphertext);
      const owner = repoMatch[1];
      const repo = repoMatch[2];
      const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
      const fileUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`;

      // Ao atualizar arquivo existente, o GitHub exige o SHA atual.
      const existingResponse = await githubFetch(fileUrl, token);
      let sha: string | undefined;
      if (existingResponse.ok) {
        const existing = await existingResponse.json();
        sha = existing.sha;
      } else if (existingResponse.status !== 404) {
        const detail = await existingResponse.text();
        return json({ error: `Não foi possível acessar o repositório (${existingResponse.status}): ${detail.slice(0, 350)}` }, 502);
      }

      const payload: Record<string, unknown> = {
        message: commitMessage || "Save generated code",
        content: base64Utf8(content),
      };
      if (sha) payload.sha = sha;
      const saveResponse = await githubFetch(fileUrl, token, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const saveResult = await saveResponse.json().catch(() => ({}));
      if (!saveResponse.ok) {
        return json({ error: `GitHub recusou o commit (${saveResponse.status}): ${(saveResult as any)?.message ?? "erro desconhecido"}` }, 502);
      }
      return json({
        saved: true,
        html_url: (saveResult as any)?.content?.html_url ?? null,
        commit_sha: (saveResult as any)?.commit?.sha ?? null,
      });
    }

    return json({ error: "Ação não reconhecida." }, 400);
  } catch (error) {
    console.error("github-integration error:", error);
    return json({ error: error instanceof Error ? error.message : "Erro na integração GitHub." }, 500);
  }
});
