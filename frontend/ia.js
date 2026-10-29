// =====================================================================
// ia.js: páginas que usam o Claude (função claude-ia):
//   Analista, Quadros, Em alta e Estratégia.
// Usa as peças do app.js (sb, api, $, $$, esc, fmt, icon, toast, store)
// e do negocio.js (tabela, diaMes, hojeIso).
// =====================================================================

// Chama a função claude-ia. Devolve { ok, resultado } ou { ok:false, erro, codigo }.
async function chamaIA(modo, corpo = {}) {
  if (!sb) return { ok: false, codigo: "local", erro: "A IA só funciona com o painel no ar (não no modo de teste local)." };
  try {
    const { data, error } = await sb.functions.invoke("claude-ia", { body: { modo, ...corpo } });
    if (error) throw error;
    return data || { ok: false, erro: "Sem resposta." };
  } catch (e) {
    console.warn(e);
    return { ok: false, codigo: "rede", erro: "Não consegui falar com o Claude. Confira a internet e tente de novo." };
  }
}

// Aviso padrão quando falta a chave ou deu erro.
function avisoIA(r) {
  if (r.codigo === "sem_chave" || r.codigo === "chave_invalida") {
    return `<div class="card aviso-ia">${icon("spark")}<div><h2>Atualização pelo chat</h2>
      <p>Esse botão usa a chave paga do Claude, que ainda não foi ligada. Sem problema: esta página se atualiza sozinha todo dia à meia-noite,
      e quando quiser na hora é só pedir no chat do Claude Code (ex: <em>"atualiza minha análise"</em>).</p></div></div>`;
  }
  return `<div class="soft-box">${esc(r.erro || "Algo deu errado.")}</div>`;
}

const carregandoIA = (txt) => `<div class="card pensando"><span class="bolinhas"><i></i><i></i><i></i></span><div><b>${esc(txt)}</b><small>Pode continuar usando o painel enquanto isso.</small></div></div>`;
const dataBR = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

// Configs salvas (painel_config).
async function lerCfg(chave) {
  if (!sb) return null;
  const { data } = await sb.from("painel_config").select("valor").eq("chave", chave).maybeSingle();
  return data?.valor ?? null;
}

// Posts com métricas (mesma função da aba Análises; fica em cache 30 min).
async function postsComMetricas() {
  const [tudo, d30, d90] = await Promise.all([
    api.funcao("ig-analytics", { periodo: "tudo" }), api.funcao("ig-analytics", { periodo: "30" }), api.funcao("ig-analytics", { periodo: "90" }),
  ]);
  return { tudo, d30, d90 };
}

// Cria um roteiro (etapa Ideia) a partir de uma ideia da IA.
async function viraRoteiro(titulo, gancho, texto = "") {
  try {
    await tabela("roteiros", "updated_at").salvar({ titulo: String(titulo).slice(0, 120), gancho: String(gancho || "").slice(0, 500), texto, status: "ideia", formato: "reels" });
    toast("Virou roteiro! Está em Roteiros > Ideia.", "ok");
  } catch (e) { console.warn(e); toast("Não consegui criar o roteiro.", "err"); }
}

