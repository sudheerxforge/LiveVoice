// Draws the LiveVoice app icon and writes the Android launcher PNGs (legacy,
// round and adaptive foreground/background) plus a 512px store/web icon.
// Pure Node, no dependencies: node scripts/generate-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const WEB = path.join(__dirname, '..', '..', 'web');

// ---- tiny PNG encoder ----
function crc32(buf) {
  return zlib.crc32(buf) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- colour helpers (premultiplied-free simple "over" compositing) ----
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const C = {
  navyTop: hex('#1B2358'),
  navyBottom: hex('#0A0E22'),
  violet: hex('#9B6BFF'),
  blue: hex('#4F8CFF'),
  pink: hex('#FF6BB5'),
  deep: hex('#4B2FC4'),
  light: hex('#D2C2FF'),
  white: [1, 1, 1],
};
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * Math.min(1, Math.max(0, t)));
// Composite colour c with alpha a over [r,g,b,A] (non-premultiplied).
function over(dst, c, a) {
  const A = a + dst[3] * (1 - a);
  if (A <= 0) return [0, 0, 0, 0];
  return [
    (c[0] * a + dst[0] * dst[3] * (1 - a)) / A,
    (c[1] * a + dst[1] * dst[3] * (1 - a)) / A,
    (c[2] * a + dst[2] * dst[3] * (1 - a)) / A,
    A,
  ];
}
const clamp01 = v => Math.min(1, Math.max(0, v));
const smooth = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

// ---- the design, in unit coordinates (0..1) ----
function background(x, y) {
  let px = [...mix(C.navyTop, C.navyBottom, y), 1];
  const d = Math.hypot(x - 0.5, y - 0.5);
  px = over(px, C.violet, 0.4 * (1 - smooth(0, 0.62, d)));
  px = over(px, C.blue, 0.18 * (1 - smooth(0, 0.5, Math.hypot(x - 0.2, y - 0.15))));
  px = over(px, C.pink, 0.16 * (1 - smooth(0, 0.5, Math.hypot(x - 0.85, y - 0.9))));
  return px;
}

function capsule(x, y, cx, halfH, r) {
  const dy = Math.max(Math.abs(y - 0.5) - halfH, 0);
  return Math.hypot(x - cx, dy) - r;
}

function foreground(x, y) {
  let px = [0, 0, 0, 0];
  const d = Math.hypot(x - 0.5, y - 0.5);
  // soft glow
  px = over(px, C.violet, 0.28 * (1 - smooth(0.2, 0.46, d)));
  // ripple rings
  const ring = (r, w, a) => {
    const e = 1 - smooth(0, w, Math.abs(d - r));
    return a * e;
  };
  px = over(px, C.violet, ring(0.43, 0.012, 0.45));
  px = over(px, C.blue, ring(0.36, 0.014, 0.6));
  // orb
  const orbR = 0.27;
  const orbEdge = 1 - smooth(orbR - 0.004, orbR + 0.004, d);
  if (orbEdge > 0) {
    const fd = Math.hypot(x - 0.42, y - 0.4) / 0.42; // focus at top-left
    let c = mix(C.light, C.violet, fd * 1.4);
    c = mix(c, C.deep, (fd - 0.7) * 1.3);
    c = mix(c, C.pink, smooth(0.0, 0.55, (x - 0.5) + (y - 0.5)) * 0.35);
    px = over(px, c, orbEdge);
    // highlight
    px = over(px, C.white, 0.22 * (1 - smooth(0, 0.1, Math.hypot(x - 0.42, y - 0.39))) * orbEdge);
  }
  // waveform bars
  const bars = [
    [-0.12, 0.055],
    [-0.06, 0.11],
    [0, 0.16],
    [0.06, 0.11],
    [0.12, 0.055],
  ];
  for (const [dx, h] of bars) {
    const sd = capsule(x, y, 0.5 + dx, h, 0.019);
    px = over(px, C.white, 0.96 * (1 - smooth(-0.003, 0.003, sd)));
  }
  return px;
}

// ---- rasteriser with 3x3 supersampling ----
function render(size, pixelFn) {
  const out = Buffer.alloc(size * size * 4);
  const SS = 3;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sj = 0; sj < SS; sj++) {
        for (let si = 0; si < SS; si++) {
          const px = pixelFn((i + (si + 0.5) / SS) / size, (j + (sj + 0.5) / SS) / size);
          r += px[0] * px[3];
          g += px[1] * px[3];
          b += px[2] * px[3];
          a += px[3];
        }
      }
      const n = SS * SS;
      const o = (j * size + i) * 4;
      if (a > 0) {
        out[o] = Math.round((r / a) * 255);
        out[o + 1] = Math.round((g / a) * 255);
        out[o + 2] = Math.round((b / a) * 255);
      }
      out[o + 3] = Math.round((a / n) * 255);
    }
  }
  return out;
}

// Full legacy icon: background + artwork, masked.
const full = (x, y) => {
  const bg = background(x, y);
  const fg = foreground(x, y);
  return over(bg, [fg[0], fg[1], fg[2]], fg[3]);
};
const maskRound = fn => (x, y) => {
  const a = 1 - smooth(0.495, 0.5, Math.hypot(x - 0.5, y - 0.5));
  const p = fn(x, y);
  return [p[0], p[1], p[2], p[3] * a];
};
const maskSquircle = fn => (x, y) => {
  const r = 0.22;
  const qx = Math.abs(x - 0.5) - (0.5 - r);
  const qy = Math.abs(y - 0.5) - (0.5 - r);
  const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
  const a = 1 - smooth(-0.004, 0.001, sd);
  const p = fn(x, y);
  return [p[0], p[1], p[2], p[3] * a];
};
// Adaptive foreground: artwork shrunk into the central safe zone.
const K = 0.72;
const adaptiveFg = (x, y) => foreground((x - 0.5) / K + 0.5, (y - 0.5) / K + 0.5);

const LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const ADAPTIVE = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

function write(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}

for (const [d, size] of Object.entries(LEGACY)) {
  const dir = path.join(RES, `mipmap-${d}`);
  write(path.join(dir, 'ic_launcher.png'), encodePng(size, render(size, maskSquircle(full))));
  write(path.join(dir, 'ic_launcher_round.png'), encodePng(size, render(size, maskRound(full))));
}
for (const [d, size] of Object.entries(ADAPTIVE)) {
  const dir = path.join(RES, `mipmap-${d}`);
  write(path.join(dir, 'ic_launcher_foreground.png'), encodePng(size, render(size, adaptiveFg)));
  write(path.join(dir, 'ic_launcher_background.png'), encodePng(size, render(size, background)));
}
write(
  path.join(RES, 'mipmap-anydpi-v26', 'ic_launcher.xml'),
  Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`),
);
write(
  path.join(RES, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'),
  Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`),
);
// 512px icon for the website and the Play Store listing.
write(path.join(WEB, 'icon-512.png'), encodePng(512, render(512, maskSquircle(full))));
write(path.join(WEB, 'favicon.png'), encodePng(64, render(64, maskSquircle(full))));
console.log('Icons written.');
