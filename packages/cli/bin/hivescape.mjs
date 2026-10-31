#!/usr/bin/env node
// hivescape: make, see, measure and ship living backgrounds.
import { bench, build, dev, pack, shot } from "../src/commands.mjs";

const USAGE = `hivescape <command> <scene folder> [flags]

  dev    <scene>   live preview with reload             --port 5174  (?agents=5&tiles=1: stand-in agents)
  shot   <scene>   pictures and a sheet, dark and light  --out DIR --kind comb,ascii --w 1440 --h 900 --backend webgl2|canvas2d --agents 5 --turns 40 --wait 2.5 --dpr 2
  bench  <scene>   script time and fps per backend and style, frame cap off   --json FILE --kind ink
  build  <scene>   a page and its script                 --out DIR
  pack   <scene>   a Hivemind live wallpaper folder      --out DIR --package @owner/name --name "Package name" --kind ascii
`;

const [cmd, dir, ...rest] = process.argv.slice(2);
const flags = {};
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (a.startsWith("--")) { const k = a.slice(2), v = rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[++i] : true; flags[k] = v; }
}
const run = { dev, shot, bench, build, pack }[cmd];
if (!run || !dir) { process.stdout.write(USAGE); process.exit(cmd ? 2 : 0); }
run(dir, flags).catch((e) => { console.error(`hivescape ${cmd}: ${e.message}`); process.exit(1); });