// ---------------------------------------------------------------------
// ANALISTA
// ---------------------------------------------------------------------
window.Analista = (() => {
  let rodando = false;
  async function abrir() {
    const box = $("#analista-conteudo");
    if (rodando) return;
    box.innerHTML = `<p class="sub">Carregando...</p>`;
    render(await lerCfg("analise_ig"));
  }

  function render(a) {
    const box = $("#analista-conteudo");
    if (!a) {
      box.innerHTML = `<div class="card empty"><div class="ico">${icon("search")}</div><h2>Nenhuma análise ainda</h2>
        <p>O Claude olha todos os seus posts e números e te diz o que está funcionando, o que ajustar e o que repetir.</p>
        <button class="btn primary" data-analisar>${icon("spark")} Gerar análise</button></div>`;
      $("[data-analisar]", box).addEventListener("click", gerar);
      return;
    }
    box.innerHTML = `
      <div class="an-cabeca">
        <div class="tom rosa nota-geral"><span>Nota geral</span><b>${esc(a.nota_geral)}</b><small>${fmt(a.posts_analisados)} posts analisados em ${dataBR(a.gerado_em)}</small></div>
        <div class="card resumo-ia"><h2>${icon("spark")} Resumo</h2><p>${esc(a.resumo)}</p></div>
      </div>
      <div class="grid dois">
        <div class="card"><h2>${icon("check")} O que está funcionando</h2>
          <ul class="ia-lista">${(a.funciona || []).map((f) => `<li class="bom"><b>${esc(f.titulo)}</b><p>${esc(f.porque)}</p>${f.exemplo ? `<small>Exemplo: ${esc(f.exemplo)}</small>` : ""}</li>`).join("")}</ul></div>
        <div class="card"><h2>${icon("edit")} O que ajustar</h2>
          <ul class="ia-lista">${(a.ajustar || []).map((f) => `<li class="ajuste"><b>${esc(f.titulo)}</b><p>${esc(f.porque)}</p>${f.como ? `<small>Como: ${esc(f.como)}</small>` : ""}</li>`).join("")}</ul></div>
      </div>
      <div class="grid tres" style="margin-top:12px">
        <div class="card"><h2>${icon("refresh")} Repita isso</h2><div class="chips-ia">${(a.repetir || []).map((r) => `<span class="chip">${esc(r)}</span>`).join("")}</div></div>
        <div class="card"><h2>${icon("video")} Formatos</h2><ul class="ia-mini">${(a.formatos || []).map((f) => `<li><b>${esc(f.formato)}</b> ${esc(f.veredito)}</li>`).join("")}</ul></div>
        <div class="card"><h2>${icon("calendar")} Frequência</h2><p class="ia-txt">${esc(a.frequencia)}</p></div>
      </div>
      <div class="grid dois" style="margin-top:12px">
        <div class="card"><h2>${icon("chat")} Ganchos e legendas</h2><p class="ia-txt">${esc(a.ganchos_e_legendas)}</p></div>
        <div class="card"><h2>${icon("target")} Próximos passos</h2><ol class="passos">${(a.proximos_passos || []).map((p) => `<li>${esc(p)}</li>`).join("")}</ol></div>
      </div>`;
  }

  async function gerar() {
    if (rodando) return;
    rodando = true;
    const box = $("#analista-conteudo");
    box.innerHTML = carregandoIA("Juntando seus posts e números...");
    const { tudo, d30, d90 } = await postsComMetricas();
    if (!tudo?.connected) { rodando = false; box.innerHTML = `<div class="soft-box">Não consegui ler o seu Instagram agora. Tente de novo.</div>`; return; }
    box.innerHTML = carregandoIA(`O Claude está analisando seus ${fmt(tudo.posts.length)} posts. Leva cerca de 1 minuto.`);
    const r = await chamaIA("analista", { posts: tudo.posts, totais30: d30?.totais, totais90: d90?.totais, perfil: tudo.perfil });
    rodando = false;
    if (!r.ok) { box.innerHTML = avisoIA(r); return; }
    toast("Análise pronta!", "ok");
    render(r.resultado);
  }

  let ligado = false;
  return {
    abrir() {
      if (!ligado) { ligado = true; $("#analista-gerar").addEventListener("click", gerar); }
      abrir();
    },
  };
})();

