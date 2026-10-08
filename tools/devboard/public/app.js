// EdaBuilder dev board page (iteration 87, DESIGN 4.118): tabs per kind (tools/devboard/kinds.ts), cards, and an editor whose form is built from the
// entries' own values plus hints.json and the string unions in src/. Polls /api/state every 10 s; never overwrites an
// open editor. Plain JS, no build step.
"use strict";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const isObj = v => v && typeof v === "object" && !Array.isArray(v);
const load = (k, d) => { try { return JSON.parse(localStorage.getItem("devboard." + k)) ?? d; } catch { return d; } };
const keep = (k, v) => { try { localStorage.setItem("devboard." + k, JSON.stringify(v)); } catch { /* private window */ } };

let C = null;            // /api/content
let S = { validation: null, undo: [], sig: "" };
let tab = load("tab", "overview");
let editor = null;       // {kind, entry|null, value, src, key}
let staleWhileEditing = false;

async function api(path, data) {
  const opt = data === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json", "X-Dev-Board": "1" }, body: JSON.stringify(data) };
  const r = await fetch(path, opt);
  const j = await r.json().catch(() => ({ error: r.statusText }));
  if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { status: r.status });
  return j;
}
function toast(msg, cls = "") {
  const t = document.createElement("div");
  t.className = "toast " + cls; t.textContent = msg;
  $("#toasts").append(t); setTimeout(() => t.remove(), cls === "bad" ? 9000 : 4000);
}

// ---------------- data helpers ----------------

const kinds = () => Object.entries(C.kinds);
const kindOf = name => C.kinds[name];
const entriesOf = name => kindOf(name)?.entries ?? [];
const hintsOf = name => C.hints[name] ?? {};
const ids = name => entriesOf(name).map(e => e.id).filter(Boolean);
const q = () => $("#q").value.trim().toLowerCase();

function errorsFor(kind, e) {
  const v = S.validation;
  if (!v || !e.id) return [];
  const re = new RegExp(`(^|[^A-Za-z0-9_])${e.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9_]|$)`);
  return v.checks.flatMap(c => c.errors.filter(m => re.test(m)));
}
function errorCount(name) { return entriesOf(name).filter(e => errorsFor(name, e).length).length; }

function playUrl(kind, e) {
  return null;   // (no address options to start the game with one entry yet)
  // eslint-disable-next-line no-unreachable
  if (!kind.play) return null;
  const d = isObj(e.data) ? e.data : {};
  return C.game + kind.play.replace(/\{(\w+)\}/g, (_, f) => encodeURIComponent(f === "id" ? e.id : f === "n" ? e.n : d[f] ?? ""));
}

/** A description of a kind's fields from every entry's values: {t: obj|arr|str|num|bool|json, fields, of, values, nullable}. */
function describe(values) {
  const d = { types: new Set(), fields: new Map(), items: [], values: new Set(), nullable: false };
  for (const v of values) {
    if (v === undefined) continue;
    if (v === null) { d.nullable = true; continue; }
    if (Array.isArray(v)) { d.types.add("arr"); d.items.push(...v); }
    else if (isObj(v)) { d.types.add("obj"); for (const [k, x] of Object.entries(v)) { if (!d.fields.has(k)) d.fields.set(k, []); d.fields.get(k).push(x); } }
    else { d.types.add(typeof v === "number" ? "num" : typeof v === "boolean" ? "bool" : "str"); if (typeof v === "string") d.values.add(v); }
  }
  const t = d.types.size === 1 ? [...d.types][0] : d.types.size === 0 ? "str" : "json";
  const out = { t, nullable: d.nullable };
  if (t === "obj") out.fields = new Map([...d.fields].map(([k, xs]) => [k, describe(xs)]));
  if (t === "arr") out.of = describe(d.items);
  if (t === "str") out.values = [...d.values];
  return out;
}

// ---------------- rendering ----------------

function renderTabs() {
  let html = `<button class="tab${tab === "overview" ? " on" : ""}" data-tab="overview">Overview</button>` + ProjectUI.tabsHtml();
  let group = "";
  for (const [name, k] of kinds()) {
    if (k.group !== group) { html += '<span class="sep"></span>'; group = k.group; }
    const bad = errorCount(name);
    html += `<button class="tab${tab === name ? " on" : ""}" data-tab="${name}">${esc(k.title)}<span class="n${bad ? " bad" : ""}">${bad ? bad + " ⚠" : k.entries.length}</span></button>`;
  }
  html += '<span class="sep"></span>';
  for (const [name, k] of Object.entries(C.code)) html += `<button class="tab${tab === name ? " on" : ""}" data-tab="${name}">${esc(k.title)}<span class="n">${k.entries.length}</span></button>`;
  $("#tabs").innerHTML = html;
}

