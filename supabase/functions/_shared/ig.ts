// =====================================================================
// _shared/ig.ts
// Peças comuns usadas por todas as Edge Functions:
//   - conexão com o banco (service_role, ignora o RLS)
//   - chamadas à API do Instagram
//   - sendStep: envia um passo da conversa com os botões ANEXADOS
//     (button template), com fallback pra pílula (quick_reply) e texto.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm prontas no ambiente
// das Edge Functions do Supabase.
export const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

export const IG_ACCOUNT_ID = Deno.env.get("IG_ACCOUNT_ID") ?? "";
const VERSAO = Deno.env.get("GRAPH_API_VERSION") || "v21.0";

// O tipo do token decide qual API usar:
//   IGAA... (login do Instagram) -> graph.instagram.com
//   EAA...  (login do Facebook)  -> graph.facebook.com
export const ehTokenFacebook = (token: string) => token.startsWith("EAA");
export const graphBase = (token: string) =>
  `https://graph.${ehTokenFacebook(token) ? "facebook" : "instagram"}.com/${VERSAO}`;

// Cabeçalhos de CORS (pras funções que o painel chama).
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------
// Token: usa o token renovado guardado no banco (ig_token_status), e se
// não tiver, o IG_ACCESS_TOKEN do ambiente.
// ---------------------------------------------------------------------
let tokenCache: string | null = null;
export async function getToken(): Promise<string> {
  if (tokenCache) return tokenCache;
  const { data } = await db.from("ig_token_status").select("access_token").eq("id", "main").maybeSingle();
  tokenCache = data?.access_token || Deno.env.get("IG_ACCESS_TOKEN") || "";
  return tokenCache;
}

export type IgResult = { ok: boolean; data?: any; error?: string; hard?: boolean };

// Erros "duros": limite/bloqueio do Instagram. Alimentam o disjuntor.
const HARD_CODES = [4, 17, 32, 368, 613];

