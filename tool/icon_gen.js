#!/usr/bin/env node
// Generates Android launcher icons.
// Default art: the iSconl favicon design (ring + gradient arc + dot triple).
// Custom art: drop a square PNG at branding/icon.png (8-bit RGB/RGBA,
// transparent background recommended) and it is adopted instead.
// Pure Node (zlib only) - no dependencies. Run: node tool/icon_gen.js
'use strict';
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ---------- PNG encoder ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- scene (favicon.svg geometry, 64-unit design space) ----------
const BG = [0x0d, 0x11, 0x17];
const RING = [0x21, 0x26, 0x2d];
const G1 = [0x3f, 0xb9, 0x50]; // #3fb950
const G2 = [0x23, 0x86, 0x36]; // #238636
const GB = [0x56, 0xd3, 0x64]; // #56d364

function lerp(a, b, t) { return a + (b - a) * t; }
function mixc(c1, c2, t) { return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]; }

// Returns [r,g,b,a] for a point in 64-space; layers composited in order.
function sample(x, y, opts) {
  let r = 0, g = 0, b = 0, a = 0;
  const put = (c, ca) => {
    if (ca <= 0) return;
    const na = ca + a * (1 - ca);
    r = (c[0] * ca + r * a * (1 - ca)) / na;
    g = (c[1] * ca + g * a * (1 - ca)) / na;
    b = (c[2] * ca + b * a * (1 - ca)) / na;
    a = na;
  };
  const aa = 0.75; // edge softness in design units
  const cov = (d) => Math.max(0, Math.min(1, 0.5 - d / aa));
  if (opts.background) {
    // rounded rect 64x64 r16
    const rr = 16, hw = 32;
    const qx = Math.abs(x - 32) - (hw - rr), qy = Math.abs(y - 32) - (hw - rr);
    const dOut = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr;
    put(BG, cov(dOut));
  }
  const mono = opts.mono;
  const cx = 32, cy = 32, R = 24, W = 4;
  const dc = Math.hypot(x - cx, y - cy);
  // full ring
  put(mono ? [255, 255, 255] : RING, cov(Math.abs(dc - R) - W / 2) * (mono ? 0.45 : 1));
  // gradient arc: angle -90deg (top) to 0deg (right)
  const ang = Math.atan2(y - cy, x - cx); // -PI..PI, -PI/2 = top
  if (ang >= -Math.PI / 2 && ang <= 0) {
    const t = (ang + Math.PI / 2) / (Math.PI / 2);
    put(mono ? [255, 255, 255] : mixc(G1, G2, t), cov(Math.abs(dc - R) - W / 2));
  }
  // round caps at (32,8) and (56,32)
  put(mono ? [255, 255, 255] : G1, cov(Math.hypot(x - 32, y - 8) - W / 2));
  put(mono ? [255, 255, 255] : G2, cov(Math.hypot(x - 56, y - 32) - W / 2));
  // three dots
  put(mono ? [255, 255, 255] : G1, cov(Math.hypot(x - 32, y - 20) - 4));
  put(mono ? [255, 255, 255] : GB, cov(Math.hypot(x - 32, y - 32) - 6));
  put(mono ? [255, 255, 255] : G2, cov(Math.hypot(x - 32, y - 44) - 4));
  return [r, g, b, a];
}

// Render size px canvas; art occupies `artFrac` of canvas, centered.
function render(size, { background, mono, artFrac }) {
  const ss = 3; // supersample
  const rgba = Buffer.alloc(size * size * 4);
  const scale = (size * artFrac) / 64;
  const off = (size - 64 * scale) / 2;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = (px + (sx + 0.5) / ss - off) / scale;
          const y = (py + (sy + 0.5) / ss - off) / scale;
          const [cr, cg, cb, ca] = sample(x, y, { background, mono });
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      }
      const n = ss * ss;
      const i = (py * size + px) * 4;
      if (a > 0) {
        rgba[i] = Math.round(r / a);
        rgba[i + 1] = Math.round(g / a);
        rgba[i + 2] = Math.round(b / a);
      }
      rgba[i + 3] = Math.round((a / n) * 255);
    }
  }
  return encodePng(size, size, rgba);
}