function renderChip() {
  const v = S.validation, chip = $("#vchip");
  if (!v) { chip.className = "chip"; chip.textContent = S.validating ? "checking…" : "not checked"; return; }
  const n = v.checks.reduce((a, c) => a + c.errors.length, 0);
  chip.className = "chip " + (v.error ? "warn" : n ? "bad" : "ok");
  chip.textContent = v.error ? "validator failed" : n ? `${n} problem${n > 1 ? "s" : ""}` : "data valid ✓";
  chip.title = `The game's validators, ${new Date(v.at).toLocaleTimeString()}${S.validating ? " (checking again…)" : ""}`;
  $("#undolist").innerHTML = S.undo.length ? S.undo.map(u => `<div><span>${esc(u.what)} <span class="dim">${new Date(u.at).toLocaleTimeString()}</span></span><button class="btn small" data-undo="${u.i}">Undo</button></div>`).join("") : '<span class="dim">Nothing to undo yet.</span>';
}

function render() {
  if (!C) return;
  renderTabs(); renderChip();
  if (tab !== "overview" && !kindOf(tab) && !C.code[tab] && !ProjectUI.handles(tab)) tab = "overview";
  $("#new").hidden = tab === "overview" || !!C.code[tab] || ProjectUI.handles(tab);
  $("#main").innerHTML = (staleWhileEditing ? '<div class="banner">The data changed on disk while you were editing. It reloads when you close the editor.</div>' : "")
    + (tab === "overview" ? renderOverview() : ProjectUI.handles(tab) ? ProjectUI.render(tab) : C.code[tab] ? renderCode(tab) : renderKind(tab));
}

function renderOverview() {
  const v = S.validation;
  const rows = kinds().map(([name, k]) => `<tr><td><a href="#" data-tab="${name}">${esc(k.title)}</a></td><td>${k.entries.length}</td><td>${k.sources.map(s => `<span class="mono">${esc(s.file)}${s.path ? " › " + esc(s.path.join(".")) : ""}</span>`).join("<br>")}</td><td>${errorCount(name) || ""}</td></tr>`).join("");
  const checks = v ? (v.error ? `<p class="err-text">${esc(v.error)}</p>` : v.checks.map(c => `<tr><td>${esc(c.name)}</td><td>${c.errors.length ? `<div class="err-text">${c.errors.map(esc).join("\n")}</div>` : '<span class="chip ok">ok</span>'}</td></tr>`).join("")) : "<tr><td>checking…</td></tr>";
  return `<h2>Content</h2><table class="over"><tr><th>Kind</th><th>Entries</th><th>File</th><th>With problems</th></tr>${rows}</table>
    ${C.errors.length ? `<p class="err-text">${C.errors.map(esc).join("\n")}</p>` : ""}
    <h2>Checks</h2><p class="dim">Run after every save: validateContent and the art rule of tests/sprites.test.ts (tools/devboard/validate.ts). <button class="btn small" data-validate>Run now</button></p>
    <table class="over">${checks}</table>
    <h2>Content in code</h2><p class="dim">${Object.values(C.code).map(k => `${esc(k.title)} (${k.entries.length}, <span class="mono">${esc(k.file)}</span>)`).join(" · ")}: shown read-only until their text moves to JSON (iteration 89).</p>`;
}

function fmt(v) {
  if (v === undefined) return "";
  if (Array.isArray(v)) return v.map(x => typeof x === "object" ? JSON.stringify(x) : x).join(", ");
  if (isObj(v)) return Object.entries(v).map(([k, x]) => `${k}: ${typeof x === "object" ? JSON.stringify(x) : x}`).join(", ");
  return String(v);
}

