// A headless Chromium for shots and benchmarks: playwright-core's own browser when installed,
// else a Chromium this machine already has (HIVESCAPE_CHROME, then the usual places).
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const CANDIDATES = [process.env.HIVESCAPE_CHROME, "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].filter(Boolean);

export async function launch(args = []) {
  try { return await chromium.launch({ args }); }
  catch (e) {
    for (const p of CANDIDATES) if (existsSync(p)) return chromium.launch({ executablePath: p, args: [...args, "--headless=new", "--no-sandbox", "--enable-unsafe-swiftshader"] });
    throw new Error(`no Chromium to run: install one with "npx playwright-core install chromium" or set HIVESCAPE_CHROME (${e.message})`);
  }
}
