// =====================================================================
// claude-ia: as partes do painel que usam o Claude.
// Corpo: { modo, ... }
//   analista          -> análise geral do Instagram (posts + números)
//   quadro            -> análise de um quadro fixo (posts + comentários)
//   emalta            -> pesquisa trends/pautas/achados de um tema (web)
//   estrategia_plano  -> pilares de conteúdo + plano
//   estrategia_dias   -> monta um pedaço do calendário de 30 dias
//   estrategia_chat   -> conversa pra ajustar a estratégia
// Os resultados ficam salvos no banco (painel_config, quadros, em_alta,
// estrategia_chat). Só usuário logado no painel pode chamar.
// Segredo necessário: ANTHROPIC_API_KEY.
// =====================================================================
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { CORS, db, igGet, json, usuarioLogado } from "../_shared/ig.ts";

const MODELO = "claude-opus-5-5";

const PERFIL = `Você trabalha para Yasmin Carreira (@yasmincarreira_), UGC creator brasileira com cerca de 1.500 seguidores no Instagram.
Ela produz vídeos UGC para marcas (orgânico, anúncio, publi, TikTok Shop) e conteúdo próprio sobre: UGC, autocuidado, rotina,
reforma da casa, maternidade (é mãe) e fitness. Tom dela: autêntico, humor leve, "conversa de amiga".
Responda sempre em português do Brasil, de forma direta e prática, sem jargão. Nunca use travessão (o traço longo).`;

// ---------- esquemas de saída (JSON) ----------
const str = { type: "string" };
const lista = (items: unknown) => ({ type: "array", items });
const obj = (props: Record<string, unknown>) => ({
  type: "object", properties: props, required: Object.keys(props), additionalProperties: false,
});
const nulo = (s: unknown) => ({ anyOf: [s, { type: "null" }] });

const DIA = obj({
  dia: { type: "integer" }, data: str,
  formato: { type: "string", enum: ["reels", "post", "carrossel"] },
  pilar: str, tema: str, ideia: str, gancho: str, legenda_cta: str, stories: lista(str),
});
const ESQUEMAS: Record<string, unknown> = {
  analista: obj({
    nota_geral: str, resumo: str,
    funciona: lista(obj({ titulo: str, porque: str, exemplo: str })),
    ajustar: lista(obj({ titulo: str, porque: str, como: str })),
    repetir: lista(str),
    formatos: lista(obj({ formato: str, veredito: str })),
    ganchos_e_legendas: str, frequencia: str, proximos_passos: lista(str),
  }),
  quadro: obj({
    veredito: { type: "string", enum: ["bom", "medio", "fraco", "sem_dados"] },
    resumo: str, pontos_fortes: lista(str), melhorar: lista(str),
    ideias: lista(obj({ titulo: str, gancho: str })), pedidos_do_publico: lista(str),
  }),
  estrategia_plano: obj({
    objetivo: str,
    pilares: lista(obj({ nome: str, descricao: str, porcentagem: { type: "integer" }, exemplos: lista(str) })),
    plano: lista(obj({ etapa: str, como: str })),
  }),
  estrategia_dias: obj({ dias: lista(DIA) }),
  estrategia_chat: obj({
    resposta: str,
    objetivo: nulo(str),
    pilares: nulo(lista(obj({ nome: str, descricao: str, porcentagem: { type: "integer" }, exemplos: lista(str) }))),
    plano: nulo(lista(obj({ etapa: str, como: str }))),
    dias: lista(DIA),
  }),
};

const TEMAS: Record<string, string> = {
  ugc: "UGC (conteúdo gerado por usuário para marcas, mercado de UGC creators, formatos que as marcas pedem)",
  autocuidado: "autocuidado (skincare, cabelo, bem-estar, rotina de beleza)",
  rotina: "rotina (dia a dia, organização, produtividade, vlogs de rotina)",
  reforma: "reforma e decoração de casa (antes e depois, achados de casa, DIY)",
  mae: "maternidade (mãe de criança pequena, rotina com filhos, achados de mãe)",
  fitness: "fitness (treino em casa, academia, alimentação, motivação)",
};

