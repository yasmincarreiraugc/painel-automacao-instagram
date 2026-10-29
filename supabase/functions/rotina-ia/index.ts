// =====================================================================
// rotina-ia: porta da rotina diária (agente do Claude na nuvem, sem
// API paga) pra ler os números e gravar Analista, Em alta e Estratégia.
// Protegida pelo header x-rotina-key = ROTINA_KEY (só serve pra isso).
//   GET               -> dados: perfil, totais, posts, análise e estratégia atuais
//   POST {tipo:"analise",    dados}  -> painel_config.analise_ig
//   POST {tipo:"emalta",     itens}  -> troca os itens de em_alta
//   POST {tipo:"estrategia", dados}  -> painel_config.estrategia
// Publique com --no-verify-jwt (quem protege é a ROTINA_KEY).
// =====================================================================
import { db, igGet, json } from "../_shared/ig.ts";

const TEMAS = ["ugc", "autocuidado", "rotina", "reforma", "mae", "fitness"];
const corta = (s: unknown, n: number) => String(s ?? "").slice(0, n);

async function analytics(periodo: string) {
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ig-analytics`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-sched-key": Deno.env.get("SCHED_SECRET") ?? "" },
    body: JSON.stringify({ periodo, atualizar: periodo === "tudo" }),
  });
  return await res.json().catch(() => null);
}
// Quadros com os números e os comentários de cada vídeo marcado.
async function quadrosComPosts() {
  const { data: qs } = await db.from("quadros").select("id, nome, descricao, media_ids, analise, analisado_em");
  return await Promise.all((qs ?? []).map(async (q) => ({
    id: q.id, nome: q.nome, descricao: q.descricao, analisado_em: q.analisado_em,
    posts: (await Promise.all((q.media_ids ?? []).filter((id: string) => /^\d+$/.test(id)).slice(0, 15).map(async (id: string) => {
      const m = await igGet(`/${id}?fields=caption,timestamp,media_product_type,like_count,comments_count,permalink`);
      if (!m.ok) return null;
      const ins = await igGet(`/${id}/insights?metric=reach,saved,views,shares`);
      const met: Record<string, number> = {};
      // deno-lint-ignore no-explicit-any
      for (const x of ins.ok ? ins.data?.data ?? [] : []) met[x.name] = (x as any).values?.[0]?.value ?? 0;
      const com = await igGet(`/${id}/comments?fields=text,username&limit=50`);
      return {
        data: corta(m.data.timestamp, 10), tipo: m.data.media_product_type, legenda: corta(m.data.caption, 300), link: m.data.permalink,
        curtidas: m.data.like_count ?? 0, comentarios: m.data.comments_count ?? 0, ...met,
        // deno-lint-ignore no-explicit-any
        textos_dos_comentarios: (com.ok ? com.data?.data ?? [] : []).map((c: any) => corta(c.text, 200)),
      };
    }))).filter(Boolean),
  })));
}

async function lerConfig(chave: string) {
  const { data } = await db.from("painel_config").select("valor").eq("chave", chave).maybeSingle();
  return data?.valor ?? null;
}
async function gravarConfig(chave: string, valor: unknown) {
  const { error } = await db.from("painel_config").upsert({ chave, valor, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

Deno.serve(async (req) => {
  const chave = Deno.env.get("ROTINA_KEY");
  if (!chave || req.headers.get("x-rotina-key") !== chave) return json({ erro: "não autorizado" }, 401);

  try {
    if (req.method === "GET") {
      const [tudo, d30, d90, analise, estrategia, feitos, quadros] = await Promise.all([
        analytics("tudo"), analytics("30"), analytics("90"), lerConfig("analise_ig"), lerConfig("estrategia"),
        lerConfig("estrategia_feitos"), quadrosComPosts(),
      ]);
      return json({
        hoje: new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10),
        conectado: !!tudo?.connected,
        perfil: tudo?.perfil ?? null,
        totais_30_dias: d30?.totais ?? null,
        totais_90_dias: d90?.totais ?? null,
        // deno-lint-ignore no-explicit-any
        posts: (tudo?.posts ?? []).map((p: any) => ({
          data: p.data, tipo: p.tipo, legenda: p.legenda, curtidas: p.curtidas, comentarios: p.comentarios,
          salvos: p.salvos, views: p.views, alcance: p.alcance, compartilhamentos: p.compartilhamentos, link: p.link,
        })),
        quem_mais_comenta: tudo?.comentaristas ?? [],
        analise_atual: analise,
        estrategia_atual: estrategia,
        // Conteúdos da estratégia que ela marcou como feitos: { "AAAA-MM-DD|tema": true }
        conteudos_feitos: feitos ?? {},
        quadros,
      });
    }

    const body = await req.json().catch(() => ({}));
    const agora = new Date().toISOString();

    if (body.tipo === "analise") {
      const a = body.dados;
      if (!a?.resumo || !Array.isArray(a.funciona) || !Array.isArray(a.ajustar)) return json({ erro: "análise incompleta" }, 400);
      await gravarConfig("analise_ig", { ...a, gerado_em: agora });
      return json({ ok: true });
    }

    if (body.tipo === "emalta") {
      const itens = Array.isArray(body.itens) ? body.itens : [];
      // deno-lint-ignore no-explicit-any
      const linhas = itens.slice(0, 60).filter((i: any) => TEMAS.includes(i?.tema) && i?.titulo).map((i: any) => ({
        lote: agora, tema: i.tema,
        tipo: ["trend", "pauta", "achado"].includes(i.tipo) ? i.tipo : "pauta",
        titulo: corta(i.titulo, 160), descricao: corta(i.descricao, 600), ideia: corta(i.ideia, 600), fonte: corta(i.fonte, 300),
      }));
      if (linhas.length < 6) return json({ erro: "poucos itens (mínimo 6)" }, 400);
      await db.from("em_alta").delete().neq("id", 0);
      const { error } = await db.from("em_alta").insert(linhas);
      if (error) throw new Error(error.message);
      return json({ ok: true, itens: linhas.length });
    }

    if (body.tipo === "estrategia") {
      const e = body.dados;
      if (!e?.objetivo || !Array.isArray(e.pilares) || !Array.isArray(e.calendario) || e.calendario.length < 7) {
        return json({ erro: "estratégia incompleta (precisa de objetivo, pilares e calendário)" }, 400);
      }
      await gravarConfig("estrategia", { ...e, gerado_em: agora });
      return json({ ok: true, dias: e.calendario.length });
    }

    if (body.tipo === "quadro") {
      const a = body.analise;
      if (!body.id || !a?.resumo || !["bom", "medio", "fraco", "sem_dados"].includes(a.veredito)) {
        return json({ erro: "análise de quadro incompleta (id, veredito, resumo)" }, 400);
      }
      const { error } = await db.from("quadros").update({ analise: a, analisado_em: agora }).eq("id", String(body.id));
      if (error) throw new Error(error.message);
      return json({ ok: true });
    }

    return json({ erro: "tipo desconhecido" }, 400);
  } catch (e) {
    console.error(e);
    return json({ erro: String(e) }, 500);
  }
});
