// =====================================================================
// negocio.js: Campanhas, Clientes, Visão geral e Roteiros.
// Dados no Supabase (tabelas campanhas, clientes e roteiros). No modo de teste
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
// Rodapé do cartão: prazo com contagem enquanto está em andamento; depois
// de entregue, só a data (com o ano quando não é o ano atual).
function entregaTexto(iso, emAndamento) {
  if (!iso) return emAndamento ? "sem prazo" : "entregue";
  const data = diaMes(iso) + (iso.slice(0, 4) !== hojeIso().slice(0, 4) ? ` ${iso.slice(0, 4)}` : "");
  return emAndamento ? `${data} · ${prazoTexto(iso)}` : `entregue em ${data}`;
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
  const NICHOS = ["Beleza", "Skincare", "Cabelo", "Maquiagem", "Moda", "Fitness", "Alimentação", "Casa e decoração",
    "Maternidade", "Saúde e bem-estar", "Tecnologia", "Pet", "Viagem", "Educação", "Finanças"];
  const PAGAMENTOS = [["dinheiro", "Dinheiro"], ["permuta", "Permuta"], ["misto", "Dinheiro + permuta"]];
  const origem = (id) => ORIGENS.find((o) => o.id === id) || ORIGENS[ORIGENS.length - 1];
  // Valor em dinheiro (permuta pura não soma).
  const dinheiro = (c) => (c.tipo_pagamento === "permuta" ? 0 : Number(c.valor || 0));
  function valorTexto(c) {
    if (c.tipo_pagamento === "permuta") return `<span class="permuta-chip">Permuta</span>`;
    return `<span class="valor">${reais(c.valor)}</span>${c.tipo_pagamento === "misto" ? ` <span class="permuta-chip">+ permuta</span>` : ""}`;
  }
  const chaveMarca = (m) => String(m || "").trim().toLowerCase();
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
    const trabalhadas = l.filter((c) => c.status !== "negociando");
    return {
      aReceber: abertas.reduce((t, c) => t + dinheiro(c), 0),
      nAReceber: abertas.filter((c) => dinheiro(c) > 0).length,
      recebidoMes: l.filter((c) => c.pago && (c.data_pagamento || "").startsWith(mes)).reduce((t, c) => t + dinheiro(c), 0),
      marcas: new Set(trabalhadas.map((c) => chaveMarca(c.marca))).size,
      trabalhadas,
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
        <div class="tom rosa"><span>Marcas trabalhadas</span><b>${r.marcas}</b><small>marcas diferentes até hoje</small></div>
      </div>
      <div class="grid dois">
        <div class="card"><h2>${icon("target")} De onde vêm suas campanhas</h2>${rosca()}</div>
        <div class="card"><h2>${icon("money")} Quem te deu mais retorno</h2>${retorno()}</div>
      </div>
      <div class="grid marcas-grid">
        <div class="card"><h2>${icon("briefcase")} Marcas que você já trabalhou <span class="muted">(${r.marcas})</span></h2>${tabelaMarcas(r.trabalhadas)}</div>
        <div class="card"><h2>${icon("spark")} Nichos que você mais fez</h2>${nichos(r.trabalhadas)}</div>
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
        <b class="camp-valor">${valorTexto(c)}</b>
        ${c.nicho ? `<span class="camp-nicho">${esc(c.nicho)}</span>` : ""}
        ${c.permuta ? `<p class="camp-entrega">Permuta: ${esc(c.permuta)}</p>` : ""}
        ${c.entregaveis ? `<p class="camp-entrega">${esc(c.entregaveis)}</p>` : ""}
        <div class="camp-rodape">
          <span class="${atrasada ? "atraso" : ""}">${icon("clock")} ${entregaTexto(c.prazo_entrega, ["negociando", "ativa"].includes(c.status))}</span>
          ${c.tipo_pagamento === "permuta" ? `<span class="pago-chk">sem pagamento</span>`
            : `<label class="pago-chk" title="Pagamento recebido"><input type="checkbox" data-pago="${c.id}" ${c.pago ? "checked" : ""}> pago</label>`}
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

  // Lista de marcas: data mais recente, nicho, total em dinheiro e permutas.
  function tabelaMarcas(trab) {
    if (!trab.length) return `<div class="soft-box" style="margin-top:12px">As marcas aparecem aqui quando uma campanha sai de "Negociando".</div>`;
    const grupos = new Map();
    trab.forEach((c) => {
      const k = chaveMarca(c.marca);
      const g = grupos.get(k) || { marca: c.marca, data: "", nichos: new Set(), total: 0, permuta: false, n: 0 };
      const dt = c.prazo_entrega || c.data_pagamento || String(c.created_at || "").slice(0, 10);
      if (dt > g.data) g.data = dt;
      if (c.nicho) g.nichos.add(c.nicho);
      g.total += dinheiro(c);
      g.permuta = g.permuta || ["permuta", "misto"].includes(c.tipo_pagamento);
      g.n += 1;
      grupos.set(k, g);
    });
    const linhas = [...grupos.values()].sort((a, b) => b.data.localeCompare(a.data));
    return `<div class="table-wrap"><table class="leads-table marcas-tabela">
      <thead><tr><th scope="col">Marca</th><th scope="col">Quando</th><th scope="col">Nicho</th><th scope="col" style="text-align:right">Valor</th></tr></thead>
      <tbody>${linhas.map((g) => `<tr>
        <td><b>${esc(g.marca)}</b>${g.n > 1 ? ` <span class="muted">${g.n}x</span>` : ""}</td>
        <td>${g.data ? esc(diaMes(g.data)) + (g.data.slice(0, 4) !== hojeIso().slice(0, 4) ? " " + g.data.slice(0, 4) : "") : ""}</td>
        <td>${[...g.nichos].map((n) => `<span class="chip">${esc(n)}</span>`).join(" ") || `<span class="muted">sem nicho</span>`}</td>
        <td class="num"><span class="valor">${g.total ? reais(g.total) : ""}</span>${g.permuta ? ` <span class="permuta-chip">${g.total ? "+ " : ""}permuta</span>` : ""}</td>
      </tr>`).join("")}</tbody></table></div>`;
  }

  // Quantas campanhas por nicho.
  function nichos(trab) {
    const cont = new Map();
    trab.forEach((c) => { const n = c.nicho || "Sem nicho"; cont.set(n, (cont.get(n) || 0) + 1); });
    const top = [...cont.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (!top.length) return `<div class="soft-box" style="margin-top:12px">Preencha o nicho nas campanhas pra ver onde você mais trabalha.</div>`;
    const max = top[0][1];
    const cores = ["#ff99d9", "#78b4f4", "#f2db33", "#1e1915", "#b9a7f5", "#c9c2b8", "#ff99d9", "#78b4f4"];
    return `<ol class="retorno">${top.map(([n, v], i) => `
      <li><span class="nome">${esc(n)}</span><span class="barra"><i style="width:${Math.max(6, (v / max) * 100)}%;background:${cores[i]}"></i></span><b>${v} campanha${v > 1 ? "s" : ""}</b></li>`).join("")}</ol>`;
  }

  // Barras: soma de valor por marca.
  function retorno() {
    const soma = new Map();
    lista.forEach((c) => soma.set(c.marca, (soma.get(c.marca) || 0) + dinheiro(c)));
    const top = [...soma.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 7);
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
        <span class="label">Pagamento</span>
        <div class="periodos" role="radiogroup" aria-label="Forma de pagamento">
          ${PAGAMENTOS.map(([v, t]) => `<label class="seg ${(c?.tipo_pagamento || "dinheiro") === v ? "on" : ""}"><input type="radio" name="cp-tipo" value="${v}" ${(c?.tipo_pagamento || "dinheiro") === v ? "checked" : ""} class="sr"> ${t}</label>`).join("")}
        </div>
        <div class="dialogo-linha">
          <div data-so="dinheiro"><label class="label" for="cp-valor">Valor (R$)</label><input class="input" id="cp-valor" type="number" min="0" step="0.01" value="${c && c.tipo_pagamento !== "permuta" ? Number(c.valor) : ""}"></div>
          <div><label class="label" for="cp-prazo">Prazo de entrega</label><input class="input" id="cp-prazo" type="date" value="${c?.prazo_entrega || ""}"></div>
          <div><label class="label" for="cp-status">Situação</label><select class="input" id="cp-status">${STATUS.map((s) => `<option value="${s.id}" ${(c?.status || "ativa") === s.id ? "selected" : ""}>${s.nome}</option>`).join("")}</select></div>
        </div>
        <div data-so="permuta">
          <label class="label" for="cp-permuta">O que vem na permuta</label>
          <input class="input" id="cp-permuta" maxlength="200" placeholder="Ex: kit de skincare + 1 perfume" value="${esc(c?.permuta || "")}">
        </div>
        <div class="dialogo-linha dois-col">
          <div><label class="label" for="cp-origem">De onde veio</label>
            <select class="input" id="cp-origem">${ORIGENS.map((o) => `<option value="${o.id}" ${(c?.origem || "instagram") === o.id ? "selected" : ""}>${o.nome}</option>`).join("")}</select></div>
          <div><label class="label" for="cp-nicho">Nicho</label>
            <input class="input" id="cp-nicho" list="cp-nichos" maxlength="40" placeholder="Ex: Skincare" value="${esc(c?.nicho || "")}">
            <datalist id="cp-nichos">${[...new Set([...NICHOS, ...lista.map((x) => x.nicho).filter(Boolean)])].map((n) => `<option value="${esc(n)}">`).join("")}</datalist></div>
        </div>
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
    // Mostra o valor e/ou o campo da permuta conforme a forma de pagamento.
    const tipoAtual = () => $("input[name=cp-tipo]:checked", d).value;
    const mostraCampos = () => {
      const t = tipoAtual();
      $("[data-so=dinheiro]", d).hidden = t === "permuta";
      $("[data-so=permuta]", d).hidden = t === "dinheiro";
      $$("input[name=cp-tipo]", d).forEach((i) => i.parentElement.classList.toggle("on", i.checked));
    };
    $$("input[name=cp-tipo]", d).forEach((i) => i.addEventListener("change", mostraCampos));
    mostraCampos();
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
        tipo_pagamento: tipoAtual(),
        valor: tipoAtual() === "permuta" ? 0 : Number($("#cp-valor", d).value || 0),
        permuta: tipoAtual() === "dinheiro" ? "" : $("#cp-permuta", d).value.trim(),
        nicho: $("#cp-nicho", d).value.trim(),
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

  return { abrir, carregar, resumo, reais, editar, dinheiro };
})();

// ---------------------------------------------------------------------
// CLIENTES: bio links, portfólios e sites (mesmo jeito das campanhas,
// com entrada/sinal).
// ---------------------------------------------------------------------
window.Clientes = (() => {
  const db = tabela("clientes");
  const SERVICOS = [
    { id: "bio_link", nome: "Bio link", cor: "#ff99d9" },
    { id: "portfolio", nome: "Portfólio", cor: "#78b4f4" },
    { id: "site", nome: "Site", cor: "#f2db33" },
    { id: "outro", nome: "Outro", cor: "#c9c2b8" },
  ];
  const ORIGENS = [
    { id: "instagram", nome: "Instagram", cor: "#ff99d9" },
    { id: "indicacao", nome: "Indicação", cor: "#78b4f4" },
    { id: "whatsapp", nome: "WhatsApp", cor: "#f2db33" },
    { id: "outro", nome: "Outro", cor: "#c9c2b8" },
  ];
  const STATUS = [
    { id: "orcamento", nome: "Orçamento" },
    { id: "producao", nome: "Em produção" },
    { id: "entregue", nome: "Entregue" },
    { id: "finalizado", nome: "Finalizado" },
  ];
  const RAMOS = ["Criadora de conteúdo", "UGC creator", "Confeitaria", "Estética", "Salão de beleza", "Moda", "Loja online",
    "Saúde", "Fotografia", "Educação", "Imobiliária", "Alimentação", "Advocacia", "Consultoria"];
  const servico = (id) => SERVICOS.find((s) => s.id === id) || SERVICOS[SERVICOS.length - 1];
  const origem = (id) => ORIGENS.find((o) => o.id === id) || ORIGENS[ORIGENS.length - 1];
  const statusNome = (id) => STATUS.find((s) => s.id === id)?.nome || id;
  // Quanto já entrou e quanto falta de um cliente.
  const recebido = (c) => (c.pago ? Number(c.valor || 0) : Math.min(Number(c.entrada || 0), Number(c.valor || 0)));
  const falta = (c) => (c.status === "orcamento" ? 0 : Math.max(0, Number(c.valor || 0) - recebido(c)));
  let lista = [];
  let filtro = "andamento";
  let ligado = false;

  async function carregar() {
    try { lista = await db.listar(); } catch (e) { console.warn(e); lista = []; toast("Não consegui carregar os clientes.", "err"); }
    return lista;
  }

  async function abrir() {
    ligar();
    $("#clientes-conteudo").innerHTML = `<p class="sub">Carregando...</p>`;
    await carregar();
    render();
  }

  function render() {
    const mes = hojeIso().slice(0, 7);
    const fechados = lista.filter((c) => c.status !== "orcamento");
    const pendentes = fechados.filter((c) => falta(c) > 0);
    const proximos = lista.filter((c) => c.status === "producao" && c.prazo_entrega && c.prazo_entrega >= hojeIso())
      .sort((a, b) => a.prazo_entrega.localeCompare(b.prazo_entrega));
    const prox = proximos[0];
    const recMes = window.Negocio.entradas([], lista).filter((e) => e.data.startsWith(mes)).reduce((t, e) => t + e.valor, 0);
    const visiveis = lista.filter((c) => filtro === "todos" ? true
      : filtro === "andamento" ? ["orcamento", "producao"].includes(c.status) : ["entregue", "finalizado"].includes(c.status));
    const nAnd = lista.filter((c) => ["orcamento", "producao"].includes(c.status)).length;

    $("#clientes-conteudo").innerHTML = `
      <div class="grid tons">
        <div class="tom rosa"><span>A receber</span><b class="valor">${reais(pendentes.reduce((t, c) => t + falta(c), 0))}</b><small>${pendentes.length} cliente(s) com saldo aberto</small></div>
        <div class="tom amarelo"><span>Recebido no mês</span><b class="valor">${reais(recMes)}</b><small>entradas e pagamentos</small></div>
        <div class="tom azul"><span>Em produção</span><b>${lista.filter((c) => c.status === "producao").length}</b><small>${lista.filter((c) => c.status === "orcamento").length ? `+ ${lista.filter((c) => c.status === "orcamento").length} em orçamento` : "trabalhos rodando agora"}</small></div>
        <div class="tom creme"><span>Próxima entrega</span><b>${prox ? diaMes(prox.prazo_entrega) : "nenhuma"}</b><small>${prox ? esc(prox.nome) + ", " + prazoTexto(prox.prazo_entrega) : "sem prazo marcado"}</small></div>
        <div class="tom rosa"><span>Clientes atendidos</span><b>${new Set(fechados.map((c) => String(c.nome).trim().toLowerCase())).size}</b><small>trabalhos fechados até hoje</small></div>
      </div>
      <div class="grid dois">
        <div class="card"><h2>${icon("globe")} O que você mais vende</h2>${barras(fechados, SERVICOS, "servico", "trabalho")}</div>
        <div class="card"><h2>${icon("target")} De onde vêm seus clientes</h2>${barras(lista, ORIGENS, "origem", "cliente")}</div>
      </div>
      <div class="periodos" role="group" aria-label="Filtrar clientes" style="margin:22px 0 14px">
        ${[["andamento", `Em andamento ${nAnd}`], ["entregues", "Entregues"], ["todos", `Todos ${lista.length}`]].map(([v, t]) =>
          `<button class="seg ${v === filtro ? "on" : ""}" data-filtro-cli="${v}">${t}</button>`).join("")}
      </div>
      ${visiveis.length ? `<div class="camp-grade">${visiveis.map(cartao).join("")}</div>` : `
        <div class="card empty"><div class="ico">${icon("users")}</div><h2>${lista.length ? "Nada nesse filtro" : "Nenhum cliente ainda"}</h2>
          <p>Cadastre o cliente, o serviço, o valor e a entrada. A Visão geral soma tudo com as campanhas.</p>
          <button class="btn primary" data-cli-novo>${icon("plus")} Novo cliente</button></div>`}`;

    $$("[data-filtro-cli]").forEach((b) => b.addEventListener("click", () => { filtro = b.dataset.filtroCli; render(); }));
    $$("[data-cli-novo]").forEach((b) => b.addEventListener("click", () => editar(null)));
    $$("[data-cli]").forEach((el) => {
      const abre = (ev) => { if (ev.target.closest("[data-cli-pago], a")) return; editar(lista.find((c) => c.id === el.dataset.cli)); };
      el.addEventListener("click", abre);
      el.addEventListener("keydown", (ev) => { if (ev.target === el && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); abre(ev); } });
    });
    $$("[data-cli-pago]").forEach((inp) => inp.addEventListener("change", async () => {
      const c = lista.find((x) => x.id === inp.dataset.cliPago);
      try {
        Object.assign(c, await db.salvar({ id: c.id, pago: inp.checked, data_pagamento: inp.checked ? (c.data_pagamento || hojeIso()) : null }));
        toast(inp.checked ? "Pagamento completo marcado." : "Pagamento desmarcado.", "ok");
        render();
      } catch (e) { console.warn(e); inp.checked = !inp.checked; toast("Não consegui salvar.", "err"); }
    }));
  }

  function cartao(c) {
    const atrasado = c.status === "producao" && c.prazo_entrega && c.prazo_entrega < hojeIso();
    const s = servico(c.servico);
    const rec = recebido(c);
    return `
      <article class="card camp" data-cli="${c.id}" tabindex="0" role="button" aria-label="Abrir cliente ${esc(c.nome)}">
        <div class="camp-topo">
          <span class="camp-origem" style="--c:${s.cor}">${esc(s.nome)}</span>
          <span class="badge st-cli-${c.status}">${statusNome(c.status)}</span>
        </div>
        <h3>${esc(c.nome)}</h3>
        <b class="camp-valor"><span class="valor">${reais(c.valor)}</span></b>
        ${!c.pago && rec > 0 ? `<p class="camp-entrega">Entrada de <span class="valor">${reais(rec)}</span> recebida · falta <span class="valor">${reais(falta(c))}</span></p>` : ""}
        ${c.ramo ? `<span class="camp-nicho">${esc(c.ramo)}</span>` : ""}
        ${c.entregaveis ? `<p class="camp-entrega">${esc(c.entregaveis)}</p>` : ""}
        ${c.link ? `<p class="camp-entrega"><a href="${esc(/^https?:\/\//.test(c.link) ? c.link : "https://" + c.link)}" target="_blank" rel="noopener">${icon("link")} ver no ar</a></p>` : ""}
        <div class="camp-rodape">
          <span class="${atrasado ? "atraso" : ""}">${icon("clock")} ${entregaTexto(c.prazo_entrega, ["orcamento", "producao"].includes(c.status))}</span>
          <label class="pago-chk" title="Pagamento completo recebido"><input type="checkbox" data-cli-pago="${c.id}" ${c.pago ? "checked" : ""}> pago</label>
        </div>
      </article>`;
  }

  // Barras de contagem por serviço ou origem.
  function barras(l, grupos, campo, palavra) {
    const cont = grupos.map((g) => ({ ...g, n: l.filter((c) => (c[campo] || "outro") === g.id).length })).filter((g) => g.n);
    if (!cont.length) return `<div class="soft-box" style="margin-top:12px">Aparece aqui quando você cadastrar clientes.</div>`;
    const max = Math.max(...cont.map((g) => g.n));
    return `<ol class="retorno">${cont.sort((a, b) => b.n - a.n).map((g) => `
      <li><span class="nome">${esc(g.nome)}</span><span class="barra"><i style="width:${Math.max(6, (g.n / max) * 100)}%;background:${g.cor}"></i></span><b>${g.n} ${palavra}${g.n > 1 ? "s" : ""}</b></li>`).join("")}</ol>`;
  }

  function editar(c) {
    const d = janela("cli-dialog", `
      <form method="dialog" id="cli-form">
        <h2>${c ? "Editar cliente" : "Novo cliente"}</h2>
        <label class="label" for="cl-nome">Cliente</label>
        <input class="input" id="cl-nome" required maxlength="80" value="${esc(c?.nome || "")}" placeholder="Nome da pessoa ou do negócio">
        <span class="label">Serviço</span>
        <div class="periodos" role="radiogroup" aria-label="Serviço">
          ${SERVICOS.map((s) => `<label class="seg ${(c?.servico || "bio_link") === s.id ? "on" : ""}"><input type="radio" name="cl-servico" value="${s.id}" ${(c?.servico || "bio_link") === s.id ? "checked" : ""} class="sr"> ${s.nome}</label>`).join("")}
        </div>
        <div class="dialogo-linha">
          <div><label class="label" for="cl-valor">Valor total (R$)</label><input class="input" id="cl-valor" type="number" min="0" step="0.01" value="${c ? Number(c.valor) : ""}"></div>
          <div><label class="label" for="cl-prazo">Prazo de entrega</label><input class="input" id="cl-prazo" type="date" value="${c?.prazo_entrega || ""}"></div>
          <div><label class="label" for="cl-status">Situação</label><select class="input" id="cl-status">${STATUS.map((s) => `<option value="${s.id}" ${(c?.status || "producao") === s.id ? "selected" : ""}>${s.nome}</option>`).join("")}</select></div>
        </div>
        <div class="dialogo-linha dois-col">
          <div><label class="label" for="cl-entrada">Entrada recebida (R$)</label><input class="input" id="cl-entrada" type="number" min="0" step="0.01" placeholder="0" value="${c && Number(c.entrada) ? Number(c.entrada) : ""}"></div>
          <div><label class="label" for="cl-dataent">Data da entrada</label><input class="input" id="cl-dataent" type="date" value="${c?.data_entrada || ""}"></div>
        </div>
        <div class="dialogo-linha dois-col">
          <div><label class="label" for="cl-origem">De onde veio</label>
            <select class="input" id="cl-origem">${ORIGENS.map((o) => `<option value="${o.id}" ${(c?.origem || "instagram") === o.id ? "selected" : ""}>${o.nome}</option>`).join("")}</select></div>
          <div><label class="label" for="cl-ramo">Ramo</label>
            <input class="input" id="cl-ramo" list="cl-ramos" maxlength="40" placeholder="Ex: Confeitaria" value="${esc(c?.ramo || "")}">
            <datalist id="cl-ramos">${[...new Set([...RAMOS, ...lista.map((x) => x.ramo).filter(Boolean)])].map((n) => `<option value="${esc(n)}">`).join("")}</datalist></div>
        </div>
        <div class="dialogo-linha dois-col">
          <div><label class="label" for="cl-contato">Contato</label><input class="input" id="cl-contato" maxlength="120" placeholder="WhatsApp ou @" value="${esc(c?.contato || "")}"></div>
          <div><label class="label" for="cl-link">Link do trabalho no ar</label><input class="input" id="cl-link" maxlength="300" placeholder="ex: cliente.com.br" value="${esc(c?.link || "")}"></div>
        </div>
        <label class="label" for="cl-entregaveis">O que inclui</label>
        <input class="input" id="cl-entregaveis" maxlength="200" placeholder="Ex: bio link + 3 páginas + domínio" value="${esc(c?.entregaveis || "")}">
        <label class="label" for="cl-notas">Observações</label>
        <textarea class="input" id="cl-notas" rows="3" maxlength="2000" placeholder="Briefing, cores, combinados...">${esc(c?.notas || "")}</textarea>
        <div class="dialogo-linha dois-col">
          <label class="switch" style="margin-top:14px"><input type="checkbox" id="cl-pago" ${c?.pago ? "checked" : ""}><span class="track"></span> Pagamento completo</label>
          <div><label class="label" for="cl-datapag">Data do pagamento final</label><input class="input" id="cl-datapag" type="date" value="${c?.data_pagamento || ""}"></div>
        </div>
        <div class="dialogo-acoes">
          ${c ? `<button class="btn danger" type="button" id="cl-apagar">Apagar</button>` : ""}
          <span style="flex:1"></span>
          <button class="btn" type="button" id="cl-cancelar">Cancelar</button>
          <button class="btn primary" type="submit">Salvar</button>
        </div>
      </form>`);
    d.showModal();
    $("#cl-nome", d).focus();
    $$("input[name=cl-servico]", d).forEach((i) => i.addEventListener("change", () =>
      $$("input[name=cl-servico]", d).forEach((x) => x.parentElement.classList.toggle("on", x.checked))));
    $("#cl-cancelar", d).addEventListener("click", () => d.close());
    $("#cl-apagar", d)?.addEventListener("click", async () => {
      if (!confirm(`Apagar o cliente "${c.nome}"?`)) return;
      try { await db.apagar(c.id); d.close(); toast("Cliente apagado.", "ok"); abrir(); }
      catch (e) { console.warn(e); toast("Não consegui apagar.", "err"); }
    });
    $("#cli-form", d).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const pago = $("#cl-pago", d).checked;
      const entrada = Number($("#cl-entrada", d).value || 0);
      const row = {
        ...(c ? { id: c.id } : {}),
        nome: $("#cl-nome", d).value.trim(),
        servico: $("input[name=cl-servico]:checked", d).value,
        valor: Number($("#cl-valor", d).value || 0),
        entrada,
        data_entrada: entrada > 0 ? ($("#cl-dataent", d).value || hojeIso()) : null,
        prazo_entrega: $("#cl-prazo", d).value || null,
        status: $("#cl-status", d).value,
        origem: $("#cl-origem", d).value,
        ramo: $("#cl-ramo", d).value.trim(),
        contato: $("#cl-contato", d).value.trim(),
        link: $("#cl-link", d).value.trim(),
        entregaveis: $("#cl-entregaveis", d).value.trim(),
        notas: $("#cl-notas", d).value.trim(),
        pago,
        data_pagamento: pago ? ($("#cl-datapag", d).value || hojeIso()) : null,
      };
      if (!row.nome) return;
      try { await db.salvar(row); d.close(); toast(c ? "Cliente atualizado." : "Cliente cadastrado.", "ok"); abrir(); }
      catch (e) { console.warn(e); toast("Não consegui salvar o cliente.", "err"); }
    });
  }

  function ligar() {
    if (ligado) return;
    ligado = true;
    $("#cliente-novo").addEventListener("click", () => editar(null));
  }

  return { abrir, carregar, recebido, falta, servico, SERVICOS };
})();

// ---------------------------------------------------------------------
// VISÃO GERAL do negócio: campanhas + clientes, mês e acumulado.
// ---------------------------------------------------------------------
window.Negocio = (() => {
  const COR_CAMP = "#78b4f4";
  const COR_CLI = "#ff99d9";
  const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const dataCriacao = (x) => String(x.created_at || "").slice(0, 10) || hojeIso();
  let camps = [];
  let clis = [];

  // Cada dinheiro que entrou, com a data em que entrou.
  function entradas(campanhas, clientes) {
    const l = [];
    campanhas.forEach((c) => {
      const v = window.Campanhas.dinheiro(c);
      if (c.pago && v > 0) l.push({ data: c.data_pagamento || dataCriacao(c), valor: v, fonte: "campanha", nome: c.marca });
    });
    clientes.forEach((c) => {
      const total = Number(c.valor || 0);
      const ent = Math.min(Number(c.entrada || 0), total);
      if (ent > 0) l.push({ data: c.data_entrada || dataCriacao(c), valor: ent, fonte: "cliente", servico: c.servico, nome: c.nome });
      if (c.pago && total - ent > 0) l.push({ data: c.data_pagamento || dataCriacao(c), valor: total - ent, fonte: "cliente", servico: c.servico, nome: c.nome });
    });
    return l;
  }

  // Trabalhos fechados (saíram de negociação/orçamento). A data é a do
  // próprio trabalho (entrega, entrada ou pagamento), não a do cadastro,
  // pra quem cadastra trabalhos antigos não cair tudo no mês de hoje.
  function fechados() {
    return [
      ...camps.filter((c) => c.status !== "negociando").map((c) => ({
        data: c.prazo_entrega || c.data_pagamento || dataCriacao(c), valor: window.Campanhas.dinheiro(c) })),
      ...clis.filter((c) => c.status !== "orcamento").map((c) => ({
        data: c.data_entrada || c.prazo_entrega || c.data_pagamento || dataCriacao(c), valor: Number(c.valor || 0) })),
    ];
  }

  function pendencias() {
    return [
      ...camps.filter((c) => ["ativa", "entregue"].includes(c.status) && !c.pago && window.Campanhas.dinheiro(c) > 0)
        .map((c) => ({ nome: c.marca, tipo: "Campanha", valor: window.Campanhas.dinheiro(c), prazo: c.prazo_entrega })),
      ...clis.filter((c) => window.Clientes.falta(c) > 0)
        .map((c) => ({ nome: c.nome, tipo: window.Clientes.servico(c.servico).nome, valor: window.Clientes.falta(c), prazo: c.prazo_entrega })),
    ].sort((a, b) => (a.prazo || "9999").localeCompare(b.prazo || "9999"));
  }

  async function abrir() {
    $("#negocio-conteudo").innerHTML = `<p class="sub">Carregando...</p>`;
    [camps, clis] = await Promise.all([window.Campanhas.carregar(), window.Clientes.carregar()]);
    render();
  }

  const soma = (l) => l.reduce((t, e) => t + e.valor, 0);
  const mesDe = (iso) => iso.slice(0, 7);
  function mesAnterior(ym) { const [a, m] = ym.split("-").map(Number); return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`; }

  function render() {
    const ent = entradas(camps, clis);
    const mes = hojeIso().slice(0, 7);
    const doMes = ent.filter((e) => mesDe(e.data) === mes);
    const doAnt = ent.filter((e) => mesDe(e.data) === mesAnterior(mes));
    const recMes = soma(doMes), recAnt = soma(doAnt), recTudo = soma(ent);
    const fech = fechados();
    const fechMes = fech.filter((f) => mesDe(f.data) === mes);
    const comValor = fech.filter((f) => f.valor > 0);
    const pend = pendencias();
    const primeiro = ent.map((e) => e.data).sort()[0];
    const variacao = recAnt > 0 ? Math.round(((recMes - recAnt) / recAnt) * 100) : null;
    const [, mm] = mes.split("-").map(Number);

    $("#negocio-conteudo").innerHTML = `
      <div class="grid tons">
        <div class="tom rosa"><span>Recebido em ${MESES_LONGOS[mm - 1]}</span><b class="valor">${reais(recMes)}</b>
          <small>${variacao === null ? "primeiro mês com comparação" : `${variacao >= 0 ? "+" : ""}${variacao}% em relação ao mês passado`}</small></div>
        <div class="tom amarelo"><span>Recebido até hoje</span><b class="valor">${reais(recTudo)}</b>
          <small>${primeiro ? `desde ${diaMes(primeiro)} ${primeiro.slice(0, 4)}` : "nada recebido ainda"}</small></div>
        <div class="tom azul"><span>A receber</span><b class="valor">${reais(soma(pend))}</b><small>${pend.length} trabalho(s) com saldo aberto</small></div>
        <div class="tom creme"><span>Fechado no mês</span><b class="valor">${reais(soma(fechMes))}</b><small>${fechMes.length} trabalho(s) novo(s) em ${MESES_LONGOS[mm - 1]}</small></div>
        <div class="tom rosa"><span>Ticket médio</span><b class="valor">${reais(comValor.length ? soma(comValor) / comValor.length : 0)}</b><small>${fech.length} trabalho(s) fechado(s) até hoje</small></div>
      </div>
      <div class="grid dois">
        <div class="card"><h2>${icon("money")} Este mês</h2>${divisao(doMes, recMes)}</div>
        <div class="card"><h2>${icon("trophy")} Até hoje</h2>${divisao(ent, recTudo)}</div>
      </div>
      <div class="card" style="margin-top:12px">
        <div class="mini-topo"><h2>${icon("chart")} Recebido por mês</h2>
          <div class="neg-legenda"><span><i style="background:${COR_CLI}"></i>Clientes (sites)</span><span><i style="background:${COR_CAMP}"></i>Campanhas</span></div></div>
        ${grafico(ent)}
      </div>
      <div class="grid dois" style="margin-top:12px">
        <div class="card"><div class="mini-topo"><h2>${icon("clock")} Falta receber</h2></div>${listaPend(pend)}</div>
        <div class="card"><div class="mini-topo"><h2>${icon("file")} Mês a mês</h2></div>${tabelaMeses(ent)}</div>
      </div>`;
    $$("[data-go-neg]").forEach((b) => b.addEventListener("click", () => irPara(b.dataset.goNeg)));
  }

  // Quanto veio de cada fonte: campanhas e cada serviço de site.
  function divisao(l, total) {
    if (!total) return `<div class="soft-box" style="margin-top:12px">Nenhum valor recebido nesse período. Marque como pago nas Campanhas e nos Clientes.</div>`;
    const linhas = [
      { nome: "Campanhas", cor: COR_CAMP, v: soma(l.filter((e) => e.fonte === "campanha")) },
      ...window.Clientes.SERVICOS.map((s) => ({ nome: s.nome, cor: s.cor, v: soma(l.filter((e) => e.fonte === "cliente" && (e.servico || "outro") === s.id)) })),
    ].filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
    const max = linhas[0].v;
    return `<ol class="retorno">${linhas.map((x) => `
      <li><span class="nome">${x.nome}</span><span class="barra"><i style="width:${Math.max(4, (x.v / max) * 100)}%;background:${x.cor}"></i></span><b class="valor">${reais(x.v)}</b></li>`).join("")}</ol>
      <p class="hint">${linhas.map((x) => `${x.nome}: ${Math.round((x.v / total) * 100)}%`).join(" · ")}</p>`;
  }

  // Do primeiro recebimento até hoje (no mínimo 6 meses, no máximo 24).
  function meses(ent) {
    const atual = hojeIso().slice(0, 7);
    const primeiro = ent.map((e) => mesDe(e.data)).sort()[0] || atual;
    const lista = [atual];
    while (lista.length < 24 && (lista.length < 6 || lista[0] > primeiro)) lista.unshift(mesAnterior(lista[0]));
    return lista.map((ym) => {
      const doMes = ent.filter((e) => mesDe(e.data) === ym);
      return { ym, camp: soma(doMes.filter((e) => e.fonte === "campanha")), cli: soma(doMes.filter((e) => e.fonte === "cliente")) };
    });
  }
  const nomeMes = (ym, longo) => { const [a, m] = ym.split("-").map(Number); return longo ? `${MESES_LONGOS[m - 1]} ${a}` : MESES_CURTOS[m - 1]; };

  function grafico(ent) {
    const ms = meses(ent);
    const max = Math.max(...ms.map((m) => m.camp + m.cli));
    if (!max) return `<div class="soft-box" style="margin-top:12px">O gráfico aparece quando entrar o primeiro pagamento.</div>`;
    return `<div class="neg-grafico" role="img" aria-label="Recebido por mês, separado entre clientes e campanhas">
      ${ms.map((m, i) => {
        const tot = m.camp + m.cli;
        return `<div class="neg-col" tabindex="0" aria-label="${nomeMes(m.ym, true)}: ${reais(tot)}">
          <div class="neg-tt"><b>${nomeMes(m.ym, true)}</b><span><i style="background:${COR_CLI}"></i>Clientes <b class="valor">${reais(m.cli)}</b></span>
            <span><i style="background:${COR_CAMP}"></i>Campanhas <b class="valor">${reais(m.camp)}</b></span><span>Total <b class="valor">${reais(tot)}</b></span></div>
          <div class="neg-pilha" style="height:${(tot / max) * 100}%">
            ${m.cli ? `<i style="flex:${m.cli};background:${COR_CLI}"></i>` : ""}${m.camp ? `<i style="flex:${m.camp};background:${COR_CAMP}"></i>` : ""}
          </div>
          <span class="neg-mes">${nomeMes(m.ym)}${i === 0 || m.ym.endsWith("-01") ? ` ${m.ym.slice(2, 4)}` : ""}</span>
        </div>`;
      }).join("")}
    </div>`;
  }

  function listaPend(pend) {
    if (!pend.length) return `<p class="vazio-nota">Tudo recebido por enquanto.</p>`;
    return `<ul class="prazos">${pend.slice(0, 8).map((p) => `
      <li class="${p.prazo && p.prazo < hojeIso() ? "atraso" : ""}"><span>${esc(p.nome)} <span class="muted">· ${esc(p.tipo)}${p.prazo ? ` · ${diaMes(p.prazo)}` : ""}</span></span><b class="valor">${reais(p.valor)}</b></li>`).join("")}</ul>
      ${pend.length > 8 ? `<p class="hint">e mais ${pend.length - 8}.</p>` : ""}
      <p class="hint"><button class="btn link" data-go-neg="campanhas">ver campanhas</button> · <button class="btn link" data-go-neg="clientes">ver clientes</button></p>`;
  }

  function tabelaMeses(ent) {
    const ms = meses(ent).filter((m) => m.camp + m.cli).reverse();
    if (!ms.length) return `<p class="vazio-nota">Os meses aparecem aqui quando entrar o primeiro pagamento.</p>`;
    return `<div class="table-wrap"><table class="leads-table">
      <thead><tr><th scope="col">Mês</th><th scope="col" style="text-align:right">Clientes</th><th scope="col" style="text-align:right">Campanhas</th><th scope="col" style="text-align:right">Total</th></tr></thead>
      <tbody>${ms.map((m) => `<tr><td>${nomeMes(m.ym, true)}</td><td class="num"><span class="valor">${reais(m.cli)}</span></td>
        <td class="num"><span class="valor">${reais(m.camp)}</span></td><td class="num"><b class="valor">${reais(m.camp + m.cli)}</b></td></tr>`).join("")}</tbody></table></div>`;
  }

  return { abrir, entradas };
})();

// ---------------------------------------------------------------------
// ROTEIROS: quadro por etapa (ideia > escrevendo > pronto > gravado > postado).
// Cada roteiro tem 2 ganchos e cenas (parte, áudio, imagem, referência).
// "Salvar e enviar pra marca" gera um link secreto pra roteiro.html, onde a
// marca escolhe o gancho, comenta nas cenas e aprova. O retorno fica em
// roteiro_feedback e aparece no card e no editor.
// ---------------------------------------------------------------------
window.Roteiros = (() => {
  const db = tabela("roteiros", "updated_at");
  const fbDb = tabela("roteiro_feedback");
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
  let feedback = [];
  let busca = "";
  let ligado = false;

  async function carregar() {
    try {
      [lista, campanhas, feedback] = await Promise.all([
        db.listar(), tabela("campanhas").listar(), fbDb.listar().catch(() => []),
      ]);
    } catch (e) { console.warn(e); toast("Não consegui carregar os roteiros.", "err"); }
    return lista;
  }

  async function abrir() {
    ligar();
    $("#roteiros-conteudo").innerHTML = `<p class="sub">Carregando...</p>`;
    await carregar();
    render();
  }

  const marcaDe = (r) => r.marca_nome || campanhas.find((c) => c.id === r.campanha_id)?.marca || "";
  const linkDe = (r) => new URL(`roteiro.html?t=${r.link_token}`, location.href.split("#")[0]).href;
  const fbDe = (r) => feedback.filter((f) => f.roteiro_id === r.id);
  const dataHora = (iso) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  function selo(r) {
    if (r.aprovado_em) return `<span class="chip rot-aprovado">${icon("check")} aprovado</span>`;
    const novos = fbDe(r).filter((f) => !f.lido).length;
    if (novos) return `<span class="chip rot-novo">${novos} ${novos === 1 ? "retorno novo" : "retornos novos"}</span>`;
    if (r.enviado_em) return `<span class="chip rot-espera">com a marca</span>`;
    return "";
  }

  function render() {
    const q = busca.trim().toLowerCase();
    const vis = lista.filter((r) => !q || [r.titulo, r.gancho, r.gancho2, r.texto, marcaDe(r)].some((v) => String(v || "").toLowerCase().includes(q)));
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
                <div class="rot-tags"><span class="chip">${esc(r.formato)}</span>${marcaDe(r) ? `<span class="chip marca-chip">${esc(marcaDe(r))}</span>` : ""}${selo(r)}</div>
                <h3>${esc(r.titulo)}</h3>
                ${r.gancho ? `<p>"${esc(r.gancho.slice(0, 110))}${r.gancho.length > 110 ? "..." : ""}"</p>` : ""}
                ${r.data_gravacao ? `<small>${icon("video")} gravar ${diaMes(r.data_gravacao)}</small>` : ""}
              </article>`).join("")}
            ${e.id === "ideia" ? `<button class="rot-add" data-rot-novo>${icon("plus")} Novo roteiro</button>` : ""}
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

  // Roteiros antigos só tinham o texto corrido: cada parágrafo vira uma cena.
  function cenasIniciais(r) {
    if (Array.isArray(r?.cenas) && r.cenas.length) return r.cenas.map((c) => ({ ...c }));
    const blocos = String(r?.texto || "").split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    if (!blocos.length) return [{ parte: "Cena 1", audio: "", imagem: "", referencia: "" }];
    return blocos.map((b, i) => {
      const m = b.match(/^([^:\n]{1,30}):\s*([\s\S]*)$/);
      return { parte: m ? m[1].trim() : `Cena ${i + 1}`, audio: m ? m[2].trim() : b, imagem: "", referencia: "" };
    });
  }

  async function subirImagem(arquivo) {
    if (!sb) throw new Error("No modo de teste não dá pra enviar imagens.");
    if (!arquivo.type.startsWith("image/")) throw new Error("Escolha uma imagem (png, jpg ou webp).");
    if (arquivo.size > 5 * 1024 * 1024) throw new Error("A imagem passa de 5 MB.");
    const ext = (arquivo.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const caminho = `${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from("roteiros").upload(caminho, arquivo, { contentType: arquivo.type });
    if (error) throw error;
    return sb.storage.from("roteiros").getPublicUrl(caminho).data.publicUrl;
  }

  // Botão "Enviar foto": abre o seletor e põe o link da imagem no campo.
  function escolherImagem(campo, depois) {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.addEventListener("change", async () => {
      const arq = inp.files?.[0];
      if (!arq) return;
      toast("Enviando imagem...", "info");
      try { campo.value = await subirImagem(arq); campo.dispatchEvent(new Event("input")); depois?.(); toast("Imagem enviada.", "ok"); }
      catch (e) { console.warn(e); toast(e.message || "Não consegui enviar a imagem.", "err"); }
    });
    inp.click();
  }

  function cenaHtml(c, i) {
    return `
      <div class="ro-cena" data-cena>
        <div class="ro-cena-topo">
          <span class="ro-num">${i + 1}</span>
          <input class="input" data-c="parte" maxlength="60" value="${esc(c.parte)}" aria-label="Parte" placeholder="Cena ${i + 1}">
          <button class="icon-btn" type="button" data-cena-sobe title="Subir" aria-label="Subir cena" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="icon-btn" type="button" data-cena-tira title="Tirar cena" aria-label="Tirar cena">${icon("trash")}</button>
        </div>
        <div class="ro-cena-cols">
          <div><label class="label">Áudio <span class="nota">o que eu falo</span></label><textarea class="input" data-c="audio" rows="3" maxlength="2000">${esc(c.audio)}</textarea></div>
          <div><label class="label">Imagem <span class="nota">o que aparece</span></label><textarea class="input" data-c="imagem" rows="3" maxlength="2000">${esc(c.imagem)}</textarea></div>
        </div>
        <label class="label">Referência <span class="nota">link de vídeo ou foto</span></label>
        <div class="ro-ref">
          <input class="input" data-c="referencia" maxlength="600" value="${esc(c.referencia)}" placeholder="https://...">
          <button class="btn sm" type="button" data-cena-foto>${icon("image")} Enviar foto</button>
        </div>
      </div>`;
  }

  function feedbackHtml(r) {
    const l = fbDe(r);
    if (!r.enviado_em) return "";
    const rotulo = { gancho: "escolheu", comentario: "comentou", aprovacao: "aprovou" };
    return `
      <div class="ro-retorno">
        <div class="ro-retorno-topo">
          <b>Retorno da marca</b>
          <span class="nota">enviado em ${dataHora(r.enviado_em)}</span>
        </div>
        <div class="ro-retorno-status">
          ${r.aprovado_em ? `<span class="chip rot-aprovado">${icon("check")} aprovado por ${esc(r.aprovado_por)} em ${dataHora(r.aprovado_em)}</span>` : `<span class="chip rot-espera">esperando aprovação</span>`}
          ${r.gancho_escolhido ? `<span class="chip">gancho ${r.gancho_escolhido} escolhido</span>` : ""}
        </div>
        ${l.length ? `<ul class="ro-fb">${l.slice().sort((a, b) => a.created_at.localeCompare(b.created_at)).map((f) => `
          <li class="${f.lido ? "" : "novo"}">
            <small>${esc(f.nome || "Marca")} ${rotulo[f.tipo]} · ${esc(f.parte)} · ${dataHora(f.created_at)}</small>
            ${f.texto ? `<p>${esc(f.texto)}</p>` : ""}
          </li>`).join("")}</ul>` : `<p class="nota" style="margin:6px 0 0">A marca ainda não mexeu no roteiro.</p>`}
      </div>`;
  }

  function editar(r) {
    let cenas = cenasIniciais(r);
    const temCenasSalvas = Array.isArray(r?.cenas) && r.cenas.length;
    const d = janela("rot-dialog", `
      <form method="dialog" id="rot-form" class="rot-form">
        <h2>${r ? "Editar roteiro" : "Novo roteiro"}</h2>
        ${r ? feedbackHtml(r) : ""}
        <label class="label" for="ro-titulo">Título</label>
        <input class="input" id="ro-titulo" required maxlength="120" value="${esc(r?.titulo || "")}" placeholder="Ex: 3 erros ao lavar o cabelo">
        <div class="dialogo-linha quatro">
          <div><label class="label" for="ro-status">Etapa</label><select class="input" id="ro-status">${ETAPAS.map((e) => `<option value="${e.id}" ${(r?.status || "ideia") === e.id ? "selected" : ""}>${e.nome}</option>`).join("")}</select></div>
          <div><label class="label" for="ro-formato">Formato</label><select class="input" id="ro-formato">${FORMATOS.map((f) => `<option ${(r?.formato || "reels") === f ? "selected" : ""}>${f}</option>`).join("")}</select></div>
          <div><label class="label" for="ro-camp">Marca / campanha</label><select class="input" id="ro-camp"><option value="">Sem campanha cadastrada</option>${campanhas.map((c) => `<option value="${c.id}" ${r?.campanha_id === c.id ? "selected" : ""}>${esc(c.marca)}</option>`).join("")}</select></div>
          <div><label class="label" for="ro-data">Gravar em</label><input class="input" id="ro-data" type="date" value="${r?.data_gravacao || ""}"></div>
        </div>
        <div class="ro-marca">
          <div class="ro-logo" id="ro-logo-previa"></div>
          <div><label class="label" for="ro-marca-nome">Nome da marca no link <span class="nota">se ficar vazio, usa a campanha</span></label>
            <input class="input" id="ro-marca-nome" maxlength="80" value="${esc(r?.marca_nome || "")}"></div>
          <div><label class="label" for="ro-logo">Logo da marca</label>
            <div class="ro-ref"><input class="input" id="ro-logo" maxlength="600" value="${esc(r?.marca_logo || "")}" placeholder="link da imagem">
            <button class="btn sm" type="button" id="ro-logo-enviar">${icon("image")} Enviar</button></div></div>
        </div>

        <h3 class="ro-sec">Ganchos <span class="nota">a marca escolhe um dos dois</span></h3>
        <div class="ro-ganchos">
          <div><label class="label" for="ro-gancho">Gancho 1</label><textarea class="input" id="ro-gancho" rows="2" maxlength="500">${esc(r?.gancho || "")}</textarea></div>
          <div><label class="label" for="ro-gancho2">Gancho 2</label><textarea class="input" id="ro-gancho2" rows="2" maxlength="500">${esc(r?.gancho2 || "")}</textarea></div>
        </div>

        <h3 class="ro-sec">Cenas</h3>
        ${r?.texto && !temCenasSalvas ? `<p class="nota" style="margin:-4px 0 8px">Separei o texto antigo em cenas. Confira antes de salvar.</p>` : ""}
        <div id="ro-cenas"></div>
        <button class="rot-add ro-mais" type="button" id="ro-cena-mais">${icon("plus")} Cena</button>

        <label class="label" for="ro-cta">Chamada final (CTA)</label>
        <input class="input" id="ro-cta" maxlength="200" value="${esc(r?.cta || "")}" placeholder="Ex: comenta QUERO que eu te mando o link">
        <label class="label" for="ro-texto">Anotações <span class="nota">só você vê</span></label>
        <textarea class="input" id="ro-texto" rows="3" maxlength="10000">${esc(temCenasSalvas ? r?.texto || "" : "")}</textarea>

        <div class="dialogo-acoes">
          ${r ? `<button class="btn danger" type="button" id="ro-apagar">Apagar</button>` : ""}
          <span style="flex:1"></span>
          <button class="btn" type="button" id="ro-pdf" title="Abre o roteiro pronto pra salvar em PDF">${icon("file")} PDF</button>
          <button class="btn" type="button" id="ro-cancelar">Cancelar</button>
          <button class="btn" type="submit" value="salvar">Salvar</button>
          <button class="btn primary" type="submit" value="enviar">${icon("link")} ${r?.link_token ? "Salvar e ver link" : "Salvar e enviar pra marca"}</button>
        </div>
      </form>`);
    d.classList.add("largo");

    const box = $("#ro-cenas", d);
    const lerCenas = () => $$("[data-cena]", box).map((el) => Object.fromEntries($$("[data-c]", el).map((f) => [f.dataset.c, f.value.trim()])));
    const desenhar = () => {
      box.innerHTML = cenas.map(cenaHtml).join("");
      $$("[data-cena]", box).forEach((el, i) => {
        $("[data-cena-tira]", el).addEventListener("click", () => { cenas = lerCenas(); cenas.splice(i, 1); if (!cenas.length) cenas.push({ parte: "Cena 1", audio: "", imagem: "", referencia: "" }); desenhar(); });
        $("[data-cena-sobe]", el).addEventListener("click", () => { cenas = lerCenas(); [cenas[i - 1], cenas[i]] = [cenas[i], cenas[i - 1]]; desenhar(); });
        $("[data-cena-foto]", el).addEventListener("click", () => escolherImagem($('[data-c="referencia"]', el)));
      });
    };
    desenhar();
    $("#ro-cena-mais", d).addEventListener("click", () => {
      cenas = lerCenas();
      cenas.push({ parte: `Cena ${cenas.length + 1}`, audio: "", imagem: "", referencia: "" });
      desenhar();
      $$('[data-c="audio"]', box).at(-1).focus();
    });

    const logo = $("#ro-logo", d);
    const previa = () => { $("#ro-logo-previa", d).innerHTML = /^https?:\/\//.test(logo.value.trim()) ? `<img src="${esc(logo.value.trim())}" alt="">` : icon("image"); };
    logo.addEventListener("input", previa);
    previa();
    $("#ro-logo-enviar", d).addEventListener("click", () => escolherImagem(logo));

    d.showModal();
    $("#ro-titulo", d).focus();
    $("#ro-cancelar", d).addEventListener("click", () => d.close());

    // Abriu o roteiro: o retorno da marca conta como visto.
    if (r && sb) {
      const novos = fbDe(r).filter((f) => !f.lido);
      if (novos.length) sb.from("roteiro_feedback").update({ lido: true }).in("id", novos.map((f) => f.id))
        .then(({ error }) => { if (!error) novos.forEach((f) => (f.lido = true)); });
    }

    const montar = () => ({
      ...(r ? { id: r.id } : {}),
      titulo: $("#ro-titulo", d).value.trim(),
      status: $("#ro-status", d).value,
      formato: $("#ro-formato", d).value,
      campanha_id: $("#ro-camp", d).value || null,
      data_gravacao: $("#ro-data", d).value || null,
      marca_nome: $("#ro-marca-nome", d).value.trim(),
      marca_logo: logo.value.trim(),
      gancho: $("#ro-gancho", d).value.trim(),
      gancho2: $("#ro-gancho2", d).value.trim(),
      cenas: lerCenas().filter((c) => c.audio || c.imagem || c.referencia),
      cta: $("#ro-cta", d).value.trim(),
      texto: $("#ro-texto", d).value.trim(),
    });

    $("#ro-pdf", d).addEventListener("click", () => {
      const row = montar();
      imprimir(row, row.marca_nome || campanhas.find((c) => c.id === row.campanha_id)?.marca || "");
    });
    $("#ro-apagar", d)?.addEventListener("click", async () => {
      if (!confirm(`Apagar o roteiro "${r.titulo}"?`)) return;
      try { await db.apagar(r.id); d.close(); toast("Roteiro apagado.", "ok"); abrir(); }
      catch (e) { console.warn(e); toast("Não consegui apagar.", "err"); }
    });
    $("#rot-form", d).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const enviar = ev.submitter?.value === "enviar";
      const row = montar();
      if (!row.titulo) return;
      if (enviar) {
        if (!sb) { toast("O link pra marca só funciona com o painel online.", "warn"); return; }
        if (!row.cenas.length && !row.gancho) { toast("Escreva o gancho e pelo menos uma cena antes de enviar.", "warn"); return; }
        if (!row.marca_nome && !row.campanha_id) { toast("Escolha a campanha ou escreva o nome da marca.", "warn"); return; }
        if (!r?.link_token) row.link_token = novoToken();
        if (!r?.enviado_em) row.enviado_em = new Date().toISOString();
        if (r?.aprovado_em && confirm(`A marca já aprovou este roteiro. Pedir uma nova aprovação?\n\n"OK" reabre pra marca aprovar de novo. "Cancelar" só salva.`)) {
          Object.assign(row, { aprovado_por: null, aprovado_em: null, gancho_escolhido: null, enviado_em: new Date().toISOString() });
        }
      }
      try {
        const salvo = await db.salvar(row);
        d.close();
        toast(r ? "Roteiro atualizado." : "Roteiro criado.", "ok");
        await abrir();
        if (enviar) mostrarLink(salvo);
      } catch (e) { console.warn(e); toast("Não consegui salvar o roteiro.", "err"); }
    });
  }

  function novoToken() {
    const b = crypto.getRandomValues(new Uint8Array(18));
    return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function mostrarLink(r) {
    const link = linkDe(r);
    const marca = marcaDe(r);
    const msg = `Oi! Segue o roteiro${marca ? ` pra ${marca}` : ""}: "${r.titulo}". Por esse link você escolhe o gancho, comenta em qualquer cena e aprova:\n${link}`;
    const d = janela("rot-link", `
      <div class="rot-form">
        <h2>Link pra ${esc(marca || "marca")}</h2>
        <p class="sub">Copie o link e mande pra marca do jeito que preferir. Quando ela escolher o gancho, comentar ou aprovar, aparece aqui no card do roteiro.</p>
        <div class="ro-ref"><input class="input" id="rl-link" readonly value="${esc(link)}" aria-label="Link do roteiro">
          <button class="btn sm" type="button" id="rl-copiar">${icon("link")} Copiar</button></div>
        <div class="dialogo-acoes">
          <a class="btn" href="${esc(link)}" target="_blank" rel="noopener">${icon("eye")} Ver como a marca vê</a>
          <a class="btn" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${icon("chat")} Mandar no WhatsApp</a>
          <span style="flex:1"></span>
          <button class="btn primary" type="button" id="rl-ok">Pronto</button>
        </div>
      </div>`);
    d.showModal();
    $("#rl-ok", d).addEventListener("click", () => d.close());
    $("#rl-copiar", d).addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(link); toast("Link copiado.", "ok"); }
      catch { $("#rl-link", d).select(); toast("Selecionei o link: é só copiar.", "info"); }
    });
  }

  // Roteiro em PDF: abre uma página com a identidade da Yasmin e já chama
  // "Imprimir" (lá dá pra escolher "Salvar como PDF").
  function imprimir(r, marca) {
    const w = window.open("", "_blank");
    if (!w) { toast("O navegador bloqueou a janela. Libere os pop-ups deste site.", "warn"); return; }
    const hoje = new Date().toLocaleDateString("pt-BR");
    const ganchos = [r.gancho, r.gancho2].filter(Boolean);
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
      <title>Roteiro ${esc(marca ? marca + " - " : "")}${esc(r.titulo)}</title>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Montserrat:wght@400;500;600&display=swap">
      <style>
        @page { size: A4; margin: 18mm 16mm; }
        * { box-sizing: border-box; }
        body { font-family: Montserrat, Arial, sans-serif; color: #1e1915; margin: 0; font-size: 11pt; line-height: 1.5; background: #fff; }
        .topo { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1e1915; padding-bottom: 12px; }
        .marca { display: flex; align-items: center; gap: 10px; font-weight: 600; letter-spacing: .08em; font-size: 10.5pt; line-height: 1.15; }
        .marca svg { width: 30px; height: 30px; fill: #ff99d9; stroke: #1e1915; stroke-width: 2.4; stroke-linejoin: round; overflow: visible; }
        .doc { font-size: 9pt; color: #78726d; text-align: right; }
        h1 { font-family: "Barlow Condensed", sans-serif; font-size: 30pt; line-height: 1.05; margin: 22px 0 6px; }
        h1 mark { background: #ffd9f0; padding: 0 6px; border-radius: 8px; }
        .info { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 14px 0 18px; }
        .info div { background: #f5f2ed; border-radius: 10px; padding: 8px 12px; font-size: 9.5pt; }
        .info b { display: block; font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; color: #78726d; font-weight: 600; }
        h2 { font-family: "Barlow Condensed", sans-serif; font-size: 15pt; margin: 16px 0 6px; }
        .g { background: #fff2c2; border-radius: 10px; padding: 8px 12px; margin-bottom: 6px; white-space: pre-wrap; break-inside: avoid; }
        .g b { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .06em; color: #78726d; display: block; }
        table { width: 100%; border-collapse: collapse; font-size: 10pt; }
        th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; color: #78726d; padding: 4px 8px; border-bottom: 1.5px solid #1e1915; }
        td { vertical-align: top; padding: 8px; border-bottom: 1px solid #e7e2de; white-space: pre-wrap; }
        tr { break-inside: avoid; }
        td:first-child { font-weight: 600; width: 16%; }
        td a { color: #1e1915; word-break: break-all; }
        .cta { background: #1e1915; color: #fff; border-radius: 10px; padding: 8px 12px; white-space: pre-wrap; }
        .rodape { margin-top: 22px; font-size: 8.5pt; color: #78726d; text-align: center; }
      </style></head><body>
      <div class="topo">
        <div class="marca"><svg viewBox="-3 -3 46 46"><path d="M20 0C21.6 11.5 28.5 18.4 40 20 28.5 21.6 21.6 28.5 20 40 18.4 28.5 11.5 21.6 0 20 11.5 18.4 18.4 11.5 20 0Z"/></svg><span>YASMIN<br>CARREIRA</span></div>
        <div class="doc">Roteiro<br>${hoje}</div>
      </div>
      <h1>${marca ? `<mark>${esc(marca)}</mark> ` : ""}${esc(r.titulo)}</h1>
      <div class="info">
        <div><b>Marca</b>${esc(marca || "Conteúdo próprio")}</div>
        <div><b>Formato</b>${esc(r.formato)}</div>
        <div><b>Gravação prevista</b>${r.data_gravacao ? esc(r.data_gravacao.split("-").reverse().join("/")) : "a combinar"}</div>
      </div>
      ${ganchos.length ? `<h2>${ganchos.length > 1 ? "Opções de gancho" : "Gancho"}</h2>${ganchos.map((g, i) => `<div class="g">${ganchos.length > 1 ? `<b>Gancho ${i + 1}</b>` : ""}${esc(g)}</div>`).join("")}` : ""}
      ${r.cenas.length ? `<h2>Roteiro</h2><table><thead><tr><th>Parte</th><th>Áudio</th><th>Imagem</th></tr></thead><tbody>
        ${r.cenas.map((c, i) => `<tr><td>${esc(c.parte || `Cena ${i + 1}`)}</td><td>${esc(c.audio)}</td><td>${esc(c.imagem)}${c.referencia ? `<br><a href="${esc(c.referencia)}">referência</a>` : ""}</td></tr>`).join("")}
      </tbody></table>` : ""}
      ${r.cta ? `<h2>Chamada final (CTA)</h2><div class="cta">${esc(r.cta)}</div>` : ""}
      <p class="rodape">yasmincarreira.com</p>
      <script>document.fonts.ready.then(() => setTimeout(() => window.print(), 300));<\/script>
      </body></html>`);
    w.document.close();
  }

  function ligar() {
    if (ligado) return;
    ligado = true;
    $("#roteiro-novo").addEventListener("click", async () => { if (!campanhas.length) await carregar(); editar(null); });
  }

  return { abrir, carregar };
})();
