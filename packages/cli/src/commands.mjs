// hivescape dev | shot | film | bench | pack | build
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync, statSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import * as esbuild from "esbuild";
import { buildHivemind, buildWeb, PAGE, ROOT, sceneEntry, writeWeb } from "./build.mjs";
import { launch } from "./browser.mjs";

const tmp = (name) => { const d = path.join(tmpdir(), "hivescape-" + name + "-" + process.pid); mkdirSync(d, { recursive: true }); return d; };

/** Serve a folder; `/__v` answers the build's version so the page can reload itself. */
function serve(dir, port, version = () => 0) {
  const types = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".webp": "image/webp" };
  const server = createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/__v") { res.end(String(version())); return; }
    const f = path.join(dir, u.pathname === "/" ? "index.html" : decodeURIComponent(u.pathname));
    if (!f.startsWith(dir) || !existsSync(f) || statSync(f).isDirectory()) { res.statusCode = 404; res.end(); return; }
    res.setHeader("content-type", types[path.extname(f)] ?? "application/octet-stream");
    res.end(readFileSync(f));
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}

export async function dev(dir, flags) {
  const out = tmp("dev");
  let version = 0;
  const rebuild = async () => {
    try { writeWeb(out, await buildWeb(dir, { minify: false })); version++; console.log(`built (${version})`); }
    catch (e) { console.error(e.message); }
  };
  await rebuild();
  const reload = `<script>let v0;setInterval(async()=>{const v=await (await fetch("/__v")).text();if(v0&&v!==v0)location.reload();v0=v},700)</script>`;
  writeFileSync(path.join(out, "index.html"), PAGE + reload);
  const ctx = await esbuild.context({ entryPoints: [sceneEntry(dir).entry], bundle: true, write: false, logLevel: "silent", tsconfig: path.join(ROOT, "tsconfig.json"),
    plugins: [{ name: "rebuild", setup: (b) => b.onEnd(() => rebuild().then(() => writeFileSync(path.join(out, "index.html"), PAGE + reload))) }] });
  await ctx.watch();
  const port = +(flags.port ?? 5174);
  await serve(out, port, () => version);
  console.log(`hivescape dev: http://127.0.0.1:${port}/  (?look=light, ?kind=ascii, ?backend=canvas2d, ?thread=main)`);
}

