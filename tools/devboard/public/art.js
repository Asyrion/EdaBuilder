// EdaBuilder dev board, the art side (iteration 89, DESIGN 4.120): the prompt studio (a brief, a draft from the house art
// rules, "Refine with Claude", kept in art/prompts/), and the pipelines: the paintings importer runs here (drop a painting,
// pick its island, its art/sources.json entry, npm run art -- --check, mark it checked); Tripo Studio and Aseprite hand
// off to Claude until their pipelines are written into the docs. Uses $, esc, api, toast, C, tab, entriesOf, artOf,
// refresh and closeEditor from app.js, and ProjectUI.sendDialog.
"use strict";

const ArtUI = (() => {
  const TABS = [["art", "Art & pipelines"]];
  let P = null, L = null, cur = null, loading = false, poll = null;
  const handles = t => TABS.some(([id]) => id === t);
  const tabsHtml = () => TABS.map(([id, name]) => `<button class="tab${tab === id ? " on" : ""}" data-tab="${id}">${name}</button>`).join("");
  /** The sprite a building's prompt belongs to: b_<key>, or a zone house's first look. */
  const spriteOf = e => e.data?.category === "zone" ? (artOf(e.id)?.looks[0]?.name ?? "b_" + e.id) : "b_" + e.id;
  /** The sprite's live art/sources.json entry (switched-off ones stay in the file for the record). */
  const sourceOf = sprite => entriesOf("artsources").filter(e => e.data?.name === sprite && !e.data.off).pop() ?? null;

  async function load(force) {
    if (loading && !force) return;
    loading = true;
    try { [P, L] = await Promise.all([api("/api/pipelines"), api("/api/prompts")]); } catch (e) { P = { error: e.message, pipelines: [], paintings: {} }; L = { prompts: [] }; }
    loading = false;
    if (tab === "art") $("#main").innerHTML = renderTab();
  }

  // ---------------- the tab ----------------
  function runHtml(run) {
    if (!run) return '<p class="dim small">No import run since the board started.</p>';
    const t = run.ended ? Math.round((run.ended - run.started) / 1000) + " s" : "running…";
    return `<div class="small"><span class="chip ${run.state === "done" ? "ok" : run.state === "failed" ? "bad" : "warn"}">${run.state}</span> import #${run.id} · ${t}</div>
      <pre class="log">${esc(run.log.slice(-12).join("\n"))}</pre>${run.state === "done" ? `<a class="btn small ghost" target="_blank" href="/shot/import_check.png?t=${run.ended}">Check sheet</a>` : ""}`;
  }
  function renderTab() {
    if (!P || !L) { load(); return '<p class="dim">Reading the pipelines…</p>'; }
    const pipes = P.pipelines.map(p => `<div class="card"><h3>${esc(p.name)} <span class="chip ${p.runs === "board" ? "ok" : "warn"}">${p.runs === "board" ? "runs here" : "hand-off to Claude"}</span></h3>
      <div class="small">${esc(p.for)}</div>
      ${p.steps ? `<ol class="small">${p.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>` : `<p class="small dim">Not written into the docs yet: its button on a sprite's Art panel writes the task, and Claude works the pipeline out with you and writes it into docs/HANDOFF.md. Then it gets its steps here (tools/devboard/pipelines.json).</p>`}
      ${p.doc ? `<div class="small dim">Docs: ${esc(p.doc)}</div>` : ""}${p.tests ? `<div class="small dim">Run before commit: <span class="mono">npx vitest run ${p.tests.map(esc).join(" ")}</span></div>` : ""}
      ${p.id === "paintings" ? `<h4>Last run</h4>${runHtml(P.run)}` : ""}</div>`).join("");
    const prompts = L.prompts.map(p => `<div class="card"><h3 class="mono">${esc(p.sprite)}</h3><div class="small dim">${p.building ? "building " + esc(p.building) + " · " : ""}${p.refined ? "refined" : "draft"} · ${esc(p.pipeline || "")}${p.broken ? ' · <b class="err-text">unreadable</b>' : ""}</div>
      <div class="acts"><button class="btn small" data-art="${esc(p.sprite)}|${esc(p.building ?? "")}">Open</button></div></div>`).join("");
    const folders = Object.entries(P.paintings).map(([f, l]) => `<span class="chip">${esc(f)} ${l.length}</span>`).join(" ");
    return `<div class="toolbar"><strong>Art & pipelines</strong><span class="dim">prompts in art/prompts/, the pipelines of tools/devboard/pipelines.json</span><button class="btn small ghost" data-art-reload>Reload</button></div>
      ${P.error ? `<p class="err-text">${esc(P.error)}</p>` : ""}
      <div class="toolbar"><span>A prompt for any sprite (a prop, a creature, a cart):</span><input type="text" id="artsprite" placeholder="e.g. tree_4" class="mono"><button class="btn small" data-art-open>Open</button><span class="dim small">Buildings: the Art button on their card.</span></div>
      <h2>Pipelines</h2><div class="grid">${pipes}</div>
      <h2>Prompts kept</h2><div class="grid">${prompts || '<p class="dim">None yet: open a building\'s Art panel and save its prompt.</p>'}</div>
      <h2>Paintings</h2><p class="small">${folders || '<span class="dim">none</span>'}</p>`;
  }

  // ---------------- the Art panel ----------------
  async function open(sprite, building) {
    try {
      const st = await api(`/api/prompt/${encodeURIComponent(sprite)}${building ? "?building=" + encodeURIComponent(building) : ""}`);
      if (!P) await load(true);
      const src = sourceOf(sprite);
      cur = { sprite, building: building || st.building?.key || "", st, data: { ...st.data }, painting: src?.data.src ?? "", white: src?.data.white ?? 235, isl: null, job: null };
      draw();
      if (cur.painting) listIslands();
    } catch (e) { toast(e.message, "bad"); }
  }
  const pipeOf = id => P.pipelines.find(p => p.id === id) ?? P.pipelines[0];
  function draw() {
    const { st, data, sprite } = cur, b = st.building, pipe = pipeOf(data.pipeline), src = sourceOf(sprite);
    const imgs = `<img class="spr big" src="/sprite/${esc(sprite)}.png?t=${Date.now()}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'dim',textContent:'no sprite yet'}))"> <img class="spr big" title="drawn in code" src="/sprite/${esc(sprite)}.png?from=drawn&t=${Date.now()}" alt="" onerror="this.remove()">`;
    const opts = P.pipelines.map(p => `<option value="${esc(p.id)}" ${p.id === pipe.id ? "selected" : ""}>${esc(p.name)}${p.runs === "handoff" ? " (hand-off)" : ""}</option>`).join("");
    $("#modal").innerHTML = `<div class="dialog wide"><h2>Art: <span class="mono">${esc(sprite)}</span>${b ? ` · ${esc(b.name)} <span class="dim small">${b.w}×${b.h} ${esc(b.category)}</span>` : ""}</h2>
      <div class="looks">${imgs}</div>
      <h4>The prompt</h4>
      <div class="field"><label>Brief</label><div><textarea id="ab" rows="3" placeholder="What it is, its mood, what must show: the people, the material, the light">${esc(data.brief)}</textarea></div><div class="help">Your words; the draft is built from them and the house rules.</div></div>
      <div class="field"><label>Draft</label><div><pre class="design small" id="ad">${esc(st.draft)}</pre></div><div class="help"><button class="btn small ghost" data-art-redraft>Redraft from the brief</button> The house rules: the citizen yardstick (DESIGN §4.109), the front on the right face (§4.90), one subject on white for the importer.</div></div>
      <div class="field"><label>Prompt</label><div><textarea id="ar" rows="7" class="mono" placeholder="Refine with Claude, or write it here">${esc(data.refined)}</textarea></div><div class="help" id="anote">${data.note ? "Claude's note: " + esc(data.note) : "The prompt you take to the image tool; empty means the draft."}</div></div>
      ${st.lore.length ? `<details><summary class="small">Lore that names it (${st.lore.length})</summary><ul class="small">${st.lore.map(l => `<li>${esc(l)}</li>`).join("")}</ul></details>` : ""}
      <div class="acts"><button class="btn primary" data-art-save>Save prompt</button><button class="btn" data-art-refine>Refine with Claude</button><button class="btn ghost" data-art-copy>Copy prompt</button><span id="amsg" class="small"></span></div>
      <h4>Pipeline</h4>
      <div class="field"><label>Make it with</label><div><select id="ap">${opts}</select></div><div class="help">${esc(pipe.for)}</div></div>
      <div id="apipe">${pipe.runs === "handoff" ? `<p class="small">Not written into the docs yet: this writes the task for Claude, who works the pipeline out with you and writes it into docs/HANDOFF.md.</p><button class="btn" data-art-handoff="${esc(pipe.id)}">Hand off to Claude</button>` : importer(src)}</div>
      <div class="foot"><button class="btn ghost" data-close>Close</button></div></div>`;
    $("#modal").hidden = false;
  }
  function importer(src) {
    const { sprite, st, painting } = cur, b = st.building, y = yardPx(b);
    const e = src?.data ?? {}, val = (k, d) => esc(e[k] ?? d ?? "");
    const list = Object.values(P.paintings).flat().map(f => `<option ${f === painting ? "selected" : ""}>${esc(f)}</option>`).join("");
    const isl = cur.isl ? `<div class="sheet" id="asheet"><img id="aimg" src="/painting?src=${encodeURIComponent(painting)}" alt="">${cur.isl.map(i => `<div class="box${String(i.i) === String(cur.island ?? e.island) ? " on" : ""}" data-art-island="${i.i}" data-r="${i.x},${i.y},${i.w},${i.h}" title="island ${i.i}: ${i.w}×${i.h}"><span>${i.i}</span></div>`).join("")}</div>` : painting ? '<p class="dim small">Listing its islands…</p>' : "";
    return `<p class="banner small">Don't run the balance bar while an import runs or an entry is saved: each run reads the files when it starts (DESIGN §4.118).</p>
      <div class="field"><label>1 · Painting</label><div><select id="apaint"><option value="">choose one in inspirations/ …</option>${list}</select>
        <div class="drop" id="adrop">or drop a PNG here <input type="file" id="afile" accept="image/png"> into <input type="text" id="afolder" class="mono" value="${esc(painting.split("/")[1] ?? "board")}" size="14"></div></div></div>
      <div class="field"><label>2 · Island</label><div>${isl}<span class="small">white <input type="number" id="awhite" value="${esc(cur.white)}" min="150" max="255" style="width:5em"> <button class="btn small ghost" data-art-islands>List again</button> (about 200 keys out a grey shadow or grid paper)</span></div></div>
      <div class="field"><label>3 · Entry</label><div class="entry small">
        <label>island <input type="number" id="ei" value="${esc(cur.island ?? e.island ?? "")}" style="width:5em"></label>
        <label>kind <select id="ek">${["building", "prop", "ground", "vehicle"].map(k => `<option ${k === (e.kind ?? "building") ? "selected" : ""}>${k}</option>`).join("")}</select></label>
        <label>w <input type="number" id="ew" value="${val("w", b?.w)}" style="width:4em"></label><label>h <input type="number" id="eh" value="${val("h", b?.h)}" style="width:4em"></label>
        <label>targetHeight <input type="number" id="et" value="${val("targetHeight", y)}" style="width:5em"></label>
        <label>anchor <input type="text" id="ea" value="${esc(typeof e.anchor === "object" ? JSON.stringify(e.anchor) : e.anchor ?? "centre")}" style="width:7em"></label>
        <label><input type="checkbox" id="ef" ${e.flip ? "checked" : ""}> flip</label>
        <label>shift y <input type="number" id="es" value="${esc(e.shift?.y ?? "")}" style="width:4em"></label>
        <button class="btn small" data-art-entry>${src ? "Save the entry" : "Add the entry"}</button>${src ? ` <span class="chip ${e.checked ? "ok" : "warn"}">${e.checked ? "checked" : "unchecked"}</span>` : ""}</div>
        <div class="help">${y ? `The yardstick gives ${y} px for it (DESIGN §4.109).` : "A tower or wonder may rise as tall as it needs."} The importer's header (scripts/importSprites.mjs) has every key; the Art sources tab edits the rest.</div></div>
      <div class="field"><label>4 · Import</label><div><button class="btn" data-art-import ${src ? "" : "disabled"}>Run the import (npm run art -- --check)</button><div id="arun">${P.run ? runHtml(P.run) : ""}</div></div></div>
      <div class="field"><label>5 · Judge</label><div><button class="btn small" data-art-checked ${src && !e.checked ? "" : "disabled"}>Mark it checked</button> <span class="small dim">once it reads right beside the code sprite and a citizen. Then send it to Claude for the tests (${(pipeOf("paintings").tests ?? []).map(t => t.replace("tests/", "")).join(", ")}) and the commit.</span> <button class="btn small ghost" data-art-handoff="paintings-commit">Send to Claude</button></div></div>`;
  }
  function yardPx(b) {
    if (!b) return null;
    const r = cur.st.rules.find(x => /about (\d+) px/.test(x));
    return r ? Number(/about (\d+) px/.exec(r)[1]) : null;
  }

  function gather() { return { ...cur.data, sprite: cur.sprite, building: cur.building || undefined, brief: $("#ab").value, draft: $("#ad").textContent, refined: $("#ar").value, pipeline: $("#ap").value }; }
  async function save(quiet) {
    const data = gather();
    try {
      await api("/api/prompt/save", { sprite: cur.sprite, before: cur.st.text, data });
      cur.st = await api(`/api/prompt/${encodeURIComponent(cur.sprite)}${cur.building ? "?building=" + encodeURIComponent(cur.building) : ""}`);
      cur.data = { ...cur.st.data };
      if (!quiet) toast(`Saved art/prompts/${cur.sprite}.json`, "ok");
      L = null; refresh(false);
      return true;
    } catch (e) { toast(e.message, "bad"); return false; }
  }
  async function redraft() {
    const st = await api(`/api/prompt/${encodeURIComponent(cur.sprite)}?building=${encodeURIComponent(cur.building)}&brief=${encodeURIComponent($("#ab").value)}`);
    $("#ad").textContent = st.draft;
  }
  async function refine() {
    const data = gather(), msg = h => { const m = $("#amsg"); if (m) m.innerHTML = h; };
    try {
      const r = (await api("/api/refine", { sprite: cur.sprite, building: cur.building, data })).result;
      if (r.noCli) {
        await save(true);
        ProjectUI.sendDialog(`Refine the prompt for ${cur.sprite}`, r.task + `\n\nThen save the result into art/prompts/${cur.sprite}.json as "refined" (and your note as "note"), or tell me and I paste it on the dev board.`);
        toast("No Claude Code CLI here: the refine task is in the Send dialog", "");
        return;
      }
      msg('<span class="chip warn">Claude is refining…</span>');
      const started = Date.now();
      clearInterval(poll);
      poll = setInterval(async () => {
        try {
          const j = await api("/api/refine/" + r.job.id);
          if (j.state === "running") { msg(`<span class="chip warn">Claude is refining… ${Math.round((Date.now() - started) / 1000)} s</span>`); return; }
          clearInterval(poll);
          if (j.state === "failed") return msg(`<span class="err-text">Refine failed: ${esc(j.error)}</span>`);
          if (!$("#ar")) return;
          cur.data.history = [...(cur.data.history ?? []), { at: new Date().toISOString(), refined: j.prompt, note: j.note }].slice(-10);
          cur.data.note = j.note;
          $("#ar").value = j.prompt; $("#anote").textContent = j.note ? "Claude's note: " + j.note : "";
          await save(true);
          msg('<span class="chip ok">refined and saved</span>');
        } catch (e) { clearInterval(poll); msg(`<span class="err-text">${esc(e.message)}</span>`); }
      }, 1500);
    } catch (e) { msg(`<span class="err-text">${esc(e.message)}</span>`); }
  }

  async function listIslands() {
    if (!cur.painting) return;
    try {
      cur.isl = (await api(`/api/islands?src=${encodeURIComponent(cur.painting)}&white=${encodeURIComponent(cur.white)}`)).islands;
      redrawPipe();
    } catch (e) { toast(e.message, "bad"); }
  }
  function redrawPipe() {
    const at = $("#apipe");
    if (!at || pipeOf($("#ap").value).runs !== "board") return;
    const keepVals = ["#ab", "#ar"].map(s => $(s)?.value);
    at.innerHTML = importer(sourceOf(cur.sprite));
    ["#ab", "#ar"].forEach((s, i) => { if ($(s)) $(s).value = keepVals[i]; });
    placeBoxes();
  }
  function placeBoxes() {
    const img = $("#aimg");
    if (!img) return;
    const lay = () => {
      const k = img.clientWidth / (img.naturalWidth || 1);
      document.querySelectorAll("#asheet .box").forEach(b => {
        const [x, y, w, h] = b.dataset.r.split(",").map(Number);
        if (w * h < 64) { b.remove(); return; }   // specks: listed by the importer, never picked
        Object.assign(b.style, { left: x * k + "px", top: y * k + "px", width: Math.max(4, w * k) + "px", height: Math.max(4, h * k) + "px" });
      });
    };
    if (img.complete) lay(); else img.onload = lay;
  }
  async function upload(file) {
    if (!file) return;
    const folder = $("#afolder").value.trim() || "board";
    const data = await new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = fail; r.readAsDataURL(file); });
    try {
      const r = await api("/api/upload", { folder, name: file.name, data });
      cur.painting = r.result.src; cur.island = null;
      toast(`Saved ${r.result.src}`, "ok");
      P = await api("/api/pipelines");
      await listIslands();
    } catch (e) { toast(e.message, "bad"); }
  }
  function entryData(checked) {
    const src = sourceOf(cur.sprite), num = s => $(s).value === "" ? undefined : Number($(s).value);
    let anchor = $("#ea").value.trim();
    try { if (anchor.startsWith("{")) anchor = JSON.parse(anchor); } catch { /* left as text: the check reports it */ }
    const d = { ...(src?.data ?? {}), name: cur.sprite, src: cur.painting, island: num("#ei"), kind: $("#ek").value, w: num("#ew"), h: num("#eh"), targetHeight: num("#et"), anchor, flip: $("#ef").checked || undefined };
    const sy = num("#es");
    if (sy !== undefined) d.shift = { x: d.shift?.x ?? 0, y: sy }; else delete d.shift;
    if (d.kind === "building") delete d.kind;
    if (checked) d.checked = true;
    for (const k of Object.keys(d)) if (d[k] === undefined) delete d[k];
    return d;
  }
  async function saveEntry(checked) {
    if (!cur.painting) return toast("Choose or drop a painting first", "bad");
    const src = sourceOf(cur.sprite), data = entryData(checked);
    try {
      if (src) await api("/api/save", { kind: "artsources", src: 0, key: src.key, data, hash: src.hash });
      else await api("/api/create", { kind: "artsources", src: 0, data });
      await refresh(true);
      toast(checked ? `${cur.sprite}: checked` : `art/sources.json: ${cur.sprite} ${src ? "saved" : "added"}`, "ok");
      redrawPipe();
    } catch (e) { toast(e.message, "bad"); }
  }
  async function runImport() {
    try {
      P.run = (await api("/api/pipeline/import", {})).result;
      clearInterval(poll);
      poll = setInterval(async () => {
        P = await api("/api/pipelines");
        const at = $("#arun");
        if (at) at.innerHTML = runHtml(P.run);
        if (P.run.state !== "running") { clearInterval(poll); toast(P.run.state === "done" ? "Import done: judge the sprite" : "The import failed: see its log", P.run.state === "done" ? "ok" : "bad"); refresh(true); if (cur && $("#apipe")) { const imgs = document.querySelector("#modal .looks"); if (imgs) imgs.innerHTML = `<img class="spr big" src="/sprite/${esc(cur.sprite)}.png?t=${Date.now()}" alt=""> <img class="spr big" title="drawn in code" src="/sprite/${esc(cur.sprite)}.png?from=drawn&t=${Date.now()}" alt="">`; } }
      }, 2000);
    } catch (e) { toast(e.message, "bad"); }
  }
  async function handoff(id) {
    const ok = await save(true);
    if (!ok) return;
    const prompt = cur.data.refined || cur.data.draft;
    if (id === "paintings-commit") {
      const e = sourceOf(cur.sprite);
      return ProjectUI.sendDialog(`Art for ${cur.sprite}: tests and commit`, `Read CLAUDE.md and docs/HANDOFF.md first.\n\nI imported a painting for ${cur.sprite} on the dev board (the paintings importer) and judged it: ${e?.data.checked ? "checked" : "not checked yet"}.\nIts art/sources.json entry:\n${JSON.stringify(e?.data ?? {}, null, 2)}\n\nRun the art tests (${(pipeOf("paintings").tests ?? []).join(", ")}), show me the sprite beside its old look and a citizen in the game (by day and night), and if I agree, commit it with the docs (DESIGN, NEXT_STEPS) as the standing process says.`);
    }
    try {
      const r = (await api("/api/pipeline/handoff", { pipeline: id, sprite: cur.sprite, building: cur.building, prompt })).result;
      ProjectUI.sendDialog(r.title, r.text);
    } catch (e) { toast(e.message, "bad"); }
  }

  document.addEventListener("click", ev => {
    const t = ev.target.closest("[data-art],[data-art-open],[data-art-reload],[data-art-save],[data-art-refine],[data-art-copy],[data-art-redraft],[data-art-handoff],[data-art-islands],[data-art-island],[data-art-entry],[data-art-import],[data-art-checked]");
    if (!t) return;
    const d = t.dataset;
    if (d.art) { const [s, b] = d.art.split("|"); open(s, b); }
    if ("artOpen" in d) { const s = $("#artsprite").value.trim(); if (s) open(s, ""); }
    if ("artReload" in d) load(true);
    if ("artSave" in d) save(false);
    if ("artRefine" in d) refine();
    if ("artCopy" in d) navigator.clipboard.writeText($("#ar").value || $("#ad").textContent).then(() => toast("Copied", "ok"), () => toast("The browser refused the clipboard", "bad"));
    if ("artRedraft" in d) redraft();
    if (d.artHandoff) handoff(d.artHandoff);
    if ("artIslands" in d) { cur.white = Number($("#awhite").value) || 235; listIslands(); }
    if (d.artIsland !== undefined) { cur.island = Number(d.artIsland); $("#ei").value = d.artIsland; document.querySelectorAll("#asheet .box").forEach(b => b.classList.toggle("on", b === t)); }
    if ("artEntry" in d) saveEntry(false);
    if ("artImport" in d) runImport();
    if ("artChecked" in d) saveEntry(true);
  });
  document.addEventListener("change", ev => {
    if (!cur || !$("#modal") || $("#modal").hidden) return;
    if (ev.target.id === "ap") { cur.data.pipeline = ev.target.value; const b = $("#ab").value, r = $("#ar").value; draw(); $("#ab").value = b; $("#ar").value = r; if (cur.painting && pipeOf(cur.data.pipeline).runs === "board") listIslands(); }
    if (ev.target.id === "apaint" && ev.target.value) { cur.painting = ev.target.value; cur.island = null; listIslands(); }
    if (ev.target.id === "afile") upload(ev.target.files[0]);
  });
  document.addEventListener("dragover", ev => { if (ev.target.closest?.("#adrop")) ev.preventDefault(); });
  document.addEventListener("drop", ev => { if (ev.target.closest?.("#adrop")) { ev.preventDefault(); upload(ev.dataTransfer.files[0]); } });

  function render() { if (L === null || P === null) load(); return renderTab(); }
  return { handles, render, tabsHtml, spriteOf };
})();
