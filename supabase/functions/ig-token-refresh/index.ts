// =====================================================================
// ig-token-refresh: renova o token long-lived (~60 dias).
// Roda 1x por semana (pg_cron). Protegido por x-sched-key = SCHED_SECRET.
// Publique com  --no-verify-jwt  (quem protege é o SCHED_SECRET).
//
// Atenção: este endpoint NÃO leva a versão no caminho (é diferente das
// outras chamadas): https://graph.instagram.com/refresh_access_token
// =====================================================================
import { db, ehTokenFacebook, getToken, json, schedAutorizado } from "../_shared/ig.ts";

Deno.serve(async (req) => {
  if (!schedAutorizado(req)) return json({ erro: "não autorizado" }, 401);

  const agora = new Date().toISOString();
  try {
    const token = await getToken();
    if (!token) throw new Error("IG_ACCESS_TOKEN não configurado");

    // Token do Facebook (EAA...): troca por um novo de 60 dias usando o app.
    // Token do Instagram (IGAA...): estende pelo refresh_access_token.
    let url: string;
    if (ehTokenFacebook(token)) {
      const appId = Deno.env.get("META_APP_ID") ?? "";
      const secret = Deno.env.get("APP_SECRET") ?? "";
      if (!appId || !secret) throw new Error("META_APP_ID ou APP_SECRET não configurado");
      url = `https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}` +
        `&client_secret=${secret}&fb_exchange_token=${encodeURIComponent(token)}`;
    } else {
      url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`;
    }
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data?.error?.message ?? `HTTP ${res.status}`);

    const expiresAt = new Date(Date.now() + Number(data.expires_in ?? 60 * 86400) * 1000).toISOString();
    // Guarda o token novo no banco: as funções passam a usar ele.
    await db.from("ig_token_status").upsert({
      id: "main",
      access_token: data.access_token,
      expires_at: expiresAt,
      last_ok: true,
      last_error: null,
      last_refreshed_at: agora,
      updated_at: agora,
    });
    return json({ ok: true, expires_at: expiresAt });
  } catch (e) {
    await db.from("ig_token_status").upsert({ id: "main", last_ok: false, last_error: String(e), updated_at: agora });
    return json({ ok: false, erro: String(e) }, 500);
  }
});
