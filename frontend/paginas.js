// =====================================================================
// paginas.js: Agenda (menu Calendário) e Portfólio (métricas do site).
// Usa as peças do app.js: sb, api, $, $$, esc, fmt, icon, toast, store.
// =====================================================================

// ---------------------------------------------------------------------
// AGENDA
// Tarefas no Supabase (tabela "tarefas"). No modo de teste local,
// ficam guardadas no navegador.
// ---------------------------------------------------------------------
window.Agenda = (() => {
  const CATEGORIAS = [
    { id: "gravacao", nome: "Gravação", cor: "#DB2777" },
    { id: "edicao", nome: "Edição", cor: "#7C3AED" },
    { id: "postagem", nome: "Postagem", cor: "#2563EB" },
    { id: "reuniao", nome: "Marca / Reunião", cor: "#CA8A04" },
    { id: "pessoal", nome: "Pessoal", cor: "#16A34A" },
    { id: "outro", nome: "Outro", cor: "#6B7280" },
  ];
  const cat = (id) => CATEGORIAS.find((c) => c.id === id) || CATEGORIAS[CATEGORIAS.length - 1];
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  // Datas sempre como texto AAAA-MM-DD (sem fuso).
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const deIso = (s) => { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d); };
  const hoje = () => iso(new Date());
  const hora = (t) => (t ? String(t).slice(0, 5) : "");

  let mes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let diaSel = hoje();
  let tarefas = [];
  let editando = null;
  let ligado = false;

  // ---------- dados ----------
  const local = {
    ler() { try { return JSON.parse(store.get("tarefas_local") || "[]"); } catch { return []; } },
    gravar(l) { store.set("tarefas_local", JSON.stringify(l)); },
  };
  const dados = {
    async listar(de, ate) {
      if (!sb) return local.ler().filter((t) => t.dia >= de && t.dia <= ate);
      const { data, error } = await sb.from("tarefas").select("*").gte("dia", de).lte("dia", ate)
        .order("dia").order("hora", { nullsFirst: true }).order("created_at");
      if (error) throw error;
      return data || [];
    },
    async salvar(t) {
      t.updated_at = new Date().toISOString();
      if (!sb) {
        const l = local.ler();
        if (!t.id) { t.id = crypto.randomUUID(); t.created_at = t.updated_at; l.push(t); }
        else l.splice(l.findIndex((x) => x.id === t.id), 1, t);
        local.gravar(l);
        return t;
      }
      const q = t.id
        ? sb.from("tarefas").update(t).eq("id", t.id).select().single()
        : sb.from("tarefas").insert(t).select().single();
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    async apagar(id) {
      if (!sb) { local.gravar(local.ler().filter((t) => t.id !== id)); return; }
      const { error } = await sb.from("tarefas").delete().eq("id", id);
      if (error) throw error;
    },
  };

  // Primeiro e último dia mostrados na grade (semanas completas).
  function limitesGrade() {
    const ini = new Date(mes); ini.setDate(1 - ini.getDay());
    const fim = new Date(mes.getFullYear(), mes.getMonth() + 1, 0); fim.setDate(fim.getDate() + (6 - fim.getDay()));
    return [ini, fim];
  }

  async function carregar() {
    const [ini, fim] = limitesGrade();
    const de = iso(ini) < diaSel ? iso(ini) : diaSel;
    const ate = iso(fim) > diaSel ? iso(fim) : diaSel;
    try { tarefas = await dados.listar(de, ate); }
    catch (e) { console.warn(e); tarefas = []; toast("Não consegui carregar a agenda.", "err"); }
    renderGrade();
    renderDia();
  }

  // ---------- grade do mês ----------
  function renderGrade() {
    $("#cal-mes").textContent = `${MESES[mes.getMonth()]} ${mes.getFullYear()}`;
    const [ini, fim] = limitesGrade();
    const porDia = new Map();
    tarefas.forEach((t) => { if (!porDia.has(t.dia)) porDia.set(t.dia, []); porDia.get(t.dia).push(t); });

    const cels = [];
    for (let d = new Date(ini); d <= fim; d.setDate(d.getDate() + 1)) {
      const k = iso(d);
      const lista = porDia.get(k) || [];
      const feitas = lista.filter((t) => t.concluida).length;
      const fora = d.getMonth() !== mes.getMonth();
      cels.push(`
        <button class="cal-dia ${fora ? "fora" : ""} ${k === hoje() ? "hoje" : ""} ${k === diaSel ? "sel" : ""}" data-dia="${k}"
          aria-label="${d.getDate()} de ${MESES[d.getMonth()]}${lista.length ? `, ${lista.length} tarefa(s), ${feitas} feita(s)` : ""}" aria-pressed="${k === diaSel}">
          <span class="n">${d.getDate()}</span>
          <span class="cal-itens">${lista.slice(0, 3).map((t) => `
            <span class="cal-item ${t.concluida ? "ok" : ""}" style="--c:${cat(t.categoria).cor}">${esc(hora(t.hora) ? hora(t.hora) + " " : "")}${esc(t.titulo)}</span>`).join("")}
            ${lista.length > 3 ? `<span class="cal-mais">+${lista.length - 3}</span>` : ""}
          </span>
          ${lista.length ? `<span class="cal-pontos">${lista.slice(0, 5).map((t) => `<i style="background:${cat(t.categoria).cor}"></i>`).join("")}</span>` : ""}
        </button>`);
    }
    $("#cal-grid").innerHTML = cels.join("");
    $$("[data-dia]", $("#cal-grid")).forEach((b) => b.addEventListener("click", () => {
      diaSel = b.dataset.dia;
      if (deIso(diaSel).getMonth() !== mes.getMonth()) { mes = new Date(deIso(diaSel).getFullYear(), deIso(diaSel).getMonth(), 1); carregar(); }
      else { renderGrade(); renderDia(); }
    }));
    $("#cal-legenda").innerHTML = CATEGORIAS.map((c) => `<span><i style="background:${c.cor}"></i>${c.nome}</span>`).join("");
  }

  // ---------- planilha do dia ----------
  function renderDia() {
    const d = deIso(diaSel);
    const semana = d.toLocaleDateString("pt-BR", { weekday: "long" });
    $("#dia-titulo").textContent = diaSel === hoje() ? `Hoje, ${d.getDate()} de ${MESES[d.getMonth()]}` : `${semana[0].toUpperCase() + semana.slice(1)}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
    const lista = tarefas.filter((t) => t.dia === diaSel)
      .sort((a, b) => (hora(a.hora) || "99") < (hora(b.hora) || "99") ? -1 : (hora(a.hora) || "99") > (hora(b.hora) || "99") ? 1 : 0);
    const feitas = lista.filter((t) => t.concluida).length;
    $("#dia-sub").textContent = lista.length ? `${feitas} de ${lista.length} concluída(s)` : "Nenhuma tarefa nesse dia ainda.";
    $("#dia-barra").style.width = lista.length ? `${(feitas / lista.length) * 100}%` : "0";

    if (!lista.length) {
      $("#dia-lista").innerHTML = `<div class="soft-box" style="margin:0 16px 16px">Use o campo acima pra adicionar a primeira tarefa do dia.</div>`;
      return;
    }
    $("#dia-lista").innerHTML = `
      <table class="leads-table tarefas-table">
        <thead><tr><th scope="col" style="width:44px"><span class="sr">Feita</span></th><th scope="col">Hora</th><th scope="col">Tarefa</th><th scope="col"><span class="sr">Ações</span></th></tr></thead>
        <tbody>${lista.map((t) => `
          <tr class="${t.concluida ? "feita" : ""}" data-id="${t.id}">
            <td><label class="check"><input type="checkbox" data-feita ${t.concluida ? "checked" : ""} aria-label="Marcar ${esc(t.titulo)} como feita"><span>${icon("check")}</span></label></td>
            <td class="hora">${esc(hora(t.hora)) || `<span class="muted">dia todo</span>`}</td>
            <td class="tit"><button class="btn link" data-abrir>${esc(t.titulo)}</button>${t.notas ? `<small>${esc(t.notas)}</small>` : ""}
              <span class="cat" style="--c:${cat(t.categoria).cor}">${esc(cat(t.categoria).nome)}</span></td>
            <td class="acoes"><button class="icon-btn" data-abrir title="Editar" aria-label="Editar ${esc(t.titulo)}">${icon("edit")}</button>
              <button class="icon-btn" data-apagar title="Apagar" aria-label="Apagar ${esc(t.titulo)}">${icon("trash")}</button></td>
          </tr>`).join("")}</tbody>
      </table>`;

    $$("tr[data-id]", $("#dia-lista")).forEach((tr) => {
      const t = tarefas.find((x) => x.id === tr.dataset.id);
      $("[data-feita]", tr).addEventListener("change", async (ev) => {
        try { Object.assign(t, await dados.salvar({ ...t, concluida: ev.target.checked })); renderGrade(); renderDia(); }
        catch (e) { console.warn(e); ev.target.checked = !ev.target.checked; toast("Não consegui salvar.", "err"); }
      });
      $$("[data-abrir]", tr).forEach((b) => b.addEventListener("click", () => abrirDialogo(t)));
      $("[data-apagar]", tr).addEventListener("click", () => apagar(t));
    });
  }

  async function apagar(t) {
    if (!confirm(`Apagar a tarefa "${t.titulo}"?`)) return false;
    try { await dados.apagar(t.id); tarefas = tarefas.filter((x) => x.id !== t.id); renderGrade(); renderDia(); toast("Tarefa apagada.", "ok"); return true; }
    catch (e) { console.warn(e); toast("Não consegui apagar.", "err"); return false; }
  }

  // ---------- janela de edição ----------
  function abrirDialogo(t) {
    editando = t || null;
    $("#td-titulo-h").textContent = t ? "Editar tarefa" : "Nova tarefa";
    $("#td-titulo").value = t?.titulo || "";
    $("#td-dia").value = t?.dia || diaSel;
    $("#td-hora").value = hora(t?.hora);
    $("#td-cat").value = t?.categoria || "outro";
    $("#td-notas").value = t?.notas || "";
    $("#td-feita").checked = !!t?.concluida;
    $("#td-apagar").hidden = !t;
    $("#tarefa-dialog").showModal();
    $("#td-titulo").focus();
  }

  function ligar() {
    if (ligado) return;
    ligado = true;
    const opcoes = CATEGORIAS.map((c) => `<option value="${c.id}">${c.nome}</option>`).join("");
    $("#tr-cat").innerHTML = opcoes;
    $("#td-cat").innerHTML = opcoes;
    $("#tr-cat").value = "outro";

    $("#cal-ant").addEventListener("click", () => { mes = new Date(mes.getFullYear(), mes.getMonth() - 1, 1); carregar(); });
    $("#cal-prox").addEventListener("click", () => { mes = new Date(mes.getFullYear(), mes.getMonth() + 1, 1); carregar(); });
    $("#cal-hoje").addEventListener("click", () => { diaSel = hoje(); mes = new Date(new Date().getFullYear(), new Date().getMonth(), 1); carregar(); });
    $("#tarefa-nova").addEventListener("click", () => abrirDialogo(null));

    $("#tarefa-rapida").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const titulo = $("#tr-titulo").value.trim();
      if (!titulo) return;
      try {
        tarefas.push(await dados.salvar({ dia: diaSel, hora: $("#tr-hora").value || null, titulo, categoria: $("#tr-cat").value, notas: "", concluida: false }));
        $("#tr-titulo").value = ""; $("#tr-hora").value = "";
        $("#tr-titulo").focus();
        renderGrade(); renderDia();
      } catch (e) { console.warn(e); toast("Não consegui salvar a tarefa.", "err"); }
    });

    $("#td-cancelar").addEventListener("click", () => $("#tarefa-dialog").close());
    $("#td-apagar").addEventListener("click", async () => { if (await apagar(editando)) $("#tarefa-dialog").close(); });
    $("#tarefa-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const t = {
        ...(editando ? { id: editando.id } : {}),
        titulo: $("#td-titulo").value.trim(), dia: $("#td-dia").value, hora: $("#td-hora").value || null,
        categoria: $("#td-cat").value, notas: $("#td-notas").value.trim(), concluida: $("#td-feita").checked,
      };
      if (!t.titulo || !t.dia) return;
      try {
        await dados.salvar(t);
        $("#tarefa-dialog").close();
        diaSel = t.dia;
        mes = new Date(deIso(t.dia).getFullYear(), deIso(t.dia).getMonth(), 1);
        toast(editando ? "Tarefa atualizada." : "Tarefa criada.", "ok");
        carregar();
      } catch (e) { console.warn(e); toast("Não consegui salvar a tarefa.", "err"); }
    });
  }

  // O Início usa as mesmas tarefas ("O que fazer hoje" e "Vem aí").
  return { abrir() { ligar(); carregar(); }, listar: dados.listar, salvar: dados.salvar, cat, iso, hora };
})();

// ---------------------------------------------------------------------
// PORTFÓLIO: métricas do site (função site_resumo no banco), vídeos
// mais vistos e uma prévia do site.
// ---------------------------------------------------------------------
window.Portfolio = (() => {
  const SITE = "https://yasmincarreira.com/portfolio/";
  const PERIODOS = [["7", "7 dias"], ["30", "30 dias"], ["90", "90 dias"], ["0", "Tudo"]];
  let periodo = store.get("pf_periodo") || "30";
  let previa = "celular";

  const PAGINAS_SITE = { "/": "Início", "/portfolio/": "Portfólio", "/historia/": "História", "/portifolio/": "Portfólio (atalho)" };
  function origem(ref, utm) {
    const r = (utm || ref || "").toLowerCase();
    if (!r) return "Direto (link salvo ou digitado)";
    if (r.includes("instagram")) return "Instagram";
    if (r.includes("google")) return "Google";
    if (r.includes("whatsapp") || r === "wa.me") return "WhatsApp";
    if (r.includes("facebook") || r === "fb") return "Facebook";
    if (r.includes("tiktok")) return "TikTok";
    if (r.includes("linkedin") || r === "lnkd.in") return "LinkedIn";
    if (r.includes("youtube")) return "YouTube";
    if (r.includes("bing")) return "Bing";
    return r;
  }
  const NOMES_LINK = { whatsapp: "WhatsApp", email: "E-mail", telefone: "Telefone", "instagram.com": "Instagram", "tiktok.com": "TikTok", "youtube.com": "YouTube", "youtu.be": "YouTube" };

  async function abrir() {
    const box = $("#portfolio-conteudo");
    box.innerHTML = `${cabecalho()}<p class="sub">Carregando...</p>`;
    ligarCabecalho(box);
    let d = null;
    if (sb) {
      const { data, error } = await sb.rpc("site_resumo", { p_dias: Number(periodo) });
      if (error) console.warn(error); else d = data;
    }
    render(d || { pessoas: 0, visitas: 0, visualizacoes: 0, videos_vistos: 0, cliques: 0, serie: [], paginas: [], origens: [], dispositivos: [], videos: [], links: [] });
  }

  function cabecalho() {
    return `
      <div class="an-top">
        <div class="periodos" role="group" aria-label="Período">
          ${PERIODOS.map(([v, t]) => `<button class="seg ${v === periodo ? "on" : ""}" data-pf-periodo="${v}" aria-pressed="${v === periodo}">${t}</button>`).join("")}
        </div>
        <button class="btn sm" data-pf-atualizar>${icon("refresh")} Atualizar</button>
      </div>`;
  }
  function ligarCabecalho(box) {
    $$("[data-pf-periodo]", box).forEach((b) => b.addEventListener("click", () => {
      periodo = b.dataset.pfPeriodo; store.set("pf_periodo", periodo); abrir();
    }));
    $("[data-pf-atualizar]", box)?.addEventListener("click", abrir);
  }

  // Lista com barrinha (mesmo visual do "Quem mais comenta").
  function ranking(itens, vazio) {
    if (!itens.length) return `<div class="soft-box">${vazio}</div>`;
    const max = Math.max(...itens.map((i) => i.valor), 1);
    return `<ol class="an-rank">${itens.map((i, n) => `
      <li><span class="pos">${n + 1}</span><span class="nome" title="${esc(i.nome)}">${esc(i.nome)}</span>
        <span class="barra"><i style="width:${Math.max(6, (i.valor / max) * 100)}%"></i></span><b>${fmt(i.valor)}</b></li>`).join("")}</ol>`;
  }

  function render(d) {
    const box = $("#portfolio-conteudo");
    const dias = Number(periodo);
    const rot = dias ? `${dias} dias` : "desde o início";
    const vazio = !d.visualizacoes;

    // Origens agrupadas (Instagram, Google...).
    const grupos = new Map();
    (d.origens || []).forEach((o) => { const n = origem(o.ref, o.utm); grupos.set(n, (grupos.get(n) || 0) + o.pessoas); });
    const origens = [...grupos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([nome, valor]) => ({ nome, valor }));
    const totalDisp = (d.dispositivos || []).reduce((t, x) => t + x.pessoas, 0) || 1;
    const celular = (d.dispositivos || []).find((x) => x.dispositivo === "celular")?.pessoas || 0;
    const contato = (d.links || []).filter((l) => ["whatsapp", "email", "telefone"].includes(l.alvo)).reduce((t, l) => t + l.total, 0);

    box.innerHTML = `
      ${cabecalho()}
      ${vazio ? `<div class="banner">${icon("info")}<div><strong>O contador do site foi instalado.</strong> Assim que alguém entrar no seu portfólio, os números aparecem aqui.
        Pra não contar as suas próprias visitas, abra uma vez no seu celular e no computador: <a href="${SITE}?naocontar=1" target="_blank" rel="noopener">yasmincarreira.com/portfolio/?naocontar=1</a></div></div>` : ""}
      <div class="grid stats an-stats">
        <div class="card stat"><span class="label">Pessoas</span><div class="num">${fmt(d.pessoas)}</div><div class="foot">acessaram o site (${rot})</div></div>
        <div class="card stat"><span class="label">Visitas</span><div class="num">${fmt(d.visitas)}</div><div class="foot">${fmt(d.visualizacoes)} páginas vistas</div></div>
        <div class="card stat"><span class="label">Vídeos assistidos</span><div class="num">${fmt(d.videos_vistos)}</div><div class="foot">vezes que abriram um vídeo</div></div>
        <div class="card stat"><span class="label">Contatos</span><div class="num">${fmt(contato)}</div><div class="foot">cliques em WhatsApp e e-mail</div></div>
        <div class="card stat"><span class="label">No celular</span><div class="num">${d.pessoas ? Math.round((celular / totalDisp) * 100) : 0}%</div><div class="foot">das pessoas</div></div>
      </div>

      <div class="card"><h2>Pessoas por dia</h2><p class="sub">Passe o mouse nas barras pra ver cada dia.</p><div class="chart" id="pf-serie"></div></div>

      <div class="card an-posts" style="margin-top:16px">
        <div class="an-posts-head"><h2>${icon("play")} Vídeos mais vistos <span class="muted">(${rot})</span></h2></div>
        <div id="pf-videos"></div>
      </div>

      <div class="grid charts" style="margin-top:16px">
        <div class="card"><h2>${icon("link")} De onde vieram</h2><p class="sub">Pessoas por origem.</p>${ranking(origens, "Ainda sem visitas.")}</div>
        <div class="card"><h2>${icon("chat")} Cliques em contato e links</h2><p class="sub">O que as pessoas tocaram no site.</p>
          ${ranking((d.links || []).map((l) => ({ nome: NOMES_LINK[l.alvo] || l.alvo, valor: l.total })), "Ninguém clicou em contato ainda.")}</div>
        <div class="card"><h2>${icon("file")} Páginas mais vistas</h2><p class="sub">Visualizações por página.</p>
          ${ranking((d.paginas || []).map((p) => ({ nome: PAGINAS_SITE[p.path] || p.path, valor: p.total })), "Ainda sem visitas.")}</div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="an-posts-head">
          <h2>${icon("briefcase")} O seu site</h2>
          <div class="periodos" role="group" aria-label="Tamanho da prévia">
            <button class="seg ${previa === "celular" ? "on" : ""}" data-previa="celular">Celular</button>
            <button class="seg ${previa === "computador" ? "on" : ""}" data-previa="computador">Computador</button>
          </div>
        </div>
        <div class="previa-site ${previa}"><iframe src="${SITE}" title="Prévia do site do portfólio" loading="lazy"></iframe></div>
        <p class="hint">A prévia aqui dentro não conta como visita.</p>
      </div>`;

    ligarCabecalho(box);
    $$("[data-previa]", box).forEach((b) => b.addEventListener("click", () => {
      previa = b.dataset.previa;
      $$("[data-previa]", box).forEach((x) => x.classList.toggle("on", x === b));
      $(".previa-site", box).className = `previa-site ${previa}`;
    }));

    // Série diária com os dias sem visita em zero.
    const mapa = new Map((d.serie || []).map((s) => [s.dia, s.pessoas]));
    const serie = [];
    const nDias = dias || Math.max(7, Math.min(365, Math.ceil((Date.now() - new Date(d.primeiro_evento || Date.now())) / 86400000) + 1));
    for (let i = nDias - 1; i >= 0; i--) {
      const k = new Date(Date.now() - 3 * 3600000 - i * 86400000).toISOString().slice(0, 10);
      serie.push({ date: k, value: mapa.get(k) || 0 });
    }
    graficoBarras($("#pf-serie"), serie, "pessoas");

    const videos = d.videos || [];
    $("#pf-videos").innerHTML = videos.length ? `<div class="an-grade">${videos.slice(0, 12).map((v, i) => {
      const [marca, tipo] = String(v.rotulo || "").split(" · ");
      return `
      <a class="an-post" href="https://youtube.com/shorts/${encodeURIComponent(v.id)}" target="_blank" rel="noopener" title="${esc(v.rotulo)}">
        <div class="thumb"><img src="https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/hqdefault.jpg" alt="" loading="lazy">
          <span class="pos">${i + 1}</span>${tipo ? `<span class="tipo">${esc(tipo)}</span>` : ""}</div>
        <div class="met"><strong>${esc(marca || v.id)}</strong></div>
        <div class="met"><span title="Vezes que abriram">${icon("play")} ${fmt(v.total)}</span><span title="Pessoas diferentes">${icon("users")} ${fmt(v.pessoas)}</span></div>
      </a>`;
    }).join("")}</div>` : `<div class="soft-box">Quando alguém abrir um vídeo no seu portfólio, ele aparece aqui, do mais assistido pro menos.</div>`;
  }

  return { abrir };
})();
