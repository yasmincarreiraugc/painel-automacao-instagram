// =====================================================================
// editor.js: o editor visual de automação (o "ManyChat").
//   Bloco 1: o gatilho (palavras, posts, resposta no comentário)
//   Bloco 2: a resposta (mensagem, botão, link ou conversa, arquivo)
//   + prévia ao vivo num mockup de celular.
//
// O estado do editor ("st") é convertido pro formato "flow" do banco
// na hora de salvar (paraRow) e de volta ao abrir (deRow).
// =====================================================================
const Editor = (() => {
  const EMOJIS = ["🤗", "👀", "😍", "🥰", "😂", "😮", "🔥", "✨", "💌", "👉", "🙌", "💕"];
  const MAX_TITULO = 20;   // o Instagram corta o título do botão em 20
  const MAX_BOTOES = 3;    // máximo de botões anexados por mensagem
  const MAX_TEXTO = 640;   // limite de texto de mensagem com botões

  let st = null;           // estado da automação aberta
  let sujo = false;        // tem alteração não salva?
  let posts = null;        // posts da conta (ig-media)
  let assets = [];         // biblioteca de arquivos (ig_assets)
  const raiz = () => document.getElementById("editor-overlay");

  // -------------------------------------------------------------------
  // Ajudantes
  // -------------------------------------------------------------------
  const pareceLink = (t) => /^(https?:\/\/|www\.)\S+$/i.test((t || "").trim());
  const normalizaUrl = (u) => (/^www\./i.test(u.trim()) ? "https://" + u.trim() : u.trim());
  const urlValida = (u) => {
    try { const x = new URL((u || "").trim()); return x.protocol === "https:" || x.protocol === "http:"; }
    catch { return false; }
  };
  const proximoId = () => Math.max(1, ...st.steps.map((s) => Number(s.id) || 0)) + 1;
  const novoPasso = () => ({ id: proximoId(), message: "", buttons: [], assets: [], extra: { type: "none", next: null, seconds: 30 } });
  const novoBotao = () => ({ title: "", kind: "end", next: null, url: "" });
  const rotulo = (id) => { const i = st.steps.findIndex((s) => String(s.id) === String(id)); return i < 0 ? "?" : `Mensagem ${i + 2}`; };
  const existePasso = (id) => id !== null && id !== undefined && st.steps.some((s) => String(s.id) === String(id));

  function novoEstado() {
    return {
      id: null, nome: "", active: true,
      keywords: [], match_any: false, media_ids: [],
      public_reply: "", variants: [],
      message: "", button_on: true, button_title: "", mode: "link", link: "",
      asset_ids: [], steps: [],
    };
  }

  // -------------------------------------------------------------------
  // Banco -> editor
  // -------------------------------------------------------------------
  function deRow(row) {
    const s = novoEstado();
    s.id = row.id; s.nome = row.nome || ""; s.active = row.active !== false;
    s.keywords = String(row.keyword || "").split(",").map((k) => k.trim()).filter(Boolean);
    s.match_any = !!row.match_any; s.media_ids = row.media_ids || [];
    s.public_reply = row.public_reply || ""; s.variants = row.public_reply_variants || [];

    const passos = row.flow?.steps || [];
    const p1 = passos[0] || { message: "", buttons: [] };
    const b0 = (p1.buttons || [])[0];
    s.message = p1.message || "";
    s.button_on = !!b0;
    s.button_title = b0?.title || "";
    s.mode = b0 && !b0.url && b0.next !== undefined && b0.next !== null ? "flow" : "link";
    s.link = b0?.url || "";
    s.asset_ids = row.asset_ids?.length ? row.asset_ids : p1.assets || [];
    s.steps = passos.slice(1).map((p) => ({
      id: p.id,
      message: p.message || "",
      assets: p.assets || [],
      buttons: (p.buttons || []).map((b) => ({
        title: b.title || "",
        kind: b.url ? "link" : b.next !== undefined && b.next !== null ? "next" : "end",
        url: b.url || "",
        next: b.next ?? null,
      })),
      extra: p.collect
        ? { type: p.collect.field, next: p.collect.next ?? null, seconds: 30 }
        : p.delay
          ? { type: "delay", next: p.delay.next ?? null, seconds: p.delay.seconds || 30 }
          : { type: "none", next: null, seconds: 30 },
    }));
    return s;
  }

  // -------------------------------------------------------------------
  // Editor -> banco (formato "flow", seção 7 do projeto)
  // A Mensagem 1 é SEMPRE o primeiro item de steps.
  // -------------------------------------------------------------------
  function paraRow() {
    const titulo = st.button_title.trim() || "Acessar";
    const p1 = { id: 1, message: st.message.trim(), buttons: [], assets: st.asset_ids };
    if (st.button_on) {
      if (st.mode === "link") p1.buttons.push({ title: titulo, url: normalizaUrl(st.link) });
      else if (st.steps[0]) p1.buttons.push({ title: titulo, next: st.steps[0].id });
    }
    const steps = [p1];
    if (st.button_on && st.mode === "flow") {
      for (const s of st.steps) {
        const passo = {
          id: s.id,
          message: s.message.trim(),
          assets: s.assets || [],
          buttons: s.buttons.map((b) =>
            b.kind === "link" ? { title: b.title.trim(), url: normalizaUrl(b.url) }
            : b.kind === "next" && existePasso(b.next) ? { title: b.title.trim(), next: b.next }
            : { title: b.title.trim() }), // sem destino = encerra (não é enviado)
        };
        const nx = existePasso(s.extra.next) ? s.extra.next : null;
        if (s.extra.type === "email" || s.extra.type === "telefone") passo.collect = { field: s.extra.type, next: nx };
        if (s.extra.type === "delay" && nx !== null) passo.delay = { seconds: Math.max(5, Number(s.extra.seconds) || 30), next: nx };
        steps.push(passo);
      }
    }
    const row = {
      nome: st.nome.trim() || "Automação sem nome",
      keyword: st.keywords.join(", "),
      match_any: st.match_any,
      active: st.active,
      media_ids: st.media_ids,
      public_reply: st.public_reply.trim(),
      public_reply_variants: st.variants.map((v) => v.trim()).filter(Boolean),
      flow: { steps },
      asset_ids: st.asset_ids,
    };
    if (st.id) row.id = st.id;
    return row;
  }

  // -------------------------------------------------------------------
  // Validação amigável
  // -------------------------------------------------------------------
  function validar() {
    const e = [];
    if (!st.match_any && !st.keywords.length) e.push('Adicione pelo menos uma palavra que ativa, ou ligue "qualquer palavra ativa".');
    if (!st.message.trim()) e.push("Escreva a sua mensagem (Mensagem 1).");
    if (st.button_on) {
      if (st.message.length > MAX_TEXTO) e.push(`A Mensagem 1 passa de ${MAX_TEXTO} caracteres (limite de mensagem com botão).`);
      if (!st.button_title.trim()) e.push("Dê um nome pro botão da Mensagem 1.");
      if (st.button_title.trim().length > MAX_TITULO) e.push(`O texto do botão passa de ${MAX_TITULO} caracteres.`);
      if (st.mode === "link" && !urlValida(normalizaUrl(st.link))) e.push("Cole o link completo do botão (começando com https://).");
      if (st.mode === "flow") {
        if (!st.steps.length) e.push("Adicione a Mensagem 2 da conversa.");
        st.steps.forEach((s, i) => {
          const n = `Mensagem ${i + 2}`;
          if (!s.message.trim()) e.push(`${n}: escreva o texto.`);
          if (s.buttons.length && s.message.length > MAX_TEXTO) e.push(`${n}: passa de ${MAX_TEXTO} caracteres.`);
          s.buttons.forEach((b, j) => {
            if (b.kind === "end") return; // encerrar não é enviado, não precisa de nome
            const nb = `${n}, botão ${j + 1}`;
            if (!b.title.trim()) e.push(`${nb}: dê um nome.`);
            if (b.title.trim().length > MAX_TITULO) e.push(`${nb}: o nome passa de ${MAX_TITULO} caracteres.`);
            if (b.kind === "link" && !urlValida(normalizaUrl(b.url))) e.push(`${nb}: cole o link completo (https://...).`);
            if (b.kind === "next" && !existePasso(b.next)) e.push(`${nb}: escolha pra qual mensagem ele vai.`);
          });
          if (s.extra.type === "delay" && !existePasso(s.extra.next)) e.push(`${n}: escolha qual mensagem vai sozinha depois.`);
        });
      }
    }
    return e;
  }

  // ===================================================================
  // RENDERIZAÇÃO
  // ===================================================================
  function emojiBar(alvo) {
    return `<div class="emojis">${EMOJIS.map((em) => `<button type="button" data-act="emoji" data-alvo="${alvo}" data-em="${em}">${em}</button>`).join("")}</div>`;
  }

  function renderTudo() {
    raiz().innerHTML = `
      <div class="editor" role="dialog" aria-label="Editor de automação">
        <div class="editor-head">
          <button class="icon-btn" data-act="fechar" title="Fechar">${icon("close")}</button>
          <input class="input nome" data-f="nome" value="${esc(st.nome)}" placeholder="Nome da automação (ex: Guia grátis)">
          <label class="switch"><input type="checkbox" data-f="active" ${st.active ? "checked" : ""}><span class="track"></span> Ativa</label>
          <span class="spacer"></span>
          <button class="btn" data-act="fechar">Cancelar</button>
          <button class="btn primary" data-act="salvar">Salvar</button>
        </div>
        <div class="editor-body">
          <div class="editor-form">
            <div id="ed-erros"></div>

            <div class="card">
              <div class="block-title"><span class="n">1</span><div><h2>O gatilho</h2><p class="sub">O que faz a DM disparar.</p></div></div>

              <div class="field">
                <span class="label">Palavras que ativam</span>
                <div class="tags" id="ed-tags"></div>
                <p class="hint">Digite a palavra e aperte Enter. Maiúsculas e acentos não importam.</p>
              </div>
              <div class="field">
                <label class="switch"><input type="checkbox" data-f="match_any" ${st.match_any ? "checked" : ""}><span class="track"></span> Qualquer palavra ativa</label>
                <p class="hint">Ligado: qualquer comentário no post dispara, ignorando as palavras.</p>
              </div>
              <div class="field">
                <span class="label">Em quais posts</span>
                <div id="ed-posts"></div>
              </div>
              <div class="field" style="margin-bottom:0">
                <span class="label">Resposta no comentário</span>
                <input class="input" data-f="public_reply" value="${esc(st.public_reply)}" placeholder="Ex: te chamei no direct!">
                <div id="ed-variantes"></div>
                <button class="btn link" style="margin-top:8px" data-act="add-variante">+ Adicionar variação (A/B)</button>
                <p class="hint">Resposta pública pra quem comentou. Com variações, o sistema alterna entre elas.</p>
              </div>
            </div>

            <div class="card">
              <div class="block-title"><span class="n">2</span><div><h2>A resposta</h2><p class="sub">O que a pessoa recebe no direct.</p></div></div>

              <div class="field">
                <span class="label">Sua mensagem</span>
                <textarea class="textarea" id="ed-msg-main" data-f="message" placeholder="Oi! Que bom que você comentou. Toque no botão abaixo:">${esc(st.message)}</textarea>
                ${emojiBar("ed-msg-main")}
              </div>
              <div class="field">
                <label class="switch"><input type="checkbox" data-f="button_on" ${st.button_on ? "checked" : ""}><span class="track"></span> Botão na mensagem</label>
              </div>
              <div id="ed-resposta"></div>
              <div class="field" style="margin:16px 0 0">
                <span class="label">Anexar um arquivo (opcional)</span>
                <div id="ed-assets"></div>
              </div>
            </div>
          </div>

          <div class="editor-preview">
            <span class="label" style="text-align:center">Prévia ao vivo</span>
            <div id="ed-previa"></div>
          </div>
        </div>
      </div>`;
    renderTags(); renderVariantes(); renderResposta(); renderPosts(); renderAssets(); renderPrevia();
  }

  function renderErros(lista) {
    const box = document.getElementById("ed-erros");
    box.innerHTML = lista.length
      ? `<div class="errors"><strong>Falta pouco! Ajuste antes de salvar:</strong><ul>${lista.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`
      : "";
  }

  // Campo de tags (palavras-chave)
  function renderTags(foco = false) {
    const box = document.getElementById("ed-tags");
    box.classList.toggle("disabled", st.match_any);
    box.innerHTML = st.keywords.map((k, i) =>
      `<span class="tag">${esc(k)}<button type="button" data-act="del-tag" data-i="${i}" title="Remover">×</button></span>`).join("") +
      `<input id="ed-tag-input" placeholder="${st.keywords.length ? "" : "Ex: quero, link, eu"}" ${st.match_any ? "disabled" : ""}>`;
    if (foco) document.getElementById("ed-tag-input").focus();
  }
  function addTag(valor) {
    const partes = valor.split(",").map((p) => p.trim()).filter(Boolean);
    for (const p of partes) if (!st.keywords.some((k) => k.toLowerCase() === p.toLowerCase())) st.keywords.push(p);
    if (partes.length) { sujo = true; renderTags(true); renderPrevia(); }
  }

  function renderVariantes() {
    document.getElementById("ed-variantes").innerHTML = st.variants.map((v, i) => `
      <div class="variant">
        <span class="tagab">${String.fromCharCode(66 + i)}</span>
        <input class="input" data-v="${i}" value="${esc(v)}" placeholder="Outra forma de responder">
        <button class="icon-btn" data-act="del-variante" data-i="${i}" title="Remover">${icon("trash")}</button>
      </div>`).join("");
  }

  // Parte dinâmica do Bloco 2 (botão, link ou construtor)
  function renderResposta() {
    const box = document.getElementById("ed-resposta");
    if (!st.button_on) {
      box.innerHTML = `<p class="hint" style="margin-top:-8px">Sem botão: a pessoa recebe só a mensagem.</p>`;
      return;
    }
    const n = st.button_title.trim().length;
    box.innerHTML = `
      <div class="field">
        <span class="label">Texto do botão <span class="counter ${n > MAX_TITULO ? "over" : ""}">${n}/${MAX_TITULO}</span></span>
        <input class="input ${n > MAX_TITULO ? "over" : ""}" data-f="button_title" value="${esc(st.button_title)}" placeholder="Ex: Quero o guia">
        <p class="hint warn" data-linkhint ${pareceLink(st.button_title) ? "" : "hidden"}>Isso parece um link. Escolha "Um link" abaixo e ele vai pro campo certo.</p>
      </div>
      <div class="field">
        <span class="label">O que o botão faz quando ela toca</span>
        <div class="segmented">
          <label><input type="radio" name="ed-mode" value="link" ${st.mode === "link" ? "checked" : ""}>Um link<small>Abre um site.</small></label>
          <label><input type="radio" name="ed-mode" value="flow" ${st.mode === "flow" ? "checked" : ""}>Continua a conversa<small>Manda as próximas mensagens.</small></label>
        </div>
      </div>
      ${st.mode === "link" ? `
        <div class="field">
          <span class="label">Link do botão</span>
          <textarea class="textarea url" data-f="link" placeholder="Cole aqui o link completo (https://...)">${esc(st.link)}</textarea>
          <p class="hint">O link fica escondido: a pessoa vê só o nome do botão.</p>
        </div>` : renderBuilder()}`;
  }

  // Construtor da conversa (mini-chat)
  function renderBuilder() {
    return `
      <div class="builder">
        <div class="step ref">
          <div class="step-head"><h3>Mensagem 1</h3><span class="pill">edite lá em cima, em "Sua mensagem"</span></div>
          <div class="ref-text" id="ed-ref-text">${st.message.trim() ? esc(st.message) : '<span class="placeholder-text">(ainda sem texto)</span>'}</div>
          <p class="end-note">Botão "<span id="ed-ref-btn">${esc(st.button_title || "sem nome")}</span>" leva pra Mensagem 2.</p>
        </div>
        ${st.steps.map(renderPasso).join("")}
        <div><button class="btn" data-act="add-passo">${icon("plus")} Adicionar mensagem</button></div>
        <p class="hint">Pra chegar numa mensagem, use um botão "ir pra outra mensagem" ou a opção "mandar outra sozinha".</p>
      </div>`;
  }

  function opcoesPassos(atual, excetoIdx, vazio = "Escolha a mensagem") {
    return `<option value="">${vazio}</option>` + st.steps.map((p, i) => i === excetoIdx ? "" :
      `<option value="${p.id}" ${String(p.id) === String(atual) ? "selected" : ""}>Mensagem ${i + 2}</option>`).join("");
  }

  function renderPasso(s, i) {
    const botoes = s.buttons.map((b, j) => {
      const n = b.title.trim().length;
      let destino = "";
      if (b.kind === "next") {
        destino = st.steps.length > 1
          ? `<select class="select" data-s="${i}" data-b="${j}" data-f="next">${opcoesPassos(b.next, i)}</select>`
          : `<p class="hint warn">Adicione outra mensagem pra esse botão apontar pra ela.</p>`;
      } else if (b.kind === "link") {
        destino = `<textarea class="textarea url" data-s="${i}" data-b="${j}" data-f="url" placeholder="Cole aqui o link completo (https://...)">${esc(b.url)}</textarea>
                   <p class="hint">O link fica escondido: a pessoa vê só o nome do botão.</p>`;
      } else {
        destino = `<p class="end-note">Encerrar não vira botão: a conversa acaba aqui e esse botão não é enviado.</p>`;
      }
      return `
        <div class="btn-row">
          <div class="line">
            <div>
              <input class="input ${n > MAX_TITULO ? "over" : ""}" data-s="${i}" data-b="${j}" data-f="title" value="${esc(b.title)}" placeholder="Nome do botão">
              <p class="hint"><span class="counter ${n > MAX_TITULO ? "over" : ""}">${n}/${MAX_TITULO}</span><span data-linkhint ${pareceLink(b.title) && b.kind !== "link" ? "" : "hidden"} class="warn">Parece um link: escolha "Abrir um link".</span>&nbsp;</p>
            </div>
            <select class="select" data-s="${i}" data-b="${j}" data-f="kind">
              <option value="next" ${b.kind === "next" ? "selected" : ""}>Ir pra outra mensagem</option>
              <option value="link" ${b.kind === "link" ? "selected" : ""}>Abrir um link</option>
              <option value="end" ${b.kind === "end" ? "selected" : ""}>Encerrar</option>
            </select>
            <button class="icon-btn" data-act="del-botao" data-s="${i}" data-b="${j}" title="Remover botão">${icon("trash")}</button>
          </div>
          <div class="sub-line">${destino}</div>
        </div>`;
    }).join("");

    const ex = s.extra;
    const extra = `
      <div class="extra">
        <div>
          <span class="label">Depois desta mensagem</span>
          <select class="select" data-s="${i}" data-f="extra-type">
            <option value="none" ${ex.type === "none" ? "selected" : ""}>Esperar um toque nos botões</option>
            <option value="email" ${ex.type === "email" ? "selected" : ""}>Pedir o e-mail</option>
            <option value="telefone" ${ex.type === "telefone" ? "selected" : ""}>Pedir o telefone</option>
            <option value="delay" ${ex.type === "delay" ? "selected" : ""}>Mandar outra sozinha</option>
          </select>
        </div>
        ${ex.type === "none" ? "" : `
        <div>
          <span class="label">${ex.type === "delay" ? "Qual mensagem" : "Depois de responder, vai pra"}</span>
          <select class="select" data-s="${i}" data-f="extra-next">${opcoesPassos(ex.next, i, ex.type === "delay" ? "Escolha a mensagem" : "Encerrar (agradece e fim)")}</select>
        </div>`}
        ${ex.type === "delay" ? `
        <div>
          <span class="label">Depois de quantos segundos</span>
          <input class="input" type="number" min="5" step="5" data-s="${i}" data-f="extra-seconds" value="${esc(ex.seconds)}">
        </div>` : ""}
      </div>
      ${ex.type === "email" || ex.type === "telefone" ? `<p class="hint">A próxima mensagem de texto da pessoa é salva como ${ex.type === "email" ? "e-mail" : "telefone"}. Se vier estranho, o sistema pede de novo.</p>` : ""}`;

    const temSaida = s.buttons.some((b) => b.kind !== "end") || ex.type !== "none";
    return `
      <div class="step">
        <div class="step-head">
          <h3>Mensagem ${i + 2}</h3>
          <button class="icon-btn" data-act="del-passo" data-s="${i}" title="Remover mensagem">${icon("trash")}</button>
        </div>
        <textarea class="textarea" id="ed-msg-${i}" data-s="${i}" data-f="message" placeholder="Escreva a mensagem ${i + 2}">${esc(s.message)}</textarea>
        ${emojiBar(`ed-msg-${i}`)}
        <span class="label" style="margin-top:14px">Botões</span>
        ${botoes}
        ${s.buttons.length < MAX_BOTOES
          ? `<button class="btn sm" style="margin-top:8px" data-act="add-botao" data-s="${i}">${icon("plus")} Adicionar botão</button>`
          : `<p class="hint">No máximo ${MAX_BOTOES} botões por mensagem (limite do Instagram pros botões anexados).</p>`}
        ${assets.length ? `<div style="margin-top:12px"><span class="label">Arquivo nesta mensagem</span>${pickerAssets(s.assets || [], i)}</div>` : ""}
        ${extra}
        ${temSaida ? "" : `<p class="end-note">Sem botões: a conversa termina aqui.</p>`}
      </div>`;
  }

  // Posts (ig-media)
  function renderPosts() {
    const box = document.getElementById("ed-posts");
    if (!box) return;
    const semConexao = `<div class="soft-box">Conecte seu Instagram pra escolher os posts. Sem escolha, a automação vale pra todos os posts.</div>`;
    if (!sb) { box.innerHTML = semConexao; return; }
    if (posts === null) { box.innerHTML = `<p class="hint">Carregando seus posts...</p>`; return; }
    if (!posts.connected || !posts.posts?.length) { box.innerHTML = semConexao; return; }
    const sel = st.media_ids.length;
    box.innerHTML = `
      <div class="posts">${posts.posts.map((p) => `
        <button type="button" class="post ${st.media_ids.includes(p.id) ? "sel" : ""}" data-act="post" data-id="${p.id}" title="${esc(p.legenda)}">
          ${p.miniatura ? `<img src="${esc(p.miniatura)}" alt="${esc(p.legenda || "post")}" loading="lazy">` : ""}
        </button>`).join("")}
      </div>
      <p class="hint">${sel ? `${sel} post(s) escolhido(s). <button class="btn link" data-act="limpar-posts">Usar em todos</button>` : "Nenhum escolhido: vale pra todos os posts."}</p>`;
  }

  // Biblioteca de arquivos
  function pickerAssets(selecionados, escopo) {
    return assets.map((a) => `
      <label class="switch" style="margin:4px 0">
        <input type="checkbox" data-asset="${a.id}" data-escopo="${escopo}" ${selecionados.includes(a.id) ? "checked" : ""}><span class="track"></span>
        ${esc(a.nome)} <span class="chip">${esc(a.tipo)}</span>
      </label>`).join("");
  }
  function renderAssets() {
    const box = document.getElementById("ed-assets");
    if (!box) return;
    box.innerHTML = `
      ${assets.length ? pickerAssets(st.asset_ids, "main") : `<div class="soft-box">Sua biblioteca está vazia. Adicione um PDF, áudio, foto ou vídeo pelo link público dele.</div>`}
      <details style="margin-top:10px">
        <summary class="btn link">+ Adicionar à biblioteca</summary>
        <div class="extra">
          <input class="input" id="as-nome" placeholder="Nome (ex: Guia em PDF)">
          <select class="select" id="as-tipo">
            <option value="file">PDF / arquivo</option><option value="image">Foto</option>
            <option value="audio">Áudio</option><option value="video">Vídeo</option>
          </select>
        </div>
        <input class="input" id="as-url" style="margin-top:8px" placeholder="Link público do arquivo (https://...)">
        <button class="btn sm" style="margin-top:8px" data-act="add-asset">Adicionar</button>
      </details>
      <p class="hint">Dica: depois da resposta a um comentário, o Instagram só libera novas mensagens quando a pessoa responde. Por isso, arquivos chegam com mais garantia a partir da Mensagem 2.</p>`;
  }

  // -------------------------------------------------------------------
  // PRÉVIA AO VIVO (como a DM chega no celular da pessoa)
  // -------------------------------------------------------------------
  function bolha(texto, botoes = []) {
    const t = texto.trim() ? esc(texto) : `<span class="placeholder-text">Sua mensagem aparece aqui</span>`;
    if (!botoes.length) return `<div class="msg in"><div class="bubble">${t}</div></div>`;
    return `<div class="msg in"><div class="bubble card"><div class="txt">${t}</div>${botoes.map((b) =>
      `<div class="att">${b.link ? icon("link") : ""}${esc((b.title || "").slice(0, MAX_TITULO))}</div>`).join("")}</div></div>`;
  }
  const sys = (t) => `<div class="sys">${esc(t)}</div>`;
  const toque = (t) => `<div class="msg out"><div class="bubble">${esc(t)}</div></div>`;
  const arquivos = (ids) => ids.map((id) => assets.find((a) => a.id === id)).filter(Boolean)
    .map((a) => `<div class="msg in"><div class="bubble file">${icon("file")} ${esc(a.nome)}</div></div>`).join("");

  // Só aparece o botão que tem destino (igual ao envio real).
  const botaoVisivel = (b) => (b.kind === "link" && b.url.trim()) || (b.kind === "next" && existePasso(b.next));

  function renderPrevia() {
    const box = document.getElementById("ed-previa");
    if (!box) return;
    const kw = st.match_any ? "qualquer coisa" : st.keywords[0] || "sua palavra";
    const partes = [sys(`Alguém comentou "${kw}" no seu post`)];

    const b1 = [];
    if (st.button_on) {
      const titulo = st.button_title.trim() || "Continuar";
      if (st.mode === "link" && st.link.trim()) b1.push({ title: titulo, link: true });
      if (st.mode === "flow" && st.steps[0]) b1.push({ title: titulo });
    }
    partes.push(bolha(st.message, b1));
    partes.push(arquivos(st.asset_ids));

    if (st.button_on && st.mode === "flow" && st.steps.length) {
      // De onde a pessoa chega em cada mensagem (botão, coleta ou atraso).
      const chegada = new Map([[String(st.steps[0].id), { tipo: "btn", t: st.button_title.trim() || "Continuar" }]]);
      st.steps.forEach((s, i) => {
        const c = chegada.get(String(s.id));
        if (c?.tipo === "btn") partes.push(toque(c.t));
        else if (c?.tipo === "coleta") partes.push(toque(c.t));
        else if (c?.tipo === "atraso") partes.push(sys(`depois de ${c.t} segundos`));
        else partes.push(sys(`Mensagem ${i + 2} (quando alguém chegar nela)`));

        const visiveis = s.buttons.filter(botaoVisivel);
        partes.push(bolha(s.message, visiveis.map((b) => ({ title: b.title || "Botão", link: b.kind === "link" }))));
        partes.push(arquivos(s.assets || []));

        visiveis.filter((b) => b.kind === "next").forEach((b) => {
          if (!chegada.has(String(b.next))) chegada.set(String(b.next), { tipo: "btn", t: b.title || "Botão" });
        });
        const ex = s.extra;
        if (ex.type === "email" || ex.type === "telefone") {
          const exemplo = ex.type === "email" ? "voce@exemplo.com" : "(11) 90000-0000";
          if (existePasso(ex.next)) { if (!chegada.has(String(ex.next))) chegada.set(String(ex.next), { tipo: "coleta", t: exemplo }); }
          else partes.push(toque(exemplo), bolha("Recebi, obrigado!"));
        }
        if (ex.type === "delay" && existePasso(ex.next) && !chegada.has(String(ex.next))) {
          chegada.set(String(ex.next), { tipo: "atraso", t: ex.seconds });
        }
      });
    }
    partes.push(sys("Fim da conversa"));

    box.innerHTML = `
      <div class="phone">
        <div class="phone-top"><span class="av"></span> sua_conta</div>
        <div class="chat">${partes.join("")}</div>
      </div>
      <p class="preview-note">Atualiza enquanto você edita.${st.public_reply.trim() ? `<br>Resposta pública: "${esc(st.public_reply.trim())}"` : ""}</p>`;
  }

  // ===================================================================
  // EVENTOS (delegação: um ouvinte só pro editor inteiro)
  // ===================================================================
  function mudou() { sujo = true; renderPrevia(); }

  function atualizaContador(input, valor) {
    const n = valor.trim().length;
    const over = n > MAX_TITULO;
    input.classList.toggle("over", over);
    const cont = input.closest(".field, .line > div")?.querySelector(".counter");
    if (cont) { cont.textContent = `${n}/${MAX_TITULO}`; cont.classList.toggle("over", over); }
    const dica = input.closest(".field, .line > div")?.querySelector("[data-linkhint]");
    if (dica) dica.hidden = !pareceLink(valor);
  }

  function onInput(ev) {
    const el = ev.target;
    if (el.tagName === "SELECT" || el.type === "checkbox" || el.type === "radio") return;
    if (el.id === "ed-tag-input" || el.id?.startsWith("as-")) return;

    if (el.dataset.v !== undefined) { st.variants[+el.dataset.v] = el.value; return mudou(); }

    const f = el.dataset.f;
    if (!f) return;
    if (el.dataset.s === undefined) {
      st[f] = el.value;
      if (f === "button_title") {
        atualizaContador(el, el.value);
        const ref = document.getElementById("ed-ref-btn"); if (ref) ref.textContent = el.value || "sem nome";
      }
      if (f === "message") {
        const ref = document.getElementById("ed-ref-text");
        if (ref) ref.innerHTML = el.value.trim() ? esc(el.value) : '<span class="placeholder-text">(ainda sem texto)</span>';
      }
      return mudou();
    }

    const passo = st.steps[+el.dataset.s];
    if (el.dataset.b !== undefined) {
      const b = passo.buttons[+el.dataset.b];
      if (f === "title") { b.title = el.value; atualizaContador(el, el.value); const d = el.parentElement.querySelector("[data-linkhint]"); if (d) d.hidden = !(pareceLink(el.value) && b.kind !== "link"); }
      if (f === "url") b.url = el.value;
      return mudou();
    }
    if (f === "message") passo.message = el.value;
    if (f === "extra-seconds") passo.extra.seconds = el.value;
    mudou();
  }

  function onChange(ev) {
    const el = ev.target;

    // Arquivos da biblioteca
    if (el.dataset.asset) {
      const lista = el.dataset.escopo === "main" ? st.asset_ids : (st.steps[+el.dataset.escopo].assets ||= []);
      const i = lista.indexOf(el.dataset.asset);
      if (el.checked && i < 0) lista.push(el.dataset.asset);
      if (!el.checked && i >= 0) lista.splice(i, 1);
      return mudou();
    }

    // Modo do botão da Mensagem 1
    if (el.name === "ed-mode") {
      st.mode = el.value;
      if (st.mode === "link" && pareceLink(st.button_title)) { // link colado no nome: move pro lugar certo
        st.link = normalizaUrl(st.button_title); st.button_title = "Acessar";
      }
      if (st.mode === "flow" && !st.steps.length) st.steps.push(novoPasso());
      renderResposta(); return mudou();
    }

    const f = el.dataset.f;
    if (!f) return;

    if (el.dataset.s === undefined) {
      if (el.type === "checkbox") st[f] = el.checked;
      if (f === "match_any") renderTags();
      if (f === "button_on") renderResposta();
      return mudou();
    }

    const i = +el.dataset.s;
    const passo = st.steps[i];
    if (el.dataset.b !== undefined) {
      const b = passo.buttons[+el.dataset.b];
      if (f === "kind") {
        // A escolha "é link" fica guardada em b.kind, mesmo com a URL vazia.
        b.kind = el.value;
        if (b.kind === "link") {
          if (pareceLink(b.title)) { b.url = normalizaUrl(b.title); b.title = "Acessar"; }
          else if (!b.title.trim()) b.title = "Acessar";
        }
        if (b.kind === "next" && !existePasso(b.next)) {
          const outro = st.steps[i + 1] || st.steps.find((_, k) => k !== i);
          b.next = outro ? outro.id : null;
        }
        renderResposta();
      }
      if (f === "next") b.next = el.value === "" ? null : Number(el.value);
      return mudou();
    }

    if (f === "extra-type") {
      passo.extra.type = el.value;
      if (el.value === "delay" && !existePasso(passo.extra.next)) passo.extra.next = st.steps[i + 1]?.id ?? null;
      renderResposta();
    }
    if (f === "extra-next") passo.extra.next = el.value === "" ? null : Number(el.value);
    mudou();
  }

  async function onClick(ev) {
    // Clique no fundo escuro (fora do editor): fecha, avisando se tiver algo não salvo.
    if (ev.target === raiz()) return fechar();

    const el = ev.target.closest("[data-act]");
    if (!el) {
      if (ev.target.closest("#ed-tags")) document.getElementById("ed-tag-input")?.focus();
      return;
    }
    const act = el.dataset.act;
    const s = el.dataset.s !== undefined ? +el.dataset.s : null;

    if (act === "fechar") return fechar();
    if (act === "salvar") return salvar();

    if (act === "emoji") {
      const ta = document.getElementById(el.dataset.alvo);
      const ini = ta.selectionStart ?? ta.value.length, fim = ta.selectionEnd ?? ta.value.length;
      ta.setRangeText(el.dataset.em, ini, fim, "end");
      ta.focus();
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    if (act === "del-tag") { st.keywords.splice(+el.dataset.i, 1); renderTags(true); return mudou(); }
    if (act === "add-variante") { st.variants.push(""); renderVariantes(); raiz().querySelector(`[data-v="${st.variants.length - 1}"]`)?.focus(); return mudou(); }
    if (act === "del-variante") { st.variants.splice(+el.dataset.i, 1); renderVariantes(); return mudou(); }

    if (act === "post") {
      const id = el.dataset.id, i = st.media_ids.indexOf(id);
      i < 0 ? st.media_ids.push(id) : st.media_ids.splice(i, 1);
      renderPosts(); return mudou();
    }
    if (act === "limpar-posts") { st.media_ids = []; renderPosts(); return mudou(); }

    if (act === "add-passo") {
      st.steps.push(novoPasso()); renderResposta(); mudou();
      document.getElementById(`ed-msg-${st.steps.length - 1}`)?.focus();
      return;
    }
    if (act === "del-passo") {
      const id = st.steps[s].id;
      const temTexto = st.steps[s].message.trim();
      if (temTexto && !confirm(`Remover a Mensagem ${s + 2}?`)) return;
      st.steps.splice(s, 1);
      // Quem apontava pra ela passa a "encerrar".
      for (const p of st.steps) {
        for (const b of p.buttons) if (b.kind === "next" && String(b.next) === String(id)) { b.next = null; b.kind = "end"; }
        if (String(p.extra.next) === String(id)) p.extra.next = null;
      }
      renderResposta(); return mudou();
    }
    if (act === "add-botao") {
      const b = novoBotao();
      const outro = st.steps[s + 1];
      if (outro) { b.kind = "next"; b.next = outro.id; }
      st.steps[s].buttons.push(b); renderResposta(); return mudou();
    }
    if (act === "del-botao") { st.steps[s].buttons.splice(+el.dataset.b, 1); renderResposta(); return mudou(); }

    if (act === "add-asset") {
      const nome = document.getElementById("as-nome").value.trim();
      const tipo = document.getElementById("as-tipo").value;
      const url = document.getElementById("as-url").value.trim();
      if (!nome || !urlValida(url)) return toast("Preencha o nome e um link público válido (https://...).", "err");
      if (!sb) return toast("Pra guardar arquivos, configure o Supabase (veja o LEIA-ME). No modo de teste local nada é gravado.", "warn");
      try {
        const novo = await api.adicionarAsset({ nome, tipo, public_url: url });
        assets.unshift(novo); st.asset_ids.push(novo.id);
        renderAssets(); renderResposta(); mudou();
        toast("Arquivo adicionado à biblioteca.", "ok");
      } catch (e) { console.warn(e); toast("Não consegui adicionar o arquivo. Tente de novo.", "err"); }
    }
  }

  function onKeydown(ev) {
    if (ev.target.id === "ed-tag-input") {
      const inp = ev.target;
      if (ev.key === "Enter" || ev.key === ",") { ev.preventDefault(); addTag(inp.value); inp.value = ""; }
      else if (ev.key === "Backspace" && !inp.value && st.keywords.length) { st.keywords.pop(); renderTags(true); mudou(); }
    }
    if (ev.key === "Escape") fechar();
  }

  // Ao sair do campo de tags com algo digitado, adiciona (não perde o que escreveu).
  // E se colou um link no NOME de um botão que já é de link, move pro campo certo.
  function onFocusOut(ev) {
    const el = ev.target;
    if (el.id === "ed-tag-input" && el.value.trim()) addTag(el.value);
    if (!pareceLink(el.value)) return;
    if (el.dataset.f === "button_title" && st.mode === "link") {
      st.link = normalizaUrl(el.value); st.button_title = "Acessar";
      renderResposta(); mudou(); toast("Link movido pro campo do link. O botão ficou com o nome \"Acessar\".");
    }
    if (el.dataset.f === "title" && el.dataset.b !== undefined) {
      const b = st.steps[+el.dataset.s].buttons[+el.dataset.b];
      if (b.kind === "link") {
        b.url = normalizaUrl(el.value); b.title = "Acessar";
        renderResposta(); mudou(); toast("Link movido pro campo do link. O botão ficou com o nome \"Acessar\".");
      }
    }
  }

  // ===================================================================
  // ABRIR / FECHAR / SALVAR
  // ===================================================================
  async function abrir(row) {
    st = row ? deRow(row) : novoEstado();
    sujo = false;
    posts = null;
    raiz().hidden = false;
    document.body.style.overflow = "hidden";
    renderTudo();
    raiz().querySelector('[data-f="nome"]').focus();

    // Carrega posts e arquivos sem travar o editor.
    if (sb) {
      api.funcao("ig-media").then((r) => { posts = r || { connected: false }; renderPosts(); });
      api.listarAssets().then((a) => { assets = a; renderAssets(); renderResposta(); renderPrevia(); });
    }
  }

  function fechar(forcar = false) {
    if (raiz().hidden) return;
    if (sujo && !forcar && !confirm("Você tem alterações não salvas. Quer sair mesmo assim?")) return;
    raiz().hidden = true;
    raiz().innerHTML = "";
    document.body.style.overflow = "";
    sujo = false;
  }

  async function salvar() {
    const erros = validar();
    renderErros(erros);
    if (erros.length) {
      raiz().querySelector(".editor-form").scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (!sb) {
      toast(MODO_LOCAL
        ? "Modo de teste local: a automação está válida, mas nada é gravado. Pra salvar de verdade, configure o Supabase (veja o LEIA-ME)."
        : "O Supabase ainda não foi configurado. Veja o LEIA-ME.", "warn");
      return;
    }
    const btn = raiz().querySelector('[data-act="salvar"]');
    btn.disabled = true; btn.textContent = "Salvando...";
    try {
      await api.salvarAutomacao(paraRow());
      toast("Automação salva!", "ok");
      fechar(true);
      carregarAutomacoes();
    } catch (e) {
      console.warn(e);
      toast("Não consegui salvar. Confira a conexão e tente de novo.", "err");
      btn.disabled = false; btn.textContent = "Salvar";
    }
  }

  // Liga os ouvintes uma vez só.
  const ov = raiz();
  ov.addEventListener("input", onInput);
  ov.addEventListener("change", onChange);
  ov.addEventListener("click", onClick);
  ov.addEventListener("keydown", onKeydown);
  ov.addEventListener("focusout", onFocusOut);
  window.addEventListener("beforeunload", (ev) => { if (sujo && !raiz().hidden) { ev.preventDefault(); ev.returnValue = ""; } });

  return { abrir, temAlteracoes: () => sujo && !raiz().hidden };
})();
window.Editor = Editor;
