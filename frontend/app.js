// =====================================================================
// app.js: login, menu, Início, Métricas, lista de automações e Interações.
// O editor de automação fica no editor.js.
// =====================================================================

// ---------------------------------------------------------------------
// Modo: teste local (localhost / 127.0.0.1 / arquivo) ou produção.
// ---------------------------------------------------------------------
const CFG = window.APP_CONFIG || {};
const MODO_LOCAL =
  location.protocol === "file:" ||
  ["localhost", "127.0.0.1", "", "[::1]"].includes(location.hostname);

const SUPABASE_CONFIGURADO =
  !!CFG.SUPABASE_URL && !CFG.SUPABASE_URL.includes("SEU_") &&
  !!CFG.SUPABASE_ANON_KEY && !CFG.SUPABASE_ANON_KEY.includes("SUA_") &&
  !!window.supabase;

// No modo local NÃO usamos o Supabase (nem login, nem dados).
const sb = !MODO_LOCAL && SUPABASE_CONFIGURADO
  ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY)
  : null;

// ---------------------------------------------------------------------
// Ícones (SVG simples, sem depender de nada externo).
// ---------------------------------------------------------------------
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  chat: '<path d="M4 5h16v11H8l-4 4z"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  file: '<path d="M14 3H6v18h12V7zM14 3v4h4"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a5.5 5.5 0 0 1 3.5 6"/>',
};
function icon(nome) {
  return `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[nome] || ""}</svg>`;
}
function aplicaIcones(raiz = document) {
  raiz.querySelectorAll("[data-icon]").forEach((el) => {
    if (!el.dataset.iconOk) { el.insertAdjacentHTML("afterbegin", icon(el.dataset.icon)); el.dataset.iconOk = "1"; }
  });
}

// ---------------------------------------------------------------------
// Utilidades.
// ---------------------------------------------------------------------
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");

function toast(msg, tipo = "") {
  const t = document.createElement("div");
  t.className = `toast ${tipo}`;
  t.textContent = msg;
  $("#toast").appendChild(t);
  setTimeout(() => t.remove(), tipo === "warn" ? 6500 : 3500);
}

// localStorage pode falhar (aba anônima, bloqueio): sempre com try/catch.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

