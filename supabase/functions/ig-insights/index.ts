// =====================================================================
// ig-insights: métricas pro dashboard.
// Devolve: seguidores, novos seguidores por dia e alcance por dia
// (últimos 15 dias). Só usuário logado no painel pode chamar.
// =====================================================================
import { CORS, IG_ACCOUNT_ID, igGet, json, usuarioLogado } from "../_shared/ig.ts";

const DIAS = 15;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await usuarioLogado(req))) return json({ erro: "não autorizado" }, 401);

  const conta = IG_ACCOUNT_ID || "me";
  const perfil = await igGet(`/${conta}?fields=username,followers_count,media_count`);
  if (!perfil.ok) return json({ connected: false, erro: perfil.error });

  // Janela: de 15 dias atrás até hoje (em segundos).
  const ate = Math.floor(Date.now() / 1000);
  const desde = ate - DIAS * 86400;

  // Cada métrica separada: se uma falhar (ex: conta com menos de 100
  // seguidores não tem follower_count), as outras continuam.
  const serie = async (metrica: string) => {
    const r = await igGet(`/${conta}/insights?metric=${metrica}&period=day&since=${desde}&until=${ate}`);
    if (!r.ok) return [];
    const valores = r.data?.data?.[0]?.values ?? [];
    return valores.map((v: any) => ({ date: String(v.end_time).slice(0, 10), value: Number(v.value) || 0 }));
  };

  const [novos, alcance] = await Promise.all([serie("follower_count"), serie("reach")]);

  return json({
    connected: true,
    username: perfil.data.username,
    followers: perfil.data.followers_count ?? 0,
    media_count: perfil.data.media_count ?? 0,
    new_followers: novos.slice(-DIAS),
    reach: alcance.slice(-DIAS),
  });
});
