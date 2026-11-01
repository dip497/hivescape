/**
 * The GPU path. Each frame the scene's picture is uploaded as a texture and mipmapped; one
 * instanced draw then places a quad per cell, and the vertex shader reads the cell's average colour
 * and coverage straight from the mip chain: the picture is never read back to the CPU. The fragment
 * shader draws the cell as a signed distance (a hexagon or a square, crisp at any pixel ratio), bevels
 * it into relief and lights it: the key light from the upper left, the scene's own lights from the
 * side they shine from, and the pointer's torch from where it is. Before the cells, one full-screen
 * pass lets the scene's lights glow over the ground (or draws a native picture); after them, one
 * instanced draw places the overlay's characters and dots. Four draw calls at most, whatever the size
 * (five for ink on a dark look, whose characters go through a framebuffer of their own for their glow).
 */
import { ATLAS_COLS, ATLAS_ROWS, type Atlas } from "./atlas.js";
import type { Backend } from "./backend.js";
import { CUT, INK_MAX_EDGES, INK_MAX_FILL, INK_READ, INK_REGIONS, INK_RX, INK_RY, INK_SPR, INK_SX, INK_SY } from "./ascii.js";
import { INK, KEY, type FrameInput } from "./frame.js";
import { LS, SS, type AnyCanvas } from "./surface.js";

const MAX_RIPPLES = 8;
const MAX_RAMP = 16;
const KIND = { comb: 0, ascii: 1, pixel: 2, native: 3, ink: 4 } as const;
const EDGES = 12;

const HASH = /* glsl */ `
float cellHash(int i, int j, int tick) {
  uint h = (uint(i) * 0x27d4eb2du) ^ (uint(j) * 0x165667b1u) ^ (uint(tick) * 0x9e3779b1u);
  h ^= h >> 15u; h *= 0x2c1b3c6du; h ^= h >> 12u; h *= 0x297a2d39u; h ^= h >> 15u;
  return float(h) / 4294967296.0;
}`;

/** What every pass that lights something shares: the scene's lights and the pointer's torch. */
const LIGHTING = /* glsl */ `
uniform sampler2D uLight;
uniform int uLit;
uniform vec2 uSpan;      // CSS pixels the picture and light layer cover
uniform vec2 uCell;
uniform vec3 uKey;
uniform vec4 uLook;      // ambient, gloss, torch radius, glow
uniform vec3 uPointer;   // x, y, active
const vec3 KEY = vec3(${KEY.map((v) => v.toFixed(5)).join(", ")});
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 lightAt(vec2 world, float lod) { return textureLod(uLight, world / uSpan, lod).rgb; }
// Where the scene's light at this point comes from: up the slope of its brightness, a little overhead.
vec3 lightDir(vec2 world) {
  vec2 dx = vec2(uCell.x * 1.5, 0.0), dy = vec2(0.0, uCell.y * 1.5);
  vec2 g = vec2(lum(lightAt(world + dx, 2.0)) - lum(lightAt(world - dx, 2.0)), lum(lightAt(world + dy, 2.0)) - lum(lightAt(world - dy, 2.0)));
  float m = length(g);
  return normalize(vec3(m > 1e-4 ? g / m * min(m * 8.0, 1.0) * 0.9 : vec2(0.0), 0.5));
}
// A surface of colour \`base\` and normal \`n\` at \`world\`, under all three lights.
vec3 shade(vec3 base, vec3 n, vec2 world, float gloss) {
  float rel = dot(n, KEY) - KEY.z;
  vec3 col = base * uLook.x * (1.0 + rel * 1.3);
  col += uKey * pow(max(dot(n, normalize(KEY + vec3(0.0, 0.0, 1.0))), 0.0), 36.0) * gloss * 0.6 * uLook.x;
  if (uLit == 1) {
    vec3 lf = lightAt(world, 1.0);
    if (lum(lf) > 0.004) {
      vec3 L = lightDir(world);
      col += base * lf * max(dot(n, L), 0.0) / L.z * 1.7;
      col += lf * pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 30.0) * gloss * 1.1;
    }
  }
  if (uPointer.z > 0.5 && uLook.z > 0.0) {
    vec2 d = uPointer.xy - world;
    float att = max(0.0, 1.0 - length(d) / uLook.z);
    if (att > 0.0) {
      att *= att;
      vec3 T = normalize(vec3(d, uLook.z * 0.3));
      col += base * uKey * att * max(dot(n, T), 0.0) * 0.6;
      col += uKey * pow(max(dot(n, normalize(T + vec3(0.0, 0.0, 1.0))), 0.0), 40.0) * att * gloss;
    }
  }
  return col;
}`;

