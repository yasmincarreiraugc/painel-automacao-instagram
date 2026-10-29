// =====================================================================
// negocio.js: Campanhas e Roteiros.
// Dados no Supabase (tabelas campanhas e roteiros). No modo de teste
// local, ficam guardados no navegador.
// Usa as peças do app.js: sb, $, $$, esc, fmt, icon, toast, store.
// =====================================================================

// Acesso genérico a uma tabela (Supabase ou navegador).
function tabela(nome, ordem = "created_at") {
  const chave = `local_${nome}`;
  const ler = () => { try { return JSON.parse(store.get(chave) || "[]"); } catch { return []; } };
  const gravar = (l) => store.set(chave, JSON.stringify(l));
  return {
    async listar() {
      if (!sb) return ler();
      const { data, error } = await sb.from(nome).select("*").order(ordem, { ascending: false });
      if (error) throw error;
      return data || [];
    },
    async salvar(row) {
      row.updated_at = new Date().toISOString();
      if (!sb) {
        const l = ler();
        if (!row.id) { row.id = crypto.randomUUID(); row.created_at = row.updated_at; l.unshift(row); }
        else l.splice(l.findIndex((x) => x.id === row.id), 1, { ...l.find((x) => x.id === row.id), ...row });
        gravar(l);
        return l.find((x) => x.id === row.id);
      }
      const q = row.id
        ? sb.from(nome).update(row).eq("id", row.id).select().single()
        : sb.from(nome).insert(row).select().single();
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    async apagar(id) {
      if (!sb) { gravar(ler().filter((x) => x.id !== id)); return; }
      const { error } = await sb.from(nome).delete().eq("id", id);
      if (error) throw error;
    },
  };
}

const reais = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const diasAte = (iso) => Math.round((new Date(iso + "T12:00:00") - new Date(hojeIso() + "T12:00:00")) / 86400000);
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const diaMes = (iso) => { const [, m, d] = iso.split("-").map(Number); return `${d} de ${MESES_CURTOS[m - 1]}`; };
function prazoTexto(iso) {
  if (!iso) return "";
  const n = diasAte(iso);
  return n < 0 ? `atrasada ${-n} dia(s)` : n === 0 ? "é hoje" : n === 1 ? "amanhã" : `em ${n} dias`;
}

// Monta uma janela (dialog) uma vez só e devolve o elemento.
function janela(id, html) {
  let d = document.getElementById(id);
  if (!d) {
    d = document.createElement("dialog");
    d.className = "dialogo";
    d.id = id;
    document.body.appendChild(d);
  }
  d.innerHTML = html;
  return d;
}

// ---------------------------------------------------------------------
// CAMPANHAS
// ---------------------------------------------------------------------
window.Campanhas = (() => {
  const db = tabela("campanhas");
  const ORIGENS = [
    { id: "instagram", nome: "Instagram", cor: "#ff99d9" },
    { id: "indicacao", nome: "Indicação", cor: "#78b4f4" },
    { id: "agencia", nome: "Agência", cor: "#f2db33" },
    { id: "plataforma", nome: "Plataforma UGC", cor: "#1e1915" },
    { id: "email", nome: "E-mail", cor: "#b9a7f5" },
    { id: "outro", nome: "Outro", cor: "#c9c2b8" },
  ];
  const STATUS = [
    { id: "negociando", nome: "Negociando" },
    { id: "ativa", nome: "Ativa" },
    { id: "entregue", nome: "Entregue" },
    { id: "finalizada", nome: "Finalizada" },
  ];
  const origem = (id) => ORIGENS.find((o) => o.id === id) || ORIGENS[ORIGENS.length - 1];
  const statusNome = (id) => STATUS.find((s) => s.id === id)?.nome || id;
  let lista = [];
  let filtro = "ativas";
  let ligado = false;

  async function carregar() {
    try { lista = await db.listar(); } catch (e) { console.warn(e); lista = []; toast("Não consegui carregar as campanhas.", "err"); }
    return lista;
  }

  // Números usados aqui e no Início.
  function resumo(l = lista) {
    const mes = hojeIso().slice(0, 7);
    const abertas = l.filter((c) => ["ativa", "entregue"].includes(c.status) && !c.pago);
    const proximas = l.filter((c) => ["ativa", "negociando"].includes(c.status) && c.prazo_entrega && c.prazo_entrega >= hojeIso())
      .sort((a, b) => a.prazo_entrega.localeCompare(b.prazo_entrega));
    return {
      aReceber: abertas.reduce((t, c) => t + Number(c.valor || 0), 0),
      nAReceber: abertas.length,
      recebidoMes: l.filter((c) => c.pago && (c.data_pagamento || "").startsWith(mes)).reduce((t, c) => t + Number(c.valor || 0), 0),
      ativas: l.filter((c) => c.status === "ativa").length,
      negociando: l.filter((c) => c.status === "negociando").length,
      proximas,
      atrasadas: l.filter((c) => c.status === "ativa" && c.prazo_entrega && c.prazo_entrega < hojeIso()),
    };
  }

  async function abrir() {
    ligar();
    $("#campanhas-conteudo").innerHTML = `<p class="sub">Carregando...</p>`;
    await carregar();
    render();
  }

  function render() {
    const r = resumo();
    const prox = r.proximas[0];
    const visiveis = lista.filter((c) => filtro === "todas" ? true
      : filtro === "ativas" ? ["negociando", "ativa"].includes(c.status) : ["entregue", "finalizada"].includes(c.status));
    const nAtivas = lista.filter((c) => ["negociando", "ativa"].includes(c.status)).length;

    $("#campanhas-conteudo").innerHTML = `
      <div class="grid tons">
        <div class="tom rosa"><span>A receber</span><b class="valor">${reais(r.aReceber)}</b><small>${r.nAReceber} campanha(s) sem pagamento</small></div>
        <div class="tom amarelo"><span>Recebido no mês</span><b class="valor">${reais(r.recebidoMes)}</b><small>marcado como pago</small></div>
        <div class="tom azul"><span>Ativas</span><b>${r.ativas}</b><small>${r.negociando ? `+ ${r.negociando} negociando` : "em produção agora"}</small></div>
        <div class="tom creme"><span>Próxima entrega</span><b>${prox ? diaMes(prox.prazo_entrega) : "nenhuma"}</b><small>${prox ? esc(prox.marca) + ", " + prazoTexto(prox.prazo_entrega) : "sem prazo marcado"}</small></div>
      </div>
      <div class="grid dois">
        <div class="card"><h2>${icon("target")} De onde vêm suas campanhas</h2>${rosca()}</div>
        <div class="card"><h2>${icon("money")} Quem te deu mais retorno</h2>${retorno()}</div>
      </div>
      <div class="periodos" role="group" aria-label="Filtrar campanhas" style="margin:22px 0 14px">
        ${[["ativas", `Ativas ${nAtivas}`], ["finalizadas", "Finalizadas"], ["todas", `Todas ${lista.length}`]].map(([v, t]) =>
          `<button class="seg ${v === filtro ? "on" : ""}" data-filtro-camp="${v}">${t}</button>`).join("")}
      </div>
      ${visiveis.length ? `<div class="camp-grade">${visiveis.map(cartao).join("")}</div>` : `
        <div class="card empty"><div class="ico">${icon("briefcase")}</div><h2>${lista.length ? "Nada nesse filtro" : "Nenhuma campanha ainda"}</h2>
          <p>Cadastre a marca, o valor e o prazo. O Início passa a mostrar os prazos e o dinheiro a receber.</p>
          <button class="btn primary" data-camp-nova>${icon("plus")} Nova campanha</button></div>`}`;

    $$("[data-filtro-camp]").forEach((b) => b.addEventListener("click", () => { filtro = b.dataset.filtroCamp; render(); }));
    $$("[data-camp-nova]").forEach((b) => b.addEventListener("click", () => editar(null)));
    $$("[data-camp]").forEach((el) => el.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-pago]")) return;
      editar(lista.find((c) => c.id === el.dataset.camp));
    }));
    $$("[data-pago]").forEach((inp) => inp.addEventListener("change", async () => {
      const c = lista.find((x) => x.id === inp.dataset.pago);
      try {
        Object.assign(c, await db.salvar({ id: c.id, pago: inp.checked, data_pagamento: inp.checked ? (c.data_pagamento || hojeIso()) : null }));
        toast(inp.checked ? "Marcada como paga." : "Pagamento desmarcado.", "ok");
        render();
      } catch (e) { console.warn(e); inp.checked = !inp.checked; toast("Não consegui salvar.", "err"); }
    }));
  }

  function cartao(c) {
    const atrasada = c.status === "ativa" && c.prazo_entrega && c.prazo_entrega < hojeIso();
    return `
      <article class="card camp" data-camp="${c.id}" tabindex="0" role="button" aria-label="Abrir campanha ${esc(c.marca)}">
        <div class="camp-topo">
          <span class="camp-origem" style="--c:${origem(c.origem).cor}">${esc(origem(c.origem).nome)}</span>
          <span class="badge st-${c.status}">${statusNome(c.status)}</span>
        </div>
        <h3>${esc(c.marca)}</h3>
        <b class="camp-valor valor">${reais(c.valor)}</b>
        ${c.entregaveis ? `<p class="camp-entrega">${esc(c.entregaveis)}</p>` : ""}
        <div class="camp-rodape">
          <span class="${atrasada ? "atraso" : ""}">${icon("clock")} ${c.prazo_entrega ? `${diaMes(c.prazo_entrega)} · ${prazoTexto(c.prazo_entrega)}` : "sem prazo"}</span>
          <label class="pago-chk" title="Pagamento recebido"><input type="checkbox" data-pago="${c.id}" ${c.pago ? "checked" : ""}> pago</label>
        </div>
      </article>`;
  }

  // Rosca (donut) por origem.
  function rosca() {
    if (!lista.length) return `<div class="soft-box" style="margin-top:12px">As origens aparecem quando você cadastrar campanhas.</div>`;
    const cont = ORIGENS.map((o) => ({ ...o, n: lista.filter((c) => (c.origem || "outro") === o.id).length })).filter((o) => o.n);
    const total = cont.reduce((t, o) => t + o.n, 0);
    let ang = 0;
    const R = 52, C = 2 * Math.PI * R;
    const arcos = cont.map((o) => {
      const frac = o.n / total;
      const s = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${o.cor}" stroke-width="22" stroke-dasharray="${frac * C} ${C}" stroke-dashoffset="${-ang * C}" transform="rotate(-90 70 70)"/>`;
      ang += frac;
      return s;
    }).join("");
    return `
      <div class="rosca">
        <svg viewBox="0 0 140 140" role="img" aria-label="Campanhas por origem">${arcos}
          <text x="70" y="68" text-anchor="middle" class="rosca-n">${total}</text><text x="70" y="86" text-anchor="middle" class="rosca-t">campanhas</text></svg>
        <ul>${cont.map((o) => `<li><i style="background:${o.cor}"></i>${o.nome}<b>${o.n}</b></li>`).join("")}</ul>
      </div>`;
  }

  // Barras: soma de valor por marca.
  function retorno() {
    const soma = new Map();
    lista.forEach((c) => soma.set(c.marca, (soma.get(c.marca) || 0) + Number(c.valor || 0)));
    const top = [...soma.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
    if (!top.length) return `<div class="soft-box" style="margin-top:12px">As marcas que mais pagaram aparecem aqui.</div>`;
    const max = top[0][1] || 1;
    const cores = ["#78b4f4", "#ff99d9", "#f2db33", "#1e1915", "#b9a7f5", "#c9c2b8", "#78b4f4"];
    return `<ol class="retorno">${top.map(([m, v], i) => `
      <li><span class="nome">${esc(m)}</span><span class="barra"><i style="width:${Math.max(4, (v / max) * 100)}%;background:${cores[i]}"></i></span><b class="valor">${reais(v)}</b></li>`).join("")}</ol>`;
  }

  function editar(c) {
    const d = janela("camp-dialog", `
      <form method="dialog" id="camp-form">
        <h2>${c ? "Editar campanha" : "Nova campanha"}</h2>
        <label class="label" for="cp-marca">Marca ou cliente</label>
        <input class="input" id="cp-marca" required maxlength="80" value="${esc(c?.marca || "")}">
        <div class="dialogo-linha">
          <div><label class="label" for="cp-valor">Valor (R$)</label><input class="input" id="cp-valor" type="number" min="0" step="0.01" value="${c ? Number(c.valor) : ""}"></div>
          <div><label class="label" for="cp-prazo">Prazo de entrega</label><input class="input" id="cp-prazo" type="date" value="${c?.prazo_entrega || ""}"></div>
          <div><label class="label" for="cp-status">Situação</label><select class="input" id="cp-status">${STATUS.map((s) => `<option value="${s.id}" ${(c?.status || "ativa") === s.id ? "selected" : ""}>${s.nome}</option>`).join("")}</select></div>
        </div>
        <label class="label" for="cp-origem">De onde veio</label>
        <select class="input" id="cp-origem">${ORIGENS.map((o) => `<option value="${o.id}" ${(c?.origem || "instagram") === o.id ? "selected" : ""}>${o.nome}</option>`).join("")}</select>
        <label class="label" for="cp-entregaveis">Entregáveis</label>
        <input class="input" id="cp-entregaveis" maxlength="200" placeholder="Ex: 2 reels + 3 stories" value="${esc(c?.entregaveis || "")}">
        <label class="label" for="cp-notas">Observações</label>
        <textarea class="input" id="cp-notas" rows="3" maxlength="2000" placeholder="Briefing, contato, combinados...">${esc(c?.notas || "")}</textarea>
        <div class="dialogo-linha dois-col">
          <label class="switch" style="margin-top:14px"><input type="checkbox" id="cp-pago" ${c?.pago ? "checked" : ""}><span class="track"></span> Pagamento recebido</label>
          <div><label class="label" for="cp-datapag">Data do pagamento</label><input class="input" id="cp-datapag" type="date" value="${c?.data_pagamento || ""}"></div>
        </div>
        <div class="dialogo-acoes">
          ${c ? `<button class="btn danger" type="button" id="cp-apagar">Apagar</button>` : ""}
          <span style="flex:1"></span>
          <button class="btn" type="button" id="cp-cancelar">Cancelar</button>
          <button class="btn primary" type="submit">Salvar</button>
        </div>
      </form>`);
    d.showModal();
    $("#cp-marca", d).focus();
    $("#cp-cancelar", d).addEventListener("click", () => d.close());
    $("#cp-apagar", d)?.addEventListener("click", async () => {
      if (!confirm(`Apagar a campanha "${c.marca}"?`)) return;
      try { await db.apagar(c.id); d.close(); toast("Campanha apagada.", "ok"); abrir(); }
      catch (e) { console.warn(e); toast("Não consegui apagar.", "err"); }
    });
    $("#camp-form", d).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const pago = $("#cp-pago", d).checked;
      const row = {
        ...(c ? { id: c.id } : {}),
        marca: $("#cp-marca", d).value.trim(),
        valor: Number($("#cp-valor", d).value || 0),
        prazo_entrega: $("#cp-prazo", d).value || null,
        status: $("#cp-status", d).value,
        origem: $("#cp-origem", d).value,
        entregaveis: $("#cp-entregaveis", d).value.trim(),
        notas: $("#cp-notas", d).value.trim(),
        pago,
        data_pagamento: pago ? ($("#cp-datapag", d).value || hojeIso()) : null,
      };
      if (!row.marca) return;
      try { await db.salvar(row); d.close(); toast(c ? "Campanha atualizada." : "Campanha criada.", "ok"); abrir(); }
      catch (e) { console.warn(e); toast("Não consegui salvar a campanha.", "err"); }
    });
  }

  function ligar() {
    if (ligado) return;
    ligado = true;
    $("#campanha-nova").addEventListener("click", () => editar(null));
  }

  return { abrir, carregar, resumo, reais, editar };
})();