/** A building's sprites (imported or drawn in code) and its art status (tools/devboard/art.ts). */
function artOf(id) { return C.art?.buildings?.[id] ?? null; }
function artStrip(id, max) {
  const a = artOf(id);
  if (!a) return `<div class="art"><span class="chip">${C.art?.error ? "art status failed" : "art: checking…"}</span></div>`;
  const imgs = a.looks.slice(0, max).map(l => `<img class="spr" loading="lazy" src="/sprite/${esc(l.name)}.png" alt="${esc(l.name)}" title="${esc(l.name)} (${l.from})">`).join("");
  return `<div class="art">${imgs || '<span class="dim">no sprite</span>'}${a.looks.length > max ? `<span class="dim">+${a.looks.length - max}</span>` : ""}<span class="art-chips">${artChips(a)}</span></div>`;
}
function artChips(a) {
  const chips = [];
  if (!a.drawnBase) chips.push('<span class="chip bad" title="tests/sprites.test.ts: every non-zone building needs a b_&lt;key&gt; sprite drawn in code">needs art</span>');
  const imp = a.looks.filter(l => l.from === "imported").length;
  if (imp) chips.push(`<span class="chip ok" title="from the paintings (npm run art)">${imp} imported</span>`);
  else if (a.looks.length) chips.push('<span class="chip" title="drawn by the painter in code">drawn in code</span>');
  if (a.sources.length) {
    const unchecked = a.sources.filter(s => !s.checked && !s.off).length, missing = a.sources.filter(s => !s.painting).length;
    chips.push(`<span class="chip${unchecked ? " warn" : ""}" title="art/sources.json entries">${a.sources.length} source${a.sources.length > 1 ? "s" : ""}${unchecked ? `, ${unchecked} unchecked` : ""}</span>`);
    if (missing) chips.push(`<span class="chip bad">${missing} painting${missing > 1 ? "s" : ""} missing</span>`);
  }
  return chips.join(" ");
}
function artPanel(id) {
  const a = artOf(id);
  if (!a) return "";
  const looks = a.looks.map(l => `<figure><img class="spr big" src="/sprite/${esc(l.name)}.png" alt=""><figcaption class="mono">${esc(l.name)}<br><span class="dim">${l.from}</span></figcaption></figure>`).join("");
  const src = a.sources.map(s => `<li class="mono">${esc(s.name)} ← ${esc(s.src)} ${s.checked ? "✓ checked" : s.off ? "(off)" : "<b>unchecked</b>"}${s.painting ? "" : " <b>painting missing</b>"}</li>`).join("");
  return `<h4>Art</h4><div>${artChips(a)}</div><div class="looks">${looks || '<p class="dim">No sprite yet.</p>'}</div>${src ? `<h4>Art sources</h4><ul>${src}</ul>` : ""}`;
}

function renderCode(name) {
  const k = C.code[name], term = q();
  const list = k.entries.filter(e => !term || (e.id + " " + e.title + " " + e.text.join(" ")).toLowerCase().includes(term));
  const cards = list.map(e => `<div class="card"><h3>${esc(e.title)}</h3><div class="id">${esc(e.id)} · ${esc(k.file)}:${e.line}</div>${e.text.map(t => `<div class="dim small">${esc(t)}</div>`).join("")}</div>`).join("");
  return `<div class="toolbar"><strong>${esc(k.title)}</strong><span class="dim">${list.length} of ${k.entries.length} · read-only: text and logic still live in <span class="mono">${esc(k.file)}</span></span></div><div class="grid">${cards || '<p class="dim">Nothing matches.</p>'}</div>`;
}