// ---------------------------------------------------------------------
// Acesso a dados. TUDO tolerante a falha: sem Supabase, devolve vazio.
// ---------------------------------------------------------------------
const api = {
  async contar(tabela, filtro) {
    if (!sb) return 0;
    try {
      let q = sb.from(tabela).select("*", { count: "exact", head: true });
      if (filtro) q = filtro(q);
      const { count, error } = await q;
      if (error) throw error;
      return count || 0;
    } catch (e) { console.warn("contar", tabela, e); return 0; }
  },
  async listarAutomacoes() {
    if (!sb) return [];
    try {
      const { data, error } = await sb.from("ig_automations").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (e) { console.warn(e); return []; }
  },
  async salvarAutomacao(row) {
    if (!sb) throw new Error("SEM_SUPABASE");
    row.updated_at = new Date().toISOString();
    const q = row.id
      ? sb.from("ig_automations").update(row).eq("id", row.id).select().single()
      : sb.from("ig_automations").insert(row).select().single();
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },
  async ligarAutomacao(id, active) {
    if (!sb) throw new Error("SEM_SUPABASE");
    const { error } = await sb.from("ig_automations").update({ active, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
  },
  async apagarAutomacao(id) {
    if (!sb) throw new Error("SEM_SUPABASE");
    const { error } = await sb.from("ig_automations").delete().eq("id", id);
    if (error) throw error;
  },
  async listarAssets() {
    if (!sb) return [];
    try {
      const { data, error } = await sb.from("ig_assets").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (e) { console.warn(e); return []; }
  },
  async adicionarAsset(row) {
    if (!sb) throw new Error("SEM_SUPABASE");
    const { data, error } = await sb.from("ig_assets").insert(row).select().single();
    if (error) throw error;
    return data;
  },
  // Planilha de leads (visão ig_leads_painel).
  async listarLeads() {
    if (!sb) return [];
    try {
      const { data, error } = await sb.from("ig_leads_painel").select("*").order("ultima_interacao", { ascending: false, nullsFirst: false }).limit(5000);
      if (error) throw error;
      return data || [];
    } catch (e) { console.warn(e); return []; }
  },
  async salvarEtiquetas(igUserId, tags) {
    if (!sb) throw new Error("SEM_SUPABASE");
    const { error } = await sb.from("ig_leads").update({ tags }).eq("ig_user_id", igUserId);
    if (error) throw error;
  },
  // Chama uma Edge Function (com corpo opcional). Sem conexão: devolve null.
  async funcao(nome, body) {
    if (!sb) return null;
    try {
      const { data, error } = await sb.functions.invoke(nome, body ? { body } : undefined);
      if (error) throw error;
      return data;
    } catch (e) { console.warn("função", nome, e); return null; }
  },
};

// =====================================================================
// LOGIN
// =====================================================================
function mostrarLogin(msg = "") {
  $("#app-view").hidden = true;
  $("#login-view").hidden = false;
  $("#login-note-local").hidden = !MODO_LOCAL;
  $("#login-msg").textContent = msg;
  $("#login-btn").disabled = false;
}

$("#login-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const email = $("#login-email").value.trim();
  const senha = $("#login-senha").value;
  const msg = $("#login-msg");
  msg.textContent = "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = "Digite um e-mail válido."; return; }

  // Modo teste local: qualquer e-mail + senha de 5 dígitos.
  if (MODO_LOCAL) {
    if (!/^\d{5}$/.test(senha)) { msg.textContent = "No modo de teste local, a senha precisa ter 5 dígitos (só números)."; return; }
    store.set("login_local", email);
    entrarApp(email);
    return;
  }

  // Produção: Supabase Auth.
  if (!sb) { msg.textContent = "O login ainda não foi configurado (preencha o config.js, veja o LEIA-ME)."; return; }
  $("#login-btn").disabled = true;
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) throw error;
    entrarApp(data.user.email);
  } catch (e) {
    console.warn(e);
    msg.textContent = "E-mail ou senha incorretos.";
  } finally {
    $("#login-btn").disabled = false;
  }
});

$("#logout").addEventListener("click", async () => {
  if (window.Editor?.temAlteracoes() && !confirm("Você tem alterações não salvas. Quer sair mesmo assim?")) return;
  if (MODO_LOCAL) store.del("login_local");
  else if (sb) { try { await sb.auth.signOut(); } catch {} }
  $("#login-senha").value = "";
  mostrarLogin();
});

// =====================================================================
// SHELL (menu e navegação, sem recarregar a página)
// =====================================================================
function entrarApp(email) {
  $("#login-view").hidden = true;
  $("#app-view").hidden = false;
  $("#who").textContent = email || "";
  $("#local-banner").hidden = !MODO_LOCAL;
  irPara(location.hash.replace("#", "") || "inicio");
}

const PAGINAS = ["inicio", "calendario", "instagram"];
function irPara(pagina) {
  if (!PAGINAS.includes(pagina)) pagina = "inicio";
  $$("[data-section]").forEach((s) => (s.hidden = s.dataset.section !== pagina));
  $$(".nav [data-page]").forEach((b) => b.classList.toggle("active", b.dataset.page === pagina));
  $("#app-view").classList.remove("menu-open");
  if (location.hash !== `#${pagina}`) history.replaceState(null, "", `#${pagina}`);
  if (pagina === "inicio") carregarResumo();
  if (pagina === "instagram") abrirAba(store.get("aba_ig") || "metricas");
}

$$(".nav [data-page]").forEach((b) => b.addEventListener("click", () => irPara(b.dataset.page)));
$$("[data-go]").forEach((b) => b.addEventListener("click", () => irPara(b.dataset.go)));
$("#menu-toggle").addEventListener("click", () => $("#app-view").classList.toggle("menu-open"));

// =====================================================================
// INÍCIO
// =====================================================================
async function carregarResumo() {
  const seteDias = new Date(Date.now() - 7 * 86400000).toISOString();
  const [leads, autos, dms] = await Promise.all([
    api.contar("ig_leads"),
    api.contar("ig_automations", (q) => q.eq("active", true)),
    api.contar("ig_deliveries", (q) => q.eq("status", "ok").gte("ts", seteDias)),
  ]);
  $("#st-leads").textContent = fmt(leads);
  $("#st-autos").textContent = fmt(autos);
  $("#st-dms").textContent = fmt(dms);
}

// =====================================================================
// INSTAGRAM: abas
// =====================================================================
function abrirAba(aba) {
  store.set("aba_ig", aba);
  $$("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === aba));
  $$("[data-tabpane]").forEach((p) => (p.hidden = p.dataset.tabpane !== aba));
  if (aba === "metricas") carregarMetricas();
  if (aba === "automacoes") carregarAutomacoes();
  if (aba === "interacoes") carregarInteracoes();
}
$$("[data-tab]").forEach((b) => b.addEventListener("click", () => abrirAba(b.dataset.tab)));

// ---------------------------------------------------------------------
// Métricas
// ---------------------------------------------------------------------
async function carregarMetricas() {
  const box = $("#metricas");
  box.innerHTML = `<p class="sub">Carregando...</p>`;
  const [dados, leads] = await Promise.all([api.funcao("ig-insights"), api.contar("ig_leads")]);

  const cartaoLeads = `<div class="card stat"><span class="label">Leads captados</span><div class="num">${fmt(leads)}</div><div class="foot">total no banco</div></div>`;

  if (!dados || !dados.connected) {
    box.innerHTML = `
      <div class="grid stats" style="margin-bottom:16px">${cartaoLeads}</div>
      <div class="card empty">
        <div class="ico">${icon("chart")}</div>
        <h2>Conecte seu Instagram pra ver as métricas</h2>
        <p>Assim que a conta estiver ligada (veja o LEIA-ME), aparecem aqui os seguidores, os novos seguidores por dia e o alcance.</p>
      </div>`;
    return;
  }

  const soma = (arr) => (arr || []).reduce((t, d) => t + (d.value || 0), 0);
  box.innerHTML = `
    <div class="grid stats">
      <div class="card stat"><span class="label">Seguidores</span><div class="num">${fmt(dados.followers)}</div><div class="foot">@${esc(dados.username)}</div></div>
      <div class="card stat"><span class="label">Novos seguidores</span><div class="num">${fmt(soma(dados.new_followers))}</div><div class="foot">últimos 15 dias</div></div>
      <div class="card stat"><span class="label">Alcance</span><div class="num">${fmt(soma(dados.reach))}</div><div class="foot">soma dos últimos 15 dias</div></div>
      ${cartaoLeads}
    </div>
    <div class="grid charts">
      <div class="card"><h2>Novos seguidores por dia</h2><p class="sub">Passe o mouse nas barras pra ver cada dia.</p><div class="chart" id="ch-seg"></div></div>
      <div class="card"><h2>Alcance por dia</h2><p class="sub">Contas únicas alcançadas.</p><div class="chart" id="ch-alc"></div></div>
    </div>`;
  graficoBarras($("#ch-seg"), dados.new_followers, "novos seguidores");
  graficoBarras($("#ch-alc"), dados.reach, "contas alcançadas");
}

// Gráfico de barras simples em SVG, com tooltip no hover.
function graficoBarras(el, serie, unidade) {
  if (!serie || !serie.length) { el.innerHTML = `<div class="soft-box">Sem dados pra esse período.</div>`; return; }
  const W = 600, H = 160, base = 140, topo = 10;
  const max = Math.max(1, ...serie.map((d) => d.value));
  const larg = W / serie.length;
  const barras = serie.map((d, i) => {
    const h = Math.max(2, ((base - topo) * d.value) / max);
    return `<rect class="bar" data-i="${i}" x="${i * larg + larg * 0.18}" y="${base - h}" width="${larg * 0.64}" height="${h}" rx="3"/>`;
  }).join("");
  const dia = (s) => s.slice(8, 10) + "/" + s.slice(5, 7);
  const eixo = serie.map((d, i) => (i % 3 === 0 || i === serie.length - 1)
    ? `<text class="axis" x="${i * larg + larg / 2}" y="${H - 4}" text-anchor="middle">${dia(d.date)}</text>` : "").join("");
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${barras}${eixo}</svg><div class="tooltip" hidden></div>`;

  const tip = $(".tooltip", el);
  $$("rect.bar", el).forEach((r) => {
    r.addEventListener("mouseenter", () => {
      const d = serie[r.dataset.i];
      const box = r.getBoundingClientRect(), pai = el.getBoundingClientRect();
      tip.textContent = `${dia(d.date)}: ${fmt(d.value)} ${unidade}`;
      tip.style.left = `${box.left - pai.left + box.width / 2}px`;
      tip.style.top = `${box.top - pai.top}px`;
      tip.hidden = false;
    });
    r.addEventListener("mouseleave", () => (tip.hidden = true));
  });
}

// ---------------------------------------------------------------------
// Lista de automações
// ---------------------------------------------------------------------
let automacoesCache = [];

async function carregarAutomacoes() {
  const box = $("#lista-automacoes");
  box.innerHTML = `<p class="sub">Carregando...</p>`;
  automacoesCache = await api.listarAutomacoes();

  if (!automacoesCache.length) {
    box.innerHTML = `
      <div class="card empty">
        <div class="ico">${icon("chat")}</div>
        <h2>Nenhuma automação ainda</h2>
        <p>Crie a primeira: escolha a palavra que as pessoas comentam e a mensagem que elas recebem no direct.</p>
        <button class="btn primary" data-nova>${icon("plus")} Nova automação</button>
      </div>`;
    $("[data-nova]", box).addEventListener("click", () => Editor.abrir());
    return;
  }

  box.innerHTML = `<div class="auto-list">${automacoesCache.map((a) => {
    const kws = a.match_any
      ? `<span class="chip">qualquer palavra</span>`
      : String(a.keyword || "").split(",").map((k) => k.trim()).filter(Boolean).map((k) => `<span class="chip">${esc(k)}</span>`).join("");
    const ids = a.media_ids || [];
    const thumb = ids.length
      ? `<a class="auto-thumb" data-thumb="${esc(ids[0])}" target="_blank" rel="noopener" aria-label="Post vinculado">${icon("instagram")}${ids.length > 1 ? `<span class="mais">+${ids.length - 1}</span>` : ""}</a>`
      : `<div class="auto-thumb todos" title="Vale pra todos os posts">Todos os posts</div>`;
    return `
      <div class="card auto-row" data-id="${a.id}">
        ${thumb}
        <div class="info">
          <h3>${esc(a.nome || "Automação sem nome")}</h3>
          <div class="kws">${kws}${a.media_ids?.length ? `<span class="chip">${a.media_ids.length} post(s)</span>` : `<span class="chip">todos os posts</span>`}</div>
        </div>
        <div class="acts">
          <label class="switch" title="Ligar ou desligar">
            <input type="checkbox" data-toggle ${a.active ? "checked" : ""}><span class="track"></span>
          </label>
          <span class="badge ${a.active ? "on" : "off"}">${a.active ? "Ligada" : "Desligada"}</span>
          <button class="icon-btn" data-editar title="Editar">${icon("edit")}</button>
          <button class="icon-btn" data-apagar title="Apagar">${icon("trash")}</button>
        </div>
      </div>`;
  }).join("")}</div>`;

  $$(".auto-row", box).forEach((row) => {
    const a = automacoesCache.find((x) => x.id === row.dataset.id);
    $("[data-editar]", row).addEventListener("click", () => Editor.abrir(a));
    $("[data-apagar]", row).addEventListener("click", async () => {
      if (!confirm(`Apagar a automação "${a.nome || "sem nome"}"? Isso não tem volta.`)) return;
      try { await api.apagarAutomacao(a.id); toast("Automação apagada.", "ok"); carregarAutomacoes(); }
      catch (e) { console.warn(e); toast("Não consegui apagar. Tente de novo.", "err"); }
    });
    $("[data-toggle]", row).addEventListener("change", async (ev) => {
      try {
        await api.ligarAutomacao(a.id, ev.target.checked);
        toast(ev.target.checked ? "Automação ligada." : "Automação desligada.", "ok");
        carregarAutomacoes();
      } catch (e) { console.warn(e); ev.target.checked = !ev.target.checked; toast("Não consegui alterar. Tente de novo.", "err"); }
    });
  });

  carregarMiniaturas(box);
}

// Miniatura do post vinculado a cada automação (busca só os que faltam).
const midiasCache = new Map();
async function carregarMiniaturas(box) {
  const ids = [...new Set(automacoesCache.map((a) => a.media_ids?.[0]).filter(Boolean))];
  const faltam = ids.filter((id) => !midiasCache.has(id));
  if (faltam.length) {
    const r = await api.funcao("ig-media", { ids: faltam });
    (r?.posts || []).forEach((p) => midiasCache.set(p.id, p));
  }
  $$("[data-thumb]", box).forEach((el) => {
    const p = midiasCache.get(el.dataset.thumb);
    if (!p) { el.title = "Post não encontrado (pode ter sido apagado)"; return; }
    el.href = p.link || "";
    el.title = p.legenda ? `Ver post: ${p.legenda}` : "Ver post";
    if (p.miniatura) {
      const mais = $(".mais", el)?.outerHTML || "";
      el.innerHTML = `<img src="${esc(p.miniatura)}" alt="" loading="lazy">${mais}`;
    }
  });
}

$("#nova-automacao").addEventListener("click", () => Editor.abrir());

// ---------------------------------------------------------------------
// Interações: todos os leads como uma planilha (busca, filtros,
// ordenação, etiquetas editáveis e download em CSV).
// ---------------------------------------------------------------------
let leadsCache = [];
const leadsUI = { busca: "", origem: "", etiqueta: "", ordem: "ultima", desc: true };

const ORIGENS = { comment: "Comentário", dm: "Direct", story_reply: "Resposta ao story" };
const dataHora = (s) => s ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
const dataCurta = (s) => s ? new Date(s).toLocaleDateString("pt-BR") : "";
function haQuanto(s) {
  if (!s) return "";
  const min = Math.round((Date.now() - new Date(s)) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d < 30 ? `há ${d} dia${d > 1 ? "s" : ""}` : dataCurta(s);
}
const ultimaVez = (l) => l.ultima_interacao || l.updated_at;
const palavraDe = (l) => (l.last_keyword === "*" ? "qualquer palavra" : l.last_keyword || "");
const zap = (t) => {
  const d = String(t || "").replace(/\D/g, "");
  return d.length === 10 || d.length === 11 ? "55" + d : d;
};

// Cada coluna: título, valor pra ordenar/CSV e a célula em HTML.
const COLUNAS = [
  { id: "usuario", titulo: "Usuário", valor: (l) => l.username || l.ig_user_id,
    cel: (l) => `<td class="user">${l.username
      ? `<a href="https://www.instagram.com/${encodeURIComponent(l.username)}/" target="_blank" rel="noopener">@${esc(l.username)}</a>`
      : `<span class="muted">sem @</span>`}<small>ID ${esc(l.ig_user_id)}</small></td>` },
  { id: "origem", titulo: "Origem", valor: (l) => ORIGENS[l.last_source] || l.last_source || "",
    cel: (l) => `<td>${esc(ORIGENS[l.last_source] || l.last_source || "")}</td>` },
  { id: "palavra", titulo: "Palavra", valor: palavraDe,
    cel: (l) => `<td>${palavraDe(l) ? `<span class="chip">${esc(palavraDe(l))}</span>` : ""}</td>` },
  { id: "automacao", titulo: "Automação", valor: (l) => l.automacao_nome || "",
    cel: (l) => `<td>${esc(l.automacao_nome || "")}</td>` },
  { id: "contato", titulo: "Contato", valor: (l) => [l.email, l.telefone].filter(Boolean).join(" / "),
    cel: (l) => `<td class="contato">${[
      l.email ? `<a href="mailto:${esc(l.email)}">${esc(l.email)}</a>` : "",
      l.telefone ? `<a href="https://wa.me/${zap(l.telefone)}" target="_blank" rel="noopener" title="Abrir no WhatsApp">${esc(l.telefone)}</a>` : "",
    ].join("") || `<span class="muted">sem contato</span>`}</td>` },
  { id: "etiquetas", titulo: "Etiquetas", valor: (l) => (l.tags || []).join(", "),
    cel: (l) => `<td><div class="lead-tags" data-tags="${esc(l.ig_user_id)}">${(l.tags || []).map((t) => `<span class="chip">${esc(t)}</span>`).join("")}
      <button class="icon-btn" data-editar-tags title="Editar etiquetas" aria-label="Editar etiquetas de ${esc(l.username || l.ig_user_id)}">${icon("edit")}</button></div></td>` },
  { id: "interacoes", titulo: "Interações", valor: (l) => l.interacoes || 0, num: true,
    cel: (l) => `<td class="num">${fmt(l.interacoes)}</td>` },
  { id: "enviadas", titulo: "Mensagens enviadas", valor: (l) => l.mensagens_enviadas || 0, num: true,
    cel: (l) => `<td class="num">${fmt(l.mensagens_enviadas)}</td>` },
  { id: "link", titulo: "Link enviado", valor: (l) => (l.link_sent ? "Sim" : "Não"),
    cel: (l) => `<td>${l.link_sent ? `<span class="badge on">Sim</span>` : `<span class="badge off">Não</span>`}</td>` },
  { id: "etapa", titulo: "Etapa", valor: (l) => (l.expecting?.field ? `aguardando ${l.expecting.field}` : l.flow_step ? `passo ${l.flow_step}` : ""),
    cel: (l) => `<td>${l.expecting?.field ? `<span class="badge on">aguardando ${esc(l.expecting.field)}</span>` : l.flow_step ? `passo ${esc(l.flow_step)}` : ""}</td>` },
  { id: "primeira", titulo: "Primeira vez", valor: (l) => l.created_at || "", data: true,
    cel: (l) => `<td title="${esc(dataHora(l.created_at))}">${esc(dataCurta(l.created_at))}</td>` },
  { id: "ultima", titulo: "Última vez", valor: (l) => ultimaVez(l) || "", data: true,
    cel: (l) => `<td title="${esc(dataHora(ultimaVez(l)))}">${esc(haQuanto(ultimaVez(l)))}</td>` },
];

async function carregarInteracoes() {
  const tabela = $("#leads-tabela");
  tabela.innerHTML = `<p class="sub" style="padding:16px">Carregando...</p>`;
  leadsCache = await api.listarLeads();

  const seteDias = Date.now() - 7 * 86400000;
  const comContato = leadsCache.filter((l) => l.email || l.telefone).length;
  const novos = leadsCache.filter((l) => new Date(l.created_at) >= seteDias).length;
  const interacoes = leadsCache.reduce((t, l) => t + (l.interacoes || 0), 0);
  $("#interacoes-resumo").innerHTML = `
    <div class="card stat"><span class="label">Leads</span><div class="num">${fmt(leadsCache.length)}</div><div class="foot">pessoas que interagiram</div></div>
    <div class="card stat"><span class="label">Com contato</span><div class="num">${fmt(comContato)}</div><div class="foot">deixaram e-mail ou telefone</div></div>
    <div class="card stat"><span class="label">Novos</span><div class="num">${fmt(novos)}</div><div class="foot">últimos 7 dias</div></div>
    <div class="card stat"><span class="label">Interações</span><div class="num">${fmt(interacoes)}</div><div class="foot">comentários, cliques e respostas</div></div>`;

  atualizaLeads();
}

function leadsFiltrados() {
  const q = leadsUI.busca.trim().toLowerCase();
  const col = COLUNAS.find((c) => c.id === leadsUI.ordem) || COLUNAS[COLUNAS.length - 1];
  return leadsCache
    .filter((l) => !leadsUI.origem || l.last_source === leadsUI.origem)
    .filter((l) => !leadsUI.etiqueta || (l.tags || []).includes(leadsUI.etiqueta))
    .filter((l) => !q || [l.username, l.ig_user_id, l.email, l.telefone, l.last_keyword, l.automacao_nome, ...(l.tags || [])]
      .some((v) => String(v || "").toLowerCase().includes(q)))
    .sort((a, b) => {
      const va = col.valor(a), vb = col.valor(b);
      const r = col.num ? va - vb : col.data ? new Date(va || 0) - new Date(vb || 0) : String(va).localeCompare(String(vb), "pt-BR");
      return leadsUI.desc ? -r : r;
    });
}

function renderLeads() {
  const tabela = $("#leads-tabela");
  const linhas = leadsFiltrados();
  $("#leads-rodape").textContent = leadsCache.length
    ? `${fmt(linhas.length)} de ${fmt(leadsCache.length)} lead(s). Toque no título de uma coluna pra ordenar.`
    : "";

  if (!leadsCache.length) {
    tabela.innerHTML = `
      <div class="empty">
        <div class="ico">${icon("users")}</div>
        <h2>Nenhum lead ainda</h2>
        <p>Quando alguém comentar a palavra de uma automação, a pessoa aparece aqui com o contato, as etiquetas e o histórico.</p>
      </div>`;
    return;
  }
  if (!linhas.length) { tabela.innerHTML = `<div class="soft-box" style="margin:16px">Nenhum lead com esses filtros.</div>`; return; }

  tabela.innerHTML = `
    <table class="leads-table">
      <thead><tr>${COLUNAS.map((c) => `<th scope="col" ${c.id === leadsUI.ordem ? `aria-sort="${leadsUI.desc ? "descending" : "ascending"}"` : ""} ${c.num ? `style="text-align:right"` : ""}>
        <button data-ordem="${c.id}">${c.titulo}${c.id === leadsUI.ordem ? (leadsUI.desc ? " ↓" : " ↑") : ""}</button></th>`).join("")}</tr></thead>
      <tbody>${linhas.map((l) => `<tr>${COLUNAS.map((c) => c.cel(l)).join("")}</tr>`).join("")}</tbody>
    </table>`;

  $$("[data-ordem]", tabela).forEach((b) => b.addEventListener("click", () => {
    if (leadsUI.ordem === b.dataset.ordem) leadsUI.desc = !leadsUI.desc;
    else {
      // Números e datas começam do maior/mais recente; textos, de A a Z.
      const col = COLUNAS.find((c) => c.id === b.dataset.ordem);
      leadsUI.ordem = col.id;
      leadsUI.desc = !!(col.num || col.data);
    }
    renderLeads();
  }));
  $$("[data-editar-tags]", tabela).forEach((b) => b.addEventListener("click", () => editarEtiquetas(b.closest("[data-tags]"))));
}

// Edição das etiquetas direto na célula (separadas por vírgula).
function editarEtiquetas(cel) {
  const lead = leadsCache.find((l) => l.ig_user_id === cel.dataset.tags);
  if (!lead) return;
  cel.innerHTML = `<input class="input" value="${esc((lead.tags || []).join(", "))}" placeholder="cliente, vip, quente" aria-label="Etiquetas separadas por vírgula">`;
  const inp = $("input", cel);
  inp.focus();
  let feito = false;
  const salvar = async () => {
    if (feito) return;
    feito = true;
    const tags = [...new Set(inp.value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
    try {
      await api.salvarEtiquetas(lead.ig_user_id, tags);
      lead.tags = tags;
      toast("Etiquetas salvas.", "ok");
    } catch (e) { console.warn(e); toast("Não consegui salvar as etiquetas.", "err"); }
    atualizaLeads();
  };
  inp.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); salvar(); }
    if (ev.key === "Escape") { feito = true; renderLeads(); }
  });
  inp.addEventListener("blur", salvar);
}
// Atualiza o filtro de etiquetas e a tabela sem ir no banco de novo.
function atualizaLeads() {
  const etiquetas = [...new Set(leadsCache.flatMap((l) => l.tags || []))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  if (leadsUI.etiqueta && !etiquetas.includes(leadsUI.etiqueta)) leadsUI.etiqueta = "";
  $("#lead-etiqueta").innerHTML = `<option value="">Todas as etiquetas</option>` +
    etiquetas.map((t) => `<option value="${esc(t)}" ${t === leadsUI.etiqueta ? "selected" : ""}>${esc(t)}</option>`).join("");
  renderLeads();
}

// Baixa o que está filtrado como CSV (abre no Excel e no Google Planilhas).
function baixarCsv() {
  const linhas = leadsFiltrados();
  if (!linhas.length) { toast("Não há leads pra baixar.", "warn"); return; }
  const cel = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const cab = ["Usuário", "ID Instagram", "Origem", "Palavra", "Automação", "E-mail", "Telefone", "Etiquetas",
    "Interações", "Mensagens enviadas", "Link enviado", "Etapa", "Primeira vez", "Última vez", "Outros dados"];
  const corpo = linhas.map((l) => [
    l.username ? "@" + l.username : "", l.ig_user_id, ORIGENS[l.last_source] || l.last_source || "", palavraDe(l),
    l.automacao_nome || "", l.email || "", l.telefone || "", (l.tags || []).join(", "),
    l.interacoes || 0, l.mensagens_enviadas || 0, l.link_sent ? "Sim" : "Não",
    COLUNAS.find((c) => c.id === "etapa").valor(l), dataHora(l.created_at), dataHora(ultimaVez(l)),
    l.dados && Object.keys(l.dados).length ? JSON.stringify(l.dados) : "",
  ].map(cel).join(";"));
  const blob = new Blob(["﻿" + [cab.map(cel).join(";"), ...corpo].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `leads-instagram-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$("#lead-busca").addEventListener("input", (ev) => { leadsUI.busca = ev.target.value; renderLeads(); });
$("#lead-origem").addEventListener("change", (ev) => { leadsUI.origem = ev.target.value; renderLeads(); });
$("#lead-etiqueta").addEventListener("change", (ev) => { leadsUI.etiqueta = ev.target.value; renderLeads(); });
$("#lead-csv").addEventListener("click", baixarCsv);

// =====================================================================
// INÍCIO DO APP
// =====================================================================
async function iniciar() {
  aplicaIcones();

  if (MODO_LOCAL) {
    const email = store.get("login_local");
    email ? entrarApp(email) : mostrarLogin();
    return;
  }

  if (!sb) { mostrarLogin(); return; }
  try {
    const { data } = await sb.auth.getSession();
    data.session ? entrarApp(data.session.user.email) : mostrarLogin();
  } catch { mostrarLogin(); }

  // Sessão expirou ou saiu em outra aba: volta pro login.
  sb.auth.onAuthStateChange((evento, sessao) => {
    if (!sessao && evento !== "INITIAL_SESSION") mostrarLogin(evento === "SIGNED_OUT" ? "" : "Sua sessão expirou. Entre de novo.");
  });
}

window.addEventListener("hashchange", () => {
  if (!$("#app-view").hidden) irPara(location.hash.replace("#", ""));
});

document.addEventListener("DOMContentLoaded", iniciar);
