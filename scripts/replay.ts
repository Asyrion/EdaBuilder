/** The headless replay verifier (iteration 67, DESIGN 4.98): plays a replay file without a browser and says whether it reproduces its
 *  recording, and if not, the first day it diverged. Usage: npx tsx scripts/replay.ts <file.wardlight-replay.json>
 *  A player's replay file reproduces their charter on any machine running the same build. */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { verifyReplay, type ReplayFile } from '../src/sim/commands';

const path = process.argv[2];
if (!path) { console.error('usage: npx tsx scripts/replay.ts <file.wardlight-replay.json>'); process.exit(2); }
const file = JSON.parse(readFileSync(path, 'utf8')) as ReplayFile;
if (file.replay !== 1) { console.error('not a Wardlight replay'); process.exit(2); }
let head = 'unknown';
try { head = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* not a checkout */ }
console.log(`${file.header.name}: ${file.header.scenario}, ${file.header.faction}, seed ${file.header.seed}${file.header.challenge ? `, challenge ${file.header.challenge}` : ''}`);
console.log(`${file.commands.length} commands, ${file.checkpoints.length} days, ending at tick ${file.endTick}; recorded on build ${file.build}, this checkout is ${head}`);
if (file.build !== head && file.build !== 'dev') console.log('note: another build; a difference in the sim would make it diverge');
const t0 = Date.now();
const v = verifyReplay(file);
console.log(`replayed ${v.ticks} ticks in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (v.matches) console.log(`MATCH: checksum ${v.checksum}`);
else {
  console.log(`DIVERGED${v.divergedOnDay >= 0 ? ` on day ${v.divergedOnDay}` : ''}: checksum ${v.checksum}, recorded ${v.expected}`);
  process.exitCode = 1;
}
