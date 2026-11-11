// =====================================================================
// roteiro-cliente: a página de aprovação que a marca abre (roteiro.html).
//   GET  ?t=<link secreto>  -> o roteiro + os comentários já feitos
//   POST {t, acao, ...}     -> acao "gancho" (gancho: 1|2),
//                              "comentario" (cena, texto, nome) ou
//                              "aprovar" (nome, texto opcional)
// Cada ação fica em roteiro_feedback e gera um e-mail pra Yasmin
// (Resend: secrets RESEND_API_KEY e AVISO_EMAIL; sem eles, só não envia).
// Publique com --no-verify-jwt (a marca não tem login).
// =====================================================================
import { CORS, db, json } from "../_shared/ig.ts";

const PAINEL = "https://yasmincarreiraugc.github.io/painel-automacao-instagram/";
const txt = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

async function buscar(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const { data } = await db.from("roteiros")
    .select("id, titulo, formato, gancho, gancho2, cenas, cta, marca_nome, marca_logo, enviado_em, gancho_escolhido, aprovado_por, aprovado_em, campanha_id")
    .eq("link_token", token).not("enviado_em", "is", null).maybeSingle();
  if (!data) return null;
  let marca = data.marca_nome;
  if (data.campanha_id) {
    const { data: c } = await db.from("campanhas").select("marca").eq("id", data.campanha_id).maybeSingle();
    marca = data.marca_nome || c?.marca || "";
  }
  return { ...data, marca };
}

async function publico(r: NonNullable<Awaited<ReturnType<typeof buscar>>>) {
  const { data: fb } = await db.from("roteiro_feedback")
    .select("tipo, cena, texto, nome, created_at").eq("roteiro_id", r.id)
    .eq("tipo", "comentario").order("created_at");
  const { id: _id, campanha_id: _c, marca_nome: _m, ...resto } = r;
  return { ...resto, comentarios: fb ?? [] };
}

async function avisar(assunto: string, linhas: [string, string][], link: string) {
  const chave = Deno.env.get("RESEND_API_KEY");
  const para = Deno.env.get("AVISO_EMAIL");
  if (!chave || !para) return;
  const corpo = `
    <div style="font-family:Arial,sans-serif;color:#1e1915;max-width:520px">
      <p style="font-size:13px;letter-spacing:.08em;margin:0 0 12px">&#10022; YASMIN CARREIRA &middot; ROTEIROS</p>
      <h2 style="margin:0 0 14px">${esc(assunto)}</h2>
      ${linhas.map(([k, v]) => `<p style="margin:0 0 10px"><b>${esc(k)}:</b><br>${esc(v).replace(/\n/g, "<br>")}</p>`).join("")}
      <p style="margin:18px 0 6px"><a href="${link}" style="background:#1e1915;color:#fff;padding:10px 16px;border-radius:99px;text-decoration:none">Ver o roteiro</a></p>
      <p style="font-size:12px;color:#78726d">Tudo fica salvo no painel, em Roteiros: <a href="${PAINEL}#roteiros">${PAINEL}#roteiros</a></p>
    </div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: Deno.env.get("AVISO_REMETENTE") || "Roteiros <onboarding@resend.dev>", to: [para], subject: assunto, html: corpo }),
    });
    if (!res.ok) console.warn("roteiro-cliente: e-mail", res.status, await res.text());
  } catch (e) { console.warn("roteiro-cliente: e-mail", e); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  if (req.method === "GET") {
    const r = await buscar(new URL(req.url).searchParams.get("t") ?? "");
    return r ? json(await publico(r)) : json({ erro: "Roteiro não encontrado." }, 404);
  }
  if (req.method !== "POST") return json({ erro: "Método não aceito." }, 405);

  const raw = await req.text();
  if (raw.length > 6000) return json({ erro: "Texto grande demais." }, 413);
  let d: any;
  try { d = JSON.parse(raw); } catch { return json({ erro: "Pedido inválido." }, 400); }

  const r = await buscar(txt(d?.t, 64));
  if (!r) return json({ erro: "Roteiro não encontrado." }, 404);
  if (r.aprovado_em) return json({ erro: "Este roteiro já foi aprovado." }, 409);

  // Freio contra abuso: no máximo 40 ações a cada 10 minutos por roteiro.
  const { count } = await db.from("roteiro_feedback").select("id", { count: "exact", head: true })
    .eq("roteiro_id", r.id).gte("created_at", new Date(Date.now() - 600_000).toISOString());
  if ((count ?? 0) >= 40) return json({ erro: "Muitas ações seguidas. Tente de novo em alguns minutos." }, 429);

  const link = `${PAINEL}roteiro.html?t=${encodeURIComponent(txt(d.t, 64))}`;
  const quem = r.marca || "A marca";
  const nome = txt(d.nome, 80);
  const cenas = Array.isArray(r.cenas) ? r.cenas : [];
  const agora = new Date().toISOString();
  let assunto = "";
  let linhas: [string, string][] = [];

  if (d.acao === "gancho") {
    const g = Number(d.gancho);
    if (g !== 1 && g !== 2) return json({ erro: "Gancho inválido." }, 400);
    const texto = g === 1 ? r.gancho : r.gancho2;
    await db.from("roteiros").update({ gancho_escolhido: g, updated_at: agora }).eq("id", r.id);
    await db.from("roteiro_feedback").insert({ roteiro_id: r.id, tipo: "gancho", parte: `Gancho ${g}`, texto, nome });
    assunto = `${quem} escolheu o gancho ${g}`;
    linhas = [["Roteiro", r.titulo], [`Gancho ${g}`, texto]];
  } else if (d.acao === "comentario") {
    const texto = txt(d.texto, 1500);
    const cena = Number.isInteger(d.cena) ? d.cena : -1;
    if (!texto) return json({ erro: "Escreva o comentário." }, 400);
    const parte = cena >= 0 && cena < cenas.length ? txt(cenas[cena]?.parte, 60) || `Cena ${cena + 1}` : "Roteiro geral";
    await db.from("roteiro_feedback").insert({ roteiro_id: r.id, tipo: "comentario", cena: cena >= 0 && cena < cenas.length ? cena : null, parte, texto, nome });
    assunto = `${quem} comentou no roteiro`;
    linhas = [["Roteiro", r.titulo], ["Onde", parte], [nome ? `Comentário de ${nome}` : "Comentário", texto]];
  } else if (d.acao === "aprovar") {
    if (!nome) return json({ erro: "Escreva o nome de quem está aprovando." }, 400);
    if ((r.gancho && r.gancho2) && !r.gancho_escolhido) return json({ erro: "Escolha um dos ganchos antes de aprovar." }, 400);
    const texto = txt(d.texto, 1500);
    await db.from("roteiros").update({ aprovado_por: nome, aprovado_em: agora, updated_at: agora }).eq("id", r.id);
    await db.from("roteiro_feedback").insert({ roteiro_id: r.id, tipo: "aprovacao", parte: "Aprovação", texto, nome });
    assunto = `${quem} aprovou o roteiro`;
    linhas = [["Roteiro", r.titulo], ["Aprovado por", nome]];
    if (r.gancho_escolhido) linhas.push([`Gancho escolhido (${r.gancho_escolhido})`, r.gancho_escolhido === 1 ? r.gancho : r.gancho2]);
    if (texto) linhas.push(["Observação", texto]);
  } else {
    return json({ erro: "Ação desconhecida." }, 400);
  }

  await avisar(assunto, linhas, link);
  return json(await publico((await buscar(txt(d.t, 64)))!));
});