// ---------------------------------------------------------------------
// QUADROS: séries fixas de conteúdo, com os vídeos de cada uma.
// ---------------------------------------------------------------------
window.Quadros = (() => {
  const db = tabela("quadros", "created_at");
  let lista = [];
  let posts = null; // posts do Instagram (com métricas)
  let analisando = new Set();

  async function abrir() {
    const box = $("#quadros-conteudo");
    box.innerHTML = `<p class="sub">Carregando...</p>`;
    try { lista = await db.listar(); } catch (e) { console.warn(e); lista = []; }
    render();
    if (!posts) {
      const r = await api.funcao("ig-analytics", { periodo: "tudo" });
      posts = r?.connected ? r.posts : [];
      render();
    }
  }

  const postPorId = (id) => (posts || []).find((p) => p.id === id);
  function mediaGeral() {
    if (!posts?.length) return null;
    const n = posts.length, s = (k) => posts.reduce((t, p) => t + (p[k] || 0), 0);
    return { curtidas: Math.round(s("curtidas") / n), comentarios: Math.round(s("comentarios") / n), views: Math.round(s("views") / n), salvos: Math.round(s("salvos") / n) };
  }

  const VEREDITO = { bom: ["Indo bem", "ok"], medio: ["Médio", "meio"], fraco: ["Precisa de atenção", "fraco"], sem_dados: ["Sem vídeos ainda", "meio"] };

  function render() {
    const box = $("#quadros-conteudo");
    if (!lista.length) {
      box.innerHTML = `<div class="card empty"><div class="ico">${icon("grid")}</div><h2>Nenhum quadro ainda</h2>
        <p>Crie um quadro (ex: "Diário da obra", "Achadinhos de mãe") e marque os vídeos que fazem parte dele. O Claude analisa se está funcionando.</p>
        <button class="btn primary" data-q-novo>${icon("plus")} Novo quadro</button></div>`;
      $("[data-q-novo]", box).addEventListener("click", () => editar(null));
      return;
    }
    box.innerHTML = `<div class="quadros-lista">${lista.map((q) => {
      const ps = (q.media_ids || []).map(postPorId).filter(Boolean);
      const soma = (k) => ps.reduce((t, p) => t + (p[k] || 0), 0);
      const a = q.analise;
      const v = a ? VEREDITO[a.veredito] || VEREDITO.medio : null;
      return `
      <article class="card quadro" data-q="${q.id}">
        <div class="quadro-topo">
          <div><h2>${esc(q.nome)}</h2>${q.descricao ? `<p class="sub">${esc(q.descricao)}</p>` : ""}</div>
          ${v ? `<span class="badge veredito ${v[1]}">${v[0]}</span>` : ""}
        </div>
        <div class="quadro-thumbs">
          ${ps.slice(0, 8).map((p) => `<a href="${esc(p.link)}" target="_blank" rel="noopener" title="${esc(p.legenda)}"><img src="${esc(p.miniatura || "")}" alt="" loading="lazy"></a>`).join("")}
          ${(q.media_ids || []).length ? "" : `<span class="muted">Nenhum vídeo marcado ainda.</span>`}
        </div>
        <div class="quadro-num">
          <span><b>${(q.media_ids || []).length}</b> vídeos</span>
          <span>${icon("heart")} ${fmt(soma("curtidas"))}</span><span>${icon("chat")} ${fmt(soma("comentarios"))}</span>
          ${ps.some((p) => p.views !== null) ? `<span>${icon("eye")} ${fmt(soma("views"))}</span>` : ""}
        </div>
        <div class="quadro-acoes">
          <button class="btn sm" data-q-videos>${icon("check")} Marcar vídeos</button>
          <button class="btn sm primary" data-q-analisar ${analisando.has(q.id) ? "disabled" : ""}>${icon("spark")} ${analisando.has(q.id) ? "Analisando..." : a ? "Analisar de novo" : "Analisar"}</button>
          <button class="icon-btn" data-q-editar title="Editar quadro" aria-label="Editar ${esc(q.nome)}">${icon("edit")}</button>
        </div>
        ${a ? analiseHtml(q) : ""}
      </article>`;
    }).join("")}</div>`;

    $$("[data-q]", box).forEach((el) => {
      const q = lista.find((x) => x.id === el.dataset.q);
      $("[data-q-videos]", el).addEventListener("click", () => marcarVideos(q));
      $("[data-q-editar]", el).addEventListener("click", () => editar(q));
      $("[data-q-analisar]", el).addEventListener("click", () => analisar(q));
      $$("[data-q-roteiro]", el).forEach((b) => b.addEventListener("click", () => {
        const i = q.analise.ideias[Number(b.dataset.qRoteiro)];
        viraRoteiro(`${q.nome}: ${i.titulo}`, i.gancho);
      }));
    });
  }

  function analiseHtml(q) {
    const a = q.analise;
    return `
      <div class="quadro-analise">
        <p class="ia-txt">${esc(a.resumo)} <small class="muted">(${dataBR(q.analisado_em)})</small></p>
        <div class="grid dois">
          <div><h3>O que funciona</h3><ul class="ia-mini">${(a.pontos_fortes || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
          <div><h3>O que melhorar</h3><ul class="ia-mini">${(a.melhorar || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
        </div>
        ${(a.pedidos_do_publico || []).length ? `<h3>O que as pessoas estão pedindo</h3><div class="chips-ia">${a.pedidos_do_publico.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div>` : ""}
        <h3>Ideias pros próximos episódios</h3>
        <ul class="ideias">${(a.ideias || []).map((i, n) => `<li><div><b>${esc(i.titulo)}</b><small>"${esc(i.gancho)}"</small></div><button class="btn sm" data-q-roteiro="${n}">Virar roteiro</button></li>`).join("")}</ul>
      </div>`;
  }

  async function analisar(q) {
    analisando.add(q.id); render();
    toast(`Analisando "${q.nome}". Leva cerca de 1 minuto.`);
    const r = await chamaIA("quadro", { quadro_id: q.id, media_geral: mediaGeral() });
    analisando.delete(q.id);
    if (!r.ok) {
      render();
      const el = $(`[data-q="${q.id}"]`);
      el?.insertAdjacentHTML("beforeend", avisoIA(r));
      return;
    }
    q.analise = r.resultado; q.analisado_em = new Date().toISOString();
    toast("Análise do quadro pronta!", "ok");
    render();
  }

  function editar(q) {
    const d = janela("quadro-dialog", `
      <form method="dialog" id="q-form">
        <h2>${q ? "Editar quadro" : "Novo quadro"}</h2>
        <label class="label" for="q-nome">Nome do quadro</label>
        <input class="input" id="q-nome" required maxlength="80" value="${esc(q?.nome || "")}" placeholder="Ex: Diário da obra">
        <label class="label" for="q-desc">Sobre o quadro</label>
        <textarea class="input" id="q-desc" rows="3" maxlength="500" placeholder="Do que se trata, quando posta, qual o objetivo">${esc(q?.descricao || "")}</textarea>
        <div class="dialogo-acoes">
          ${q ? `<button class="btn danger" type="button" id="q-apagar">Apagar</button>` : ""}
          <span style="flex:1"></span>
          <button class="btn" type="button" id="q-cancelar">Cancelar</button>
          <button class="btn primary" type="submit">Salvar</button>
        </div>
      </form>`);
    d.classList.remove("largo");
    d.showModal();
    $("#q-cancelar", d).addEventListener("click", () => d.close());
    $("#q-apagar", d)?.addEventListener("click", async () => {
      if (!confirm(`Apagar o quadro "${q.nome}"?`)) return;
      try { await db.apagar(q.id); d.close(); abrir(); } catch (e) { console.warn(e); toast("Não consegui apagar.", "err"); }
    });
    $("#q-form", d).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const row = { ...(q ? { id: q.id } : {}), nome: $("#q-nome", d).value.trim(), descricao: $("#q-desc", d).value.trim() };
      if (!row.nome) return;
      try { const salvo = await db.salvar(row); d.close(); await abrir(); if (!q) marcarVideos(lista.find((x) => x.id === salvo.id) || salvo); }
      catch (e) { console.warn(e); toast("Não consegui salvar.", "err"); }
    });
  }

  function marcarVideos(q) {
    const sel = new Set(q.media_ids || []);
    const d = janela("quadro-videos", `
      <form method="dialog" id="qv-form">
        <h2>Vídeos do quadro "${esc(q.nome)}"</h2>
        <p class="sub">Toque nos posts que fazem parte desse quadro.</p>
        <div class="posts-escolha">${(posts || []).length ? posts.map((p) => `
          <button type="button" class="post-op ${sel.has(p.id) ? "sel" : ""}" data-id="${p.id}" title="${esc(p.legenda)}" aria-pressed="${sel.has(p.id)}">
            ${p.miniatura ? `<img src="${esc(p.miniatura)}" alt="" loading="lazy">` : ""}<span>${esc(dataBR(p.data))}</span></button>`).join("")
          : `<div class="soft-box">Carregando seus posts... feche e abra de novo em instantes.</div>`}</div>
        <div class="dialogo-acoes"><span class="muted" id="qv-conta">${sel.size} selecionado(s)</span><span style="flex:1"></span>
          <button class="btn" type="button" id="qv-cancelar">Cancelar</button><button class="btn primary" type="submit">Salvar</button></div>
      </form>`);
    d.classList.add("largo");
    d.showModal();
    $$(".post-op", d).forEach((b) => b.addEventListener("click", () => {
      sel.has(b.dataset.id) ? sel.delete(b.dataset.id) : sel.add(b.dataset.id);
      b.classList.toggle("sel"); b.setAttribute("aria-pressed", sel.has(b.dataset.id));
      $("#qv-conta", d).textContent = `${sel.size} selecionado(s)`;
    }));
    $("#qv-cancelar", d).addEventListener("click", () => d.close());
    $("#qv-form", d).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try { await db.salvar({ id: q.id, media_ids: [...sel] }); d.close(); toast("Vídeos do quadro salvos.", "ok"); abrir(); }
      catch (e) { console.warn(e); toast("Não consegui salvar.", "err"); }
    });
  }

  let ligado = false;
  return {
    abrir() {
      if (!ligado) { ligado = true; $("#quadro-novo").addEventListener("click", () => editar(null)); }
      abrir();
    },
  };
})();