async function open(browser, url, w, h, dpr = 1) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  page.on("pageerror", (e) => console.error("page:", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.error("console:", m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__drawn === true, null, { timeout: 30_000 });
  return page;
}

/** Pictures of each look: running, pointer resting, just after a click, after; and a sheet of them. */
export async function shot(dir, flags) {
  const { id } = sceneEntry(dir);
  const out = path.resolve(flags.out ?? path.join(ROOT, "out", "shots", id));
  mkdirSync(out, { recursive: true });
  const site = tmp("shot");
  writeWeb(site, await buildWeb(dir));
  const server = await serve(site, 0);
  const port = server.address().port;
  const browser = await launch();
  const w = +(flags.w ?? 1440), h = +(flags.h ?? 900);
  const kinds = flags.kind ? String(flags.kind).split(",") : [""];
  const tiles = [];
  try {
    for (const kind of kinds) for (const look of ["dark", "light"]) {
      const q = new URLSearchParams({ look, bare: "1", seed: String(flags.seed ?? 1), ...(kind ? { kind } : {}), ...(flags.backend ? { backend: flags.backend } : {}), ...(flags.agents ? { agents: String(flags.agents), tiles: "1" } : {}), ...(flags.turns ? { turns: String(flags.turns) } : {}) });
      const page = await open(browser, `http://127.0.0.1:${port}/?${q}`, w, h, +(flags.dpr ?? 1));
      const name = `${id}${kind ? "-" + kind : ""}-${look}`;
      const snap = async (step) => { const f = path.join(out, `${name}-${step}.png`); await page.screenshot({ path: f }); tiles.push({ f, label: `${kind || "default"} · ${look} · ${step.slice(1)}` }); };
      // --wait: seconds before the first picture. A software GPU draws a few frames a second, and the
      // clock catches up at most four steps a frame, so there a scene needs longer to reach a moment.
      await page.waitForTimeout(+(flags.wait ?? 2.5) * 1000); await snap("1run");
      const [px, py] = [w * 0.58, h * 0.55];
      await page.mouse.move(px - 60, py - 30); await page.mouse.move(px, py, { steps: 8 }); await page.waitForTimeout(1800); await snap("2pointer");
      await page.mouse.click(px, py); await page.waitForTimeout(350); await snap("3click");
      await page.waitForTimeout(1600); await snap("4after");
      await page.close();
    }
    const sheet = path.join(out, `${id}${flags.kind ? "-" + String(flags.kind).replace(/,/g, "-") : ""}-sheet.png`);
    const html = `<body style="margin:0;background:#16161a;font:14px system-ui;color:#ddd"><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px">${tiles.map((t) => `<figure style="margin:0"><img style="width:100%;display:block;border-radius:6px" src="data:image/png;base64,${readFileSync(t.f).toString("base64")}"><figcaption style="padding:4px 2px">${t.label}</figcaption></figure>`).join("")}</div></body>`;
    const p = await browser.newPage({ viewport: { width: 2400, height: 400 } });
    await p.setContent(html); await p.waitForTimeout(300);
    await p.screenshot({ path: sheet, fullPage: true });
    console.log(`shots: ${out}\nsheet: ${sheet}`);
    return sheet;
  } finally { await browser.close(); server.close(); }
}

/**
 * A film of the scene, to see how it moves: every frame is stepped at its own time (the page runs on
 * frames the CLI gives it), so the film plays as the scene runs on a fast machine however slow this
 * one is; a software GPU only makes it take longer. Writes an MP4, a motion map (where the frame
 * changes: what should hold still is black), and with --webp an animated WebP. Needs ffmpeg.
 */
export async function film(dir, flags) {
  const { id } = sceneEntry(dir);
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) throw new Error("film needs ffmpeg on PATH");
  const fps = +(flags.fps ?? 30), seconds = +(flags.seconds ?? 8), w = +(flags.w ?? 1280), h = +(flags.h ?? 720), dpr = +(flags.dpr ?? 1);
  const look = String(flags.look ?? "dark"), kind = flags.kind ? String(flags.kind) : "";
  const name = `${id}${kind ? "-" + kind : ""}-${look}`;
  const out = path.resolve(flags.out ?? path.join(ROOT, "out", "films"));
  mkdirSync(out, { recursive: true });
  const frames = tmp("film-" + name);
  const site = tmp("film");
  writeWeb(site, await buildWeb(dir));
  const server = await serve(site, 0);
  const browser = await launch();
  try {
    const q = new URLSearchParams({ look, bare: "1", film: "1", seed: String(flags.seed ?? 1), ...(kind ? { kind } : {}), ...(flags.backend ? { backend: String(flags.backend) } : {}) });
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    page.on("pageerror", (e) => console.error("page:", e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?${q}`);
    await page.waitForFunction(() => typeof window.__advance === "function" && !!window.__mounted, null, { timeout: 30_000 });
    // A picture the scene decodes takes a moment of real time; then the film starts at the scene's first second.
    await page.waitForTimeout(+(flags.wait ?? 1.5) * 1000);
    const dt = 1000 / fps, n = Math.round(seconds * fps), skip = Math.round(+(flags.from ?? 0) * fps);
    for (let k = 0; k < skip; k++) await page.evaluate((ms) => window.__advance(ms), dt);
    for (let k = 0; k < n; k++) {
      // --pointer: the pointer sweeps slowly across and back, to show what follows it.
      if (flags.pointer) await page.mouse.move(w * (0.5 + 0.38 * Math.sin((2 * Math.PI * k) / n)), h * (0.5 + 0.12 * Math.sin((4 * Math.PI * k) / n)));
      await page.evaluate((ms) => window.__advance(ms), dt);
      await page.screenshot({ path: path.join(frames, `f${String(k).padStart(5, "0")}.png`) });
      if (k % fps === 0) process.stdout.write(`\r${name}: ${k}/${n} frames`);
    }
    process.stdout.write("\n");
    const mp4 = path.join(out, `${name}.mp4`);
    const enc = (args) => { const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(fps), "-i", path.join(frames, "f%05d.png"), ...args], { encoding: "utf8" }); if (r.status !== 0) throw new Error(r.stderr); };
    enc(["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "slow", "-movflags", "+faststart", mp4]);
    console.log(`film: ${mp4}`);
    // The motion map: where the frame changes, frame to frame, on average (brighter moves more). What
    // should hold still (a building, a figure) is black; what moves (water, grass) shows.
    const motion = path.join(out, `${name}-motion.png`);
    enc(["-vf", `format=gray,tblend=all_mode=difference,tmix=frames=${Math.min(1000, Math.max(1, n - 1))},normalize=smoothing=0`, "-update", "1", motion]);
    console.log(`film: ${motion}`);
    if (flags.webp) {
      const webp = path.join(out, `${name}.webp`);
      enc(["-vf", `scale=${Math.min(960, w)}:-1:flags=lanczos`, "-loop", "0", "-c:v", "libwebp", "-quality", "70", "-compression_level", "6", webp]);
      console.log(`film: ${webp}`);
    }
    return mp4;
  } finally { await browser.close(); server.close(); rmSync(frames, { recursive: true, force: true }); }
}

/** Script time per frame and frames a second, per backend and style, with the frame cap off. */
export async function bench(dir, flags) {
  const site = tmp("bench");
  writeWeb(site, await buildWeb(dir));
  const server = await serve(site, 0);
  const port = server.address().port;
  const browser = await launch(["--disable-gpu-vsync", "--disable-frame-rate-limit"]);
  const rows = [];
  try {
    const env = await (async () => { const p = await browser.newPage(); const r = await p.evaluate(() => { const c = document.createElement("canvas").getContext("webgl2"); const d = c?.getExtension("WEBGL_debug_renderer_info"); return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : c ? "webgl2" : "none"; }); await p.close(); return r; })();
    for (const backend of ["webgl2", "canvas2d"]) for (const kind of (flags.kind ? String(flags.kind).split(",") : ["comb", "ascii", "pixel", "native", "ink"])) for (const dpr of [1, 2]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr });
      await page.goto(`http://127.0.0.1:${port}/?bare=1&thread=main&fps=240&backend=${backend}&kind=${kind}`);
      await page.waitForFunction(() => window.__drawn === true, null, { timeout: 30_000 });
      await page.waitForTimeout(800);
      const r = await page.evaluate(async () => {
        const m = window.__mounted, ms = [], t0 = performance.now(), f0 = (await m.stats()).frames;
        while (performance.now() - t0 < 3000) { await new Promise((r) => requestAnimationFrame(r)); ms.push((await m.stats()).ms); }
        const s = await m.stats(); ms.sort((a, b) => a - b);
        return { cells: s.cells, median: ms[ms.length >> 1], p90: ms[Math.floor(ms.length * 0.9)], fps: ((s.frames - f0) * 1000) / (performance.now() - t0) };
      });
      rows.push({ backend, kind, dpr, ...r });
      console.log(`${backend.padEnd(9)} ${kind.padEnd(7)} dpr ${dpr}  ${String(r.cells).padStart(5)} cells  script ${r.median.toFixed(2)} ms (p90 ${r.p90.toFixed(2)})  ${r.fps.toFixed(1)} fps`);
      await page.close();
    }
    console.log(`renderer: ${env}`);
    if (flags.json) writeFileSync(flags.json, JSON.stringify({ renderer: env, rows }, null, 2));
    return rows;
  } finally { await browser.close(); server.close(); }
}

/** A Hivemind live wallpaper folder (and, with --package, the package around it). */
export async function pack(dir, flags) {
  const { abs } = sceneEntry(dir);
  const meta = JSON.parse(readFileSync(path.join(abs, "package.json"), "utf8"));
  // --kind ascii packs the scene in that style, as a wallpaper of its own beside the scene's own style.
  const kind = typeof flags.kind === "string" ? flags.kind : null;
  if (kind && !["comb", "ascii", "pixel", "native", "ink"].includes(kind)) throw new Error(`--kind ${kind}: one of comb, ascii, pixel, native, ink`);
  const id = sceneEntry(dir).id + (kind ? `-${kind}` : "");
  const name = (meta.hivescape?.name ?? id) + (kind ? ` (${kind === "ascii" ? "ASCII" : kind})` : ""), description = meta.hivescape?.description ?? meta.description;
  const root = path.resolve(flags.out ?? path.join(ROOT, "out", "hivemind"));
  const folder = path.join(root, "wallpapers", id);
  mkdirSync(path.join(folder, "dist"), { recursive: true });
  writeFileSync(path.join(folder, "dist", "main.js"), await buildHivemind(dir, kind ? { kind } : {}));
  copyFileSync(path.join(ROOT, "packages/render/fonts/OFL.txt"), path.join(folder, "OFL.txt"));
  copyFileSync(path.join(ROOT, "LICENSE"), path.join(folder, "LICENSE"));
  // A scene made from someone's work (a painting) carries its credit: title, artist, collection, licence.
  if (meta.hivescape?.credit) writeFileSync(path.join(folder, "CREDITS.txt"), `${name} is made from:\n\n${meta.hivescape.credit}\n`);
  // The picker's picture: the scene at 960 x 600, dark, as WebP.
  const site = tmp("pack");
  writeWeb(site, await buildWeb(dir));
  const server = await serve(site, 0);
  const browser = await launch();
  try {
    const page = await open(browser, `http://127.0.0.1:${server.address().port}/?bare=1&look=dark${kind ? `&kind=${kind}` : ""}`, 960, 600);
    await page.waitForTimeout(2500);
    const png = (await page.screenshot()).toString("base64");
    const webp = await page.evaluate(async (b64) => {
      const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; c.getContext("2d").drawImage(img, 0, 0);
      return c.toDataURL("image/webp", 0.82).split(",")[1];
    }, png);
    writeFileSync(path.join(folder, "preview.webp"), Buffer.from(webp, "base64"));
  } finally { await browser.close(); server.close(); }
  const manifest = { protocol: 1, name, entry: "dist/main.js", ...(description ? { description: description.slice(0, 200) } : {}), preview: "preview.webp" };
  writeFileSync(path.join(folder, "hivemind-wallpaper.json"), JSON.stringify(manifest, null, 2) + "\n");
  if (flags.package) {
    if (!/^@[a-z0-9-]+\/[a-z0-9-]+$/.test(String(flags.package))) throw new Error(`--package ${flags.package}: a Hivemind package id is @owner/name, e.g. --package @you/scenes`);
    const pkgFile = path.join(root, "hivemind-package.json");
    const pkg = existsSync(pkgFile) ? JSON.parse(readFileSync(pkgFile, "utf8")) : { apiVersion: 2, id: flags.package, name: flags.name ?? "Hivescape scenes", version: "0.1.0", wallpapers: [] };
    if (!pkg.wallpapers.some((w) => w.path === `wallpapers/${id}`)) pkg.wallpapers.push({ path: `wallpapers/${id}` });
    pkg.startup ??= { wallpaper: `${flags.package}/${id}` };
    writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + "\n");
  }
  console.log(`packed ${id} → ${folder}`);
  return folder;
}

export async function build(dir, flags) {
  const out = path.resolve(flags.out ?? path.join(ROOT, "out", "web", sceneEntry(dir).id));
  const file = writeWeb(out, await buildWeb(dir));
  console.log(`built → ${file}`);
}
