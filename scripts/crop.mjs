// crop shots/atlas.png into pieces using playwright's canvas
import { chromium } from 'playwright';
import fs from 'node:fs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
const b64 = fs.readFileSync('shots/atlas.png').toString('base64');
const pieces = await page.evaluate(async (b64) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const out = [];
  const cw = 1400, ch = 660;
  for (let y = 0; y < img.height; y += ch) for (let x = 0; x < img.width; x += cw) {
    const c = document.createElement('canvas'); c.width = Math.min(cw, img.width - x); c.height = Math.min(ch, img.height - y);
    c.getContext('2d').drawImage(img, -x, -y);
    out.push(c.toDataURL('image/png'));
  }
  return out;
}, b64);
pieces.forEach((p, i) => fs.writeFileSync(`shots/atlas_${i}.png`, Buffer.from(p.split(',')[1], 'base64')));
console.log(pieces.length, 'pieces');
await browser.close();
