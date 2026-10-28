// =====================================================================
// instagram-webhook: o cérebro.
// Recebe os eventos do Instagram (comentários, mensagens, toques em
// botão) e responde sozinho.
//
// PRECISA SER PÚBLICA: publique com  --no-verify-jwt
// No Meta, assine os campos: comments, messages, messaging_postbacks.
// =====================================================================
import {
  afterStep, db, escolheRespostaPublica, findStep, firstStep, IG_ACCOUNT_ID, logDelivery,
  marcaProcessado, replyComment, sendMessage, sendStep, tipoDoPasso,
} from "../_shared/ig.ts";

const VERIFY_TOKEN = Deno.env.get("VERIFY_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("APP_SECRET") ?? "";
const APP_SECRET_ENFORCE = (Deno.env.get("APP_SECRET_ENFORCE") ?? "false").toLowerCase() === "true";
const TEST_IG_ACCOUNTS = (Deno.env.get("TEST_IG_ACCOUNTS") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // -------------------------------------------------------------------
  // a) Verificação (GET): o aperto de mão com o Meta.
  // -------------------------------------------------------------------
  if (req.method === "GET") {
    if (url.searchParams.get("hub.mode") === "subscribe" &&
        url.searchParams.get("hub.verify_token") === VERIFY_TOKEN && VERIFY_TOKEN) {
      return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
    }
    return new Response("Token de verificação inválido", { status: 403 });
  }
  if (req.method !== "POST") return new Response("ok");

  // -------------------------------------------------------------------
  // b) Recebimento (POST): confere a assinatura.
  // Com APP_SECRET_ENFORCE=false (padrão), assinatura inválida só gera
  // aviso no log. Depois de testar, ligue a trava (true).
  // -------------------------------------------------------------------
  const raw = await req.text();
  const assinaturaOk = await assinaturaValida(raw, req.headers.get("x-hub-signature-256"));
  if (!assinaturaOk) {
    if (APP_SECRET_ENFORCE) return new Response("Assinatura inválida", { status: 401 });
    console.warn("AVISO: assinatura inválida ou ausente (modo teste, processando mesmo assim).");
  }

  let body: any;
  try { body = JSON.parse(raw); } catch { return new Response("ok"); }

  // Processa tudo e sempre devolve 200 (senão o Meta fica reenviando).
  for (const entry of body?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field === "comments") {
        try { await handleComment(change.value); } catch (e) { console.error("erro no comentário:", e); }
      }
    }
    for (const ev of entry.messaging ?? []) {
      try { await handleMessage(ev); } catch (e) { console.error("erro na mensagem:", e); }
    }
  }
  return new Response("ok");
});

