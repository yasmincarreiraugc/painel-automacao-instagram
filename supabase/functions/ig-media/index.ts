// =====================================================================
// ig-media: lista os posts da conta (com miniatura), pro seletor
// "Em quais posts" do editor. Só usuário logado no painel pode chamar.
// =====================================================================
import { CORS, IG_ACCOUNT_ID, igGet, json, usuarioLogado } from "../_shared/ig.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await usuarioLogado(req))) return json({ erro: "não autorizado" }, 401);

  const conta = IG_ACCOUNT_ID || "me";
  const r = await igGet(`/${conta}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=50`);
  if (!r.ok) return json({ connected: false, erro: r.error });

  const posts = (r.data?.data ?? []).map((m: any) => ({
    id: m.id,
    legenda: (m.caption ?? "").slice(0, 120),
    tipo: m.media_type,
    miniatura: m.media_type === "VIDEO" ? (m.thumbnail_url ?? m.media_url) : m.media_url,
    link: m.permalink,
    data: m.timestamp,
  }));
  return json({ connected: true, posts });
});
