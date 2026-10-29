// =====================================================================
// ig-analytics: tudo da aba "Análises" num pedido só.
// Corpo: { periodo: "7" | "30" | "90" | "tudo", atualizar?: boolean }
//
// Sem a permissão instagram_manage_insights ainda dá pra mostrar:
//   seguidores, curtidas, comentários, melhores posts, quem mais comenta
//   e novos seguidores (pela foto diária em ig_followers_daily).
// Com a permissão, liga sozinho: alcance por dia, contas engajadas,
//   interações da conta, salvos e visualizações de cada post.
//
// Guarda o resultado 30 min em ig_analytics_cache. Quem chama: usuário
// logado no painel ou o pg_cron (x-sched-key), que tira a foto diária.
// Publique com --no-verify-jwt (a função confere quem chamou).
// =====================================================================
import { CORS, IG_ACCOUNT_ID, db, igGet, json, schedAutorizado, usuarioLogado } from "../_shared/ig.ts";

const PERIODOS: Record<string, number> = { "7": 7, "30": 30, "90": 90, "tudo": 0 };
const CACHE_MIN = 30;
const DIA = 86400000;
const CAMPOS_POST = "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!schedAutorizado(req) && !(await usuarioLogado(req))) return json({ erro: "não autorizado" }, 401);

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const periodo = String(body?.periodo ?? "30") in PERIODOS ? String(body?.periodo ?? "30") : "30";

  if (!body?.atualizar) {
    const { data } = await db.from("ig_analytics_cache").select("payload, updated_at").eq("periodo", periodo).maybeSingle();
    if (data && Date.now() - new Date(data.updated_at).getTime() < CACHE_MIN * 60000) return json(data.payload);
  }

  try {
    const payload = await calcula(periodo);
    if (payload.connected) {
      await db.from("ig_analytics_cache").upsert({ periodo, payload, updated_at: payload.gerado_em });
    }
    return json(payload);
  } catch (e) {
    console.error(e);
    return json({ connected: false, erro: String(e) });
  }
});

// Data de hoje no horário de Brasília (AAAA-MM-DD).
const hojeBR = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const diaDe = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600000).toISOString().slice(0, 10);
const unix = (ms: number) => Math.floor(ms / 1000);

// Roda f em lotes de n chamadas em paralelo.
async function emLotes<T, R>(itens: T[], n: number, f: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < itens.length; i += n) out.push(...(await Promise.all(itens.slice(i, i + n).map(f))));
  return out;
}

// Janelas de até 30 dias (limite da API de insights da conta).
function janelas(desde: number, ate: number) {
  const out: { s: number; u: number }[] = [];
  for (let s = desde; s < ate; s += 30 * DIA) out.push({ s, u: Math.min(s + 30 * DIA, ate) });
  return out;
}