// ---------------------------------------------------------------------
// EM ALTA: trends, pautas e achados por tema (pesquisa na web).
// ---------------------------------------------------------------------
window.EmAlta = (() => {
  const TEMAS = [
    { id: "ugc", nome: "UGC", cor: "#78b4f4" }, { id: "autocuidado", nome: "Autocuidado", cor: "#ff99d9" },
    { id: "rotina", nome: "Rotina", cor: "#f2db33" }, { id: "reforma", nome: "Reforma", cor: "#c08a5b" },
    { id: "mae", nome: "Mãe", cor: "#b9a7f5" }, { id: "fitness", nome: "Fitness", cor: "#5cc58a" },
  ];
  const TIPOS = [["", "Tudo"], ["achado", "Achados"], ["trend", "Trends"], ["pauta", "Pautas"]];
  let itens = [];
  let tema = "";
  let tipo = "";
  let buscando = "";

  async function abrir() {
    if (sb) {
      const { data } = await sb.from("em_alta").select("*").order("lote", { ascending: false }).limit(200);
      itens = data || [];
    }
    render();
  }

  function render() {
    const box = $("#emalta-conteudo");
    const ultimo = itens.reduce((m, i) => (i.lote > m ? i.lote : m), "");
    const vis = itens.filter((i) => (!tema || i.tema === tema) && (!tipo || i.tipo === tipo));
    const corDe = (t) => TEMAS.find((x) => x.id === t)?.cor || "#c9c2b8";
    const nomeDe = (t) => TEMAS.find((x) => x.id === t)?.nome || t;
    $("#emalta-info").innerHTML = `<span class="pill-info">Última busca <b>${ultimo ? dataBR(ultimo) : "nunca"}</b></span>`;
    box.innerHTML = `
      <div class="temas">
        <button class="tema ${!tema ? "on" : ""}" data-tema="">Todos <small>${itens.length}</small></button>
        ${TEMAS.map((t) => `<button class="tema ${tema === t.id ? "on" : ""}" data-tema="${t.id}"><i style="background:${t.cor}"></i>${t.nome} <small>${itens.filter((i) => i.tema === t.id).length}</small></button>`).join("")}
      </div>
      <div class="tipos-linha">
        <div class="tipos">${TIPOS.map(([v, t]) => `<button class="${tipo === v ? "on" : ""}" data-tipo="${v}">${t}</button>`).join("")}</div>
        <button class="btn primary" data-buscar ${buscando ? "disabled" : ""}>${icon("search")} ${buscando ? esc(buscando) : tema ? `Buscar ${esc(nomeDe(tema))} agora` : "Buscar todos os temas"}</button>
      </div>
      ${vis.length ? `<div class="alta-grade">${vis.map((i) => `
        <article class="card alta" data-alta="${i.id}">
          <div class="alta-topo"><span class="badge tipo-${i.tipo}">${i.tipo === "achado" ? "Achado" : i.tipo === "trend" ? "Trend" : "Pauta"}</span>
            <span class="alta-tema"><i style="background:${corDe(i.tema)}"></i>${esc(nomeDe(i.tema))}</span></div>
          <h3>${esc(i.titulo)}</h3>
          <p>${esc(i.descricao)}</p>
          ${i.ideia ? `<div class="alta-ideia"><b>Vira roteiro assim:</b> ${esc(i.ideia)}</div>` : ""}
          <div class="alta-rodape">
            ${/^https?:\/\//.test(i.fonte) ? `<a href="${esc(i.fonte)}" target="_blank" rel="noopener">fonte</a>` : `<small class="muted">${esc(i.fonte)}</small>`}
            <button class="btn sm" data-virar="${i.id}">Virar roteiro</button>
          </div>
        </article>`).join("")}</div>`
        : `<div class="card empty"><div class="ico">${icon("flame")}</div><h2>${itens.length ? "Nada nesse filtro" : "Nenhuma pesquisa ainda"}</h2>
            <p>O Claude pesquisa na internet o que está em alta no Brasil em cada tema e já sugere como virar roteiro.</p></div>`}`;

    $$("[data-tema]", box).forEach((b) => b.addEventListener("click", () => { tema = b.dataset.tema; render(); }));
    $$("[data-tipo]", box).forEach((b) => b.addEventListener("click", () => { tipo = b.dataset.tipo; render(); }));
    $("[data-buscar]", box).addEventListener("click", buscar);
    $$("[data-virar]", box).forEach((b) => b.addEventListener("click", () => {
      const i = itens.find((x) => String(x.id) === b.dataset.virar);
      viraRoteiro(i.titulo, i.ideia, `${i.descricao}${i.fonte ? `\n\nFonte: ${i.fonte}` : ""}`);
    }));
  }

  async function buscar() {
    if (buscando) return;
    const lista = tema ? TEMAS.filter((t) => t.id === tema) : TEMAS;
    let erro = null;
    for (let n = 0; n < lista.length; n++) {
      buscando = `Pesquisando ${lista[n].nome} (${n + 1} de ${lista.length})...`;
      render();
      const r = await chamaIA("emalta", { tema: lista[n].id });
      if (!r.ok) { erro = r; break; }
      itens = [...r.resultado.itens.map((x, k) => ({ ...x, id: `novo-${lista[n].id}-${k}` })), ...itens.filter((i) => i.tema !== lista[n].id)];
    }
    buscando = "";
    if (erro) { render(); $("#emalta-conteudo").insertAdjacentHTML("afterbegin", avisoIA(erro)); return; }
    toast("Pesquisa pronta!", "ok");
    abrir();
  }

  return { abrir };
})();

