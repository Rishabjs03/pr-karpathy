/**
 * Regenerates the screenshots from the committed examples. Run after `pnpm examples` when the
 * page design or the examples change.
 *
 *   node scripts/readme-images.mjs [--ignore-https-errors]
 *
 * Writes:
 *   docs/images/*.png                The README screenshots (from the click example).
 *   examples/images/<name>-*.jpg     A thumbnail of each example, for the examples site.
 *   examples/images/explainer-*.png  The hero image of the examples site.
 *   examples/images/social-preview.png
 *                                    A 1280×640 card for link previews. The examples site
 *                                    uses it, and it can be uploaded as the repository's
 *                                    social preview (Settings → General → Social preview).
 */
import { copyFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const examplesDir = path.resolve('examples');
const imagesDir = path.join(examplesDir, 'images');
const readmeExample = path.join(examplesDir, 'click-3777-pager-params/index.html');
const defaultChromium = '/opt/pw-browsers/chromium';
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  (existsSync(defaultChromium) ? defaultChromium : undefined);
const ignoreHTTPSErrors = process.argv.includes('--ignore-https-errors');
const browser = await chromium.launch(executablePath ? { executablePath } : {});
await mkdir(imagesDir, { recursive: true });

async function openPage(file, scheme, viewport, deviceScaleFactor = 1.5) {
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor,
    colorScheme: scheme,
    ignoreHTTPSErrors,
  });
  await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle' });
  return page;
}

/** A README screenshot of the click example: the viewport, or one section. */
async function readmeShot(scheme, file, selector) {
  const page = await openPage(readmeExample, scheme, { width: 1200, height: 860 });
  await page.waitForSelector('[data-flow-diagram][data-state="ready"]', { timeout: 15_000 });
  const target = selector ? page.locator(selector) : page;
  await target.screenshot({ path: `docs/images/${file}` });
  console.log(`docs/images/${file}`);
  await page.close();
}

await readmeShot('light', 'explainer-light.png');
await readmeShot('dark', 'explainer-dark.png');
await readmeShot('light', 'risks-light.png', '#risks');
await readmeShot('dark', 'flow-dark.png', '#flow');

// The examples site is deployed from examples/ alone, so it gets its own copy of the hero.
for (const scheme of ['light', 'dark']) {
  await copyFile(
    `docs/images/explainer-${scheme}.png`,
    path.join(imagesDir, `explainer-${scheme}.png`),
  );
}

// One thumbnail per example: the top of its page.
const names = [];
for (const entry of await readdir(examplesDir, { withFileTypes: true })) {
  if (entry.isDirectory() && existsSync(path.join(examplesDir, entry.name, 'source.json'))) {
    names.push(entry.name);
  }
}
for (const name of names.sort()) {
  for (const scheme of ['light', 'dark']) {
    const page = await openPage(
      path.join(examplesDir, name, 'index.html'),
      scheme,
      { width: 1100, height: 690 },
      1,
    );
    const file = path.join(imagesDir, `${name}-${scheme}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 82 });
    console.log(path.relative(process.cwd(), file));
    await page.close();
  }
}

// The social preview card: the brand and pitch on the left, the click example's risks on the right.
const risks = await openPage(readmeExample, 'dark', { width: 1000, height: 860 }, 2);
const risksPng = await risks.locator('#risks').screenshot();
await risks.close();
const stylesheet = await readFile('packages/renderer/src/assets/styles.css', 'utf8');
const brandGradient = /\.brand-mark\s*\{[^}]*background:\s*([^;]+);/.exec(stylesheet)?.[1];
const card = await browser.newPage({
  viewport: { width: 1280, height: 640 },
  deviceScaleFactor: 1,
});
await card.setContent(`<!doctype html>
<html><head><meta charset="utf-8"><style>
  :root { --accent: #a5b4fc; }
  * { box-sizing: border-box; }
  body {
    margin: 0; width: 1280px; height: 640px; overflow: hidden; color: #ececef;
    font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    background:
      radial-gradient(900px 520px at 85% 30%, rgb(99 102 241 / 0.28), transparent 70%),
      radial-gradient(600px 400px at 0% 100%, rgb(34 197 94 / 0.12), transparent 70%),
      #09090b;
  }
  .left { position: absolute; left: 72px; top: 0; bottom: 0; width: 560px;
    display: flex; flex-direction: column; justify-content: center; }
  .brand { display: flex; align-items: center; gap: 16px; font-size: 40px; font-weight: 700;
    letter-spacing: -0.02em; }
  .mark { width: 40px; height: 40px; border-radius: 11px; background: ${brandGradient}; }
  h1 { font-size: 50px; line-height: 1.08; letter-spacing: -0.03em; margin: 34px 0 22px;
    font-weight: 750; }
  p { font-size: 23px; line-height: 1.45; color: #b4b4bd; margin: 0 0 34px; }
  .chips { display: flex; flex-wrap: wrap; gap: 10px; }
  .chip { font-size: 18px; padding: 7px 14px; border-radius: 999px; color: #d4d4d8;
    border: 1px solid #3f3f46; background: rgb(24 24 27 / 0.7); }
  .shot { position: absolute; left: 680px; top: 70px; width: 680px; border-radius: 16px;
    overflow: hidden; border: 1px solid #3f3f46; padding: 22px 0 0 26px; background: #09090b;
    box-shadow: 0 30px 80px rgb(0 0 0 / 0.6), 0 0 0 8px rgb(255 255 255 / 0.03); }
  .shot img { display: block; width: 100%; margin-top: -26px; }
  .foot { margin-top: 26px; font-size: 18px; color: #8f8f99; }
</style></head><body>
  <div class="left">
    <div class="brand"><span class="mark"></span>lucidiff</div>
    <h1>Understand a pull request before you review it.</h1>
    <p>One interactive HTML page per PR: what changed, how it flows, what can break, and what to test.</p>
    <div class="chips">
      <span class="chip">Cited risks</span><span class="chip">Flow diagram</span>
      <span class="chip">Test checklist</span>
    </div>
    <div class="foot">Open source · MIT License</div>
  </div>
  <div class="shot"><img src="data:image/png;base64,${risksPng.toString('base64')}"></div>
</body></html>`);
await card.screenshot({ path: path.join(imagesDir, 'social-preview.png') });
console.log('examples/images/social-preview.png');
await card.close();

await browser.close();
