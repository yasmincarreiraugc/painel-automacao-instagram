// =====================================================================
// carrossel.js: editor de carrossel (Estagiário > Criar posts).
// Slides 1080x1350 (4:5) com a identidade da Yasmin: bege, rosa, manteiga,
// azul, Barlow Condensed, Montserrat, Caveat e a estrela.
// Salva na tabela "carrosseis" e baixa todos os slides em PNG (arquivo .zip).
// Usa as peças do app.js (sb, $, $$, esc, icon, toast, store) e do
// negocio.js (tabela).
// =====================================================================
window.Carrossel = (() => {
  const db = tabela("carrosseis", "updated_at");
  const ESTRELA = '<svg class="cs-estrela" viewBox="-3 -3 46 46" aria-hidden="true"><path d="M20 0C21.6 11.5 28.5 18.4 40 20 28.5 21.6 21.6 28.5 20 40 18.4 28.5 11.5 21.6 0 20 11.5 18.4 18.4 11.5 20 0Z"/></svg>';

  const LAYOUTS = [
    { id: "capa", nome: "Capa" },
    { id: "texto", nome: "Título e texto" },
    { id: "lista", nome: "Lista" },
    { id: "foto", nome: "Foto com legenda" },
    { id: "antes", nome: "Antes e depois" },
    { id: "citacao", nome: "Frase de impacto" },
    { id: "final", nome: "Final (chamada)" },
  ];
  const FUNDOS = [
    { id: "bege", nome: "Bege", cor: "#f5f2ed" }, { id: "branco", nome: "Branco", cor: "#ffffff" },
    { id: "rosa", nome: "Rosa", cor: "#ffd9f0" }, { id: "manteiga", nome: "Manteiga", cor: "#fff2c2" },
    { id: "azul", nome: "Azul", cor: "#d9eafd" }, { id: "preto", nome: "Preto", cor: "#1e1915" },
  ];
  const DESTAQUES = [
    { id: "rosa", cor: "#ff99d9" }, { id: "amarelo", cor: "#f2db33" }, { id: "azul", cor: "#78b4f4" },
  ];

  const novoSlide = (layout = "texto") => ({
    layout, fundo: layout === "capa" ? "bege" : layout === "final" ? "preto" : "branco", destaque: "rosa",
    titulo: { capa: "O título que faz parar de rolar", texto: "Um título curto e forte", lista: "O que ninguém te conta",
      foto: "", antes: "Antes e depois", citacao: "", final: "Gostou? Salva pra não perder" }[layout] || "",
    marca: { capa: "parar de rolar", lista: "ninguém", final: "salva" }[layout] || "", texto: layout === "texto" ? "Escreva aqui o conteúdo do slide. Frases curtas leem melhor no celular." : layout === "citacao" ? "Uma frase que a pessoa vai querer mandar pra amiga." : "",
    itens: layout === "lista" ? ["Primeiro ponto", "Segundo ponto", "Terceiro ponto"] : [],
    nota: layout === "capa" ? "arrasta pro lado" : layout === "citacao" ? "Yasmin Carreira" : "",
    cta: layout === "final" ? "Comenta QUERO que eu te mando mais" : "",
    imagem: "", imagem2: "",
  });
  const novoProjeto = () => ({
    nome: "Carrossel sem nome",
    opcoes: { handle: "@yasmincarreira_", numeracao: true },
    slides: [novoSlide("capa"), novoSlide("texto"), novoSlide("lista"), novoSlide("final")],
  });

  let proj = null;
  let atual = 0;
  let lista = [];
  let sujo = false;
  let ligado = false;

  // ---------- desenho de um slide (HTML em 1080x1350) ----------
  function comDestaque(titulo, palavra) {
    const t = esc(titulo);
    if (!palavra || !titulo.toLowerCase().includes(palavra.toLowerCase())) return t;
    const i = titulo.toLowerCase().indexOf(palavra.toLowerCase());
    // Uma marcação por palavra: se a frase quebrar de linha, cada palavra
    // fica com o seu fundo (e a exportação em PNG desenha certo).
    const marcado = titulo.slice(i, i + palavra.length).split(/(\s+)/).map((p) => (/^\s+$/.test(p) || !p ? p : `<mark>${esc(p)}</mark>`)).join("");
    return `${esc(titulo.slice(0, i))}${marcado}${esc(titulo.slice(i + palavra.length))}`;
  }
  function slideHtml(s, i, total) {
    const corDest = (DESTAQUES.find((d) => d.id === s.destaque) || DESTAQUES[0]).cor;
    const o = proj.opcoes;
    const titulo = comDestaque(s.titulo || "", s.marca);
    const img = (src, cls = "") => (src ? `<div class="cs-foto ${cls}" style="background-image:url('${src}')"></div>` : `<div class="cs-foto vazia ${cls}">foto</div>`);
    let corpo = "";
    if (s.layout === "capa") {
      corpo = `
        ${s.imagem ? img(s.imagem, "capa-foto") : ""}
        <div class="cs-capa-txt">
          ${ESTRELA}
          <h1>${titulo}</h1>
          ${s.texto ? `<p>${esc(s.texto)}</p>` : ""}
          ${s.nota ? `<span class="cs-nota">${esc(s.nota)} &rarr;</span>` : ""}
        </div>`;
    } else if (s.layout === "texto") {
      corpo = `<h2>${titulo}</h2><p class="cs-par">${esc(s.texto).replace(/\n/g, "<br>")}</p>${s.nota ? `<span class="cs-nota">${esc(s.nota)}</span>` : ""}`;
    } else if (s.layout === "lista") {
      corpo = `<h2>${titulo}</h2><ol class="cs-lista">${(s.itens || []).filter(Boolean).map((it, n) => `<li><b>${n + 1}</b><span>${esc(it)}</span></li>`).join("")}</ol>${s.nota ? `<span class="cs-nota">${esc(s.nota)}</span>` : ""}`;
    } else if (s.layout === "foto") {
      corpo = `${img(s.imagem, "cheia")}${s.titulo || s.texto ? `<div class="cs-legenda">${s.titulo ? `<h3>${titulo}</h3>` : ""}${s.texto ? `<p>${esc(s.texto)}</p>` : ""}</div>` : ""}`;
    } else if (s.layout === "antes") {
      corpo = `<h2>${titulo}</h2><div class="cs-ad"><div>${img(s.imagem)}<span>ANTES</span></div><div>${img(s.imagem2)}<span>DEPOIS</span></div></div>${s.texto ? `<p class="cs-par menor">${esc(s.texto)}</p>` : ""}`;
    } else if (s.layout === "citacao") {
      corpo = `<div class="cs-aspas">&ldquo;</div><p class="cs-frase">${comDestaque(s.texto || "", s.marca)}</p>${s.nota ? `<span class="cs-nota assinatura">${esc(s.nota)}</span>` : ""}`;
    } else if (s.layout === "final") {
      corpo = `${ESTRELA}<h2>${titulo}</h2>${s.cta ? `<div class="cs-cta">${esc(s.cta)}</div>` : ""}<div class="cs-handle">${esc(o.handle)}</div>${s.texto ? `<p class="cs-par menor">${esc(s.texto)}</p>` : ""}`;
    }
    return `
      <div class="cs-slide l-${s.layout} f-${s.fundo}" style="--dest:${corDest}">
        ${corpo}
        <div class="cs-rodape"><span>${esc(o.handle)}</span>${o.numeracao ? `<span>${i + 1}/${total}</span>` : ""}</div>
      </div>`;
  }

  // ---------- tela ----------
  async function abrir() {
    ligar();
    try { lista = await db.listar(); } catch (e) { console.warn(e); lista = []; }
    if (!proj) proj = lista[0] ? clone(lista[0]) : novoProjeto();
    render();
  }
  const clone = (x) => JSON.parse(JSON.stringify(x));

  function render() {
    const box = $("#carrossel-conteudo");
    const s = proj.slides[atual];
    box.innerHTML = `
      <div class="cs-barra">
        <select class="input" id="cs-abrir" aria-label="Abrir carrossel salvo">
          <option value="">${proj.id ? "Trocar de carrossel..." : "Carrossel novo (não salvo)"}</option>
          ${lista.map((c) => `<option value="${c.id}" ${c.id === proj.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}
          <option value="__novo">+ Começar um novo</option>
        </select>
        <input class="input" id="cs-nome" value="${esc(proj.nome)}" maxlength="80" aria-label="Nome do carrossel">
        <button class="btn" id="cs-salvar">${icon("check")} ${sujo || !proj.id ? "Salvar" : "Salvo"}</button>
        <button class="btn primary" id="cs-baixar">${icon("download")} Baixar imagens</button>
      </div>
      <div class="cs-editor">
        <div class="cs-trilha" aria-label="Slides">
          ${proj.slides.map((sl, i) => `
            <div class="cs-mini ${i === atual ? "on" : ""}" data-ir="${i}" role="button" tabindex="0" aria-label="Slide ${i + 1}">
              <div class="cs-mini-escala">${slideHtml(sl, i, proj.slides.length)}</div>
              <span>${i + 1}</span>
            </div>`).join("")}
          <div class="cs-add">
            <select class="input" id="cs-novo-layout" aria-label="Tipo do novo slide">${LAYOUTS.map((l) => `<option value="${l.id}">${l.nome}</option>`).join("")}</select>
            <button class="btn sm" id="cs-add">${icon("plus")} Slide</button>
          </div>
        </div>
        <div class="cs-palco">
          <div class="cs-previa"><div class="cs-previa-escala">${slideHtml(s, atual, proj.slides.length)}</div></div>
          <div class="cs-acoes-slide">
            <button class="icon-btn" id="cs-esq" title="Mover pra esquerda" aria-label="Mover slide pra esquerda" ${atual === 0 ? "disabled" : ""}>${icon("chevron-left")}</button>
            <span>Slide ${atual + 1} de ${proj.slides.length}</span>
            <button class="icon-btn" id="cs-dir" title="Mover pra direita" aria-label="Mover slide pra direita" ${atual === proj.slides.length - 1 ? "disabled" : ""}>${icon("chevron-right")}</button>
            <button class="btn sm" id="cs-dup">Duplicar</button>
            <button class="btn sm danger" id="cs-del" ${proj.slides.length < 2 ? "disabled" : ""}>${icon("trash")} Apagar</button>
          </div>
        </div>
        <div class="card cs-props">${props(s)}</div>
      </div>`;
    ligarTela();
  }

  function props(s) {
    const campo = (id, rotulo, valor, tipo = "input", extra = "") => tipo === "area"
      ? `<label class="label" for="p-${id}">${rotulo}</label><textarea class="input" id="p-${id}" data-p="${id}" rows="4" ${extra}>${esc(valor)}</textarea>`
      : `<label class="label" for="p-${id}">${rotulo}</label><input class="input" id="p-${id}" data-p="${id}" value="${esc(valor)}" ${extra}>`;
    const usa = {
      capa: ["titulo", "marca", "texto", "nota", "imagem"], texto: ["titulo", "marca", "texto", "nota"], lista: ["titulo", "marca", "itens", "nota"],
      foto: ["imagem", "titulo", "texto"], antes: ["titulo", "marca", "imagem", "imagem2", "texto"], citacao: ["texto", "marca", "nota"],
      final: ["titulo", "marca", "cta", "texto"],
    }[s.layout];
    const r = [];
    r.push(`<label class="label" for="p-layout">Tipo de slide</label><select class="input" id="p-layout">${LAYOUTS.map((l) => `<option value="${l.id}" ${l.id === s.layout ? "selected" : ""}>${l.nome}</option>`).join("")}</select>`);
    r.push(`<span class="label">Fundo</span><div class="cs-cores">${FUNDOS.map((f) => `<button class="cs-cor ${f.id === s.fundo ? "on" : ""}" data-fundo="${f.id}" style="background:${f.cor}" title="${f.nome}" aria-label="Fundo ${f.nome}"></button>`).join("")}</div>`);
    r.push(`<span class="label">Cor do destaque</span><div class="cs-cores">${DESTAQUES.map((d) => `<button class="cs-cor ${d.id === s.destaque ? "on" : ""}" data-dest="${d.id}" style="background:${d.cor}" aria-label="Destaque ${d.id}"></button>`).join("")}</div>`);
    if (usa.includes("titulo")) r.push(campo("titulo", "Título", s.titulo, "input", 'maxlength="90"'));
    if (usa.includes("marca")) r.push(campo("marca", "Palavra destacada (igual ao título)", s.marca, "input", 'maxlength="40" placeholder="ex: parar de rolar"'));
    if (usa.includes("texto")) r.push(campo("texto", s.layout === "citacao" ? "Frase" : "Texto", s.texto, "area", 'maxlength="500"'));
    if (usa.includes("itens")) r.push(campo("itens", "Itens da lista (um por linha)", (s.itens || []).join("\n"), "area", 'maxlength="600"'));
    if (usa.includes("cta")) r.push(campo("cta", "Chamada (botão)", s.cta, "input", 'maxlength="60"'));
    if (usa.includes("nota")) r.push(campo("nota", "Nota escrita à mão", s.nota, "input", 'maxlength="50"'));
    for (const k of ["imagem", "imagem2"]) {
      if (!usa.includes(k)) continue;
      r.push(`<span class="label">${k === "imagem2" ? "Foto do depois" : s.layout === "antes" ? "Foto do antes" : "Foto"}</span>
        <div class="cs-foto-campo">${s[k] ? `<img src="${s[k]}" alt="">` : ""}
          <label class="btn sm">${icon("image")} ${s[k] ? "Trocar" : "Escolher foto"}<input type="file" accept="image/*" data-img="${k}" hidden></label>
          ${s[k] ? `<button class="btn sm danger" data-tira="${k}">Tirar</button>` : ""}</div>`);
    }
    r.push(`<hr class="nav-linha"><span class="label">Em todos os slides</span>`);
    r.push(campo("handle", "Seu @", proj.opcoes.handle, "input", 'maxlength="40" data-opcao="1"'));
    r.push(`<label class="switch" style="margin-top:10px"><input type="checkbox" id="p-numeracao" ${proj.opcoes.numeracao ? "checked" : ""}><span class="track"></span> Mostrar número do slide</label>`);
    return r.join("");
  }

  // Atualiza só a prévia e a miniatura do slide atual (sem perder o foco do campo).
  function redesenha() {
    const s = proj.slides[atual];
    $(".cs-previa-escala").innerHTML = slideHtml(s, atual, proj.slides.length);
    $$(".cs-mini .cs-mini-escala").forEach((el, i) => { el.innerHTML = slideHtml(proj.slides[i], i, proj.slides.length); });
    marcarSujo();
  }
  function marcarSujo() { sujo = true; const b = $("#cs-salvar"); if (b) b.innerHTML = `${icon("check")} Salvar`; }

  function ligarTela() {
    const s = proj.slides[atual];
    $$("[data-ir]").forEach((el) => {
      const vai = () => { atual = Number(el.dataset.ir); render(); };
      el.addEventListener("click", vai);
      el.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); vai(); } });
    });
    $("#cs-add").addEventListener("click", () => { proj.slides.splice(atual + 1, 0, novoSlide($("#cs-novo-layout").value)); atual += 1; marcarSujo(); render(); });
    $("#cs-dup").addEventListener("click", () => { proj.slides.splice(atual + 1, 0, clone(s)); atual += 1; marcarSujo(); render(); });
    $("#cs-del").addEventListener("click", () => { if (!confirm("Apagar este slide?")) return; proj.slides.splice(atual, 1); atual = Math.max(0, atual - 1); marcarSujo(); render(); });
    $("#cs-esq").addEventListener("click", () => troca(-1));
    $("#cs-dir").addEventListener("click", () => troca(1));
    $("#p-layout").addEventListener("change", (ev) => {
      const novo = novoSlide(ev.target.value);
      // Mantém o que já foi escrito.
      for (const k of ["titulo", "marca", "texto", "nota", "imagem", "imagem2", "fundo", "destaque"]) if (s[k]) novo[k] = s[k];
      proj.slides[atual] = novo; marcarSujo(); render();
    });
    $$("[data-fundo]").forEach((b) => b.addEventListener("click", () => { s.fundo = b.dataset.fundo; marcarSujo(); render(); }));
    $$("[data-dest]").forEach((b) => b.addEventListener("click", () => { s.destaque = b.dataset.dest; marcarSujo(); render(); }));
    $$("[data-p]").forEach((inp) => inp.addEventListener("input", () => {
      const k = inp.dataset.p;
      if (inp.dataset.opcao) proj.opcoes[k] = inp.value;
      else if (k === "itens") s.itens = inp.value.split("\n");
      else s[k] = inp.value;
      redesenha();
    }));
    $("#p-numeracao").addEventListener("change", (ev) => { proj.opcoes.numeracao = ev.target.checked; redesenha(); });
    $$("[data-img]").forEach((inp) => inp.addEventListener("change", async () => {
      const f = inp.files?.[0];
      if (!f) return;
      try { s[inp.dataset.img] = await reduzFoto(f); marcarSujo(); render(); }
      catch (e) { console.warn(e); toast("Não consegui abrir essa foto.", "err"); }
    }));
    $$("[data-tira]").forEach((b) => b.addEventListener("click", () => { s[b.dataset.tira] = ""; marcarSujo(); render(); }));
    $("#cs-nome").addEventListener("input", (ev) => { proj.nome = ev.target.value; marcarSujo(); });
    $("#cs-salvar").addEventListener("click", salvar);
    $("#cs-baixar").addEventListener("click", baixar);
    $("#cs-abrir").addEventListener("change", (ev) => {
      const v = ev.target.value;
      if (!v) return;
      if (sujo && !confirm("Você tem alterações não salvas. Trocar mesmo assim?")) { ev.target.value = ""; return; }
      proj = v === "__novo" ? novoProjeto() : clone(lista.find((c) => c.id === v));
      atual = 0; sujo = false; render();
    });
  }

  function troca(dir) {
    const j = atual + dir;
    if (j < 0 || j >= proj.slides.length) return;
    [proj.slides[atual], proj.slides[j]] = [proj.slides[j], proj.slides[atual]];
    atual = j; marcarSujo(); render();
  }

  // Foto reduzida (até 1080 px, JPEG) pra não pesar no banco.
  function reduzFoto(arquivo) {
    return new Promise((ok, falha) => {
      const leitor = new FileReader();
      leitor.onerror = falha;
      leitor.onload = () => {
        const im = new Image();
        im.onerror = falha;
        im.onload = () => {
          const k = Math.min(1, 1080 / Math.max(im.width, im.height));
          const c = document.createElement("canvas");
          c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
          c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
          ok(c.toDataURL("image/jpeg", 0.82));
        };
        im.src = leitor.result;
      };
      leitor.readAsDataURL(arquivo);
    });
  }

  async function salvar() {
    try {
      const salvo = await db.salvar({ ...(proj.id ? { id: proj.id } : {}), nome: proj.nome.trim() || "Carrossel sem nome", slides: proj.slides, opcoes: proj.opcoes });
      proj.id = salvo.id;
      sujo = false;
      lista = await db.listar();
      toast("Carrossel salvo.", "ok");
      render();
    } catch (e) { console.warn(e); toast("Não consegui salvar. Fotos muito grandes? Tente com menos fotos.", "err"); }
  }

  // ---------- baixar: cada slide vira um PNG 1080x1350, tudo num .zip ----------
  const carregaScript = (src) => new Promise((ok, falha) => {
    if ([...document.scripts].some((s) => s.src === src)) return ok();
    const s = document.createElement("script");
    s.src = src; s.onload = ok; s.onerror = falha;
    document.head.appendChild(s);
  });
  async function baixar() {
    const b = $("#cs-baixar");
    b.disabled = true; b.innerHTML = `${icon("download")} Preparando...`;
    try {
      await carregaScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
      await carregaScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
      await document.fonts.ready;
      const palco = document.createElement("div");
      palco.className = "cs-exportar";
      document.body.appendChild(palco);
      const zip = new window.JSZip();
      for (let i = 0; i < proj.slides.length; i++) {
        b.innerHTML = `${icon("download")} Slide ${i + 1} de ${proj.slides.length}...`;
        palco.innerHTML = slideHtml(proj.slides[i], i, proj.slides.length);
        const canvas = await window.html2canvas(palco.firstElementChild, { scale: 1, width: 1080, height: 1350, backgroundColor: null, useCORS: true });
        const blob = await new Promise((ok) => canvas.toBlob(ok, "image/png"));
        zip.file(`${String(i + 1).padStart(2, "0")}.png`, blob);
      }
      palco.remove();
      const arquivo = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(arquivo);
      a.download = `${(proj.nome || "carrossel").replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "carrossel"}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast("Pronto! As imagens estão no arquivo baixado.", "ok");
    } catch (e) { console.warn(e); toast("Não consegui gerar as imagens. Tente de novo.", "err"); }
    b.disabled = false; b.innerHTML = `${icon("download")} Baixar imagens`;
  }

  function ligar() {
    if (ligado) return;
    ligado = true;
    window.addEventListener("beforeunload", (ev) => { if (sujo) { ev.preventDefault(); ev.returnValue = ""; } });
  }

  return { abrir };
})();