function renderKind(name) {
  const k = kindOf(name), term = q();
  const list = k.entries.filter(e => !term || (e.id + " " + e.label + " " + JSON.stringify(e.data)).toLowerCase().includes(term));
  const cards = list.map(e => {
    const d = isObj(e.data) ? e.data : { value: e.data }, errs = errorsFor(name, e), play = playUrl(k, e);
    const sum = (k.summary.length ? k.summary : Object.keys(d).slice(0, 5)).filter(f => d[f] !== undefined)
      .map(f => `<span>${esc(f)}</span><b title="${esc(fmt(d[f]))}">${esc(fmt(d[f]))}</b>`).join("");
    const color = k.colorKey && typeof d[k.colorKey] === "string" ? `<span class="swatch" style="background:${esc(d[k.colorKey])}"></span>` : "";
    const artHtml = k.art ? artStrip(e.id, 6) : "";
    return `<div class="card${errs.length ? " err" : ""}"><h3>${color}${esc(e.label)}</h3>
      <div class="id">${esc(e.id ?? "#" + e.n)}${k.sources.length > 1 ? " · " + esc(k.sources[e.src].label) : ""}</div>
      ${artHtml}<div class="sum">${sum}</div>${errs.length ? `<div class="errs">${errs.slice(0, 3).map(esc).join("<br>")}</div>` : ""}
      <div class="acts"><button class="btn small" data-edit="${e.src}|${esc(e.key)}">Edit</button><button class="btn small ghost" data-dup="${e.src}|${esc(e.key)}">Duplicate</button><button class="btn small ghost" data-send-entry="${name}|${e.src}|${esc(e.key)}" title="Send a task about it to Claude">Send to Claude</button>${play ? `<a class="btn small ghost" target="_blank" rel="noopener" href="${esc(play)}" title="Start the game with it">▶ Play</a>` : ""}</div></div>`;
  }).join("");
  return `<div class="toolbar"><strong>${esc(k.title)}</strong><span class="dim">${list.length} of ${k.entries.length}</span></div><div class="grid">${cards || '<p class="dim">Nothing matches.</p>'}</div>`;
}

// ---------------- the editor ----------------

const pathKey = p => JSON.stringify(p);
function hintAt(kind, path) {
  const h = hintsOf(kind), dotted = path.filter(p => typeof p === "string").join(".");
  return h[dotted] ?? {};
}
function enumOf(kind, hint) {
  if (hint.values) return hint.values;
  if (hint.enum) return C.unions[hint.enum] ?? null;
  if (hint.ref) return ids(hint.ref);
  return null;
}

function openEditor(kind, entry, asCopy) {
  const k = kindOf(kind);
  let value = clone(entry ? entry.data : entriesOf(kind)[0]?.data);
  let key = entry && !asCopy ? entry.key : "";
  if (asCopy || !entry) {
    if (k.idKey && isObj(value)) value[k.idKey] = "";
    if (k.labelKey && isObj(value) && typeof value[k.labelKey] === "string" && k.labelKey !== k.idKey) value[k.labelKey] = asCopy ? value[k.labelKey] + " (copy)" : "";
  }
  editor = { kind, entry: asCopy ? null : entry, like: entry ? entry.key : entriesOf(kind)[0]?.key, likeSrc: entry ? entry.src : 0, value, key, original: clone(value), json: false };
  drawEditor();
}