async function igFetch(method: "GET" | "POST", path: string, body?: unknown): Promise<IgResult> {
  try {
    const token = await getToken();
    const res = await fetch(`${graphBase(token)}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) {
      const e = data?.error ?? {};
      return {
        ok: false,
        data,
        error: `${e.code ?? res.status}/${e.error_subcode ?? "-"}: ${e.message ?? "erro desconhecido"}`,
        hard: HARD_CODES.includes(Number(e.code)),
      };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export const igGet = (path: string) => igFetch("GET", path);
export const igPost = (path: string, body: unknown) => igFetch("POST", path, body);

// ---------------------------------------------------------------------
// Envio de mensagem. recipient = { comment_id } (resposta privada a um
// comentário) ou { id } (DM normal, dentro da janela de 24h).
// Grava o mid em ig_bot_sends pra reconhecer o "echo" depois.
// ---------------------------------------------------------------------
export async function sendMessage(recipient: Record<string, string>, message: unknown): Promise<IgResult> {
  const res = await igPost(`/${IG_ACCOUNT_ID || "me"}/messages`, { recipient, message });
  if (res.ok && res.data?.message_id) {
    await db.from("ig_bot_sends").insert({ mid: res.data.message_id, ig_user_id: res.data.recipient_id ?? null });
  }
  return res;
}

// Responde publicamente um comentário.
export function replyComment(commentId: string, text: string) {
  return igPost(`/${commentId}/replies`, { message: text });
}

// ---------------------------------------------------------------------
// Modelo da conversa (flow.steps).
// ---------------------------------------------------------------------
export type Button = { title?: string; next?: number | string | null; url?: string };
export type Step = {
  id: number | string;
  message: string;
  buttons?: Button[];
  assets?: string[];
  collect?: { field: string; next?: number | string | null };
  delay?: { seconds: number; next?: number | string | null };
};

export const firstStep = (auto: any): Step | null => auto?.flow?.steps?.[0] ?? null;
export const findStep = (auto: any, id: unknown): Step | null =>
  (auto?.flow?.steps ?? []).find((s: Step) => String(s.id) === String(id)) ?? null;

const temNext = (b: Button) => b.next !== undefined && b.next !== null && b.next !== "";
const corta = (t: string | undefined, fallback: string) => (t || fallback).slice(0, 20); // Instagram corta em 20

// ---------------------------------------------------------------------
// sendStep: o pulo do gato dos botões.
//   - Botão com url  -> web_url (abre o site)
//   - Botão com next -> postback com payload STEP:idDaAutomacao:proximoPasso
//   - Botão sem destino -> DESCARTADO (não envia pílula morta)
// Tenta 1) button template (botões anexados ao balão, máx. 3)
//       2) quick_reply (pílulas, até 13; links vão no texto)
//       3) texto puro (com os links no texto)
// ---------------------------------------------------------------------
export async function sendStep(recipient: Record<string, string>, auto: any, step: Step): Promise<IgResult> {
  const buttons = (step.buttons ?? [])
    .filter((b) => b.url || temNext(b))
    .map((b) =>
      b.url
        ? { type: "web_url", url: b.url, title: corta(b.title, "Acessar") }
        : { type: "postback", title: corta(b.title, "Continuar"), payload: `STEP:${auto.id}:${b.next}` }
    );

  const text = step.message || " ";
  if (!buttons.length) return await sendMessage(recipient, { text });

  // 1) Botões anexados (button template).
  let res = await sendMessage(recipient, {
    attachment: {
      type: "template",
      payload: { template_type: "button", text: text.slice(0, 640), buttons: buttons.slice(0, 3) },
    },
  });
  if (res.ok || res.hard) return res; // erro duro: não adianta insistir
  console.warn("button template recusado, tentando quick_reply:", res.error);

  // 2) Pílulas (quick_reply). Link não vira pílula: vai no texto.
  const links = buttons.filter((b: any) => b.type === "web_url") as any[];
  const posts = buttons.filter((b: any) => b.type === "postback") as any[];
  const textoComLinks = text + links.map((l) => `\n${l.title}: ${l.url}`).join("");
  if (posts.length) {
    res = await sendMessage(recipient, {
      text: textoComLinks,
      quick_replies: posts.slice(0, 13).map((p) => ({ content_type: "text", title: p.title, payload: p.payload })),
    });
    if (res.ok || res.hard) return res;
    console.warn("quick_reply recusado, tentando texto puro:", res.error);
  }

  // 3) Texto puro (a mensagem nunca deixa de chegar).
  return await sendMessage(recipient, { text: textoComLinks });
}

// Envia os arquivos de um passo (pela DM, pro id da pessoa).
export async function sendAssets(userId: string, assetIds: string[] = []) {
  if (!assetIds.length) return;
  const { data: assets } = await db.from("ig_assets").select("*").in("id", assetIds);
  for (const a of assets ?? []) {
    const payload = a.attachment_id ? { attachment_id: a.attachment_id } : { url: a.public_url, is_reusable: true };
    const res = await sendMessage({ id: userId }, { attachment: { type: a.tipo, payload } });
    if (!res.ok) console.warn("falha ao enviar arquivo", a.nome, res.error);
    else if (!a.attachment_id && res.data?.attachment_id) {
      await db.from("ig_assets").update({ attachment_id: res.data.attachment_id }).eq("id", a.id);
    }
  }
}

// ---------------------------------------------------------------------
// afterStep: o que acontece DEPOIS de um passo sair com sucesso:
// arquivos, coleta de dado, envio com atraso e atualização do lead.
// ---------------------------------------------------------------------
export async function afterStep(userId: string, auto: any, step: Step) {
  await sendAssets(userId, step.assets);

  const lead: Record<string, unknown> = {
    ig_user_id: userId,
    automation_id: auto.id,
    flow_step: String(step.id),
    expecting: null,
    updated_at: new Date().toISOString(),
  };
  if ((step.buttons ?? []).some((b) => b.url)) lead.link_sent = true;
  if (step.collect?.field) {
    lead.expecting = { automation_id: auto.id, field: step.collect.field, next: step.collect.next ?? null };
  }
  await db.from("ig_leads").upsert(lead, { onConflict: "ig_user_id" });

  if (step.delay?.seconds && step.delay.next !== undefined && step.delay.next !== null) {
    await db.from("ig_scheduled").insert({
      ig_user_id: userId,
      automation_id: auto.id,
      step_id: String(step.delay.next),
      send_at: new Date(Date.now() + step.delay.seconds * 1000).toISOString(),
    });
  }
}

// Log de envio.
export function logDelivery(row: {
  ig_user_id: string; automation_id?: string | null; canal: string; tipo: string; status: string; motivo?: string | null;
}) {
  return db.from("ig_deliveries").insert(row);
}

// Tipo do conteúdo (pra o log): flow / link / text.
export function tipoDoPasso(step: Step) {
  const b = step.buttons ?? [];
  if (b.some(temNext)) return "flow";
  if (b.some((x) => x.url)) return "link";
  return "text";
}

// Escolhe a resposta pública (alternando entre as variações A/B).
export function escolheRespostaPublica(auto: any): string {
  const opcoes = [auto.public_reply, ...(auto.public_reply_variants ?? [])].filter((t: string) => t && t.trim());
  if (!opcoes.length) return "";
  return opcoes[Math.floor(Math.random() * opcoes.length)];
}

// Marca um evento como processado. Retorna false se já tinha sido.
export async function marcaProcessado(id: string): Promise<boolean> {
  const { error } = await db.from("ig_processed_events").insert({ id });
  return !error; // erro de chave duplicada = já processado
}

// Confere o header x-sched-key (robôs agendados).
export function schedAutorizado(req: Request) {
  const s = Deno.env.get("SCHED_SECRET");
  return !!s && req.headers.get("x-sched-key") === s;
}

// Confere se quem chamou é um usuário logado no painel.
export async function usuarioLogado(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data } = await db.auth.getUser(jwt);
  return data?.user ?? null;
}