// ---------- optional custom source (branding/icon.png) ----------
function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8, w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2) || interlace) {
    throw new Error('branding/icon.png must be 8-bit RGB or RGBA, non-interlaced');
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(w * h * 4);
  const prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? line[x - bpp] : 0;
      const up = prev[x];
      const ul = x >= bpp ? prev[x - bpp] : 0;
      switch (filter) {
        case 1: line[x] = (line[x] + left) & 0xff; break;
        case 2: line[x] = (line[x] + up) & 0xff; break;
        case 3: line[x] = (line[x] + ((left + up) >> 1)) & 0xff; break;
        case 4: line[x] = (line[x] + paeth(left, up, ul)) & 0xff; break;
      }
    }
    line.copy(prev);
    for (let x = 0; x < w; x++) {
      const si = x * bpp, di = (y * w + x) * 4;
      out[di] = line[si]; out[di + 1] = line[si + 1]; out[di + 2] = line[si + 2];
      out[di + 3] = bpp === 4 ? line[si + 3] : 255;
    }
  }
  return { width: w, height: h, rgba: out };
}
// Bilinear sample of the custom image in premultiplied space.
function sampleImage(img, u, v) {
  if (u < 0 || v < 0 || u > 1 || v > 1) return [0, 0, 0, 0];
  const fx = u * (img.width - 1), fy = v * (img.height - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, img.width - 1), y1 = Math.min(y0 + 1, img.height - 1);
  const tx = fx - x0, ty = fy - y0;
  const px = (x, y) => {
    const i = (y * img.width + x) * 4;
    const a = img.rgba[i + 3] / 255;
    return [img.rgba[i] * a, img.rgba[i + 1] * a, img.rgba[i + 2] * a, a];
  };
  const mix = (p, q, t) => p.map((v0, i) => v0 + (q[i] - v0) * t);
  const top = mix(px(x0, y0), px(x1, y0), tx);
  const bot = mix(px(x0, y1), px(x1, y1), tx);
  const [r, g, b, a] = mix(top, bot, ty);
  return a > 0 ? [r / a, g / a, b / a, a] : [0, 0, 0, 0];
}
function renderFromImage(img, size, { background, mono, artFrac }) {
  const rgba = Buffer.alloc(size * size * 4);
  const art = size * artFrac;
  const off = (size - art) / 2;
  for (let py = 0; py < size; py++) {
    for (let px2 = 0; px2 < size; px2++) {
      let [r, g, b, a] = sampleImage(img, (px2 - off) / art, (py - off) / art);
      if (mono) { r = 255; g = 255; b = 255; }
      if (background && a < 1) {
        r = r * a + BG[0] * (1 - a);
        g = g * a + BG[1] * (1 - a);
        b = b * a + BG[2] * (1 - a);
        a = 1;
      }
      const i = (py * size + px2) * 4;
      rgba[i] = Math.round(r); rgba[i + 1] = Math.round(g);
      rgba[i + 2] = Math.round(b); rgba[i + 3] = Math.round(a * 255);
    }
  }
  return encodePng(size, size, rgba);
}

const brandingPath = path.join(__dirname, '..', 'branding', 'icon.png');
let custom = null;
if (fs.existsSync(brandingPath)) {
  try {
    custom = decodePng(fs.readFileSync(brandingPath));
    console.log('using custom branding/icon.png', `${custom.width}x${custom.height}`);
  } catch (e) {
    console.warn('branding/icon.png ignored:', e.message, '- using default art');
  }
}
const draw = (size, opts) =>
  custom ? renderFromImage(custom, size, opts) : render(size, opts);

const res = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, m] of Object.entries(densities)) {
  const dir = path.join(res, `mipmap-${d}`);
  fs.mkdirSync(dir, { recursive: true });
  // legacy launcher icon: art with baked background
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), draw(Math.round(48 * m), { background: true, mono: false, artFrac: 1 }));
  // adaptive layers (108dp canvas, art within ~62% for the 66dp safe zone)
  fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), draw(Math.round(108 * m), { background: false, mono: false, artFrac: 0.56 }));
  fs.writeFileSync(path.join(dir, 'ic_launcher_monochrome.png'), draw(Math.round(108 * m), { background: false, mono: true, artFrac: 0.56 }));
}
const anydpi = path.join(res, 'mipmap-anydpi-v26');
fs.mkdirSync(anydpi, { recursive: true });
fs.writeFileSync(path.join(anydpi, 'ic_launcher.xml'), `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`);
const values = path.join(res, 'values');
fs.mkdirSync(values, { recursive: true });
fs.writeFileSync(path.join(values, 'ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0d1117</color>
</resources>
`);
console.log('icons written to', res);
