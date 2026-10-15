// EdaBuilder dev board, the project side (iteration 88, DESIGN 4.119): the Next steps, GitHub and Balance tabs, the
// Send to Claude dialog (Claude Code on this PC, a GitHub issue, or copy), and the "New game element" composer. Uses $,
// esc, api, toast, C, kindOf, entriesOf, errorsFor, artOf and openEditor from app.js.
"use strict";

const ProjectUI = (() => {
  const TABS = [["next", "Next steps"], ["github", "GitHub"], ["balance", "Balance"]];
  let T = null, G = null, gFilter = { state: "open", milestone: "", label: "" }, loading = {};
  const PROCESS = "Read CLAUDE.md and docs/HANDOFF.md first, and follow the standing process: plan it on the Plan panel and wait for my approval, name the DESIGN section it implements, run the verification bar, and keep the docs current.";

  const handles = tab => TABS.some(([id]) => id === tab);

  async function load(what, force) {
    if (loading[what]) return;
    loading[what] = true;
    try {
      if (what === "tracker") T = await api("/api/tracker");
      if (what === "github") G = await api("/api/github" + (force ? "?force=1" : ""));
    } catch (e) { if (what === "github") G = { error: e.message, milestones: [], issues: [], labels: [] }; else T = { error: e.message }; }
    loading[what] = false;
    if (handles(tab)) render(tab, true);
  }

  // ---------------- Next steps ----------------
  function renderNext() {
    if (!T) { load("tracker"); return '<p class="dim">Reading docs/NEXT_STEPS.md…</p>'; }
    if (T.error) return `<p class="err-text">${esc(T.error)}</p>`;
    const sec = ids => ids.map(id => `<a class="chip" data-design="${esc(id.slice(1))}">${esc(id)}</a>`).join(" ");
    const open = T.open.map(o => `<div class="card"><h3><span class="n-badge">${o.n}</span> ${esc(o.title)}</h3><div class="small">${esc(o.text)}</div>
      <div class="acts">${sec(o.design)}<button class="btn small" data-send-next="${o.n}">Send to Claude</button></div></div>`).join("");
    const done = T.done.map(d => `<details class="done"><summary><b>Iteration ${d.n}</b> ${esc(d.title)} ${sec(d.design)}</summary><ul>${d.bullets.map(b => `<li>${esc(b)}</li>`).join("")}</ul></details>`).join("");
    return `<div class="toolbar"><strong>Next steps</strong><span class="dim">docs/NEXT_STEPS.md, in the user's order</span><button class="btn small ghost" data-reload="tracker">Reload</button></div>
      <div class="grid one">${open}</div><h2>Done</h2><div class="donelist">${done}</div>`;
  }
  const nextTask = o => `Read CLAUDE.md and docs/HANDOFF.md, then continue with the next item in docs/NEXT_STEPS.md: ${o.title}. Plan it on the Plan panel first.\n\n(From the dev board. The item as the list has it: ${o.n}. ${o.title}. ${o.text})`;

  async function showDesign(id) {
    try {
      const r = await api("/api/design/" + id);
      $("#modal").innerHTML = `<div class="dialog"><h2>DESIGN §${esc(r.id)}</h2><pre class="design">${esc(r.text)}</pre><div class="foot"><button class="btn primary" data-close>Close</button></div></div>`;
      $("#modal").hidden = false;
    } catch (e) { toast(e.message, "bad"); }
  }

  // ---------------- GitHub ----------------
  function renderGithub() {
    if (!G) { load("github"); return '<p class="dim">Asking GitHub (gh)…</p>'; }
    const err = G.error ? `<div class="banner">${G.stale ? "Showing the last good data: " : ""}${esc(G.error)}</div>` : "";
    const ms = G.milestones.map(m => `<option value="${m.number}" ${String(m.number) === gFilter.milestone ? "selected" : ""}>${esc(m.title)} (${m.open} open)</option>`).join("");
    const labels = G.labels.map(l => `<option ${l.name === gFilter.label ? "selected" : ""}>${esc(l.name)}</option>`).join("");
    const list = G.issues.filter(i => (gFilter.state === "all" || i.state === gFilter.state) && (!gFilter.milestone || String(i.milestone) === gFilter.milestone) && (!gFilter.label || i.labels.includes(gFilter.label)));
    const msCards = G.milestones.filter(m => m.state === "open").map(m => `<div class="card"><h3>${esc(m.title)}</h3><div class="small dim">${esc(m.description)}</div>
      <div class="bar"><span style="width:${m.open + m.closed ? Math.round(100 * m.closed / (m.open + m.closed)) : 0}%"></span></div><div class="small">${m.closed} closed · ${m.open} open</div>
      <div class="acts"><a class="btn small ghost" target="_blank" rel="noopener" href="${esc(m.url)}">GitHub</a>${m.open ? "" : `<button class="btn small" data-close-ms="${m.number}">Close milestone</button>`}</div></div>`).join("");
    const rows = list.map(i => `<div class="card"><h3><span class="n-badge">#${i.number}</span> ${esc(i.title)}</h3>
      <div class="small dim">${i.state}${i.labels.length ? " · " + i.labels.map(esc).join(", ") : ""}${i.comments ? ` · ${i.comments} comment${i.comments > 1 ? "s" : ""}` : ""}</div>
      ${i.body ? `<div class="small clip">${esc(i.body.slice(0, 280))}</div>` : ""}
      <div class="acts"><button class="btn small" data-send-issue="${i.number}">Send to Claude</button><button class="btn small ghost" data-issue-edit="${i.number}">Edit</button><button class="btn small ghost" data-issue-comment="${i.number}">Comment</button><a class="btn small ghost" target="_blank" rel="noopener" href="${esc(i.url)}">GitHub</a></div></div>`).join("");
    return `<div class="toolbar"><strong>GitHub</strong><span class="dim">${esc(G.repo || "")}${G.fetched ? " · " + new Date(G.fetched).toLocaleTimeString() : ""}</span>
        <button class="btn small" data-issue-edit="new">New issue</button><button class="btn small ghost" data-ms-new>New milestone</button><button class="btn small ghost" data-reload="github">Reload</button></div>${err}
      ${msCards ? `<h2>Open milestones</h2><div class="grid">${msCards}</div>` : ""}
      <h2>Issues</h2><div class="toolbar"><select data-gf="state"><option value="open" ${gFilter.state === "open" ? "selected" : ""}>open</option><option value="closed" ${gFilter.state === "closed" ? "selected" : ""}>closed</option><option value="all" ${gFilter.state === "all" ? "selected" : ""}>all</option></select>
        <select data-gf="milestone"><option value="">any milestone</option>${ms}</select><select data-gf="label"><option value="">any label</option>${labels}</select><span class="dim">${list.length} issues</span></div>
      <div class="grid">${rows || '<p class="dim">No issues match.</p>'}</div>`;
  }
  const issueTask = i => `${PROCESS}\n\nWork with me on GitHub issue #${i.number} of ${G.repo}: ${i.title}\n${i.url}\n\n${i.body || "(no description)"}`;

  function issueForm(n) {
    const i = n === "new" ? { title: "", body: "", labels: [], milestone: null } : G.issues.find(x => x.number === Number(n));
    $("#modal").innerHTML = `<div class="dialog"><h2>${n === "new" ? "New issue" : "Edit issue #" + i.number}</h2>
      <div class="field"><label>Title</label><div><input type="text" id="it" value="${esc(i.title)}"></div></div>
      <div class="field"><label>Body</label><div><textarea id="ib" rows="8">${esc(i.body)}</textarea></div></div>
      <div class="field"><label>Milestone</label><div><select id="im"><option value="">none</option>${G.milestones.filter(m => m.state === "open").map(m => `<option value="${m.number}" ${m.number === i.milestone ? "selected" : ""}>${esc(m.title)}</option>`).join("")}</select></div></div>
      <div class="field"><label>Labels</label><div class="checks">${G.labels.map(l => `<label><input type="checkbox" value="${esc(l.name)}" ${i.labels.includes(l.name) ? "checked" : ""}>${esc(l.name)}</label>`).join("")}</div></div>
      <div class="foot">${n === "new" ? "" : `<span class="left"><button class="btn danger" data-issue-close="${i.number}">${i.state === "open" ? "Close issue" : "Reopen"}</button></span>`}<button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-issue-save="${n}">Save</button></div></div>`;
    $("#modal").hidden = false;
  }
  async function issueSave(n) {
    const d = { title: $("#it").value, body: $("#ib").value, milestone: $("#im").value || null, labels: [...document.querySelectorAll("#modal .checks input:checked")].map(x => x.value) };
    if (n !== "new") d.number = Number(n);
    try { const r = await api("/api/github/issue", d); toast(n === "new" ? `Created #${r.result.number}` : "Saved", "ok"); closeEditor(); load("github", true); }
    catch (e) { toast(e.message, "bad"); }
  }

  // ---------------- Balance ----------------
  function renderBalance() {
    if (!T) { load("tracker"); return '<p class="dim">Reading balance/cache…</p>'; }
    const files = T.balance?.files ?? [];
    if (!files.length) return '<p class="dim">No balance runs cached yet (balance/cache).</p>';
    const cards = files.map(f => {
      const peoples = Object.keys(f.stats);
      const max = Math.max(...peoples.map(p => f.stats[p].mean + f.stats[p].se2), 1);
      const W = 360, rowH = 26, x = v => 110 + (W - 170) * v / max;
      const bars = peoples.map((p, k) => { const s = f.stats[p], y = 8 + k * rowH;
        return `<g><title>${esc(p)}: mean ${s.mean.toLocaleString()} folk over ${s.runs} runs on ${s.seeds} seeds, ±${s.se2.toLocaleString()} (2·SE of the seed means)</title>
          <text x="104" y="${y + 13}" text-anchor="end" class="ax">${esc(p)}</text>
          <rect x="110" y="${y + 4}" width="${Math.max(2, x(s.mean) - 110)}" height="12" rx="4" class="bar-mark"></rect>
          <line x1="${x(Math.max(0, s.mean - s.se2))}" x2="${x(s.mean + s.se2)}" y1="${y + 10}" y2="${y + 10}" class="whisker"></line>
          <text x="${x(s.mean + s.se2) + 6}" y="${y + 14}" class="val">${s.mean.toLocaleString()}</text></g>`; }).join("");
      const table = peoples.map(p => `<tr><td>${esc(p)}</td>${Object.entries(f.peoples[p].seeds).map(([seed, runs]) => `<td title="seed ${seed}">${runs.map(r => `${r.folk.toLocaleString()}<span class="dim"> ${esc(r.gate)}</span>`).join("<br>")}</td>`).join("")}</tr>`).join("");
      const seeds = Object.keys(f.peoples[peoples[0]]?.seeds ?? {});
      return `<div class="card wide"><h3>${f.current ? '<span class="chip ok">this tree</span>' : ""} <span class="mono">${esc(f.sim)}</span> <span class="dim small">${f.runs} runs${f.created ? " · " + esc(String(f.created).slice(0, 16)) : ""}</span></h3>
        <svg class="chart" viewBox="0 0 ${W} ${peoples.length * rowH + 12}" role="img" aria-label="Mean folk per people">${bars}</svg>
        <details><summary class="small">Runs by seed (folk, last gate)</summary><div class="scroll"><table class="over small"><tr><th>people</th>${seeds.map(s => `<th>seed ${esc(s)}</th>`).join("")}</tr>${table}</table></div></details></div>`;
    }).join("");
    return `<div class="toolbar"><strong>Balance</strong><span class="dim">the bar's cached runs (balance/cache), newest first; the tree's sim key is <span class="mono">${esc(T.balance.treeSim || "?")}</span></span><button class="btn small ghost" data-reload="tracker">Reload</button></div>
      <p class="dim small">Mean folk per people at day 150, with 2·SE of the seed means. The bar's own verdict pairs runs by seed against main: run <span class="mono">npx tsx scripts/table.ts --bar wide --compare origin/main</span>.</p><div class="grid">${cards}</div>`;
  }

  // ---------------- Send to Claude ----------------
  function sendDialog(title, text) {
    $("#modal").innerHTML = `<div class="dialog"><h2>Send to Claude</h2>
      <div class="field"><label>Title</label><div><input type="text" id="st" value="${esc(title)}"></div><div class="help">For a GitHub issue.</div></div>
      <div class="field"><label>Task</label><div><textarea id="sx" rows="14" class="mono">${esc(text)}</textarea></div></div>
      <div id="smsg"></div>
      <div class="foot"><button class="btn ghost" data-close>Cancel</button><button class="btn" data-send-copy>Copy</button><button class="btn" data-send-to="issue">GitHub issue</button><button class="btn primary" data-send-to="pc">Claude Code on this PC</button></div></div>`;
    $("#modal").hidden = false;
  }
  async function send(to) {
    const text = $("#sx").value, title = $("#st").value, msg = h => { $("#smsg").innerHTML = h; };
    try {
      const r = await api("/api/send", { to, text, title, id: title });
      if (to === "issue") msg(`<p class="banner">Created <a target="_blank" rel="noopener" href="${esc(r.result.url)}">issue #${r.result.number}</a> (label dev-board). Start a cloud session on it from there.</p>`);
      else msg(`<p class="banner">${r.result.how === "link" ? "A new Claude Code session opened with the task typed in. Read it there and press Enter to start." : "A new terminal opened a Claude Code session in this checkout with the task. Continue there."}${r.result.file ? ` The task is also in <span class="mono">${esc(r.result.file)}</span>.` : ""}</p>`);
      toast(to === "issue" ? "Issue created" : "Sent to Claude Code", "ok");
      if (to === "issue") load("github", true);
    } catch (e) {
      let copied = false;
      try { await navigator.clipboard.writeText(text); copied = true; } catch { /* no clipboard */ }
      msg(e.message === "NO_CLI"
        ? `<p class="err-text">The Claude Code CLI isn't installed, so no session could be opened.${copied ? " The task is on your clipboard: paste it into a new Code session." : ""} To let this button open sessions by itself, install it once (PowerShell: winget install Anthropic.ClaudeCode), run claude once in this folder, then send again.</p>`
        : `<p class="err-text">${esc(e.message)}${copied ? " The task is on your clipboard." : ""}</p>`);
    }
  }
  /** The task for a content entry: what it is, where it lives, what the board knows of it. */
  function entryTask(kind, e) {
    const k = kindOf(kind), errs = errorsFor(kind, e), a = k.art ? artOf(e.id) : null;
    const art = a ? `\nArt: ${a.looks.length ? a.looks.map(l => `${l.name} (${l.from})`).join(", ") : "no sprite yet"}${a.drawnBase ? "" : "; needs a b_" + e.id + " sprite drawn in code (tests/sprites.test.ts)"}${a.sources.length ? "; art/sources.json: " + a.sources.map(s => s.name + (s.checked ? " checked" : " unchecked")).join(", ") : ""}.` : "";
    return `${PROCESS}\n\nWork with me on the ${k.title.toLowerCase().replace(/s$/, "")} "${e.label}" (\`${e.id ?? "#" + e.n}\`, ${k.sources[e.src].file}).${art}${errs.length ? "\nThe checks report:\n" + errs.map(x => "- " + x).join("\n") : ""}\n\nIts data:\n${JSON.stringify(e.data, null, 2)}\n\nWhat I want: [describe the change]`;
  }

  // ---------------- New game element ----------------
  const ELEMENTS = ["building", "road", "edict", "event", "quest", "creature", "other"];
  function composer() {
    $("#modal").innerHTML = `<div class="dialog"><h2>New game element</h2>
      <div class="field"><label>Kind</label><div><select id="ck">${ELEMENTS.map(x => `<option>${x}</option>`).join("")}</select></div></div>
      <div class="field"><label>Name</label><div><input type="text" id="cn" placeholder="e.g. Lantern Market"></div></div>
      <div class="field"><label>Key</label><div><input type="text" id="cy" placeholder="lower case, e.g. lanternmarket"></div><div class="help">For a building: its key in buildings.json.</div></div>
      <div class="field"><label>The idea</label><div><textarea id="ci" rows="5" placeholder="What it is, what it does in the city, why the player builds it"></textarea></div></div>
      <div class="field"><label>Numbers</label><div><input type="text" id="cm" placeholder="cost, upkeep, size, unlock milestone… if known"></div></div>
      <div class="field"><label>Peoples</label><div class="checks">${["vellish", "grimmen", "veshari", "tallowkin", "fennex"].map(p => `<label><input type="checkbox" value="${p}">${p}</label>`).join("")}</div><div class="help">None ticked: every people.</div></div>
      <div class="field"><label>Art</label><div><select id="ca"><option value="yes">wanted: a painting through the art pipeline</option><option value="code">drawn in code for now</option><option value="no">none</option></select></div></div>
      <div id="cmsg"></div>
      <div class="foot"><span class="left"><button class="btn" data-compose-create>Create the entry now</button></span><button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-compose-send>Write the task</button></div></div>`;
    $("#modal").hidden = false;
  }
  function composed(created) {
    const v = id => $(id).value.trim(), kind = v("#ck"), peoples = [...document.querySelectorAll("#modal .checks input:checked")].map(x => x.value);
    const art = { yes: "Art: wanted, a painting through the art pipeline (DESIGN §4.80–4.87; the asset pipelines are written into the docs later).", code: "Art: drawn in code for now (src/render/sprites.ts).", no: "Art: none needed." }[v("#ca")];
    return `${PROCESS}\n\nA new ${kind} for the game: ${v("#cn") || "[name]"}${v("#cy") ? ` (key \`${v("#cy")}\`)` : ""}.\n\nThe idea: ${v("#ci") || "[the idea]"}\nNumbers: ${v("#cm") || "to be proposed in the plan"}.\nPeoples: ${peoples.length ? peoples.join(", ") : "every people"}.\n${art}\n${created ? `\nThe entry already exists in src/data/content/buildings.json (made on the dev board from the Ley Spire's layout, so its numbers are placeholders). What still needs work: its numbers and rules, its sprite (the board shows "needs art"), its help and the bot, and the balance bar if it changes the sim.` : kind === "building" ? "\nAdd it to src/data/content/buildings.json (content is data, DESIGN §4.118), with its sprite and checks." : ""}\nPropose it as an iteration: where it goes in docs/NEXT_STEPS.md and which DESIGN section it gets.`;
  }
  async function composeCreate() {
    const key = $("#cy").value.trim(), name = $("#cn").value.trim();
    if ($("#ck").value !== "building") return $("#cmsg").innerHTML = '<p class="err-text">Only buildings can be made here for now; for other kinds, write the task.</p>';
    const base = entriesOf("buildings").find(e => e.id === "spire");
    if (!base || !key || !name) return $("#cmsg").innerHTML = '<p class="err-text">A building needs a name and a key.</p>';
    const peoples = [...document.querySelectorAll("#modal .checks input:checked")].map(x => x.value);
    const data = { ...base.data, key, name, desc: $("#ci").value.trim() || name, flavor: "(to be written)" };
    if (peoples.length) data.faction = peoples; else delete data.faction;
    try {
      await api("/api/create", { kind: "buildings", src: 0, data, like: "spire" });
      const text = composed(true);
      await refresh(true);
      sendDialog(`New building: ${name}`, text);
      toast(`Created ${name}: it needs art and its real numbers`, "ok");
    } catch (e) { $("#cmsg").innerHTML = `<p class="err-text">${esc(e.message)}</p>`; }
  }

  // ---------------- wiring ----------------
  function render(t, keep) {
    if (keep && tab !== t) return "";
    const html = ({ next: renderNext, github: renderGithub, balance: renderBalance })[t]();
    if (keep) $("#main").innerHTML = html;
    return html;
  }
  const tabsHtml = () => TABS.map(([id, name]) => `<button class="tab${tab === id ? " on" : ""}" data-tab="${id}">${name}</button>`).join("");

  document.addEventListener("click", ev => {
    const t = ev.target.closest("[data-design],[data-send-next],[data-reload],[data-send-issue],[data-issue-edit],[data-issue-comment],[data-issue-save],[data-issue-close],[data-close-ms],[data-ms-new],[data-send-to],[data-send-copy],[data-send-entry],[data-compose],[data-compose-send],[data-compose-create]");
    if (!t) return;
    const d = t.dataset;
    if (d.design) showDesign(d.design);
    if (d.sendNext) { const o = T.open.find(x => x.n === Number(d.sendNext)); sendDialog(o.title, nextTask(o)); }
    if (d.reload) load(d.reload, true);
    if (d.sendIssue) { const i = G.issues.find(x => x.number === Number(d.sendIssue)); sendDialog(`#${i.number} ${i.title}`, issueTask(i)); }
    if (d.issueEdit) issueForm(d.issueEdit);
    if (d.issueSave) issueSave(d.issueSave);
    if (d.issueClose) { const i = G.issues.find(x => x.number === Number(d.issueClose)); api("/api/github/issue", { number: i.number, state: i.state === "open" ? "closed" : "open" }).then(() => { closeEditor(); load("github", true); }, e => toast(e.message, "bad")); }
    if (d.issueComment) { const body = prompt(`Comment on #${d.issueComment}:`); if (body) api("/api/github/comment", { number: Number(d.issueComment), body, close: false }).then(() => { toast("Commented", "ok"); load("github", true); }, e => toast(e.message, "bad")); }
    if (d.closeMs) api("/api/github/milestone", { number: Number(d.closeMs), state: "closed" }).then(() => load("github", true), e => toast(e.message, "bad"));
    if ("msNew" in d) { const title = prompt("Milestone title:"); if (title) api("/api/github/milestone", { title, description: prompt("Its goal (optional):") || "" }).then(() => load("github", true), e => toast(e.message, "bad")); }
    if (d.sendTo) send(d.sendTo);
    if ("sendCopy" in d) navigator.clipboard.writeText($("#sx").value).then(() => toast("Copied", "ok"), () => toast("The browser refused the clipboard", "bad"));
    if (d.sendEntry) { const [kind, src, key] = d.sendEntry.split("|"); const e = entriesOf(kind).find(x => x.src === Number(src) && x.key === key); sendDialog(`${e.label}`, entryTask(kind, e)); }
    if ("compose" in d) composer();
    if ("composeSend" in d) sendDialog(`New ${$("#ck").value}: ${$("#cn").value.trim() || "untitled"}`, composed(false));
    if ("composeCreate" in d) composeCreate();
  });
  document.addEventListener("change", ev => {
    const k = ev.target.dataset?.gf;
    if (k) { gFilter[k] = ev.target.value; render("github", true); }
  });

  return { handles, render, tabsHtml, sendDialog };
})();
