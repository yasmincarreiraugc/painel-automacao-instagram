// =====================================================================
// site-track: recebe as visitas do site do portfólio (contador.js).
// Grava em site_eventos: página vista, vídeo aberto ou clique em link.
// Anônimo: não guarda IP, nome nem cookie. Só aceita o domínio do site.
// Publique com --no-verify-jwt (o site chama sem login).
// =====================================================================
import { db } from "../_shared/ig.ts";

const PERMITIDOS = ["yasmincarreira.com", "www.yasmincarreira.com"];
const ROBOS = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|whatsapp/i;
const CORS = { "Access-Control-Allow-Origin": "*" };
const vazio = (status = 204) => new Response(null, { status, headers: CORS });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...CORS, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "content-type" },
    });
  }
  if (req.method !== "POST") return vazio(405);

  // Só o site do portfólio pode mandar eventos.
  let host = "";
  try { host = new URL(req.headers.get("origin") ?? "").hostname; } catch { /* sem origem */ }
  if (!PERMITIDOS.includes(host)) return vazio();
  if (ROBOS.test(req.headers.get("user-agent") ?? "")) return vazio();

  const raw = await req.text();
  if (raw.length > 2000) return vazio();
  let d: any;
  try { d = JSON.parse(raw); } catch { return vazio(); }

  const tipo = ["view", "video", "click"].includes(d?.t) ? d.t : null;
  if (!tipo) return vazio();
  const txt = (v: unknown, n: number) => String(v ?? "").slice(0, n);
  const largura = Number(d.w) || 0;
  // "/portfolio", "/portfolio/" e "/portfolio/index.html" são a mesma página.
  let path = txt(d.p, 200).replace(/\/index\.html$/, "/") || "/";
  if (!/\.[a-z0-9]+$/i.test(path) && !path.endsWith("/")) path += "/";

  const { error } = await db.from("site_eventos").insert({
    tipo,
    path,
    ref: txt(d.r, 100).toLowerCase().replace(/^www\./, ""),
    utm: txt(d.u, 60).toLowerCase(),
    dispositivo: largura ? (largura < 768 ? "celular" : "computador") : "",
    visitante: txt(d.v, 24),
    sessao: txt(d.s, 24),
    alvo: txt(d.a, 100),
    rotulo: txt(d.l, 120),
  });
  if (error) console.warn("site-track:", error.message);
  return vazio();
});
