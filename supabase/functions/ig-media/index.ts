// =====================================================================
// ig-media: lista os posts da conta (com miniatura), pro seletor
// "Em quais posts" do editor e pras miniaturas da lista de automações.
// Corpo opcional { ids: [...] }: busca só esses posts (inclusive os mais
// antigos que os 50 últimos). Só usuário logado no painel pode chamar.
// =====================================================================
import { CORS, IG_ACCOUNT_ID, igGet, json, usuarioLogado } from "../_shared/ig.ts";

const CAMPOS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp";

const mapear = (m: any) => ({
  id: m.id,
  legenda: (m.caption ?? "").slice(0, 120),
  tipo: m.media_type,
  miniatura: m.media_type === "VIDEO" ? (m.thumbnail_url ?? m.media_url) : m.media_url,
  link: m.permalink,
  data: m.timestamp,
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await usuarioLogado(req))) return json({ erro: "não autorizado" }, 401);

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const ids: string[] = Array.isArray(body?.ids)
    ? body.ids.map(String).filter((id: string) => /^\d+$/.test(id)).slice(0, 30)
    : [];

  if (ids.length) {
    const rs = await Promise.all(ids.map((id) => igGet(`/${id}?fields=${CAMPOS}`)));
    const erro = rs.find((r) => !r.ok && !rs.some((x) => x.ok));
    if (erro) return json({ connected: false, erro: erro.error });
    return json({ connected: true, posts: rs.filter((r) => r.ok).map((r) => mapear(r.data)) });
  }

  const conta = IG_ACCOUNT_ID || "me";
  const r = await igGet(`/${conta}/media?fields=${CAMPOS}&limit=50`);
  if (!r.ok) return json({ connected: false, erro: r.error });
  return json({ connected: true, posts: (r.data?.data ?? []).map(mapear) });
});
