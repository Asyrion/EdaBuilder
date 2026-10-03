import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

/** The commit the build is made from, recorded in replays (iteration 67). */
function build(): string {
  try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'unknown'; }
}

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(build()) },
  build: { target: 'es2022', sourcemap: false },
  test: { include: ['tests/**/*.test.ts'], setupFiles: ['tests/setup.ts'] },
});
