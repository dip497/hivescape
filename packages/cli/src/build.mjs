// Bundles a scene for a target. Every target carries the scene twice: once inside the worker
// script (as a string, started from a Blob, so no request is made: it works in a sandboxed frame
// with no network) and once in the host script, for machines without OffscreenCanvas.
import * as esbuild from "esbuild";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const TSCONFIG = path.join(ROOT, "tsconfig.json");

/** The scene's entry: `<dir>/src/index.ts`, whose default export is the scene. */
export function sceneEntry(dir) {
  const abs = path.resolve(dir);
  const entry = path.join(abs, "src", "index.ts");
  if (!existsSync(entry)) throw new Error(`no scene at ${entry}: a scene folder has src/index.ts exporting the scene by default`);
  // `@hivescape/scene-koi` is the scene `koi`.
  const name = JSON.parse(readFileSync(path.join(abs, "package.json"), "utf8")).name?.split("/").pop() ?? path.basename(abs);
  return { abs, entry, id: name.replace(/^scene-/, "") };
}

async function bundle(contents, resolveDir, opts) {
  const r = await esbuild.build({
    stdin: { contents, resolveDir, loader: "ts", sourcefile: "entry.ts" },
    bundle: true, write: false, minify: opts.minify ?? true, target: "es2022", platform: "browser",
    format: opts.format, tsconfig: TSCONFIG, logLevel: "warning", legalComments: "none",
    external: opts.external ?? [], define: opts.define ?? {},
  });
  return r.outputFiles[0].text;
}

/** The scene's worker script, as text. */
export function buildWorker(dir, opts = {}) {
  const { entry } = sceneEntry(dir);
  return bundle(`import scene from ${JSON.stringify(entry)};\nimport { serveScene } from "@hivescape/runtime/worker";\nserveScene(scene);\n`, ROOT, { format: "iife", minify: opts.minify });
}

/** A page script: `window.hivescape = { scene, mount, workerSource }`. */
export async function buildWeb(dir, opts = {}) {
  const { entry } = sceneEntry(dir);
  const worker = await buildWorker(dir, opts);
  return bundle(
    `import scene from ${JSON.stringify(entry)};\nimport { mount } from "@hivescape/runtime";\n(window as any).hivescape = { scene, mount, workerSource: __HIVESCAPE_WORKER__ };\n`,
    ROOT, { format: "iife", minify: opts.minify, define: { __HIVESCAPE_WORKER__: JSON.stringify(worker) } },
  );
}

/** A Hivemind live wallpaper's entry: the app serves `@hivemind/view-sdk`. */
export async function buildHivemind(dir, opts = {}) {
  const { entry } = sceneEntry(dir);
  const worker = await buildWorker(dir, opts);
  return bundle(
    `import scene from ${JSON.stringify(entry)};\nimport { runWallpaper } from "@hivescape/hivemind";\nawait runWallpaper(scene, { workerSource: __HIVESCAPE_WORKER__ });\n`,
    ROOT, { format: "esm", minify: opts.minify, external: ["@hivemind/view-sdk"], define: { __HIVESCAPE_WORKER__: JSON.stringify(worker) } },
  );
}

/** The page every local tool loads: the scene full window, set by the query string. */
export const PAGE = `<!doctype html><meta charset="utf-8"><title>Hivescape</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;overflow:hidden}#stage{position:fixed;inset:0}
#bar{position:fixed;left:12px;bottom:12px;z-index:9;font:12px ui-monospace,monospace;color:#ddd;background:#000a;padding:6px 10px;border-radius:8px;display:flex;gap:10px;align-items:center}
#bar select,#bar button{font:inherit;background:#222;color:#ddd;border:1px solid #444;border-radius:6px;padding:2px 6px}
body.bare #bar{display:none}</style>
<div id="stage"></div>
<div id="bar"><b>hivescape</b>
<select id="look"><option>dark</option><option>light</option></select>
<select id="kind"><option value="">scene's style</option><option>comb</option><option>glyph</option><option>pixel</option><option>native</option></select>
<span id="info"></span></div>
<script src="scene.js"></script>
<script>
const q = new URLSearchParams(location.search);
if (q.has("bare")) document.body.classList.add("bare");
const LOOKS = { dark: { dark: true, page: [18,18,20], text: [232,233,235], accent: [218,119,86] }, light: { dark: false, page: [246,246,244], text: [29,31,34], accent: [196,92,60] } };
const lookName = q.get("look") || "dark", kind = q.get("kind") || "";
document.getElementById("look").value = lookName; document.getElementById("kind").value = kind;
document.body.style.background = lookName === "dark" ? "#121214" : "#f6f6f4";
const go = (k, v) => { q.set(k, v); location.search = q.toString(); };
document.getElementById("look").onchange = (e) => go("look", e.target.value);
document.getElementById("kind").onchange = (e) => go("kind", e.target.value);
window.__drawn = false;
const opts = { look: LOOKS[lookName], seed: +(q.get("seed") || 1), onDrawn: () => { window.__drawn = true; } };
if (kind) opts.style = { kind };
if (q.get("backend")) opts.backend = q.get("backend");
if (q.get("fps")) opts.fps = +q.get("fps");
opts.thread = q.get("thread") || "auto";
opts.workerSource = hivescape.workerSource;
hivescape.mount(document.getElementById("stage"), hivescape.scene, opts).then(async (m) => {
  window.__mounted = m;
  const info = document.getElementById("info");
  const b = await m.backend();
  setInterval(async () => { const s = await m.stats(); info.textContent = b + " · " + m.thread + " · " + s.cells + " cells · " + s.ms.toFixed(2) + " ms"; }, 500);
});
</script>`;

export function writeWeb(outDir, script) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "scene.js"), script);
  writeFileSync(path.join(outDir, "index.html"), PAGE);
  return path.join(outDir, "index.html");
}
