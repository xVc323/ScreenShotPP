import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "frames");
const FPS = 18;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
await page.goto("file://" + join(here, "demo.html"));
await page.waitForFunction("window.__demoReady === true", null, { timeout: 15000 });
await page.evaluate("document.fonts.ready");
await page.waitForTimeout(600); // let the sheet fully paint before the first frame

const duration = await page.evaluate("window.DEMO_DURATION");
const frames = Math.ceil((duration / 1000) * FPS) + Math.round(FPS * 1.2); // + tail hold
console.log(`duration=${duration}ms fps=${FPS} frames=${frames}`);

for (let i = 0; i < frames; i++) {
  const t = Math.min(duration, (i * 1000) / FPS);
  await page.evaluate((tt) => window.seek(tt), t);
  const name = `${OUT}/f_${String(i).padStart(4, "0")}.png`;
  await page.screenshot({ path: name, clip: { x: 0, y: 0, width: 1280, height: 720 } });
}

await browser.close();
console.log("done");