function field(kind, path, desc, value, orig) {
  const hint = hintAt(kind, path), name = path[path.length - 1], id = pathKey(path);
  const missing = value === undefined, help = hint.help ? `<div class="help">${esc(hint.help)}</div>` : "";
  const wrap = inner => `<div class="field${missing ? " missing" : ""}"><label>${esc(name)}</label><div>${inner}</div>${help}</div>`;
  const opts = enumOf(kind, hint);
  const attrs = (t, extra = "") => `data-path='${esc(id)}' data-t="${t}" ${orig === null ? 'data-null="1"' : ""} ${extra}`;
  if (hint.keys || hint.keysRef) {
    const keys = hint.keys ? C.unions[hint.keys] ?? [] : ids(hint.keysRef);
    const all = [...new Set([...keys, ...Object.keys(isObj(value) ? value : {})])];
    return wrap(`<div class="kv">${all.map(k2 => `<label><span>${esc(k2)}</span><input type="text" ${attrs("kv")} data-k="${esc(k2)}" value="${esc(isObj(value) && value[k2] !== undefined ? (typeof value[k2] === "object" ? JSON.stringify(value[k2]) : value[k2]) : "")}"></label>`).join("")}</div>`);
  }
  if (desc.t === "obj" && (value === undefined || isObj(value))) {
    const inner = [...desc.fields].map(([k2, d2]) => field(kind, [...path, k2], d2, value?.[k2], orig?.[k2])).join("");
    return `<fieldset><legend>${esc(name)}</legend>${inner}</fieldset>${help}`;
  }
  if (desc.t === "arr" && (value === undefined || Array.isArray(value)) && desc.of.t === "str" && opts) {
    const vals = [...new Set([...opts, ...(value ?? [])])];
    return wrap(`<div class="checks" ${attrs("set")}>${vals.map(o => `<label><input type="checkbox" value="${esc(o)}" ${(value ?? []).includes(o) ? "checked" : ""}>${esc(o)}</label>`).join("")}</div>`);
  }
  if (desc.t === "arr" && (value === undefined || Array.isArray(value)) && desc.of.t === "str") {
    const long = (value ?? []).length > 3 || name === "grid";
    return wrap(`<textarea class="mono" rows="${Math.min(14, Math.max(2, (value ?? []).length))}" ${attrs("lines")}>${esc((value ?? []).join("\n"))}</textarea><div class="help">${long ? "One per line." : "One per line."}</div>`);
  }
  if (desc.t === "arr" && (value === undefined || Array.isArray(value)) && desc.of.t === "num") {
    return wrap(`<input type="text" ${attrs("nums")} value="${esc((value ?? []).join(", "))}" placeholder="numbers, comma separated">`);
  }
  if (Array.isArray(value) && value.length && value.every(isRow)) {   // [["sporeling", 2], ...]: one row a line
    return wrap(`<textarea class="mono" rows="${Math.min(12, value.length + 1)}" ${attrs("rows")}>${esc(value.map(r => r.join(" ")).join("\n"))}</textarea><div class="help">One a line, values separated by spaces${hint.help ? "" : " (e.g. <span class=mono>" + esc(value[0].join(" ")) + "</span>)"}.</div>`);
  }
  if (desc.t === "num" && (value === undefined || typeof value === "number")) return wrap(`<input type="number" step="any" ${attrs("num")} value="${esc(value ?? "")}">`);
  if (desc.t === "bool" && (value === undefined || typeof value === "boolean")) {
    return wrap(`<select ${attrs("bool")}><option value="">(unset)</option><option value="true" ${value === true ? "selected" : ""}>true</option><option value="false" ${value === false ? "selected" : ""}>false</option></select>`);
  }
  if (desc.t === "str" && (value === undefined || value === null || typeof value === "string")) {
    if (opts) {
      const vals = [...new Set([...opts, ...(value ? [value] : [])])];
      return wrap(`<select ${attrs("str")}><option value="">(unset)</option>${vals.map(o => `<option ${o === value ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`);
    }
    const long = hint.text || (value ?? "").length > 70 || desc.values.some(v => v.length > 90);
    if (long) return wrap(`<textarea rows="3" ${attrs("str")}>${esc(value ?? "")}</textarea>`);
    const colour = desc.values.length && desc.values.every(v => /^#[0-9a-f]{6}$/i.test(v));
    const list = !colour && desc.values.length > 1 && desc.values.length <= 40 ? `list="dl-${esc(id)}"` : "";
    const dl = list ? `<datalist id="dl-${esc(id)}">${desc.values.map(v => `<option value="${esc(v)}">`).join("")}</datalist>` : "";
    return wrap(`<div class="row">${colour ? `<input type="color" value="${esc(value || "#000000")}" data-mirror='${esc(id)}'>` : ""}<input type="text" ${attrs("str", list)} value="${esc(value ?? "")}"></div>${dl}`);
  }
  return wrap(`<textarea class="mono" rows="${Math.min(10, Math.max(2, JSON.stringify(value ?? null).length / 90 + 1 | 0))}" ${attrs("json")}>${esc(value === undefined ? "" : JSON.stringify(value))}</textarea><div class="help">JSON</div>`);
}

function drawEditor() {
  const { kind, entry, value } = editor, k = kindOf(kind);
  const desc = describe(entriesOf(kind).map(e => e.data));
  let body;
  if (editor.json) body = `<textarea id="rawjson" class="mono" rows="24">${esc(JSON.stringify(value, null, 2))}</textarea>`;
  else if (desc.t === "obj" && isObj(value)) body = [...desc.fields].map(([f, d]) => field(kind, [f], d, value[f], editor.original?.[f])).join("");
  else body = field(kind, ["value"], describe([value]), value, editor.original);
  const idRow = k.shape === "map" ? `<div class="field"><label>id</label><div><input type="text" id="mapkey" value="${esc(editor.key)}" placeholder="camelCase id"></div><div class="help">The key in ${esc(k.sources[0].file)}${k.sources[0].path ? " › " + esc(k.sources[0].path.join(".")) : ""}.</div></div>` : "";
  const srcRow = !entry && k.sources.length > 1 ? `<div class="field"><label>file</label><div><select id="srcsel">${k.sources.map((s, i) => `<option value="${i}" ${i === editor.likeSrc ? "selected" : ""}>${esc(s.label ?? s.file)}</option>`).join("")}</select></div></div>` : "";
  const play = entry ? playUrl(k, entry) : null;
  $("#modal").innerHTML = `<div class="dialog"><h2>${entry ? "Edit" : "New"} ${esc(k.title.replace(/s$/, "").toLowerCase())}: ${esc(entry ? entry.label : "")}
      <span class="dim mono" style="font-size:12px">${entry ? esc(k.sources[entry.src].file) : ""}</span>
      <span style="margin-left:auto"><button class="btn small ${editor.json ? "" : "primary"}" data-mode="form">Form</button> <button class="btn small ${editor.json ? "primary" : ""}" data-mode="json">JSON</button></span></h2>
    <div class="cols"><div>${idRow}${srcRow}${body}<div id="edmsg"></div></div>
    <div class="side">${entry && entry.id ? `<h4>Used by</h4><div id="refs" class="dim">looking…</div>` : entry ? '<p class="dim">Known by its position in the file.</p>' : '<p class="dim">Laid out like the entry it starts from, so the file keeps its style.</p>'}
      ${play ? `<h4>Play-test</h4><a class="btn small" target="_blank" rel="noopener" href="${esc(play)}">▶ Start the game with it</a>` : ""}
      ${k.art && entry ? artPanel(entry.id) : k.art ? '<h4>Art</h4><p class="dim">A new building needs a sprite: the game draws nothing for it until one is drawn in code or imported from a painting (asset prompts and pipelines: iteration 89).</p>' : ""}
      ${entry && errorsFor(kind, entry).length ? `<h4>Problems</h4><div class="err-text">${errorsFor(kind, entry).map(esc).join("\n")}</div>` : ""}</div></div>
    <div class="foot"><span class="left">${entry ? `<button class="btn danger" data-delete>Delete</button><button class="btn ghost" data-dupe>Duplicate</button><button class="btn ghost" data-send-entry="${kind}|${entry.src}|${esc(entry.key)}">Send to Claude</button>` : ""}</span>
      <button class="btn ghost" data-close>Cancel</button><button class="btn" data-preview>Preview change</button><button class="btn primary" data-save>${entry ? "Save" : "Create"}</button></div></div>`;
  $("#modal").hidden = false;
  if (entry && entry.id) api(`/api/refs?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(entry.id)}`).then(r => {
    const el = $("#refs"); if (!el) return;
    const items = [...r.data.map(x => x.kind ? `<li><a data-goto="${esc(x.kind)}|${x.src}|${esc(x.key)}">${esc(x.where)}</a></li>` : `<li>${esc(x.where)}</li>`), ...r.code.map(x => `<li class="mono">${esc(x.file)} (${x.count})</li>`)];
    el.innerHTML = items.length ? `<ul>${items.join("")}</ul>` : "Nothing uses it.";
  }).catch(() => { const el = $("#refs"); if (el) el.textContent = "—"; });
}

/** The value the form describes: the original with every control's value set, or removed where emptied. */
function readForm() {
  const { kind } = editor;
  if (editor.json) return JSON.parse($("#rawjson").value);
  const k = kindOf(kind);
  const desc = describe(entriesOf(kind).map(e => e.data));
  let out = clone(editor.value);
  const wrapped = !(desc.t === "obj" && isObj(out));
  if (wrapped) out = { value: out };
  const set = (path, v) => {
    let o = out;
    for (const p of path.slice(0, -1)) { if (!isObj(o[p])) o[p] = {}; o = o[p]; }
    if (v === undefined) delete o[path[path.length - 1]]; else o[path[path.length - 1]] = v;
  };
  const get = path => path.reduce((o, p) => o?.[p], out);
  const kv = new Map();
  for (const el of document.querySelectorAll("#modal [data-path]")) {
    const path = JSON.parse(el.dataset.path), t = el.dataset.t, wasNull = el.dataset.null === "1";
    const empty = wasNull ? null : undefined;
    if (t === "kv") { const m = kv.get(el.dataset.path) ?? { path, o: {} }; kv.set(el.dataset.path, m); if (el.value.trim() !== "") m.o[el.dataset.k] = parseLoose(el.value); continue; }
    if (t === "num") set(path, el.value === "" ? empty : Number(el.value));
    else if (t === "bool") set(path, el.value === "" ? empty : el.value === "true");
    else if (t === "str") set(path, el.value === "" ? (get(path) === "" ? "" : empty) : el.value);
    else if (t === "lines") { const v = el.value.split("\n").map(s => s.replace(/\r$/, "")); set(path, el.value === "" ? (Array.isArray(get(path)) ? [] : undefined) : v); }
    else if (t === "nums") set(path, el.value.trim() === "" ? (Array.isArray(get(path)) ? [] : undefined) : el.value.split(",").map(s => Number(s.trim())));
    else if (t === "set") {   // ticked values keep the order they had, new ones after
      const on = [...el.querySelectorAll("input:checked")].map(i => i.value), was = Array.isArray(get(path)) ? get(path) : [];
      const v = [...was.filter(x => on.includes(x)), ...on.filter(x => !was.includes(x))];
      set(path, v.length || Array.isArray(get(path)) ? v : undefined);
    }
    else if (t === "rows") set(path, el.value.split("\n").map(l => l.trim()).filter(Boolean).map(l => l.split(/\s+/).map(x => x === "true" || x === "false" ? x === "true" : x !== "" && !isNaN(Number(x)) ? Number(x) : x)));
    else if (t === "json") { if (el.value.trim() === "") set(path, undefined); else { try { set(path, JSON.parse(el.value)); } catch { throw new Error(`${path.join(".")}: not valid JSON`); } } }
  }
  for (const { path, o } of kv.values()) {
    // keep the original key order, new keys after
    const before = get(path), merged = {};
    if (isObj(before)) for (const k2 of Object.keys(before)) if (k2 in o) merged[k2] = o[k2];
    for (const k2 of Object.keys(o)) if (!(k2 in merged)) merged[k2] = o[k2];
    set(path, Object.keys(merged).length || isObj(before) ? merged : undefined);
  }
  pruneEmpty(out, wrapped ? { value: editor.original } : editor.original);
  if (k.idKey && isObj(out) && !wrapped && out[k.idKey] === undefined) out[k.idKey] = "";
  return wrapped ? out.value : out;
}
/** A short list of plain values without spaces, as in a weighted table row. */
function isRow(r) { return Array.isArray(r) && r.length >= 2 && r.length <= 4 && r.every(x => typeof x === "number" || typeof x === "boolean" || (typeof x === "string" && x && !/\s/.test(x) && isNaN(Number(x)))); }
function parseLoose(s) { try { return JSON.parse(s); } catch { return s; } }
/** Objects the form made empty that weren't there before go again. */
function pruneEmpty(v, orig) {
  if (!isObj(v)) return;
  for (const [k, x] of Object.entries(v)) {
    if (isObj(x)) { pruneEmpty(x, orig?.[k]); if (!Object.keys(x).length && !isObj(orig?.[k])) delete v[k]; }
  }
}

function request(data) {
  const { kind, entry } = editor, k = kindOf(kind);
  if (entry) return { kind, src: entry.src, key: entry.key, hash: entry.hash, data, newKey: k.shape === "map" && $("#mapkey").value.trim() !== entry.key ? $("#mapkey").value.trim() : undefined };
  const src = $("#srcsel") ? Number($("#srcsel").value) : editor.likeSrc;
  return { kind, src, data, key: k.shape === "map" ? $("#mapkey").value.trim() : undefined, like: src === editor.likeSrc ? editor.like : undefined };
}
function showMsg(html) { const el = $("#edmsg"); if (el) el.innerHTML = html; }

async function preview() {
  try {
    const data = readForm();
    if (!editor.entry) { showMsg(`<pre class="diff">${esc(JSON.stringify(data, null, 2))}</pre><p class="dim">A new entry, added at the end of its file.</p>`); return; }
    const r = await api("/api/preview", request(data));
    showMsg(r.result.diff ? `<pre class="diff">${r.result.diff.split("\n").map(l => `<span class="${l.startsWith("+") && !l.startsWith("+++") ? "add" : l.startsWith("-") && !l.startsWith("---") ? "del" : ""}">${esc(l)}</span>`).join("\n")}</pre>` : '<p class="dim">No change.</p>');
  } catch (e) { showMsg(`<p class="err-text">${esc(e.message)}</p>`); }
}

async function save() {
  try {
    const data = readForm(), wasNew = !editor.entry;
    const r = await api(wasNew ? "/api/create" : "/api/save", request(data));
    S.validation = r.validation;
    const n = r.validation ? r.validation.checks.reduce((a, c) => a + c.errors.length, 0) : 0;
    toast(`${wasNew ? "Created" : "Saved"}${n ? ` — the validators report ${n} problem${n > 1 ? "s" : ""}` : " — data valid"}`, n ? "bad" : "ok");
    closeEditor(); await refresh(true);
  } catch (e) { showMsg(`<p class="err-text">${esc(e.message)}</p>`); }
}

async function del() {
  const { kind, entry } = editor;
  if (!confirm(`Delete ${entry.label}? (Undo is in the header.)`)) return;
  try {
    const r = await api("/api/delete", { kind, src: entry.src, key: entry.key, hash: entry.hash });
    S.validation = r.validation; toast(`Deleted ${entry.label}`, "ok"); closeEditor(); await refresh(true);
  } catch (e) { showMsg(`<p class="err-text">${esc(e.message)}</p>`); }
}

function closeEditor() { editor = null; $("#modal").hidden = true; $("#modal").innerHTML = ""; if (staleWhileEditing) { staleWhileEditing = false; refresh(true); } }

// ---------------- events and polling ----------------

document.addEventListener("click", async ev => {
  const t = ev.target.closest("[data-tab],[data-edit],[data-dup],[data-undo],[data-validate],[data-mode],[data-close],[data-preview],[data-save],[data-delete],[data-dupe],[data-goto]");
  if (!ev.target.closest("#undo")) $("#undo").open = false;
  if (!t) { if (ev.target.id === "modal") closeEditor(); return; }
  const d = t.dataset;
  if (d.tab) { ev.preventDefault(); tab = d.tab; keep("tab", tab); render(); }
  const find = (kind, v) => { const [src, key] = v.split("|"); return entriesOf(kind).find(e => e.src === Number(src) && e.key === key); };
  if (d.edit) openEditor(tab, find(tab, d.edit), false);
  if (d.dup) openEditor(tab, find(tab, d.dup), true);
  if (d.goto) { const [kind, src, key] = d.goto.split("|"); tab = kind; keep("tab", tab); closeEditor(); render(); openEditor(kind, find(kind, src + "|" + key), false); }
  if (d.undo) { $("#undo").open = false; try { const r = await api("/api/undo", { i: Number(d.undo) }); S.validation = r.validation; toast(`Undone: ${r.result.undone}`, "ok"); await refresh(true); } catch (e) { toast(e.message, "bad"); } }
  if ("validate" in d) { try { const r = await api("/api/validate", {}); S.validation = r.validation; render(); } catch (e) { toast(e.message, "bad"); } }
  if (d.mode && editor) { try { editor.value = readForm(); editor.json = d.mode === "json"; drawEditor(); } catch (e) { showMsg(`<p class="err-text">${esc(e.message)}</p>`); } }
  if ("close" in d) closeEditor();
  if ("preview" in d) preview();
  if ("save" in d) save();
  if ("delete" in d) del();
  if ("dupe" in d) openEditor(editor.kind, editor.entry, true);
});
document.addEventListener("input", ev => {
  const m = ev.target.dataset?.mirror;
  if (m) { const t = [...document.querySelectorAll("#modal [data-path]")].find(x => x.dataset.path === m); if (t) t.value = ev.target.value; }
  if (ev.target.id === "q") { keep("q", ev.target.value); render(); }
});
$("#new").addEventListener("click", () => kindOf(tab) && openEditor(tab, null, false));
document.addEventListener("keydown", ev => {
  if (ev.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") { ev.preventDefault(); $("#q").focus(); }
  if (ev.key === "Escape" && editor) closeEditor();
  if ((ev.ctrlKey || ev.metaKey) && ev.key === "s" && editor) { ev.preventDefault(); save(); }
});

async function refresh(force) {
  try {
    const st = await api("/api/state");
    const changed = force || !C || st.sig !== S.sig;
    S = { ...st, validation: st.validation ?? S.validation };
    if (changed) {
      if (editor && !force) staleWhileEditing = true;
      else { C = await api("/api/content"); S.sig = C.sig; }
    }
    $("#fresh").textContent = "updated " + new Date().toLocaleTimeString();
    if (!editor) render(); else renderChip();
  } catch (e) { $("#fresh").textContent = "board offline: " + e.message; }
}
$("#q").value = load("q", "");
refresh(true);
setInterval(() => refresh(false), 10000);