// =====================================================================
// Assinatura HMAC SHA-256 (header x-hub-signature-256 = "sha256=...").
// =====================================================================
async function assinaturaValida(raw: string, header: string | null) {
  if (!APP_SECRET || !header) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(raw));
  const esperado = "sha256=" + [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (esperado.length !== header.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ header.charCodeAt(i);
  return dif === 0;
}

// Normaliza texto: minúsculas e sem acento ("Quéro" = "quero").
const normaliza = (t: string) => (t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// =====================================================================
// COMENTÁRIO
// =====================================================================
async function handleComment(v: any) {
  const commentId: string = v?.id;
  const userId: string = v?.from?.id;
  const username: string = v?.from?.username ?? "";
  const mediaId: string = v?.media?.id ?? "";
  const texto: string = v?.text ?? "";
  if (!commentId || !userId) return;

  // 1) Ignora duplicados.
  if (!(await marcaProcessado(`comment:${commentId}`))) return;

  // 2) Ignora comentário da própria conta (inclusive as respostas públicas do robô).
  if (IG_ACCOUNT_ID && userId === IG_ACCOUNT_ID) return;

  // 3) Acha a automação (palavra-chave ou "qualquer palavra" + post).
  const { data: autos } = await db.from("ig_automations").select("*").eq("active", true)
    .order("updated_at", { ascending: false });
  const t = normaliza(texto);
  let keywordCasada = "";
  const auto = (autos ?? []).find((a: any) => {
    const media: string[] = a.media_ids ?? [];
    if (media.length && !media.includes(mediaId)) return false;
    if (a.match_any) { keywordCasada = "*"; return true; }
    const palavras = String(a.keyword ?? "").split(",").map(normaliza).filter(Boolean);
    const achou = palavras.find((p) => new RegExp(`(^|[^a-z0-9])${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(t));
    if (achou) { keywordCasada = achou; return true; }
    return false;
  });
  if (!auto) return;

  // 4) Regra do "1 por dia" (contas de teste ignoram).
  if (!TEST_IG_ACCOUNTS.includes(userId)) {
    const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await db.from("ig_deliveries").select("id", { count: "exact", head: true })
      .eq("ig_user_id", userId).eq("canal", "private_reply").in("status", ["ok", "na_fila"]).gte("ts", desde);
    if ((count ?? 0) > 0) { console.log(`pulando ${userId}: já recebeu DM nas últimas 24h`); return; }
  }

  // 5) Entrega.
  const resultado = await deliverAutomation(auto, { commentId, userId, username, keyword: keywordCasada });

  if (resultado === "sent" || resultado === "throttled") {
    const resposta = escolheRespostaPublica(auto);
    if (resposta) {
      const r = await replyComment(commentId, resposta);
      if (!r.ok) console.warn("falha na resposta pública:", r.error);
    }
    // Só marca o lead se saiu ou está garantido na fila.
    await db.from("ig_leads").upsert({
      ig_user_id: userId,
      username,
      last_source: "comment",
      last_keyword: keywordCasada,
      automation_id: auto.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "ig_user_id" });
  }
}

// =====================================================================
// ENTREGA (sempre pelo fluxo: manda o primeiro passo).
// Passa pelo FREIO antes de responder o comentário no privado.
// =====================================================================
async function deliverAutomation(
  auto: any,
  p: { commentId: string; userId: string; username: string; keyword: string },
): Promise<"sent" | "throttled" | "error"> {
  const step = firstStep(auto);
  if (!step) {
    await logDelivery({ ig_user_id: p.userId, automation_id: auto.id, canal: "private_reply", tipo: "text", status: "erro", motivo: "automação sem mensagem" });
    return "error";
  }

  // FREIO: sem ficha, vai pra fila.
  const { data: podeEnviar, error: erroFreio } = await db.rpc("take_send_slot", { p_key: "private_reply" });
  if (erroFreio) console.error("ERRO NO FREIO (rodou o 02_freio.sql?):", erroFreio.message);
  if (!podeEnviar) {
    const { error } = await db.from("ig_send_queue").upsert({
      comment_id: p.commentId, automation_id: auto.id, ig_user_id: p.userId, username: p.username, keyword: p.keyword,
    }, { onConflict: "comment_id", ignoreDuplicates: true });
    if (error) {
      console.error("não consegui colocar na fila:", error.message);
      return "error";
    }
    await logDelivery({ ig_user_id: p.userId, automation_id: auto.id, canal: "private_reply", tipo: tipoDoPasso(step), status: "na_fila", motivo: "freio de envio" });
    return "throttled";
  }

  const res = await sendStep({ comment_id: p.commentId }, auto, step);
  await db.rpc("record_send_result", { p_key: "private_reply", p_ok: res.ok, p_hard: !!res.hard });
  await logDelivery({
    ig_user_id: p.userId, automation_id: auto.id, canal: "private_reply", tipo: tipoDoPasso(step),
    status: res.ok ? "ok" : "erro", motivo: res.ok ? null : res.error,
  });
  if (!res.ok) return "error";

  // Obs: depois da resposta privada, o Instagram só libera novas
  // mensagens quando a pessoa responder. Por isso arquivos da Mensagem 1
  // podem ser recusados aqui (fica registrado no log da função).
  await afterStep(p.userId, auto, step);
  return "sent";
}

// =====================================================================
// MENSAGEM / POSTBACK / QUICK_REPLY
// =====================================================================
async function handleMessage(ev: any) {
  const senderId: string = ev?.sender?.id;
  if (!senderId) return;

  // Echo = mensagem que a PRÓPRIA conta mandou. Ignora sempre.
  if (ev.message?.is_echo) {
    const { data } = await db.from("ig_bot_sends").select("mid").eq("mid", ev.message.mid).maybeSingle();
    if (!data) console.log("echo de resposta manual sua (não foi o robô), ignorando.");
    return;
  }
  if (IG_ACCOUNT_ID && senderId === IG_ACCOUNT_ID) return;

  // Anti-duplicado.
  const mid = ev.message?.mid ?? ev.postback?.mid ?? `${senderId}:${ev.timestamp}`;
  if (!(await marcaProcessado(`msg:${mid}`))) return;

  // Toque em botão: chega como postback OU como quick_reply. Trata os dois.
  const payload: string = ev.postback?.payload ?? ev.message?.quick_reply?.payload ?? "";
  if (payload.startsWith("STEP:")) {
    const [, autoId, stepId] = payload.split(":");
    const { data: auto } = await db.from("ig_automations").select("*").eq("id", autoId).maybeSingle();
    if (!auto || !auto.active) return;
    const step = findStep(auto, stepId);
    if (!step) return;
    await enviaPassoPorDM(senderId, auto, step);
    return;
  }

  // Texto solto: só importa se um passo pediu um dado (email/telefone).
  const texto: string = ev.message?.text ?? "";
  if (!texto) return;
  const { data: lead } = await db.from("ig_leads").select("*").eq("ig_user_id", senderId).maybeSingle();
  const exp = lead?.expecting;
  if (!exp?.field) return; // silêncio: não bate com nada

  const valor = texto.trim();
  if (!dadoValido(exp.field, valor)) {
    const pedido = exp.field === "email"
      ? "Hmm, esse e-mail parece estranho. Pode mandar de novo?"
      : "Hmm, esse número parece estranho. Pode mandar de novo, com DDD?";
    await sendMessage({ id: senderId }, { text: pedido });
    return;
  }

  const update: Record<string, unknown> = { expecting: null, updated_at: new Date().toISOString(), last_source: "dm" };
  if (exp.field === "email") update.email = valor.toLowerCase();
  else if (exp.field === "telefone") update.telefone = valor;
  else update.dados = { ...(lead.dados ?? {}), [exp.field]: valor };
  await db.from("ig_leads").update(update).eq("ig_user_id", senderId);

  // Segue o fluxo.
  const { data: auto } = await db.from("ig_automations").select("*").eq("id", exp.automation_id).maybeSingle();
  const proximo = auto && exp.next !== null && exp.next !== undefined ? findStep(auto, exp.next) : null;
  if (proximo) await enviaPassoPorDM(senderId, auto, proximo);
  else await sendMessage({ id: senderId }, { text: "Recebi, obrigado!" });
}

async function enviaPassoPorDM(userId: string, auto: any, step: any) {
  const res = await sendStep({ id: userId }, auto, step);
  await logDelivery({
    ig_user_id: userId, automation_id: auto.id, canal: "dm", tipo: tipoDoPasso(step),
    status: res.ok ? "ok" : "erro", motivo: res.ok ? null : res.error,
  });
  if (!res.ok) return;
  await afterStep(userId, auto, step);
  await db.from("ig_leads").update({ last_source: "dm" }).eq("ig_user_id", userId);
}

function dadoValido(campo: string, v: string) {
  if (campo === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  if (campo === "telefone") return v.replace(/\D/g, "").length >= 10;
  return v.length > 0;
}
