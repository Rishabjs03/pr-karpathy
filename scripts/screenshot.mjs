/* global document, window -- used inside page.evaluate(), which runs in the browser */
/**
 * Takes screenshots of a generated explainer page in light and dark mode.
 *
 *   node scripts/screenshot.mjs <page.html> <out-prefix> [--mobile] [--full] [--ignore-https-errors]
 *
 * Uses the Chromium that Playwright manages. Set PLAYWRIGHT_CHROMIUM_PATH to use another one.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const [input, prefix = '.sample/shot'] = process.argv
  .slice(2)
  .filter((arg) => !arg.startsWith('--'));
if (!input) {
  console.error(
    'Usage: node scripts/screenshot.mjs <page.html> <out-prefix> [--mobile] [--full] [--ignore-https-errors]',
  );
  process.exit(1);
}
const mobile = process.argv.includes('--mobile');
const fullPage = process.argv.includes('--full');
// For sandboxes whose HTTPS proxy uses a private CA. SRI still verifies the CDN script.
const ignoreHTTPSErrors = process.argv.includes('--ignore-https-errors');
const defaultChromium = '/opt/pw-browsers/chromium';
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  (existsSync(defaultChromium) ? defaultChromium : undefined);

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const errors = [];
for (const scheme of ['light', 'dark']) {
  const page = await browser.newPage({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
    ignoreHTTPSErrors,
  });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`[${scheme}] ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`[${scheme}] ${error.message}`));
  await page.goto(pathToFileURL(path.resolve(input)).href, { waitUntil: 'networkidle' });
  await page
    .waitForSelector(
      '[data-flow-diagram][data-state="ready"], [data-flow-diagram][data-state="failed"]',
      {
        timeout: 15000,
      },
    )
    .catch(() => errors.push(`[${scheme}] flow diagram did not settle`));
  const state = await page.getAttribute('[data-flow-diagram]', 'data-state').catch(() => null);
  const out = `${prefix}-${mobile ? 'mobile-' : ''}${scheme}.png`;
  await page.screenshot({ path: out, fullPage });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  console.log(`${out}  flow=${state}  horizontal-overflow=${overflow}`);
  await page.close();
}
await browser.close();
if (errors.length) {
  console.log('Console errors:\n' + errors.join('\n'));
}
