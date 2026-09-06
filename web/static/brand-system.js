'use strict';
/**
 * iSconl's design-token engine, ported from QSpace Pages'
 * app/lib/core/style/{brand_config.dart, app_theme.dart} -- the same
 * seeds-in, palette-out architecture: a handful of brand inputs (color
 * seeds, font roles, the wordmark split) regenerate everything downstream,
 * instead of every shade being a separately hand-picked hex value.
 *
 * Scope note: QSpace's engine also derives dark-mode BACKGROUND/SURFACE hues
 * from the primary seed (tinting the whole canvas toward the brand hue).
 * iSconl's neutral GitHub-dark palette (--bg, --panel, --border, etc.) is
 * deliberately kept as authored constants in style.css rather than re-derived
 * here -- that palette is already approved and untinted, and re-deriving it
 * from the green seed would visibly shift it toward green, which nobody
 * asked for. What IS ported and actually regenerates: the accent seeds
 * (primary/secondary/tertiary) and their light/dark/on-color variants.
 */

// ── ColorEngine — HSL derivation primitives, 1:1 with QSpace's _ColorEngine ──
const ColorEngine = (() => {
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToHex({ r, g, b }) {
    const c = v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
    return `#${c(r)}${c(g)}${c(b)}`;
  }

  function rgbToHsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    const d = max - min;
    if (d !== 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case r: h = 60 * (((g - b) / d) % 6); break;
        case g: h = 60 * ((b - r) / d + 2); break;
        case b: h = 60 * ((r - g) / d + 4); break;
      }
    }
    if (h < 0) h += 360;
    return { h, s, l };
  }

  function hslToRgb({ h, s, l }) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
      : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
  }

  const hsl = hex => rgbToHsl(hexToRgb(hex));
  const fromHSL = (h, s, l) => rgbToHex(hslToRgb({ h, s, l }));
  const clamp01 = v => Math.min(1, Math.max(0, v));

  const lighten = (hex, amount) => {
    const c = hsl(hex);
    return fromHSL(c.h, c.s, clamp01(c.l + amount));
  };
  const darken = (hex, amount) => {
    const c = hsl(hex);
    return fromHSL(c.h, c.s, clamp01(c.l - amount));
  };
  const saturate = (hex, amount) => {
    const c = hsl(hex);
    return fromHSL(c.h, clamp01(c.s + amount), c.l);
  };
  const desaturate = (hex, amount) => {
    const c = hsl(hex);
    return fromHSL(c.h, clamp01(c.s - amount), c.l);
  };
  const rotateHue = (hex, degrees) => {
    const c = hsl(hex);
    return fromHSL((c.h + degrees + 360) % 360, c.s, c.l);
  };

  const mix = (aHex, bHex, t) => {
    const a = hexToRgb(aHex), b = hexToRgb(bHex);
    return rgbToHex({
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t,
    });
  };

  // WCAG relative luminance / contrast ratio.
  function luminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }
  function contrastRatio(fgHex, bgHex) {
    const l1 = luminance(fgHex), l2 = luminance(bgHex);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  // WCAG AA-compliant text color for a given background -- white if it clears
  // 4.5:1, otherwise a dark mix, exactly QSpace's onColor().
  function onColor(bgHex) {
    const darkText = mix(darken(bgHex, 0.65), '#000000', 0.55);
    return contrastRatio('#ffffff', bgHex) >= 4.5 ? '#ffffff' : darkText;
  }

  return { hsl, fromHSL, lighten, darken, saturate, desaturate, rotateHue, mix, contrastRatio, onColor };
})();

// ── BrandConfig — the 3 seeds + typography + wordmark, iSconl's tokens ──────
const BrandConfig = {
  primary:   '#3fb950', // green  -- the brand accent
  secondary: '#58a6ff', // cyan   -- info / links
  tertiary:  '#d29922', // amber  -- warnings / live badges

  fontText:   "'Inter', system-ui, -apple-system, sans-serif",
  fontAccent: "'JetBrains Mono', 'Fira Code', monospace",

  // Three-part wordmark for "iSconlhub": bold "i" (with the brand node as its
  // dot), light "Sconl", bold "hub" -- adapted from QSpace's two-part
  // wordBold/wordLight split to the three-part mark this brand actually uses.
  wordI:    'i',
  wordMid:  'Sconl',
  wordHub:  'hub',
};

// ── Apply: compute the derived palette and set it as CSS custom properties ──
function applyBrandSystem() {
  const root = document.documentElement.style;
  const E = ColorEngine, C = BrandConfig;

  const set = (name, value) => root.setProperty(name, value);

  set('--primary', C.primary);
  set('--primary-light', E.lighten(C.primary, 0.15));
  set('--primary-dark', E.darken(C.primary, 0.15));
  set('--primary-deep', E.darken(C.primary, 0.30));
  set('--on-primary', E.onColor(C.primary));

  set('--secondary', C.secondary);
  set('--secondary-light', E.lighten(C.secondary, 0.15));
  set('--secondary-dark', E.darken(C.secondary, 0.15));
  set('--on-secondary', E.onColor(C.secondary));

  set('--tertiary', C.tertiary);
  set('--tertiary-light', E.lighten(C.tertiary, 0.15));
  set('--tertiary-dark', E.darken(C.tertiary, 0.15));
  set('--on-tertiary', E.onColor(C.tertiary));
}

if (typeof document !== 'undefined') applyBrandSystem();
