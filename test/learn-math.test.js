'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// web/static/app.js is a plain (non-module) browser script full of DOM/
// window-dependent code, so there is no existing way to `require()` it in
// a Node test. Rather than duplicate learnMd()/renderMathLatex()'s regexes
// into this test file -- which would test a copy, not the real code, and
// silently drift the moment app.js changes -- this loads the actual file
// into a `vm` context with a generic "auto-mock" DOM. Every property
// access on a mocked element (document, document.body, ...) returns a
// callable auto-mock too, so arbitrary chains like
// `document.body.classList.toggle(...)` used by app.js's top-level
// initialization code no-op instead of throwing. learnMd()/
// renderMathLatex() are pure string transforms -- they never touch the
// DOM -- so none of this mocking affects what is actually under test.
function autoMock() {
  const target = function () {};
  const handler = {
    get(t, prop) {
      if (prop === Symbol.toPrimitive) return () => '';
      if (prop === 'toString' || prop === 'valueOf') return () => '';
      if (prop === 'then') return undefined; // never look thenable to await/Promise machinery
      if (!(prop in t)) t[prop] = autoMock();
      return t[prop];
    },
    set(t, prop, value) { t[prop] = value; return true; },
    apply() { return autoMock(); },
  };
  return new Proxy(target, handler);
}

let cachedApp = null;
function loadApp() {
  if (cachedApp) return cachedApp;

  const appJsPath = path.join(__dirname, '..', 'web', 'static', 'app.js');
  const src = fs.readFileSync(appJsPath, 'utf8');

  const documentStub = autoMock();
  documentStub.body = autoMock();
  documentStub.documentElement = autoMock();
  documentStub.readyState = 'complete';

  const sandbox = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    document: documentStub,
    navigator: { userAgent: 'node-test', clipboard: { writeText: async () => {} } },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { href: 'http://localhost/', search: '', pathname: '/', origin: 'http://localhost', hash: '' },
    history: { pushState() {}, replaceState() {} },
    URL, URLSearchParams,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    fetch: async () => ({ ok: false, json: async () => ({}) }),
    WebSocket: class { constructor() {} send() {} close() {} },
    Image: class { constructor() {} },
    FormData: class { append() {} },
    addEventListener() {}, removeEventListener() {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'app.js' });

  cachedApp = sandbox;
  return sandbox;
}

// FL26091210: `Target: $> 1.4x$`, in the applied-financial-intelligence
// "Compounding Velocity" module, rendered as literal dollar-sign text
// instead of maths. Root cause: learnMd()'s inline-math extraction regex
// required the closing `$` to be followed by whitespace or one of
// `.,;:)` (or end of string) -- a guard meant to stop prose currency
// mentions ("$50 today... $100 tomorrow") from pairing up as fake math.
// But the module's "Target:" line is bolded (`**Target: $> 1.4x$**`), so
// the `$` sits directly against the closing `**`, which the old boundary
// class didn't recognise -- the regex silently didn't match, and the raw
// `$> 1.4x$` text fell through to plain escaped output. The block-math
// ($$...$$) extraction pass running first, and renderMathLatex()'s
// no-katex fallback, were both investigated and ruled out: neither
// swallows or reintroduces a bare "$" once a match happens (or doesn't).

test('learnMd renders inline math whose closing $ touches a bold marker (the exact FL26091210 shape), alongside a $$ block equation earlier in the same document', () => {
  const app = loadApp();
  const md = [
    '## Compounding Velocity',
    '',
    'Compounding multiplies principal by $$FV = PV(1+r)^t$$ over the holding period.',
    '',
    '**Target: $> 1.4x$**',
    '',
    "That's the bar for this module.",
  ].join('\n');

  const html = app.learnMd(md, 'applied-financial-intelligence');

  // The literal, unrendered dollar signs (escaped or not) must not survive.
  assert.equal(html.includes('$&gt; 1.4x$'), false, 'inline math leaked as literal escaped dollar-sign text');
  assert.equal(html.includes('$> 1.4x$'), false, 'inline math leaked as literal dollar-sign text');

  // It must instead have been extracted and wrapped as inline math.
  assert.match(html, /<span class="math-inline-badge">/);
  // And the preceding block equation must still render as a block, not get
  // swallowed into (or swallow) the inline expression that follows it.
  assert.match(html, /<div class="math-block-card">/);
  assert.match(html, /FV = PV\(1\+r\)<sup>t<\/sup>/);
});

test('learnMd renders inline math whose $ sits directly against a table pipe', () => {
  const app = loadApp();
  const md = '| Metric | Value |\n|---|---|\n| Target |$> 1.4x$|\n';

  const html = app.learnMd(md, 'applied-financial-intelligence');

  assert.equal(html.includes('$> 1.4x$'), false);
  assert.match(html, /<span class="math-inline-badge">/);
});

test('learnMd still refuses to pair up two unrelated prose currency mentions as math (the boundary widening must not reopen this false-positive)', () => {
  const app = loadApp();
  const md = 'Save $50 today. Also $100 tomorrow.';

  const html = app.learnMd(md, 'applied-financial-intelligence');

  assert.equal(html.includes('math-inline-badge'), false, 'currency text was mistakenly treated as inline math');
  assert.match(html, /\$50/);
  assert.match(html, /\$100/);
});

test('learnMd extracts a genuinely standalone inline expression unchanged (baseline, unaffected by the boundary fix)', () => {
  const app = loadApp();
  const html = app.learnMd('The growth rate is $r$ per period.', 'applied-financial-intelligence');

  assert.equal(html.includes('$r$'), false);
  assert.match(html, /<span class="math-inline-badge">/);
});

test('renderMathLatex\'s no-katex fallback never reintroduces a literal "$" -- confirms the leak was an extraction failure, not a rendering one', () => {
  const app = loadApp();
  assert.equal(app.window.katex, undefined, 'test sandbox must not have katex, to exercise the fallback path');

  const out = app.renderMathLatex('> 1.4x', false);
  assert.equal(out.includes('$'), false);
  assert.match(out, /class="m-inline-eq"/);
});