// ---------- chamada ao Claude ----------
async function claude(opts: { system: string; user: string; schema?: unknown; web?: boolean; maxTokens?: number }) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new ErroPainel("sem_chave", "A chave do Claude (ANTHROPIC_API_KEY) ainda não foi configurada.");
  const client = new Anthropic({ apiKey });

  // deno-lint-ignore no-explicit-any
  const params: any = {
    model: MODELO,
    max_tokens: opts.maxTokens ?? 16000,
    // Se o modelo recusar por engano, a API tenta de novo em outro modelo.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", ...(opts.schema ? { format: { type: "json_schema", schema: opts.schema } } : {}) },
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  };
  if (opts.web) {
    params.tools = [{
      type: "web_search_20260209", name: "web_search", max_uses: 5,
      user_location: { type: "approximate", country: "BR", timezone: "America/Sao_Paulo" },
    }];
  }

  let resp = await client.beta.messages.create(params);
  // Busca na web longa pode pausar: manda de volta pra continuar.
  for (let i = 0; resp.stop_reason === "pause_turn" && i < 4; i++) {
    params.messages = [{ role: "user", content: opts.user }, { role: "assistant", content: resp.content }];
    resp = await client.beta.messages.create(params);
  }
  if (resp.stop_reason === "refusal") throw new ErroPainel("recusa", "O Claude não conseguiu responder esse pedido. Tente reformular.");
  if (resp.stop_reason === "max_tokens") throw new ErroPainel("longo", "A resposta ficou longa demais. Tente pedir menos coisas de uma vez.");

  // deno-lint-ignore no-explicit-any
  const texto = resp.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  if (opts.schema) return JSON.parse(texto);
  // Sem esquema (busca na web): pega o JSON de dentro do texto.
  const ini = texto.search(/[[{]/);
  const fim = Math.max(texto.lastIndexOf("]"), texto.lastIndexOf("}"));
  if (ini < 0 || fim < ini) throw new ErroPainel("formato", "Não consegui ler a resposta do Claude. Tente de novo.");
  return JSON.parse(texto.slice(ini, fim + 1));
}

class ErroPainel extends Error {
  constructor(public codigo: string, mensagem: string) { super(mensagem); }
}

const hojeBR = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const somaDias = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const corta = (s: unknown, n: number) => String(s ?? "").slice(0, n);

async function lerConfig(chave: string) {
  const { data } = await db.from("painel_config").select("valor").eq("chave", chave).maybeSingle();
  return data?.valor ?? null;
}
async function gravarConfig(chave: string, valor: unknown) {
  await db.from("painel_config").upsert({ chave, valor, updated_at: new Date().toISOString() });
}

// ---------- modos ----------
// deno-lint-ignore no-explicit-any
async function analista(body: any) {
  const posts = (Array.isArray(body.posts) ? body.posts : []).slice(0, 150).map((p: any) => ({
    data: corta(p.data, 10), tipo: corta(p.tipo, 12), legenda: corta(p.legenda, 220),
    curtidas: p.curtidas ?? 0, comentarios: p.comentarios ?? 0, salvos: p.salvos, views: p.views, alcance: p.alcance, compartilhamentos: p.compartilhamentos,
  }));
  if (!posts.length) throw new ErroPainel("sem_dados", "Não encontrei posts pra analisar.");
  const r = await claude({
    system: `${PERFIL}\nVocê é uma estrategista de Instagram experiente: entende o que gera alcance, salvamento, compartilhamento e comentário, e sabe diferenciar conteúdo bom de conteúdo fraco com base em números, não em achismo.`,
    user: `Faça uma análise geral do Instagram dela com base nestes dados reais (JSON).
Compare os posts entre si (o que performa acima e abaixo da média), olhe formato, tema, gancho/legenda e frequência.
Seja específica: cite posts pela data e pelo começo da legenda como exemplo. Dê a nota geral no formato "7/10".

Números da conta: ${JSON.stringify({ perfil: body.perfil, ultimos_30_dias: body.totais30, ultimos_90_dias: body.totais90 })}

Posts (do mais recente pro mais antigo): ${JSON.stringify(posts)}`,
    schema: ESQUEMAS.analista,
  });
  const valor = { ...r, gerado_em: new Date().toISOString(), posts_analisados: posts.length };
  await gravarConfig("analise_ig", valor);
  return valor;
}

// deno-lint-ignore no-explicit-any
async function quadro(body: any) {
  const { data: q } = await db.from("quadros").select("*").eq("id", String(body.quadro_id ?? "")).maybeSingle();
  if (!q) throw new ErroPainel("nao_achei", "Quadro não encontrado.");
  const ids: string[] = (q.media_ids ?? []).filter((id: string) => /^\d+$/.test(id)).slice(0, 15);
  const posts = await Promise.all(ids.map(async (id) => {
    const m = await igGet(`/${id}?fields=caption,timestamp,media_product_type,like_count,comments_count`);
    if (!m.ok) return null;
    const ins = await igGet(`/${id}/insights?metric=reach,saved,views,shares`);
    const met: Record<string, number> = {};
    for (const x of ins.ok ? ins.data?.data ?? [] : []) met[x.name] = x.values?.[0]?.value ?? 0;
    const com = await igGet(`/${id}/comments?fields=text&limit=40`);
    return {
      data: corta(m.data.timestamp, 10), tipo: m.data.media_product_type, legenda: corta(m.data.caption, 200),
      curtidas: m.data.like_count ?? 0, comentarios: m.data.comments_count ?? 0, ...met,
      textos_dos_comentarios: (com.ok ? com.data?.data ?? [] : []).map((c: any) => corta(c.text, 150)),
    };
  }));
  const validos = posts.filter(Boolean);
  const r = await claude({
    system: `${PERFIL}\nVocê é uma estrategista de Instagram experiente e analisa quadros fixos de conteúdo (séries que se repetem).`,
    user: `Analise o quadro "${q.nome}"${q.descricao ? ` (${corta(q.descricao, 300)})` : ""}.
Diga se está bom, médio ou fraco comparando com a média da conta, o que funciona, o que melhorar, dê 5 ideias de próximos episódios com gancho,
e liste o que as pessoas estão pedindo ou perguntando nos comentários. Se não houver posts, use "sem_dados" e dê ideias pra começar o quadro.

Média da conta por post (referência): ${JSON.stringify(body.media_geral ?? null)}
Posts do quadro: ${JSON.stringify(validos)}`,
    schema: ESQUEMAS.quadro,
  });
  const analise = { ...r, posts_analisados: validos.length };
  await db.from("quadros").update({ analise, analisado_em: new Date().toISOString() }).eq("id", q.id);
  return analise;
}

// deno-lint-ignore no-explicit-any
async function emalta(body: any) {
  const tema = String(body.tema ?? "");
  if (!TEMAS[tema]) throw new ErroPainel("tema", "Tema desconhecido.");
  const itens = await claude({
    system: `${PERFIL}\nVocê é uma pesquisadora de tendências de conteúdo para Instagram e TikTok no Brasil.`,
    user: `Hoje é ${hojeBR()}. Pesquise na web o que está em alta AGORA (últimas 2 a 4 semanas) no Brasil sobre: ${TEMAS[tema]}.
Traga 8 itens, misturando três tipos:
- "trend": formato, áudio, desafio ou estilo de vídeo que está viralizando;
- "pauta": assunto/notícia/conversa do momento que rende conteúdo;
- "achado": produto, lugar, ferramenta ou dica que as pessoas estão descobrindo.
Para cada item, diga como a Yasmin transformaria isso em roteiro (gancho + ideia em 1 ou 2 frases).
Responda SOMENTE com um array JSON, sem texto antes ou depois, neste formato:
[{"tipo":"trend|pauta|achado","titulo":"...","descricao":"...","ideia":"...","fonte":"url ou nome da fonte"}]`,
    web: true,
  });
  if (!Array.isArray(itens) || !itens.length) throw new ErroPainel("formato", "A pesquisa não trouxe resultados. Tente de novo.");
  const lote = new Date().toISOString();
  // deno-lint-ignore no-explicit-any
  const linhas = itens.slice(0, 12).map((i: any) => ({
    lote, tema,
    tipo: ["trend", "pauta", "achado"].includes(i.tipo) ? i.tipo : "pauta",
    titulo: corta(i.titulo, 160) || "Sem título", descricao: corta(i.descricao, 600),
    ideia: corta(i.ideia, 600), fonte: corta(i.fonte, 300),
  }));
  await db.from("em_alta").delete().eq("tema", tema);
  await db.from("em_alta").insert(linhas);
  return { tema, itens: linhas };
}

// deno-lint-ignore no-explicit-any
async function estrategiaPlano(body: any) {
  const r = await claude({
    system: `${PERFIL}\nVocê é uma estrategista de conteúdo para Instagram que monta planos realistas para quem cria sozinha.`,
    user: `Monte a estratégia de conteúdo dela para os próximos 30 dias: o objetivo principal, de 3 a 5 pilares de conteúdo
(com a porcentagem de cada um somando 100 e exemplos) e o plano em etapas pra chegar lá.
O que ela pediu: ${corta(body.pedido, 2000) || "crescer seguidores e fechar mais campanhas de UGC"}
Números atuais da conta: ${JSON.stringify(body.contexto ?? null)}`,
    schema: ESQUEMAS.estrategia_plano,
  });
  const atual = (await lerConfig("estrategia")) ?? {};
  const valor = { ...atual, ...r, pedido: corta(body.pedido, 2000), inicio: hojeBR(), calendario: [], gerado_em: new Date().toISOString() };
  await gravarConfig("estrategia", valor);
  return valor;
}

// deno-lint-ignore no-explicit-any
async function estrategiaDias(body: any) {
  const est = await lerConfig("estrategia");
  if (!est?.pilares) throw new ErroPainel("sem_plano", "Gere os pilares e o plano primeiro.");
  const de = Math.max(1, Math.min(30, Number(body.de) || 1));
  const ate = Math.max(de, Math.min(30, Number(body.ate) || de + 9));
  const inicio = est.inicio || hojeBR();
  const r = await claude({
    system: `${PERFIL}\nVocê é uma estrategista de conteúdo e monta calendários de postagem práticos e variados.`,
    user: `Monte os dias ${de} a ${ate} do calendário de 30 dias (dia 1 = ${inicio}, então o dia N é ${inicio} + N - 1 dias; preencha "data" no formato AAAA-MM-DD).
Para cada dia: formato (reels, post ou carrossel), o pilar, o tema, a ideia, o gancho dos primeiros segundos, a legenda/CTA e de 2 a 4 ideias de stories.
Equilibre os pilares nas porcentagens e varie os formatos (mais reels). Não repita ideias dos dias que já existem.
Estratégia: ${JSON.stringify({ objetivo: est.objetivo, pilares: est.pilares, pedido: est.pedido })}
Dias já prontos (títulos): ${JSON.stringify((est.calendario ?? []).map((d: any) => `${d.dia}: ${d.tema}`))}`,
    schema: ESQUEMAS.estrategia_dias,
  });
  const mapa = new Map((est.calendario ?? []).map((d: any) => [d.dia, d]));
  // deno-lint-ignore no-explicit-any
  for (const d of r.dias ?? []) if (d.dia >= de && d.dia <= ate) mapa.set(d.dia, { ...d, data: d.data || somaDias(inicio, d.dia - 1) });
  // deno-lint-ignore no-explicit-any
  const calendario = [...mapa.values()].sort((a: any, b: any) => a.dia - b.dia);
  const valor = { ...est, calendario };
  await gravarConfig("estrategia", valor);
  return valor;
}

// deno-lint-ignore no-explicit-any
async function estrategiaChat(body: any) {
  const msg = corta(body.mensagem, 2000).trim();
  if (!msg) throw new ErroPainel("vazio", "Escreva uma mensagem.");
  const est = (await lerConfig("estrategia")) ?? {};
  const { data: hist } = await db.from("estrategia_chat").select("papel, texto").order("id", { ascending: false }).limit(16);
  await db.from("estrategia_chat").insert({ papel: "voce", texto: msg });
  const conversa = (hist ?? []).reverse().map((m: any) => `${m.papel === "voce" ? "Yasmin" : "Você"}: ${m.texto}`).join("\n");
  const r = await claude({
    system: `${PERFIL}\nVocê é a estrategista de conteúdo dela e conversa pelo painel. Responda de forma curta e útil.
Quando ela pedir mudança na estratégia, devolva só o que mudou: "objetivo", "pilares" ou "plano" (ou null se não mudou)
e em "dias" apenas os dias do calendário que você alterou ou criou (no máximo 10 por resposta; lista vazia se nenhum).`,
    user: `Estratégia atual: ${JSON.stringify({ objetivo: est.objetivo, pilares: est.pilares, plano: est.plano, inicio: est.inicio, calendario: est.calendario })}
Conversa até agora:
${conversa || "(começo da conversa)"}
Yasmin: ${msg}`,
    schema: ESQUEMAS.estrategia_chat,
  });
  const novo = { ...est };
  if (r.objetivo) novo.objetivo = r.objetivo;
  if (r.pilares) novo.pilares = r.pilares;
  if (r.plano) novo.plano = r.plano;
  if (r.dias?.length) {
    const inicio = novo.inicio || hojeBR();
    novo.inicio = inicio;
    const mapa = new Map((novo.calendario ?? []).map((d: any) => [d.dia, d]));
    // deno-lint-ignore no-explicit-any
    for (const d of r.dias) if (d.dia >= 1 && d.dia <= 30) mapa.set(d.dia, { ...d, data: d.data || somaDias(inicio, d.dia - 1) });
    // deno-lint-ignore no-explicit-any
    novo.calendario = [...mapa.values()].sort((a: any, b: any) => a.dia - b.dia);
  }
  if (r.objetivo || r.pilares || r.plano || r.dias?.length) await gravarConfig("estrategia", novo);
  await db.from("estrategia_chat").insert({ papel: "claude", texto: r.resposta });
  return { resposta: r.resposta, estrategia: novo, mudou: !!(r.objetivo || r.pilares || r.plano || r.dias?.length) };
}

const MODOS: Record<string, (b: unknown) => Promise<unknown>> = {
  analista, quadro, emalta, estrategia_plano: estrategiaPlano, estrategia_dias: estrategiaDias, estrategia_chat: estrategiaChat,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await usuarioLogado(req))) return json({ erro: "não autorizado" }, 401);
  // deno-lint-ignore no-explicit-any
  const body: any = await req.json().catch(() => ({}));
  const fn = MODOS[String(body?.modo)];
  if (!fn) return json({ erro: "modo desconhecido" }, 400);
  try {
    return json({ ok: true, resultado: await fn(body) });
  } catch (e) {
    if (e instanceof ErroPainel) return json({ ok: false, codigo: e.codigo, erro: e.message });
    if (e instanceof Anthropic.AuthenticationError) return json({ ok: false, codigo: "chave_invalida", erro: "A chave do Claude está inválida." });
    if (e instanceof Anthropic.PermissionDeniedError) return json({ ok: false, codigo: "sem_permissao", erro: "A chave do Claude não tem permissão pra isso." });
    if (e instanceof Anthropic.RateLimitError) return json({ ok: false, codigo: "limite", erro: "Muitas análises seguidas. Espere um minuto e tente de novo." });
    if (e instanceof Anthropic.BadRequestError) { console.error(e); return json({ ok: false, codigo: "pedido", erro: "O Claude recusou o pedido: " + e.message }); }
    if (e instanceof Anthropic.APIError) { console.error(e); return json({ ok: false, codigo: "api", erro: `O Claude está indisponível (${e.status}). Tente de novo em instantes.` }); }
    console.error(e);
    return json({ ok: false, codigo: "erro", erro: "Algo deu errado. Tente de novo." });
  }
});
