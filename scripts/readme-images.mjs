/**
 * Regenerates the README screenshots in docs/images from the committed examples.
 * Run after `pnpm examples` when the page design changes.
 *
 *   node scripts/readme-images.mjs [--ignore-https-errors]
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const example = path.resolve('examples/click-3777-pager-params/index.html');
const defaultChromium = '/opt/pw-browsers/chromium';
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  (existsSync(defaultChromium) ? defaultChromium : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : {});

async function shoot(scheme, file, selector) {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 860 },
    deviceScaleFactor: 1.5,
    colorScheme: scheme,
    ignoreHTTPSErrors: process.argv.includes('--ignore-https-errors'),
  });
  await page.goto(pathToFileURL(example).href, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-flow-diagram][data-state="ready"]', { timeout: 15_000 });
  const target = selector ? page.locator(selector) : page;
  await target.screenshot({
    path: `docs/images/${file}`,
    ...(selector ? {} : { fullPage: false }),
  });
  console.log(`docs/images/${file}`);
  await page.close();
}

await shoot('light', 'explainer-light.png');
await shoot('dark', 'explainer-dark.png');
await shoot('light', 'risks-light.png', '#risks');
await shoot('dark', 'flow-dark.png', '#flow');
await browser.close();
