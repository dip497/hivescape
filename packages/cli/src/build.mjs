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
    `import scene from ${JSON.stringify(entry)};\nimport { runWallpaper } from "@hivescape/hivemind";\nawait runWallpaper(scene, { workerSource: __HIVESCAPE_WORKER__${opts.kind ? `, style: { kind: ${JSON.stringify(opts.kind)} }` : ""} });\n`,
    ROOT, { format: "esm", minify: opts.minify, external: ["@hivemind/view-sdk"], define: { __HIVESCAPE_WORKER__: JSON.stringify(worker) } },
  );
}

/** The page every local tool loads: the scene full window, set by the query string. */
export const PAGE = `<!doctype html><meta charset="utf-8"><title>Hivescape</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;overflow:hidden}#stage{position:fixed;inset:0}
#bar{position:fixed;left:12px;bottom:12px;z-index:9;font:12px ui-monospace,monospace;color:#ddd;background:#000a;padding:6px 10px;border-radius:8px;display:flex;gap:10px;align-items:center}
#bar select,#bar button{font:inherit;background:#222;color:#ddd;border:1px solid #444;border-radius:6px;padding:2px 6px}
body.bare #bar{display:none}
.tile{position:fixed;z-index:5;border-radius:10px;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);font:11px ui-monospace,monospace;padding:28px 12px 10px;box-sizing:border-box;overflow:hidden;white-space:pre}
.tile b{position:absolute;left:12px;top:8px;font:600 11px system-ui}
.tile i{position:absolute;right:12px;top:9px;width:8px;height:8px;border-radius:50%}
#label{position:fixed;z-index:8;font:600 12px system-ui;padding:3px 8px;border-radius:6px;pointer-events:none;display:none}</style>
<div id="stage"></div>
<div id="bar"><b>hivescape</b>
<select id="look"><option>dark</option><option>light</option></select>
<select id="kind"><option value="">scene's style</option><option>comb</option><option>ascii</option><option>pixel</option><option>native</option></select>
<span id="info"></span></div><div id="label"></div>
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
  // Stand-in agents (?agents=N) and their tiles (?tiles=1), as Hivemind would tell them: each state
  // shown, and now and then a finished turn.
  const n = Math.min(8, +(q.get("agents") || 0));
  if (n) {
    const PROGRAMS = ["claude", "codex", "gemini", "claude", "amp", "codex", "claude", "gemini"];
    const STATES = ["working", "needs-you", "ready", "working", "resting", "working", "ready", "working"];
    const KINDS = { claude: 0.1, codex: 0.35, gemini: 0.6, amp: 0.85 };
    const kindOf = (p) => KINDS[p] ?? 0.5;
    const agents = Array.from({ length: n }, (_, i) => ({ id: "agent-" + (i + 1), program: PROGRAMS[i], kind: kindOf(PROGRAMS[i]), size: 0.82 + ((i * 37) % 18) / 100, state: STATES[i] }));
    m.setAgents(agents);
    const dark = lookName === "dark", ink = dark ? "#e8e9eb" : "#1d1f22";
    if (q.get("tiles")) {
      const W = innerWidth, H = innerHeight, spots = [[0.3, 0.2, 0.26, 0.3], [0.58, 0.16, 0.24, 0.26], [0.36, 0.56, 0.3, 0.28]];
      const tiles = [];
      spots.slice(0, Math.min(3, n)).forEach(([fx, fy, fw, fh], i) => {
        const a = agents[i], t = document.createElement("div");
        t.className = "tile";
        Object.assign(t.style, { left: fx * W + "px", top: fy * H + "px", width: fw * W + "px", height: fh * H + "px", background: dark ? "rgba(22,22,26,0.72)" : "rgba(250,250,248,0.74)", color: ink, border: "1px solid " + (dark ? "#ffffff1f" : "#0000001a") });
        t.innerHTML = "<b>" + a.program + "</b><i style='background:" + (a.state === "needs-you" ? "#e07a4f" : a.state === "working" ? "#5fb36a" : "#888") + "'></i>" + ["$ " + a.program, "> reading the repository…", "  src/index.ts", "  tests passed: 128", "> " + (a.state === "needs-you" ? "May I run the migration? [y/n]" : "editing src/scene.ts")].join("\\n");
        document.body.appendChild(t);
        tiles.push({ x0: fx * W, y0: fy * H, x1: (fx + fw) * W, y1: (fy + fh) * H, id: a.id });
      });
      m.setTiles(tiles);
    }
    let k = 0;
    // ?turns=N: a day's work done at the start, each agent in turn.
    const turns = Math.min(200, +(q.get("turns") || 0));
    for (let i = 0; i < turns; i++) setTimeout(() => m.done(agents[i % agents.length].id), 200 + i * 60);
    setInterval(() => { const working = agents.filter((a) => a.state === "working"); if (working.length) m.done(working[k++ % working.length].id); }, 4000);
    const label = document.getElementById("label");
    Object.assign(label.style, { background: dark ? "#000c" : "#fffc", color: ink });
    addEventListener("pointermove", (e) => {
      const id = m.hitTest(e.clientX, e.clientY), a = agents.find((x) => x.id === id);
      label.style.display = a ? "block" : "none";
      if (a) { label.textContent = a.program + " · " + a.state; label.style.left = e.clientX + 14 + "px"; label.style.top = e.clientY - 26 + "px"; }
    });
  }
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