// ---------------------------------------------------------------------
// ESTRATÉGIA: pilares, plano, calendário de 30 dias e conversa com o Claude.
// ---------------------------------------------------------------------
window.Estrategia = (() => {
  const CORES_FORMATO = { reels: "rosa", post: "azul", carrossel: "amarelo" };
  const CORES_PILAR = ["#ff99d9", "#78b4f4", "#f2db33", "#b9a7f5", "#5cc58a"];
  let est = null;
  let chat = [];
  let montando = "";
  let enviando = false;

  async function abrir() {
    est = await lerCfg("estrategia");
    if (sb) {
      const { data } = await sb.from("estrategia_chat").select("*").order("id", { ascending: true }).limit(60);
      chat = data || [];
    }
    render();
  }

  function render() {
    const box = $("#estrategia-conteudo");
    const corPilar = (nome) => CORES_PILAR[Math.max(0, (est?.pilares || []).findIndex((p) => p.nome === nome)) % CORES_PILAR.length];
    const semana = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
    box.innerHTML = `
      <div class="estr">
        <div class="estr-main">
          ${montando ? carregandoIA(montando) : ""}
          ${!est?.pilares ? `
            <div class="card comecar">
              <h2>${icon("target")} Vamos montar sua estratégia</h2>
              <p class="sub">Conte o que você quer: crescer seguidores, fechar mais campanhas, quantas vezes consegue postar, temas que quer focar...</p>
              <textarea class="input" id="estr-pedido" rows="4" maxlength="2000" placeholder="Ex: quero chegar em 2.000 seguidores até dezembro, consigo gravar 4 reels por semana, quero focar em UGC e rotina de mãe."></textarea>
              <button class="btn primary" id="estr-montar" ${montando ? "disabled" : ""}>${icon("spark")} Montar estratégia e calendário de 30 dias</button>
            </div>` : `
            <div class="card objetivo"><span class="sobretitulo">Objetivo</span><p>${esc(est.objetivo)}</p>
              <button class="btn sm" id="estr-refazer" ${montando ? "disabled" : ""}>${icon("refresh")} Refazer tudo</button></div>
            <h2 class="secao">Pilares de conteúdo</h2>
            <div class="pilares">${est.pilares.map((p, i) => `
              <div class="pilar" style="--c:${CORES_PILAR[i % CORES_PILAR.length]}">
                <div class="pilar-topo"><b>${esc(p.nome)}</b><span>${p.porcentagem}%</span></div>
                <p>${esc(p.descricao)}</p>
                <small>${(p.exemplos || []).map(esc).join(" · ")}</small>
              </div>`).join("")}</div>
            <h2 class="secao">O plano pra chegar lá</h2>
            <ol class="plano">${(est.plano || []).map((p) => `<li><b>${esc(p.etapa)}</b><p>${esc(p.como)}</p></li>`).join("")}</ol>
            ${(est.estilo || []).length ? `
              <h2 class="secao">O jeito de gravar</h2>
              <div class="estilo">${est.estilo.map((e) => `<div><b>${esc(e.regra)}</b><p>${esc(e.como)}</p></div>`).join("")}</div>` : ""}
            <div class="secao-linha"><h2 class="secao">Calendário de 30 dias</h2>
              ${(est.calendario || []).length < 30 && !montando ? `<button class="btn sm primary" id="estr-completar">${icon("spark")} Completar calendário</button>` : ""}</div>
            ${semanasHtml(est.calendario || [], (d) => `
              <article class="dia30" data-dia="${d.dia}">
                <div class="dia30-topo"><span class="dia30-n"><b>${d.dia}</b>${d.data ? `${esc(semana(d.data))} ${esc(d.data.slice(8, 10))}/${esc(d.data.slice(5, 7))}` : ""}</span>
                  <span class="fmt ${CORES_FORMATO[d.formato] || ""}">${esc(d.formato)}</span></div>
                <span class="dia30-pilar"><i style="background:${corPilar(d.pilar)}"></i>${esc(d.pilar)}</span>
                <h3>${esc(d.tema)}</h3>
                <p>${esc(d.ideia)}</p>
                ${d.gancho ? `<p class="gancho">"${esc(d.gancho)}"</p>` : ""}
                <details><summary>Stories e legenda</summary>
                  <ul>${(d.stories || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
                  ${d.legenda_cta ? `<p><b>Legenda/CTA:</b> ${esc(d.legenda_cta)}</p>` : ""}
                </details>
                <div class="dia30-acoes">
                  <button class="btn sm" data-agenda="${d.dia}" title="Coloca na sua agenda nesse dia">${icon("calendar")} Agenda</button>
                  <button class="btn sm" data-rot="${d.dia}">${icon("file")} Roteiro</button>
                </div>
              </article>`)}`}
        </div>
        <aside class="card estr-chat">
          <h2>${icon("chat")} Converse com o Claude</h2>
          <p class="sub">Peça conteúdos, ajustes no calendário ou ideias novas.</p>
          <div class="chat-msgs" id="chat-msgs">${chat.length ? chat.map((m) => `<div class="msg ${m.papel === "voce" ? "voce" : "claude"}">${esc(m.texto)}</div>`).join("")
            : `<div class="msg claude">Oi, Yasmin! Me diz o que você quer mudar ou acrescentar. Exemplo: "troca os posts de sábado por reels de rotina" ou "me dá 5 ideias de stories pra semana que vem".</div>`}
            ${enviando ? `<div class="msg claude digitando"><span class="bolinhas"><i></i><i></i><i></i></span></div>` : ""}</div>
          <form class="chat-form" id="chat-form">
            <textarea class="input" id="chat-texto" rows="2" maxlength="2000" placeholder="Escreva pro Claude..." ${enviando ? "disabled" : ""}></textarea>
            <button class="btn primary" type="submit" ${enviando ? "disabled" : ""} aria-label="Enviar">${icon("chat")} Enviar</button>
          </form>
        </aside>
      </div>`;

    const msgs = $("#chat-msgs");
    msgs.scrollTop = msgs.scrollHeight;
    $("#estr-montar")?.addEventListener("click", () => montar($("#estr-pedido").value.trim()));
    $("#estr-refazer")?.addEventListener("click", () => {
      const pedido = prompt("O que você quer nessa nova estratégia?", est?.pedido || "");
      if (pedido !== null) montar(pedido.trim());
    });
    $("#estr-completar")?.addEventListener("click", completar);
    $("#chat-form").addEventListener("submit", (ev) => { ev.preventDefault(); enviar(); });
    $("#chat-texto").addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); enviar(); } });
    $$("[data-agenda]", box).forEach((b) => b.addEventListener("click", async () => {
      const d = est.calendario.find((x) => String(x.dia) === b.dataset.agenda);
      try {
        await window.Agenda.salvar({ dia: d.data, hora: null, titulo: `${d.formato[0].toUpperCase() + d.formato.slice(1)}: ${d.tema}`.slice(0, 160), categoria: "postagem", notas: `${d.ideia}\nGancho: ${d.gancho}`.slice(0, 1000), concluida: false });
        toast(`Colocado na agenda dia ${d.data.slice(8, 10)}/${d.data.slice(5, 7)}.`, "ok");
      } catch (e) { console.warn(e); toast("Não consegui colocar na agenda.", "err"); }
    }));
    $$("[data-rot]", box).forEach((b) => b.addEventListener("click", () => {
      const d = est.calendario.find((x) => String(x.dia) === b.dataset.rot);
      viraRoteiro(d.tema, d.gancho, `${d.ideia}\n\nStories:\n${(d.stories || []).map((s) => "- " + s).join("\n")}\n\nLegenda/CTA: ${d.legenda_cta || ""}`);
    }));
  }

  // Calendário agrupado por semana (usa "semana" do dia ou calcula de 7 em 7),
  // com o título, o foco e a meta de cada semana quando existirem.
  function semanasHtml(dias, cartao) {
    const grupos = new Map();
    dias.forEach((d) => {
      const n = d.semana || Math.ceil(d.dia / 7);
      if (!grupos.has(n)) grupos.set(n, []);
      grupos.get(n).push(d);
    });
    return [...grupos.entries()].sort((a, b) => a[0] - b[0]).map(([n, ds]) => {
      const info = (est.semanas || []).find((s) => s.numero === n);
      const ini = ds[0]?.data, fim = ds[ds.length - 1]?.data;
      const periodo = ini && fim ? `${ini.slice(8, 10)}/${ini.slice(5, 7)} a ${fim.slice(8, 10)}/${fim.slice(5, 7)}` : "";
      return `
        <section class="semana">
          <header class="semana-topo">
            <span class="semana-n">Semana ${n}</span>
            <div><h3>${esc(info?.titulo || "")}</h3>${info?.foco ? `<p>${esc(info.foco)}</p>` : ""}</div>
            <div class="semana-lado"><small>${esc(periodo)}</small>${info?.meta ? `<span>${esc(info.meta)}</span>` : ""}</div>
          </header>
          <div class="calendario30">${ds.map(cartao).join("")}</div>
        </section>`;
    }).join("");
  }

  async function montar(pedido) {
    if (montando) return;
    montando = "O Claude está montando seus pilares e o plano...";
    render();
    const d30 = await api.funcao("ig-analytics", { periodo: "30" });
    const r = await chamaIA("estrategia_plano", { pedido, contexto: d30?.connected ? { perfil: d30.perfil, totais_30_dias: d30.totais } : null });
    if (!r.ok) { montando = ""; render(); $("#estrategia-conteudo").insertAdjacentHTML("afterbegin", avisoIA(r)); return; }
    est = r.resultado;
    await completar(true);
  }

  // Monta o calendário em pedaços de 10 dias (cada pedaço leva ~1 min).
  async function completar(continuando = false) {
    if (montando && !continuando) return;
    const feitos = new Set((est?.calendario || []).map((d) => d.dia));
    for (const [de, ate] of [[1, 10], [11, 20], [21, 30]]) {
      let falta = false;
      for (let i = de; i <= ate; i++) if (!feitos.has(i)) falta = true;
      if (!falta) continue;
      montando = `Montando o calendário: dias ${de} a ${ate} de 30...`;
      render();
      const r = await chamaIA("estrategia_dias", { de, ate });
      if (!r.ok) { montando = ""; render(); $("#estrategia-conteudo").insertAdjacentHTML("afterbegin", avisoIA(r)); return; }
      est = r.resultado;
    }
    montando = "";
    toast("Estratégia e calendário prontos!", "ok");
    render();
  }

  async function enviar() {
    const t = $("#chat-texto").value.trim();
    if (!t || enviando) return;
    chat.push({ papel: "voce", texto: t });
    enviando = true;
    render();
    const r = await chamaIA("estrategia_chat", { mensagem: t });
    enviando = false;
    if (!r.ok) { chat.push({ papel: "claude", texto: r.erro || "Não consegui responder agora." }); render(); return; }
    chat.push({ papel: "claude", texto: r.resultado.resposta });
    if (r.resultado.mudou) { est = r.resultado.estrategia; toast("Estratégia atualizada.", "ok"); }
    render();
  }

  return { abrir };
})();
