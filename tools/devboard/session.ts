/* Send to Claude (iteration 88, DESIGN 4.119): a task from the board goes to Claude Code on the user's PC, or becomes a
   GitHub issue a cloud session can start from. A port of the Azyrion Tamer board's send_to_session:
   - the claude-cli:// deep link (Windows, once the CLI has registered its handler): a new session in this checkout with
     the task typed in, waiting for Enter. The link holds at most 5,000 characters of prompt, so a longer task goes to a
     file in the temp folder and the prompt points at it;
   - else, the CLI on PATH or in the WinGet and native-install folders: a new console running `claude "<task>"` (a .cmd or
     .bat shim gets only the one-line pointer, since cmd.exe cuts at newlines and reads & % ^);
   - else NO_CLI: the page copies the task to the clipboard and says how to install the CLI.
   Nothing is committed or pushed by a send. */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { ensureLabel, gh, invalidateGithub, repoOf } from './github';

const LINK_MAX = 5000;
export const ISSUE_LABEL = 'dev-board';

/** True when the Claude Code CLI has registered its claude-cli:// handler (Windows; it does after its first prompt). */
export function linkRegistered(): boolean {
  if (process.env.DEVBOARD_FAKE_LINK) return process.env.DEVBOARD_FAKE_LINK === '1';
  if (process.platform !== 'win32') return false;
  try { execFileSync('reg', ['query', 'HKCU\\Software\\Classes\\claude-cli'], { stdio: 'ignore' }); return true; } catch { return false; }
}

/** The claude CLI: on PATH, else where the WinGet and native installers put it. */
export function findClaude(): string | null {
  const names = process.platform === 'win32' ? ['claude.exe', 'claude.cmd', 'claude.bat'] : ['claude'];
  for (const dir of (process.env.PATH ?? '').split(delimiter)) for (const n of names) if (dir && existsSync(join(dir, n))) return join(dir, n);
  if (process.platform === 'win32') {
    const local = join(process.env.LOCALAPPDATA ?? '', 'Microsoft/WinGet');
    const pkgs = existsSync(join(local, 'Packages')) ? readdirSync(join(local, 'Packages')).filter((d) => d.startsWith('Anthropic.ClaudeCode')).map((d) => join(local, 'Packages', d, 'claude.exe')) : [];
    for (const p of [join(local, 'Links/claude.exe'), join(homedir(), '.local/bin/claude.exe'), ...pkgs]) if (existsSync(p)) return p;
  }
  return null;
}

function taskFile(text: string, id: string) {
  const slug = id.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40) || 'task';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
  const file = join(tmpdir(), `edabuilder_task_${slug}_${stamp}.md`);   // one file per send: never overwrites one being read
  writeFileSync(file, text);
  return file;
}
const pointer = (file: string) => `EdaBuilder task from the dev board: read ${file} and work through it with me.`;

/** Open a Claude Code session on this checkout with the task. */
export function toClaude(root: string, text: string, id = ''): { how: 'link' | 'terminal'; file?: string } {
  if (!text.trim()) throw new Error('Nothing to send.');
  if (linkRegistered()) {
    let q = encodeURIComponent(text), file: string | undefined;
    if (q.length > LINK_MAX) { file = taskFile(text, id); q = encodeURIComponent(pointer(file)); }   // the limit is on the link
    const url = `claude-cli://open?cwd=${encodeURIComponent(root)}&q=${q}`;
    const opener = process.env.DEVBOARD_FAKE_OPEN ?? (process.platform === 'win32' ? 'explorer.exe' : 'xdg-open');
    spawn(opener, [url], { detached: true, stdio: 'ignore' }).unref();
    return { how: 'link', file };
  }
  const exe = findClaude();
  if (!exe) throw new Error('NO_CLI');
  const file = taskFile(text, id);   // a copy to reread; the task itself goes in as one argument
  const arg = /\.(cmd|bat)$/i.test(exe) ? pointer(file) : text;
  if (process.platform === 'win32') spawn(exe, [arg], { cwd: root, detached: true, stdio: 'ignore', windowsHide: false, shell: false }).unref();
  else spawn(process.env.DEVBOARD_TERMINAL ?? 'x-terminal-emulator', ['-e', exe, arg], { cwd: root, detached: true, stdio: 'ignore' }).on('error', () => undefined).unref();
  return { how: 'terminal', file };
}

/** File the task as a GitHub issue (label dev-board) for a cloud session. */
export function toIssue(root: string, title: string, text: string): { number: number; url: string } {
  if (!title.trim() || !text.trim()) throw new Error('An issue needs a title and a task.');
  ensureLabel(root, ISSUE_LABEL);
  const repo = repoOf(root);
  const r = gh([`repos/${repo}/issues`, '-X', 'POST'], { title: title.trim(), body: text, labels: [ISSUE_LABEL] }, root) as { number: number; html_url: string };
  invalidateGithub();
  return { number: r.number, url: r.html_url };
}
