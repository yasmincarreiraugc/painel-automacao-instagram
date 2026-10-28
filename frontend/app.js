// =====================================================================
// app.js: login, menu, Início, Métricas e lista de automações.
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
  // Chama uma Edge Function. Sem conexão: devolve null.
  async funcao(nome) {
    if (!sb) return null;
    try {
      const { data, error } = await sb.functions.invoke(nome);
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
    return `
      <div class="card auto-row" data-id="${a.id}">
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
}

$("#nova-automacao").addEventListener("click", () => Editor.abrir());

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
