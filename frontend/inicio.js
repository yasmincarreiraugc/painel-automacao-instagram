// =====================================================================
// inicio.js: a página Início (saudação, cartões, meta de seguidores,
// prazos, último post, dinheiro, o que fazer hoje e o que vem aí).
// Junta dados da Agenda, Roteiros, Campanhas, Instagram e Site.
// Também cria o botão de olho que esconde os valores em dinheiro.
// =====================================================================
window.Inicio = (() => {
  const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const somaDias = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const extenso = (iso) => { const [a, m, d] = iso.split("-").map(Number); return `${d} de ${MESES[m - 1]}${a !== new Date().getFullYear() ? ` de ${a}` : ""}`; };
  const MSG_SEM_IG = "conecte o Instagram";

  // ---------- meta de seguidores (painel_config) ----------
  const config = {
    async ler(chave) {
      if (!sb) { try { return JSON.parse(store.get(`cfg_${chave}`) || "null"); } catch { return null; } }
      const { data } = await sb.from("painel_config").select("valor").eq("chave", chave).maybeSingle();
      return data?.valor ?? null;
    },
    async gravar(chave, valor) {
      if (!sb) { store.set(`cfg_${chave}`, JSON.stringify(valor)); return; }
      const { error } = await sb.from("painel_config").upsert({ chave, valor, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
  };

  let d = {};

  async function abrir() {
    const hoje = hojeIso();
    const agora = new Date();
    $("#in-data").textContent = `${DIAS_SEMANA[agora.getDay()]}, ${agora.getDate()} de ${MESES[agora.getMonth()]}`;
    esqueleto();

    const seguro = (p) => p.catch((e) => { console.warn(e); return null; });
    const [tarefas, roteiros, campanhas, ig30, ig90, site, meta, leads] = await Promise.all([
      seguro(window.Agenda.listar(hoje, somaDias(hoje, 7))),
      seguro(tabela("roteiros", "updated_at").listar()),
      seguro(window.Campanhas.carregar()),
      seguro(api.funcao("ig-analytics", { periodo: "30" })),
      seguro(api.funcao("ig-analytics", { periodo: "90" })),
      sb ? seguro(sb.rpc("site_resumo", { p_dias: 30 }).then((r) => r.data)) : null,
      seguro(config.ler("meta_seguidores")),
      seguro(api.contar("ig_leads", (q) => q.gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()))),
    ]);
    d = { hoje, tarefas: tarefas || [], roteiros: roteiros || [], campanhas: campanhas || [], ig30, ig90, site, meta, leads };
    render();
  }

  function esqueleto() {
    $("#in-cartoes").innerHTML = ["rosa", "amarelo", "azul", "creme"].map((t) => `<div class="tom ${t} carregando"><span>&nbsp;</span><b>&nbsp;</b></div>`).join("");
    $("#in-meta").innerHTML = "";
    $("#in-trio").innerHTML = "";
    $("#in-dupla").innerHTML = "";
  }

  function render() {
    const hoje = d.hoje;
    const deHoje = d.tarefas.filter((t) => t.dia === hoje);
    const pendentes = deHoje.filter((t) => !t.concluida).length;
    const rotEsperando = d.roteiros.filter((r) => ["ideia", "escrevendo", "pronto"].includes(r.status)).length;

    // Saudação no estilo "Oi, Yasmin. Tem 8 roteiros te esperando."
    $("#in-titulo").innerHTML = pendentes
      ? `Oi, Yasmin. Tem <mark>${pendentes} ${pendentes === 1 ? "tarefa" : "tarefas"}</mark> te esperando.`
      : rotEsperando
        ? `Oi, Yasmin. Tem <mark>${rotEsperando} ${rotEsperando === 1 ? "roteiro" : "roteiros"}</mark> te esperando.`
        : `Oi, Yasmin. Hoje está <mark class="azul">tranquilo</mark>.`;

    // Cartões coloridos.
    const t30 = d.ig30?.connected ? d.ig30.totais : null;
    const novos = t30?.novos;
    $("#in-cartoes").innerHTML = `
      <div class="tom rosa"><span>Saldo de seguidores</span><b>${novos === null || novos === undefined ? "..." : (novos > 0 ? "+" : "") + fmt(novos)}</b>
        <small>${t30 ? `últimos 30 dias · ${fmt(t30.seguidores)} no total` : MSG_SEM_IG}</small></div>
      <div class="tom amarelo"><span>Alcance em 30 dias</span><b>${t30?.alcance != null ? fmt(t30.alcance) : "..."}</b>
        <small>${t30 ? "contas únicas que viram você" : MSG_SEM_IG}</small></div>
      <div class="tom azul"><span>Leads em 30 dias</span><b>${fmt(d.leads || 0)}</b>
        <small>pessoas que comentaram a palavra ou chamaram no direct</small></div>
      <div class="tom creme"><span>Visitas do site</span><b>${fmt(d.site?.pessoas || 0)}</b>
        <small>pessoas no seu portfólio em 30 dias</small></div>`;

    renderMeta();

    // Trio: prazos, último post, dinheiro.
    const r = window.Campanhas.resumo(d.campanhas);
    const prazos = [...r.atrasadas, ...r.proximas].slice(0, 4);
    const post = d.ig90?.connected ? [...(d.ig90.posts || [])].sort((a, b) => b.data.localeCompare(a.data))[0] : null;
    $("#in-trio").innerHTML = `
      <div class="card mini">
        <div class="mini-topo"><h2>${icon("clock")} Prazos de campanha</h2><button class="btn link" data-go-to="campanhas">ver todas</button></div>
        ${prazos.length ? `<ul class="prazos">${prazos.map((c) => `
          <li class="${c.prazo_entrega < hoje ? "atraso" : ""}"><span>Entrega · ${esc(c.marca)}</span><b>${diaMes(c.prazo_entrega)}</b></li>`).join("")}</ul>`
          : `<p class="vazio-nota">Nenhum prazo marcado. <button class="btn link" data-go-to="campanhas">Cadastrar campanha</button></p>`}
      </div>
      <div class="card mini">
        <div class="mini-topo"><h2>${icon("instagram")} Último post</h2><button class="btn link" data-go-to="instagram">ver todos</button></div>
        ${post ? `
          <a class="ultimo-post" href="${esc(post.link)}" target="_blank" rel="noopener">
            ${post.miniatura ? `<img src="${esc(post.miniatura)}" alt="" loading="lazy">` : ""}
            <div><p class="pp-data">${esc(diaMes(post.data.slice(0, 10)))} · ${esc(post.tipo)}</p><p class="pp-leg">${esc(post.legenda || "Sem legenda")}</p></div>
          </a>
          <div class="pp-met"><span>${icon("heart")} ${fmt(post.curtidas)}</span><span>${icon("chat")} ${fmt(post.comentarios)}</span>
            ${post.views !== null ? `<span>${icon("eye")} ${fmt(post.views)}</span>` : ""}${post.salvos !== null ? `<span>${icon("bookmark")} ${fmt(post.salvos)}</span>` : ""}</div>`
          : `<p class="vazio-nota">${d.ig90?.connected ? "Nenhum post nos últimos 90 dias." : "Conecte o Instagram pra ver o último post."}</p>`}
      </div>
      <div class="card mini">
        <div class="mini-topo"><h2>${icon("money")} Dinheiro</h2><button class="btn link" data-go-to="campanhas">detalhes</button></div>
        <div class="dinheiro">
          <div><span>A receber</span><b class="valor">${reais(r.aReceber)}</b></div>
          <div><span>Recebido no mês</span><b class="valor">${reais(r.recebidoMes)}</b></div>
        </div>
        <p class="vazio-nota">${r.nAReceber ? `${r.nAReceber} campanha(s) esperando pagamento.` : "Tudo recebido por enquanto."}</p>
      </div>`;

    // Dupla: o que fazer hoje e o que vem aí.
    const feitas = deHoje.filter((t) => t.concluida).length;
    const vemAi = [
      ...d.tarefas.filter((t) => t.dia > hoje).map((t) => ({ dia: t.dia, txt: t.titulo, tipo: window.Agenda.cat(t.categoria).nome, cor: window.Agenda.cat(t.categoria).cor })),
      ...d.campanhas.filter((c) => ["ativa", "negociando"].includes(c.status) && c.prazo_entrega > hoje && c.prazo_entrega <= somaDias(hoje, 7))
        .map((c) => ({ dia: c.prazo_entrega, txt: `Entrega ${c.marca}`, tipo: "Campanha", cor: "#f2db33" })),
      ...d.roteiros.filter((x) => x.data_gravacao && x.data_gravacao > hoje && x.data_gravacao <= somaDias(hoje, 7))
        .map((x) => ({ dia: x.data_gravacao, txt: `Gravar: ${x.titulo}`, tipo: "Roteiro", cor: "#ff99d9" })),
    ].sort((a, b) => a.dia.localeCompare(b.dia)).slice(0, 7);

    $("#in-dupla").innerHTML = `
      <div class="card mini">
        <div class="mini-topo"><h2>${icon("sun")} O que fazer hoje</h2><span class="chip">${deHoje.length ? `${feitas} de ${deHoje.length}` : "livre"}</span></div>
        ${deHoje.length ? `<ul class="hoje-lista">${deHoje.map((t) => `
          <li class="${t.concluida ? "feita" : ""}">
            <label class="check"><input type="checkbox" data-tarefa="${t.id}" ${t.concluida ? "checked" : ""} aria-label="Marcar ${esc(t.titulo)} como feita"><span>${icon("check")}</span></label>
            <span class="h">${esc(window.Agenda.hora(t.hora) || "dia todo")}</span><span class="t">${esc(t.titulo)}</span>
            <i style="background:${window.Agenda.cat(t.categoria).cor}" title="${esc(window.Agenda.cat(t.categoria).nome)}"></i>
          </li>`).join("")}</ul>`
          : `<p class="vazio-nota">Nada na agenda pra hoje. <button class="btn link" data-go-to="calendario">Adicionar tarefa</button></p>`}
      </div>
      <div class="card mini">
        <div class="mini-topo"><h2>${icon("calendar")} Vem aí</h2><button class="btn link" data-go-to="calendario">agenda completa</button></div>
        ${vemAi.length ? `<ul class="vem-lista">${vemAi.map((v) => `
          <li><span class="dia"><b>${Number(v.dia.slice(8, 10))}</b>${MESES[Number(v.dia.slice(5, 7)) - 1].slice(0, 3)}</span>
            <span class="t">${esc(v.txt)}<small><i style="background:${v.cor}"></i>${esc(v.tipo)}</small></span></li>`).join("")}</ul>`
          : `<p class="vazio-nota">Nada marcado nos próximos 7 dias.</p>`}
      </div>`;

    $$("[data-go-to]").forEach((b) => b.addEventListener("click", () => irPara(b.dataset.goTo)));
    $$("[data-tarefa]").forEach((inp) => inp.addEventListener("change", async () => {
      const t = d.tarefas.find((x) => x.id === inp.dataset.tarefa);
      try { Object.assign(t, await window.Agenda.salvar({ ...t, concluida: inp.checked })); render(); }
      catch (e) { console.warn(e); inp.checked = !inp.checked; toast("Não consegui salvar.", "err"); }
    }));
  }

  // ---------- cartão preto da meta ----------
  function renderMeta() {
    const box = $("#in-meta");
    const t30 = d.ig30?.connected ? d.ig30.totais : null;
    const meta = d.meta;
    if (!meta?.alvo || !meta?.data) {
      box.innerHTML = `
        <div class="meta-vazia">
          <p class="meta-rotulo">${icon("target")} Meta de seguidores</p>
          <h2>Quantos seguidores você quer ter, e até quando?</h2>
          <p class="nota-clara">Com a meta, o painel calcula quanto falta, quanto precisa por semana e projeta a sua curva.</p>
          ${formMeta()}
        </div>`;
      ligarFormMeta();
      return;
    }
    const atual = t30?.seguidores ?? null;
    const diasRest = Math.max(0, diasAte(meta.data));
    const faltam = atual === null ? null : Math.max(0, meta.alvo - atual);
    const porSemana = faltam === null ? null : diasRest ? Math.ceil((faltam / diasRest) * 7) : faltam;
    const ritmo = t30?.novos != null ? Math.round((t30.novos / 30) * 7) : null;
    const pct = atual === null ? 0 : Math.min(100, (atual / meta.alvo) * 100);
    let previsao = "";
    if (faltam === 0) previsao = "Meta batida! Hora de definir a próxima.";
    else if (ritmo > 0) {
      const dias = Math.ceil(faltam / (ritmo / 7));
      const chega = somaDias(hojeIso(), dias);
      previsao = chega <= meta.data ? `No seu ritmo atual, você chega lá em ${extenso(chega)}. Antes do prazo!` : `No ritmo atual, você chegaria em ${extenso(chega)}. Dá pra acelerar!`;
    } else if (ritmo !== null) previsao = "O ritmo dos últimos 30 dias está parado. Bora postar!";

    box.innerHTML = `
      <div class="meta-esq">
        <p class="meta-rotulo">${icon("target")} Meta · até ${extenso(meta.data)}</p>
        <p class="meta-num"><b>${atual === null ? "..." : fmt(atual)}</b><span>de ${fmt(meta.alvo)} seguidores</span></p>
        <div class="meta-barra" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
        <p class="nota-clara">${esc(previsao)}</p>
        <div class="meta-quad">
          <div><span>Faltam</span><b>${faltam === null ? "..." : fmt(faltam)}</b></div>
          <div><span>Dias até ${meta.data.slice(8, 10)}/${meta.data.slice(5, 7)}</span><b>${fmt(diasRest)}</b></div>
          <div><span>Precisa por semana</span><b>${porSemana === null ? "..." : fmt(porSemana)}</b></div>
          <div><span>Seu ritmo por semana</span><b>${ritmo === null ? "..." : (ritmo > 0 ? "+" : "") + fmt(ritmo)}</b></div>
        </div>
      </div>
      <div class="meta-dir">
        <div class="meta-dir-topo"><h2>Seguidores e projeção</h2><button class="pilula" id="meta-editar">editar meta</button></div>
        ${graficoMeta(atual, meta, ritmo)}
        <div class="meta-legenda"><span><i class="l-real"></i>últimos 30 dias</span><span><i class="l-proj"></i>projeção no seu ritmo</span><span><i class="l-meta"></i>meta</span></div>
      </div>
      <div class="meta-form" hidden>${formMeta(meta)}</div>`;
    $("#meta-editar").addEventListener("click", () => { $(".meta-form", box).hidden = false; $(".meta-form input", box).focus(); });
    ligarFormMeta();
  }

  function formMeta(m) {
    return `
      <form class="form-meta" id="form-meta">
        <label><span>Seguidores</span><input class="input" type="number" min="1" step="1" id="meta-alvo" required value="${m?.alvo || ""}" placeholder="2000"></label>
        <label><span>Até</span><input class="input" type="date" id="meta-data" required value="${m?.data || ""}"></label>
        <button class="btn primary" type="submit">Salvar meta</button>
      </form>`;
  }
  function ligarFormMeta() {
    $("#form-meta")?.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const valor = { alvo: Number($("#meta-alvo").value), data: $("#meta-data").value };
      if (!valor.alvo || !valor.data) return;
      try { await config.gravar("meta_seguidores", valor); d.meta = valor; toast("Meta salva.", "ok"); renderMeta(); }
      catch (e) { console.warn(e); toast("Não consegui salvar a meta.", "err"); }
    });
  }

  // Linha: seguidores dos últimos 30 dias (refeitos a partir dos novos por dia)
  // + projeção tracejada no ritmo atual até a data da meta.
  function graficoMeta(atual, meta, ritmo) {
    if (atual === null) return `<div class="soft-box escuro">Conecte o Instagram pra ver a curva.</div>`;
    const serie = d.ig30?.series?.novos || [];
    const pontos = [];
    let v = atual;
    for (let i = serie.length - 1; i >= 0; i--) { pontos.unshift({ x: -(serie.length - 1 - i), y: v }); v -= serie[i].value; }
    if (!pontos.length) pontos.push({ x: 0, y: atual });
    const diasRest = Math.max(1, diasAte(meta.data));
    const fim = { x: diasRest, y: atual + ((ritmo || 0) / 7) * diasRest };
    const xMin = Math.min(-29, pontos[0].x), xMax = diasRest;
    const ys = [...pontos.map((p) => p.y), fim.y, meta.alvo];
    const yMin = Math.min(...ys) * 0.995, yMax = Math.max(...ys) * 1.005;
    const W = 520, H = 190, P = 8;
    const sx = (x) => P + ((x - xMin) / (xMax - xMin || 1)) * (W - 2 * P);
    const TOPO = 24; // espaço pro rótulo da meta
    const sy = (y) => H - P - 14 - ((y - yMin) / (yMax - yMin || 1)) * (H - P - 14 - TOPO);
    const real = pontos.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join("");
    return `
      <svg class="meta-graf" viewBox="0 0 ${W} ${H}" role="img" aria-label="Seguidores nos últimos 30 dias e projeção até a meta">
        <line x1="${P}" x2="${W - P}" y1="${sy(meta.alvo)}" y2="${sy(meta.alvo)}" class="g-meta"/>
        <text x="${W - P}" y="${sy(meta.alvo) - 6}" text-anchor="end" class="g-txt">meta ${fmt(meta.alvo)}</text>
        <path d="${real}" class="g-real"/>
        <path d="M${sx(0)},${sy(atual)}L${sx(fim.x)},${sy(fim.y)}" class="g-proj"/>
        <circle cx="${sx(0)}" cy="${sy(atual)}" r="5" class="g-hoje"/>
        <text x="${sx(0)}" y="${H - 2}" text-anchor="middle" class="g-txt">hoje</text>
      </svg>`;
  }

  // ---------- botão de olho: esconde os valores em dinheiro ----------
  function botaoOlho() {
    const b = document.createElement("button");
    b.className = "olho";
    const aplicar = () => {
      const on = store.get("esconder_valores") === "1";
      document.body.classList.toggle("esconder", on);
      b.innerHTML = icon(on ? "eye-off" : "eye");
      b.setAttribute("aria-label", on ? "Mostrar valores" : "Esconder valores");
      b.title = on ? "Mostrar valores" : "Esconder valores";
    };
    b.addEventListener("click", () => { store.set("esconder_valores", store.get("esconder_valores") === "1" ? "0" : "1"); aplicar(); });
    document.getElementById("app-view").appendChild(b);
    aplicar();
  }
  botaoOlho();

  return { abrir };
})();
