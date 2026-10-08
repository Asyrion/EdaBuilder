/* The dev board's GitHub side (iteration 88, DESIGN 4.119): milestones, issues and labels of the repository the checkout
   pushes to, through the logged-in `gh` CLI (`gh api`), cached for 12 s; on an error the last good data is kept and marked
   stale, so the board stays usable offline. Writes (issues, comments, milestones) go through the same CLI. */
import { execFileSync } from 'node:child_process';

export class GhError extends Error {}
const CACHE_MS = 12000;

export function repoOf(root: string): string {
  const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' }).trim();
  const m = /github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?$/i.exec(url) ?? /\/git\/([^/]+\/[^/.]+?)(?:\.git)?$/.exec(url);
  if (!m) throw new GhError(`origin is not a GitHub repository: ${url}`);
  return m[1];
}

/** `gh api <args>` with an optional JSON body on stdin; the parsed answer (null for an empty one). */
export function gh(args: string[], body?: unknown, cwd?: string): unknown {
  try {
    const out = execFileSync('gh', ['api', ...args, ...(body !== undefined ? ['--input', '-'] : [])],
      { cwd, input: body !== undefined ? JSON.stringify(body) : undefined, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    return out ? JSON.parse(out) : null;
  } catch (e) {
    const err = e as { code?: string; stderr?: string; message: string };
    if (err.code === 'ENOENT') throw new GhError('the GitHub CLI (gh) is not installed: winget install GitHub.cli, then gh auth login');
    throw new GhError((err.stderr || err.message).trim().split('\n').slice(-3).join(' '));
  }
}
const all = (path: string, cwd: string) => ((gh([path, '--paginate', '--slurp'], undefined, cwd) as unknown[][]) ?? []).flat() as Record<string, any>[];

let cache: { at: number; data: unknown; fetched: number } | null = null;

export function githubState(root: string, force = false) {
  const repo = repoOf(root);
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return { repo, ...(cache.data as object), fetched: cache.fetched };
  try {
    const milestones = all(`repos/${repo}/milestones?state=all&per_page=100`, root);
    const issues = all(`repos/${repo}/issues?state=all&per_page=100`, root);
    const labels = all(`repos/${repo}/labels?per_page=100`, root);
    const data = {
      milestones: milestones.map((m) => ({ number: m.number, title: m.title, description: m.description ?? '', state: m.state,
        open: m.open_issues, closed: m.closed_issues, url: m.html_url, due: (m.due_on ?? '').slice(0, 10) })),
      issues: issues.filter((i) => !i.pull_request).map((i) => ({ number: i.number, title: i.title, body: i.body ?? '', state: i.state,
        labels: (i.labels ?? []).map((l: { name: string }) => l.name), milestone: i.milestone?.number ?? null, url: i.html_url,
        updated: i.updated_at, comments: i.comments })),
      labels: labels.map((l) => ({ name: l.name, color: l.color })),
    };
    cache = { at: Date.now(), data, fetched: Date.now() };
    return { repo, ...data, fetched: cache.fetched };
  } catch (e) {
    if (cache) return { repo, ...(cache.data as object), fetched: cache.fetched, stale: true, error: (e as Error).message };
    return { repo, milestones: [], issues: [], labels: [], fetched: 0, error: (e as Error).message };
  }
}
export function invalidateGithub() { if (cache) cache.at = 0; }

const str = (v: unknown) => String(v ?? '').trim();

export function issueWrite(root: string, d: Record<string, unknown>) {
  const repo = repoOf(root);
  const p: Record<string, unknown> = {};
  for (const k of ['title', 'body', 'state'] as const) if (d[k] !== undefined) p[k] = str(d[k]);
  if (Array.isArray(d.labels)) p.labels = d.labels.map(str).filter(Boolean);
  if (d.milestone !== undefined) p.milestone = d.milestone ? Number(d.milestone) : null;
  if (p.state === 'closed') p.state_reason = 'completed';
  invalidateGithub();
  if (d.number) return (gh([`repos/${repo}/issues/${Number(d.number)}`, '-X', 'PATCH'], p, root) as { number: number }).number;
  if (!p.title) throw new GhError('An issue needs a title.');
  if (p.milestone === null) delete p.milestone;
  const r = gh([`repos/${repo}/issues`, '-X', 'POST'], p, root) as { number: number; html_url: string };
  return { number: r.number, url: r.html_url };
}

export function issueComment(root: string, n: number, body: string, close: boolean) {
  const repo = repoOf(root);
  if (!body.trim()) throw new GhError('The comment is empty.');
  gh([`repos/${repo}/issues/${n}/comments`, '-X', 'POST'], { body }, root);
  if (close) gh([`repos/${repo}/issues/${n}`, '-X', 'PATCH'], { state: 'closed', state_reason: 'completed' }, root);
  invalidateGithub();
  return { commented: n, closed: close };
}

export function milestoneWrite(root: string, d: Record<string, unknown>) {
  const repo = repoOf(root);
  invalidateGithub();
  if (d.number) return (gh([`repos/${repo}/milestones/${Number(d.number)}`, '-X', 'PATCH'], { state: str(d.state) || 'closed' }, root) as { number: number }).number;
  if (!str(d.title)) throw new GhError('A milestone needs a title.');
  return (gh([`repos/${repo}/milestones`, '-X', 'POST'], { title: str(d.title), description: str(d.description) }, root) as { number: number }).number;
}

/** The label the board's issues carry, made once if the repository lacks it. */
export function ensureLabel(root: string, name: string) {
  const repo = repoOf(root);
  try { gh([`repos/${repo}/labels/${encodeURIComponent(name)}`], undefined, root); }
  catch { gh([`repos/${repo}/labels`, '-X', 'POST'], { name, color: '7a4fd0', description: 'A task sent from the dev board' }, root); }
}