const CELLS_VS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uView;
uniform vec2 uCell;
uniform ivec2 uGrid;
uniform int uHex;
uniform sampler2D uPic;
uniform sampler2D uLight;
uniform int uLit;
uniform vec2 uSpan;
uniform float uLod;
uniform int uKind;
uniform int uPass;
uniform vec4 uTile;      // threshold, soft, gap, radius
uniform vec2 uSurf;      // relief, flicker per second
uniform vec4 uShadow;
uniform vec4 uRip[${MAX_RIPPLES}];   // x, y, start, life
uniform vec2 uRip2[${MAX_RIPPLES}];  // speed, strength
uniform int uRipN;
uniform float uTime;
uniform float uRamp[${MAX_RAMP}];
uniform float uRampLen;
uniform float uEdge[${EDGES}];
uniform vec4 uLook;
uniform float uSharp;
uniform int uDark;
uniform vec4 uInkFill[${INK_MAX_FILL / 4}];                  // ink: fill characters' atlas slots, least ink first
uniform vec4 uInkLevel[${INK_MAX_FILL / 4}];                 // ink: each fill character's coverage against the densest
uniform int uInkFillN;
uniform vec4 uInkEdge[${INK_MAX_EDGES / 4}];                 // ink: edge characters' atlas slots
uniform vec4 uShape[${(INK_MAX_EDGES * INK_REGIONS) / 4}];   // ink: each edge character's shape, INK_REGIONS numbers each
uniform int uInkEdgeN;
out vec2 vP;
out vec2 vWorld;
flat out vec2 vHalf;
flat out vec3 vFill;
flat out float vAlpha;
flat out float vHeight;
flat out float vBlur;
flat out float vEmit;
flat out float vSlot;
flat out float vBody;
const vec2 Q[6] = vec2[6](vec2(-1,-1), vec2(1,-1), vec2(-1,1), vec2(-1,1), vec2(1,-1), vec2(1,1));
const vec3 KEY = vec3(${KEY.map((v) => v.toFixed(5)).join(", ")});
const float PI = 3.14159265;
${HASH}
// ascii.ts's edgeGlyph: the edge character for a partly covered cell of this shape.
int edgeGlyph(float cov, float cx, float cy, float aniso, float ang, float len) {
  if (aniso > 0.55 && cov < 0.5 && len > 0.5) {
    float a = mod(ang, PI);
    if (a < PI / 8.0 || a > 7.0 * PI / 8.0) return cy > 0.68 ? 2 : 5;
    if (a > 3.0 * PI / 8.0 && a < 5.0 * PI / 8.0) return cx > 0.62 ? 10 : (cx < 0.38 ? 11 : 7);
    return a < PI / 2.0 ? 9 : 8;
  }
  if (cy > 0.66) return cov < 0.22 ? 0 : 1;
  if (cy < 0.34) return cov < 0.22 ? 3 : 4;
  if (cx > 0.64) return 10;
  if (cx < 0.36) return 11;
  return cov < 0.3 ? 5 : 6;
}
void main() {
  int cols = uGrid.x;
  int i = gl_InstanceID % cols, j = gl_InstanceID / cols;
  float shift = (uHex == 1 && (j & 1) == 1) ? -0.5 : 0.0;
  vec2 centre = vec2(float(i) + 0.5 + shift, float(j) + 0.5) * uCell;
  // Level log2(SS) - 1 holds two texels a cell side; read bilinearly at the centre, that is the
  // average of exactly one cell's window, wherever the row's offset puts it.
  vec4 s = textureLod(uPic, centre / uSpan, uLod);
  float a = s.a;
  vec3 c = a > 0.0 ? s.rgb / a : vec3(0.0);
  float ring = 0.0;
  for (int k = 0; k < ${MAX_RIPPLES}; k++) {
    if (k >= uRipN) break;
    float age = uTime - uRip[k].z;
    if (age < 0.0 || age >= uRip[k].w) continue;
    float d = distance(centre, uRip[k].xy);
    ring = max(ring, max(0.0, 1.0 - abs(d - age * uRip2[k].x) / 28.0) * (1.0 - age / uRip[k].w) * uRip2[k].y);
  }
  vSlot = -1.0; vEmit = 0.0; vBlur = 0.0; vBody = 0.0;
  float size = 0.0;
  if (a >= uTile.y) size = a >= uTile.x ? 1.0 : 0.38 + 0.62 * sqrt((a - uTile.y) / max(uTile.x - uTile.y, 1e-3));
  // ink covers every cell: its ground hides the backdrop, which the picture already holds.
  if (uKind == 4) size = 1.0;
  if (size <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float height = uSurf.x * size + ring * 1.1;
  if (uLit == 1) vEmit = smoothstep(0.78, 1.0, dot(textureLod(uLight, centre / uSpan, 0.0).rgb, vec3(0.299, 0.587, 0.114)));
  vec2 half_;
  float alpha = uKind == 2 && a < uTile.x ? a : 1.0;
  vec2 offset = vec2(0.0);
  if (uKind == 4) {
    // ink (ascii.ts's readInkCell): the cell's samples in linear light, and the character's colour, its
    // bright side's (its dark side's, on a light page)
    vec3 lin[${INK_SX * INK_SY}];
    float Y[${INK_SX * INK_SY}];
    float ym = 0.0;
    ivec2 b0 = ivec2(i * ${INK_SX}, j * ${INK_SY});
    for (int v = 0; v < ${INK_SY}; v++) for (int u = 0; u < ${INK_SX}; u++) {
      vec3 t = texelFetch(uPic, b0 + ivec2(u, v), 0).rgb;
      int k = v * ${INK_SX} + u;
      lin[k] = t * t;
      Y[k] = dot(lin[k], vec3(0.299, 0.587, 0.114));
      ym += Y[k];
    }
    ym /= ${INK_SX * INK_SY}.0;
    vec3 side = vec3(0.0);
    float ns = 0.0;
    for (int k = 0; k < ${INK_SX * INK_SY}; k++) if (uDark == 1 ? Y[k] >= ym : Y[k] <= ym) { side += lin[k]; ns += 1.0; }
    c = sqrt(side / ns);
    // Tone per region: brightness (darkness, on a light page), bent and rounded; then (ascii.ts's
    // inkPick) an edge character by shape where the cell has contrast inside it, else a fill by density.
    float tone[${INK_REGIONS}];
    float mx = 0.0, mn = 1.0, mean = 0.0;
    const float QL = ${(INK_READ.levels - 1).toFixed(1)};
    for (int ry = 0; ry < ${INK_RY}; ry++) for (int rx = 0; rx < ${INK_RX}; rx++) {
      float y = 0.0;
      for (int v = 0; v < ${INK_SPR}; v++) for (int u = 0; u < ${INK_SPR}; u++) y += Y[(ry * ${INK_SPR} + v) * ${INK_SX} + rx * ${INK_SPR} + u];
      float l = sqrt(y / ${INK_SPR * INK_SPR}.0);
      float tn = floor(pow(uDark == 1 ? l : 1.0 - l, ${INK_READ.gamma.toFixed(4)}) * QL + 0.5) / QL;
      tone[ry * ${INK_RX} + rx] = tn;
      mx = max(mx, tn); mn = min(mn, tn); mean += tn;
    }
    mean /= ${INK_REGIONS}.0;
    int best = -1;
    if (mx - mn >= ${INK_READ.edge.toFixed(4)} && uInkEdgeN > 0) {
      float bd = ${INK_READ.fit.toFixed(4)};
      for (int e = 0; e < ${INK_MAX_EDGES}; e++) {
        if (e >= uInkEdgeN) break;
        float d = 0.0;
        for (int k = 0; k < ${INK_REGIONS}; k++) { int q = e * ${INK_REGIONS} + k; float t = pow(tone[k] / mx, ${INK_READ.crunch.toFixed(4)}) - uShape[q / 4][q % 4]; d += t * t; }
        if (d < bd) { bd = d; best = e; }
      }
    }
    if (best >= 0) { vSlot = uInkEdge[best / 4][best % 4]; vBody = sqrt(mx); }
    else {
      int f = 0;
      float bd = 1e9;
      for (int i = 0; i < ${INK_MAX_FILL}; i++) {
        if (i >= uInkFillN) break;
        float d = abs(uInkLevel[i / 4][i % 4] - mean);
        if (d < bd) { bd = d; f = i; }
      }
      if (f == 0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
      vSlot = uInkFill[f / 4][f % 4];
      vBody = 1.0;
    }
    half_ = uCell * 0.5;
    height = 0.0;
  } else if (uKind == 1) {
    // ascii: read the cell as a shape from its samples (kernel.ts's cellShapes), then pick its character.
    float sw = 0.0, sx = 0.0, sy = 0.0, sxx = 0.0, syy = 0.0, sxy = 0.0;
    ivec2 b0 = ivec2(i, j) * ${SS};
    for (int v = 0; v < ${SS}; v++) for (int u = 0; u < ${SS}; u++) {
      float w = texelFetch(uPic, b0 + ivec2(u, v), 0).a;
      float x = (float(u) + 0.5) / ${SS}.0 * uCell.x, y = (float(v) + 0.5) / ${SS}.0 * uCell.y;
      sw += w; sx += w * x; sy += w * y; sxx += w * x * x; syy += w * y * y; sxy += w * x * y;
    }
    float mx = sx / sw, my = sy / sw;
    float va = sxx / sw - mx * mx, vb = syy / sw - my * my, vc = sxy / sw - mx * my;
    float aniso = va + vb > 1e-6 ? sqrt((va - vb) * (va - vb) + 4.0 * vc * vc) / (va + vb) : 0.0;
    float major = (va + vb) * 0.5 + sqrt((va - vb) * (va - vb) * 0.25 + vc * vc);
    float len = sqrt(12.0 * major) / max(uCell.x, uCell.y);
    if (a >= uTile.x) {
      // A body: a block, with a character cut in it, sparse on bright skin and dense in shadow.
      float lit = dot(c, vec3(0.299, 0.587, 0.114)) * uLook.x;
      if (uLit == 1) lit += dot(c * textureLod(uLight, centre / uSpan, 1.0).rgb, vec3(0.299, 0.587, 0.114)) * 1.7;
      float flick = uSurf.y > 0.0 ? (cellHash(i, j, int(floor(uTime * uSurf.y))) - 0.5) * 0.12 : 0.0;
      int ri = int(clamp(floor((1.0 - clamp(lit + flick, 0.0, 1.0)) * uRampLen + (cellHash(i, j, 0) - 0.5) * 0.8), 0.0, uRampLen - 1.0));
      vSlot = uRamp[ri]; vBody = 1.0;
    } else {
      vSlot = uEdge[edgeGlyph(a, mx / uCell.x, my / uCell.y, aniso, 0.5 * atan(2.0 * vc, va - vb), len)];
      alpha = clamp(0.5 + a, 0.0, 1.0);
    }
    half_ = max((uCell - uTile.z) * 0.5, vec2(0.5));
    height = 0.0;
    // A swell lifts the characters it passes, a row at its crest.
    offset = vec2(0.0, -ring * uCell.y * 0.4);
  } else if (uHex == 1) {
    float ap = max((uCell.x - uTile.z) * 0.5, 0.5);
    half_ = vec2(ap, ap * 1.1547005) * size * (1.0 + ring * 0.08);
  } else {
    half_ = max((uCell - uTile.z) * 0.5, vec2(0.5)) * size * (1.0 + ring * 0.08);
  }
  // As a cell rises it moves toward the key light, and its shadow lengthens away from it.
  if (uKind == 4) offset = vec2(0.0, -ring * uCell.y * 0.5);
  else if (uKind != 1) offset = KEY.xy * ring * uCell.y * 0.16;
  vec2 pad = uKind == 1 ? uCell * 0.5 - half_ + 1.0 : vec2(uKind == 4 ? 0.5 : 1.0);
  if (uPass == 0) {
    if (uKind == 1 || uKind == 4 || uShadow.a <= 0.0 || height <= 0.01 || vEmit > 0.6) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    offset = -KEY.xy * uCell.y * (0.1 + 0.26 * height);
    vBlur = uCell.y * (0.12 + 0.2 * height);
    pad += vBlur;
  }
  vec2 p = Q[gl_VertexID] * (half_ + pad);
  vec2 pos = centre + offset + p;
  gl_Position = vec4(pos / uView * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
  vP = p; vWorld = pos; vHalf = half_;
  vFill = c; vAlpha = alpha;
  vHeight = height;
}`;

const CELLS_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uAtlas;
uniform float uDpr;
uniform int uHex;
uniform int uKind;
uniform int uPass;
uniform vec4 uTile;
uniform vec4 uShadow;
uniform int uDark;
${LIGHTING}
in vec2 vP;
in vec2 vWorld;
flat in vec2 vHalf;
flat in vec3 vFill;
flat in float vAlpha;
flat in float vHeight;
flat in float vBlur;
flat in float vEmit;
flat in float vSlot;
flat in float vBody;
out vec4 o;
// A pointy-topped hexagon of apothem \`r\` (centre to a flat side), corners rounded by \`k\`.
float sdHex(vec2 p, float r, float k) {
  const vec3 h = vec3(-0.866025404, 0.5, 0.577350269);
  p = abs(p.yx);
  p -= 2.0 * min(dot(h.xy, p), 0.0) * h.xy;
  p -= vec2(clamp(p.x, -h.z * (r - k), h.z * (r - k)), r - k);
  return length(p) * sign(p.y) - k;
}
float sdBox(vec2 p, vec2 b, float k) {
  vec2 d = abs(p) - b + k;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - k;
}
float sd(vec2 p) {
  float k = min(uTile.w, min(vHalf.x, vHalf.y) * 0.5);
  return uHex == 1 ? sdHex(p, vHalf.x, k) : sdBox(p, vHalf, k);
}
// frame.ts's inkColour.
vec3 inkTint(vec3 c) {
  float l = lum(c), k = ${INK.chroma.toFixed(4)};
  for (int i = 0; i < 3; i++) {
    if (c[i] > l + 1e-6) k = min(k, (1.0 - l) / (c[i] - l));
    else if (c[i] < l - 1e-6) k = min(k, l / (l - c[i]));
  }
  c = vec3(l) + (c - vec3(l)) * k;
  if (uDark == 0) return c * ${INK.deep.toFixed(4)};
  float m = max(c.r, max(c.g, c.b));
  return m > 1e-4 ? min(c * ((1.0 / m) * ${INK.lift.toFixed(4)} + ${(1 - INK.lift).toFixed(4)}), vec3(1.0)) : c;
}
void main() {
  if (uKind == 4) {
    // ink (frame.ts's inkColour): the character in its side's colour, chroma pushed out within gamut,
    // lifted toward full brightness on a dark look (deepened on a light one), then lit; drawn over.
    vec3 base = inkTint(vFill);
    vec3 col = shade(base, vec3(0.0, 0.0, 1.0), vWorld, 0.0);
    col = mix(col, base * 1.15 + lightAt(vWorld, 0.0) * 0.3, vEmit);
    vec2 slot = vec2(mod(vSlot, ${ATLAS_COLS}.0), floor(vSlot / ${ATLAS_COLS}.0));
    float g = texture(uAtlas, (slot + clamp(vP / uCell + 0.5, 0.0, 1.0)) / vec2(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0)).a;
    if (g < 0.002) discard;
    o = vec4(min(col * vBody, vec3(1.0)) * g, g);
    return;
  }
  if (uKind == 1) {
    // ascii, lit flat: the picture's colour under the scene's lights and the torch.
    vec3 col = shade(vFill, vec3(0.0, 0.0, 1.0), vWorld, 0.0);
    col = mix(col, vFill * 1.15 + lightAt(vWorld, 0.0) * 0.3, vEmit);
    vec2 slot = vec2(mod(vSlot, ${ATLAS_COLS}.0), floor(vSlot / ${ATLAS_COLS}.0));
    float g = texture(uAtlas, (slot + clamp(vP / uCell + 0.5, 0.0, 1.0)) / vec2(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0)).a;
    if (vBody > 0.5) {
      // The block, with a seam round it, and its character cut darker into it.
      float cov = clamp(0.5 - sdBox(vP, vHalf, 0.0) * uDpr, 0.0, 1.0);
      if (cov < 0.002) discard;
      vec3 c = mix(col, col * (uDark == 1 ? ${CUT.dark} : ${CUT.light}), g * 0.92);
      o = vec4(c * cov, cov);
    } else {
      // An edge: the character alone, a little lighter on a dark page so it reads.
      float a = g * vAlpha;
      if (a < 0.002) discard;
      vec3 c = uDark == 1 ? mix(col, vec3(1.0), 0.12) : col * 0.85;
      o = vec4(c * a, a);
    }
    return;
  }
  float d = sd(vP);
  if (uPass == 0) {
    float a = (1.0 - smoothstep(-vBlur, vBlur, d)) * uShadow.a * min(vHeight, 1.0);
    if (a < 0.002) discard;
    o = vec4(uShadow.rgb * a, a);
    return;
  }
  float cov = clamp(0.5 - d * uDpr, 0.0, 1.0) * vAlpha;
  if (cov < 0.002) discard;
  vec3 n = vec3(0.0, 0.0, 1.0);
  if (vHeight > 0.0) {
    // The bevel: steep at the rim, flat on top, with a slight dome, from the distance's own slope.
    float e = 0.5;
    vec2 g = vec2(sd(vP + vec2(e, 0.0)) - sd(vP - vec2(e, 0.0)), sd(vP + vec2(0.0, e)) - sd(vP - vec2(0.0, e)));
    float gl = length(g);
    g = gl > 1e-5 ? g / gl : vec2(0.0);
    float bw = max(min(vHalf.x, vHalf.y) * 0.5, 1.2);
    float t = clamp(-d / bw, 0.0, 1.0);
    float rise = vHeight * min(vHalf.x, vHalf.y) * 0.9;
    n = normalize(vec3(g * (2.0 * (1.0 - t) * rise / bw) + vP / max(vHalf.y, 1.0) * 0.16 * vHeight, 1.0));
  }
  vec3 col = shade(vFill, n, vWorld, uLook.y);
  if (vEmit > 0.0) col = mix(col, vFill * 1.12 + lightAt(vWorld, 0.0) * 0.35, vEmit);
  o = vec4(col * cov, cov);
}`;

/** One triangle over the whole layer: the scene's lights glowing, or (native) the picture itself, lit. */
const SCREEN_VS = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uView;
out vec2 vWorld;
void main() {
  vec2 q = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vWorld = q * uView;
  gl_Position = vec4(q * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
}`;

const SCREEN_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uPic;
uniform vec2 uView;
uniform int uNative;
uniform int uInk;
uniform int uDark;
uniform vec3 uPage;
${LIGHTING}
in vec2 vWorld;
out vec4 o;
void main() {
  vec3 glow = vec3(0.0);
  if (uLit == 1) glow = (lightAt(vWorld, 2.5) * 0.7 + lightAt(vWorld, 4.0) * 0.5) * uLook.w;
  if (uPointer.z > 0.5 && uLook.z > 0.0) {
    float att = max(0.0, 1.0 - distance(vWorld, uPointer.xy) / (uLook.z * 1.4));
    glow += uKey * att * att * 0.05 * uLook.w;
  }
  vec4 col = vec4(glow, 0.0);
  if (uInk == 1) {
    // ink: the ground beneath its characters, the picture dim (washed toward the page, on a light look).
    vec3 p = texture(uPic, vWorld / uSpan).rgb;
    vec3 base = uDark == 1 ? p * ${INK.base.dark} : mix(p, uPage, ${INK.base.light});
    o = vec4(base + glow, 1.0);
    return;
  }
  if (uNative == 1) {
    vec4 s = texture(uPic, vWorld / uView);
    if (s.a > 0.0) {
      vec3 c = shade(s.rgb / s.a, vec3(0.0, 0.0, 1.0), vWorld, 0.0);
      col = vec4(c * s.a + glow * (1.0 - s.a), s.a);
    }
  }
  if (col.r + col.g + col.b + col.a < 0.002) discard;
  o = col;
}`;

/** ink on a dark look: its characters, drawn apart, laid over the ground with their glow (two levels of their own mip chain). */
const INK_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uInk;
uniform vec2 uView;
uniform float uGlowLod;  // the level a quarter of a CSS pixel's resolution sits at: 2 + log2(dpr)
in vec2 vWorld;
out vec4 o;
void main() {
  vec2 uv = vec2(vWorld.x / uView.x, 1.0 - vWorld.y / uView.y);
  vec4 t = textureLod(uInk, uv, 0.0);
  vec3 glow = textureLod(uInk, uv, uGlowLod).rgb * ${INK.glow[0].toFixed(4)} + textureLod(uInk, uv, uGlowLod + 1.0).rgb * ${INK.glow[1].toFixed(4)};
  o = vec4(t.rgb + glow, t.a);
}`;

const OVERLAY_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
layout(location = 1) in float aSlot;
layout(location = 2) in vec4 aCol;
layout(location = 3) in float aScale;
uniform vec2 uView;
uniform vec2 uCell;
out vec2 vLocal;
out vec4 vCol;
flat out float vSlot;
flat out float vR;
const vec2 Q[6] = vec2[6](vec2(0,0), vec2(1,0), vec2(0,1), vec2(0,1), vec2(1,0), vec2(1,1));
void main() {
  vec2 q = Q[gl_VertexID];
  vec2 box;
  if (aSlot < 0.0) { float soft = -aSlot - 1.0; vR = aScale; box = vec2(aScale * (1.0 + soft) * 2.0 + 2.0); }
  else { vR = 0.0; box = uCell * aScale; }
  vec2 pos = aPos + (q - 0.5) * box;
  gl_Position = vec4(pos / uView * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
  vLocal = aSlot < 0.0 ? (q - 0.5) * box : q;
  vCol = aCol; vSlot = aSlot;
}`;

const OVERLAY_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uAtlas;
uniform float uDpr;
in vec2 vLocal;
in vec4 vCol;
flat in float vSlot;
flat in float vR;
out vec4 o;
void main() {
  float g;
  if (vSlot < 0.0) {
    float soft = -vSlot - 1.0, r = length(vLocal);
    float core = clamp(0.5 - (r - vR) * uDpr, 0.0, 1.0);
    float halo = soft > 0.0 ? pow(clamp(1.0 - (r - vR) / (vR * soft), 0.0, 1.0), 2.0) * 0.55 : 0.0;
    g = max(core, halo) * vCol.a;
  } else {
    vec2 slot = vec2(mod(vSlot, ${ATLAS_COLS}.0), floor(vSlot / ${ATLAS_COLS}.0));
    g = texture(uAtlas, (slot + vLocal) / vec2(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0)).a * vCol.a;
  }
  if (g < 0.002) discard;
  o = vec4(vCol.rgb * g, g);
}`;

/** The overlay's strokes: one instanced quad each, round-ended, its coverage from its distance to the segment. */
const STROKE_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec4 aSeg;
layout(location = 1) in vec4 aCol;
layout(location = 2) in float aWidth;
uniform vec2 uView;
out vec2 vP;
flat out vec4 vSeg;
flat out vec4 vCol;
flat out float vR;
const vec2 Q[6] = vec2[6](vec2(0,0), vec2(1,0), vec2(0,1), vec2(0,1), vec2(1,0), vec2(1,1));
void main() {
  vec2 a = aSeg.xy, d = aSeg.zw - aSeg.xy;
  float L = length(d), r = aWidth * 0.5 + 1.0;
  vec2 u = L > 1e-4 ? d / L : vec2(1.0, 0.0), n = vec2(-u.y, u.x), q = Q[gl_VertexID];
  vec2 pos = a + u * mix(-r, L + r, q.x) + n * mix(-r, r, q.y);
  gl_Position = vec4(pos / uView * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
  vP = pos; vSeg = aSeg; vCol = aCol; vR = aWidth * 0.5;
}`;

const STROKE_FS = /* glsl */ `#version 300 es
precision highp float;
uniform float uDpr;
in vec2 vP;
flat in vec4 vSeg;
flat in vec4 vCol;
flat in float vR;
out vec4 o;
void main() {
  vec2 pa = vP - vSeg.xy, ba = vSeg.zw - vSeg.xy;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  float cov = clamp(0.5 - (length(pa - ba * h) - vR) * uDpr, 0.0, 1.0) * vCol.a;
  if (cov < 0.002) discard;
  o = vec4(vCol.rgb * cov, cov);
}`;

type Uniforms = Record<string, WebGLUniformLocation | null>;
type Program = { p: WebGLProgram; u: Uniforms };

function program(gl: WebGL2RenderingContext, vs: string, fs: string): Program {
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error("hivescape shader: " + gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error("hivescape program: " + gl.getProgramInfoLog(p));
  const u: Uniforms = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i)!;
    u[info.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

const PROGRAMS = [[CELLS_VS, CELLS_FS], [SCREEN_VS, SCREEN_FS], [OVERLAY_VS, OVERLAY_FS], [SCREEN_VS, INK_FS], [STROKE_VS, STROKE_FS]] as const;

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i;

/** Can this machine draw cells with WebGL2 on a GPU? Tried on a canvas of its own (a canvas that once
 *  had a WebGL context can't give a 2D one), with the real shaders, and refusing software rasterisers. */
export function probeGL(make: () => AnyCanvas, allowSoftware = false): boolean {
  try {
    const gl = make().getContext("webgl2", { failIfMajorPerformanceCaveat: !allowSoftware }) as WebGL2RenderingContext | null;
    if (!gl) return false;
    try {
      if (!allowSoftware) {
        const d = gl.getExtension("WEBGL_debug_renderer_info");
        const name = String(gl.getParameter(d ? d.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
        if (SOFTWARE.test(name)) return false;
      }
      for (const [vs, fs] of PROGRAMS) program(gl, vs, fs);
      return true;
    } finally { gl.getExtension("WEBGL_lose_context")?.loseContext(); }
  } catch { return false; }
}

export class GLBackend implements Backend {
  readonly kind = "webgl2" as const;
  readonly readsPicture = false;
  private gl: WebGL2RenderingContext;
  private cells!: Program;
  private screen!: Program;
  private over!: Program;
  private inkComp!: Program;
  private strokeProg!: Program;
  private strokeVao!: WebGLVertexArrayObject;
  private strokeBuf!: WebGLBuffer;
  private strokeData = new Float32Array(0);
  /** ink on a dark look: its characters are drawn into this first, so their glow can spread past their cells. */
  private inkFbo: WebGLFramebuffer | null = null;
  private inkTex: WebGLTexture | null = null;
  private inkSize = { w: 0, h: 0 };
  private inkFill = new Float32Array(INK_MAX_FILL);
  private inkLevel = new Float32Array(INK_MAX_FILL);
  private inkEdge = new Float32Array(INK_MAX_EDGES);
  private inkShape = new Float32Array(INK_MAX_EDGES * INK_REGIONS);
  private picTex!: WebGLTexture;
  private lightTex!: WebGLTexture;
  private atlasTex!: WebGLTexture;
  private overVao!: WebGLVertexArrayObject;
  private overBuf!: WebGLBuffer;
  private overData = new Float32Array(0);
  private pic = { w: 0, h: 0 };
  private lit = { w: 0, h: 0 };
  private atlasVersion = -1;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private ripA = new Float32Array(MAX_RIPPLES * 4);
  private ripB = new Float32Array(MAX_RIPPLES * 2);
  private ramp = new Float32Array(MAX_RAMP);
  private edges = new Float32Array(EDGES);
  private lost = false;

  /** Throws when WebGL2 is not to be had, or (unless `allowSoftware`) only in software. */
  constructor(private canvas: AnyCanvas, opts: { allowSoftware?: boolean } = {}) {
    const gl = canvas.getContext("webgl2", {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      powerPreference: "low-power", failIfMajorPerformanceCaveat: !opts.allowSoftware, preserveDrawingBuffer: false,
    }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error("hivescape: no WebGL2 here (or only in software)");
    this.gl = gl;
    (canvas as EventTarget).addEventListener("webglcontextlost", (e) => { e.preventDefault(); this.lost = true; });
    (canvas as EventTarget).addEventListener("webglcontextrestored", () => { this.lost = false; this.init(); });
    this.init();
  }

  private init(): void {
    const gl = this.gl;
    [this.cells, this.screen, this.over, this.inkComp, this.strokeProg] = PROGRAMS.map(([vs, fs]) => program(gl, vs, fs)) as [Program, Program, Program, Program, Program];
    this.inkFbo = null; this.inkTex = null; this.inkSize = { w: 0, h: 0 };
    const tex = (min: number, mag: number) => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag);
      return t;
    };
    this.picTex = tex(gl.LINEAR_MIPMAP_NEAREST, gl.LINEAR);
    this.lightTex = tex(gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR);
    this.atlasTex = tex(gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR);
    this.overVao = gl.createVertexArray()!;
    this.overBuf = gl.createBuffer()!;
    gl.bindVertexArray(this.overVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.overBuf);
    const stride = 8 * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0); gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 8); gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 12); gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 28); gl.vertexAttribDivisor(3, 1);
    gl.bindVertexArray(null);
    this.strokeVao = gl.createVertexArray()!;
    this.strokeBuf = gl.createBuffer()!;
    gl.bindVertexArray(this.strokeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.strokeBuf);
    const ss = 9 * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, ss, 0); gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, ss, 16); gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, ss, 32); gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);
    this.pic = { w: 0, h: 0 };
    this.lit = { w: 0, h: 0 };
    this.atlasVersion = -1;
  }

  resize(w: number, h: number, dpr: number): void {
    this.w = w; this.h = h; this.dpr = dpr;
    const pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
    if (this.canvas.width !== pw) this.canvas.width = pw;
    if (this.canvas.height !== ph) this.canvas.height = ph;
  }

  /** Upload a canvas into `tex` (resizing it when its size changed) and rebuild its mip chain. */
  private upload(tex: WebGLTexture, src: AnyCanvas, size: { w: number; h: number }, unit: number): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    if (src.width !== size.w || src.height !== size.h) {
      size.w = src.width; size.h = src.height;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src as TexImageSource);
    } else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src as TexImageSource);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  /** The uniforms every lighting pass reads. */
  private lighting(u: Uniforms, f: FrameInput): void {
    const gl = this.gl, { grid, style } = f;
    gl.uniform1i(u.uLight!, 1);
    gl.uniform1i(u.uLit!, f.light ? 1 : 0);
    gl.uniform2f(u.uSpan!, grid.cols * grid.cw, grid.rows * grid.ch);
    gl.uniform2f(u.uCell!, grid.cw, grid.ch);
    gl.uniform3f(u.uKey!, style.key[0] / 255, style.key[1] / 255, style.key[2] / 255);
    gl.uniform4f(u.uLook!, style.ambient, style.gloss, style.torch, style.glow);
    gl.uniform3f(u.uPointer!, f.pointer.x, f.pointer.y, f.pointer.active ? 1 : 0);
    gl.uniform2f(u.uView!, this.w, this.h);
  }

  /** The framebuffer ink's characters are drawn into on a dark look, the canvas's size, mipmapped for the glow. */
  private inkTarget(): WebGLFramebuffer {
    const gl = this.gl, w = this.canvas.width, h = this.canvas.height;
    // Unit 3 is ink's own: binding its texture on whichever unit was active would unbind the atlas there.
    gl.activeTexture(gl.TEXTURE3);
    if (!this.inkFbo || !this.inkTex) {
      this.inkTex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, this.inkTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      this.inkFbo = gl.createFramebuffer()!;
      this.inkSize = { w: 0, h: 0 };
    }
    if (this.inkSize.w !== w || this.inkSize.h !== h) {
      gl.bindTexture(gl.TEXTURE_2D, this.inkTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.inkFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.inkTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.inkSize = { w, h };
    }
    return this.inkFbo;
  }

  draw(f: FrameInput, atlas: Atlas): void {
    const gl = this.gl;
    if (this.lost || gl.isContextLost()) return;
    const { grid, style } = f;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    this.upload(this.picTex, f.picture, this.pic, 0);
    if (f.light) this.upload(this.lightTex, f.light, this.lit, 1);
    else { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.lightTex); }
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    if (atlas.version !== this.atlasVersion) {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas as TexImageSource);
      gl.generateMipmap(gl.TEXTURE_2D);
      this.atlasVersion = atlas.version;
    }

    // The glow of the scene's lights over the ground, or the native picture itself.
    const native = style.kind === "native", ink = style.kind === "ink";
    if (f.light || native || ink || (f.pointer.active && style.torch > 0)) {
      const { p, u } = this.screen;
      gl.useProgram(p);
      gl.uniform1i(u.uPic!, 0);
      gl.uniform1i(u.uNative!, native ? 1 : 0);
      gl.uniform1i(u.uInk!, ink ? 1 : 0);
      gl.uniform1i(u.uDark!, f.look.dark ? 1 : 0);
      gl.uniform3f(u.uPage!, f.look.page[0] / 255, f.look.page[1] / 255, f.look.page[2] / 255);
      this.lighting(u, f);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    if (!native) {
      const { p, u } = this.cells;
      gl.useProgram(p);
      this.lighting(u, f);
      gl.uniform1i(u.uPic!, 0);
      gl.uniform1i(u.uAtlas!, 2);
      gl.uniform2i(u.uGrid!, grid.cols, grid.rows);
      gl.uniform1i(u.uHex!, grid.hex ? 1 : 0);
      gl.uniform1f(u.uLod!, Math.log2(SS) - 1);
      gl.uniform1i(u.uKind!, KIND[style.kind]);
      gl.uniform4f(u.uTile!, style.threshold, style.soft, style.gap, style.radius);
      gl.uniform2f(u.uSurf!, style.relief, style.flicker);
      const sh = style.shadow;
      gl.uniform4f(u.uShadow!, sh ? sh[0] / 255 : 0, sh ? sh[1] / 255 : 0, sh ? sh[2] / 255 : 0, sh ? style.shadowAlpha : 0);
      gl.uniform1f(u.uTime!, f.time);
      gl.uniform1f(u.uDpr!, this.dpr);
      const n = Math.min(MAX_RIPPLES, f.ripples.length);
      for (let k = 0; k < n; k++) {
        const r = f.ripples[f.ripples.length - n + k]!;
        this.ripA.set([r.x, r.y, r.at, r.life], k * 4);
        this.ripB.set([r.speed, r.strength], k * 2);
      }
      gl.uniform1i(u.uRipN!, n);
      if (n) { gl.uniform4fv(u.uRip!, this.ripA); gl.uniform2fv(u.uRip2!, this.ripB); }
      const rampLen = Math.min(MAX_RAMP, f.ramp.length);
      this.ramp.fill(0);
      for (let k = 0; k < rampLen; k++) this.ramp[k] = f.ramp[k]!;
      gl.uniform1fv(u.uRamp!, this.ramp);
      gl.uniform1f(u.uRampLen!, Math.max(1, rampLen));
      for (let k = 0; k < EDGES; k++) this.edges[k] = f.edges[k] ?? 0;
      gl.uniform1fv(u.uEdge!, this.edges);
      gl.uniform1i(u.uDark!, f.look.dark ? 1 : 0);
      gl.uniform1f(u.uSharp!, style.edge);
      const glow = ink && f.look.dark;
      if (ink) {
        const g = f.ink!, nf = Math.min(INK_MAX_FILL, g.fill.length), ne = Math.min(INK_MAX_EDGES, g.edges.length);
        this.inkFill.fill(0); this.inkLevel.fill(0); this.inkEdge.fill(0); this.inkShape.fill(0);
        for (let k = 0; k < nf; k++) { this.inkFill[k] = g.fill[k]!; this.inkLevel[k] = g.levels[k]!; }
        for (let k = 0; k < ne; k++) this.inkEdge[k] = g.edges[k]!;
        this.inkShape.set(g.shapes.subarray(0, ne * INK_REGIONS));
        gl.uniform4fv(u.uInkFill!, this.inkFill);
        gl.uniform4fv(u.uInkLevel!, this.inkLevel);
        gl.uniform1i(u.uInkFillN!, nf);
        gl.uniform4fv(u.uInkEdge!, this.inkEdge);
        gl.uniform4fv(u.uShape!, this.inkShape);
        gl.uniform1i(u.uInkEdgeN!, ne);
        if (glow) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.inkTarget());
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
      }
      const count = grid.cols * grid.rows;
      if (sh && style.relief > 0 && style.kind !== "ascii") { gl.uniform1i(u.uPass!, 0); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count); }
      gl.uniform1i(u.uPass!, 1);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
      if (glow) {
        // The characters, then their glow from two levels of their own mip chain, over the ground.
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, this.inkTex);
        gl.generateMipmap(gl.TEXTURE_2D);
        const c = this.inkComp;
        gl.useProgram(c.p);
        gl.uniform1i(c.u.uInk!, 3);
        gl.uniform2f(c.u.uView!, this.w, this.h);
        // The glow spreads as far in CSS pixels as the 2D path's (a quarter and an eighth of the CSS size), whatever the pixel ratio.
        gl.uniform1f(c.u.uGlowLod!, 2 + Math.log2(Math.max(1, this.dpr)));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }

    // The overlay's strokes, then its exact characters and dots where the scene put them.
    const o = f.overlay;
    if (o.sn) {
      if (this.strokeData.length < o.sn * 9) this.strokeData = new Float32Array(Math.max(o.sn * 9, this.strokeData.length * 2));
      const d = this.strokeData;
      for (let i = 0; i < o.sn; i++) {
        d.set(o.seg.subarray(i * 4, i * 4 + 4), i * 9);
        d.set(o.srgba.subarray(i * 4, i * 4 + 4), i * 9 + 4);
        d[i * 9 + 8] = o.swidth[i]!;
      }
      const sp = this.strokeProg;
      gl.useProgram(sp.p);
      gl.uniform2f(sp.u.uView!, this.w, this.h);
      gl.uniform1f(sp.u.uDpr!, this.dpr);
      gl.bindVertexArray(this.strokeVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.strokeBuf);
      gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, o.sn * 9), gl.STREAM_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, o.sn);
      gl.bindVertexArray(null);
    }
    if (o.n) {
      if (this.overData.length < o.n * 8) this.overData = new Float32Array(Math.max(o.n * 8, this.overData.length * 2));
      const d = this.overData;
      for (let i = 0; i < o.n; i++) {
        const b = i * 8;
        d[b] = o.x[i]!; d[b + 1] = o.y[i]!; d[b + 2] = o.slot[i]!;
        d[b + 3] = o.rgba[i * 4]!; d[b + 4] = o.rgba[i * 4 + 1]!; d[b + 5] = o.rgba[i * 4 + 2]!; d[b + 6] = o.rgba[i * 4 + 3]!;
        d[b + 7] = o.scale[i]!;
      }
      const ov = this.over;
      gl.useProgram(ov.p);
      gl.uniform1i(ov.u.uAtlas!, 2);
      gl.uniform2f(ov.u.uView!, this.w, this.h);
      gl.uniform2f(ov.u.uCell!, grid.cw, grid.ch);
      gl.uniform1f(ov.u.uDpr!, this.dpr);
      gl.bindVertexArray(this.overVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.overBuf);
      gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, o.n * 8), gl.STREAM_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, o.n);
      gl.bindVertexArray(null);
    }
  }

  destroy(): void {
    const gl = this.gl;
    for (const t of [this.picTex, this.lightTex, this.atlasTex, this.inkTex]) if (t) gl.deleteTexture(t);
    if (this.inkFbo) gl.deleteFramebuffer(this.inkFbo);
    gl.deleteBuffer(this.overBuf);
    gl.deleteVertexArray(this.overVao);
    gl.deleteBuffer(this.strokeBuf);
    gl.deleteVertexArray(this.strokeVao);
    for (const pr of [this.cells, this.screen, this.over, this.inkComp, this.strokeProg]) gl.deleteProgram(pr.p);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