async function calcula(periodo: string) {
  const conta = IG_ACCOUNT_ID || "me";
  const dias = PERIODOS[periodo];
  const agora = Date.now();
  const desde = dias ? agora - dias * DIA : 0;
  const avisos: string[] = [];

  // 1) Perfil.
  const p = await igGet(`/${conta}?fields=username,name,followers_count,follows_count,media_count,profile_picture_url`);
  if (!p.ok) return { connected: false, erro: p.error };
  const perfil = p.data;

  // 2) Foto diária dos seguidores.
  await db.from("ig_followers_daily").upsert({
    dia: hojeBR(), seguidores: perfil.followers_count ?? 0, seguindo: perfil.follows_count ?? null,
    posts: perfil.media_count ?? null, updated_at: new Date().toISOString(),
  });

  // 3) Posts do período (paginando até passar da data de início).
  const posts: any[] = [];
  let after = "";
  const limite = dias ? 400 : 300;
  while (posts.length < limite) {
    const r = await igGet(`/${conta}/media?fields=${CAMPOS_POST}&limit=100${after ? `&after=${after}` : ""}`);
    if (!r.ok) { avisos.push(`posts: ${r.error}`); break; }
    const lote = r.data?.data ?? [];
    posts.push(...lote);
    after = r.data?.paging?.cursors?.after ?? "";
    const maisAntigo = lote[lote.length - 1]?.timestamp;
    if (!r.data?.paging?.next || !lote.length || (desde && maisAntigo && new Date(maisAntigo).getTime() < desde)) break;
  }
  const doPeriodo = posts.filter((m) => !desde || new Date(m.timestamp).getTime() >= desde);

  // 4) Insights da conta (só com a permissão instagram_manage_insights).
  const teste = await igGet(`/${conta}/insights?metric=reach&period=day&since=${unix(agora - 2 * DIA)}&until=${unix(agora)}`);
  const temInsights = teste.ok;
  let alcanceDia: { date: string; value: number }[] = [];
  let seguidoresDia: { date: string; value: number }[] = [];
  let alcance: number | null = null, engajadas: number | null = null, interacoesConta: number | null = null;

  if (temInsights) {
    const ini = agora - (dias || 90) * DIA; // "tudo": últimos 90 dias (limite prático da API)
    for (const j of janelas(ini, agora)) {
      const r = await igGet(`/${conta}/insights?metric=reach&period=day&since=${unix(j.s)}&until=${unix(j.u)}`);
      if (r.ok) {
        for (const v of r.data?.data?.[0]?.values ?? []) alcanceDia.push({ date: diaDe(v.end_time), value: v.value ?? 0 });
      }
      const t = await igGet(`/${conta}/insights?metric=reach,accounts_engaged,total_interactions&metric_type=total_value&period=day&since=${unix(j.s)}&until=${unix(j.u)}`);
      if (t.ok) {
        for (const m of t.data?.data ?? []) {
          const v = m.total_value?.value ?? 0;
          if (m.name === "reach") alcance = (alcance ?? 0) + v;
          if (m.name === "accounts_engaged") engajadas = (engajadas ?? 0) + v;
          if (m.name === "total_interactions") interacoesConta = (interacoesConta ?? 0) + v;
        }
      } else avisos.push(`totais: ${t.error}`);
    }
    // follower_count só existe nos últimos 30 dias.
    const fs = Math.max(agora - Math.min(dias || 30, 30) * DIA, agora - 30 * DIA + 3600000);
    const f = await igGet(`/${conta}/insights?metric=follower_count&period=day&since=${unix(fs)}&until=${unix(agora)}`);
    if (f.ok) seguidoresDia = (f.data?.data?.[0]?.values ?? []).map((v: any) => ({ date: diaDe(v.end_time), value: v.value ?? 0 }));
    if (dias > 30 || !dias) avisos.push("A API só entrega novos seguidores por dia dos últimos 30 dias.");
  }

  // 5) Insights de cada post do período (até 100 mais recentes).
  const insightsPost = new Map<string, Record<string, number>>();
  if (temInsights) {
    await emLotes(doPeriodo.slice(0, 100), 8, async (m) => {
      let r = await igGet(`/${m.id}/insights?metric=reach,saved,views,shares`);
      if (!r.ok) r = await igGet(`/${m.id}/insights?metric=reach,saved`);
      if (!r.ok) return;
      const v: Record<string, number> = {};
      for (const x of r.data?.data ?? []) v[x.name] = x.values?.[0]?.value ?? x.total_value?.value ?? 0;
      insightsPost.set(m.id, v);
    });
  }

  // 6) Quem mais comenta (posts do período com mais comentários).
  const contagem = new Map<string, number>();
  const comComentario = [...doPeriodo].filter((m) => m.comments_count > 0)
    .sort((a, b) => b.comments_count - a.comments_count).slice(0, 25);
  await emLotes(comComentario, 6, async (m) => {
    const r = await igGet(`/${m.id}/comments?fields=username,from&limit=100`);
    if (!r.ok) return;
    for (const c of r.data?.data ?? []) {
      const u = c.username ?? c.from?.username;
      if (u && u !== perfil.username) contagem.set(u, (contagem.get(u) ?? 0) + 1);
    }
  });
  const comentaristas = [...contagem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([username, total]) => ({ username, total }));

  // 7) Novos seguidores: pela API (se tiver) ou pela foto diária.
  const somaSerie = (s: { value: number }[]) => s.reduce((t, d) => t + d.value, 0);
  let novos: number | null = null, novosDesde: string | null = null;
  if (seguidoresDia.length) novos = somaSerie(seguidoresDia);
  else {
    let q = db.from("ig_followers_daily").select("dia, seguidores").order("dia", { ascending: true }).limit(1);
    if (desde) q = q.gte("dia", diaDe(new Date(desde).toISOString()));
    const { data } = await q;
    if (data?.[0] && data[0].dia !== hojeBR()) {
      novos = (perfil.followers_count ?? 0) - data[0].seguidores;
      novosDesde = data[0].dia;
    }
  }
  // Série diária pela foto (quando não tem a da API).
  if (!seguidoresDia.length) {
    let q = db.from("ig_followers_daily").select("dia, seguidores").order("dia", { ascending: true });
    if (desde) q = q.gte("dia", diaDe(new Date(desde - DIA).toISOString()));
    const { data } = await q;
    seguidoresDia = (data ?? []).slice(1).map((d: any, i: number) => ({ date: d.dia, value: d.seguidores - data![i].seguidores }));
  }

  // 8) Extras: validade do token e entregas nas últimas 24h.
  const { data: tok } = await db.from("ig_token_status").select("expires_at").eq("id", "main").maybeSingle();
  const { count: entregas24h } = await db.from("ig_deliveries").select("id", { count: "exact", head: true })
    .eq("status", "ok").gte("ts", new Date(agora - DIA).toISOString());

  const listaPosts = doPeriodo.map((m) => {
    const ins = insightsPost.get(m.id) ?? {};
    return {
      id: m.id,
      legenda: (m.caption ?? "").slice(0, 140),
      tipo: m.media_product_type === "REELS" ? "Reels" : m.media_type === "CAROUSEL_ALBUM" ? "Carrossel" : m.media_type === "VIDEO" ? "Vídeo" : "Foto",
      miniatura: m.media_type === "VIDEO" ? (m.thumbnail_url ?? m.media_url) : m.media_url,
      link: m.permalink,
      data: m.timestamp,
      curtidas: m.like_count ?? 0,
      comentarios: m.comments_count ?? 0,
      salvos: ins.saved ?? null,
      views: ins.views ?? null,
      alcance: ins.reach ?? null,
      compartilhamentos: ins.shares ?? null,
    };
  });

  return {
    connected: true,
    gerado_em: new Date().toISOString(),
    periodo,
    dias,
    temInsights,
    perfil: {
      username: perfil.username, nome: perfil.name, foto: perfil.profile_picture_url ?? null,
      seguidores: perfil.followers_count ?? 0, seguindo: perfil.follows_count ?? 0, posts: perfil.media_count ?? 0,
    },
    totais: {
      seguidores: perfil.followers_count ?? 0,
      novos, novosDesde,
      alcance, engajadas,
      interacoes: interacoesConta ?? listaPosts.reduce((t, m) => t + m.curtidas + m.comentarios, 0),
      interacoesFonte: interacoesConta === null ? "posts" : "conta",
      postsNoPeriodo: listaPosts.length,
    },
    series: { alcance: alcanceDia, novos: seguidoresDia },
    posts: listaPosts,
    comentaristas,
    token_expira: tok?.expires_at ?? null,
    entregas24h: entregas24h ?? 0,
    avisos,
  };
}