// ---------------------------------------------------------------------
// ROTEIROS: quadro por etapa (ideia > escrevendo > pronto > gravado > postado)
// ---------------------------------------------------------------------
window.Roteiros = (() => {
  const db = tabela("roteiros", "updated_at");
  const ETAPAS = [
    { id: "ideia", nome: "Ideia", cor: "#fff2c2" },
    { id: "escrevendo", nome: "Escrevendo", cor: "#ffd6ef" },
    { id: "pronto", nome: "Pronto pra gravar", cor: "#d7e8fc" },
    { id: "gravado", nome: "Gravado", cor: "#e4f4e2" },
    { id: "postado", nome: "Postado", cor: "#ebe5dc" },
  ];
  const FORMATOS = ["reels", "tiktok", "ugc", "stories", "carrossel"];
  let lista = [];
  let campanhas = [];
  let busca = "";
  let ligado = false;

  async function carregar() {
    try { [lista, campanhas] = await Promise.all([db.listar(), tabela("campanhas").listar()]); }
    catch (e) { console.warn(e); toast("Não consegui carregar os roteiros.", "err"); }
    return lista;
  }

  async function abrir() {
    ligar();
    $("#roteiros-conteudo").innerHTML = `<p class="sub">Carregando...</p>`;
    await carregar();
    render();
  }

  const marcaDe = (r) => campanhas.find((c) => c.id === r.campanha_id)?.marca || "";

  function render() {
    const q = busca.trim().toLowerCase();
    const vis = lista.filter((r) => !q || [r.titulo, r.gancho, r.texto, marcaDe(r)].some((v) => String(v || "").toLowerCase().includes(q)));
    $("#roteiros-conteudo").innerHTML = `
      <div class="rot-barra">
        <input type="search" class="input" id="rot-busca" placeholder="Buscar roteiro, marca ou gancho" value="${esc(busca)}" aria-label="Buscar roteiros">
        <span class="nota">${lista.filter((r) => ["ideia", "escrevendo", "pronto"].includes(r.status)).length} esperando por você</span>
      </div>
      <div class="kanban">
        ${ETAPAS.map((e) => {
          const col = vis.filter((r) => r.status === e.id);
          return `
          <section class="coluna" style="--c:${e.cor}" aria-label="${e.nome}">
            <header><span>${e.nome}</span><b>${col.length}</b></header>
            ${col.map((r) => `
              <article class="rot" data-rot="${r.id}" tabindex="0" role="button" aria-label="Abrir roteiro ${esc(r.titulo)}">
                <div class="rot-tags"><span class="chip">${esc(r.formato)}</span>${marcaDe(r) ? `<span class="chip marca-chip">${esc(marcaDe(r))}</span>` : ""}</div>
                <h3>${esc(r.titulo)}</h3>
                ${r.gancho ? `<p>"${esc(r.gancho.slice(0, 110))}${r.gancho.length > 110 ? "..." : ""}"</p>` : ""}
                ${r.data_gravacao ? `<small>${icon("video")} gravar ${diaMes(r.data_gravacao)}</small>` : ""}
              </article>`).join("")}
            ${e.id === "ideia" ? `<button class="rot-add" data-rot-novo>${icon("plus")} Nova ideia</button>` : ""}
          </section>`;
        }).join("")}
      </div>`;
    const inp = $("#rot-busca");
    inp.addEventListener("input", () => { busca = inp.value; const pos = inp.selectionStart; render(); const n = $("#rot-busca"); n.focus(); n.setSelectionRange(pos, pos); });
    $$("[data-rot]").forEach((el) => {
      const abre = () => editar(lista.find((r) => r.id === el.dataset.rot));
      el.addEventListener("click", abre);
      el.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); abre(); } });
    });
    $$("[data-rot-novo]").forEach((b) => b.addEventListener("click", () => editar(null)));
  }

  function editar(r) {
    const d = janela("rot-dialog", `
      <form method="dialog" id="rot-form" class="rot-form">
        <h2>${r ? "Editar roteiro" : "Novo roteiro"}</h2>
        <label class="label" for="ro-titulo">Título</label>
        <input class="input" id="ro-titulo" required maxlength="120" value="${esc(r?.titulo || "")}" placeholder="Ex: 3 erros ao lavar o cabelo">
        <div class="dialogo-linha quatro">
          <div><label class="label" for="ro-status">Etapa</label><select class="input" id="ro-status">${ETAPAS.map((e) => `<option value="${e.id}" ${(r?.status || "ideia") === e.id ? "selected" : ""}>${e.nome}</option>`).join("")}</select></div>
          <div><label class="label" for="ro-formato">Formato</label><select class="input" id="ro-formato">${FORMATOS.map((f) => `<option ${(r?.formato || "reels") === f ? "selected" : ""}>${f}</option>`).join("")}</select></div>
          <div><label class="label" for="ro-camp">Campanha</label><select class="input" id="ro-camp"><option value="">Conteúdo próprio</option>${campanhas.map((c) => `<option value="${c.id}" ${r?.campanha_id === c.id ? "selected" : ""}>${esc(c.marca)}</option>`).join("")}</select></div>
          <div><label class="label" for="ro-data">Gravar em</label><input class="input" id="ro-data" type="date" value="${r?.data_gravacao || ""}"></div>
        </div>
        <label class="label" for="ro-gancho">Gancho <span class="nota">os 3 primeiros segundos decidem tudo</span></label>
        <textarea class="input" id="ro-gancho" rows="2" maxlength="500">${esc(r?.gancho || "")}</textarea>
        <label class="label" for="ro-texto">Roteiro</label>
        <textarea class="input" id="ro-texto" rows="9" maxlength="10000" placeholder="Cena 1: ...">${esc(r?.texto || "")}</textarea>
        <label class="label" for="ro-cta">Chamada final (CTA)</label>
        <input class="input" id="ro-cta" maxlength="200" value="${esc(r?.cta || "")}" placeholder="Ex: comenta QUERO que eu te mando o link">
        <div class="dialogo-acoes">
          ${r ? `<button class="btn danger" type="button" id="ro-apagar">Apagar</button>` : ""}
          <span style="flex:1"></span>
          <button class="btn" type="button" id="ro-cancelar">Cancelar</button>
          <button class="btn primary" type="submit">Salvar</button>
        </div>
      </form>`);
    d.classList.add("largo");
    d.showModal();
    $("#ro-titulo", d).focus();
    $("#ro-cancelar", d).addEventListener("click", () => d.close());
    $("#ro-apagar", d)?.addEventListener("click", async () => {
      if (!confirm(`Apagar o roteiro "${r.titulo}"?`)) return;
      try { await db.apagar(r.id); d.close(); toast("Roteiro apagado.", "ok"); abrir(); }
      catch (e) { console.warn(e); toast("Não consegui apagar.", "err"); }
    });
    $("#rot-form", d).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const row = {
        ...(r ? { id: r.id } : {}),
        titulo: $("#ro-titulo", d).value.trim(),
        status: $("#ro-status", d).value,
        formato: $("#ro-formato", d).value,
        campanha_id: $("#ro-camp", d).value || null,
        data_gravacao: $("#ro-data", d).value || null,
        gancho: $("#ro-gancho", d).value.trim(),
        texto: $("#ro-texto", d).value.trim(),
        cta: $("#ro-cta", d).value.trim(),
      };
      if (!row.titulo) return;
      try { await db.salvar(row); d.close(); toast(r ? "Roteiro atualizado." : "Roteiro criado.", "ok"); abrir(); }
      catch (e) { console.warn(e); toast("Não consegui salvar o roteiro.", "err"); }
    });
  }

  function ligar() {
    if (ligado) return;
    ligado = true;
    $("#roteiro-novo").addEventListener("click", async () => { if (!campanhas.length) await carregar(); editar(null); });
  }

  return { abrir, carregar };
})();
