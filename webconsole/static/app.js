/**
 * ═══════════════════════════════════════════════════════════════════════════
 * iSconl Sovereign Command Console - Application Logic v5.0
 * Command · Calendar Widget · File Manager · OneDrive · Buffer · M365
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

// ── AUTHENTICATION ───────────────────────────────────────────────────────────
// Single-user agent. The API returns 404 (never 401) to anyone without the token,
// so the client cannot distinguish "wrong token" from "no such service" - that is
// deliberate. The token lives in localStorage and is attached to every request.

const TOKEN_KEY = 'isconl.token';

function getToken()      { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } }
function setToken(t)     { try { localStorage.setItem(TOKEN_KEY, t); } catch {} }
function clearToken()    { try { localStorage.removeItem(TOKEN_KEY); } catch {} }

/**
 * Wrap fetch so every API call carries the token. All existing call sites keep
 * using bare fetch(); this shadows it for same-origin /api paths.
 */
// A page error must never die silently. On 31 Jul a stale cached app.js made
// every document-preview click fail with nothing on screen and nothing in the
// server log - the hardest kind of bug to report. Now any uncaught error
// surfaces as a toast with the message, so what breaks says so, in words.
window.addEventListener('error', (e) => {
  try { showToast(`Page error: ${String(e.message || 'unknown').slice(0, 120)}`, 'error'); } catch {}
});
window.addEventListener('unhandledrejection', (e) => {
  try { showToast(`Page error: ${String(e.reason?.message || e.reason || 'unknown').slice(0, 120)}`, 'error'); } catch {}
});

const _rawFetch = window.fetch.bind(window);
window.fetch = function (input, init = {}) {
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  const isApi = url.startsWith('/api') || url.startsWith('/health');
  if (!isApi) return _rawFetch(input, init);

  const token = getToken();
  const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined) || {});
  if (token && !headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + token);

  return _rawFetch(input, { ...init, headers }).then(r => {
    // A 404 on an API route we know exists means the token is missing or wrong.
    if (r.status === 404 && token && url.startsWith('/api/state')) showTokenGate(true);
    return r;
  });
};

/**
 * Login gate. Offers a rotating Ente Auth code when the instance has a TOTP seed,
 * and the static token otherwise (or as a fallback you can switch to).
 *
 * A code is exchanged for a session token, which is what every later request
 * carries - a 30-second code cannot itself be a bearer credential.
 */
async function showTokenGate(isRetry = false) {
  if (document.getElementById('isconl-token-gate')) return;

  // Ask the server which methods exist. Unauthenticated on purpose; it reveals
  // only which methods are available, never a secret or any session state.
  let methods = { totp: false, token: true, pin: false };
  try {
    const r = await _rawFetch('/api/auth/methods');
    if (r.ok) methods = await r.json();
  } catch (e) {}

  // The PIN is the quick way in from a device with no Ente Auth app on it. It is
  // hidden rather than absent: not shown next to the default method, but reachable
  // from a cold browser without needing anything installed - either by URL
  // (/?pin or /#pin) or by tapping the iSconl wordmark three times.
  const pinAsked = /(^|[?&])pin(=|&|$)/.test(location.search) || location.hash === '#pin';

  const el = document.createElement('div');
  el.id = 'isconl-token-gate';
  el.style.cssText = `position:fixed;inset:0;z-index:99999;display:flex;align-items:center;
    justify-content:center;background:#0E1116;color:#E6E8EB;font-family:Inter,system-ui,sans-serif`;

  const field = (id, ph, type, extra = '') => `
    <input id="${id}" type="${type}" placeholder="${ph}" autocomplete="off" ${extra}
      style="width:100%;padding:.7rem .85rem;border:1px solid #30363d;border-radius:6px;
             background:#0d1117;color:#e6edf3;font-size:.9rem;outline:none;margin-bottom:.75rem"/>`;

  const button = (id, label) => `
    <button id="${id}"
      style="width:100%;padding:.7rem;border:1px solid rgba(240,246,252,.1);border-radius:6px;
             background:#238636;color:#fff;font-weight:600;font-size:.9rem;cursor:pointer"
      onmouseover="this.style.background='#2ea043'" onmouseout="this.style.background='#238636'">${label}</button>`;

  // The PIN box starts open only when it was explicitly asked for; otherwise the
  // default method keeps the focus and the PIN stays out of sight.
  const pinOpen = Boolean(methods.pin && pinAsked);

  el.innerHTML = `
    <div style="max-width:380px;width:100%;padding:2rem">
      <div id="gate-wordmark" style="font-size:1.25rem;font-weight:600;margin-bottom:.35rem;cursor:default;user-select:none">iSconl</div>
      <div id="gate-msg" style="opacity:.6;font-size:.875rem;line-height:1.6;margin-bottom:1.25rem">
        ${isRetry ? 'That did not work. Try again.' : 'This console is private.'}
      </div>

      <div id="gate-totp" style="display:${methods.totp && !pinOpen ? 'block' : 'none'}">
        <div style="opacity:.75;font-size:.8rem;margin-bottom:.5rem">Code from Ente Auth</div>
        ${field('isconl-totp-input', '000000', 'text',
                'inputmode="numeric" maxlength="6" pattern="[0-9]*" style-extra')}
        ${button('isconl-totp-go', 'Sign in')}
        <div id="gate-countdown" style="opacity:.4;font-size:.72rem;margin-top:.6rem;text-align:center"></div>
      </div>

      <div id="gate-token" style="display:${methods.totp || pinOpen ? 'none' : 'block'}">
        ${methods.totp ? '<div style="opacity:.75;font-size:.8rem;margin-bottom:.5rem">Access token</div>' : ''}
        ${field('isconl-token-input', 'Access token', 'password')}
        ${button('isconl-token-go', 'Unlock')}
      </div>

      <div id="gate-pin" style="display:${pinOpen ? 'block' : 'none'}">
        <div style="opacity:.75;font-size:.8rem;margin-bottom:.5rem">Quick PIN</div>
        ${field('isconl-pin-input', '••••', 'password',
                'inputmode="numeric" maxlength="12" pattern="[0-9]*"')}
        ${button('isconl-pin-go', 'Sign in')}
        <div style="opacity:.4;font-size:.72rem;margin-top:.6rem;line-height:1.5">
          Temporary, for devices without Ente Auth. Five tries, then it freezes -
          the Ente Auth code is never affected.
        </div>
      </div>

      ${methods.totp && methods.token ? `
        <div style="text-align:center;margin-top:1rem">
          <a href="#" id="gate-switch" style="color:#7d8590;font-size:.75rem;text-decoration:none">
            Use access token instead</a>
        </div>` : ''}

      <div style="opacity:.4;font-size:.75rem;margin-top:1rem;line-height:1.5">
        ${methods.totp
          ? 'The code rotates every 30 seconds. A session is kept in this browser only.'
          : 'Set <code>ISCONL_TOKEN</code> in the agent\'s environment, or run <code>npm run totp:setup</code> to sign in with Ente Auth instead.'}
      </div>
    </div>`;
  document.body.appendChild(el);

  const msg = el.querySelector('#gate-msg');
  const fail = (text) => {
    msg.textContent = text;
    msg.style.color = '#f85149';
    msg.style.opacity = '1';
  };

  // ── TOTP path ──
  const totpInput = el.querySelector('#isconl-totp-input');
  if (methods.totp && totpInput) {
    // Show how long the current code is still good for, so a code entered at
    // second 29 is not a mystery when it fails.
    const countdown = el.querySelector('#gate-countdown');
    const tick = () => {
      const left = 30 - (Math.floor(Date.now() / 1000) % 30);
      if (countdown) countdown.textContent = `code rotates in ${left}s`;
    };
    tick();
    const timer = setInterval(tick, 1000);

    const submitTotp = async () => {
      const code = totpInput.value.replace(/\D/g, '');
      if (code.length !== 6) { fail('Enter the full 6-digit code.'); return; }
      const btn = el.querySelector('#isconl-totp-go');
      btn.disabled = true; btn.textContent = 'Checking…';
      try {
        const r = await _rawFetch('/api/auth/totp', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.success) {
          fail(d.error || 'Invalid or expired code.');
          totpInput.value = '';
          btn.disabled = false; btn.textContent = 'Sign in';
          totpInput.focus();
          return;
        }
        clearInterval(timer);
        setToken(d.token);
        el.remove();
        location.reload();
      } catch (e) {
        fail('Could not reach the agent.');
        btn.disabled = false; btn.textContent = 'Sign in';
      }
    };
    el.querySelector('#isconl-totp-go').onclick = submitTotp;
    totpInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitTotp(); });
    // Six digits is the whole input, so submit as soon as it is complete.
    totpInput.addEventListener('input', () => {
      totpInput.value = totpInput.value.replace(/\D/g, '').slice(0, 6);
      if (totpInput.value.length === 6) submitTotp();
    });
    if (!pinOpen) totpInput.focus();
  }

  // ── Static token path ──
  const tokenInput = el.querySelector('#isconl-token-input');
  const submitToken = () => {
    const v = tokenInput.value.trim();
    if (!v) return;
    setToken(v);
    el.remove();
    location.reload();
  };
  el.querySelector('#isconl-token-go').onclick = submitToken;
  tokenInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitToken(); });
  if (!methods.totp && !pinOpen) tokenInput.focus();

  // ── PIN path (hidden alternative) ──
  // Unlike the TOTP box this does not auto-submit on length: the PIN has no fixed
  // length, and a wrong guess costs a fifth of the whole budget.
  const pinBox   = el.querySelector('#gate-pin');
  const pinInput = el.querySelector('#isconl-pin-input');
  const submitPin = async () => {
    const pin = pinInput.value.replace(/\D/g, '');
    if (pin.length < 4) { fail('Enter your PIN.'); return; }
    const btn = el.querySelector('#isconl-pin-go');
    btn.disabled = true; btn.textContent = 'Checking…';
    try {
      const r = await _rawFetch('/api/auth/pin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) {
        // Say how many tries are left. A silent freeze on the fifth attempt is
        // the failure mode that wastes a trip to another device.
        const left = typeof d.attemptsLeft === 'number' && !d.lockedOut
          ? ` ${d.attemptsLeft} ${d.attemptsLeft === 1 ? 'try' : 'tries'} left.` : '';
        fail((d.error || 'Incorrect PIN.') + left);
        pinInput.value = '';
        btn.disabled = false; btn.textContent = 'Sign in';
        pinInput.focus();
        return;
      }
      setToken(d.token);
      el.remove();
      location.reload();
    } catch (e) {
      fail('Could not reach the agent.');
      btn.disabled = false; btn.textContent = 'Sign in';
    }
  };
  if (pinInput) {
    el.querySelector('#isconl-pin-go').onclick = submitPin;
    pinInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitPin(); });
    pinInput.addEventListener('input', () => {
      pinInput.value = pinInput.value.replace(/\D/g, '').slice(0, 12);
    });
    if (pinOpen) pinInput.focus();
  }

  // Reveal gesture: three taps on the wordmark. Works on a phone, leaves no
  // visible affordance, and is only wired up when the server actually has a PIN.
  const wordmark = el.querySelector('#gate-wordmark');
  if (wordmark && methods.pin && pinBox) {
    let taps = 0, tapTimer = null;
    wordmark.addEventListener('click', () => {
      taps += 1;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => { taps = 0; }, 900);
      if (taps < 3) return;
      taps = 0;
      const showing = pinBox.style.display !== 'none';
      pinBox.style.display = showing ? 'none' : 'block';
      const totpBox = el.querySelector('#gate-totp');
      const tokBox  = el.querySelector('#gate-token');
      if (!showing) {
        if (totpBox) totpBox.style.display = 'none';
        if (tokBox) tokBox.style.display = 'none';
        pinInput.focus();
      } else {
        if (methods.totp && totpBox) { totpBox.style.display = 'block'; totpInput.focus(); }
        else if (tokBox) { tokBox.style.display = 'block'; tokenInput.focus(); }
      }
    });
  }

  const sw = el.querySelector('#gate-switch');
  if (sw) sw.onclick = (e) => {
    e.preventDefault();
    const totpBox = el.querySelector('#gate-totp');
    const tokBox  = el.querySelector('#gate-token');
    const toToken = totpBox.style.display !== 'none';
    totpBox.style.display = toToken ? 'none' : 'block';
    tokBox.style.display  = toToken ? 'block' : 'none';
    sw.textContent = toToken ? 'Use an Ente Auth code instead' : 'Use access token instead';
    (toToken ? tokenInput : totpInput).focus();
  };
}

/** Verify the stored token before booting the app. */
async function ensureAuthenticated() {
  if (!getToken()) { showTokenGate(false); return false; }
  try {
    const r = await fetch('/api/state');
    if (r.status === 404) { clearToken(); showTokenGate(true); return false; }
    return r.ok;
  } catch { return false; }
}

// ── PANEL FOCUS ──────────────────────────────────────────────────────────────
// Reduces information overload: the region you are working in stays at full
// strength, the rest recede. Focus follows intent - click, keyboard focus, or
// typing. Persisted so the console opens where you left off.

const FOCUS_KEY = 'isconl.focus';
const FOCUS_OFF_KEY = 'isconl.focusMode.off';

function focusEnabled() {
  try { return localStorage.getItem(FOCUS_OFF_KEY) !== '1'; } catch { return true; }
}

function setPanelFocus(region, { persist = true } = {}) {
  const app = document.getElementById('app');
  if (!app || !focusEnabled()) return;
  if (!['sidebar', 'main', 'chat'].includes(region)) return;
  if (app.dataset.focus === region) return;
  app.dataset.focus = region;
  if (persist) { try { localStorage.setItem(FOCUS_KEY, region); } catch {} }
}

function toggleFocusMode() {
  const off = !focusEnabled();
  try { localStorage.setItem(FOCUS_OFF_KEY, off ? '0' : '1'); } catch {}
  document.body.classList.toggle('focus-mode-off', !off);
  if (off) setPanelFocus(localStorage.getItem(FOCUS_KEY) || 'main');
  showToast(off ? 'Focus mode on' : 'Focus mode off', 'info');
}

/** Focus a single card inside the active view; siblings recede. */
function setCardFocus(cardEl) {
  const container = document.getElementById('view-container');
  if (!container || !focusEnabled()) return;
  const already = cardEl.classList.contains('is-focused');
  container.querySelectorAll('.card.is-focused').forEach(c => c.classList.remove('is-focused'));
  if (already) { delete container.dataset.cardFocus; return; }   // click again to release
  cardEl.classList.add('is-focused');
  container.dataset.cardFocus = '1';
}

function initPanelFocus() {
  const app = document.getElementById('app');
  if (!app) return;

  document.body.classList.toggle('focus-mode-off', !focusEnabled());

  const regions = [
    ['.sidebar', 'sidebar'],
    ['.main-content', 'main'],
    ['.chat-rail', 'chat'],
  ];

  for (const [sel, name] of regions) {
    const el = app.querySelector(sel);
    if (!el) continue;
    el.setAttribute('data-focusable', '');
    // Pointer and keyboard both express intent.
    el.addEventListener('pointerdown', () => setPanelFocus(name));
    el.addEventListener('focusin', () => setPanelFocus(name));
  }

  // Typing anywhere focuses the region that owns the input.
  document.addEventListener('input', e => {
    const host = e.target.closest?.('.sidebar, .main-content, .chat-rail');
    if (!host) return;
    setPanelFocus(host.classList.contains('sidebar') ? 'sidebar'
                : host.classList.contains('chat-rail') ? 'chat' : 'main');
  }, true);

  // Clicking a card inside the active view focuses that card.
  const container = document.getElementById('view-container');
  if (container) {
    container.addEventListener('click', e => {
      // Don't hijack clicks on controls inside a card.
      if (e.target.closest('button, a, input, textarea, select, [onclick]')) return;
      const card = e.target.closest('.card');
      if (card) setCardFocus(card);
    });
  }

  // Esc releases card focus; Ctrl/Cmd+. toggles the whole feature.
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && container?.dataset.cardFocus) {
      container.querySelectorAll('.card.is-focused').forEach(c => c.classList.remove('is-focused'));
      delete container.dataset.cardFocus;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '.') { e.preventDefault(); toggleFocusMode(); }
  });

  let saved = 'main';
  try { saved = localStorage.getItem(FOCUS_KEY) || 'main'; } catch {}
  setPanelFocus(saved, { persist: false });
}

// Navigating to a view re-renders it, so any card focus is stale - clear it.
function clearCardFocus() {
  const c = document.getElementById('view-container');
  if (c) { delete c.dataset.cardFocus; }
}

// ── EQUICYCLE ENGINE ─────────────────────────────────────────────────────────

function getEquicycleContext() {
  const today = new Date();
  const month = today.getMonth();
  let eqYear = month < 5 ? today.getFullYear() - 1 : today.getFullYear();
  const june1 = new Date(eqYear, 5, 1);
  const daysAhead = (7 - june1.getDay()) % 7;
  const eqStart = new Date(eqYear, 5, 1 + daysAhead);
  const diffMs = Math.max(0, today - eqStart);
  const daysSince = Math.floor(diffMs / 86400000);
  const cycleNum = Math.floor(daysSince / 28) + 1;
  const dayInCycle = (daysSince % 28) + 1;
  const sprintNum = Math.floor(daysSince / 14) + 1;
  const sprintDay = (daysSince % 14) + 1;
  // Imperative verbs, not abstract nouns. "Momentum" describes a mood you either
  // have or you do not; "Push" tells you what the next 28 days are for. Same
  // one-word elegance, concrete enough to act on before coffee. Mostly a
  // planting-to-harvest arc, which is the shape a year actually has.
  const themes = ['Plant','Push','Climb','Reap','Dig','Weave','Mend','Scout','Scale','Make','Run','Stock','Audit'];
  const theme = themes[Math.min(cycleNum - 1, 12)];
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  const dayOfYear = Math.ceil((today - startOfYear) / 86400000);
  const yearPct = Math.round((dayOfYear / 365) * 100);
  const opts = { weekday:'long', year:'numeric', month:'long', day:'numeric' };
  return {
    gregorian: today.toLocaleDateString('en-US', opts),
    eqYear, cycleNum, dayInCycle, sprintNum, sprintDay, theme,
    dayOfYear, yearPct,
    eqShort: `Cycle ${cycleNum}  ·  Day ${dayInCycle}  ·  ${theme}`,
    sprintShort: `Sprint ${sprintNum}  ·  Day ${sprintDay}`,
  };
}

/**
 * One witty sentence for the top band, always unique.
 *
 * Seeded by the calendar date: the same day reads the same everywhere he opens
 * the console, and no two days read alike - the numbers move daily and the
 * template rotation is keyed to the date on top of that. Days that ARE
 * something (a sprint's last day, a cycle's first, a year milestone, a Friday)
 * get their own sharper lines, because wit that ignores the calendar is just
 * decoration. Dry, one sentence, no em-dashes - the agent is allowed a sense
 * of humour on its own chrome; it stays deadpan only in his outgoing mail.
 */
function wittyCycleLine(ctx) {
  const today = new Date();
  const dateKey = today.toISOString().slice(0, 10);
  let h = 0;
  for (let i = 0; i < dateKey.length; i++) h = ((h * 31) + dateKey.charCodeAt(i)) >>> 0;
  const pick = (arr, salt) => arr[(h + salt * 97) % arr.length];

  const cd = ctx.dayInCycle,  cLeft = 28 - cd;
  const sd = ctx.sprintDay,   sLeft = 14 - sd;
  const dy = ctx.dayOfYear,   yLeft = 365 - dy;
  const th = ctx.theme, sn = ctx.sprintNum, cn = ctx.cycleNum;
  const dow = today.getDay();

  if (sd === 14 && cd === 28) return pick([
    `Cycle ${cn} & Sprint ${sn} close.\nLand the plane tonight\nor name the next runway.`,
    `Final day of cycle & sprint:\nhistory calls it deadline,\ncalendars call it Day ${dy}.`,
  ], 2);
  if (sd === 14) return pick([
    `Last day of Sprint ${sn}.\nShip something real today\nfor the retro to applaud.`,
    `Sprint ${sn} closes tonight;\nwhatever is 90% done\nis still 0% delivered.`,
    `Day 14 of 14:\nthe sprint stops\nnegotiating at midnight.`,
  ], 3);
  if (sd === 13) return pick([
    `Day 13 of 14.\nOne day of runway remains;\nfinish lines do not move.`,
    `Sprint ${sn}, day 13:\nthe polite final notice\narrived this morning.`,
  ], 4);
  if (sd === 1) return pick([
    `Sprint ${sn}, day one:\nfourteen blank days,\nzero excuses on file.`,
    `A fresh sprint opens;\nday 1 of 14 in Cycle ${cn}\n(${th}).`,
  ], 5);
  if (cd === 28) return pick([
    `${th} ends tonight;\nCycle ${cn} hands over keys\nat midnight.`,
    `Day 28 of 28:\nthe cycle files its\nfinal report today.`,
  ], 6);
  if (cd === 1) return pick([
    `Cycle ${cn} begins:\n28 days with ${th}\nwritten on the tin.`,
    `Day 1 of ${th}:\nthe whole cycle is still\nundefeated today.`,
  ], 7);
  if (dy === 183) return `Day 183:\nyear's exact halftime;\neverything is second half.`;
  if (dy % 100 === 0) return `Day ${dy} of the year:\na round milestone number\nchecking if you noticed.`;

  const generic = [
    `${yLeft} days left in the year, and every one of them takes attendance.`,
    `Day ${dy} of 365; the year is watching, but it grades on delivery.`,
    `${th}, day ${cd} of 28 - cycles do not care about moods, only mornings.`,
    `Sprint ${sn}, day ${sd}: fourteen-day fuses burn quietly until they do not.`,
    `The calendar says Day ${dy}; the task board will say what kind.`,
    `${cLeft} days left in ${th} - enough to finish something, not enough to start everything.`,
    `Day ${sd} of the sprint: momentum is just discipline photographed at speed.`,
    `${th} has ${cLeft} days of patience left; use ${sd === 1 ? 'today' : 'day ' + sd} well.`,
    `Day ${dy}: the year keeps a ledger, and today is one line of it.`,
    `Sprint ${sn} is ${sd} days old and already forming opinions.`,
    `${yLeft} days of the year remain - a fortune, if spent one sprint at a time.`,
    `Day ${cd} of 28 in ${th}: the compound interest of ordinary days.`,
    `Nothing special about Day ${dy}, which is exactly why it decides things.`,
  ];
  const friday = [
    `Friday, day ${sd} of Sprint ${sn} - land it before the weekend forgets it.`,
    `Friday audits the week: ${sLeft} sprint days left after the whistle.`,
  ];
  const monday = [
    `Monday, day ${sd} of the sprint: the week is unwritten and the pen is yours.`,
    `Monday reporting for Cycle ${cn} duty - ${th}, day ${cd} of 28.`,
  ];
  if (dow === 5 && (h % 3 === 0)) return pick(friday, 8);
  if (dow === 1 && (h % 3 === 0)) return pick(monday, 9);
  return pick(generic, 1);
}

/**
 * The top band. Date and theme lead; the meters carry the number a countdown
 * exists for - how many days are LEFT in the cycle, the sprint, the year - with
 * progress underneath as texture, not the headline.
 */
function renderEqHeader() {
  // Computed locally, always: the server's snapshot carries a subset of these
  // fields, and a missing dayOfYear renders as NaN in a meter.
  const ctx = getEquicycleContext();
  const dateEl = document.getElementById('eq-date');
  const cycleEl = document.getElementById('eq-cycle');
  const sidebarCopyEl = document.getElementById('sidebar-cycle-copy');

  if (dateEl) dateEl.textContent = ctx.gregorian;
  if (cycleEl) {
    const counts = `Cycle ${ctx.cycleNum} · Day ${ctx.dayInCycle} of 28 · Sprint ${ctx.sprintNum} · Day ${ctx.sprintDay} of 14 · Day ${ctx.dayOfYear} of the year`;
    cycleEl.title = counts;
    cycleEl.innerHTML = `<span class="eq-theme">${escHtml(ctx.theme)}</span>`;
  }
  if (sidebarCopyEl) {
    sidebarCopyEl.innerHTML = escHtml(wittyCycleLine(ctx)).replace(/\n/g, '<br/>');
  }

  const meters = document.getElementById('eq-meters');
  if (!meters) return;
  const yearDays = 364;
  const eqDaysPassed = (ctx.cycleNum - 1) * 28 + ctx.dayInCycle;
  const M = [
    { label: `Sprint ${ctx.sprintNum}`, cur: ctx.sprintDay, total: 14,
      left: 14 - ctx.sprintDay, tip: `Sprint ${ctx.sprintNum} - the fortnight's deadline pressure` },
    { label: `Cycle ${ctx.cycleNum}`,  cur: ctx.dayInCycle, total: 28,
      left: 28 - ctx.dayInCycle, tip: `Cycle ${ctx.cycleNum} · ${ctx.theme} ends in ${28 - ctx.dayInCycle} day${28 - ctx.dayInCycle === 1 ? '' : 's'}` },
    { label: `Year ${String(ctx.eqYear).slice(-2)}`, cur: eqDaysPassed, total: yearDays,
      left: yearDays - eqDaysPassed, tip: `Year ${ctx.eqYear} · Day ${eqDaysPassed} of ${yearDays}` },
  ];
  meters.innerHTML = M.map(m => {
    const pct = Math.min(100, Math.round((m.cur / m.total) * 100));
    // The color answers "how much runway is left": calm green while there is
    // room, amber when the window is closing, red in the final stretch.
    const tone = pct >= 85 ? 'red' : pct >= 60 ? 'amber' : 'green';
    return `
    <div class="eq-meter linked" title="${escHtml(m.tip)} - click to plan against this window"
         onclick="navigate('planning')">
      <div class="eq-meter-top">
        <span class="eq-meter-label">${m.label} <span class="eq-meter-sep">|</span>
          <span class="eq-meter-left tone-${tone}">${m.left} ${m.left === 1 ? 'day' : 'days'} left</span></span>
        <span class="eq-meter-sub">${m.label.startsWith('Year') ? `${pct}%` : `${m.cur}/${m.total}`}</span>
      </div>
      <div class="eq-meter-bar"><div class="tone-${tone}" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
}

// ── STATE ────────────────────────────────────────────────────────────────────

let STATE = {
  time: null, tasks: [], inbox_count: 0, ideas_count: 0, spaces: [],
  services: {
    anthropic:'connected', elevenlabs:'connected', groq:'disconnected',
    github:'connected', jira:'disconnected', whatsapp:'disconnected',
    msgraph:'disconnected', buffer:'disconnected',
    jiraConfig: { host:'', email:'', projectKey:'', hasToken:false },
    groqConfig: { hasKey:false, model:'llama-3.1-70b-versatile' },
    msConfig: { hasClientId:false, hasCreds:false, tenantId:'' },
    bufferConfig: { hasToken:false },
  },
  feed: [],
  github: { user:null, repos:[], notifications:[] },
  jiraIssues: [],
  contributions: null,
  calendarEvents: [],
};

let calendarState = { year: new Date().getFullYear(), month: new Date().getMonth() };

// ── FETCH HELPERS ─────────────────────────────────────────────────────────────

async function fetchState() {
  try { const r = await fetch('/api/state'); if (r.ok) STATE = { ...STATE, ...(await r.json()) }; } catch(e) {}
  // The strip is derived from the same task rows, so it goes stale at exactly the
  // moments state does. Refreshed here rather than per navigation, which keeps view
  // switching instant. Not awaited - the strip filling in a moment later is fine.
  fetchOrientation();
  checkVaultLink();
  // The tag vocabulary drives filters on tasks and the inbox; the people roster
  // drives sender/recipient pickers. One call, cached in STATE.
  try {
    const r = await fetch('/api/tags');
    if (r.ok) { const d = await r.json(); STATE.tags = d.tags || []; STATE.people = d.people || []; }
  } catch {}
}

/**
 * The persistence-layer warning. This machine is a work machine - OneDrive is
 * where the data actually lives - so a broken OneDrive link is not a degraded
 * feature, it is "your work is stranding on someone else's disk". Loud on
 * purpose, first thing after sign-in, gone the moment the link is back.
 */
async function checkVaultLink() {
  let bad = null;
  try {
    const s = await (await fetch('/api/vault/sync/status')).json();
    if (!s.onedrive) bad = 'OneDrive is not connected - nothing is syncing. Your data is only on this work machine until you reconnect (Settings → Microsoft 365).';
    else if (s.status === 'offline') bad = `OneDrive sync is failing (${s.error || 'unreachable'}) - changes are staying on this work machine until it recovers.`;
  } catch { /* server unreachable - the UI has bigger problems than the banner */ }

  let el = document.getElementById('vault-link-banner');
  if (!bad) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'vault-link-banner';
    el.className = 'vault-banner';
    document.body.prepend(el);
  }
  el.textContent = bad;
}
// These three are proxied through to legacy and each hit a real external API
// (GitHub, Jira, calendar) - Jira alone was measured at ~11s (it pages every
// board, not just the first). Not awaited by init() any more: they used to
// block first paint on all three sequentially (13-15s of blank screen before
// anything rendered). Same fire-and-forget-then-repaint pattern as
// fetchOrientation() above - stale/absent beats "nothing shows for 15s".
async function fetchGhSnapshot() {
  try { const r = await fetch('/api/github/snapshot'); if (r.ok) STATE.github = await r.json(); } catch(e) {}
  repaintView(currentView);
}
async function fetchJiraIssues() {
  try { const r = await fetch('/api/jira/issues'); if (r.ok) { const d = await r.json(); STATE.jiraIssues = d.issues || []; } } catch(e) {}
  repaintView(currentView);
}
async function fetchCalendarEvents() {
  try { const r = await fetch('/api/calendar/events'); if (r.ok) { const d = await r.json(); STATE.calendarEvents = d.events || []; } } catch(e) {}
  repaintView(currentView);
}
/**
 * Send one chat turn.
 *
 * Bounded, because it previously was not: a cold local model takes minutes to load
 * its weights, and with no timeout the panel sat on "thinking" indefinitely with no
 * way to tell a slow answer from a dead one. Now the wait is finite and the failure
 * says what actually happened.
 */
const CHAT_TIMEOUT_MS = 180000;

async function postChat(message) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), CHAT_TIMEOUT_MS);
  try {
    const r = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }), signal: ac.signal,
    });
    if (!r.ok) throw new Error(`the agent answered ${r.status}`);
    const d = await r.json();
    // An idea captured mid-conversation should appear in the pipeline without
    // him going to look for it.
    if (d.captured?.length) onIdeasCaptured(d.captured);
    return d.response || 'Nothing came back, which is itself a kind of answer.';
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(
        'Gave up waiting after three minutes. If the local model was cold it is '
      + 'probably loaded by now, so the next question should be quick.');
    }
    throw e;
  } finally { clearTimeout(timer); }
}

// ── EQUICYCLE WHEEL ──────────────────────────────────────────────────────────

function drawEqWheel(ctx, dayInCycle) {
  const cx = 32, cy = 32, r = 26;
  ctx.clearRect(0, 0, 64, 64);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.strokeStyle='#21262d'; ctx.lineWidth=4; ctx.stroke();
  const start = -Math.PI/2;
  ctx.beginPath(); ctx.arc(cx, cy, r, start, start + (dayInCycle/28)*Math.PI*2);
  ctx.strokeStyle='#3fb950'; ctx.lineWidth=4; ctx.lineCap='round'; ctx.stroke();
  ctx.fillStyle='#e6edf3'; ctx.font='600 13px Inter,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(dayInCycle, cx, cy);
}

function renderEqGrid(cycleNum, dayInCycle) {
  const days = Array.from({length:28}, (_,i) => i+1);
  const cell = d => d < dayInCycle ? 'past' : d === dayInCycle ? 'today' : 'future';
  return `<div class="eq-grid-wrap">
    <div class="eq-sprint-label"><span>Sprint ${cycleNum*2-1} · Days 1-14</span><span>Sprint ${cycleNum*2} · Days 15-28</span></div>
    <div class="eq-grid">${days.map(d=>`<div class="eq-day-cell ${cell(d)}" title="Day ${d}"></div>`).join('')}</div>
  </div>`;
}

// ── MINI CALENDAR WIDGET (inline in Command view) ─────────────────────────────

function renderMiniCalendar(year, month, events) {
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const today = new Date();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();

  // Build event lookup by date
  const byDate = {};
  (events || []).forEach(e => {
    if (e.date) { if (!byDate[e.date]) byDate[e.date] = []; byDate[e.date].push(e); }
  });
  (STATE.jiraIssues || []).forEach(i => {
    if (i.created) {
      const d = i.created.slice(0,10);
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push({ title:`[${i.key}]`, type:'jira' });
    }
  });

  const pad = String(month+1).padStart(2,'0');
  let cells = [];
  for (let i = 0; i < firstDay; i++) cells.push('<div class="mc-cell empty"></div>');
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${pad}-${String(d).padStart(2,'0')}`;
    const isToday = today.getFullYear()===year && today.getMonth()===month && today.getDate()===d;
    const hasEvents = byDate[key] && byDate[key].length > 0;
    cells.push(`<div class="mc-cell ${isToday?'mc-today':''} ${hasEvents?'mc-has-events':''}" title="${hasEvents ? byDate[key].map(e=>e.title).join(', ') : ''}" onclick="event.stopPropagation();selectMiniCalDate('${key}')">${d}${hasEvents?`<span class="mc-dot"></span>`:''}</div>`);
  }

  // The whole panel is a door to the full Calendar; the controls inside it
  // (month nav, a specific day, Schedule) keep their own jobs via
  // stopPropagation, so nothing that used to work stops working.
  return `<div class="mini-cal linked" onclick="navigate('calendar')" title="Open the full calendar">
    <div class="mc-header">
      <button class="mc-nav" onclick="event.stopPropagation();prevMiniMonth()">‹</button>
      <span class="mc-month">${monthNames[month]} ${year}</span>
      <button class="mc-nav" onclick="event.stopPropagation();nextMiniMonth()">›</button>
    </div>
    <div class="mc-weekdays"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>
    <div class="mc-grid">${cells.join('')}</div>
    <div class="mc-add">
      <button class="btn btn-ghost" style="width:100%;font-size:0.72rem" onclick="event.stopPropagation();openAddEventModal()">+ Schedule Event</button>
    </div>
  </div>`;
}

// ── COMMAND VIEW (renamed from "Command Center") ──────────────────────────────

// The data-health card: computed checks from /api/health/data, rendered only
// when something actually needs attention. Filled in after paint so the
// command view never waits on it.
async function fetchDataHealth() {
  try {
    const d = await (await fetch('/api/health/data')).json();
    const slot = document.getElementById('data-health-slot');
    if (!slot) return;
    const issues = d.issues || [];
    if (!issues.length) { slot.innerHTML = ''; return; }
    const sevIcon = { critical: '●', warn: '●', info: '○' };
    slot.innerHTML = `
      <div class="card dh-card">
        <div class="card-header"><span class="card-title">Data health</span>
          <span class="card-meta">${issues.length} item${issues.length > 1 ? 's' : ''} need${issues.length > 1 ? '' : 's'} attention</span></div>
        ${issues.map(i => `
          <div class="dh-row dh-${escHtml(i.severity)}">
            <span class="dh-dot">${sevIcon[i.severity] || '○'}</span>
            <span class="dh-text">${escHtml(i.text)}</span>
          </div>`).join('')}
      </div>`;
  } catch { /* the card simply does not render; the endpoint retries next paint */ }
}

function renderToday() {
  setTimeout(fetchDataHealth, 0);
  const ctx = STATE.time || getEquicycleContext();
  // The command view shows only LIVE work. Finished tasks leave this screen
  // entirely (his 29 Jul rule) - they live on as the Archive filter in the
  // dedicated Tasks view, where the record stays complete.
  const tasks = (STATE.tasks || []).filter(t => t.STATUS !== 'done');
  const jc = STATE.services && STATE.services.jiraConfig ? STATE.services.jiraConfig : {};
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Morning Brief' : hour < 18 ? 'Afternoon Checkpoint' : 'Evening Review';
  const todayTasks = tasks.filter(t => t.STATUS==='today').slice(0, 2);
  const taskBullet = todayTasks.length ? todayTasks.map(t=>t.TITLE).join(', ') : 'No high-priority tasks flagged.';

  // Upcoming events (next 5)
  const today = new Date().toISOString().slice(0,10);
  const upcomingEvents = (STATE.calendarEvents || [])
    .filter(e => e.date >= today)
    .sort((a,b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  return `
    <div class="command-hero-grid">
      <!-- Brief + Stats -->
      <div class="command-left">
        <div id="day-card-slot">${renderDayBlocks()}</div>

        <div class="morning-brief">
          <div class="morning-brief-title">${greeting}</div>
          <div class="morning-brief-bullets">
            <div class="morning-brief-bullet linked" title="Open Tasks" onclick="navigate('tasks')">Focus: ${taskBullet}</div>
            <div class="morning-brief-bullet linked" title="${jc.host?'Open Jira board':'Configure Jira in Settings'}" onclick="navigate('${jc.host?'jira':'settings'}')">Jira: <strong>${jc.host||'Not configured'}</strong> · <strong>${STATE.jiraIssues.length}</strong> open issues</div>
            <div class="morning-brief-bullet">
              <span class="linked" title="Open GitHub" onclick="navigate('github')">GitHub: <strong>${STATE.github.repos.length}</strong> repos</span>
              ·
              <span class="linked" title="${STATE.services.msgraph==='connected'?'Open Settings':'Connect Microsoft 365'}" onclick="navigate('settings')">M365: <span style="color:${STATE.services.msgraph==='connected'?'var(--green)':'var(--text-3)'};">${STATE.services.msgraph==='connected'?'Connected':'Not connected'}</span></span>
            </div>
          </div>
        </div>

        <!-- Every tile drills through to the view the number is computed from. -->
        <div class="cards-grid-4">
          <div class="stat-card clickable" role="button" tabindex="0" title="Open Tasks"
               onclick="navigate('tasks')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();navigate('tasks')}">
            <div class="stat-number txt-green">${tasks.filter(t=>t.STATUS==='today').length}</div>
            <div class="stat-label">Today Tasks</div>
          </div>
          <div class="stat-card clickable" role="button" tabindex="0" title="Open Jira board"
               onclick="navigate('jira')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();navigate('jira')}">
            <div class="stat-number" style="color:var(--cyan)">${STATE.jiraIssues.length}</div>
            <div class="stat-label">Jira Issues</div>
          </div>
          <div class="stat-card clickable" role="button" tabindex="0" title="Open Calendar"
               onclick="navigate('calendar')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();navigate('calendar')}">
            <div class="stat-number" style="color:var(--amber)">${upcomingEvents.length}</div>
            <div class="stat-label">Upcoming Events</div>
          </div>
          <div class="stat-card clickable" role="button" tabindex="0" title="Open GitHub"
               onclick="navigate('github')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();navigate('github')}">
            <div class="stat-number" style="color:var(--violet)">${STATE.github.repos.length}</div>
            <div class="stat-label">Repositories</div>
          </div>
        </div>

        <div id="data-health-slot"></div>

        <div class="cards-grid">
          <div class="card">
            <div class="card-header">
              <span class="card-title">Tasks</span>
              <button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 8px" onclick="navigate('tasks')">${tasks.length} open · Edit all →</button>
            </div>
            ${tasks.length ? tasks.filter(t => !t.PARENT_ID || t.PARENT_ID === '-').map(t => taskRow(t)).join('') : '<div class="empty-state">Nothing open. The archive keeps the finished ones.</div>'}
            <div class="inline-form">
              <input id="quick-task-input" type="text" placeholder="Quick add task (auto-syncs to Jira)..."/>
              <button class="btn btn-primary" onclick="quickAddTask()">+ Add</button>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <span class="card-title">Inbox</span>
              <button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 8px" onclick="navigate('inbox')">Full Inbox →</button>
            </div>
            ${(STATE.feed || []).slice(0, 4).map(m => `
              <div class="inbox-item ${m.STATUS === 'new' ? 'unread' : ''}" style="cursor:pointer"
                   title="Open in Inbox" onclick="inboxOpen['${escHtml(m.ID)}']=true;navigate('inbox')">
                <div class="inbox-head" style="pointer-events:none">
                  <span class="inbox-chan-dot" data-ch="${escHtml(m.CHANNEL)}"></span>
                  <span class="inbox-sender">${escHtml(m.SENDER !== '-' ? m.SENDER : m.SOURCE)}</span>
                  <span class="inbox-title">${escHtml(m.TITLE)}</span>
                  <span class="inbox-date">${escHtml(m.RECEIVED_AT)}</span>
                </div>
              </div>`).join('') || '<div class="empty-state linked" onclick="navigate(\'inbox\')">Inbox zero →</div>'}
          </div>
        </div>

        <div class="cards-grid">
          <div class="card">
            <div class="card-header">
              <span class="card-title">Upcoming Events</span>
              <button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 8px" onclick="navigate('calendar')">Full Calendar →</button>
            </div>
            ${upcomingEvents.length ? upcomingEvents.map(e=>`
              <div class="task-item linked" title="Open Calendar" onclick="navigate('calendar')">
                <div class="task-text">
                  <div class="task-title">${escHtml(e.title)}</div>
                  <div class="task-meta">
                    <span class="badge badge-today">${e.date}</span>
                    ${e.time?`<span class="badge badge-low">${e.time}</span>`:''}
                    ${e.source==='microsoft365'?'<span class="badge badge-jira">M365</span>':''}
                  </div>
                </div>
              </div>`).join('') : '<div class="empty-state">No upcoming events. The calendar is between engagements. <a href="#" onclick="openAddEventModal()" style="color:var(--green)">+ Schedule one</a></div>'}
          </div>

          <div class="card">
            <div class="card-header">
              <span class="card-title">Equicycle Cycle ${ctx.cycleNum} - ${ctx.theme}</span>
              <button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 8px" onclick="navigate('calendar')">Day ${ctx.dayInCycle} of 28 →</button>
            </div>
            ${renderEqGrid(ctx.cycleNum, ctx.dayInCycle)}
          </div>
        </div>
      </div>

      <!-- Mini Calendar Sidebar -->
      <div class="command-right">
        ${renderMiniCalendar(calendarState.year, calendarState.month, STATE.calendarEvents)}
        <div class="card" style="margin-top:0.75rem">
          <div class="card-header"><span class="card-title">Live Jira</span><button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 8px" onclick="navigate('jira')">Board →</button></div>
          ${(STATE.jiraIssues||[]).slice(0,4).map(i=>`
            <div class="task-item linked" title="Open ${escHtml(i.key)} on the Jira board" onclick="navigate('jira')">
              <div class="task-text">
                <div class="task-title"><span style="color:var(--cyan);font-weight:600">[${i.key}]</span> ${escHtml((i.summary||'').slice(0,50))}</div>
                <div class="task-meta"><span class="badge badge-jira">${i.status||'To Do'}</span></div>
              </div>
            </div>`).join('') || `<div class="empty-state linked" onclick="navigate('${jc.host?'jira':'settings'}')">${jc.host?'No issues found.':'Configure Jira in Settings →'}</div>`}
        </div>
      </div>
    </div>

    <!-- Add Event Modal -->
    <div id="add-event-modal" class="modal-overlay hidden">
      <div class="modal-box">
        <div class="modal-header">
          <span class="modal-title">Schedule event</span>
          <button class="btn btn-ghost" onclick="closeAddEventModal()">✕</button>
        </div>
        <div class="modal-body">
          <label>Title</label>
          <input id="evt-title" type="text" placeholder="Event title..." />
          <label>Date</label>
          <input id="evt-date" type="date" value="${new Date().toISOString().slice(0,10)}" />
          <label>Time (optional)</label>
          <input id="evt-time" type="time" />
          <label>Category</label>
          <select id="evt-category">
            <option value="work">Work</option>
            <option value="personal">Personal</option>
            <option value="deadline">Deadline</option>
            <option value="reminder">Reminder</option>
            <option value="meeting">Meeting</option>
          </select>
          <label>Notes</label>
          <input id="evt-notes" type="text" placeholder="Optional notes..." />
          <!-- Scheduling something usually means committing to prepare for it.
               One checkbox instead of retyping the same thing as a task. -->
          <label class="evt-check">
            <input type="checkbox" id="evt-make-task"/>
            <span>Also add a task to prepare for it, due the same day</span>
          </label>
          <div class="evt-import">
            <div class="evt-import-head">Or bring events in</div>
            <div class="evt-import-row">
              <button class="btn btn-ghost" onclick="calImport('microsoft', this)"
                      title="Reads the next 90 days from the connected Microsoft 365 calendar">Microsoft 365</button>
              <button class="btn btn-ghost" onclick="calImportIcs()"
                      title="Google Calendar, Apple and everything else export .ics">Google / .ics file</button>
            </div>
            <div class="evt-import-note">Google Calendar: Settings → your calendar → Export, then drop the .ics here. Duplicates are skipped by title and date.</div>
            <input type="file" id="evt-ics-file" accept=".ics,text/calendar" hidden onchange="calImportIcsFile(this)"/>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeAddEventModal()">Cancel</button>
          <button class="btn btn-primary" onclick="saveCalendarEvent()">Save Event</button>
        </div>
      </div>
    </div>`;
}

// Mini calendar navigation
function prevMiniMonth() {
  if (calendarState.month===0) { calendarState.month=11; calendarState.year--; }
  else calendarState.month--;
  // Re-render just the mini calendar if we're on the Command view
  if (currentView === 'today') navigate('today');
  else if (currentView === 'calendar') navigate('calendar');
}
function nextMiniMonth() {
  if (calendarState.month===11) { calendarState.month=0; calendarState.year++; }
  else calendarState.month++;
  if (currentView === 'today') navigate('today');
  else if (currentView === 'calendar') navigate('calendar');
}
function selectMiniCalDate(dateKey) {
  document.getElementById('evt-date') && (document.getElementById('evt-date').value = dateKey);
  openAddEventModal();
}

function openAddEventModal() {
  const m = document.getElementById('add-event-modal');
  if (m) m.classList.remove('hidden');
}

// ── CALENDAR IMPORT ──
// Microsoft 365 reads straight through the connected account. Everything else -
// Google, Apple, Outlook.com - travels as .ics, which every calendar exports and
// which needs no new app registration or OAuth consent to read.
async function calImport(source, btn) {
  const was = btn.textContent;
  btn.disabled = true; btn.textContent = 'Importing…';
  try {
    const d = await (await fetch('/api/calendar/import', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source }) })).json();
    if (d.success) {
      showToast(d.added ? `${d.added} imported (${d.found - d.added} already known)` : `Nothing new - all ${d.found} were already here`, 'success');
      await fetchCalendarEvents(); refreshNotifBadge();
      if (currentView === 'calendar' || currentView === 'today') repaintView(currentView);
    } else showToast(d.error || 'Import failed', 'error');
  } catch (e) { showToast(e.message, 'error'); }
  btn.disabled = false; btn.textContent = was;
}

function calImportIcs() { document.getElementById('evt-ics-file')?.click(); }

function calImportIcsFile(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const d = await (await fetch('/api/calendar/import', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ics: String(reader.result), label: f.name }) })).json();
      if (d.success) {
        showToast(d.added ? `${d.added} imported from ${f.name}` : `Nothing new - all ${d.found} were already here`, 'success');
        await fetchCalendarEvents(); refreshNotifBadge();
        if (currentView === 'calendar' || currentView === 'today') repaintView(currentView);
      } else showToast(d.error || 'Import failed', 'error');
    } catch (e) { showToast(e.message, 'error'); }
    input.value = '';
  };
  reader.readAsText(f);
}
function closeAddEventModal() {
  const m = document.getElementById('add-event-modal');
  if (m) m.classList.add('hidden');
}

function evtSetDate(daysAhead) {
  const el = document.getElementById('evt-date');
  if (el) el.value = new Date(Date.now() + daysAhead * 864e5).toISOString().slice(0, 10);
}
function evtSetTime(t) {
  const el = document.getElementById('evt-time');
  if (el) el.value = t;
}
function evtPickColor(btn) {
  document.querySelectorAll('#evt-colors .evt-color').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
}

async function saveCalendarEvent() {
  const title = document.getElementById('evt-title')?.value.trim();
  const date = document.getElementById('evt-date')?.value;
  const time = document.getElementById('evt-time')?.value || '';
  const category = document.getElementById('evt-category')?.value || 'work';
  const notes = document.getElementById('evt-notes')?.value.trim() || '';
  const color = document.querySelector('#evt-colors .evt-color.on')?.dataset.color || '';
  if (!title || !date) { showToast('Title and date are required', 'error'); return; }
  try {
    const r = await fetch('/api/calendar/events', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ title, date, time, category, notes, color,
                             makeTask: !!document.getElementById('evt-make-task')?.checked }),
    });
    const data = await r.json();
    if (data.success) {
      showToast(data.task ? `Event saved, and "${data.task.TITLE}" is on the board` : `Event "${title}" saved!`, 'success');
      STATE.calendarEvents.push(data.event);
      if (data.task) { await fetchState(); }
      refreshNotifBadge();
      // One tick, two records: the event on the calendar AND a counter card with
      // milestone reminders, sharing the chosen colour.
      if (document.getElementById('evt-count')?.checked) {
        await fetch('/api/dates/add', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, date, color,
            kind: category === 'deadline' ? 'deadline' : 'anniversary',
            recurs: category !== 'deadline' }) }).then(r2 => r2.json())
          .then(d2 => { if (d2.success) { STATE.dates = null; showToast('Counter running', 'success'); } });
      }
      closeAddEventModal();
      navigate(currentView);
      // Schedule browser notification reminder
      scheduleReminder(title, date, time);
    }
  } catch(e) { showToast('Failed to save: ' + e.message, 'error'); }
}

function scheduleReminder(title, date, time) {
  if (!('Notification' in window)) return;
  Notification.requestPermission().then(perm => {
    if (perm !== 'granted') return;
    const eventTime = time ? new Date(`${date}T${time}`) : new Date(`${date}T09:00`);
    const reminderTime = eventTime.getTime() - 15 * 60 * 1000; // 15 min before
    const delay = reminderTime - Date.now();
    if (delay > 0 && delay < 7 * 24 * 60 * 60 * 1000) {
      setTimeout(() => {
        new Notification('iSconl Reminder', { body: `"${title}" in 15 minutes`, icon: '/static/favicon.svg' });
      }, delay);
      showToast('Browser reminder set for 15 min before event', 'info');
    }
  });
}

// ── FULL CALENDAR VIEW ─────────────────────────────────────────────────────────

function renderCalendar() {
  const year = calendarState.year;
  const month = calendarState.month;
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const today = new Date();
  const isCurrentMonth = today.getFullYear()===year && today.getMonth()===month;

  const byDate = {};
  (STATE.calendarEvents||[]).forEach(e => {
    if (e.date) { if (!byDate[e.date]) byDate[e.date]=[]; byDate[e.date].push({ ...e, type:'event' }); }
  });
  (STATE.jiraIssues||[]).forEach(i => {
    if (i.created) {
      const d = i.created.slice(0,10);
      if (!byDate[d]) byDate[d]=[];
      byDate[d].push({ title:`[${i.key}] ${i.summary}`, type:'jira', key:i.key });
    }
  });
  (STATE.tasks||[]).forEach(t => {
    const d = t.DUE_DATE && t.DUE_DATE!=='-' ? t.DUE_DATE : (t.CREATED_AT||'');
    if (d && d.length>=10) {
      const k = d.slice(0,10);
      if (!byDate[k]) byDate[k]=[];
      byDate[k].push({ title:t.TITLE, type:'task', priority:t.PRIORITY });
    }
  });

  const pad = n => String(n).padStart(2,'0');
  const dayCells = [];
  // The edges are blank, deliberately. These used to carry the neighbouring
  // months' day numbers in cramped grey cells, which read as cut-off clutter
  // at both ends of the grid. His ruling, 31 Jul: seven clean columns, this
  // month's days only - the alignment spacers stay but say nothing.
  for (let i=firstDay-1; i>=0; i--) dayCells.push(`<div class="cal-day other-month" aria-hidden="true"></div>`);
  for (let d=1; d<=daysInMonth; d++) {
    const k = `${year}-${pad(month+1)}-${pad(d)}`;
    const items = byDate[k]||[];
    const isToday = isCurrentMonth && d===today.getDate();
    dayCells.push(`
      <div class="cal-day ${isToday?'today-cell':''}" onclick="openAddEventOnDate('${k}')">
        <div class="cal-day-top">
          <span class="cal-day-num ${isToday?'today-num':''}">${d}</span>
          ${items.length?`<span class="cal-dot-badge">${items.length}</span>`:''}
        </div>
        <div class="cal-day-items">
          ${items.slice(0,2).map(it=>`<div class="cal-item-pill ${it.type}"${it.color ? ` style="background:${escHtml(it.color)}22;border-left:2px solid ${escHtml(it.color)};color:var(--text)"` : ''}>${escHtml((it.title||'').slice(0,22))}</div>`).join('')}
          ${items.length>2?`<div class="cal-more">+${items.length-2} more</div>`:''}
        </div>
      </div>`);
  }
  const totalGrid = Math.ceil(dayCells.length/7)*7;
  for (let n=1; n<=totalGrid-dayCells.length; n++) dayCells.push(`<div class="cal-day other-month" aria-hidden="true"></div>`);

  const eqCtx = STATE.time||getEquicycleContext();
  const mode = calendarState.mode || 'gregorian';
  return `
    <div class="view-head">
      <h1>Calendar</h1>
      <div class="view-head-meta">every date, imported and equicycle both</div>
    </div>
    ${renderSpaceInsight('calendar')}
    <div class="card">
      <div class="cal-header">
        <div class="cal-title-wrap">
          <h2 class="cal-month-name">${mode === 'eq' ? `Cycle ${eqCtx.cycleNum} · ${eqCtx.theme}` : `${monthNames[month]} ${year}`}</h2>
          <span class="cal-eq-sub">${mode === 'eq' ? monthNames[month] + ' ' + year : eqCtx.eqShort}</span>
        </div>
        <div class="cal-nav-btns">
          <div class="task-tabs" style="margin-right:0.4rem">
            <button class="task-tab${mode === 'gregorian' ? ' on' : ''}" onclick="calMode('gregorian')">Gregorian</button>
            <button class="task-tab${mode === 'eq' ? ' on' : ''}" onclick="calMode('eq')">Equicycle</button>
          </div>
          ${mode === 'gregorian' ? `
            <button class="btn btn-ghost" onclick="prevMiniMonth()">← Prev</button>
            <button class="btn btn-ghost" onclick="calToday()">Today</button>
            <button class="btn btn-ghost" onclick="nextMiniMonth()">Next →</button>` : ''}
          <button class="btn btn-primary" onclick="openAddEventModal()">+ Schedule</button>
        </div>
      </div>
      ${mode === 'eq' ? renderEqCalendar(byDate) : `
        <div class="cal-weekdays"><div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div></div>
        <div class="cal-grid">${dayCells.join('')}</div>`}
    </div>

    ${renderDatesPanel()}

    <div id="add-event-modal" class="modal-overlay hidden">
      <div class="modal-box">
        <div class="modal-header">
          <span class="modal-title">Schedule event</span>
          <button class="btn btn-ghost" onclick="closeAddEventModal()">✕</button>
        </div>
        <div class="modal-body">
          <label>Title</label><input id="evt-title" type="text" placeholder="What is happening?"/>

          <label>Date</label>
          <div class="evt-row">
            <input id="evt-date" type="date" value="${new Date().toISOString().slice(0,10)}"/>
            <div class="evt-chips">
              <button class="evt-chip" onclick="evtSetDate(0)">Today</button>
              <button class="evt-chip" onclick="evtSetDate(1)">Tomorrow</button>
              <button class="evt-chip" onclick="evtSetDate(7)">Next week</button>
            </div>
          </div>

          <label>Time <span class="evt-optional">optional</span></label>
          <div class="evt-row">
            <input id="evt-time" type="time"/>
            <div class="evt-chips">
              <button class="evt-chip" onclick="evtSetTime('09:00')">Morning</button>
              <button class="evt-chip" onclick="evtSetTime('12:00')">Noon</button>
              <button class="evt-chip" onclick="evtSetTime('15:00')">Afternoon</button>
              <button class="evt-chip" onclick="evtSetTime('18:00')">Evening</button>
            </div>
          </div>

          <label>Colour</label>
          <div class="evt-colors" id="evt-colors">
            ${['#3fb950','#58a6ff','#d29922','#bc8cff','#f85149','#8b949e'].map((c, i) => `
              <button class="evt-color${i === 0 ? ' on' : ''}" data-color="${c}" style="background:${c}"
                      onclick="evtPickColor(this)" title="${c}"></button>`).join('')}
          </div>

          <label>Category</label>
          <select id="evt-category"><option value="work">Work</option><option value="personal">Personal</option><option value="deadline">Deadline</option><option value="reminder">Reminder</option><option value="meeting">Meeting</option></select>
          <label>Notes</label><input id="evt-notes" type="text" placeholder="Optional notes..."/>
          <label class="evt-count-opt">
            <input type="checkbox" id="evt-count"/> Also add to the day counts
            <span class="evt-optional">a counter card with milestone reminders, in this colour</span>
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeAddEventModal()">Cancel</button>
          <button class="btn btn-primary" onclick="saveCalendarEvent()">Save Event</button>
        </div>
      </div>
    </div>`;
}

function calMode(m) { calendarState.mode = m; repaintView('calendar'); }

/**
 * The Equicycle month: the current 28-day cycle as two sprint fortnights, each
 * day mapped to its Gregorian date and carrying the same event dots as the
 * Gregorian grid - one calendar, two lenses.
 */
function renderEqCalendar(byDate) {
  const ctx = getEquicycleContext();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  // Reconstruct the cycle's first Gregorian day from where today sits in it.
  // Day 1 of every cycle is a Sunday by construction (the year anchors on the
  // first Sunday of June), so 28 days = exactly four true weeks.
  const cycleStart = new Date(today.getTime() - (ctx.dayInCycle - 1) * 86400000);
  const pad = n => String(n).padStart(2, '0');

  const weeks = [0, 1, 2, 3].map(week => {
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const dayN = week * 7 + i + 1;
      const d = new Date(cycleStart.getTime() + (dayN - 1) * 86400000);
      const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const items = byDate[k] || [];
      const isToday = dayN === ctx.dayInCycle;
      const past = dayN < ctx.dayInCycle;
      cells.push(`
        <div class="eqcal-day ${isToday ? 'today' : past ? 'past' : ''}" title="${k}${items.length ? ` · ${items.length} item${items.length > 1 ? 's' : ''}` : ''}"
             onclick="openAddEventOnDate('${k}')">
          <span class="eqcal-num">${dayN}</span>
          <span class="eqcal-greg">${d.getDate()}/${d.getMonth() + 1}</span>
          ${items.length ? `<span class="eqcal-dots">${'·'.repeat(Math.min(items.length, 3))}</span>` : ''}
        </div>`);
    }
    // Sprint boundaries fall between weeks 2 and 3; label each fortnight once,
    // and say beside it what that fortnight is FOR - the opening half commits,
    // the closing half lands. A sprint label with no focus is just a number.
    const label = week === 0 ? `Sprint ${ctx.cycleNum * 2 - 1} · days 1-14`
                : week === 2 ? `Sprint ${ctx.cycleNum * 2} · days 15-28` : '';
    const focus = week === 0
      ? `open the ${escHtml(ctx.theme)} window - commit the pieces and set them moving`
      : week === 2
        ? `land what the opening started - no new openings this side of the cycle`
        : '';
    return `${label ? `<div class="eqcal-sprint-label">${label}
        <span class="eqcal-sprint-focus">${focus}</span></div>` : ''}
      <div class="eqcal-row">${cells.join('')}</div>`;
  });

  return `<div class="eqcal">
    <div class="eqcal-weekdays">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => `<div>${d}</div>`).join('')}</div>
    ${weeks.join('')}
  </div>`;
}

/**
 * The day counters. One card per date that matters: the number is the headline
 * (days lived, days to), the milestone is the footer, and the arithmetic comes
 * from the server so every surface agrees.
 */
function renderDatesPanel() {
  if (!STATE.dates) { fetchDates(); }
  const dates = STATE.dates || [];
  const upcoming = STATE.datesUpcoming || [];
  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Day counts</span>
        <button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 9px" onclick="addImportantDate()">Add a date</button>
      </div>
      ${upcoming.length ? `
        <div class="dates-upcoming">
          ${upcoming.slice(0, 3).map(u => `<span class="dates-soon${u.days <= 7 ? ' hot' : ''}">
            ${escHtml(u.title)} · ${escHtml(u.label)} ${u.days === 0 ? 'today' : `in ${u.days}d`}</span>`).join('')}
        </div>` : ''}
      ${dates.length ? `
        <div class="dates-grid">
          ${dates.map(d => {
            const since = d.daysSince != null;
            const big = since ? d.daysSince : d.daysUntil;
            const next = d.milestones?.[0];
            // Explicit colour wins; otherwise the kind chooses one, so every
            // counter reads distinct at a glance without anyone configuring it.
            const kindColor = { birthday: '#bc8cff', anniversary: '#3fb950', graduation: '#3fb950', 'first graduation': '#3fb950', 'first job': '#58a6ff',
                                first: '#58a6ff', deadline: '#d29922' }[(d.KIND || '').toLowerCase()] || '#8b949e';
            const c = /^#[0-9a-f]{6}$/i.test(d.COLOR || '') ? d.COLOR : kindColor;
            return `
            <div class="date-card" title="${escHtml(d.NOTE !== '-' ? d.NOTE : d.DATE)}"
                 style="background:${c}14;border-color:${c}55">
              <div class="date-card-top">
                <span class="date-kind" style="color:${c}">${escHtml(d.KIND)}</span>
                <button class="date-del" title="Remove" onclick="deleteImportantDate('${escHtml(d.ID)}')">×</button>
              </div>
              <div class="date-num">${Number(big).toLocaleString('en-KE')}</div>
              <div class="date-unit">days ${since ? 'since' : 'until'}</div>
              <div class="date-title">${escHtml(d.TITLE)}</div>
              <div class="date-sub">${escHtml(d.DATE)}${d.yearsTurning ? ` · <span style="color:${c}">turns ${d.yearsTurning} in ${d.daysToNext}d</span>` : ''}</div>
              ${next ? `<div class="date-mile" style="border-top-color:${c}44">
                <span style="color:${c}">${escHtml(next.label)}</span> · ${next.days === 0 ? 'today' : `${next.days.toLocaleString('en-KE')}d`} · ${escHtml(next.date)}</div>` : ''}
            </div>`;
          }).join('')}
        </div>` : `
        <div class="empty-state" style="text-align:left;padding:0.5rem 0">
          Nothing counted yet. Add the dates a life gets measured against … birthdays, anniversaries,
          the day something started … and the counters take it from there.
        </div>`}
    </div>`;
}

async function fetchDates() {
  try {
    const d = await (await fetch('/api/dates')).json();
    STATE.dates = d.dates || [];
    STATE.datesUpcoming = d.upcoming || [];
    repaintView('calendar');
  } catch { STATE.dates = []; }
}

function addImportantDate() {
  uiForm('Count a date', [
    { id: 'title', label: 'What is it', placeholder: 'Olive’s birthday, first day at Viva' },
    { id: 'date', label: 'The original date', type: 'date' },
    { id: 'kind', label: 'Kind', type: 'select', value: 'birthday',
      options: ['birthday', 'first graduation', 'first job', 'anniversary', 'first', 'deadline'] },
    { id: 'who', label: 'Whose', placeholder: 'leave blank for your own' },
    { id: 'recurs', label: 'Repeats', type: 'select', value: 'every year',
      options: ['every year', 'one-off'],
      hint: 'A yearly date counts down to its next occurrence; a one-off counts up from the day itself.' },
  ], async (v) => {
    if (!v.title || !v.date) { showToast('It needs a name and a date', 'warn'); return false; }
    const ok = await finPost('/api/dates/add',
      { ...v, recurs: v.recurs === 'every year' }, 'Counting … from here to forever');
    if (ok) fetchDates();
    return ok;
  });
}

async function deleteImportantDate(id) {
  if (!await uiConfirm({ title: 'Stop counting this date?',
    body: 'The counter disappears from the calendar. Nothing else is touched.',
    confirmLabel: 'Stop counting', danger: true })) return;
  fetch('/api/dates/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }) }).then(r => r.json()).then(() => fetchDates());
}

function calToday() {
  calendarState.year = new Date().getFullYear();
  calendarState.month = new Date().getMonth();
  navigate('calendar');
}

function openAddEventOnDate(dateKey) {
  openAddEventModal();
  setTimeout(() => { const el = document.getElementById('evt-date'); if(el) el.value = dateKey; }, 50);
}

// ── JIRA KANBAN BOARD ─────────────────────────────────────────────────────────

const KANBAN_COLUMNS = [
  { id:'To Do',       label:'To Do',       color:'var(--text-3)', icon:'○' },
  { id:'In Progress', label:'In Progress', color:'var(--amber)',   icon:'◑' },
  { id:'In Review',   label:'In Review',   color:'var(--cyan)',    icon:'◕' },
  { id:'Done',        label:'Done',        color:'var(--green)',   icon:'●' },
];

function jiraPriorityIcon(p) {
  // A coloured dot rather than a pictogram. The colour carries the meaning, and it
  // renders identically on every platform, which emoji do not.
  const cls = { Highest:'pd-highest', High:'pd-high', Medium:'pd-medium',
                Low:'pd-low', Lowest:'pd-lowest' }[p] || 'pd-medium';
  return '<span class="prio-dot ' + cls + '" title="' + (p || 'Medium') + '"></span>';
}
function jiraTypeIcon(t) {
  // Letter tags rather than pictograms: identical on every platform, and the
  // heading beside them already carries the colour and context.
  return { Bug:'B', Story:'S', Epic:'E', Task:'T', 'Sub-task':'↳' }[t] || 'T';
}

function renderJira() {
  const jc = STATE.services?.jiraConfig || {};
  const issues = STATE.jiraIssues || [];
  const columns = KANBAN_COLUMNS.map(col => ({
    ...col,
    issues: issues.filter(i => {
      const s = (i.status||'').toLowerCase();
      if (col.id==='To Do')       return s==='to do'||s==='open'||s==='backlog'||s==='new';
      if (col.id==='In Progress') return s.includes('progress')||s==='in development';
      if (col.id==='In Review')   return s.includes('review');
      if (col.id==='Done')        return s==='done'||s==='closed'||s==='resolved';
      return false;
    }),
  }));
  const matched = new Set(issues.filter(i=>columns.some(c=>c.issues.includes(i))).map(i=>i.key));
  const unmatched = issues.filter(i=>!matched.has(i.key));
  if (unmatched.length) columns[0].issues.push(...unmatched);

  return `
    <div class="view-head">
      <h1>Kanban</h1>
      <div class="view-head-meta">${jc.host ? escHtml(jc.host) : 'Jira not configured'}${jc.projectKey ? ` · ${escHtml(jc.projectKey)}` : ''}</div>
    </div>
    <div class="jira-toolbar">
      <div class="jira-toolbar-left">
        <div class="jira-host-pill">
          <span class="status-dot ${jc.host&&jc.hasToken?'active':''}"></span>
          <span>${jc.host||'Not configured'}</span>
          ${jc.projectKey?`<span class="badge badge-jira" style="margin-left:4px">${jc.projectKey}</span>`:''}
        </div>
      </div>
      <div class="jira-toolbar-right">
        <button class="btn btn-ghost" onclick="navigate('settings')">Settings</button>
        <button class="btn btn-ghost" onclick="jiraRefresh()">Refresh</button>
        <button class="btn btn-primary" onclick="openCreateIssueModal()">+ New Issue</button>
      </div>
    </div>
    <div class="kanban-board">
      ${columns.map(col=>`
        <div class="kanban-col" data-col="${escHtml(col.id)}"
             ondragover="kanbanDragOver(event,'${escHtml(col.id)}')"
             ondragleave="kanbanDragLeave(event)"
             ondrop="kanbanDrop(event,'${escHtml(col.id)}')">
          <div class="kanban-col-header">
            <span class="kanban-col-dot" style="color:${col.color}">${col.icon}</span>
            <span class="kanban-col-title">${col.label}</span>
            <span class="kanban-col-count">${col.issues.length}</span>
          </div>
          <div class="kanban-col-body">
            ${col.issues.length ? col.issues.map(i=>renderKanbanCard(i,col.id)).join('') : '<div class="kanban-empty">No issues</div>'}
          </div>
        </div>`).join('')}
    </div>

    <div id="create-issue-modal" class="modal-overlay hidden">
      <div class="modal-box">
        <div class="modal-header">
          <span class="modal-title">Create Jira Issue</span>
          <button class="btn btn-ghost" onclick="closeCreateIssueModal()">✕</button>
        </div>
        <div class="modal-body">
          <label>Summary</label><input id="new-issue-summary" type="text" placeholder="Issue summary..."/>
          <label style="margin-top:0.75rem">Type</label>
          <select id="new-issue-type"><option>Task</option><option>Story</option><option>Bug</option><option>Epic</option></select>
          <label style="margin-top:0.75rem">Description / Context</label>
          <textarea id="new-issue-desc" rows="4" placeholder="Paste email or chat context - AI will structure the issue..."></textarea>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeCreateIssueModal()">Cancel</button>
          <button class="btn btn-primary" onclick="createIssueFromModal()">Create Issue</button>
        </div>
      </div>
    </div>`;
}

function renderKanbanCard(issue, currentCol) {
  const jc = STATE.services?.jiraConfig || {};
  const otherCols = KANBAN_COLUMNS.filter(c=>c.id!==currentCol);
  const summary = issue.summary||'';
  const truncated = summary.length>85 ? summary.slice(0,85)+'…' : summary;
  const safeKey = escHtml(issue.key);
  const safeSummary = escHtml(summary).replace(/"/g,'&quot;');
  return `
    <div class="kanban-card" id="kc-${safeKey}" draggable="true"
         ondragstart="kanbanDragStart(event,'${safeKey}','${escHtml(currentCol)}')"
         ondragend="kanbanDragEnd(event)">
      <div class="kanban-card-top">
        <a href="https://${jc.host}/browse/${issue.key}" target="_blank" class="kanban-card-key">${safeKey}</a>
        <span class="kanban-card-type">${jiraTypeIcon(issue.type)}</span>
      </div>
      <div class="kanban-card-summary">${escHtml(truncated)}</div>
      <div class="kanban-card-meta">
        <span>${jiraPriorityIcon(issue.priority)} ${escHtml(issue.priority||'Medium')}</span>
        ${renderAssigneeChip(issue)}
      </div>
      <div class="kanban-card-actions">
        ${otherCols.map(c=>`<button class="kanban-action-btn" onclick="moveIssue('${safeKey}','${escHtml(c.id)}',this)">→ ${c.label}</button>`).join('')}
        <button class="kanban-action-btn ai-btn" onclick="askAiAboutIssue('${safeKey}','${safeSummary}')">Ask AI</button>
        <button class="kanban-action-btn danger-btn" onclick="deleteIssue('${safeKey}',this)">Delete</button>
      </div>
    </div>`;
}

// ── ASSIGNEES ─────────────────────────────────────────────────────────────────
// Unassigned is a real, visible state rather than a blank: an issue nobody owns
// is exactly the thing you need to notice on a board.

function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2)
    .map(w => w.charAt(0).toUpperCase()).join('') || '?';
}

function renderAssigneeChip(issue) {
  const a = issue.assignee;
  const safeKey = escHtml(issue.key);
  if (!a) {
    return `<button class="assignee-chip unassigned" title="Unassigned - click to assign"
                    onclick="event.stopPropagation();openAssigneePicker('${safeKey}',this)">
              <span class="assignee-av none">?</span><span>Unassigned</span>
            </button>`;
  }
  const name = escHtml(a.displayName || 'Unknown');
  return `<button class="assignee-chip" title="${name}${a.email ? ' · ' + escHtml(a.email) : ''} - click to reassign"
                  onclick="event.stopPropagation();openAssigneePicker('${safeKey}',this)">
            ${a.avatar
              ? `<img class="assignee-av" src="${escHtml(a.avatar)}" alt="" referrerpolicy="no-referrer"/>`
              : `<span class="assignee-av">${escHtml(initials(a.displayName))}</span>`}
            <span>${name}</span>
          </button>`;
}

let _assignableUsers = null;

async function loadAssignableUsers(force = false) {
  if (_assignableUsers && !force) return _assignableUsers;
  try {
    const r = await fetch(`/api/jira/assignable${force ? '?refresh=1' : ''}`);
    const d = await r.json();
    _assignableUsers = d.users || [];
  } catch (e) { _assignableUsers = []; }
  return _assignableUsers;
}

function closeAssigneePicker() {
  const m = document.getElementById('assignee-picker');
  if (m) m.remove();
  document.removeEventListener('click', onAssigneeOutside);
  document.removeEventListener('keydown', onAssigneeKey);
}
function onAssigneeOutside(e) { if (!e.target.closest('#assignee-picker')) closeAssigneePicker(); }
function onAssigneeKey(e)     { if (e.key === 'Escape') closeAssigneePicker(); }

async function openAssigneePicker(issueKey, anchorEl) {
  closeAssigneePicker();

  const box = document.createElement('div');
  box.className = 'assignee-picker';
  box.id = 'assignee-picker';
  box.innerHTML = `<div class="assignee-picker-label">Assign ${escHtml(issueKey)}</div>
                   <div class="assignee-picker-list">Loading people…</div>`;
  const place = () => {
    if (!anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    box.style.top  = `${r.bottom + 6}px`;
    box.style.left = `${Math.min(r.left, window.innerWidth - 260)}px`;
    const br = box.getBoundingClientRect();
    if (br.bottom > window.innerHeight - 8) box.style.top = `${r.top - br.height - 6}px`;
  };
  document.body.appendChild(box);
  place();
  setTimeout(() => {
    document.addEventListener('click', onAssigneeOutside);
    document.addEventListener('keydown', onAssigneeKey);
  }, 0);

  const users = await loadAssignableUsers();
  const list = box.querySelector('.assignee-picker-list');
  if (!list) return;

  if (!users.length) {
    list.innerHTML = `<div class="assignee-picker-empty">
      No assignable users returned. Check that Jira is configured in Settings and that
      your account can browse the project.</div>`;
    place();
    return;
  }

  const current = (STATE.jiraIssues || []).find(i => i.key === issueKey)?.assignee?.accountId || '';
  list.innerHTML = [
    `<button class="assignee-opt${!current ? ' current' : ''}" data-id="">
       <span class="assignee-av none">?</span><span>Unassigned</span></button>`,
    ...users.map(u => `
      <button class="assignee-opt${u.accountId === current ? ' current' : ''}" data-id="${escHtml(u.accountId)}">
        ${u.avatar
          ? `<img class="assignee-av" src="${escHtml(u.avatar)}" alt="" referrerpolicy="no-referrer"/>`
          : `<span class="assignee-av">${escHtml(initials(u.displayName))}</span>`}
        <span class="assignee-opt-name">${escHtml(u.displayName)}</span>
      </button>`),
  ].join('');
  place();

  list.querySelectorAll('.assignee-opt').forEach(btn => {
    btn.addEventListener('click', () => assignIssue(issueKey, btn.dataset.id || null));
  });
}

async function assignIssue(issueKey, accountId) {
  closeAssigneePicker();
  showToast(accountId ? `Assigning ${issueKey}…` : `Clearing assignee on ${issueKey}…`, 'info');
  try {
    const r = await fetch('/api/jira/assign', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issueKey, accountId }),
    });
    const d = await r.json();
    if (!d.success) { showToast(d.error || 'Assignment failed', 'error'); return; }
    const who = accountId
      ? ((_assignableUsers || []).find(u => u.accountId === accountId)?.displayName || 'assignee set')
      : 'Unassigned';
    showToast(`${issueKey} → ${who}`, 'success');
    await fetchJiraIssues();
    if (currentView === 'jira') navigate('jira');
  } catch (e) { showToast(e.message, 'error'); }
}

async function jiraRefresh() { showToast('Refreshing…','info'); await fetchJiraIssues(); navigate('jira'); showToast(`${STATE.jiraIssues.length} issues loaded`,'success'); }
async function moveIssue(issueKey, targetStatus, btn) {
  // btn is optional - a drag-drop has no button to disable.
  if (btn) { btn.disabled=true; btn.textContent='…'; }
  try {
    const r = await fetch('/api/jira/transition',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({issueKey,transition:targetStatus})});
    const result = await r.json();
    if (result.success) { showToast(`${issueKey} → ${result.newStatus||targetStatus}`,'success'); await fetchJiraIssues(); navigate('jira'); }
    else { showToast(result.error||'Transition not available','error'); if (btn) { btn.disabled=false; btn.textContent=`→ ${targetStatus}`; } }
  } catch(e) { showToast(e.message,'error'); if (btn) { btn.disabled=false; btn.textContent=`→ ${targetStatus}`; } }
}

// ── KANBAN DRAG & DROP ──
// Drag a card to another column exactly like the live Jira board. The drop asks
// once before anything leaves the machine - that confirmation is the approval -
// and the transition mirrors to live Jira through the same gated endpoint the
// buttons use. Dropping a card back on its own column does nothing.
let _dragIssue = null;
function kanbanDragStart(e, key, fromCol) {
  _dragIssue = { key, fromCol };
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', key); } catch {}
  e.target.classList.add('dragging');
}
function kanbanDragEnd(e) {
  e.target.classList.remove('dragging');
  document.querySelectorAll('.kanban-col.drop-target').forEach(c => c.classList.remove('drop-target'));
  _dragIssue = null;
}
function kanbanDragOver(e, colId) {
  if (!_dragIssue || _dragIssue.fromCol === colId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drop-target');
}
function kanbanDragLeave(e) { e.currentTarget.classList.remove('drop-target'); }
async function kanbanDrop(e, colId) {
  e.preventDefault();
  e.currentTarget.classList.remove('drop-target');
  const drag = _dragIssue; _dragIssue = null;
  if (!drag || drag.fromCol === colId) return;
  const col = (typeof KANBAN_COLUMNS !== 'undefined' ? KANBAN_COLUMNS : []).find(c => c.id === colId);
  if (!await uiConfirm({ title: `Move ${drag.key} on the live board?`,
    body: `It moves to "${col ? col.label : colId}" in Jira, where the whole team sees it.`,
    confirmLabel: 'Move it' })) return;
  await moveIssue(drag.key, colId, null);
}
async function deleteIssue(issueKey, btn) {
  if (!await uiConfirm({ title: `Delete ${issueKey} from Jira?`,
    body: 'This is permanent and company-visible. There is no undo.',
    confirmLabel: 'Delete permanently', danger: true })) return;
  btn.disabled = true; btn.textContent = 'Deleting…';
  const card = btn.closest('.kanban-card');
  try {
    const r = await fetch('/api/jira/delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issueKey }),
    });
    const result = await r.json().catch(() => ({}));

    // The server only reports success after re-reading the issue and confirming
    // Jira returns 404. Anything else is a real failure - never assume.
    if (r.ok && result.success && result.verified) {
      if (card) { card.style.transition = 'opacity .15s'; card.style.opacity = '0'; }
      STATE.jiraIssues = (STATE.jiraIssues || []).filter(i => i.key !== issueKey);
      showToast(`${issueKey} deleted and verified gone`, 'success');
      await fetchState();            // local task board may have lost a linked row
      await fetchJiraIssues();
      navigate('jira');
    } else if (result.permissionDenied) {
      // Your Jira account has TRANSITION_ISSUES but not DELETE_ISSUES on this project.
      // Offer the fallback explicitly - never silently do something other than delete.
      btn.disabled = false; btn.textContent = 'Delete';
      showToast('No "Delete Issues" permission on this project', 'error');
      if (await uiConfirm({
        title: 'Jira refused the delete',
        body: `${result.error}\n\nYour account can transition issues but not delete them. `
            + `Clear ${issueKey} instead? It moves to Done and leaves the active board - it is NOT deleted. `
            + `For a real delete, ask a Jira admin for "Delete Issues" on ${STATE.services?.jiraConfig?.projectKey || 'the project'}.`,
        confirmLabel: `Clear ${issueKey} instead` })) {
        await clearIssue(issueKey, btn);
      }
    } else {
      showToast(result.error || `Delete failed (HTTP ${r.status})`, 'error');
      btn.disabled = false; btn.textContent = 'Delete';
    }
  } catch (e) {
    showToast(`Delete failed: ${e.message}`, 'error');
    btn.disabled = false; btn.textContent = 'Delete';
  }
}

// Move an issue to Done so it leaves the active board. Explicitly NOT a delete.
async function clearIssue(issueKey, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Clearing…'; }
  try {
    const r = await fetch('/api/jira/clear', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issueKey }),
    });
    const result = await r.json().catch(() => ({}));
    if (r.ok && result.cleared) {
      showToast(`${issueKey} moved to Done (not deleted)`, 'success');
      await fetchJiraIssues(); navigate('jira');
    } else {
      showToast(result.error || `Clear failed (HTTP ${r.status})`, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Delete'; }
    }
  } catch (e) {
    showToast(`Clear failed: ${e.message}`, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Delete'; }
  }
}

// Delete a local task and, if it is linked to a Jira issue, that issue too.
// The server keeps the local row if the Jira delete fails, so the two never diverge.
async function deleteTask(taskId, title, btn) {
  if (!await uiConfirm({ title: 'Delete this task?', body: `"${title}"\n\nIf it is linked to a Jira issue, that issue is deleted too.`,
    confirmLabel: 'Delete', danger: true })) return;
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    const r = await fetch('/api/tasks/delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, deleteJira: true }),
    });
    const result = await r.json().catch(() => ({}));
    if (r.ok && result.success) {
      showToast(result.jiraKey ? `Task and ${result.jiraKey} deleted` : 'Task deleted', 'success');
      await fetchState();
      await fetchJiraIssues();
      navigate(currentView || 'today');
    } else {
      showToast(result.error || `Delete failed (HTTP ${r.status})`, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Delete'; }
    }
  } catch (e) {
    showToast(`Delete failed: ${e.message}`, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Delete'; }
  }
}
function openCreateIssueModal() { document.getElementById('create-issue-modal')?.classList.remove('hidden'); }
function closeCreateIssueModal() { document.getElementById('create-issue-modal')?.classList.add('hidden'); }
async function createIssueFromModal() {
  const summary = document.getElementById('new-issue-summary')?.value.trim();
  if (!summary) { showToast('Summary required','error'); return; }
  showToast('Creating issue…','info');
  try {
    const r = await fetch('/api/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:summary,priority:'medium',syncJira:true})});
    const data = await r.json();
    closeCreateIssueModal();
    showToast(data?.jira?.key ? `Created ${data.jira.key}!` : 'Task created','success');
    await fetchJiraIssues(); navigate('jira');
  } catch(e) { showToast(e.message,'error'); }
}
function askAiAboutIssue(key, summary) {
  const ta = document.getElementById('chat-rail-textarea');
  if (ta) { ta.value=`Analyze Jira issue ${key}: "${summary}". What actions should I take?`; sendRailChat(); }
}

// ── FILE MANAGER VIEW ─────────────────────────────────────────────────────────

let fileManagerPath = 'root';
let fileManagerItems = [];
let fmBreadcrumbs = []; // array of {label, path}
let fmViewMode = 'grid'; // 'grid' or 'list'
let fmSearch = '';
let fmSelectedItem = null;

function renderFileManager() {
  const ms = STATE.services?.msConfig || {};
  const connected = ms.hasCreds;

  return `
    <div class="fm-page">
      <!-- HEADER -->
      <div class="fm-header">
        <div class="fm-header-left">
          <span class="card-title" style="font-size:1rem">File Manager</span>
          ${connected
            ? '<span class="badge badge-jira" style="font-size:0.65rem">● OneDrive</span>'
            : '<span class="badge badge-medium" style="font-size:0.65rem">○ Local Mode</span>'
          }
        </div>
        <div class="fm-header-actions">
          <button class="btn btn-ghost fm-view-btn" id="fm-toggle-view" onclick="fmToggleView()" title="Toggle list/grid view">⊞</button>
          <button class="btn btn-ghost" onclick="fmRefresh()" title="Refresh">⟳</button>
          ${connected ? `
            <label class="btn btn-primary" style="cursor:pointer" title="Upload file">
              ⬆ Upload
              <input type="file" id="fm-upload-input" style="display:none" onchange="fmUploadFile(this)">
            </label>
            <button class="btn btn-ghost" onclick="fmNewFolder()">+ Folder</button>
          ` : ''}
          ${!connected ? `<button class="btn btn-primary" onclick="navigate('settings')">Connect M365</button>` : ''}
        </div>
      </div>

      <!-- SEARCH + BREADCRUMB BAR -->
      <div class="fm-nav-bar">
        <div class="fm-breadcrumb" id="fm-breadcrumb">
          <span class="fm-crumb fm-crumb-root" onclick="fmNavigate('root')">${connected ? 'OneDrive' : 'Files'}</span>
          <span id="fm-crumb-trail"></span>
        </div>
        <div class="fm-search-wrap">
          <input class="fm-search-input" id="fm-search-box" type="text" placeholder="Filter files…" oninput="fmFilterItems(this.value)">
        </div>
      </div>

      <!-- MAIN CONTENT SPLIT -->
      <div class="fm-layout" id="fm-layout">
        <div class="fm-body" id="fm-body">
          <div class="empty-state">Loading files…</div>
        </div>
        <!-- PREVIEW DRAWER (hidden by default) -->
        <div class="fm-preview-drawer hidden" id="fm-preview">
          <div class="fm-preview-header">
            <span id="fm-preview-name" class="fm-preview-title">File Preview</span>
            <button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 8px" onclick="fmClosePreview()">✕</button>
          </div>
          <div id="fm-preview-body" class="fm-preview-body">
            <div class="empty-state">Select a file to preview</div>
          </div>
        </div>
      </div>
    </div>`;
}

async function fmNavigate(folderPath, label) {
  fileManagerPath = folderPath;
  fmSearch = '';
  const searchBox = document.getElementById('fm-search-box');
  if (searchBox) searchBox.value = '';

  // Update breadcrumb trail
  if (folderPath === 'root') {
    fmBreadcrumbs = [];
  } else {
    // Build crumb trail from path segments
    const parts = folderPath.split('/');
    fmBreadcrumbs = parts.map((part, i) => ({
      label: part,
      path: parts.slice(0, i + 1).join('/')
    }));
  }
  updateFmBreadcrumb();
  fmClosePreview();

  const body = document.getElementById('fm-body');
  if (!body) { navigate('files'); return; }
  body.innerHTML = '<div class="empty-state fm-loading"><span class="spinner"></span> Loading…</div>';

  const ms = STATE.services?.msConfig || {};
  if (!ms.hasCreds) {
    body.innerHTML = `<div class="fm-local-note">
      <p>OneDrive not connected - showing local workspace.</p>
      <p style="margin-top:0.5rem;font-size:0.78rem;color:var(--text-3)">Connect Microsoft 365 in Settings to browse your full OneDrive.</p>
      <button class="btn btn-primary" style="margin-top:0.75rem" onclick="navigate('settings')">Connect Microsoft 365</button>
    </div>`;
    return;
  }

  try {
    const r = await fetch(`/api/onedrive/list?path=${encodeURIComponent(folderPath)}`);
    const data = await r.json();
    if (data.error) {
      // A dead or renamed path must not strand the view - fall back to the root
      // once rather than displaying an error nobody can act on.
      if (folderPath !== 'root') { showToast('That folder is unreachable - showing OneDrive root', 'warn'); return fmNavigate('root'); }
      body.innerHTML = `<div class="empty-state" style="color:var(--red)">⚠ ${escHtml(data.error)}</div>`;
      return;
    }
    // The endpoint normalizes Graph's `.value` into `.items`. This used to read
    // `.value` - always undefined - so EVERY folder rendered as "This folder is
    // empty" no matter what the drive actually held. The renderers below still
    // speak raw Graph (`item.folder.childCount`), so the adapter here restores
    // that shape from the normalized one and both dialects work.
    fileManagerItems = (data.items || data.value || []).map(i => ({
      ...i,
      folder: i.folder || (i.isFolder ? { childCount: i.childCount || 0 } : undefined),
    }));
    if (!fileManagerItems.length && folderPath !== 'root') {
      // Empty non-root can be real, but landing in one on arrival is unhelpful -
      // offer the way out inline.
      renderFmItems(fileManagerItems);
      const b = document.getElementById('fm-body');
      if (b) b.innerHTML += `<div style="text-align:center;margin-top:0.5rem">
        <button class="btn btn-ghost" onclick="fmNavigate('root')">Go to OneDrive root</button></div>`;
      return;
    }
    renderFmItems(fileManagerItems);
  } catch(e) {
    body.innerHTML = `<div class="empty-state" style="color:var(--red)">Error: ${escHtml(e.message)}</div>`;
  }
}

function renderFmItems(items) {
  const body = document.getElementById('fm-body');
  if (!body) return;
  const filtered = fmSearch
    ? items.filter(i => i.name.toLowerCase().includes(fmSearch.toLowerCase()))
    : items;

  if (!filtered.length) {
    body.innerHTML = fmSearch
      ? `<div class="empty-state">No files matching "<strong>${escHtml(fmSearch)}</strong>".</div>`
      : '<div class="empty-state">This folder is empty. Nothing to see here, literally.</div>';
    return;
  }

  // Sort: folders first, then files alphabetically
  const sorted = [...filtered].sort((a, b) => {
    if (a.folder && !b.folder) return -1;
    if (!a.folder && b.folder) return 1;
    return a.name.localeCompare(b.name);
  });

  if (fmViewMode === 'grid') {
    body.innerHTML = `<div class="fm-grid">${sorted.map(item => fmGridCard(item)).join('')}</div>`;
  } else {
    body.innerHTML = `<div class="fm-list">${sorted.map(item => fmListRow(item)).join('')}</div>`;
  }
}

function fmGridCard(item) {
  const isFolder = !!item.folder;
  const icon = fmIcon(item, 34);
  const safeName = escHtml(item.name);
  const safeId = escHtml(item.id || '');
  const size = isFolder ? `${item.folder.childCount || 0} items` : formatBytes(item.size);
  const modDate = item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime).toLocaleDateString() : '';
  const nextPath = fileManagerPath === 'root' ? item.name : `${fileManagerPath}/${item.name}`;

  return `
    <div class="fm-item ${fmSelectedItem?.id === item.id ? 'fm-item-selected' : ''}"
         onclick="${isFolder ? `fmNavigate('${escHtml(nextPath)}','${safeName}')` : `fmPreviewItemById('${safeId}')`}"
         title="${safeName}">
      <div class="fm-item-icon">${icon}</div>
      <div class="fm-item-name">${safeName.length > 18 ? safeName.slice(0,17) + '…' : safeName}</div>
      <div class="fm-item-size">${size}</div>
      ${modDate ? `<div class="fm-item-date">${modDate}</div>` : ''}
      ${fmItemMenu(item, isFolder, safeId, safeName)}
    </div>`;
}

/**
 * One menu per item, revealed on hover, holding every control that applies -
 * folders get rename/move/delete, files get those plus download. A single
 * affordance keeps the grid as calm as it looks now while making everything
 * reachable, instead of scattering buttons across the card.
 */
function fmItemMenu(item, isFolder, safeId, safeName) {
  const esc = safeName.replace(/'/g, "\\'");
  return `
    <div class="fm-menu-wrap" onclick="event.stopPropagation()">
      <button class="fm-menu-btn" title="Actions" onclick="fmToggleMenu(event, '${safeId}')">⋯</button>
      <div class="fm-menu" id="fm-menu-${safeId}">
        ${!isFolder ? `<button onclick="fmCloseMenus();fmDownload('${safeId}','${esc}')">Download</button>` : ''}
        <button onclick="fmCloseMenus();fmRenameItem('${safeId}','${esc}')">Rename</button>
        <button onclick="fmCloseMenus();fmMoveItem('${safeId}','${esc}')">Move…</button>
        <button class="danger" onclick="fmCloseMenus();fmDeleteItem('${safeId}','${esc}',this)">Delete</button>
      </div>
    </div>`;
}

function fmCloseMenus() {
  document.querySelectorAll('.fm-menu.open').forEach(m => m.classList.remove('open'));
}

function fmToggleMenu(e, id) {
  e.stopPropagation();
  const m = document.getElementById(`fm-menu-${id}`);
  const wasOpen = m?.classList.contains('open');
  fmCloseMenus();
  if (m && !wasOpen) {
    m.classList.add('open');
    // Flip upward when the menu would fall off the bottom of the viewport.
    const r = m.getBoundingClientRect();
    m.classList.toggle('up', r.bottom > window.innerHeight - 8);
  }
}
// One outside click dismisses; registered once.
document.addEventListener('click', fmCloseMenus);

function fmListRow(item) {
  const isFolder = !!item.folder;
  const icon = fmIcon(item, 20);
  const safeName = escHtml(item.name);
  const safeId = escHtml(item.id || '');
  const size = isFolder ? `${item.folder.childCount || 0} items` : formatBytes(item.size);
  const modDate = item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime).toLocaleDateString() : '-';
  const nextPath = fileManagerPath === 'root' ? item.name : `${fileManagerPath}/${item.name}`;

  return `
    <div class="fm-list-row ${fmSelectedItem?.id === item.id ? 'fm-item-selected' : ''}"
         onclick="${isFolder ? `fmNavigate('${escHtml(nextPath)}','${safeName}')` : `fmPreviewItemById('${safeId}')`}">
      <span class="fm-list-icon">${icon}</span>
      <span class="fm-list-name" title="${safeName}">${safeName}</span>
      <span class="fm-list-size">${size}</span>
      <span class="fm-list-date">${modDate}</span>
      <span class="fm-list-btns">${fmItemMenu(item, isFolder, safeId, safeName)}</span>
    </div>`;
}

function fmFilterItems(val) {
  fmSearch = val;
  renderFmItems(fileManagerItems);
}

function fmToggleView() {
  fmViewMode = fmViewMode === 'grid' ? 'list' : 'grid';
  const btn = document.getElementById('fm-toggle-view');
  if (btn) btn.textContent = fmViewMode === 'grid' ? '⊞' : '☰';
  renderFmItems(fileManagerItems);
}

function updateFmBreadcrumb() {
  const trail = document.getElementById('fm-crumb-trail');
  if (!trail) return;
  trail.innerHTML = fmBreadcrumbs.map((c, i) =>
    ` <span style="color:var(--text-3)">›</span> <span class="fm-crumb" onclick="fmNavigate('${escHtml(c.path)}','${escHtml(c.label)}')">${escHtml(c.label)}</span>`
  ).join('');
}

function fmPreviewItemById(id) {
  const item = (fileManagerItems || []).find(it => String(it.id) === String(id));
  if (item) fmPreviewItem(item);
}

async function fmPreviewItem(itemInput) {
  const item = typeof itemInput === 'string' ? JSON.parse(itemInput) : itemInput;
  if (!item) return;
  fmSelectedItem = item;
  renderFmItems(fileManagerItems); // re-render to show selection

  // Always open in the dedicated document preview dock (rail space)
  fmPreviewInReader(item);

  const drawer = document.getElementById('fm-preview');
  const previewBody = document.getElementById('fm-preview-body');
  const previewName = document.getElementById('fm-preview-name');
  if (!drawer || !previewBody) return;

  drawer.classList.remove('hidden');
  if (previewName) previewName.textContent = item.name;
  previewBody.innerHTML = '<div class="empty-state fm-loading"><span class="spinner"></span> Loading file preview…</div>';

  try {
    const r = await fetch(`/api/onedrive/preview?id=${encodeURIComponent(item.id)}`);
    const data = await r.json();
    if (data.error) { previewBody.innerHTML = `<div style="color:var(--red)">${escHtml(data.error)}</div>`; return; }

    const ext = '.' + (item.name || '').split('.').pop()?.toLowerCase();
    const isImage = ['.jpg','.jpeg','.png','.gif','.webp','.svg','.bmp'].includes(ext);
    const isPdf = ext === '.pdf';
    const isText = data.isText && data.textContent;
    const isMd = /\.(md|markdown|mdown|mkd)$/i.test(ext);
    const modDate = data.lastModifiedDateTime ? new Date(data.lastModifiedDateTime).toLocaleString() : '-';

    previewBody.innerHTML = `
      <div class="fm-preview-meta">
        <div class="fm-preview-icon">${fmIcon(item, 38)}</div>
        <div class="fm-preview-info">
          <div class="fm-preview-fname">${escHtml(item.name)}</div>
          <div class="fm-preview-detail">Size: <strong>${formatBytes(item.size)}</strong></div>
          <div class="fm-preview-detail">Modified: <strong>${modDate}</strong></div>
          ${data.webUrl ? `<a href="${data.webUrl}" target="_blank" class="btn btn-ghost" style="font-size:0.68rem;padding:2px 7px;margin-top:0.3rem;display:inline-block">↗ Open in OneDrive</a>` : ''}
        </div>
      </div>
      <div class="fm-preview-actions" style="gap:0.35rem">
        <button class="btn btn-primary" style="font-size:0.72rem;padding:3px 9px" onclick="fmDownload('${escHtml(item.id)}','${escHtml(item.name)}')">⬇ Download</button>
        <button class="btn btn-ghost" style="font-size:0.72rem;padding:3px 9px" onclick="fmPreviewInReader(fmSelectedItem)">↗ Full Reader</button>
        <button class="btn btn-ghost" style="font-size:0.72rem;padding:3px 9px" onclick="fmDeleteItem('${escHtml(item.id)}','${escHtml(item.name)}',this)">Delete</button>
      </div>
      ${isText ? `
        <div class="fm-preview-content">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.3rem">
            <span class="fm-preview-content-label">${ext.toUpperCase().replace('.','')} Content Preview</span>
          </div>
          ${isMd && window.marked ? `
            <div class="lesson-body" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--r-md);padding:0.7rem;max-height:420px;overflow-y:auto;font-size:0.8rem">
              ${marked.parse(data.textContent)}
            </div>` : `
            <pre class="fm-code-preview">${escHtml(data.textContent)}</pre>`}
        </div>` : isImage ? `
        <div class="fm-preview-content">
          <img src="${item.downloadUrl ? escHtml(item.downloadUrl) : `/api/onedrive/download?id=${encodeURIComponent(item.id)}&name=${encodeURIComponent(item.name)}`}"
               style="max-width:100%;max-height:380px;border-radius:var(--r-md);margin-top:0.4rem;cursor:zoom-in;object-fit:contain"
               onclick="fmZoomImage(this.src, '${escHtml(item.name)}')" alt="${escHtml(item.name)}">
        </div>` : isPdf && item.downloadUrl ? `
        <div class="fm-preview-content">
          <iframe src="${escAttr(item.downloadUrl)}" title="${escAttr(item.name)}" style="width:100%;height:380px;border:1px solid var(--border);border-radius:var(--r-md)"></iframe>
        </div>` : `
        <div class="fm-preview-content">
          <div class="empty-state" style="padding:1.5rem 0;font-size:0.8rem">Binary or Office file format.<br>Click Download or Open in OneDrive above to view.</div>
        </div>`}`;
  } catch(e) {
    previewBody.innerHTML = `<div style="color:var(--red)">Preview error: ${escHtml(e.message)}</div>`;
  }
}

/**
 * A OneDrive file, read in the dock. Same read-only contract as every other
 * reader surface: name, meta, Download, Close, and the file itself rendered
 * as itself - markdown as prose, images as images, PDFs in the browser's own
 * viewer via the pre-authenticated downloadUrl, text as text. Office formats
 * that live only in the cloud say so honestly and hand over the OneDrive link.
 */
async function fmPreviewInReader(item) {
  readerShell(item.name, 'reading from OneDrive…');
  const ext = '.' + String((item.name || '').split('.').pop() || '').toLowerCase();
  try {
    const r = await fetch(`/api/onedrive/preview?id=${encodeURIComponent(item.id)}`);
    const data = await r.json();
    if (data.error) { readerBody(`<div class="reader-note">${escHtml(data.error)}</div>`); return; }

    readerMeta(['on OneDrive', item.size ? READER_KB(item.size) : '',
      data.lastModifiedDateTime ? String(data.lastModifiedDateTime).slice(0, 10) : '']
      .filter(Boolean).join(' · '));

    const dl = document.getElementById('reader-download');
    dl.style.display = '';
    dl.onclick = () => fmDownload(item.id, item.name);

    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'].includes(ext) && item.downloadUrl) {
      readerBody(`<img src="${escAttr(item.downloadUrl)}" alt="${escAttr(item.name)}"
        style="cursor:zoom-in" onclick="fmZoomImage(this.src,'${escAttr(item.name)}')"/>`);
    } else if (ext === '.pdf') {
      const rawUrl = `/api/onedrive/raw?id=${encodeURIComponent(item.id)}`;
      readerBody(`<object class="reader-pdf" data="${rawUrl}" type="application/pdf" width="100%" height="100%"><iframe class="reader-pdf" src="${rawUrl}" title="${escAttr(item.name)}"></iframe></object>`);
    } else if (data.isText && data.textContent) {
      const isMd = /\.(md|markdown|mdown|mkd)$/i.test(ext) || /\.md$/i.test(item.name || '');
      const filePath = item.path || (fileManagerPath === 'root' ? item.name : `${fileManagerPath}/${item.name}`);
      if (isMd) {
        readerBody(`<div class="lesson-body">${refChips(learnMd(data.textContent))}</div>`);
        readerEditable = { file: filePath, name: item.name, text: data.textContent, isMd: true };
        readerAddEditAffordance();
      } else if (ext === '.csv' || ext === '.tsv') {
        const sep = ext === '.tsv' ? '\t' : ',';
        const rows = String(data.textContent).split(/\r?\n/).filter(l => l.trim()).slice(0, 300);
        readerBody(`<div class="reader-tablewrap"><table class="reader-table">
          ${rows.map(l => `<tr>${l.split(sep).map(c => `<td>${escHtml(c)}</td>`).join('')}</tr>`).join('')}
        </table></div>`);
        readerEditable = { file: filePath, name: item.name, text: data.textContent, isMd: false };
        readerAddEditAffordance();
      } else {
        readerBody(`<pre class="reader-pre">${escHtml(data.textContent)}</pre>`);
        readerEditable = { file: filePath, name: item.name, text: data.textContent, isMd: false };
        readerAddEditAffordance();
      }
    } else {
      readerBody(`<div class="reader-note">No inline preview for this type - the copy on OneDrive opens it properly.
        ${data.webUrl ? `<a class="btn btn-ghost doc-act" href="${escAttr(data.webUrl)}" target="_blank" rel="noreferrer" style="margin-top:0.5rem">Open on OneDrive ↗</a>` : ''}</div>`);
    }
  } catch (e) { readerBody(`<div class="reader-note">${escHtml(e.message)}</div>`); }
}

// Click an image preview to see it full-size, dimmed backdrop, click anywhere out.
function fmZoomImage(src, name) {
  let overlay = document.getElementById('chase-overlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'chase-overlay';
  overlay.className = 'chase-overlay';
  overlay.innerHTML = `<img src="${src}" alt="${name}"
    style="max-width:92vw;max-height:92vh;border-radius:8px;box-shadow:0 12px 48px rgba(0,0,0,0.6)">`;
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

function fmClosePreview() {
  fmSelectedItem = null;
  document.getElementById('fm-preview')?.classList.add('hidden');
}

async function fmRefresh() {
  showToast('Refreshing…', 'info');
  await fmNavigate(fileManagerPath);
}

async function fmNewFolder() {
  const name = await uiPrompt({ title: 'New folder', label: 'Folder name',
    placeholder: 'lowercase-with-hyphens', confirmLabel: 'Create' });
  if (!name) return;
  try {
    const r = await fetch('/api/onedrive/mkdir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentPath: fileManagerPath === 'root' ? '' : fileManagerPath, folderName: name }),
    });
    const d = await r.json();
    if (d.error) { showToast(d.error, 'error'); } else { showToast('Folder created!', 'success'); await fmRefresh(); }
  } catch(e) { showToast(e.message, 'error'); }
}

async function fmUploadFile(input) {
  const file = input.files[0];
  if (!file) return;
  showToast(`Uploading ${file.name}…`, 'info');
  try {
    const text = await file.text();
    const r = await fetch('/api/onedrive/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath: fileManagerPath === 'root' ? '' : fileManagerPath, fileName: file.name, content: text }),
    });
    const d = await r.json();
    if (d.error) { showToast('Upload failed: ' + d.error, 'error'); }
    else { showToast(`${file.name} uploaded!`, 'success'); await fmRefresh(); }
  } catch(e) { showToast('Upload error: ' + e.message, 'error'); }
  input.value = '';
}

/**
 * Delete, for real. The old version hit the download endpoint with a parameter
 * nothing read, then reported success - nothing was ever deleted. Graph's DELETE
 * moves the item to the recycle bin, so the confirm text says what is true:
 * recoverable for 30 days, not "cannot be undone".
 */
async function fmDeleteItem(itemId, name, btn) {
  if (!await uiConfirm({ title: 'Delete this item?',
    body: `"${name}"\n\nIt goes to the OneDrive recycle bin and can be restored there for 30 days.`,
    confirmLabel: 'Delete', danger: true })) return;
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    const d = await (await fetch('/api/onedrive/delete', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId }) })).json();
    if (!d.success) { showToast(`Delete failed: ${d.error}`, 'error'); return; }
    showToast(`${name} deleted - recoverable in the recycle bin`, 'success');
    fmSelectedItem = null;
    fmClosePreview();
    await fmRefresh();
  } catch (e) { showToast('Delete failed: ' + e.message, 'error'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Delete'; } }
}

/**
 * Rename in place. Graph treats a name change as a PATCH on the item, the same
 * operation as a move, which is why one endpoint serves both.
 */
async function fmRenameItem(itemId, currentName) {
  const next = await uiPrompt({ title: 'Rename', label: 'New name', value: currentName,
    confirmLabel: 'Rename' });
  if (next === null) return;
  const clean = next.trim();
  if (!clean || clean === currentName) return;
  // Windows and OneDrive both reject these outright; catching it here gives a
  // useful message instead of a Graph error code.
  if (/[\\/:*?"<>|]/.test(clean)) { showToast('A name cannot contain \\ / : * ? " < > |', 'error'); return; }
  try {
    const d = await (await fetch('/api/onedrive/move', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, newName: clean }) })).json();
    showToast(d.success ? `Renamed to ${clean}` : `Rename failed: ${d.error}`, d.success ? 'success' : 'error');
    if (d.success) { fmSelectedItem = null; fmClosePreview(); await fmRefresh(); }
  } catch (e) { showToast(e.message, 'error'); }
}

/**
 * Move an item to another folder. Defaults the prompt to the current folder so
 * the common case is editing one segment rather than typing a whole path, and
 * accepts a leading slash or "root" for the drive root.
 */
async function fmMoveItem(itemId, name) {
  const suggestion = fileManagerPath === 'root' ? '' : fileManagerPath;
  const dest = await uiPrompt({ title: `Move "${name}"`, label: 'Destination folder',
    value: suggestion, placeholder: 'Sconl/Core/Apex/Vault',
    hint: 'Path from your OneDrive root. Blank or "root" means the top level.',
    confirmLabel: 'Move' });
  if (dest === null) return;
  const toPath = dest.trim().replace(/^\/+|\/+$/g, '');
  try {
    const d = await (await fetch('/api/onedrive/move', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, toPath: (toPath === '' || toPath.toLowerCase() === 'root') ? '' : toPath }) })).json();
    showToast(d.success ? `Moved to ${toPath || 'root'}` : `Move failed: ${d.error}`, d.success ? 'success' : 'error');
    if (d.success) { fmSelectedItem = null; fmClosePreview(); await fmRefresh(); }
  } catch (e) { showToast(e.message, 'error'); }
}


function fmDownload(itemId, name) {
  window.open(`/api/onedrive/download?id=${encodeURIComponent(itemId)}&name=${encodeURIComponent(name)}`, '_blank');
  showToast(`Downloading ${name}…`, 'info');
}

// Extension -> visual family: a color and a short label rendered inside a real
// document glyph. One drawing, many families - consistency beats variety here.
const FM_FAMILIES = {
  pdf:  { c: '#f85149', l: 'PDF' },
  docx: { c: '#58a6ff', l: 'DOC' }, doc: { c: '#58a6ff', l: 'DOC' },
  xlsx: { c: '#3fb950', l: 'XLS' }, xls: { c: '#3fb950', l: 'XLS' }, csv: { c: '#3fb950', l: 'CSV' },
  pptx: { c: '#d29922', l: 'PPT' }, ppt: { c: '#d29922', l: 'PPT' },
  jpg: { c: '#bc8cff', img: true }, jpeg: { c: '#bc8cff', img: true }, png: { c: '#bc8cff', img: true },
  gif: { c: '#bc8cff', img: true }, webp: { c: '#bc8cff', img: true }, svg: { c: '#bc8cff', img: true },
  mp4: { c: '#ff7b72', l: 'VID' }, mov: { c: '#ff7b72', l: 'VID' }, avi: { c: '#ff7b72', l: 'VID' },
  mp3: { c: '#ffa657', l: 'AUD' }, wav: { c: '#ffa657', l: 'AUD' },
  zip: { c: '#8b949e', l: 'ZIP' }, rar: { c: '#8b949e', l: 'ZIP' }, '7z': { c: '#8b949e', l: 'ZIP' },
  txt: { c: '#8b949e', l: 'TXT' }, md: { c: '#8b949e', l: 'MD' },
  js: { c: '#e3b341', l: 'JS' }, ts: { c: '#58a6ff', l: 'TS' }, py: { c: '#58a6ff', l: 'PY' },
  html: { c: '#ff7b72', l: 'HTM' }, css: { c: '#58a6ff', l: 'CSS' }, json: { c: '#e3b341', l: '{ }' },
  yml: { c: '#8b949e', l: 'YML' }, yaml: { c: '#8b949e', l: 'YML' }, tsv: { c: '#3fb950', l: 'TSV' },
};

/**
 * A real icon instead of the word "DIR": folders are a filled folder shape,
 * files are one document glyph with a folded corner, tinted and labelled by
 * family, and images get a small landscape inside instead of letters.
 */
function fmIcon(item, size = 30) {
  if (item.folder) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.4h8A2 2 0 0 1 21 9.4V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"
            fill="var(--amber)" fill-opacity="0.28" stroke="var(--amber)" stroke-width="1.4"/>
    </svg>`;
  }
  const ext = (item.name || '').split('.').pop()?.toLowerCase();
  const f = FM_FAMILIES[ext] || { c: '#8b949e', l: (ext || 'file').slice(0, 3).toUpperCase() };
  const inner = f.img
    ? `<circle cx="9.2" cy="10.6" r="1.3" fill="${f.c}"/>
       <path d="M7 17l3.2-3.6 2.1 2.2 2.4-3 2.3 4.4z" fill="${f.c}" fill-opacity="0.85"/>`
    : `<text x="12" y="16.6" text-anchor="middle" font-family="Inter,system-ui,sans-serif"
             font-size="5.6" font-weight="700" fill="${f.c}" letter-spacing="0.2">${f.l}</text>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
    <path d="M6 3h8l5 5v12a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V4.5A1.5 1.5 0 0 1 6.5 3z"
          fill="${f.c}" fill-opacity="0.10" stroke="${f.c}" stroke-opacity="0.55" stroke-width="1.2"/>
    <path d="M14 3v5h5" stroke="${f.c}" stroke-opacity="0.55" stroke-width="1.2" fill="none"/>
    ${inner}
  </svg>`;
}

function formatBytes(b) {
  if (!b) return '-';
  if (b < 1024) return b + 'B';
  if (b < 1048576) return Math.round(b / 1024) + 'KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + 'MB';
  return (b / 1073741824).toFixed(2) + 'GB';
}

// ── INTEGRATIONS HUB ─────────────────────────────────────────────────────────


/**
 * The integrations panel, now a SECTION of Settings rather than its own
 * destination. Kept as a function so Settings can compose it and nothing that
 * linked to it has to be rewritten.
 */
function renderIntegrationsBody() {
  const svc = STATE.services || {};
  const jc = svc.jiraConfig || {};
  const gc = svc.groqConfig || {};
  const ms = svc.msConfig || {};
  const bf = svc.bufferConfig || {};
  const gh = STATE.github || {};
  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Unified Integrations Hub</span>
        <span class="card-meta">All Services Connected</span>
      </div>
    </div>
    <div class="cards-grid">
      <div class="card">
        <div class="card-header"><span class="card-title">Jira Cloud</span><span class="badge ${jc.hasToken&&jc.host?'badge-jira':'badge-medium'}">${jc.hasToken&&jc.host?'● Connected':'○ Pending'}</span></div>
        <div style="font-size:0.82rem;color:var(--text-2);margin-bottom:0.75rem">
          <div><strong>Host:</strong> ${jc.host||'Not set'}</div>
          <div><strong>Project:</strong> ${jc.projectKey||'-'}</div>
          <div><strong>Issues:</strong> ${STATE.jiraIssues.length}</div>
        </div>
        <div style="display:flex;gap:0.4rem"><button class="btn btn-primary" onclick="navigate('jira')">Open Board</button><button class="btn btn-ghost" onclick="navigate('settings')">Configure</button></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">GitHub CLI</span><span class="badge badge-low">● Connected</span></div>
        <div style="font-size:0.82rem;color:var(--text-2);margin-bottom:0.75rem">
          <div><strong>User:</strong> ${gh.user?.login||'Architect'}</div>
          <div><strong>Repos:</strong> ${gh.repos?.length||0}</div>
        </div>
        <div style="display:flex;gap:0.4rem"><button class="btn btn-primary" onclick="navigate('github')">View Repos</button><button class="btn btn-ghost" onclick="quickAsk('gh repo list')">Run CLI</button></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Microsoft 365</span><span class="badge ${ms.hasCreds?'badge-jira':'badge-medium'}">${ms.hasCreds?'● Connected':'○ Not Connected'}</span></div>
        <div style="font-size:0.82rem;color:var(--text-2);margin-bottom:0.75rem">
          <div><strong>OneDrive:</strong> ${ms.hasCreds?'Connected':'Not connected'}</div>
          <div><strong>Calendar:</strong> ${ms.hasCreds?'Syncing':'Needs access token'}</div>
          <div><strong>Tenant ID:</strong> ${ms.tenantId||'Not set'}</div>
        </div>
        <div style="display:flex;gap:0.4rem">
          <button class="btn btn-primary" onclick="navigate('files')">File Manager</button>
          <button class="btn btn-ghost" onclick="navigate('settings')">Configure M365</button>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Social</span><span class="badge ${bf.hasToken?'badge-jira':'badge-medium'}">${bf.hasToken?'● Connected':'○ Not Connected'}</span></div>
        <div style="font-size:0.82rem;color:var(--text-2);margin-bottom:0.75rem">
          <div><strong>Social Media:</strong> ${bf.hasToken?'Ready to schedule':'Token needed'}</div>
          <div style="font-size:0.73rem;color:var(--text-3);margin-top:0.3rem">Get token at buffer.com → Settings → API Access</div>
        </div>
        <div style="display:flex;gap:0.4rem">
          ${bf.hasToken ? '<button class="btn btn-primary" onclick="navigate(\'social\')">Compose Post</button>' : ''}
          <button class="btn btn-ghost" onclick="navigate('settings')">Configure Buffer</button>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">WhatsApp</span><span class="badge badge-medium">○ Blueprint Ready</span></div>
        <div style="font-size:0.82rem;color:var(--text-2);margin-bottom:0.75rem">
          <div><strong>Status:</strong> Parameters armed</div>
          <div><strong>Verify Token:</strong> <code>isconl_verify_2026</code></div>
        </div>
        <div style="display:flex;gap:0.4rem"><button class="btn btn-ghost" onclick="navigate('whatsapp-guide')">View Blueprint</button></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">AI Engines</span><span class="badge badge-jira">● Active</span></div>
        <div style="font-size:0.82rem;color:var(--text-2);margin-bottom:0.75rem">
          <div><strong>Primary:</strong> Anthropic Claude 3.5 Sonnet</div>
          <div><strong>Fallback:</strong> Groq Llama 3.1 70B (${gc.hasKey?'Armed':'<a href=\"https://console.groq.com\" target=\"_blank\" style=\"color:var(--green)\">Get free key</a>'})</div>
          <div><strong>Voice:</strong> ElevenLabs (Connected)</div>
        </div>
        <div style="display:flex;gap:0.4rem"><button class="btn btn-ghost" onclick="navigate('settings')">Configure AI</button></div>
      </div>
    </div>`;
}

// ── SOCIAL / BUFFER VIEW ──────────────────────────────────────────────────────

/* ══════════════════════════════════════════════════════════════════════════
   THE SOCIAL DESK
   Buffer used to be a compose box with a list of checkboxes under it. This is a
   control desk: every channel with its live state, the queue as something you
   can edit and reorder, what has already gone out, and a composer that knows
   which channels it is aimed at and what each one's limit is.
   ══════════════════════════════════════════════════════════════════════════ */
let BUFFER = null;                 // { connected, channels, queue, sent, errors }
let bufferPicked = new Set();      // the channels the composer is aimed at
let bufferTab = 'queue';           // queue | sent

// Per-network identity: the mark, the accent hue, and the limit worth respecting.
const SOCIAL_NET = {
  linkedin:  { label: 'LinkedIn',  hue: 205, limit: 3000, mark: 'in' },
  twitter:   { label: 'X',         hue: 0,   limit: 280,  mark: 'X'  },
  x:         { label: 'X',         hue: 0,   limit: 280,  mark: 'X'  },
  instagram: { label: 'Instagram', hue: 320, limit: 2200, mark: 'ig' },
  facebook:  { label: 'Facebook',  hue: 220, limit: 5000, mark: 'fb' },
  threads:   { label: 'Threads',   hue: 0,   limit: 500,  mark: 'th' },
  mastodon:  { label: 'Mastodon',  hue: 260, limit: 500,  mark: 'ma' },
  tiktok:    { label: 'TikTok',    hue: 180, limit: 2200, mark: 'tt' },
  youtube:   { label: 'YouTube',   hue: 358, limit: 5000, mark: 'yt' },
  pinterest: { label: 'Pinterest', hue: 350, limit: 500,  mark: 'pi' },
};
function netOf(svc) {
  return SOCIAL_NET[String(svc || '').toLowerCase()]
    || { label: svc || 'Channel', hue: 140, limit: 2000, mark: String(svc || '?').slice(0, 2) };
}
/** The strictest limit among the aimed channels - the only one that binds. */
function bufferLimit() {
  const picked = (BUFFER?.channels || []).filter(c => bufferPicked.has(c.id));
  return picked.length ? Math.min(...picked.map(c => netOf(c.service).limit)) : null;
}

let bufferChannelFilter = null;
let bufferSearchQuery = '';

function renderSocial() {
  const bf = STATE.services?.bufferConfig || {};
  if (!BUFFER) loadBufferDesk();

  if (!BUFFER && !bf.hasToken) return socialNotConnected();
  const d = BUFFER;
  if (!d) return '<div class="card"><div class="empty-state">Reading the desk…</div></div>';
  if (!d.connected) return socialNotConnected(d.error);

  const channels = d.channels || [];
  const rawQueue = d.queue || [];
  const rawSent = d.sent || [];

  const matchesFilter = (p) => {
    if (bufferChannelFilter) {
      const ch = channels.find(c => c.id === bufferChannelFilter);
      if (p.channelId !== bufferChannelFilter && p.channelService !== bufferChannelFilter && (!ch || p.channelService !== ch.service)) return false;
    }
    if (bufferSearchQuery.trim()) {
      const q = bufferSearchQuery.toLowerCase();
      return (p.text || '').toLowerCase().includes(q) || (p.channelService || '').toLowerCase().includes(q);
    }
    return true;
  };

  const queue = rawQueue.filter(matchesFilter);
  const sent = rawSent.filter(matchesFilter);

  const picked = channels.filter(c => bufferPicked.has(c.id));
  const limit = bufferLimit();
  const scheduled = document.getElementById('buffer-schedule-time')?.value;

  return `
    <div class="view-head">
      <h1>Buffer Control Desk</h1>
      <div class="view-head-meta">${channels.length} profile${channels.length === 1 ? '' : 's'} connected · ${rawQueue.length} queued · ${rawSent.length} published</div>
    </div>

    ${d.error ? `<div class="card"><div class="fin-warn">${escHtml(d.error)}</div>
      <div style="margin-top:0.6rem"><button class="btn btn-ghost" style="font-size:0.72rem;padding:3px 10px"
        onclick="navigate('settings')">Reconnect in Settings</button></div></div>` : ''}

    <div class="card">
      <div class="card-header">
        <span class="card-title">Profiles & Accounts</span>
        <div style="display:flex;gap:0.4rem;align-items:center">
          ${channels.length ? `<button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 9px"
            onclick="bufferPickAll()">${picked.length === channels.length ? 'Target none' : 'Target all'}</button>` : ''}
          <button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 9px" onclick="loadBufferDesk(true, this)">Refresh Desk</button>
        </div>
      </div>
      ${channels.length ? `
        <div class="sd-channels">
          ${channels.map(c => {
            const n = netOf(c.service);
            const on = bufferPicked.has(c.id);
            const channelQueueCount = rawQueue.filter(p => p.channelId === c.id || p.channelService === c.service).length;
            const isPaused = !!c.isQueuePaused;
            const trouble = c.isDisconnected ? 'disconnected' : isPaused ? 'queue paused' : c.isLocked ? 'locked' : '';
            const isFiltered = bufferChannelFilter === c.id;
            return `
              <div class="sd-channel${on ? ' on' : ''}${trouble ? ' has-trouble' : ''}${isFiltered ? ' is-filtered' : ''}"
                   style="--net:hsl(${n.hue} 62% 62%);--net-dim:hsl(${n.hue} 45% 34%)">
                <div class="sd-ch-top" onclick="bufferPick('${escHtml(c.id)}')">
                  <span class="sd-mark">${escHtml(n.mark)}</span>
                  <span class="sd-ch-main">
                    <span class="sd-ch-name">${escHtml(c.displayName || c.name || n.label)}</span>
                    <span class="sd-ch-sub">${escHtml(n.label)}${c.timezone ? ' · ' + escHtml(String(c.timezone).split('/').pop()) : ''}</span>
                  </span>
                  <span class="sd-tick" title="Toggle composer target">${on ? '✓' : ''}</span>
                </div>
                <div class="sd-ch-controls" style="display:flex;align-items:center;gap:0.4rem;margin-top:0.4rem;font-size:0.65rem">
                  <span style="color:var(--text-3);font-family:var(--font-mono)">${channelQueueCount} queued</span>
                  ${trouble ? `<span class="sd-trouble">${escHtml(trouble)}</span>` : `<span class="sd-tag" style="color:var(--green)">active</span>`}
                  <button class="btn btn-ghost" style="font-size:0.62rem;padding:1px 6px;margin-left:auto"
                          onclick="bufferFilterProfile('${escHtml(c.id)}')"
                          title="Filter feed by this profile">${isFiltered ? 'Showing All' : 'Filter Feed'}</button>
                  <button class="btn btn-ghost" style="font-size:0.62rem;padding:1px 6px"
                          onclick="bufferToggleChannelPause('${escHtml(c.id)}', ${!isPaused}, this)"
                          title="${isPaused ? 'Resume queue' : 'Pause queue'}">${isPaused ? 'Resume' : 'Pause'}</button>
                </div>
              </div>`;
          }).join('')}
        </div>
        ${d.errors?.channels ? `<div class="fin-warn" style="margin-top:0.6rem">${escHtml(d.errors.channels)}</div>` : ''}`
      : '<div class="empty-state" style="text-align:left;padding:0.5rem 0">No profiles attached yet. Add them in Buffer, then Refresh.</div>'}
    </div>

    <div class="card sd-composer">
      <div class="card-header">
        <span class="card-title">Compose & Schedule</span>
        <span class="card-meta">${picked.length ? `Targeting: ${picked.map(c => netOf(c.service).label).join(', ')}` : 'pick a profile above'}</span>
      </div>
      <textarea id="buffer-post-text" class="sd-text" rows="5" oninput="bufferCount()"
                placeholder="Write your post - or click 'Draft it for me' to let the agent compose in your voice."></textarea>
      <div class="sd-meter">
        <span id="sd-count" class="sd-count">0${limit ? ' / ' + limit : ''}</span>
        ${limit ? '<span class="sd-limit-note">strictest character limit among targeted channels</span>' : ''}
      </div>
      <div class="sd-compose-row">
        <label class="sd-when"><span>When</span>
          <input id="buffer-schedule-time" type="datetime-local" onchange="repaintView('social')"/></label>
        <div class="sd-compose-actions">
          <button class="btn btn-ghost" onclick="aiWritePost(this)">Draft it for me</button>
          <button class="btn btn-primary" onclick="submitBufferPost()">${scheduled ? 'Schedule it' : 'Add to queue'}</button>
        </div>
      </div>
      <div class="sd-hint">Leave time blank to use the channel's next queue slot, or select a specific date and time.</div>
      <div id="buffer-result" class="settings-result hidden"></div>
    </div>

    <div class="card">
      <div class="card-header" style="flex-wrap:wrap;gap:0.6rem;margin-bottom:0.7rem">
        <div class="task-tabs">
          <button class="task-tab${bufferTab === 'queue' ? ' on' : ''}" onclick="bufferSetTab('queue')">Queue <span>${queue.length}</span></button>
          <button class="task-tab${bufferTab === 'sent' ? ' on' : ''}" onclick="bufferSetTab('sent')">Published <span>${sent.length}</span></button>
        </div>
        <div style="display:flex;gap:0.4rem;align-items:center;margin-left:auto;flex-wrap:wrap">
          <input type="text" class="search-input" style="font-size:0.75rem;padding:3px 8px;width:150px"
                 placeholder="Search posts..." value="${escAttr(bufferSearchQuery)}" oninput="bufferSearchPosts(this.value)"/>
          ${bufferChannelFilter ? `
            <button class="btn btn-ghost" style="font-size:0.68rem;padding:2px 8px" onclick="bufferFilterProfile(null)">
              Clear Filter (${escHtml(channels.find(c => c.id === bufferChannelFilter)?.displayName || 'Selected Profile')}) ✕
            </button>` : ''}
        </div>
      </div>
      ${bufferTab === 'queue' ? renderBufferPosts(queue, true, d.errors?.queue)
                             : renderBufferPosts(sent, false, d.errors?.sent)}
    </div>`;
}

function socialNotConnected(err) {
  return `
    <div class="view-head">
      <h1>Buffer</h1>
      <div class="view-head-meta">every profile from one unified desk … publish without switching apps</div>
    </div>
    <div class="card">
      <div class="empty-state" style="text-align:left;padding:1.1rem 0.4rem">
        <div style="font-size:0.9rem;color:var(--text);margin-bottom:0.4rem">${err ? escHtml(err) : 'Buffer is not connected yet.'}</div>
        <div style="font-size:0.8rem;line-height:1.6;color:var(--text-3)">Attach your profiles at buffer.com, then put the API key in Settings.
          From then on this page runs LinkedIn, X, Instagram and all connected profiles - compose, queue, edit,
          pause, reschedule - without leaving the console.</div>
        <div style="margin-top:0.9rem"><button class="btn btn-primary" onclick="navigate('settings')">Open Settings</button></div>
      </div>
    </div>`;
}

function renderBufferPosts(list, editable, err) {
  if (err) return `<div class="fin-warn">${escHtml(err)}</div>
    <div class="evt-import-note">Channels still work - this token cannot read posts. Reconnect it with full scopes to run the queue from here.</div>`;
  if (!list.length) return `<div class="empty-state" style="text-align:left;padding:0.5rem 0">${editable
    ? (bufferChannelFilter || bufferSearchQuery ? 'No queued posts match the current filter/search.' : 'Nothing queued. Anything composed above lands here first, where it can still be changed.')
    : (bufferChannelFilter || bufferSearchQuery ? 'No published posts match the current filter/search.' : 'Nothing published in the window Buffer reports.')}</div>`;
  return `<div class="sd-posts">
    ${list.map(p => {
      const n = netOf(p.channelService);
      const when = p.dueAt || p.sentAt || p.createdAt || '';
      return `
      <div class="sd-post${p.error ? ' has-error' : ''}" style="--net:hsl(${n.hue} 62% 62%)">
        <div class="sd-post-top">
          <span class="sd-mark sm">${escHtml(n.mark)}</span>
          <span class="sd-post-when">${escHtml(String(when).replace('T', ' ').slice(0, 16) || 'unscheduled')}</span>
          <span class="sd-tag">${p.isCustomScheduled ? 'exact time' : 'next slot'}</span>
          ${p.status && p.status !== 'pending' ? `<span class="sd-tag">${escHtml(p.status)}</span>` : ''}
        </div>
        <div class="sd-post-text">${escHtml(p.text || '(no text)')}</div>
        ${p.error ? `<div class="sd-post-err">${escHtml(p.error)}</div>` : ''}
        ${editable ? `<div class="sd-post-actions">
          <button class="btn btn-ghost" onclick="bufferEditPost('${escHtml(p.id)}')">Edit</button>
          <button class="btn btn-ghost" onclick="bufferReschedule('${escHtml(p.id)}')">Reschedule</button>
          <button class="btn btn-ghost" onclick="bufferPostNow('${escHtml(p.id)}', this)">Post Now</button>
          <button class="btn btn-ghost sd-del" onclick="bufferDeletePost('${escHtml(p.id)}', this)">Remove</button>
        </div>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}

function bufferSetTab(t) { bufferTab = t; repaintView('social'); }
function bufferFilterProfile(id) {
  if (bufferChannelFilter === id) bufferChannelFilter = null;
  else bufferChannelFilter = id;
  repaintView('social');
}
function bufferSearchPosts(val) {
  bufferSearchQuery = val;
  repaintView('social');
}
async function bufferToggleChannelPause(channelId, pause, btn) {
  const was = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = pause ? 'Pausing…' : 'Resuming…'; }
  try {
    const r = await fetch('/api/buffer/channel/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId, pause })
    });
    const d = await r.json();
    if (!d.success) throw new Error(d.error || 'Failed to toggle pause');
    showToast(`Queue ${pause ? 'paused' : 'resumed'} for profile`, 'success');
    await loadBufferDesk(true);
  } catch (e) {
    showToast(e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = was; }
  }
}
async function bufferPostNow(id, btn) {
  const was = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Publishing…'; }
  try {
    const r = await fetch('/api/buffer/post/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'move' })
    });
    const d = await r.json();
    if (!d.success) throw new Error(d.error || 'Could not move post');
    showToast('Post moved to top of queue for immediate publishing', 'success');
    await loadBufferDesk(true);
  } catch (e) {
    showToast(e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = was; }
  }
}
function bufferPick(id) {
  if (bufferPicked.has(id)) bufferPicked.delete(id); else bufferPicked.add(id);
  repaintView('social');
}
function bufferPickAll() {
  const all = (BUFFER?.channels || []).map(c => c.id);
  if (all.length && all.every(id => bufferPicked.has(id))) bufferPicked.clear();
  else all.forEach(id => bufferPicked.add(id));
  repaintView('social');
}

// Live count against the strictest limit of the aimed channels.
function bufferCount() {
  const el = document.getElementById('sd-count');
  const ta = document.getElementById('buffer-post-text');
  if (!el || !ta) return;
  const limit = bufferLimit();
  const n = ta.value.length;
  el.textContent = limit ? n + ' / ' + limit : String(n);
  el.classList.toggle('over', !!limit && n > limit);
}

async function loadBufferDesk(force, btn) {
  const was = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Reading…'; }
  try {
    BUFFER = await (await fetch('/api/buffer/desk')).json();
    // On the first read, aim at every healthy channel - "post it everywhere" is
    // what this usually means, and unaiming one is a single click.
    if (!bufferPicked.size) {
      (BUFFER.channels || []).filter(c => !c.isDisconnected).forEach(c => bufferPicked.add(c.id));
    }
  } catch (e) { BUFFER = { connected: false, error: e.message }; }
  if (btn) { btn.disabled = false; btn.textContent = was; }
  if (currentView === 'social') repaintView('social');
}

async function bufferManage(id, action, extra) {
  try {
    const d = await (await fetch('/api/buffer/post/manage', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ id, action }, extra || {})) })).json();
    if (!d.success) { showToast(d.error || 'Buffer refused it', 'error'); return false; }
    return true;
  } catch (e) { showToast(e.message, 'error'); return false; }
}

async function bufferEditPost(id) {
  const post = (BUFFER?.queue || []).find(p => p.id === id);
  const text = await uiPrompt({ title: 'Edit the queued post', label: 'Post text',
    value: post?.text || '', multiline: true, confirmLabel: 'Save to Buffer' });
  if (text === null) return;
  if (await bufferManage(id, 'edit', { text })) { showToast('Updated in Buffer', 'success'); loadBufferDesk(true); }
}

async function bufferReschedule(id) {
  const post = (BUFFER?.queue || []).find(p => p.id === id);
  const when = await uiPrompt({ title: 'Reschedule', label: 'New date and time',
    type: 'datetime-local', value: String(post?.dueAt || '').slice(0, 16), confirmLabel: 'Move it' });
  if (!when) return;
  if (await bufferManage(id, 'move', { dueAt: when })) { showToast('Moved', 'success'); loadBufferDesk(true); }
}

async function bufferDeletePost(id, btn) {
  if (!await uiConfirm({ title: 'Remove this from the queue?',
    body: 'It is deleted in Buffer and will not publish. Nothing is sent.',
    confirmLabel: 'Remove', danger: true })) return;
  btn.disabled = true;
  if (await bufferManage(id, 'delete')) { showToast('Removed from the queue', 'success'); loadBufferDesk(true); }
  btn.disabled = false;
}

async function aiWritePost(btn) {
  const picked = (BUFFER?.channels || []).filter(c => bufferPicked.has(c.id));
  const nets = picked.map(c => netOf(c.service).label).join(' and ') || 'LinkedIn';
  const limit = bufferLimit() || 3000;
  const was = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Drafting…'; }
  try {
    const reply = await postChat(
      'Draft one social post for me to publish as myself, for ' + nets + '. Hard limit ' + limit + ' characters. '
      + 'My register: direct, concrete, no hype, no emoji unless the network expects it, at most two hashtags. '
      + 'I am a founder and biomedical engineer who builds systems - write from real substance, never motivational filler. '
      + 'No em-dashes, use a spaced hyphen. Output ONLY the post text.');
    const ta = document.getElementById('buffer-post-text');
    if (ta && reply) { ta.value = String(reply).trim(); bufferCount(); }
  } catch (e) { showToast('Could not draft it: ' + e.message, 'error'); }
  if (btn) { btn.disabled = false; btn.textContent = was; }
}

async function submitBufferPost() {
  const text = document.getElementById('buffer-post-text')?.value.trim();
  if (!text) { showToast('Write something first', 'warn'); return; }
  const profileIds = [...bufferPicked];
  if (!profileIds.length) { showToast('Aim it at a channel first', 'warn'); return; }
  const limit = bufferLimit();
  if (limit && text.length > limit) {
    if (!await uiConfirm({ title: 'Over the limit', confirmLabel: 'Send anyway', danger: true,
      body: text.length + ' characters against a ' + limit + ' limit. The strictest channel will refuse it.' })) return;
  }
  const scheduledAt = document.getElementById('buffer-schedule-time')?.value;
  const el = document.getElementById('buffer-result');
  if (el) { el.className = 'settings-result'; el.textContent = 'Sending to Buffer…'; }
  try {
    const d = await (await fetch('/api/buffer/post', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, profileIds, scheduledAt: scheduledAt || undefined }) })).json();
    const ok = (d.results || []).filter(r => r.id).length;
    const bad = (d.results || []).filter(r => r.error);
    if (ok) {
      const msg = ok + ' channel' + (ok === 1 ? '' : 's') + ' queued' + (bad.length ? ', ' + bad.length + ' refused' : '');
      if (el) { el.textContent = msg; el.classList.add(bad.length ? 'warn' : 'success'); }
      showToast(msg, 'success');
      document.getElementById('buffer-post-text').value = '';
      bufferCount();
      loadBufferDesk(true);
    } else {
      const msg = d.error || bad[0]?.error || 'Buffer refused it';
      if (el) { el.textContent = msg; el.classList.add('error'); }
      showToast(msg, 'error');
    }
  } catch (e) {
    if (el) { el.textContent = e.message; el.classList.add('error'); }
    showToast(e.message, 'error');
  }
}

// ── SETTINGS VIEW ─────────────────────────────────────────────────────────────

function renderSettings() {
  const svc = STATE.services || {};
  const jc = svc.jiraConfig || {};
  const gc = svc.groqConfig || {};
  const ms = svc.msConfig || {};
  const bf = svc.bufferConfig || {};
  const statusRows = [
    {name:'Anthropic Claude 3.5',key:'anthropic'},{name:'Groq AI Engine',key:'groq'},
    {name:'ElevenLabs Voice',key:'elevenlabs'},{name:'GitHub CLI',key:'github'},
    {name:'Jira Cloud',key:'jira'},{name:'WhatsApp',key:'whatsapp'},
    {name:'Microsoft 365 / OneDrive',key:'msgraph'},{name:'Buffer Social',key:'buffer'},
  ];
  return `
    <div class="view-head">
      <h1>Settings</h1>
      <div class="view-head-meta">all credentials persist to .env - changes apply immediately</div>
    </div>
    <div class="settings-page">
      <div class="settings-header-row">
        <h2 class="settings-title">Centralized Settings</h2>
        <span class="settings-sub">All credentials persist to <code>.env</code> - changes apply immediately.</span>
      </div>

      <!-- The app itself. It is in no store, so the agent is the store: this
           card serves the actual signed binary, proxied from the private
           release so the phone never needs a GitHub token of its own. -->
      <div class="settings-section" id="apk-section">
        <div class="settings-section-title">iSconl for Android
          <span class="badge badge-medium" id="apk-badge" style="margin-left:auto">Checking</span>
        </div>
        <p class="settings-hint">
          The native client: offline-first, signed, and installable straight from here.
          Open this page <strong>on your phone</strong> and tap Download, then tap the finished
          download to install. Upgrades keep your data because every build is signed with the same key.
        </p>
        <div id="apk-card"><div class="settings-hint">Checking for the current build...</div></div>
      </div>

      <!-- Jira -->
      <div class="settings-section">
        <div class="settings-section-title">Jira Cloud
          <span class="badge ${jc.hasToken&&jc.host?'badge-jira':'badge-medium'}" style="margin-left:auto">${jc.hasToken&&jc.host?'● Connected':'○ Needs Config'}</span>
        </div>
        <div class="settings-grid">
          <div class="settings-field"><label>Host Domain</label><input id="s-jira-host" type="text" value="${escHtml(jc.host||'')}" placeholder="yourorg.atlassian.net"/></div>
          <div class="settings-field"><label>Project Key</label><input id="s-jira-project" type="text" value="${escHtml(jc.projectKey||'')}" placeholder="WSRU"/></div>
          <div class="settings-field"><label>Email</label><input id="s-jira-email" type="email" value="${escHtml(jc.email||'')}" placeholder="your@email.com"/></div>
          <div class="settings-field"><label>API Token</label><input id="s-jira-token" type="password" placeholder="${jc.hasToken?'Saved - enter to replace':'Paste from id.atlassian.com'}"/></div>
        </div>
        <div class="settings-actions">
          <button class="btn btn-primary" onclick="saveSettings('jira')">Save Jira Config</button>
          <button class="btn btn-ghost" onclick="testJiraConnection()">Test Connection</button>
        </div>
        <div id="jira-test-result" class="settings-result hidden"></div>
      </div>

      <!-- Microsoft 365 -->
      <div class="settings-section">
        <div class="settings-section-title">Microsoft 365 / OneDrive / Outlook
          <span class="badge ${ms.hasCreds?'badge-jira':'badge-medium'}" style="margin-left:auto">${ms.hasCreds?'● Connected':'○ Not Connected'}</span>
        </div>
        <p class="settings-hint">
          Connect your Microsoft 365 account to auto-sync <strong>OneDrive files</strong>, <strong>Outlook emails into Inbox</strong>, and <strong>Outlook Calendar events</strong>!
        </p>
        
        <div style="background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--r-md);padding:0.85rem;margin-bottom:0.75rem">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;flex-wrap:wrap">
            <div>
              <strong style="color:var(--text);font-size:0.85rem">1-Click Microsoft Device Login</strong>
              <div style="font-size:0.75rem;color:var(--text-3)">No complex Azure app setup needed - authorize with Microsoft device code</div>
            </div>
            <button class="btn btn-primary" onclick="startM365DeviceLogin()">Start M365 Login</button>
          </div>
          <div id="m365-device-box" class="hidden" style="margin-top:0.75rem;padding:0.75rem;background:var(--panel);border:1px solid var(--green-dim);border-radius:var(--r-sm)">
            <div style="font-size:0.8rem;color:var(--text-2);margin-bottom:0.4rem">1. Copy code: <strong id="m365-user-code" style="font-size:1.1rem;color:var(--green-bright);font-family:var(--font-mono);letter-spacing:0.1em;background:var(--surface);padding:2px 8px;border-radius:4px">....</strong></div>
            <div style="font-size:0.8rem;color:var(--text-2);margin-bottom:0.5rem">2. Open link: <a id="m365-login-link" href="https://microsoft.com/devicelogin" target="_blank" class="btn btn-ghost" style="font-size:0.75rem;padding:2px 8px">Open microsoft.com/devicelogin ↗</a></div>
            <div id="m365-poll-status" style="font-size:0.73rem;color:var(--amber);font-family:var(--font-mono)">Waiting for you to enter code...</div>
          </div>
        </div>

        <div class="settings-grid">
          <div class="settings-field"><label>Access Token (Manual Override)</label><input id="s-ms-token" type="password" placeholder="${ms.hasCreds?'Saved - enter to replace':'Or paste access token directly'}"/></div>
          <div class="settings-field"><label>Tenant ID</label><input id="s-ms-tenant" type="text" value="${escHtml(ms.tenantId||'')}" placeholder="Your Azure tenant ID (optional)"/></div>
        </div>
        <div class="settings-actions">
          <button class="btn btn-primary" onclick="saveSettings('ms')">Save Manual Config</button>
          <button class="btn btn-ghost" onclick="navigate('files')">Open File Manager</button>
        </div>
      </div>

      <!-- Buffer -->
      <div class="settings-section">
        <div class="settings-section-title">Buffer · Social Media Scheduler
          <span class="badge ${bf.hasToken?'badge-jira':'badge-medium'}" style="margin-left:auto">${bf.hasToken?'● Connected':'○ No Token'}</span>
        </div>
        <p class="settings-hint">Get your Access Token from <strong>buffer.com</strong> → Settings → Developer → Create App → Access Token.</p>
        <div class="settings-grid">
          <div class="settings-field"><label>Buffer Access Token</label><input id="s-buffer-token" type="password" placeholder="${bf.hasToken?'Saved - enter to replace':'Paste from buffer.com'}"/></div>
        </div>
        <div class="settings-actions">
          <button class="btn btn-primary" onclick="saveSettings('buffer')">Save Buffer Config</button>
          ${bf.hasToken?`<button class="btn btn-ghost" onclick="navigate('social')">Open Social Scheduler</button>`:''}
        </div>
      </div>

      <!-- Anthropic Claude AI Engine -->
      <div class="settings-section">
        <div class="settings-section-title">Anthropic Claude AI (Primary)
          <span class="badge ${svc.anthropic==='connected'?'badge-jira':'badge-medium'}" style="margin-left:auto">${svc.anthropic==='connected'?'● Connected':'○ No Key'}</span>
        </div>
        <p class="settings-hint">Primary sovereign reasoning engine. Auto-discovered or set manually below.</p>
        <div class="settings-grid">
          <div class="settings-field"><label>Anthropic API Key</label><input id="s-anthropic-key" type="password" placeholder="${svc.anthropic==='connected'?'Saved - enter to replace':'sk-ant-api...'}"/></div>
          <div class="settings-field"><label>Model</label>
            <select id="s-anthropic-model">
              <option value="claude-3-5-sonnet-20241022" ${(svc.anthropicConfig?.model||'').includes('sonnet')?'selected':''}>Claude 3.5 Sonnet (Recommended)</option>
              <option value="claude-3-5-haiku-20241022" ${(svc.anthropicConfig?.model||'').includes('haiku')?'selected':''}>Claude 3.5 Haiku (Fast)</option>
            </select>
          </div>
        </div>
        <div class="settings-actions"><button class="btn btn-primary" onclick="saveSettings('anthropic')">Save Claude Config</button></div>
      </div>

      <!-- Telegram Bot -->
      <div class="settings-section">
        <div class="settings-section-title">Telegram Bot Integration
          <span class="badge ${svc.telegram==='connected'?'badge-jira':'badge-medium'}" style="margin-left:auto">${svc.telegram==='connected'?'● Connected':'○ Not Connected'}</span>
        </div>
        <p class="settings-hint">Create a bot via <strong>@BotFather</strong> on Telegram and paste your Bot Token and Chat ID below.</p>
        <div class="settings-grid">
          <div class="settings-field"><label>Telegram Bot Token</label><input id="s-telegram-token" type="password" placeholder="${svc.telegram==='connected'?'Saved - enter to replace':'123456789:ABCdef...'}"/></div>
          <div class="settings-field"><label>Chat ID</label><input id="s-telegram-chat" type="text" value="${escHtml(svc.telegramConfig?.chatId||'')}" placeholder="Your Telegram Chat ID"/></div>
        </div>
        <div class="settings-actions"><button class="btn btn-primary" onclick="saveSettings('telegram')">Save Telegram Config</button></div>
      </div>

      <!-- Signal Messenger -->
      <div class="settings-section">
        <div class="settings-section-title">Signal Messenger
          <span class="badge ${svc.signal==='connected'?'badge-jira':'badge-medium'}" style="margin-left:auto">${svc.signal==='connected'?'● Connected':'○ Not Connected'}</span>
        </div>
        <p class="settings-hint">Configure Signal CLI REST API endpoint or registered phone number.</p>
        <div class="settings-grid">
          <div class="settings-field"><label>Signal Phone Number</label><input id="s-signal-number" type="text" placeholder="+1234567890"/></div>
        </div>
        <div class="settings-actions"><button class="btn btn-primary" onclick="saveSettings('signal')">Save Signal Config</button></div>
      </div>

      <!-- Groq -->
      <div class="settings-section">
        <div class="settings-section-title">Groq AI Engine (Fallback)
          <span class="badge ${gc.hasKey?'badge-jira':'badge-medium'}" style="margin-left:auto">${gc.hasKey?'● Connected':'○ Standby'}</span>
        </div>
        <p class="settings-hint">
          Optional fallback engine. If GitHub OAuth fails on Groq, use <strong>Email signup</strong> at <a href="https://console.groq.com/login" target="_blank" style="color:var(--green)">console.groq.com/login</a>.
        </p>
        <div class="settings-grid">
          <div class="settings-field"><label>Groq API Key</label><input id="s-groq-key" type="password" placeholder="${gc.hasKey?'Saved - enter to replace':'Get free key at console.groq.com'}"/></div>
          <div class="settings-field"><label>Model</label>
            <select id="s-groq-model">
              <option value="llama-3.1-70b-versatile" ${gc.model==='llama-3.1-70b-versatile'?'selected':''}>Llama 3.1 70B Versatile</option>
              <option value="llama-3.1-8b-instant" ${gc.model==='llama-3.1-8b-instant'?'selected':''}>Llama 3.1 8B Instant</option>
              <option value="mixtral-8x7b-32768" ${gc.model==='mixtral-8x7b-32768'?'selected':''}>Mixtral 8x7B</option>
            </select>
          </div>
        </div>
        <div class="settings-actions"><button class="btn btn-primary" onclick="saveSettings('groq')">Save Groq Config</button></div>
      </div>

      <!-- Service Status -->
      <div class="settings-section">
        <div class="settings-section-title">Service Status</div>
        <div class="service-status-grid">
          ${statusRows.map(s=>`
            <div class="service-status-row">
              <div class="status-dot ${svc[s.key]==='connected'?'active':''}"></div>
              <span class="service-name">${s.name}</span>
              <span class="service-status-text ${svc[s.key]==='connected'?'txt-green':'txt-muted'}">${svc[s.key]==='connected'?'Connected':'Disconnected'}</span>
            </div>`).join('')}
        </div>
      </div>

      <!-- AI Context Injection -->
      <div class="settings-section">
        <div class="settings-section-title">AI Context Injection - Email / Chat → Jira</div>
        <p class="settings-hint">Paste raw email or chat text. iSconl AI extracts actionable items and creates Jira issues automatically.</p>
        <textarea id="context-inject-input" rows="5" placeholder="Paste email body or WhatsApp chat thread here…"></textarea>
        <div class="settings-actions"><button class="btn btn-primary" onclick="injectContext()">Extract and Create Jira Issues</button></div>
        <div id="inject-result" class="settings-result hidden"></div>
      </div>

      <!-- Integrations folded in here, 29 Jul. It was its own destination in
           SYSTEM showing the same service state this page already configures -
           two places to look at one truth. Settings owns the connections now. -->
      <div class="settings-section">
        <div class="settings-section-title">Connected services</div>
        <p class="settings-hint">What each integration can reach right now. Configure the credentials in the sections above.</p>
        ${renderIntegrationsBody()}
      </div>
    </div>`;
}

/* ── THE APK DOWNLOAD CARD ─────────────────────────────────────────────────
 * Reads /api/apk/latest, which reports whichever build is current - the
 * published release, or a local one on the workstation when CI could not run.
 * Rendered async rather than inline because renderSettings() is synchronous and
 * a network call there would stall the whole page.
 */
async function loadApkCard(fresh = false) {
  const card = document.getElementById('apk-card');
  const badge = document.getElementById('apk-badge');
  if (!card) return;
  card.innerHTML = `<div class="settings-hint">Checking for the current build...</div>`;
  if (badge) { badge.textContent = 'Checking'; badge.className = 'badge badge-medium'; }

  let d;
  try {
    const r = await fetch('/api/apk/latest' + (fresh ? '?fresh=1' : ''));
    d = await r.json();
  } catch (e) {
    if (badge) { badge.textContent = 'Unreachable'; badge.className = 'badge badge-medium'; }
    card.innerHTML = `<div class="settings-result">Could not reach the agent: ${escHtml(String(e.message || e))}</div>`;
    return;
  }

  if (!d || !d.available) {
    if (badge) { badge.textContent = 'No build'; badge.className = 'badge badge-medium'; }
    card.innerHTML = `
      <div class="settings-result">${escHtml(d?.error || 'No build published yet.')}</div>
      <div class="settings-actions">
        <button class="btn btn-ghost" onclick="loadApkCard(true)">Check again</button>
      </div>`;
    return;
  }

  if (badge) {
    badge.textContent = `● v${d.version}`;
    badge.className = 'badge badge-jira';
  }

  const when = d.publishedAt ? new Date(d.publishedAt).toLocaleString(undefined,
    { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'unknown date';
  const meta = [d.sizeLabel, when, d.source === 'local' ? 'local build' : 'published release']
    .filter(Boolean).join(' · ');

  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;
                background:var(--bg-raised);border:1px solid var(--border);
                border-radius:var(--r-md);padding:0.9rem">
      <div style="min-width:0;flex:1 1 14rem">
        <div style="font-family:var(--font-mono);font-size:1.05rem;color:var(--green-bright)">v${escHtml(d.version)}</div>
        <div style="font-size:0.75rem;color:var(--text-3);margin-top:2px">${escHtml(meta)}</div>
        ${d.filename ? `<div style="font-size:0.7rem;color:var(--text-3);font-family:var(--font-mono);
             margin-top:4px;word-break:break-all">${escHtml(d.filename)}</div>` : ''}
      </div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
        <button class="btn btn-primary" id="apk-dl-btn" onclick="downloadApk()">Download APK</button>
        <button class="btn btn-ghost" onclick="loadApkCard(true)">Refresh</button>
      </div>
    </div>
    ${d.notes ? `<details style="margin-top:0.7rem">
        <summary style="cursor:pointer;font-size:0.78rem;color:var(--text-2)">What changed in this build</summary>
        <div class="settings-hint" style="white-space:pre-wrap;margin-top:0.5rem">${escHtml(String(d.notes).slice(0, 4000))}</div>
      </details>` : ''}
    <div id="apk-link-box" class="hidden" style="margin-top:0.7rem">
      <p class="settings-hint" style="margin-bottom:0.3rem">
        On a different device, open this link within 15 minutes:
      </p>
      <input id="apk-link" type="text" readonly onclick="this.select()"
             style="width:100%;font-family:var(--font-mono);font-size:0.72rem"/>
    </div>`;
}

/**
 * Ask for a one-time ticket, then let the browser download it natively.
 * A plain link cannot carry the Authorization header, and an in-page blob would
 * give up the download manager, the progress notification, and tap-to-install -
 * which on a phone is the entire point.
 */
async function downloadApk() {
  const btn = document.getElementById('apk-dl-btn');
  const label = btn ? btn.textContent : '';
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Preparing...'; }
    const r = await fetch('/api/apk/ticket', { method: 'POST' });
    const d = await r.json();
    if (!d || !d.url) throw new Error(d?.error || 'the agent issued no ticket');

    const a = document.createElement('a');
    a.href = d.url;
    a.setAttribute('download', '');
    document.body.appendChild(a);
    a.click();
    a.remove();

    // Also surface the absolute URL, so the desktop can hand it to the phone.
    const box = document.getElementById('apk-link-box');
    const input = document.getElementById('apk-link');
    if (box && input) { input.value = location.origin + d.url; box.classList.remove('hidden'); }
    showToast('Download started. Open it from your notifications to install.', 'success');
  } catch (e) {
    showToast(`Download failed: ${String(e.message || e)}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = label || 'Download APK'; }
  }
}

async function saveSettings(section) {
  const updates = {};
  if (section==='jira') {
    const host = document.getElementById('s-jira-host')?.value.trim();
    const project = document.getElementById('s-jira-project')?.value.trim();
    const email = document.getElementById('s-jira-email')?.value.trim();
    const token = document.getElementById('s-jira-token')?.value.trim();
    if (host) updates.jiraHost=host;
    if (project) updates.jiraProject=project;
    if (email) updates.jiraEmail=email;
    if (token) updates.jiraToken=token;
  }
  if (section==='anthropic') {
    const key = document.getElementById('s-anthropic-key')?.value.trim();
    const model = document.getElementById('s-anthropic-model')?.value;
    if (key) updates.anthropicKey=key;
    if (model) updates.anthropicModel=model;
  }
  if (section==='telegram') {
    const token = document.getElementById('s-telegram-token')?.value.trim();
    const chat = document.getElementById('s-telegram-chat')?.value.trim();
    if (token) updates.telegramToken=token;
    if (chat) updates.telegramChatId=chat;
  }
  if (section==='signal') {
    const num = document.getElementById('s-signal-number')?.value.trim();
    if (num) updates.signalNumber=num;
  }
  if (section==='groq') {
    const key = document.getElementById('s-groq-key')?.value.trim();
    const model = document.getElementById('s-groq-model')?.value;
    if (key) updates.groqKey=key;
    if (model) updates.groqModel=model;
  }
  if (section==='ms') {
    const token = document.getElementById('s-ms-token')?.value.trim();
    const tenant = document.getElementById('s-ms-tenant')?.value.trim();
    if (token) updates.msAccessToken=token;
    if (tenant) updates.msTenantId=tenant;
  }
  if (section==='buffer') {
    const token = document.getElementById('s-buffer-token')?.value.trim();
    if (token) updates.bufferToken=token;
  }
  if (!Object.keys(updates).length) { showToast('No changes to save','info'); return; }
  try {
    const r = await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(updates)});
    const data = await r.json();
    if (data.success) { if(data.services) STATE.services=data.services; showToast('Settings saved!','success'); await fetchState(); navigate('settings'); }
    else showToast('Save failed: '+(data.error||'Unknown'),'error');
  } catch(e) { showToast(e.message,'error'); }
}

async function testJiraConnection() {
  const el = document.getElementById('jira-test-result');
  if (!el) return;
  el.className='settings-result'; el.textContent='Testing…';
  await fetchJiraIssues();
  if (STATE.jiraIssues.length > 0) { el.textContent=`Connected! Found ${STATE.jiraIssues.length} issues.`; el.classList.add('success'); }
  else {
  }
}

let m365PollTimer = null;

async function startM365DeviceLogin() {
  const box = document.getElementById('m365-device-box');
  const codeEl = document.getElementById('m365-user-code');
  const pollEl = document.getElementById('m365-poll-status');
  if (box) box.classList.remove('hidden');
  if (pollEl) pollEl.textContent = 'Requesting code from Microsoft…';

  try {
    const r = await fetch('/api/m365/auth/start', { method: 'POST' });
    const data = await r.json();
    if (data.user_code) {
      if (codeEl) codeEl.textContent = data.user_code;
      if (pollEl) pollEl.textContent = 'Code generated! Click the link above, enter code, and sign in.';
      showToast(`Microsoft Code: ${data.user_code}`, 'info');

      if (m365PollTimer) clearInterval(m365PollTimer);
      m365PollTimer = setInterval(async () => {
        try {
          const pr = await fetch('/api/m365/auth/poll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceCode: data.device_code }),
          });
          const pd = await pr.json();
          if (pd.success) {
            clearInterval(m365PollTimer);
            if (pollEl) { pollEl.textContent = '● Microsoft 365 Connected Successfully!'; pollEl.style.color = 'var(--green)'; }
            showToast('Microsoft 365 Connected Successfully!', 'success');
            await fetchState();
            navigate('settings');
          } else if (pd.error && !pd.error.includes('authorization_pending')) {
            clearInterval(m365PollTimer);
            if (pollEl) pollEl.textContent = 'Status: ' + (pd.error_description || pd.error);
          }
        } catch(e) {}
      }, 5000);
    } else {
      if (pollEl) pollEl.textContent = 'Failed: ' + (data.error_description || data.error || 'Unknown error');
    }
  } catch(e) { if (pollEl) pollEl.textContent = 'Error: ' + e.message; }
}

async function injectContext() {
  const text = document.getElementById('context-inject-input')?.value.trim();
  if (!text) { showToast('Paste context text first','error'); return; }
  const el = document.getElementById('inject-result');
  if (el) { el.className='settings-result'; el.textContent='AI analyzing…'; }
  try {
    const reply = await postChat(`Extract actionable Jira issues from this text. Output ONLY lines starting with ISSUE:.\nText:\n${text}\nMax 5 issues. Be specific.`);
    const lines = reply.split('\n').filter(l=>l.trim().startsWith('ISSUE:'));
    if (!lines.length) { if(el){el.textContent='No actionable items found.';el.classList.add('warn');} return; }
    let created=0;
    for (const line of lines) {
      const summary = line.replace(/^ISSUE:\s*/i,'').trim();
      if (!summary) continue;
      const r = await fetch('/api/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:summary,priority:'medium',syncJira:true})});
      const d = await r.json();
      if (d?.jira?.key) created++;
    }
    if (el) { el.textContent=`Created ${created} Jira issue(s)!`; el.classList.add('success'); }
    await fetchJiraIssues(); showToast(`${created} issues created!`,'success');
  } catch(e) { if(el){el.textContent='Failed: '+e.message;el.classList.add('error');} }
}

// ── OTHER VIEWS ───────────────────────────────────────────────────────────────

/**
 * GitHub contribution activity map, in the familiar calendar-grid form.
 * Columns are weeks, rows are days of the week, intensity is contribution count.
 */
function renderContributionMap(contrib) {
  const days = (contrib && contrib.days) || [];
  if (!days.length) {
    return `<div class="card">
      <div class="card-header"><span class="card-title">Activity</span></div>
      <div class="empty-state">No contribution data yet.
        <button class="btn btn-ghost" onclick="refreshContributions()">Load activity map</button>
      </div></div>`;
  }

  // Bucket into 5 intensity levels off the max, GitHub style.
  const max = days.reduce((m, d) => Math.max(m, d.count), 0) || 1;
  const level = c => c === 0 ? 0 : c >= max * 0.75 ? 4 : c >= max * 0.5 ? 3 : c >= max * 0.25 ? 2 : 1;

  // Pad so the first column starts on the correct weekday.
  const firstDow = new Date(days[0].date + 'T00:00:00').getDay();
  const cells = [...Array(firstDow).fill(null), ...days];

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const grid = weeks.map(w => `<div class="ct-week">${
    Array.from({ length: 7 }, (_, i) => {
      const d = w[i];
      if (!d) return '<div class="ct-day ct-empty"></div>';
      const lv = level(d.count);
      const label = `${d.count} contribution${d.count === 1 ? '' : 's'} on ${d.date}`;
      return `<div class="ct-day ct-l${lv}" title="${escHtml(label)}"></div>`;
    }).join('')
  }</div>`).join('');

  // Month labels above the columns where a new month begins.
  const months = [];
  let lastMonth = -1;
  weeks.forEach((w, wi) => {
    const first = w.find(Boolean);
    if (!first) return;
    const m = new Date(first.date + 'T00:00:00').getMonth();
    if (m !== lastMonth) { months.push({ wi, name: MONTHS_SHORT[m] }); lastMonth = m; }
  });
  const monthRow = months.map(m =>
    `<span class="ct-month" style="grid-column:${m.wi + 1}">${m.name}</span>`).join('');

  const active = days.filter(d => d.count > 0).length;
  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Activity</span>
        <span class="card-meta"><strong>${contrib.totalContributions}</strong> contributions ·
          <strong>${active}</strong> active days
          <button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 8px;margin-left:.5rem"
                  onclick="refreshContributions()">Refresh</button></span>
      </div>
      <div class="ct-wrap">
        <div class="ct-months" style="grid-template-columns:repeat(${weeks.length},11px)">${monthRow}</div>
        <div class="ct-grid">${grid}</div>
        <div class="ct-legend">
          <span>Less</span>
          <div class="ct-day ct-l0"></div><div class="ct-day ct-l1"></div>
          <div class="ct-day ct-l2"></div><div class="ct-day ct-l3"></div><div class="ct-day ct-l4"></div>
          <span>More</span>
        </div>
      </div>
    </div>`;
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

async function fetchContributions(force = false) {
  try {
    const r = await fetch('/api/github/contributions' + (force ? '?refresh=1' : ''));
    if (r.ok) STATE.contributions = await r.json();
  } catch {}
}

async function refreshContributions() {
  showToast('Loading activity map', 'info');
  await fetchContributions(true);
  if (currentView === 'github') navigate('github');
  const n = STATE.contributions?.totalContributions ?? 0;
  showToast(`${n} contributions loaded`, 'success');
}

function renderGitHub() {
  const gh = STATE.github || {};
  const repos = gh.repos||[];
  const notifs = gh.notifications||[];
  const user = gh.user||{login:'Architect'};
  return `
    <div class="view-head">
      <h1>GitHub</h1>
      <div class="view-head-meta">live cli, as ${escHtml(user.login||'Architect')}</div>
    </div>
    ${renderContributionMap(STATE.contributions)}
    <div class="card">
      <div class="card-header"><span class="card-title">GitHub · Live CLI</span><span class="card-meta">as <strong>${escHtml(user.login||'Architect')}</strong></span></div>
      <div class="cards-grid-3" style="margin-bottom:1rem">
        <div class="stat-card"><div class="stat-number txt-green">${repos.length}</div><div class="stat-label">Repositories</div></div>
        <div class="stat-card"><div class="stat-number" style="color:var(--cyan)">${notifs.length}</div><div class="stat-label">Notifications</div></div>
        <div class="stat-card"><div class="stat-number" style="color:var(--violet)">${user.followers||0}</div><div class="stat-label">Followers</div></div>
      </div>
    </div>
    <div class="cards-grid">
      <div class="card">
        <div class="card-header"><span class="card-title">Repositories</span><button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 8px" onclick="fetchGhSnapshot().then(()=>navigate('github'))">Refresh</button></div>
        ${repos.length ? repos.map(r=>`
          <div class="gh-repo-card">
            <div class="gh-repo-header"><span class="gh-repo-name">${escHtml(r.fullName||r.name)}</span><span class="badge ${r.isPrivate?'badge-medium':'badge-low'}">${r.isPrivate?'Private':'Public'}</span></div>
            <div class="gh-repo-desc">${escHtml(r.description||'No description.')}</div>
            <div style="display:flex;gap:0.4rem;margin-top:0.5rem">
              <button class="kanban-action-btn" onclick="quickAsk('gh issue list --repo ${escHtml(r.fullName||r.name)}')">Issues</button>
              <button class="kanban-action-btn" onclick="quickAsk('gh pr list --repo ${escHtml(r.fullName||r.name)}')">PRs</button>
            </div>
          </div>`).join('') : '<div class="empty-state">No repositories loaded. Nothing to commit to yet.</div>'}
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Notifications</span></div>
        ${notifs.length ? notifs.map(n=>`<div class="gh-notif-item"><div class="gh-notif-title"><strong>${escHtml(n.subject||'Notification')}</strong></div><div class="gh-notif-repo">${escHtml(n.repo||'GitHub')}</div></div>`).join('') : '<div class="empty-state">No unread notifications. Silence, working as intended.</div>'}
      </div>
    </div>`;
}

function renderWhatsAppGuide() {
  return `<div class="card"><div class="card-header"><span class="card-title">WhatsApp Integration Blueprint</span><span class="badge badge-medium">Planned</span></div><p style="font-size:0.85rem;color:var(--text-2);margin:1rem 0">WhatsApp Business API requires a Meta Business account. Parameters armed for activation.</p><div class="settings-grid"><div class="settings-field"><label>Phone Number ID</label><input type="text" placeholder="From Meta Developer Console"/></div><div class="settings-field"><label>Access Token</label><input type="password" placeholder="Meta permanent token"/></div></div></div>`;
}

function getChannelBadgeClass(ch) {
  if (ch==='whatsapp') return 'badge-low';
  if (ch==='mail') return 'badge-jira';
  if (ch==='telegram') return 'badge-medium';
  if (ch==='signal') return 'badge-highest';
  return 'badge-today';
}

/**
 * The inbox: real inbound messages, verbatim, under Operator's control. Channel
 * chips filter on click; each row tags, comments, replies and deletes in place.
 * A comment doubles as the brief for a generated reply - write "decline, offer
 * Thursday" in the margin and that is the reply that comes back.
 */
let inboxChannel = null;   // click a channel chip to filter; click again to clear
let inboxOpen = {};        // ID -> expanded

function renderInbox() {
  const feed = STATE.feed || [];
  const channels = [...new Set(feed.map(i => i.CHANNEL).filter(c => c && c !== '-'))];
  const rows = inboxChannel ? feed.filter(i => i.CHANNEL === inboxChannel) : feed;
  const tags = STATE.tags || [];

  return `
    <div class="view-head">
      <h1>Inbox</h1>
      <div class="view-head-meta">every source in one place, verbatim - exactly as sent</div>
    </div>
    <div class="card">
      <div class="card-header">
        <span class="card-title">Inbox</span>
        <span class="card-meta">${rows.length}${inboxChannel ? ` of ${feed.length} · ${escHtml(inboxChannel)}` : ' messages'} · verbatim … exactly as sent</span>
      </div>
      ${channels.length ? `
        <div class="inbox-channels">
          ${channels.map(c => `
            <button class="inbox-chan${inboxChannel === c ? ' on' : ''}" onclick="inboxFilter('${escHtml(c)}')">
              ${escHtml(c)} <span>${feed.filter(i => i.CHANNEL === c).length}</span>
            </button>`).join('')}
          ${inboxChannel ? `<button class="inbox-chan clear" onclick="inboxFilter(null)">all</button>` : ''}
        </div>` : ''}
      ${rows.length ? rows.map(m => {
        const open = inboxOpen[m.ID];
        return `
        <div class="inbox-item ${m.STATUS === 'new' ? 'unread' : ''}">
          <div class="inbox-head" onclick="inboxToggle('${escHtml(m.ID)}')">
            <span class="inbox-chan-dot" data-ch="${escHtml(m.CHANNEL)}"></span>
            <span class="inbox-sender">${escHtml(m.SENDER !== '-' ? m.SENDER : m.SOURCE)}</span>
            <span class="inbox-title">${escHtml(m.TITLE)}</span>
            ${m.TAG && m.TAG !== '-' ? `<span class="inbox-tag">${escHtml(m.TAG)}</span>` : ''}
            <span class="inbox-date">${escHtml(m.RECEIVED_AT)}</span>
          </div>
          ${open ? `
            <div class="inbox-body">${escHtml(m.BODY)}</div>
            ${m.COMMENT && m.COMMENT !== '-' ? `<div class="inbox-comment"><span>Your note</span>${escHtml(m.COMMENT)}</div>` : ''}
            <div class="inbox-actions">
              <button class="btn btn-primary" style="font-size:0.7rem;padding:2px 9px" onclick="inboxReply('${escHtml(m.ID)}', false)">Reply</button>
              <button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 9px" onclick="inboxComment('${escHtml(m.ID)}', '${escHtml((m.COMMENT !== '-' ? m.COMMENT : '')).replace(/'/g, "\\'")}')">
                ${m.COMMENT && m.COMMENT !== '-' ? 'Edit note' : 'Add note'}</button>
              <select class="task-select" style="font-size:0.68rem" onchange="inboxSet('${escHtml(m.ID)}',{tag:this.value})">
                <option value="">untagged</option>
                ${tags.map(t => `<option value="${escHtml(t.id)}"${t.id === m.TAG ? ' selected' : ''}>${escHtml(t.label)}</option>`).join('')}
              </select>
              <select class="task-select" style="font-size:0.68rem" onchange="inboxSet('${escHtml(m.ID)}',{status:this.value})">
                ${['new', 'seen', 'actioned', 'done'].map(s => `<option${s === m.STATUS ? ' selected' : ''}>${s}</option>`).join('')}
              </select>
              <button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 9px"
                      onclick="quickDistillText('${escHtml(m.BODY).replace(/'/g, "\\'")}')">To task</button>
              <button class="btn btn-ghost danger-btn" style="font-size:0.7rem;padding:2px 9px;margin-left:auto"
                      onclick="inboxDelete('${escHtml(m.ID)}')">Delete</button>
            </div>` : ''}
        </div>`;
      }).join('') : `<div class="empty-state">${inboxChannel ? 'Nothing on this channel.' : 'Inbox zero. Enjoy it … it never lasts. Paste a message in, or text the bot.'}</div>`}

      <div class="inbox-add ${inboxAddOpen ? 'open' : ''}" id="inbox-add">
        ${inboxAddOpen ? `
          <div class="inbox-add-head">Capture a message</div>
          <div class="inbox-add-row">
            <input id="ia-sender" class="jira-input" placeholder="From - pick a name or type a new one" list="ia-people" style="min-width:12rem"/>
            <datalist id="ia-people">${(() => {
              // Every name the agent knows: the people roster PLUS every sender
              // already on record in the inbox. A new name typed here simply
              // saves with the message and joins this list from then on.
              const known = new Set((STATE.people || []).map(p => p.name));
              (STATE.feed || []).forEach(m => { if (m.SENDER && m.SENDER !== '-') known.add(m.SENDER); });
              return [...known].sort((a, b) => a.localeCompare(b))
                .map(n => `<option value="${escHtml(n)}">`).join('');
            })()}</datalist>
            <div class="evt-chips" id="ia-channels">
              ${['whatsapp', 'email', 'telegram', 'call'].map((c, i) => `
                <button class="evt-chip${i === 0 ? ' on' : ''}" data-ch="${c}" onclick="iaPickChannel(this)">${c}</button>`).join('')}
            </div>
            <input id="ia-date" class="jira-input" type="datetime-local" title="When it arrived - date and time"
                   value="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}"/>
            <div class="evt-chips">
              <button class="evt-chip" title="Arrived just now" onclick="iaSetWhen(0)">now</button>
              <button class="evt-chip" title="Arrived about an hour ago" onclick="iaSetWhen(1)">1h ago</button>
              <button class="evt-chip" title="Arrived yesterday, same time" onclick="iaSetWhen(24)">yesterday</button>
            </div>
          </div>
          <textarea id="ia-body" class="jira-input jira-textarea" rows="4"
            placeholder="Paste the message, verbatim - the record is only as good as what goes in it."></textarea>
          <div class="inbox-add-row">
            <select id="ia-tag" class="task-select" style="font-size:0.7rem">
              <option value="">untagged</option>
              ${(STATE.tags || []).map(t => `<option value="${escHtml(t.id)}">${escHtml(t.label)}</option>`).join('')}
            </select>
            <button class="btn btn-primary" style="font-size:0.72rem;padding:4px 14px" onclick="inboxSave(this)">Capture</button>
            <button class="btn btn-ghost" style="font-size:0.72rem" onclick="inboxAddToggle()">Cancel</button>
          </div>` : `
          <button class="btn btn-ghost" style="font-size:0.72rem" onclick="inboxAddToggle()">+ Capture a message</button>`}
      </div>
    </div>`;
}

let inboxAddOpen = false;
function inboxAddToggle() { inboxAddOpen = !inboxAddOpen; repaintView('inbox'); }
function iaPickChannel(btn) {
  document.querySelectorAll('#ia-channels .evt-chip').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
}
function iaSetWhen(hoursAgo) {
  const el = document.getElementById('ia-date');
  if (el) el.value = new Date(Date.now() - hoursAgo * 3600000 - new Date().getTimezoneOffset() * 60000)
    .toISOString().slice(0, 16);
}

async function inboxSave(btn) {
  const body = document.getElementById('ia-body')?.value.trim();
  if (!body) { showToast('The message itself is the one required field', 'warn'); return; }
  const sender = document.getElementById('ia-sender')?.value.trim();
  const channel = document.querySelector('#ia-channels .evt-chip.on')?.dataset.ch || 'whatsapp';
  const received = document.getElementById('ia-date')?.value;
  const tag = document.getElementById('ia-tag')?.value;
  btn.disabled = true;
  try {
    const d = await (await fetch('/api/inbox/add', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender, channel, body, received, tag }) })).json();
    showToast(d.success ? `Captured ${d.id}` : (d.error || 'Refused'), d.success ? 'success' : 'error');
    if (d.success) { inboxAddOpen = false; await fetchState(); repaintView('inbox'); }
  } catch (e) { showToast(e.message, 'error'); }
  btn.disabled = false;
}

function inboxFilter(c) { inboxChannel = c; repaintView('inbox'); }
function inboxToggle(id) {
  inboxOpen[id] = !inboxOpen[id];
  const item = (STATE.feed || []).find(m => m.ID === id);
  // Opening an unread message marks it seen - one less state to manage by hand.
  if (inboxOpen[id] && item && item.STATUS === 'new') { item.STATUS = 'seen'; inboxSet(id, { status: 'seen' }, true); }
  repaintView('inbox');
}
function repaintView(name) {
  if (currentView === name) document.getElementById('view-container').innerHTML = viewFns[name]();
  // renderSettings() emits the APK card as a skeleton and fills it over the
  // network. A repaint throws that away, so without this the card sits on
  // "Checking for the current build..." for as long as the page stays open.
  if (currentView === name && name === 'settings' && typeof loadApkCard === 'function') loadApkCard();
  try { if (typeof refreshContextIfActive === 'function') refreshContextIfActive(); } catch {}
}

async function inboxSet(id, patch, silent) {
  const d = await (await fetch('/api/inbox/update', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...patch }) })).json();
  if (!silent) {
    showToast(d.success ? 'Updated' : (d.error || 'Refused'), d.success ? 'success' : 'error');
    await fetchState(); repaintView('inbox');
  }
}

async function inboxDelete(id) {
  if (!await uiConfirm({ title: `Delete ${id} from the inbox?`,
    body: 'The captured message is removed. Anything already distilled from it stays.',
    confirmLabel: 'Delete', danger: true })) return;
  const d = await (await fetch('/api/inbox/delete', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })).json();
  showToast(d.success ? 'Deleted' : 'Not found', d.success ? 'success' : 'error');
  await fetchState(); repaintView('inbox');
}

async function inboxComment(id, current) {
  const note = await uiPrompt({ title: 'Your note', label: 'Note',
    value: current || '', multiline: true,
    placeholder: 'decline politely, offer Thursday instead',
    hint: 'This also steers the generated reply.', confirmLabel: 'Save note' });
  if (note === null) return;
  inboxSet(id, { comment: note });
}

async function inboxAdd() {
  const got = await new Promise(resolve => uiForm('Capture a message', [
    { id: 'sender', label: 'From', placeholder: 'Sender name' },
    { id: 'channel', label: 'Channel', type: 'select', value: 'whatsapp',
      options: ['whatsapp', 'email', 'telegram', 'call', 'in-person', 'chat'] },
    { id: 'body', label: 'The message, verbatim', multiline: true,
      placeholder: 'Paste it exactly as it arrived - the words matter',
      hint: 'Verbatim, because a paraphrase is not evidence.' },
  ], async (v) => {
    if (!v.body) { showToast('The message itself is the point', 'warn'); return false; }
    resolve(v); return true;
  }));
  if (!got) return;
  const { sender, channel, body } = got;
  fetch('/api/inbox/add', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender, channel, body }) })
    .then(r => r.json()).then(async d => {
      showToast(d.success ? `Captured ${d.id}` : (d.error || 'Refused'), d.success ? 'success' : 'error');
      await fetchState(); repaintView('inbox');
    });
}

// The reply, in the sender's register, steered by the margin note. Reuses the
// chase overlay chrome - one shape for every "here are the words" moment.
async function inboxReply(id, regenerate) {
  let overlay = document.getElementById('chase-overlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'chase-overlay';
  overlay.className = 'chase-overlay';
  overlay.innerHTML = `<div class="chase-box"><div class="brief-pending">
    <div class="spinner-inline"></div><div>Writing the reply for ${escHtml(id)}…</div></div></div>`;
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
  try {
    const d = await (await fetch('/api/inbox/reply', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, regenerate: !!regenerate }) })).json();
    if (!d.success) {
      overlay.querySelector('.chase-box').innerHTML = `<div class="empty-state">${escHtml(d.error || 'Not available')}</div>`;
      return;
    }
    overlay.querySelector('.chase-box').innerHTML = `
      <div class="chase-head">
        <div>Reply to <strong>${escHtml(d.draft.to)}</strong> via ${escHtml(d.draft.channel)}</div>
        <button class="btn btn-ghost" style="font-size:0.7rem" onclick="document.getElementById('chase-overlay').remove()">Close</button>
      </div>
      <textarea class="draft-message draft-editable" id="chase-text" spellcheck="true" aria-label="The message - edit it before you send it">${escHtml(d.draft.body)}</textarea><div class="draft-editable-hint">Edit it freely - what you leave here is what gets copied.</div>
      ${d.draft.checks?.length ? `<div class="draft-checks"><div class="draft-checks-label">Check before sending</div>
        ${d.draft.checks.map(c => `<div class="draft-check"><code>${escHtml(c.found)}</code><span>${escHtml(c.say)}</span></div>`).join('')}</div>` : ''}
      <div class="draft-actions">
        <button class="btn btn-primary" style="font-size:0.72rem;padding:3px 10px"
                onclick="navigator.clipboard?.writeText(draftText('chase-text')).then(()=>showToast('Copied … go be charming','success'))">Copy</button>
        <button class="btn btn-ghost" style="font-size:0.72rem;padding:3px 10px" onclick="inboxReply('${escHtml(id)}', true)">Different angle</button>
      </div>`;
  } catch (e) {
    overlay.querySelector('.chase-box').innerHTML = `<div class="empty-state">${escHtml(e.message)}</div>`;
  }
}

function quickDistillText(text) {
  openDistillModal();
  setTimeout(() => {
    const el = document.getElementById('distill-text-input');
    if (el) el.value = text;
  }, 50);
}

/**
 * The board and its archive, filterable. Done tasks leave the working list the
 * moment they are done - clutter is the tax on every later glance - but nothing
 * is lost: the Archive tab holds them all, filterable by when they were finished.
 */
let taskFilters = { view: 'open', prio: '', tag: '', since: '' };

function renderTasks() {
  const all = STATE.tasks || [];
  const f = taskFilters;
  const tags = STATE.tags || [];
  const today = new Date();
  const cutoff = f.since ? new Date(today - parseInt(f.since, 10) * 864e5).toISOString().slice(0, 10) : null;

  // The delivery lane: work that is drafted and waiting on him to review it and
  // hand it over. Anything in review, or that already carries a delivery state,
  // belongs here. Nothing in this lane is done - sending is a handover.
  const inDelivery = (t) => t.STATUS !== 'done' &&
    (t.STATUS === 'review' || (t.DELIVERY && t.DELIVERY !== '-'));

  let rows;
  if (f.view === 'deliver')      rows = all.filter(inDelivery);
  else if (f.view === 'archive') rows = all.filter(t => t.STATUS === 'done');
  else                           rows = all.filter(t => t.STATUS !== 'done');
  if (f.prio) rows = rows.filter(t => t.PRIORITY === f.prio);
  if (f.tag)  rows = rows.filter(t => t.TAG === f.tag);
  if (f.view === 'archive' && cutoff) rows = rows.filter(t => (t.DONE_AT && t.DONE_AT !== '-' ? t.DONE_AT : t.CREATED_AT) >= cutoff);
  if (f.view === 'archive') rows = rows.slice().sort((a, b) => String(b.DONE_AT || '').localeCompare(String(a.DONE_AT || '')));
  // Unsent first: the whole point of the lane is what still needs handing over.
  if (f.view === 'deliver') {
    const rank = (t) => t.DELIVERY === 'sent' ? 2 : t.DELIVERY === 'reviewed' ? 0 : 1;
    rows = rows.slice().sort((a, b) => rank(a) - rank(b) || String(a.ID).localeCompare(String(b.ID)));
  }

  const doneCount = all.filter(t => t.STATUS === 'done').length;
  const deliverCount = all.filter(inDelivery).length;
  const sel = (v, cur) => v === cur ? ' selected' : '';

  // The open view is a HIERARCHY: main tasks only, each expandable to its
  // subtasks, so the list stays short. A filter keeps a family visible when
  // any member matches. A subtask whose parent is done or missing is promoted
  // to the top level rather than lost. Archive stays flat - a finished list
  // reads better as history than as a tree.
  let listHtml = '';
  if (f.view === 'deliver') {
    // The delivery lane is flat and card-shaped: each one is a thing to read,
    // decide on, and hand over, not a line in a checklist.
    listHtml = rows.map(deliveryCard).join('');
  } else if (f.view === 'archive') {
    listHtml = rows.map(t => taskRow(t)).join('');
  } else {
    const isSub = (t) => t.PARENT_ID && t.PARENT_ID !== '-';
    const matchSet = new Set(rows.map(t => t.ID));
    const openAll = all.filter(t => t.STATUS !== 'done');
    const parents = openAll.filter(t => !isSub(t));
    const parentIds = new Set(parents.map(t => t.ID));
    const kidsOf = {};
    openAll.filter(isSub).forEach(t => {
      if (parentIds.has(t.PARENT_ID)) (kidsOf[t.PARENT_ID] = kidsOf[t.PARENT_ID] || []).push(t);
    });
    const orphans = openAll.filter(t => isSub(t) && !parentIds.has(t.PARENT_ID));

    listHtml = parents
      .filter(p => matchSet.has(p.ID) || (kidsOf[p.ID] || []).some(k => matchSet.has(k.ID)))
      .map(p => {
        const kids = kidsOf[p.ID] || [];
        const doneKids = all.filter(t => t.PARENT_ID === p.ID && t.STATUS === 'done').length;
        const open = taskExpanded.has(p.ID);
        return taskRow(p, { childCount: kids.length, doneKids, expanded: open })
          + (open ? kids.map(k => taskRow(k, { sub: true })).join('') : '');
      }).join('')
      + orphans.filter(t => matchSet.has(t.ID)).map(t => taskRow(t)).join('');
  }
  const shownCount = rows.length;

  // The coverage strip loads after paint - it walks the work folders per task,
  // and the list itself should never wait on that.
  setTimeout(fetchCoverage, 0);

  return `
    <div class="view-head">
      <h1>Tasks</h1>
      <div class="view-head-meta">every open task, one hierarchy - subtasks fold into their parent so the list stays short</div>
    </div>
    <div class="card">
      <div class="card-header">
        <span class="card-title">Tasks</span>
        <div style="display:flex;gap:0.4rem;align-items:center">
          <button class="btn btn-primary" style="font-size:0.72rem;padding:3px 10px" onclick="openDistillModal()">Distill message to scope</button>
          <span class="card-meta">${shownCount} shown</span>
        </div>
      </div>

      <div id="coverage-strip"></div>

      <div class="task-filters">
        <div class="task-tabs">
          <button class="task-tab${f.view === 'open' ? ' on' : ''}" onclick="taskFilter({view:'open'})">Open <span>${all.length - doneCount}</span></button>
          <button class="task-tab${f.view === 'deliver' ? ' on' : ''}" onclick="taskFilter({view:'deliver'})"
                  title="Drafted work waiting on you to review it and send it">To deliver <span>${deliverCount}</span></button>
          <button class="task-tab${f.view === 'archive' ? ' on' : ''}" onclick="taskFilter({view:'archive'})">Archive <span>${doneCount}</span></button>
        </div>
        <select class="task-select" onchange="taskFilter({prio:this.value})" title="Filter by priority">
          <option value=""${sel('', f.prio)}>any priority</option>
          ${['high', 'medium', 'low'].map(p => `<option value="${p}"${sel(p, f.prio)}>${p}</option>`).join('')}
        </select>
        <select class="task-select" onchange="taskFilter({tag:this.value})" title="Filter by tag / space">
          <option value=""${sel('', f.tag)}>any tag</option>
          ${tags.map(t => `<option value="${escHtml(t.id)}"${sel(t.id, f.tag)}>${escHtml(t.label)}</option>`).join('')}
        </select>
        ${f.view === 'archive' ? `
          <select class="task-select" onchange="taskFilter({since:this.value})" title="Finished when">
            <option value=""${sel('', f.since)}>any time</option>
            <option value="7"${sel('7', f.since)}>last 7 days</option>
            <option value="30"${sel('30', f.since)}>last 30 days</option>
            <option value="90"${sel('90', f.since)}>last 90 days</option>
          </select>` : ''}
        ${f.prio || f.tag || f.since ? `<button class="btn btn-ghost" style="font-size:0.68rem;padding:2px 8px"
            onclick="taskFilter({prio:'',tag:'',since:''})">clear</button>` : ''}
      </div>

      ${f.view === 'deliver' ? `<div class="deliver-intro">Drafted work, waiting on you. Read it, mark it
        reviewed, then record who you sent it to. None of this closes a task - only you do that.</div>` : ''}

      ${listHtml ? listHtml
        : `<div class="empty-state">${f.view === 'archive' ? 'Nothing finished in this window yet … the window is still open.'
            : f.view === 'deliver' ? 'Nothing waiting to go out. Work lands here when it is drafted and needs your eyes before a supervisor sees it.'
            : (f.prio || f.tag) ? 'Nothing matches those filters … either you are very organised or the filters are very specific.'
            : 'No tasks in Scope. Click <strong>Distill Message</strong> above to extract tasks from any email or chat.'}</div>`}
      ${f.view === 'open' ? `
        <div class="inline-form">
          <input id="new-task-input" type="text" placeholder="Add task (auto-syncs to Jira)..."/>
          <button class="btn btn-primary" onclick="addTask()">+ Add</button>
        </div>` : ''}
    </div>`;
}

function taskFilter(patch) {
  taskFilters = { ...taskFilters, ...patch };
  repaintView('tasks');
}

/**
 * The coverage strip - is everything actually deliverable?
 *
 * One line above the list answering the handover questions for every open task:
 * files attached, words drafted, superiors covered. Quiet when all is well; when
 * something is missing it names the task and the gap, and a tap opens the task
 * where the fix is one button. Superior-tabled gaps come first and in amber -
 * work someone asked for out loud must never be the thing that slips.
 */
let coverageCache = null;
async function fetchCoverage() {
  const host = document.getElementById('coverage-strip');
  if (!host) return;
  if (coverageCache) paintCoverage(coverageCache);
  try {
    const d = await (await fetch('/api/tasks/coverage')).json();
    coverageCache = d;
    paintCoverage(d);
  } catch { /* the strip is advisory; the list stands on its own */ }
}

function paintCoverage(d) {
  const host = document.getElementById('coverage-strip');
  if (!host || !d) return;
  const gaps = (d.tasks || []).filter(t => !t.covered);
  if (!gaps.length) {
    host.innerHTML = `<div class="coverage-strip ok">
      Every open task has its deliverable and its words · ${d.open} open, all covered</div>`;
    return;
  }
  host.innerHTML = `
    <div class="coverage-strip warn">
      <span class="coverage-lead">${gaps.length} of ${d.open} open task${d.open === 1 ? '' : 's'} missing something:</span>
      ${gaps.slice(0, 8).map(t => `
        <button class="gap-chip${t.superior ? ' superior' : ''}" onclick="openTask('${escAttr(t.id)}')"
                title="${escAttr(t.title)}${t.assignedBy ? ` - tabled by ${escAttr(t.assignedBy)}` : ''}">
          ${escHtml(t.id)}${t.superior ? ' ★' : ''} · ${escHtml(t.gaps[0])}
        </button>`).join('')}
      ${gaps.length > 8 ? `<span class="card-meta">+${gaps.length - 8} more</span>` : ''}
    </div>`;
}

// ── DELIVERY ─────────────────────────────────────────────────────────────────
// Drafted work, on its way to a supervisor, by his hand. Three steps: read it,
// mark it reviewed, record the send. Nothing here touches STATUS - a task is
// closed by him and by nothing else, so "sent to Alex" and "done" stay the two
// separate facts they actually are.

let RECIPIENTS = null;

async function fetchRecipients() {
  if (RECIPIENTS) return RECIPIENTS;
  try { RECIPIENTS = (await (await fetch('/api/tasks/recipients')).json()).recipients || []; }
  catch { RECIPIENTS = []; }
  return RECIPIENTS;
}

const DELIVERY_LABEL = { '-':'Not started', drafted:'Drafted', reviewed:'Reviewed', sent:'Sent' };

function deliveryCard(t) {
  const state = (t.DELIVERY && t.DELIVERY !== '-') ? t.DELIVERY : (t.STATUS === 'review' ? 'drafted' : '-');
  const sent = state === 'sent';
  return `
  <div class="deliver-card d-${escHtml(state)}" id="deliver-${escHtml(t.ID)}">
    <div class="deliver-head">
      <span class="deliver-state">${escHtml(DELIVERY_LABEL[state] || state)}</span>
      <span class="deliver-title" onclick="openTask('${escHtml(t.ID)}')" title="Open the full task">${escHtml(t.TITLE)}</span>
      <span class="deliver-id">${escHtml(t.ID)}</span>
    </div>

    ${t.WHY && t.WHY !== '-' ? `<div class="deliver-why">${escHtml(t.WHY)}</div>` : ''}

    ${sent ? `<div class="deliver-sent">
        Sent to <strong>${escHtml(t.SENT_TO === '-' ? 'someone' : t.SENT_TO)}</strong>
        ${t.SENT_VIA && t.SENT_VIA !== '-' ? `via ${escHtml(t.SENT_VIA)}` : ''}
        · ${fmtWhen(t.SENT_AT, { rel: true })}
        ${t.DELIVERY_NOTE && t.DELIVERY_NOTE !== '-' ? `<div class="deliver-note">${escHtml(t.DELIVERY_NOTE)}</div>` : ''}
        <div class="deliver-hint">Still open until you close it - being sent is not being accepted.</div>
      </div>` : ''}

    <div class="deliver-actions">
      <button class="btn btn-ghost" style="font-size:0.68rem;padding:3px 10px"
              onclick="deliveryDocs('${escHtml(t.ID)}',this)" title="Find the drafted document for this task">The draft</button>
      ${state !== 'reviewed' && !sent ? `<button class="btn btn-ghost" style="font-size:0.68rem;padding:3px 10px"
              onclick="deliverySet('${escHtml(t.ID)}','reviewed')" title="You have read it and it is ready to go">Mark reviewed</button>` : ''}
      ${!sent ? `<button class="btn btn-primary" style="font-size:0.68rem;padding:3px 11px"
              onclick="deliveryRecordSend('${escHtml(t.ID)}')">Record send</button>`
             : `<button class="btn btn-ghost" style="font-size:0.68rem;padding:3px 10px"
              onclick="deliveryRecordSend('${escHtml(t.ID)}')" title="Correct who, when or how">Edit the record</button>`}
      ${sent ? `<button class="btn btn-ghost" style="font-size:0.68rem;padding:3px 10px"
              onclick="deliverySet('${escHtml(t.ID)}','reviewed')" title="It has not actually gone out">Not sent after all</button>` : ''}
    </div>
    <div id="deliver-docs-${escHtml(t.ID)}"></div>
  </div>`;
}

async function deliverySet(id, delivery) {
  try {
    const d = await (await fetch('/api/tasks/delivery', { method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id, delivery }) })).json();
    if (!d.success) throw new Error(d.error || 'refused');
    await fetchState();
    repaintView('tasks');
    showToast(delivery === 'reviewed' ? 'Marked reviewed. It is ready to go.' : 'Updated', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

/** Record a handover he has already made, or is making now. */
async function deliveryRecordSend(id) {
  const t = (STATE.tasks || []).find(x => x.ID === id);
  if (!t) return;
  const people = await fetchRecipients();
  // uiForm takes plain strings for a select, so names go in the list and the
  // roles go in the hint underneath - same information, no lookup needed.
  const names = people.map(p => p.name);
  const who = people.slice(0, 4).map(p => `${p.name} (${String(p.role || '').split(/[-,(]/)[0].trim()})`).join(', ');

  uiForm('Record the send', [
    { id:'sentTo', label:'Sent to', type:'select',
      options: names.length ? names : ['no one on record yet'],
      value: t.SENT_TO && t.SENT_TO !== '-' ? t.SENT_TO : (names[0] || ''),
      hint: who ? `Approvers first: ${who}` : '' },
    { id:'sentVia', label:'How', type:'select',
      options: ['email','whatsapp','jira','teams','in person','shared drive','other'],
      value: t.SENT_VIA && t.SENT_VIA !== '-' ? t.SENT_VIA : 'email' },
    { id:'sentAt', label:'When', type:'text',
      value: (t.SENT_AT && t.SENT_AT !== '-' ? String(t.SENT_AT).slice(0,10) : new Date().toISOString().slice(0,10)),
      hint:'YYYY-MM-DD. Leave as today unless you are logging something you sent earlier.' },
    { id:'note', label:'Note', type:'text',
      value: t.DELIVERY_NOTE && t.DELIVERY_NOTE !== '-' ? t.DELIVERY_NOTE : '',
      placeholder:'what you said, or what you are waiting for back',
      hint:'Optional. This is what makes the record answer questions later.' },
  ], async (v) => {
    const d = await (await fetch('/api/tasks/delivery', { method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id, delivery:'sent', sentTo:v.sentTo, sentVia:v.sentVia,
                             sentAt:v.sentAt, note:v.note }) })).json();
    if (!d.success) { showToast(d.error || 'refused', 'error'); return false; }
    await fetchState();
    repaintView('tasks');
    // Said plainly, because the whole point is that these are different events.
    showToast('Recorded as sent. The task stays open until you close it.', 'success');
    return true;
  });
}

/**
 * The files this task actually produced. Linked ones are certain and come
 * first; found ones are the search's best guess and are labelled as such, so
 * he always knows which is which.
 */
async function deliveryDocs(id, btn) {
  const box = document.getElementById(`deliver-docs-${id}`);
  if (box.innerHTML) { box.innerHTML = ''; return; }
  if (btn) btn.disabled = true;
  box.innerHTML = `<div class="deliver-docs"><div class="empty-state">Looking…</div></div>`;
  try {
    const d = await (await fetch(`/api/tasks/deliverables?taskId=${encodeURIComponent(id)}`)).json();
    const list = d.all || d.deliverables || [];
    // OneDrive first when it is there: that copy opens on his phone, and a
    // document he can only reach at this desk defeats the point of the mirror.
    const row = (doc) => `
      <div class="deliver-doc${doc.source === 'found' ? ' is-guess' : ''}">
        <span class="deliver-doc-name">${escHtml(doc.name)}</span>
        <span class="deliver-doc-meta">${doc.source === 'linked' ? 'attached' : 'best guess'}${
          doc.role === 'note' ? ' · covering note' : ''}${
          doc.bytes ? ` · ${Math.round(doc.bytes/1024)} KB` : ''}${
          doc.modified ? ` · ${fmtWhen(doc.modified, { time:false })}` : ''}${
          doc.onedrive === false ? ' · <span style="color:var(--amber)">not on OneDrive yet</span>'
          : doc.stale ? ' · <span style="color:var(--amber)">OneDrive copy is behind</span>'
          : ' · on OneDrive'}</span>
        ${doc.webUrl ? `<a class="learn-artifact" href="${escAttr(doc.webUrl)}" target="_blank" rel="noreferrer"
             title="Opens the OneDrive copy - works on your phone too">open</a>` : ''}
        ${doc.rel ? `<button class="learn-artifact" onclick="deliveryOpen('${escAttr(doc.rel)}',this)"
             title="Opens the copy on this machine">here</button>` : ''}
        ${doc.rel ? `<button class="learn-artifact" onclick="downloadDocument('${escAttr(doc.rel)}','${escAttr(doc.name)}',this)"
             title="Save a copy through the browser - works on your phone">save</button>` : ''}
      </div>`;
    // The covering note rides along: handing over a file without words is not a
    // thing that happens here, so the words are one tap away from the file.
    const noteBlock = d.note?.text ? `
      <div class="deliver-note-row">
        <span class="deliver-doc-meta">${d.note.source === 'file' ? 'covering note on file'
          : d.note.source === 'draft' ? `note drafted${d.note.to ? ` for ${escHtml(d.note.to)}` : ''}`
          : 'note composed from the record'}</span>
        <button class="learn-artifact" onclick="copyDeliveryNote('${escAttr(id)}',this)">copy the note</button>
      </div>` : '';
    box.innerHTML = `<div class="deliver-docs">${list.length
      ? list.map(row).join('') + noteBlock +
        (d.dead?.length ? `<div class="deliver-doc-meta" style="color:var(--amber)">
           ${d.dead.length} linked file${d.dead.length === 1 ? '' : 's'} no longer on disk</div>` : '')
      : `<div class="empty-state">Nothing produced for this one yet. When you write something,
          <button class="btn btn-ghost" style="font-size:0.66rem;padding:1px 8px" onclick="deliveryRelink(this)">relink the board</button>
          picks it up.</div>`}</div>`;
  } catch (e) {
    box.innerHTML = `<div class="deliver-docs"><div class="empty-state" style="color:var(--red)">${escHtml(e.message)}</div></div>`;
  } finally { if (btn) btn.disabled = false; }
}

/** The covering note for one task, straight onto the clipboard. */
async function copyDeliveryNote(id, btn) {
  const was = btn.textContent;
  btn.textContent = 'copying…';
  try {
    const d = await (await fetch(`/api/tasks/note?taskId=${encodeURIComponent(id)}`)).json();
    if (!d.note?.text) throw new Error('No note resolved for this task');
    await navigator.clipboard.writeText(d.note.subject ? `${d.note.subject}\n\n${d.note.text}` : d.note.text);
    btn.textContent = 'copied';
  } catch (e) { showToast(e.message, 'error'); btn.textContent = was; }
  finally { setTimeout(() => { btn.textContent = was; }, 1500); }
}

/** Open a deliverable in whatever the machine uses for that file type. */
async function deliveryOpen(rel, btn) {
  const was = btn.textContent;
  btn.textContent = 'opening…';
  try {
    const d = await (await fetch('/api/documents/open', { method:'POST',
      headers:{'Content-Type':'application/json'}, body: JSON.stringify({ file: rel }) })).json();
    if (!d.success) throw new Error(d.error || 'could not open it');
    btn.textContent = 'opened';
  } catch (e) { showToast(e.message, 'error'); btn.textContent = was; }
  finally { setTimeout(() => { btn.textContent = was; }, 1600); }
}

/** Repair every link on the board: drop what vanished, adopt what appeared. */
async function deliveryRelink(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'relinking…'; }
  try {
    const d = await (await fetch('/api/tasks/deliverables/relink', { method:'POST',
      headers:{'Content-Type':'application/json'}, body:'{}' })).json();
    if (!d.success) throw new Error(d.error || 'refused');
    showToast(`${d.repaired} task${d.repaired === 1 ? '' : 's'} relinked · ${d.adopted} adopted · ${d.dropped} dead link${d.dropped === 1 ? '' : 's'} dropped`, 'success');
    await fetchState();
    repaintView('tasks');
  } catch (e) { showToast(e.message, 'error'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'relink the board'; } }
}

/**
 * A colour per tag, derived from the tag's own name.
 *
 * Deterministic rather than configured: a new org or space gets a distinct,
 * stable colour the moment it exists, with no palette to maintain and no
 * chance of two tags colliding by accident. Hues are pulled off the green the
 * console is built around, and kept muted - a tag is a label, not an alarm.
 */
function tagHue(tagId) {
  let h = 0;
  const s = String(tagId || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
function tagStyle(tagId) {
  const h = tagHue(tagId);
  return `color:hsl(${h} 62% 72%);border-color:hsl(${h} 45% 34%);background:hsl(${h} 45% 34% / 0.16)`;
}
/** The tag's human label when the vocabulary knows it, else the raw id. */
function tagLabel(tagId) {
  const t = (STATE.tags || []).find(x => x.id === tagId);
  return t ? t.label : tagId;
}

/**
 * One task row.
 *
 * The previous version put an urgency select, a status select, a date input, a
 * Jira control, a tool button, an edit button and a delete button on every line -
 * seven controls per task, which turned a list you are meant to scan into a wall
 * of widgets.
 *
 * This shows state and hides actions. Priority is a coloured edge rather than a
 * dropdown, the meta line is plain text, and every action lives behind one menu
 * that holds MORE than before. The title opens the full task.
 */
function taskRow(t, opts = {}) {
  // readTSV keys rows by the TSV header, so the column is JIRA_KEY (not jiraKey),
  // and unset cells hold the '-' sentinel written by appendTSV.
  const jk   = (t.JIRA_KEY && t.JIRA_KEY !== '-') ? t.JIRA_KEY : '';
  const due  = (t.DUE_DATE && t.DUE_DATE !== '-') ? t.DUE_DATE : '';
  const done = t.STATUS === 'done';
  const today = new Date().toISOString().slice(0, 10);
  const overdue = due && !done && due < today;
  const dueSoon = due && !done && !overdue && due <= new Date(Date.now() + 864e5).toISOString().slice(0, 10);

  const dueLabel = !due ? '' : overdue ? `overdue ${due}` : dueSoon ? `due ${due}` : due;
  const hasKids = (opts.childCount || 0) + (opts.doneKids || 0) > 0;

  return `
    <div class="trow prio-${escHtml(t.PRIORITY || 'medium')}${done ? ' is-done' : ''}${opts.sub ? ' trow-sub' : ''}" id="task-row-${escHtml(t.ID)}">
      ${hasKids ? `
        <button class="trow-caret${opts.expanded ? ' open' : ''}" title="${opts.expanded ? 'Collapse' : 'Expand'} subtasks"
                onclick="event.stopPropagation();toggleTaskExpand('${escHtml(t.ID)}')">▸</button>`
        : `<span class="trow-caret-spacer"></span>`}
      <button class="task-cb ${done ? 'done' : ''} ${t.STATUS === 'review' ? 'review' : ''}"
              title="Complete - choose In Review or Done"
              onclick="event.stopPropagation();markDone('${escHtml(t.ID)}','${escHtml(jk)}',this)"></button>

      <div class="trow-main" onclick="openTask('${escHtml(t.ID)}')" title="Open the full task">
        <!-- Tag first: which part of the life this belongs to is the frame you
             read the title inside, so it leads rather than trailing. -->
        ${(t.TAG && t.TAG !== '-') || jk ? `
          <div class="trow-tags">
            ${t.TAG && t.TAG !== '-' ? `<span class="trow-tag" title="Filter by this tag"
                style="${tagStyle(t.TAG)}"
                onclick="event.stopPropagation();taskFilter({tag:'${escHtml(t.TAG)}'})">${escHtml(tagLabel(t.TAG))}</span>` : ''}
            ${jk ? `<span class="trow-jira">${escHtml(jk)}</span>` : ''}
          </div>` : ''}
        <div class="trow-title ${done ? 'done' : ''}" id="task-title-${escHtml(t.ID)}">${escHtml(t.TITLE)}</div>
        <div class="trow-meta">
          <span class="trow-prio">${escHtml(t.PRIORITY || 'medium')}</span>
          ${t.STATUS && t.STATUS !== 'today' ? `<span class="trow-status st-${escHtml(t.STATUS)}">${escHtml(t.STATUS)}</span>` : ''}
          ${dueLabel ? `<span class="trow-due${overdue ? ' overdue' : dueSoon ? ' soon' : ''}">${escHtml(dueLabel)}</span>` : ''}
          ${hasKids ? `<span class="trow-subcount" title="Subtasks done / total">${opts.doneKids || 0}/${(opts.childCount || 0) + (opts.doneKids || 0)} subs</span>` : ''}
        </div>
      </div>

      <button class="trow-more" title="Actions"
              onclick="event.stopPropagation();openTaskMenu('${escHtml(t.ID)}',this)">⋯</button>
    </div>`;
}

// Which main tasks are expanded. Session-persistent so a repaint (every task
// action repaints) does not fold the tree you were working in.
const taskExpanded = new Set(JSON.parse(sessionStorage.getItem('isconl.taskExpanded') || '[]'));
function toggleTaskExpand(id) {
  if (taskExpanded.has(id)) taskExpanded.delete(id); else taskExpanded.add(id);
  try { sessionStorage.setItem('isconl.taskExpanded', JSON.stringify([...taskExpanded])); } catch {}
  repaintView('tasks');
}

async function addSubtask(parentId) {
  const title = await uiPrompt({ title: 'Add a subtask', label: 'What is the subtask',
    placeholder: 'Start with a verb', confirmLabel: 'Add' });
  if (!title || !title.trim()) return;
  try {
    const r = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), parentId, syncJira: false }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      taskExpanded.add(parentId);
      showToast('Subtask added', 'success');
      await fetchState(); repaintView('tasks');
    } else showToast(d.error || 'Could not add subtask', 'error');
  } catch (e) { showToast(e.message, 'error'); }
}

// ── ROW ACTION MENU ──
// Everything a task can do, in one place, opened from one button. Submenus keep
// the first level short enough to read at a glance.
let _menuTaskId = null;

function closeTaskMenu() {
  const m = document.getElementById('task-menu');
  if (m) m.remove();
  document.removeEventListener('click', onTaskMenuOutside);
  document.removeEventListener('keydown', onTaskMenuKey);
  _menuTaskId = null;
}
function onTaskMenuOutside(e) { if (!e.target.closest('#task-menu')) closeTaskMenu(); }
function onTaskMenuKey(e)     { if (e.key === 'Escape') closeTaskMenu(); }

function openTaskMenu(taskId, anchor) {
  if (_menuTaskId === taskId) { closeTaskMenu(); return; }
  closeTaskMenu();
  _menuTaskId = taskId;

  const t = (STATE.tasks || []).find(x => x.ID === taskId) || {};
  const jk = (t.JIRA_KEY && t.JIRA_KEY !== '-') ? t.JIRA_KEY : '';
  const row = (label, action, extra = '') =>
    `<button class="tmenu-item ${extra}" data-act="${action}">${label}</button>`;

  const box = document.createElement('div');
  box.className = 'task-menu';
  box.id = 'task-menu';
  box.innerHTML = `
    <div class="tmenu-label">${escHtml(taskId)}</div>
    ${row('Open full task', 'open')}
    ${row('Rename', 'rename')}
    ${(!t.PARENT_ID || t.PARENT_ID === '-') ? row('Add subtask', 'subtask') : ''}
    <div class="tmenu-sep"></div>
    <div class="tmenu-label">Urgency</div>
    <div class="tmenu-chips">
      ${['high','medium','low'].map(p =>
        `<button class="tmenu-chip prio-${p}${t.PRIORITY === p ? ' current' : ''}" data-act="prio:${p}">${p}</button>`).join('')}
    </div>
    <div class="tmenu-label">Status</div>
    <div class="tmenu-chips">
      ${['today','next','waiting','review','done'].map(s =>
        `<button class="tmenu-chip${t.STATUS === s ? ' current' : ''}" data-act="status:${s}">${s}</button>`).join('')}
    </div>
    <div class="tmenu-sep"></div>
    <div class="tmenu-label">Due</div>
    <div class="tmenu-chips">
      ${row('Today', 'due:0', 'tmenu-chip')}
      ${row('Tomorrow', 'due:1', 'tmenu-chip')}
      ${row('Next week', 'due:7', 'tmenu-chip')}
      ${row('Clear', 'due:none', 'tmenu-chip')}
    </div>
    <div class="tmenu-sep"></div>
    ${jk ? row(`Open ${escHtml(jk)} in Jira`, 'jira-open')
         : row('Post to Jira', 'jira-push')}
    ${row('Delete', 'delete', 'danger')}`;

  document.body.appendChild(box);
  const r = anchor.getBoundingClientRect();
  box.style.left = `${Math.max(8, Math.min(r.right - box.offsetWidth, window.innerWidth - box.offsetWidth - 8))}px`;
  box.style.top  = `${r.bottom + 6}px`;
  const br = box.getBoundingClientRect();
  if (br.bottom > window.innerHeight - 8) box.style.top = `${Math.max(8, r.top - br.height - 6)}px`;

  box.querySelectorAll('[data-act]').forEach(btn => {
    btn.addEventListener('click', () => handleTaskMenu(taskId, btn.dataset.act, t));
  });
  setTimeout(() => {
    document.addEventListener('click', onTaskMenuOutside);
    document.addEventListener('keydown', onTaskMenuKey);
  }, 0);
}

async function handleTaskMenu(taskId, act, t) {
  const jk = (t.JIRA_KEY && t.JIRA_KEY !== '-') ? t.JIRA_KEY : '';
  closeTaskMenu();

  if (act === 'open')    return openTask(taskId);
  if (act === 'rename')  return beginEditTask(taskId);
  if (act === 'subtask') return addSubtask(taskId);
  if (act === 'delete') {
    return deleteTask(taskId, t.TITLE || 'this task', null);
  }
  if (act === 'jira-open') {
    const host = STATE.services?.jiraConfig?.host || '';
    if (host && jk) window.open(`https://${host}/browse/${jk}`, '_blank', 'noreferrer');
    return;
  }
  if (act === 'jira-push') return reviewTaskForJira(taskId);

  if (act.startsWith('prio:'))   return updateTask(taskId, { priority: act.slice(5) });
  if (act.startsWith('status:')) return updateTask(taskId, { status: act.slice(7) });
  if (act.startsWith('due:')) {
    const spec = act.slice(4);
    if (spec === 'none') return updateTask(taskId, { due_date: '-' });
    const d = new Date(Date.now() + Number(spec) * 864e5);
    return updateTask(taskId, { due_date: d.toISOString().slice(0, 10) });
  }
}

let currentDistillType = 'auto';

function setDistillType(type, btn) {
  currentDistillType = type;
  document.querySelectorAll('.distill-type-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  // Update placeholder based on type
  const ta = document.getElementById('distill-text-input');
  if (!ta) return;
  const hints = {
    auto: 'Paste any message, email, meeting notes… AI will auto-detect what to extract.',
    task: 'Paste a message with action items - AI extracts tasks and wires tools (Jira, GitHub, OneDrive…)',
    event: 'Paste meeting invite, calendar request, or time-sensitive message - AI creates a Calendar event.',
    note: 'Paste any content - AI distills key insights, ideas, and context into a Note.',
    decision: 'Paste a discussion or thread - AI identifies pending decisions and risks.',
  };
  ta.placeholder = hints[type] || hints.auto;
}

function openDistillModal() {
  currentDistillType = 'auto';
  document.querySelectorAll('.distill-type-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.distill-type-btn[data-type="auto"]')?.classList.add('active');
  document.getElementById('distill-text-input').value = '';
  document.getElementById('distill-modal')?.classList.remove('hidden');
}
function closeDistillModal() { document.getElementById('distill-modal')?.classList.add('hidden'); }

async function submitDistillFromModal() {
  const text = document.getElementById('distill-text-input')?.value.trim();
  if (!text) { showToast('Please paste content first', 'error'); return; }
  const syncJira = document.getElementById('distill-sync-jira')?.checked ?? true;
  const dtype = currentDistillType || 'auto';

  // For event/note/decision - route to special handlers
  if (dtype === 'event') {
    showToast('Creating Calendar event…', 'info');
    closeDistillModal();
    const prompt = `Extract a single calendar event from this text. Return JSON only: {"title":"...","date":"YYYY-MM-DD","time":"HH:MM","description":"...","location":"..."}.\nText:\n${text}`;
    try {
      const reply = await postChat(prompt);
      const match = reply.match(/\{[\s\S]*\}/);
      if (match) {
        const ev = JSON.parse(match[0]);
        await fetch('/api/calendar/events', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(ev) });
        showToast(`Event "${ev.title}" added to Calendar!`, 'success');
        await fetchState();
        navigate('calendar');
      } else { showToast('Could not parse event - try rewording', 'error'); }
    } catch(e) { showToast(e.message, 'error'); }
    return;
  }

  if (dtype === 'note' || dtype === 'decision') {
    const label = dtype === 'note' ? 'Note' : 'Decision';
    showToast(`Distilling ${label}…`, 'info');
    closeDistillModal();
    const prompt = dtype === 'note'
      ? `Distill the key insights and ideas from this text into 3-5 concise bullet points:\n${text}`
      : `Identify the pending decisions, open questions, and risks from this text. Format as a numbered list:\n${text}`;
    try {
      const reply = await postChat(prompt);
      renderDistillationInChat([{ task: { TITLE: `${label}: Distilled`, PRIORITY: 'medium' }, recommendedTool: 'jira', rawNote: reply }]);
      navigate('today');
    } catch(e) { showToast(e.message, 'error'); }
    return;
  }

  // Default: task distillation
  showToast('Distilling into tasks & wiring tools…', 'info');
  try {
    const r = await fetch('/api/distill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, syncJira, distillType: dtype }),
    });
    const data = await r.json();
    if (data.success) {
      closeDistillModal();
      document.getElementById('distill-text-input').value = '';
      showToast(`Extracted ${data.count} item(s)!`, 'success');
      await fetchState();
      await fetchJiraIssues();
      renderDistillationInChat(data.tasks);
      navigate('tasks');
    } else {
      showToast('Distillation failed: ' + (data.error || 'Unknown'), 'error');
    }
  } catch(e) { showToast(e.message, 'error'); }
}

// pushTaskToJira used to live here. It took a TITLE rather than a task id and
// posted it to /api/tasks with syncJira, which created a NEW row for a task that
// already existed and pushed that one - so the board accumulated near-duplicates
// and the original row stayed unlinked. Every caller now goes through
// reviewTaskForJira, which works on the real row and passes the gate.

function renderDistillationInChat(distilledTasks) {
  const box = document.getElementById('chat-rail-messages');
  if (!box) return;
  const cardsHtml = (distilledTasks || []).map(dt => {
    const t = dt.task;
    const tool = dt.recommendedTool || 'jira';
    const toolLabel = tool === 'github' ? 'GitHub CLI' : tool === 'onedrive' ? 'File Manager' : tool === 'buffer' ? 'Social' : 'Jira';
    const toolAction = tool === 'github' ? "quickAsk('gh repo list')" : tool === 'onedrive' ? "navigate('files')" : tool === 'buffer' ? "navigate('social')" : "navigate('jira')";
    return `
      <div class="chat-task-card" style="background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--r-md);padding:0.6rem;margin-top:0.4rem">
        <div style="font-weight:600;font-size:0.8rem;color:var(--text);margin-bottom:0.2rem">✓ ${escHtml(t.TITLE)}</div>
        <div style="display:flex;gap:0.3rem;align-items:center;flex-wrap:wrap">
          <span class="badge badge-${t.PRIORITY}">${t.PRIORITY}</span>
          ${t.jiraKey ? `<span class="badge badge-jira">${t.jiraKey}</span>`
            : (t.ID ? `<button class="kanban-action-btn ai-btn" onclick="reviewTaskForJira('${escHtml(t.ID)}')">Review for Jira</button>` : '')}
          <button class="kanban-action-btn" onclick="${toolAction}">${toolLabel}</button>
        </div>
      </div>`;
  }).join('');

  box.innerHTML += `
    <div class="chat-msg agent">
      <div class="msg-role">iSconl · Task Distiller</div>
      <strong>Distilled ${distilledTasks.length} Task(s) into Scope:</strong>
      ${cardsHtml}
    </div>`;
  box.scrollTop = box.scrollHeight;
}

// ── DECISION LOG & RISK REGISTER (live from the vault) ───────────────────────
// These two views were hardcoded sample data from the first build for weeks,
// which meant the "decision log" on screen and the decision log on record could
// disagree - the exact failure this console exists to prevent. They now render
// the org's own decision_log.yaml and risk_register.yaml through /api/decisions,
// with staleness computed, not noticed: a PENDING decision whose citing tasks
// are all delivered wears a flag until its status is corrected.

let decisionLogCache = null;

async function fetchDecisionLog() {
  try {
    const d = await (await fetch('/api/decisions')).json();
    decisionLogCache = d;
  } catch { decisionLogCache = { error: true, decisions: [], risks: [] }; }
  if (currentView === 'decisions' || currentView === 'risks') repaintView(currentView);
}

function renderDecisions() {
  if (!decisionLogCache) { setTimeout(fetchDecisionLog, 0);
    return `<div class="card"><div class="card-header"><span class="card-title">Decision Log</span></div>
      <div class="empty-state">Reading the record…</div></div>`; }
  const list = decisionLogCache.decisions || [];
  const staleCount = list.filter(d => d.stale).length;
  return `
    <div class="view-head">
      <h1>Decision log</h1>
      <div class="view-head-meta">${escHtml(decisionLogCache.org || '')} · ${list.length} on record${staleCount ? ` · ${staleCount} behind reality` : ''}</div>
    </div>
    <div class="card">
      <div class="card-header">
        <span class="card-title">Decision Log</span>
        <span class="card-meta">${escHtml(decisionLogCache.org || '')} · ${list.length} on record${staleCount ? ` · ${staleCount} behind reality` : ''}</span>
      </div>
      ${!list.length ? `<div class="empty-state">Nothing on record yet. Decisions land in
          career/orgs/&lt;org&gt;/decision_log.yaml and appear here the moment they are written.</div>` : ''}
      ${list.map(d => {
        const pending = /PENDING|OPEN|DRAFT/i.test(d.status || '');
        return `
        <div class="decision-item${d.stale ? ' stale' : ''}">
          <div class="decision-id">${escHtml(d.id)}</div>
          <div class="decision-text">${escHtml(d.title || '')}</div>
          ${d.note ? `<div class="decision-note">${docChips(escHtml(d.note))}</div>` : ''}
          <div class="decision-row">
            <span class="pill pill-${pending ? 'pending' : 'confirmed'}">${escHtml((d.status || '').split(/[-–]/)[0].trim().toUpperCase() || 'ON RECORD')}</span>
            ${d.by ? `<span class="decision-by">by ${escHtml(d.by)}</span>` : ''}
            ${d.date ? `<span class="decision-by">${escHtml(d.date)}</span>` : ''}
            ${(d.citing || []).length ? `<span class="decision-by">tasks: ${d.citing.map(t =>
                `<a href="#" onclick="openTask('${escAttr(t.id)}');return false">${escHtml(t.id)}</a>`).join(', ')}</span>` : ''}
          </div>
          ${d.stale ? `<div class="decision-stale-row">
              The work this cites is delivered, but the status still says otherwise - the log is behind reality.
              <button class="btn btn-primary doc-act" onclick="resolveDecision('${escAttr(d.id)}', this)">Mark resolved</button>
            </div>` : ''}
          ${d.aging ? `<div class="decision-stale-row">Pending on ${escHtml(d.by || 'someone')} for ${d.aging} days.
              <button class="btn btn-ghost doc-act" onclick="showChase('${escAttr(d.id)}')">The chase, pre-written</button>
            </div>` : ''}
        </div>`;
      }).join('')}
    </div>`;
}

async function resolveDecision(id, btn) {
  if (!await uiConfirm({ title: `Mark ${id} resolved?`,
    body: 'This updates the decision log on record. The previous version is kept.',
    confirmLabel: 'Mark resolved' })) return;
  btn.disabled = true; btn.textContent = 'Recording…';
  try {
    const today = new Date().toISOString().slice(0, 10);
    const r = await fetch('/api/decisions/update', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: `RESOLVED ${today}`,
        appendNote: `[${today}: marked resolved from the console - citing tasks delivered]` }),
    });
    const d = await r.json();
    if (!d.success) throw new Error(d.error || 'refused');
    decisionLogCache = null;
    showToast(`${id} marked resolved on the record`, 'success');
    repaintView('decisions');
  } catch (e) { showToast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Mark resolved'; }
}

function renderRisks() {
  if (!decisionLogCache) { setTimeout(fetchDecisionLog, 0);
    return `<div class="card"><div class="card-header"><span class="card-title">Risk Register</span></div>
      <div class="empty-state">Reading the record…</div></div>`; }
  const risks = decisionLogCache.risks || [];
  return `
    <div class="view-head">
      <h1>Risk register</h1>
      <div class="view-head-meta">${escHtml(decisionLogCache.org || '')} · ${risks.length} live</div>
    </div>
    <div class="card">
      <div class="card-header">
        <span class="card-title">Risk Register</span>
        <span class="card-meta">${escHtml(decisionLogCache.org || '')} · ${risks.length} live</span>
      </div>
      ${!risks.length ? `<div class="empty-state">No risks on record - or the register has not synced yet.</div>` : ''}
      ${risks.map(r => `
        <div class="risk-item sev-${escHtml((r.severity || 'low').toLowerCase())}">
          <div class="risk-id">${escHtml(r.id)}</div>
          <div>
            <div>${escHtml(r.title)}</div>
            ${r.protection ? `<div class="risk-protection">Protection: ${escHtml(r.protection)}</div>` : ''}
          </div>
          <span class="pill pill-${/high/i.test(r.severity) ? 'pending' : 'confirmed'}">${escHtml((r.severity || '').toUpperCase())}</span>
        </div>`).join('')}
    </div>`;
}

// ── SPACES (axial tree) ───────────────────────────────────────────────────────
// Navigates the same shape as the folder tree on disk: three axes, then facets,
// then domains. One level visible at a time with a breadcrumb back out, because
// the whole point of a three-wide tree is that you never face more than three
// choices at once. Command stays global and aggregated; this is the opposite -
// deliberately one place at a time.

let spacesPath = [];   // array of space IDs from an axis downwards

async function fetchSpaces() {
  try {
    const r = await fetch('/api/spaces');
    if (r.ok) {
      const d = await r.json();
      STATE.spacesTree = d.tree || [];
      STATE.spaces = d.spaces || [];
    }
  } catch (e) {}
}

// Resolve spacesPath into the chain of nodes it names, stopping at the first ID
// that no longer exists so a stale path degrades to its valid prefix.
function spacesChain() {
  const chain = [];
  let level = STATE.spacesTree || [];
  for (const id of spacesPath) {
    const node = level.find(n => n.ID === id);
    if (!node) break;
    chain.push(node);
    level = node.children || [];
  }
  return chain;
}

function enterSpace(id) {
  spacesPath = [...spacesPath, id];
  navigate('spaces');
}
function spacesUpTo(depth) {
  spacesPath = spacesPath.slice(0, depth);
  navigate('spaces');
}

function renderSpaces() {
  const tree = STATE.spacesTree;
  if (!tree) return `<div class="card"><div class="empty-state">Loading spaces…</div></div>`;
  if (!tree.length) {
    return `<div class="card"><div class="card-header"><span class="card-title">Spaces</span></div>
      <div class="empty-state">No spaces registered. Add rows to memory/space/spaces.tsv, or run a sync from OneDrive.</div></div>`;
  }

  const chain   = spacesChain();
  const current = chain.length ? chain[chain.length - 1] : null;
  const items   = current ? (current.children || []) : tree;
  const axis    = current ? (current.AXIS || '') : '';

  const crumbs = [
    `<button class="space-crumb${chain.length ? '' : ' current'}" onclick="spacesUpTo(0)">All Axes</button>`,
    ...chain.map((n, i) => `<span class="space-crumb-sep">/</span>
      <button class="space-crumb${i === chain.length - 1 ? ' current' : ''}" onclick="spacesUpTo(${i + 1})">${escHtml(n.LABEL || n.NAME)}</button>`),
  ].join('');

  const card = (n) => {
    const leaf  = !(n.children || []).length;
    const count = n.descendantCount || 0;
    // A space can point at a dashboard view instead of a folder (Decision Log,
    // Risk Register). Those open the view rather than a detail panel.
    const view  = n.VIEW && n.VIEW !== '-' ? n.VIEW : '';
    const action = view ? `navigate('${escHtml(view)}')`
                        : leaf ? `showSpaceDetail('${n.ID}')`
                               : `enterSpace('${n.ID}')`;
    return `
      <button class="space-card axis-${escHtml((n.AXIS || '').toLowerCase())}${leaf && !view ? ' leaf' : ''}${view ? ' is-view' : ''}"
              onclick="${action}"
              title="${view ? `Open ${escHtml(n.LABEL || n.NAME)}` : leaf ? 'Show details' : `Open ${escHtml(n.LABEL || n.NAME)}`}">
        <div class="space-card-top">
          <span class="space-card-label">${escHtml(n.LABEL || n.NAME)}</span>
          <span class="space-kind">${escHtml(n.KIND || '')}</span>
        </div>
        <div class="space-card-name">${escHtml(n.NAME)}</div>
        <div class="space-card-desc">${escHtml(n.DESCRIPTION && n.DESCRIPTION !== '-' ? n.DESCRIPTION : '')}</div>
        <div class="space-card-foot">
          <span class="space-status st-${escHtml(n.STATUS || 'active')}">${escHtml(n.STATUS || '')}</span>
          ${n.HEALTH && n.HEALTH !== '-' ? `<span class="space-health">health ${escHtml(n.HEALTH)}/10</span>` : ''}
          <span class="space-count">${view ? 'open view' : leaf ? 'leaf' : `${count} inside`}</span>
        </div>
      </button>`;
  };

  return `
    <div class="view-head">
      <h1>${current ? escHtml(current.LABEL || current.NAME) : 'Spaces'}</h1>
      <div class="view-head-meta">everything you do sits under exactly one of them</div>
    </div>
    <div class="card space-shell${axis ? ` axis-${escHtml(axis.toLowerCase())}` : ''}">
      <div class="card-header">
        <span class="card-title">${current ? escHtml(current.LABEL || current.NAME) : 'Spaces'}</span>
        <div style="display:flex;gap:0.4rem;align-items:center">
          <span class="card-meta">${items.length} here</span>
          <button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 8px" onclick="syncSpaces()">Check against OneDrive</button>
        </div>
      </div>

      <div class="space-crumbs">${crumbs}</div>

      ${current ? `<div class="space-context">${escHtml(current.DESCRIPTION && current.DESCRIPTION !== '-' ? current.DESCRIPTION : '')}</div>` :
                  `<div class="space-context">Three axes. Everything you do sits under exactly one of them.</div>`}

      ${items.length
        ? `<div class="space-grid">${items.map(card).join('')}</div>`
        : `<div class="empty-state">Nothing below this yet.</div>`}

      ${current && current.ONEDRIVE_PATH && current.ONEDRIVE_PATH !== '-'
        ? `<div class="space-path">
             <span class="space-path-label">Folder</span>
             <code>${escHtml(current.ONEDRIVE_PATH)}</code>
             <button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 8px"
                     onclick="openSpaceInFiles('${escHtml(current.ONEDRIVE_PATH)}')">Open in File Manager</button>
           </div>`
        : ''}
      <div id="space-detail"></div>
    </div>`;
}

function showSpaceDetail(id) {
  const all  = STATE.spaces || [];
  const node = all.find(s => s.ID === id);
  const host = document.getElementById('space-detail');
  if (!node || !host) return;
  host.innerHTML = `
    <div class="space-detail">
      <div class="space-detail-head">
        <span class="space-detail-title">${escHtml(node.LABEL || node.NAME)}</span>
        <button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 8px" onclick="document.getElementById('space-detail').innerHTML=''">Close</button>
      </div>
      <div class="space-detail-rows">
        <div><span>Folder name</span><code>${escHtml(node.NAME)}</code></div>
        <div><span>Kind</span>${escHtml(node.KIND || '')}</div>
        <div><span>Axis</span>${escHtml(node.AXIS || '')}</div>
        <div><span>Status</span>${escHtml(node.STATUS || '')}</div>
        ${node.HEALTH && node.HEALTH !== '-' ? `<div><span>Health</span>${escHtml(node.HEALTH)}/10</div>` : ''}
        <div><span>Last reviewed</span>${escHtml(node.LAST_REVIEWED || '')}</div>
        ${node.ONEDRIVE_PATH && node.ONEDRIVE_PATH !== '-' ? `<div><span>Path</span><code>${escHtml(node.ONEDRIVE_PATH)}</code></div>` : ''}
      </div>
      ${node.ONEDRIVE_PATH && node.ONEDRIVE_PATH !== '-'
        ? `<button class="btn btn-primary" style="font-size:0.72rem;padding:3px 10px"
                   onclick="openSpaceInFiles('${escHtml(node.ONEDRIVE_PATH)}')">Open in File Manager</button>`
        : `<div class="space-detail-note">No folder mapped. This space lives in the vault only.</div>`}
    </div>`;
}

// Hand the path to the File Manager rather than duplicating a file browser here.
// One-shot: the override applies to THIS visit only. It used to set the sticky
// fileManagerPath, so after opening a space whose mapped folder was missing or
// empty, every later visit to Files reopened that dead path and the view greeted
// you with "this folder is empty" forever.
let fmPendingPath = null;
function openSpaceInFiles(path) {
  fmPendingPath = path;
  navigate('files');
}

async function syncSpaces() {
  showToast('Checking the registry against OneDrive…', 'info');
  try {
    const r = await fetch('/api/spaces/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apply: false }),
    });
    const d = await r.json();
    if (!d.success) { showToast(d.error || 'Sync check failed', 'error'); return; }
    if (!d.missingLocally.length && !d.goneRemotely.length) {
      showToast(`Registry matches OneDrive across ${d.walked} folders.`, 'success');
      return;
    }
    const parts = [];
    if (d.missingLocally.length) parts.push(`${d.missingLocally.length} folder(s) not in the registry`);
    if (d.goneRemotely.length)   parts.push(`${d.goneRemotely.length} registered space(s) with no folder`);
    showToast(`Drift: ${parts.join('; ')}. See console for the list.`, 'warn');
    console.log('[Spaces] missing locally:', d.missingLocally);
    console.log('[Spaces] gone remotely:', d.goneRemotely);
  } catch (e) { showToast(e.message, 'error'); }
}

/* ── ARTICLES & CONTENT STUDIO ─────────────────────────────────────────────
   Author Practice · Nonfiction Writing space content manager, rich editor & AI engine. */
let ARTICLES = null;
let articleActiveFile = null;
let articleActiveTitle = '';
let articleEditorText = '';
let articleFilterStatus = '';
let articleSearchQuery = '';
let articleStudioTab = 'manager';
let articleStudioSubTab = 'preview';
let articleTone = 'authoritative';
let articleStatus = 'drafting';

async function loadArticles(force = false) {
  if (ARTICLES && !force) return;
  try {
    const r = await fetch('/api/articles/list');
    const d = await r.json();
    ARTICLES = d.articles || [];
  } catch (e) { ARTICLES = []; }
  if (currentView === 'articles') repaintView('articles');
}

function renderArticles() {
  if (!ARTICLES) {
    loadArticles();
    return `<div class="view-head"><h1>Articles & Content Studio</h1><div class="view-head-meta">Author Practice · Nonfiction Writing</div></div>
            <div class="card"><div class="reader-loading"><div class="spinner-inline"></div><div>Reading article space…</div></div></div>`;
  }

  const list = ARTICLES.filter(a => {
    if (articleFilterStatus && a.status !== articleFilterStatus) return false;
    if (articleSearchQuery.trim()) {
      const q = articleSearchQuery.toLowerCase();
      return a.title.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
    }
    return true;
  });

  const totalWords = ARTICLES.reduce((s, a) => s + (a.words || 0), 0);
  const draftingCount = ARTICLES.filter(a => a.status === 'drafting').length;
  const reviewCount = ARTICLES.filter(a => a.status === 'review').length;
  const approvedCount = ARTICLES.filter(a => a.status === 'approved').length;
  const publishedCount = ARTICLES.filter(a => a.status === 'published').length;

  return `
    <div class="view-head">
      <h1>Articles & Content Studio</h1>
      <div class="view-head-meta">Author Practice · Nonfiction Writing · ${ARTICLES.length} article${ARTICLES.length === 1 ? '' : 's'} · ${totalWords.toLocaleString()} words written</div>
    </div>

    <div class="card">
      <div class="card-header" style="flex-wrap:wrap;gap:0.6rem">
        <div class="task-tabs">
          <button class="task-tab${articleStudioTab === 'manager' ? ' on' : ''}" onclick="setArticleStudioTab('manager')">Article Registry <span>${ARTICLES.length}</span></button>
          <button class="task-tab${articleStudioTab === 'studio' ? ' on' : ''}" onclick="setArticleStudioTab('studio')">Article Studio <span>${articleActiveFile ? 'Editing' : 'New'}</span></button>
        </div>
        <div style="display:flex;gap:0.4rem;align-items:center;margin-left:auto">
          <button class="btn btn-primary" style="font-size:0.75rem;padding:3px 10px" onclick="createNewArticle()">+ New Article</button>
          <button class="btn btn-ghost" style="font-size:0.72rem;padding:3px 9px" onclick="loadArticles(true)">Refresh</button>
        </div>
      </div>

      ${articleStudioTab === 'manager' ? renderArticleManager(list, { total: ARTICLES.length, drafting: draftingCount, review: reviewCount, approved: approvedCount, published: publishedCount }) : renderArticleStudio()}
    </div>`;
}

function renderArticleManager(list, counts) {
  return `
    <div class="art-metrics-grid" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:0.6rem;margin-bottom:1rem">
      <div class="art-metric-card" onclick="setArticleFilterStatus('')" style="cursor:pointer;background:var(--bg-raised);padding:0.6rem 0.8rem;border-radius:var(--r-md);border:1px solid var(--border)">
        <div style="font-size:0.68rem;color:var(--text-3);text-transform:uppercase;letter-spacing:0.05em">Total Articles</div>
        <div style="font-size:1.3rem;font-weight:700;color:var(--text);margin-top:0.2rem">${counts.total}</div>
      </div>
      <div class="art-metric-card" onclick="setArticleFilterStatus('drafting')" style="cursor:pointer;background:var(--bg-raised);padding:0.6rem 0.8rem;border-radius:var(--r-md);border:1px solid var(--border)">
        <div style="font-size:0.68rem;color:var(--amber);text-transform:uppercase;letter-spacing:0.05em">Drafting</div>
        <div style="font-size:1.3rem;font-weight:700;color:var(--amber);margin-top:0.2rem">${counts.drafting}</div>
      </div>
      <div class="art-metric-card" onclick="setArticleFilterStatus('review')" style="cursor:pointer;background:var(--bg-raised);padding:0.6rem 0.8rem;border-radius:var(--r-md);border:1px solid var(--border)">
        <div style="font-size:0.68rem;color:var(--violet);text-transform:uppercase;letter-spacing:0.05em">In Review</div>
        <div style="font-size:1.3rem;font-weight:700;color:var(--violet);margin-top:0.2rem">${counts.review}</div>
      </div>
      <div class="art-metric-card" onclick="setArticleFilterStatus('approved')" style="cursor:pointer;background:var(--bg-raised);padding:0.6rem 0.8rem;border-radius:var(--r-md);border:1px solid var(--border)">
        <div style="font-size:0.68rem;color:var(--cyan);text-transform:uppercase;letter-spacing:0.05em">Approved</div>
        <div style="font-size:1.3rem;font-weight:700;color:var(--cyan);margin-top:0.2rem">${counts.approved}</div>
      </div>
      <div class="art-metric-card" onclick="setArticleFilterStatus('published')" style="cursor:pointer;background:var(--bg-raised);padding:0.6rem 0.8rem;border-radius:var(--r-md);border:1px solid var(--border)">
        <div style="font-size:0.68rem;color:var(--green);text-transform:uppercase;letter-spacing:0.05em">Published</div>
        <div style="font-size:1.3rem;font-weight:700;color:var(--green);margin-top:0.2rem">${counts.published}</div>
      </div>
    </div>

    <div style="display:flex;gap:0.6rem;align-items:center;margin-bottom:0.8rem;flex-wrap:wrap">
      <input type="text" class="search-input" style="font-size:0.78rem;padding:4px 10px;width:220px"
             placeholder="Search articles..." value="${escAttr(articleSearchQuery)}" oninput="searchArticles(this.value)"/>
      <div style="display:flex;gap:0.3rem">
        <button class="btn btn-ghost${!articleFilterStatus ? ' active' : ''}" style="font-size:0.7rem;padding:2px 8px" onclick="setArticleFilterStatus('')">All</button>
        <button class="btn btn-ghost${articleFilterStatus === 'drafting' ? ' active' : ''}" style="font-size:0.7rem;padding:2px 8px" onclick="setArticleFilterStatus('drafting')">Drafting</button>
        <button class="btn btn-ghost${articleFilterStatus === 'review' ? ' active' : ''}" style="font-size:0.7rem;padding:2px 8px" onclick="setArticleFilterStatus('review')">Review</button>
        <button class="btn btn-ghost${articleFilterStatus === 'approved' ? ' active' : ''}" style="font-size:0.7rem;padding:2px 8px" onclick="setArticleFilterStatus('approved')">Approved</button>
        <button class="btn btn-ghost${articleFilterStatus === 'published' ? ' active' : ''}" style="font-size:0.7rem;padding:2px 8px" onclick="setArticleFilterStatus('published')">Published</button>
      </div>
    </div>

    ${!list.length ? `<div class="empty-state" style="text-align:left;padding:1rem 0">No articles match the current criteria. Click "+ New Article" to write one.</div>` : `
      <div class="art-list" style="display:flex;flex-direction:column;gap:0.6rem">
        ${list.map(a => `
          <div class="art-item" style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-raised);border:1px solid var(--border);padding:0.7rem 0.9rem;border-radius:var(--r-md)">
            <div style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1">
              <div style="display:flex;align-items:center;gap:0.5rem">
                <span style="font-size:0.88rem;font-weight:600;color:var(--text)">${escHtml(a.title)}</span>
                <span class="sd-tag" style="text-transform:uppercase;font-size:0.58rem">${escHtml(a.status)}</span>
              </div>
              <div style="font-size:0.7rem;color:var(--text-3);font-family:var(--font-mono)">
                ${escHtml(a.name)} · ${a.words} words · ${escHtml(a.readingTime)} · modified ${escHtml(a.modified)}
              </div>
            </div>
            <div style="display:flex;gap:0.4rem;align-items:center">
              <button class="btn btn-ghost" style="font-size:0.7rem;padding:3px 9px" onclick="openArticleInStudio('${escHtml(a.file)}')">Edit in Studio</button>
              <button class="btn btn-ghost" style="font-size:0.7rem;padding:3px 9px" onclick="openReader('${escHtml(a.file)}')">Preview</button>
            </div>
          </div>`).join('')}
      </div>`}
  `;
}

function renderArticleStudio() {
  const words = (articleEditorText.match(/\S+/g) || []).length;
  const readTime = Math.max(1, Math.ceil(words / 200));

  return `
    <div class="art-studio-shell">
      <div class="art-studio-toolbar" style="display:flex;gap:0.6rem;align-items:center;margin-bottom:0.8rem;flex-wrap:wrap">
        <input id="art-title" type="text" class="input" style="font-size:0.95rem;font-weight:600;flex:1;min-width:200px"
               placeholder="Article Title..." value="${escAttr(articleActiveTitle)}" oninput="articleActiveTitle=this.value"/>
        <select id="art-status" class="input" style="font-size:0.75rem;padding:4px 8px" onchange="articleStatus=this.value">
          <option value="drafting" ${articleStatus === 'drafting' ? 'selected' : ''}>Status: Drafting</option>
          <option value="review" ${articleStatus === 'review' ? 'selected' : ''}>Status: In Review</option>
          <option value="approved" ${articleStatus === 'approved' ? 'selected' : ''}>Status: Approved</option>
          <option value="published" ${articleStatus === 'published' ? 'selected' : ''}>Status: Published</option>
        </select>
        <select id="art-tone" class="input" style="font-size:0.75rem;padding:4px 8px" onchange="articleTone=this.value">
          <option value="authoritative" ${articleTone === 'authoritative' ? 'selected' : ''}>Tone: Authoritative & Deadpan</option>
          <option value="persuasive" ${articleTone === 'persuasive' ? 'selected' : ''}>Tone: Persuasive Executive</option>
          <option value="technical" ${articleTone === 'technical' ? 'selected' : ''}>Tone: Technical Deep-Dive</option>
          <option value="narrative" ${articleTone === 'narrative' ? 'selected' : ''}>Tone: Narrative Rhythm</option>
        </select>
        <button class="btn btn-primary" style="font-size:0.75rem;padding:4px 12px" onclick="saveArticleFromStudio()">Save & Mirror to OneDrive</button>
      </div>

      <div class="art-studio-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:0.85rem">
        <!-- Editor Left Column -->
        <div style="display:flex;flex-direction:column;gap:0.5rem">
          <div style="display:flex;align-items:center;justify-content:space-between;font-size:0.72rem;color:var(--text-3)">
            <span>Editor (Markdown)</span>
            <span>${words} words · ~${readTime} min read</span>
          </div>
          <textarea id="art-editor-text" class="input" style="font-family:var(--font-mono);font-size:0.84rem;line-height:1.6;height:520px;resize:vertical"
                    placeholder="Write article in Markdown..." oninput="onArticleEditorInput(this.value)">${escHtml(articleEditorText)}</textarea>
        </div>

        <!-- Preview & AI Workbench Right Column -->
        <div style="display:flex;flex-direction:column;gap:0.5rem">
          <div style="display:flex;gap:0.4rem;align-items:center">
            <button class="task-tab${articleStudioSubTab === 'preview' ? ' on' : ''}" onclick="articleStudioSubTab='preview';repaintView('articles')">Live Preview</button>
            <button class="task-tab${articleStudioSubTab === 'ai' ? ' on' : ''}" onclick="articleStudioSubTab='ai';repaintView('articles')">AI Co-Writer Workbench</button>
            <button class="task-tab${articleStudioSubTab === 'seo' ? ' on' : ''}" onclick="articleStudioSubTab='seo';repaintView('articles')">SEO & Keywords</button>
          </div>

          ${articleStudioSubTab === 'preview' ? `
            <div id="art-live-preview" class="lesson-body" style="background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--r-md);padding:1rem;height:520px;overflow-y:auto">
              ${window.marked ? marked.parse(articleEditorText || '*No content yet. Start typing in the editor or generate a draft with AI.*') : escHtml(articleEditorText)}
            </div>`
          : articleStudioSubTab === 'ai' ? `
            <div class="art-ai-workbench" style="background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--r-md);padding:1rem;height:520px;overflow-y:auto;display:flex;flex-direction:column;gap:0.7rem">
              <div style="font-weight:600;font-size:0.85rem;color:var(--text)">AI Co-Writer & Refinement Tools</div>
              <div style="display:flex;flex-direction:column;gap:0.4rem">
                <label style="font-size:0.72rem;color:var(--text-3)">Article Brief / Prompt for AI Draft:</label>
                <textarea id="art-ai-prompt" class="input" rows="3" style="font-size:0.78rem" placeholder="E.g. Write an essay on systems architecture and regenerative governance for WCDS..."></textarea>
                <button class="btn btn-primary" style="font-size:0.75rem;padding:4px 10px" onclick="runAiArticleAction('draft', this)">Generate Draft</button>
              </div>

              <hr style="border:0;border-top:1px solid var(--border);margin:0.2rem 0"/>

              <div style="font-size:0.75rem;color:var(--text-3)">Refining Current Text:</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem">
                <button class="btn btn-ghost" style="font-size:0.72rem;padding:5px 8px;text-align:left" onclick="runAiArticleAction('polish', this)">✨ Polish & Improve Flow</button>
                <button class="btn btn-ghost" style="font-size:0.72rem;padding:5px 8px;text-align:left" onclick="runAiArticleAction('enforce_register', this)">📏 Enforce Deadpan Voice</button>
                <button class="btn btn-ghost" style="font-size:0.72rem;padding:5px 8px;text-align:left" onclick="runAiArticleAction('expand', this)">➕ Expand Current Text</button>
                <button class="btn btn-ghost" style="font-size:0.72rem;padding:5px 8px;text-align:left" onclick="runAiArticleAction('summarize', this)">📌 Executive Summary</button>
              </div>

              <div id="art-ai-result" class="hidden" style="margin-top:0.5rem;background:var(--bg);padding:0.6rem;border-radius:var(--r-sm);font-size:0.75rem"></div>
            </div>`
          : `
            <div class="art-seo-pane" style="background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--r-md);padding:1rem;height:520px;overflow-y:auto">
              <button class="btn btn-ghost" style="font-size:0.75rem;padding:4px 10px;margin-bottom:0.8rem" onclick="runAiArticleAction('seo', this)">Run SEO & Outline Analysis</button>
              <div id="art-seo-result" style="font-size:0.8rem;line-height:1.6;color:var(--text-2)">Click the button above to generate optimized H1/H2 headers, meta descriptions, and keyword analysis.</div>
            </div>`}
        </div>
      </div>
    </div>`;
}

function setArticleStudioTab(tab) { articleStudioTab = tab; repaintView('articles'); }
function setArticleFilterStatus(s) { articleFilterStatus = s; repaintView('articles'); }
function searchArticles(q) { articleSearchQuery = q; repaintView('articles'); }

function createNewArticle() {
  articleActiveFile = null;
  articleActiveTitle = 'Untitled Article';
  articleEditorText = '# Untitled Article\n\nWrite article text here...';
  articleStatus = 'drafting';
  articleStudioTab = 'studio';
  repaintView('articles');
}

async function openArticleInStudio(relFile) {
  articleActiveFile = relFile;
  try {
    const r = await fetch(`/api/documents/raw?path=${encodeURIComponent(relFile)}`);
    const d = await r.json();
    articleEditorText = d.raw || '';
    const m = articleEditorText.match(/^#+\s*(.+)$/m);
    articleActiveTitle = m ? m[1].trim() : relFile.split('/').pop().replace(/\.\w+$/, '');
  } catch (e) {
    showToast('Failed to load article content', 'error');
  }
  articleStudioTab = 'studio';
  repaintView('articles');
}

function onArticleEditorInput(text) {
  articleEditorText = text;
  const prev = document.getElementById('art-live-preview');
  if (prev && window.marked) {
    prev.innerHTML = marked.parse(text || '');
  }
}

async function saveArticleFromStudio() {
  let fileRel = articleActiveFile;
  if (!fileRel) {
    const cleanTitle = (articleActiveTitle || 'article').toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
    const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
    fileRel = `Sconl/Core/Axial/Creator/Author/author-nonfiction/articles/${dateStr}_${cleanTitle}.md`;
    articleActiveFile = fileRel;
  }

  showToast('Saving and mirroring to OneDrive…', 'info');
  try {
    const r = await fetch('/api/documents/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: fileRel, content: articleEditorText })
    });
    const d = await r.json();
    if (!d.success) throw new Error(d.error || 'Failed to save article');
    showToast('Saved & mirrored to OneDrive', 'success');
    await loadArticles(true);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function runAiArticleAction(action, btn) {
  const was = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
  const promptEl = document.getElementById('art-ai-prompt');
  const prompt = promptEl ? promptEl.value : '';

  try {
    const r = await fetch('/api/articles/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action, prompt, text: articleEditorText,
        title: articleActiveTitle, tone: articleTone
      })
    });
    const d = await r.json();
    if (!d.success) throw new Error(d.error || 'AI Action failed');

    if (action === 'draft') {
      articleEditorText = d.text || '';
      repaintView('articles');
      showToast('Article draft generated!', 'success');
    } else if (action === 'polish' || action === 'enforce_register' || action === 'expand') {
      articleEditorText = d.text || '';
      repaintView('articles');
      showToast('Article updated with AI output!', 'success');
    } else {
      const resEl = document.getElementById(action === 'seo' ? 'art-seo-result' : 'art-ai-result');
      if (resEl) {
        resEl.classList.remove('hidden');
        resEl.innerHTML = window.marked ? marked.parse(d.text || '') : escHtml(d.text || '');
      }
      showToast('Analysis completed!', 'success');
    }
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = was; }
  }
}

// ── CHAT GREETING ─────────────────────────────────────────────────────────────
/**
 * Built from live service state, never hardcoded.
 *
 * The old greeting was static markup that had drifted away from reality: it
 * announced Anthropic Claude 3.5 Sonnet as Active when no Anthropic key worked
 * and that model had been retired, and told you to connect Microsoft 365 while
 * M365 was connected. A status line that lies is worse than no status line.
 *
 * Short on purpose. Only what is answering, and only what is genuinely missing.
 */
/**
 * Greeting, generated fresh each load from live state.
 *
 * The old one was static markup that had drifted into stating things that were not
 * true - it announced Anthropic Claude 3.5 Sonnet as Active when no Anthropic key
 * worked and that model had been retired, and told Operator to connect Microsoft 365
 * while M365 was connected. A status line that lies is worse than none.
 *
 * Now it looks at what is actually happening, picks the single most notable thing,
 * and says it in one short line. Phrasings are varied so it is not the same
 * sentence every morning. Deliberately no model involved: a greeting that takes
 * five minutes to load is not a greeting.
 */
function renderChatGreeting() {
  const host = document.getElementById('chat-rail-messages');
  if (!host) return;

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const s  = STATE.services || {};
  const jc = s.jiraConfig || {};
  const tasks  = STATE.tasks || [];
  const issues = STATE.jiraIssues || [];
  const events = STATE.calendarEvents || [];
  const ctx = STATE.time || {};

  const today = new Date().toISOString().slice(0, 10);
  const hour  = new Date().getHours();
  const part  = hour < 5 ? 'Late one' : hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';

  const open     = tasks.filter(t => t.STATUS !== 'done');
  const overdue  = open.filter(t => t.DUE_DATE && t.DUE_DATE !== '-' && t.DUE_DATE < today);
  const dueToday = open.filter(t => t.DUE_DATE === today);
  const highs    = open.filter(t => t.PRIORITY === 'high');
  const unassigned = issues.filter(i => !i.assignee);
  const todayEvents = events.filter(e => e.date === today);
  const n = (c, one, many) => `${c} ${c === 1 ? one : many}`;

  // Candidate observations, most consequential first. Each carries several
  // phrasings so a repeated state does not produce a repeated sentence.
  const candidates = [];

  if (!s.gemini && !s.groq && !s.anthropic && s.ollama !== 'connected') {
    candidates.push({ w: 100, lines: [
      'No model is reachable, so I am running on canned replies and good manners.',
      'Every model is unreachable. I can still fetch and file; I just cannot think.',
    ]});
  }
  if (overdue.length) {
    // Name the actual work while it fits in a line - a count is a mood, a
    // title is a next action.
    const names = overdue.slice(0, 2).map(t =>
      (t.TITLE || '').length > 44 ? (t.TITLE || '').slice(0, 44) + '…' : (t.TITLE || ''));
    candidates.push({ w: 90, lines: [
      `${n(overdue.length, 'task is', 'tasks are')} past due${names.length
        ? ` - ${names.join('; ')}${overdue.length > 2 ? ` and ${overdue.length - 2} more` : ''}` : ''}.`,
      `${n(overdue.length, 'task', 'tasks')} overdue. The oldest one is the one to clear first.`,
    ]});
  }
  if (dueToday.length) {
    candidates.push({ w: 70, lines: [
      `${n(dueToday.length, 'task is', 'tasks are')} due today.`,
      `${n(dueToday.length, 'thing', 'things')} lands today. No pressure, some pressure.`,
    ]});
  }
  if (todayEvents.length) {
    const first = todayEvents.sort((a, b) => (a.time || '').localeCompare(b.time || ''))[0];
    candidates.push({ w: 65, lines: [
      `${n(todayEvents.length, 'event', 'events')} today${first?.time ? `, first at ${first.time}` : ''}.`,
      `Calendar says ${n(todayEvents.length, 'event', 'events')} today${first?.title ? `, starting with ${first.title}` : ''}.`,
    ]});
  }
  if (unassigned.length && unassigned.length === issues.length && issues.length) {
    candidates.push({ w: 55, lines: [
      `All ${issues.length} ${jc.projectKey || 'Jira'} issues are unassigned. The board is currently a suggestion box.`,
      `${issues.length} issues, nobody assigned to any of them. Bold strategy.`,
    ]});
  } else if (unassigned.length) {
    candidates.push({ w: 45, lines: [
      `${n(unassigned.length, 'issue has', 'issues have')} no assignee.`,
    ]});
  }
  if (highs.length >= 3) {
    candidates.push({ w: 40, lines: [
      `${highs.length} tasks are marked high priority, which is a way of marking none of them.`,
      `${highs.length} high-priority items. At some point that word stops working.`,
    ]});
  }
  if (!jc.host) {
    candidates.push({ w: 35, lines: ['Jira is not configured, so that half of the console is decorative.'] });
  }

  // Nothing pressing is itself worth saying, and worth saying lightly.
  if (!candidates.length) {
    candidates.push({ w: 10, lines: [
      'Nothing overdue and nothing on fire. Suspicious, but I will take it.',
      'Board is clear. Enjoy it before something arrives.',
      'No due dates in arrears. A rare and fragile condition.',
    ]});
  }

  const top = candidates.sort((a, b) => b.w - a.w)[0];
  const headline = pick(top.lines);

  // A quiet second line: the live numbers and what is answering. Ordered the
  // way the router actually answers (groq first), so the label never lies.
  // The cycle position deliberately is not repeated here - the header owns it.
  const engine =
    s.groq      === 'connected' ? 'Groq'
  : s.gemini    === 'connected' ? 'Gemini'
  : s.anthropic === 'connected' ? 'Claude'
  : s.ollama    === 'connected' ? (s.ollamaModel || 'local model')
  : null;
  const bits = [];
  if (open.length) bits.push(`${open.length} open task${open.length === 1 ? '' : 's'}`);
  if (issues.length) bits.push(`${issues.length} on the ${jc.projectKey ? jc.projectKey + ' ' : ''}board`);
  if (engine) bits.push(`answered by ${engine}`);

  host.innerHTML = `
    <div class="chat-msg agent">
      <div class="msg-role">iSconl</div>
      <div class="greet-line">${part}, Architect. ${escHtml(headline)}</div>
      ${bits.length ? `<div class="greet-meta">${escHtml(bits.join(' · '))}</div>` : ''}
    </div>`;
}

// ── TASK DETAIL ───────────────────────────────────────────────────────────────
// One screen holding everything known about a single task, rather than a modal:
// there is too much here to sit over the top of something else, and a screen gets
// a URL, which is what makes the back button work.

let taskDetailId = null;
let taskDetail   = null;   // { task, origin, effort, tools, career, prompt, brief, draft }
let briefPending = false;
let draftPending = false;
let draftChannel = null;   // user override of the inferred channel
let draftTo      = null;   // user override of the inferred recipient

async function openTask(taskId) {
  taskDetailId = taskId;
  taskDetail = null;
  draftChannel = null;
  draftTo = null;
  jiraPanel = null;
  taskDocs = null;
  docsOpen = {};
  navigate('task', { taskId });
  try {
    const r = await fetch(`/api/tasks/detail?taskId=${encodeURIComponent(taskId)}`);
    if (!r.ok) { showToast('Task not found', 'error'); return; }
    taskDetail = await r.json();
  } catch (e) { showToast(e.message, 'error'); }
  repaintTask();
  // After paint, not with it - the walk plus a .docx inflate is quick but the rest
  // of the screen has no reason to wait for it.
  fetchTaskDocs(taskId);
}

function renderTaskView() {
  if (!taskDetail) {
    return `<div class="card"><div class="empty-state">Loading task…</div></div>`;
  }
  const { task: t, origin, effort, tools, prompt, brief, career, draft, tags } = taskDetail;
  const due = t.DUE_DATE && t.DUE_DATE !== '-' ? t.DUE_DATE : '';
  const jk  = t.JIRA_KEY && t.JIRA_KEY !== '-' ? t.JIRA_KEY : '';
  const tagId = t.TAG && t.TAG !== '-' ? t.TAG : '';
  const jc  = STATE.services?.jiraConfig || {};
  const opt = (v, cur) => `<option value="${v}"${v === cur ? ' selected' : ''}>${v}</option>`;

  return `
    <div class="task-detail-head">
      <button class="btn btn-ghost back-btn" onclick="goBack()" title="Back">← Back</button>
      <div class="task-detail-crumb">Tasks / <span>${escHtml(t.ID)}</span></div>
    </div>

    <div class="card task-hero">
      <div class="task-hero-title" id="task-detail-title" title="Click to edit"
           onclick="beginEditDetailTitle()">${escHtml(t.TITLE)}</div>
      <div class="task-hero-controls" style="display:flex;align-items:flex-end;gap:0.45rem;flex-wrap:nowrap;overflow-x:auto;width:100%;padding-bottom:2px">
        <label style="flex-shrink:0"><span style="font-size:0.62rem;text-transform:uppercase;color:var(--text-3);letter-spacing:0.06em">Urgency</span>
          <select class="task-select prio-${escHtml(t.PRIORITY)}" style="font-size:0.72rem;padding:2px 18px 2px 6px"
                  onchange="detailUpdate({priority:this.value},this)">
            ${['high','medium','low'].map(p => opt(p, t.PRIORITY)).join('')}
          </select></label>
        <label style="flex-shrink:0"><span style="font-size:0.62rem;text-transform:uppercase;color:var(--text-3);letter-spacing:0.06em">Status</span>
          <select class="task-select st-${escHtml(t.STATUS)}" style="font-size:0.72rem;padding:2px 18px 2px 6px"
                  onchange="detailUpdate({status:this.value},this)">
            ${['today','next','waiting','review','done'].map(s => opt(s, t.STATUS)).join('')}
          </select></label>
        <label style="flex-shrink:0"><span style="font-size:0.62rem;text-transform:uppercase;color:var(--text-3);letter-spacing:0.06em">Due</span>
          <input type="date" class="task-select" style="font-size:0.72rem;padding:2px 4px" value="${escHtml(due)}"
                 onchange="detailUpdate({due_date:this.value},this)"/></label>
        <label style="flex-shrink:0">
          <div style="display:flex;align-items:center;gap:0.3rem">
            <span style="font-size:0.62rem;text-transform:uppercase;color:var(--text-3);letter-spacing:0.06em">Tag</span>
            <span style="font-size:0.6rem;cursor:pointer;color:var(--green);font-weight:600" onclick="openTagManager()" title="Add or edit tags">+ Edit</span>
          </div>
          <select class="task-select tag-select tag-${escHtml(tagId || 'none')}" style="font-size:0.72rem;padding:2px 18px 2px 6px;max-width:130px"
                  onchange="detailUpdate({tag:this.value},this)">
            <option value=""${tagId ? '' : ' selected'}>untagged</option>
            ${(tags || []).map(tg => `<option value="${escHtml(tg.id)}"${tg.id === tagId ? ' selected' : ''}>${escHtml(tg.label)}</option>`).join('')}
          </select>
        </label>
        <button class="btn ${t.STATUS === 'done' ? 'btn-ghost' : 'btn-primary'}"
                style="font-size:0.72rem;padding:2px 8px;background:${t.STATUS === 'done' ? 'var(--surface)' : 'var(--green)'};color:#fff;border-radius:5px;height:28px;align-self:flex-end;flex-shrink:0"
                onclick="detailUpdate({status:'done'},this)">
          ${t.STATUS === 'done' ? '✓ Completed' : '✓ Mark as Done'}
        </button>
        <div class="task-hero-actions" style="margin-left:auto;display:flex;gap:0.35rem;align-items:center;flex-shrink:0">
          ${jk ? `<a class="btn btn-ghost" style="font-size:0.7rem;padding:2px 8px" href="https://${escHtml(jc.host || '')}/browse/${escHtml(jk)}"
                     target="_blank" rel="noreferrer">${escHtml(jk)} in Jira ↗</a>`
                : ''}
          <button class="btn btn-ghost danger-btn" style="font-size:0.7rem;padding:2px 8px" onclick="detailDelete()">Delete</button>
        </div>
      </div>
    </div>

    ${(t.WHY && t.WHY !== '-') || (t.RESOLUTION && t.RESOLUTION !== '-') ? `
    <div class="card task-why-card">
      ${t.WHY && t.WHY !== '-' ? `
        <div class="task-why"><span class="task-why-label">Why this task exists</span>
          <div class="task-why-text">${escHtml(t.WHY)}</div></div>` : ''}
      ${t.RESOLUTION && t.RESOLUTION !== '-' ? `
        <div class="task-why" style="margin-top:0.6rem"><span class="task-why-label">Why it was closed</span>
          <div class="task-why-text">${escHtml(t.RESOLUTION)}</div></div>` : ''}
    </div>` : ''}

    ${renderJiraCard(t, jk, tags)}

    <div class="card">
      <div class="card-header">
        <span class="card-title">What this actually is</span>
        <div style="display:flex;gap:0.4rem;align-items:center">
          ${brief?.grounded ? `<span class="ctx-badge" title="Written with the power map, decisions and risks loaded">grounded</span>` : ''}
          ${brief ? `<span class="card-meta">${escHtml((brief.generatedAt || '').slice(0,10))}</span>` : ''}
          <button class="btn ${brief ? 'btn-ghost' : 'btn-primary'}" id="brief-btn"
                  style="font-size:0.72rem;padding:3px 10px" onclick="generateBrief(${brief ? 'true' : 'false'})">
            ${brief ? 'Regenerate' : 'Explain this task'}
          </button>
        </div>
      </div>
      <div id="brief-body">${renderBriefBody(brief)}</div>
    </div>

    ${renderDocsCard()}
    ${renderDraftCard(career, draft)}
    ${renderPeopleCard(career)}
    ${renderGovernsCard(career)}

    <div class="grid-2 task-detail-grid">
      <div class="card">
        <div class="card-header"><span class="card-title">Where this came from</span></div>
        <div class="kv-rows">
          <div><span>Origin</span>${escHtml(origin.label)}</div>
          ${origin.detail  ? `<div><span>Source</span>${escHtml(origin.detail)}</div>` : ''}
          ${origin.created ? `<div><span>Created</span>${escHtml(origin.created)}</div>` : ''}
          ${origin.project ? `<div><span>Project</span>${escHtml(origin.project)}</div>` : ''}
          <div><span>Jira</span>${jk ? escHtml(jk) : 'not linked'}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Time</span>
          <span class="card-meta">${escHtml(effort.range)}</span>
        </div>
        <div class="effort-line">${escHtml(effort.sitting)}</div>
        <div class="effort-why">
          <div class="effort-why-label">How that was reached</div>
          <ul>${effort.factors.map(f => `<li>${escHtml(f)}</li>`).join('')}</ul>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Tools you will need</span></div>
      <div class="tool-chips">
        ${tools.map(tool => tool.view
          ? `<button class="tool-chip" onclick="navigate('${escHtml(tool.view)}')">${escHtml(tool.label)} →</button>`
          : `<span class="tool-chip inert">${escHtml(tool.label)}</span>`).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">Prompt for an assistant</span>
        <button class="btn btn-ghost" style="font-size:0.72rem;padding:3px 10px"
                onclick="copyTaskPrompt(this)">Copy</button>
      </div>
      <div class="prompt-hint">Self-contained, so it works pasted anywhere. Your private context is deliberately
        left out … this one is safe to hand to a cloud tool.</div>
      <pre class="prompt-block" id="task-prompt">${escHtml(prompt)}</pre>
    </div>`;
}

/**
 * The Jira gate.
 *
 * Nothing reaches the live board from a single button any more. Issues cannot be
 * deleted from this project - only transitioned to Done - so a push is permanent
 * and visible to everyone. The panel shows the exact issue, names what is still
 * missing, and refuses until it is complete.
 *
 * Once pushed, the same card becomes the place to move the date or the owner,
 * because those are the two things that actually change afterwards.
 */
function renderJiraCard(t, jk, tags) {
  if (jk) {
    const jc = STATE.services?.jiraConfig || {};
    const due = t.DUE_DATE && t.DUE_DATE !== '-' ? t.DUE_DATE : '';
    return `
      <div class="card jira-card">
        <div class="card-header">
          <span class="card-title">On the board</span>
          <a class="jira-key" href="https://${escHtml(jc.host || '')}/browse/${escHtml(jk)}"
             target="_blank" rel="noreferrer">${escHtml(jk)}</a>
        </div>
        <div class="jira-live">
          <label>Due
            <input type="date" class="task-select" value="${escHtml(due)}"
                   onchange="jiraReschedule({duedate:this.value},this)"/></label>
          <label>Owner
            <select class="task-select" id="jira-live-assignee"
                    onchange="jiraReschedule({assignee:this.value},this)">
              <option value="">loading…</option>
            </select></label>
        </div>
        <div class="jira-live-note">Changes here write straight to Jira and to the local board.</div>
      </div>`;
  }

  const p = jiraPanel;
  if (!p) {
    return `
      <div class="card jira-card">
        <div class="card-header"><span class="card-title">Jira</span></div>
        <div class="jira-idle">
          <div>Not on the board.</div>
          <button class="btn btn-primary" style="font-size:0.72rem;padding:3px 10px"
                  onclick="openJiraReview()">Review for Jira</button>
        </div>
      </div>`;
  }

  if (p.loading) {
    return `<div class="card jira-card"><div class="card-header"><span class="card-title">Jira</span></div>
      <div class="brief-pending"><div class="spinner-inline"></div><div>${escHtml(p.loadingNote || 'Preparing the issue…')}</div></div></div>`;
  }

  const e = p.edits;
  const failing = (p.ready || []).filter(c => !c.ok);
  const tagOpts = (tags || p.tags || []);

  return `
    <div class="card jira-card">
      <div class="card-header">
        <span class="card-title">Review for Jira</span>
        <div style="display:flex;gap:0.4rem;align-items:center">
          ${p.project ? `<span class="card-meta">${escHtml(p.project)}</span>` : ''}
          <button class="btn btn-ghost" style="font-size:0.72rem;padding:3px 10px"
                  onclick="composeJira(this)">Compose</button>
        </div>
      </div>

      ${p.canDelete === false ? `
        <div class="jira-permanent">
          Issues cannot be deleted from this project. Anything pushed stays on the board,
          so it is checked before it goes.
        </div>` : ''}

      <div class="jira-field">
        <label>Summary</label>
        <input type="text" class="jira-input" id="jira-summary" value="${escHtml(e.summary)}"
               oninput="jiraEdit('summary', this.value)" placeholder="Start with a verb, name the outcome"/>
      </div>

      <div class="jira-field">
        <label>Description</label>
        <textarea class="jira-input jira-textarea" id="jira-description" rows="7"
                  oninput="jiraEdit('description', this.value)"
                  placeholder="Context, then Done when, then Notes. Compose writes this from the explanation.">${escHtml(e.description)}</textarea>
      </div>

      <div class="jira-row">
        <div class="jira-field">
          <label>Due</label>
          <input type="date" class="jira-input" value="${escHtml(e.duedate)}"
                 oninput="jiraEdit('duedate', this.value)"/>
        </div>
        <div class="jira-field">
          <label>Tag</label>
          <select class="jira-input" onchange="jiraEdit('tag', this.value)">
            <option value="">untagged</option>
            ${tagOpts.map(tg => `<option value="${escHtml(tg.id)}"${tg.id === e.tag ? ' selected' : ''}>${escHtml(tg.label)}</option>`).join('')}
          </select>
        </div>
        <div class="jira-field">
          <label>Owner</label>
          <select class="jira-input" onchange="jiraEdit('assignee', this.value)">
            <option value="">unassigned</option>
            ${(p.users || []).map(u => `<option value="${escHtml(u.accountId)}"${u.accountId === e.assignee ? ' selected' : ''}>${escHtml(u.displayName)}</option>`).join('')}
          </select>
        </div>
      </div>

      ${p.checks?.length ? `
        <div class="draft-checks">
          <div class="draft-checks-label">Check before pushing</div>
          ${p.checks.map(c => `<div class="draft-check"><code>${escHtml(c.found)}</code><span>${escHtml(c.say)}</span></div>`).join('')}
        </div>` : ''}

      <div class="jira-ready">
        ${(p.ready || []).map(c => `
          <div class="jira-ready-row ${c.ok ? 'ok' : 'no'}">
            <span class="jira-ready-mark">${c.ok ? '✓' : '·'}</span>
            <span class="jira-ready-label">${escHtml(c.label)}</span>
            ${c.ok ? '' : `<span class="jira-ready-hint">${escHtml(c.hint)}</span>`}
          </div>`).join('')}
      </div>

      <div class="jira-actions">
        <button class="btn btn-primary" id="jira-create-btn"
                style="font-size:0.72rem;padding:4px 12px"
                ${failing.length ? 'disabled' : ''}
                onclick="pushJira(false, this)">
          ${failing.length ? `${failing.length} thing${failing.length > 1 ? 's' : ''} missing` : 'Create in Jira'}
        </button>
        <button class="btn btn-ghost" style="font-size:0.72rem;padding:4px 10px"
                onclick="closeJiraReview()">Cancel</button>
        ${failing.length ? `
          <button class="btn btn-ghost jira-override" style="font-size:0.68rem;padding:4px 10px"
                  onclick="pushJira(true, this)">Push anyway</button>` : ''}
      </div>
    </div>`;
}

/**
 * The paper trail - the deliverables, first-class.
 *
 * For half these tasks the drafted document IS the deliverable, so this card is
 * the centre of the task screen, not an appendix. It shows three things in one
 * place, and it never shows nothing:
 *   - the files: linked ones as certainties, discovered ones as labelled guesses,
 *     each readable in place and each with every way of getting at it - open at
 *     the desk, download in the browser (works on the phone), the OneDrive copy,
 *     and a share link for handing it to a colleague
 *   - the covering note: the words that travel with the files, always resolved -
 *     an authored note file wins, else the drafted message, else an honest
 *     compose from the record
 *   - the gaps: dead links and files not yet on OneDrive, said out loud
 *
 * Loaded after the view paints, because walking the work folders and inflating a
 * .docx is fast but not free, and the rest of the screen should not wait on it.
 */
let taskDocs = null;      // null = not fetched; else the /api/tasks/deliverables bag
let docsOpen = {};        // rel -> expanded
let docsFull = {};        // rel -> full rendered text (fetched on View)
let taskDocsSource = 'local';

const fmtKb = (b) => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

function paperDocRow(d) {
  const key = d.rel || d.path || d.name;
  const open = docsOpen[key];
  const full = docsFull[key];
  const text = full || d.preview?.text;
  const hasBody = Boolean(text) || (d.kind === 'image' && d.dataUri);
  const cloud = d.onedrive === false
    ? '<span class="doc-cloud warn">not on OneDrive yet</span>'
    : d.stale ? '<span class="doc-cloud warn">OneDrive copy is behind</span>'
    : d.onedrive ? '<span class="doc-cloud">on OneDrive</span>' : '';

  return `
    <div class="doc ${open ? 'open' : ''} ${d.source === 'found' ? 'is-guess' : ''}">
      <!-- On desktop the row opens the reader dock - the document, rendered
           properly, beside the work. The small read/hide toggle keeps the
           inline preview for when he wants the text in the flow of the page,
           and it is the whole behavior on a phone, where there is no rail. -->
      <div class="doc-head" onclick="docRowOpen('${escAttr(key)}')">
        <span class="doc-ext doc-${escHtml((d.ext || '').replace('.', '') || 'file')}">${escHtml((d.ext || '').replace('.', '') || '?')}</span>
        <div class="doc-meta">
          <div class="doc-name">${escHtml(d.name)}</div>
          <div class="doc-sub">
            <span class="doc-badge ${d.source === 'linked' ? 'sure' : 'guess'}">${d.source === 'linked' ? 'attached' : 'best guess'}</span>
            ${d.role === 'note' ? '<span class="doc-badge note">covering note</span>' : ''}
            ${d.bytes ? escHtml(fmtKb(d.bytes)) : ''}${d.modified ? ` · ${escHtml(d.modified)}` : ''}
            ${d.preview?.words ? ` · ${d.preview.words} words` : ''}
            ${d.previewFrom ? ` · previewed from ${escHtml(d.previewFrom)}` : ''}
            ${cloud}
          </div>
        </div>
        ${hasBody ? `<span class="doc-toggle" onclick="event.stopPropagation();toggleDoc('${escAttr(key)}')">${open ? 'hide' : 'read'}</span>` : ''}
      </div>

      ${open && d.kind === 'image' && d.dataUri
        ? `<img class="doc-image" src="${d.dataUri}" alt="${escHtml(d.name)}"/>` : ''}
      ${open && text
        ? `<pre class="doc-text">${escHtml(text)}${!full && d.preview?.truncated ? '\n\n[…preview - Read all shows the rest]' : ''}</pre>` : ''}
      ${d.note && !text ? `<div class="doc-note">${escHtml(d.note)}</div>` : ''}

      ${open ? `<div class="doc-actions">
        ${!full && d.preview?.truncated ? `<button class="btn btn-ghost doc-act" onclick="readAllDocument('${escAttr(key)}', this)">Read all</button>` : ''}
        ${d.rel ? `<button class="btn btn-ghost doc-act" onclick="openDocument('${escAttr(d.rel)}', this)">Open here</button>` : ''}
        ${d.rel ? `<button class="btn btn-ghost doc-act" onclick="downloadDocument('${escAttr(d.rel)}', '${escAttr(d.name)}', this)">Download</button>` : ''}
        ${d.rel ? `<button class="btn btn-ghost doc-act" title="Upload your edited copy over this one - the previous version is kept, and OneDrive follows immediately"
             onclick="replaceDocument('${escAttr(d.rel)}', this)">Replace</button>` : ''}
        ${d.rel && /\.md$/i.test(d.name) ? `<button class="btn btn-ghost doc-act" title="Regenerate the .docx beside this markdown so the Word copy matches what you edited"
             onclick="rebuildTwin('${escAttr(d.rel)}', this)">Rebuild Word twin</button>` : ''}
        ${d.rel && (d.onedrive === false || d.stale) ? `<button class="btn btn-ghost doc-act" title="Send this file to OneDrive now rather than waiting for the hourly pass"
             onclick="pushDocument('${escAttr(d.rel)}', this)">Push to OneDrive</button>` : ''}
        ${d.webUrl ? `<a class="btn btn-ghost doc-act" href="${escAttr(d.webUrl)}" target="_blank" rel="noreferrer"
             title="The OneDrive copy - opens on your phone too">OneDrive ↗</a>` : ''}
        ${d.rel && d.onedrive ? `<button class="btn btn-ghost doc-act" onclick="shareDocument('${escAttr(d.rel)}', this)"
             title="Copy a view link anyone can open">Share link</button>` : ''}
      </div>` : ''}
    </div>`;
}

/**
 * Live sourcing progress for the hero-image job, counted from the disk - a
 * directory listing cannot go stale or flatter. Shown only on tasks that link
 * hero-images, polled gently while the fleets run, silent once the count is
 * full. Green fill, amber while short, per the meter language everywhere else.
 */
let imgProgress = null;
let imgProgressTimer = null;
async function fetchImageProgress() {
  try { imgProgress = await (await fetch('/api/images/progress')).json(); }
  catch { imgProgress = null; }
  const el = document.getElementById('img-progress');
  if (el && imgProgress) el.outerHTML = renderImageProgress();
  clearTimeout(imgProgressTimer);
  if (imgProgress && !imgProgress.done && currentView === 'task') {
    imgProgressTimer = setTimeout(fetchImageProgress, 20_000);
  }
}
function renderImageProgress() {
  const p = imgProgress;
  if (!p) return '<span id="img-progress"></span>';
  const pct = Math.round((p.have / p.want) * 100);
  const short = p.sites.filter(s => s.have < s.expected);
  // Per-slot truth in the tooltip: which slot of which site is still empty,
  // never a lump per site that a lucky over-delivery could flatter.
  const detail = p.sites.map(s => `${s.site} ${s.have}/${s.expected}`
    + (s.have < s.expected ? ` (missing: ${s.slots.filter(x => x.count < 3).map(x => `${x.slot} ${x.count}/3`).join(', ')})` : '')).join('\n');
  return `
    <div id="img-progress" class="img-progress" title="${escAttr(detail)}">
      <div class="img-progress-line">
        <span>Image sourcing: <strong>${p.have} of ${p.want}</strong> verified on disk${p.done ? ' - complete' : ' - fleets running'}</span>
        <span class="card-meta">${pct}% · ${p.mb} MB</span>
      </div>
      <div class="eq-meter-bar"><div class="tone-${p.done ? 'green' : 'amber'}" style="width:${pct}%"></div></div>
      ${!p.done ? `<div class="img-progress-short">
        still sourcing: ${escHtml(short.map(s => `${s.site} (${s.expected - s.have} short)`).join(', '))}
        <button class="btn btn-ghost doc-act" style="margin-left:0.4rem"
          title="Zip everything sourced so far - no need to wait for the fleets"
          onclick="packageImagesNow(this)">Download what is ready</button>
      </div>` : ''}
    </div>`;
}

/** Hand over what exists now: compute already spent is value already earned. */
async function packageImagesNow(btn) {
  const was = btn.textContent;
  btn.disabled = true; btn.textContent = 'Packaging…';
  try {
    const d = await (await fetch('/api/images/package', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
    if (!d.success) throw new Error(d.error || 'refused');
    showToast(`${d.images} images packaged (${d.mb} MB) - downloading now`, 'success');
    await downloadDocument(d.rel, d.name, btn);
  } catch (e) { showToast(e.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = was; }
}

function renderDocsCard() {
  if (taskDocs === null) {
    return `<div class="card"><div class="card-header"><span class="card-title">Deliverables</span></div>
      <div class="empty-state" style="text-align:left;padding:0.4rem 0">Gathering the files…</div></div>`;
  }
  const bag = taskDocs;
  const linked  = (bag.all || []).filter(d => d.source === 'linked');
  const guesses = (bag.all || []).filter(d => d.source === 'found');
  const note = bag.note;
  const t = taskDetail?.task || {};
  const dstate = bag.delivery?.state && bag.delivery.state !== '-' ? bag.delivery.state : null;

  const noteSource = note
    ? (note.source === 'file' ? `your file · ${escHtml(note.name || '')}`
      : note.source === 'draft' ? `drafted${note.to ? ` for ${escHtml(note.to)}` : ''}${note.channel ? ` · ${escHtml(note.channel)}` : ''}`
      : 'composed from the record - no model, only facts on the row')
    : '';

  // The hero-image job gets its live counter on the tasks that carry it.
  const isImageTask = (bag.all || []).some(d => /hero-images|hero_candidates/i.test(d.rel || d.name || ''));
  if (isImageTask && imgProgress === null) fetchImageProgress();

  return `
    <div class="card paper-card">
      <div class="card-header">
        <span class="card-title">Deliverables</span>
        <div style="display:flex;gap:0.4rem;align-items:center">
          ${dstate ? `<span class="deliver-chip d-${escHtml(dstate)}">${escHtml(dstate)}</span>` : ''}
          <span class="card-meta">${linked.length} attached${guesses.length ? ` · ${guesses.length} found` : ''}</span>
        </div>
      </div>
      ${isImageTask ? renderImageProgress() : ''}

      ${linked.length ? `<div class="doc-list">${linked.map(paperDocRow).join('')}</div>`
        : `<div class="paper-empty">
             Nothing attached yet - and this task deserves a paper trail.
             <button class="btn btn-primary doc-act" onclick="provisionDeliverable(this)">Create the work record</button>
             <button class="btn btn-ghost doc-act" onclick="deliveryRelink(this)">Relink the board</button>
           </div>`}

      ${bag.dead?.length ? `<div class="doc-dead">⚠ ${bag.dead.length} linked file${bag.dead.length > 1 ? 's' : ''} no longer on disk:
        ${bag.dead.map(x => `<code>${escHtml(x)}</code>`).join(' ')}
        <button class="btn btn-ghost doc-act" onclick="deliveryRelink(this)">repair</button></div>` : ''}

      ${note ? `
      <div class="note-box">
        <div class="note-head">
          <span class="note-title">The covering note</span>
          <span class="note-source">${noteSource}</span>
        </div>
        ${note.subject ? `<div class="note-subject">Subject: ${escHtml(note.subject)}</div>` : ''}
        <pre class="note-text" id="paper-note-text">${escHtml(note.text || '')}</pre>
        <div class="doc-actions">
          <button class="btn btn-primary doc-act" onclick="copyNote(this)">Copy the note</button>
          ${note.source === 'composed' ? `<span class="card-meta">edit freely after pasting - it states only what the record states</span>` : ''}
        </div>
      </div>` : ''}

      ${guesses.length ? `
        <div class="paper-related-label">Probably related - found by name, not attached</div>
        <div class="doc-list">${guesses.map(paperDocRow).join('')}</div>` : ''}
    </div>`;
}

/** A deliverable row, opened where it reads best: the dock, or inline. */
function docRowOpen(key) {
  const d = (taskDocs?.all || []).find(x => (x.rel || x.path || x.name) === key);
  if (!d) return toggleDoc(key);
  if (readerAvailable() && d.rel) {
    return readerOpenByFile(d.rel, d.name, { bytes: d.bytes, modified: d.modified, webUrl: d.webUrl });
  }
  if (readerAvailable() && d.remote && d.webUrl) {
    readerShell(d.name, '');
    readerMeta('on OneDrive');
    readerBody(`<div class="reader-note">This copy lives on OneDrive only - nothing local to render.
      <a class="btn btn-ghost doc-act" href="${escAttr(d.webUrl)}" target="_blank" rel="noreferrer" style="margin-top:0.5rem">Open on OneDrive ↗</a></div>`);
    return;
  }
  toggleDoc(key);
}

function toggleDoc(p) {
  docsOpen[p] = !docsOpen[p];
  repaintTask();
}

async function openDocument(p, btn) {
  const was = btn.textContent;
  btn.disabled = true; btn.textContent = 'Opening…';
  try {
    const r = await fetch('/api/documents/open', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: p }),
    });
    const d = await r.json();
    if (!d.success) showToast(d.error || 'Could not open it', 'error');
  } catch (e) { showToast(e.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = was; }
}

/** The bytes, through the authenticated fetch, handed to the browser as a save. */
async function downloadDocument(rel, name, btn) {
  const was = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Fetching…'; }
  try {
    const r = await fetch(`/api/documents/raw?file=${encodeURIComponent(rel)}&download=1`);
    if (!r.ok) throw new Error('Could not fetch the file');
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name || rel.split('/').pop();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
  } catch (e) { showToast(e.message, 'error'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = was; } }
}

/** The whole document, not the 4000-character preview. */
async function readAllDocument(key, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Reading…'; }
  try {
    const r = await fetch(`/api/documents/render?file=${encodeURIComponent(key)}`);
    const d = await r.json();
    if (d.full || d.preview?.text) { docsFull[key] = d.full || d.preview.text; repaintTask(); }
    else showToast(d.note || 'No readable text in this one', 'warn');
  } catch (e) { showToast(e.message, 'error'); }
}

/**
 * The edit loop, from the row itself: he edits a deliverable by hand, then
 * REPLACE uploads his copy over the stored one (previous version kept, mirror
 * updated in the same breath), REBUILD TWIN regenerates the .docx from an
 * edited .md, and PUSH sends one file to OneDrive without waiting for the
 * hourly pass. All three re-fetch the card so the badges tell the new truth.
 */
async function replaceDocument(rel, btn) {
  const input = document.createElement('input');
  input.type = 'file';
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    const expected = rel.split('/').pop();
    if (f.name !== expected && !await uiConfirm({ title: 'Different file name',
      body: `You picked "${f.name}" to replace "${expected}". The stored name stays "${expected}" - the contents become what you picked. Go ahead?`,
      confirmLabel: 'Replace it' })) return;
    const was = btn.textContent;
    btn.disabled = true; btn.textContent = 'Replacing…';
    try {
      const b64 = btoa(new Uint8Array(await f.arrayBuffer()).reduce((s, x) => s + String.fromCharCode(x), ''));
      const d = await (await fetch('/api/documents/replace', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: rel, contentBase64: b64 }) })).json();
      if (!d.success) throw new Error(d.error || 'refused');
      showToast(`Replaced (${Math.round(d.bytes / 1024)} KB)${d.mirrored ? ' and mirrored to OneDrive' : ' - OneDrive follows on the next pass'}. Previous version kept.`, 'success');
      if (taskDetailId) fetchTaskDocs(taskDetailId);
    } catch (e) { showToast(e.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = was; }
  };
  input.click();
}

async function rebuildTwin(rel, btn) {
  const was = btn.textContent;
  btn.disabled = true; btn.textContent = 'Rebuilding…';
  try {
    const d = await (await fetch('/api/documents/twin', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: rel }) })).json();
    if (!d.success) throw new Error(d.error || 'refused');
    showToast(`Word twin rebuilt: ${d.twin} (${d.words} words, readback verified)`, 'success');
    if (taskDetailId) fetchTaskDocs(taskDetailId);
  } catch (e) { showToast(e.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = was; }
}

async function pushDocument(rel, btn) {
  const was = btn.textContent;
  btn.disabled = true; btn.textContent = 'Pushing…';
  try {
    const d = await (await fetch('/api/documents/push', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: rel }) })).json();
    if (!d.success) throw new Error(d.error || 'refused');
    showToast('On OneDrive - the phone copy is current now.', 'success');
    if (taskDetailId) fetchTaskDocs(taskDetailId);
  } catch (e) { showToast(e.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = was; }
}

/** A view link for the OneDrive twin, straight onto the clipboard. */
async function shareDocument(rel, btn) {
  const was = btn.textContent;
  btn.disabled = true; btn.textContent = 'Linking…';
  try {
    const r = await fetch('/api/documents/share', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: rel }),
    });
    const d = await r.json();
    if (!d.success) throw new Error(d.error || 'Could not create the link');
    await navigator.clipboard.writeText(d.url);
    showToast('Share link copied - anyone with it can view', 'success');
  } catch (e) { showToast(e.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = was; }
}

async function copyNote(btn) {
  const el = document.getElementById('paper-note-text');
  if (!el) return;
  try {
    await navigator.clipboard.writeText(el.textContent);
    const was = btn.textContent; btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = was; }, 1400);
  } catch { showToast('Could not reach the clipboard', 'error'); }
}

/** Create the work-record deliverable for a task that has none. */
async function provisionDeliverable(btn) {
  const was = btn.textContent;
  btn.disabled = true; btn.textContent = 'Writing…';
  try {
    const r = await fetch('/api/tasks/coverage/provision', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: taskDetailId }),
    });
    const d = await r.json();
    if (!d.success) throw new Error(d.error || 'refused');
    showToast(`Created ${d.name} and linked it`, 'success');
    await fetchState();
    await openTask(taskDetailId);
  } catch (e) { showToast(e.message, 'error'); btn.disabled = false; btn.textContent = was; }
}

async function fetchTaskDocs(taskId) {
  try {
    const r = await fetch(`/api/tasks/deliverables?taskId=${encodeURIComponent(taskId)}`);
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    taskDocs = d;
    taskDocsSource = 'local';
    // Attached files arrive already open. The point of attaching a document is to
    // put it in front of you, not to hand you another click - and the preview is
    // in this payload anyway, so opening costs nothing.
    (d.all || []).forEach(doc => {
      const key = doc.rel || doc.path || doc.name;
      if (!(key in docsOpen) && doc.source === 'linked'
          && (doc.preview?.text || (doc.kind === 'image' && doc.dataUri))) {
        docsOpen[key] = true;
      }
    });
  } catch { taskDocs = { all: [], deliverables: [], notes: [], dead: [], note: null }; }
  if (currentView === 'task') repaintTask();
}

let jiraPanel = null;   // { loading, edits, ready, users, tags, checks, project, canDelete }

/**
 * The only route to the board.
 *
 * Every entry point - the row menu, a distilled card, the task screen - lands here,
 * so there is no path that reaches Jira without the review panel. The old one
 * posted a title to /api/tasks with a hardcoded medium priority, which created a
 * second local row and pushed that, quietly duplicating tasks that already existed.
 */
async function reviewTaskForJira(taskId) {
  if (taskId && taskId !== taskDetailId) await openTask(taskId);
  await openJiraReview();
}

async function openJiraReview() {
  jiraPanel = { loading: true, loadingNote: 'Preparing the issue…' };
  repaintTask();
  try {
    const r = await fetch('/api/jira/preview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: taskDetailId }),
    });
    const d = await r.json();
    if (!d.success) { showToast(d.error || 'Could not prepare', 'error'); jiraPanel = null; repaintTask(); return; }
    jiraPanel = {
      loading: false,
      edits: {
        summary:     d.payload.summary || '',
        description: d.payload.description || '',
        duedate:     d.payload.duedate || '',
        assignee:    d.payload.assignee || '',
        tag:         (d.payload.labels || [])[0] || '',
        priority:    d.payload.priority || 'medium',
      },
      ready: d.ready, users: d.users || [], tags: d.tags || [],
      project: d.project, canDelete: d.canDelete, checks: [],
    };
  } catch (e) { showToast(e.message, 'error'); jiraPanel = null; }
  repaintTask();
}

function closeJiraReview() { jiraPanel = null; repaintTask(); }

// Re-evaluated locally on every keystroke so the checklist tracks what is on screen
// rather than what the server last saw. The server runs the same gate again at push.
function jiraEdit(field, value) {
  if (!jiraPanel) return;
  jiraPanel.edits[field] = value;
  const e = jiraPanel.edits;
  const sum = String(e.summary || '').trim();
  jiraPanel.ready = [
    { id:'summary', ok: sum.length >= 12 && sum.split(/\s+/).length >= 3,
      label:'Summary states an outcome', hint:'Under three words reads as a placeholder to everyone else on the board.' },
    { id:'description', ok: String(e.description || '').trim().length >= 40,
      label:'Description is filled in', hint:'Explain the task, then Compose writes this from the explanation.' },
    { id:'duedate', ok: /^\d{4}-\d{2}-\d{2}$/.test(e.duedate || ''),
      label:'Has a date', hint:'An undated issue does not appear in any timeline.' },
    { id:'tag', ok: Boolean(e.tag),
      label:'Tagged', hint:'Tag it so work, personal and space items stay separable on one board.' },
    { id:'assignee', ok: Boolean(e.assignee),
      label:'Has an owner', hint:'Unassigned issues belong to nobody.' },
  ];
  // Only the checklist and the button change, so the fields are not re-rendered and
  // the cursor stays where it was. Re-painting the card on every keystroke would
  // make the summary field unusable.
  paintJiraReadiness();
}

function paintJiraReadiness() {
  const p = jiraPanel; if (!p) return;
  const box = document.querySelector('.jira-ready');
  if (box) {
    box.innerHTML = p.ready.map(c => `
      <div class="jira-ready-row ${c.ok ? 'ok' : 'no'}">
        <span class="jira-ready-mark">${c.ok ? '✓' : '·'}</span>
        <span class="jira-ready-label">${escHtml(c.label)}</span>
        ${c.ok ? '' : `<span class="jira-ready-hint">${escHtml(c.hint)}</span>`}
      </div>`).join('');
  }
  const failing = p.ready.filter(c => !c.ok);
  const btn = document.getElementById('jira-create-btn');
  if (btn) {
    btn.disabled = failing.length > 0;
    btn.textContent = failing.length
      ? `${failing.length} thing${failing.length > 1 ? 's' : ''} missing`
      : 'Create in Jira';
  }
}

async function composeJira(btn) {
  if (!jiraPanel) return;
  const was = btn.textContent;
  btn.disabled = true; btn.textContent = 'Writing…';
  try {
    const r = await fetch('/api/jira/compose', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: taskDetailId }),
    });
    const d = await r.json();
    if (!d.success) { showToast(d.error || 'Could not compose', 'error'); return; }
    jiraPanel.edits.summary = d.summary;
    jiraPanel.edits.description = d.description;
    jiraPanel.checks = d.checks || [];
    jiraEdit('summary', d.summary);
    repaintTask();
    showToast('Composed … read it before it becomes permanent', 'success');
  } catch (e) { showToast(e.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = was; }
}

async function pushJira(force, btn) {
  if (!jiraPanel) return;
  const e = jiraPanel.edits;
  if (force && !await uiConfirm({ title: 'Push it incomplete?',
    body: 'This issue is missing things, and it cannot be deleted from this project once created.',
    confirmLabel: 'Push anyway', danger: true })) return;
  const was = btn.textContent;
  btn.disabled = true; btn.textContent = 'Creating…';
  try {
    const r = await fetch('/api/jira/push', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId: taskDetailId, force,
        summary: e.summary, description: e.description,
        duedate: e.duedate, assignee: e.assignee,
        priority: e.priority, labels: e.tag ? [e.tag] : [],
      }),
    });
    const d = await r.json();
    if (!d.success) {
      showToast(d.error || 'Jira rejected it', 'error');
      if (d.ready) { jiraPanel.ready = d.ready; paintJiraReadiness(); }
      btn.disabled = false; btn.textContent = was;
      return;
    }
    showToast(`Created ${d.key}`, 'success');
    if (d.unsupportedFields?.length) {
      showToast(`This project ignored: ${d.unsupportedFields.join(', ')}`, 'warn');
    }
    jiraPanel = null;
    await refreshTaskDetail();
    fetchJiraIssues?.();
  } catch (err) { showToast(err.message, 'error'); btn.disabled = false; btn.textContent = was; }
}

// Move the date or the owner on an issue that already exists.
async function jiraReschedule(patch, el) {
  if (el) el.disabled = true;
  try {
    const r = await fetch('/api/jira/schedule', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: taskDetailId, ...patch }),
    });
    const d = await r.json();
    showToast(d.success ? 'Updated in Jira' : (d.error || 'Jira refused the change'),
              d.success ? 'success' : 'error');
  } catch (e) { showToast(e.message, 'error'); }
  finally { if (el) el.disabled = false; }
}

// The assignee picker on a live issue is populated after paint, so the card appears
// instantly instead of waiting on the Jira roster call.
async function fillLiveAssignees(current) {
  const sel = document.getElementById('jira-live-assignee');
  if (!sel) return;
  try {
    const r = await fetch('/api/jira/assignable');
    const d = await r.json();
    sel.innerHTML = `<option value="">unassigned</option>` +
      (d.users || []).map(u =>
        `<option value="${escHtml(u.accountId)}"${u.accountId === current ? ' selected' : ''}>${escHtml(u.displayName)}</option>`).join('');
  } catch { sel.innerHTML = `<option value="">could not load</option>`; }
}

function repaintTask() {
  if (currentView === 'task') {
    document.getElementById('view-container').innerHTML = renderTaskView();
    const t = taskDetail?.task;
    if (t?.JIRA_KEY && t.JIRA_KEY !== '-') fillLiveAssignees(t.ASSIGNEE !== '-' ? t.ASSIGNEE : '');
  }
}

/**
 * Who this task touches.
 *
 * Straight out of the power map, no model involved. The register line is the part
 * that actually changes behaviour - it is the difference between a message that
 * lands and one that gets a one-word reply.
 */
function renderPeopleCard(career) {
  if (!career?.available || !career.counterparties?.length) return '';
  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Who this touches</span>
        <span class="card-meta">${escHtml(career.org || '')}</span>
      </div>
      <div class="person-list">
        ${career.counterparties.map(p => `
          <div class="person">
            <div class="person-head">
              <span class="person-name">${escHtml(p.name)}</span>
              ${p.role ? `<span class="person-role">${escHtml(p.role)}</span>` : ''}
              ${p.matchedBy === 'by role' ? `<span class="person-tag">matched by role</span>` : ''}
            </div>
            ${p.register ? `<div class="person-line"><span>Register</span>${escHtml(p.register)}</div>` : ''}
            ${p.wants?.length ? `<div class="person-line"><span>Wants</span>${escHtml(p.wants.join(' · '))}</div>` : ''}
            ${p.cautions?.length ? `<div class="person-line caution"><span>Careful</span>${escHtml(p.cautions.join(' · '))}</div>` : ''}
            ${p.standingAction ? `<div class="person-line"><span>Standing</span>${escHtml(p.standingAction)}</div>` : ''}
            ${p.importance ? `<div class="person-note">${escHtml(p.importance)}</div>` : ''}
          </div>`).join('')}
      </div>
    </div>`;
}

/**
 * The decisions and risks in play.
 *
 * Ids cited in the title are resolved to their actual entries, and risks are
 * surfaced when the wording trips a keyword the register itself defines. Both are
 * shown with the word that matched, so a false positive is obvious.
 */
function renderGovernsCard(career) {
  if (!career?.available) return '';
  const d  = career.refs?.decisions || [];
  const cr = career.refs?.risks || [];
  const pb = career.playbooks || [];
  const mr = career.risks || [];
  if (!d.length && !cr.length && !pb.length && !mr.length) return '';

  return `
    <div class="card">
      <div class="card-header"><span class="card-title">What governs this</span></div>
      <div class="governs">
        ${d.map(x => `
          <div class="gov-row">
            <span class="gov-id gov-d">${escHtml(x.id)}</span>
            <div>
              <div class="gov-title">${escHtml(x.title)}</div>
              <div class="gov-meta">${escHtml([x.status, x.by, x.date].filter(Boolean).join(' · '))}</div>
              ${x.note ? `<div class="gov-note">${docChips(escHtml(x.note))}</div>` : ''}
            </div>
          </div>`).join('')}
        ${[...cr, ...mr].map(x => `
          <div class="gov-row">
            <span class="gov-id gov-r">${escHtml(x.id)}</span>
            <div>
              <div class="gov-title">${escHtml(x.title)}</div>
              ${x.matchedOn ? `<div class="gov-meta">flagged on the word "${escHtml(x.matchedOn)}"</div>` : ''}
              ${x.protection ? `<div class="gov-note">${escHtml(x.protection)}</div>` : ''}
            </div>
          </div>`).join('')}
        ${pb.map(x => `
          <div class="gov-row">
            <span class="gov-id gov-p">${escHtml(x.id)}</span>
            <div>
              <div class="gov-title">${escHtml(x.name)}</div>
              <div class="gov-meta">${escHtml(x.why || '')}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

/**
 * The message itself.
 *
 * Shown whenever the task is really a message, which the resolver decides from the
 * verb and the people named. Recipient and channel are both overridable, because
 * the inference is good on tasks that name someone and worthless on ones that do
 * not, and a confidently wrong recipient is worse than an empty dropdown.
 */
function renderDraftCard(career, draft) {
  const needed = career?.comms?.required;
  if (!needed && !draft) return '';

  // Everyone in the power map, with the people this task actually names floated to
  // the top. A task can need a message without naming anyone, and an empty picker
  // would make that task undraftable.
  const named  = career?.counterparties || [];
  const roster = career?.people?.length ? career.people : named;
  const people = [...named, ...roster.filter(r => !named.some(n => n.name === r.name))];

  const recipient = draftTo || draft?.to || career?.comms?.recipient?.name || '';
  const channel   = draftChannel || draft?.channel || career?.comms?.channel || 'email';
  const chWhy     = career?.comms?.channelWhy || '';

  // A draft written for the other channel is not this card's draft. Showing it
  // under a Text heading when it opens "Dear Alex," would be worse than showing
  // nothing, so the card resets to unwritten when the channel is switched.
  const shown = draft && draft.channel === channel && draft.to === recipient ? draft : null;

  const chBtn = (v, label) => `<button class="ch-btn${channel === v ? ' on' : ''}"
      onclick="setDraftChannel('${v}')">${label}</button>`;

  return `
    <div class="card draft-card">
      <div class="card-header">
        <span class="card-title">The message</span>
        <div class="draft-controls">
          ${chBtn('email', 'Email')}${chBtn('whatsapp', 'Text')}
          <button class="btn ${shown ? 'btn-ghost' : 'btn-primary'}" id="draft-btn"
                  style="font-size:0.72rem;padding:3px 10px"
                  onclick="generateDraft(${shown ? 'true' : 'false'})">
            ${shown ? 'Different angle' : 'Write it'}
          </button>
        </div>
      </div>

      <div class="draft-to">
        <label>To
          <select class="task-select" onchange="setDraftRecipient(this.value)">
            ${recipient ? '' : '<option value="">Pick someone</option>'}
            ${people.map(p => `<option value="${escHtml(p.name)}"${p.name === recipient ? ' selected' : ''}>${escHtml(p.name)}</option>`).join('')}
            ${recipient && !people.some(p => p.name === recipient)
              ? `<option value="${escHtml(recipient)}" selected>${escHtml(recipient)}</option>` : ''}
          </select>
        </label>
        ${shown?.address ? `<span class="draft-addr">${escHtml(shown.address)}</span>` : ''}
        ${career?.comms?.intent ? `<span class="draft-intent">${escHtml(career.comms.intent)}</span>` : ''}
      </div>
      ${chWhy ? `<div class="draft-why-ch">Channel: ${escHtml(chWhy)}</div>` : ''}

      <div id="draft-body">${renderDraftBody(shown)}</div>
    </div>`;
}

function renderDraftBody(draft) {
  if (draftPending) {
    return `<div class="brief-pending">
      <div class="spinner-inline"></div>
      <div>
        <div>Writing it locally…</div>
        <div class="brief-pending-note">A draft carries colleague profiles and the private
        registers, so it never leaves this machine.</div>
      </div>
    </div>`;
  }
  if (!draft) {
    return `<div class="empty-state" style="text-align:left;padding:0.6rem 0">
      Nothing drafted yet. Press it and you get the actual words … pitched at how this particular person reads.
    </div>`;
  }
  return `
    ${draft.subject ? `
      <div class="draft-subject">
        <span>Subject</span>
        <input id="draft-subject-text" class="draft-subject-input" spellcheck="true"
               aria-label="Subject - edit it before you send it" value="${escAttr(draft.subject)}"/>
      </div>` : ''}
    <textarea class="draft-message draft-editable" id="draft-message-text" spellcheck="true" aria-label="The message - edit it before you send it">${escHtml(draft.body)}</textarea><div class="draft-editable-hint">Edit it freely - what you leave here is what gets copied.</div>
    ${draft.checks?.length ? `
      <div class="draft-checks">
        <div class="draft-checks-label">Check before sending</div>
        ${draft.checks.map(c => `
          <div class="draft-check">
            <code>${escHtml(c.found)}</code>
            <span>${escHtml(c.say)}</span>
          </div>`).join('')}
      </div>` : ''}
    <div class="draft-actions">
      <button class="btn btn-primary" style="font-size:0.72rem;padding:3px 10px"
              onclick="copyDraft(this)">Copy message</button>
      ${draft.attempt > 1 ? `<span class="card-meta">angle ${draft.attempt}</span>` : ''}
      <span class="card-meta">${escHtml((draft.generatedAt || '').slice(0,10))}</span>
    </div>
    ${draft.why ? `
      <div class="draft-rationale">
        <div class="draft-rationale-label">Why it is written this way</div>
        <div>${escHtml(draft.why)}</div>
      </div>` : ''}`;
}

function setDraftChannel(ch) {
  draftChannel = ch;
  repaintTask();
}

function setDraftRecipient(name) {
  draftTo = name || null;
  repaintTask();
}

async function generateDraft(regenerate) {
  if (draftPending) return;
  const career = taskDetail?.career;
  const to = draftTo || taskDetail?.draft?.to || career?.comms?.recipient?.name || '';
  if (!to) { showToast('Tell me who it is for and I will pitch it accordingly', 'warn'); return; }

  draftPending = true;
  const body = document.getElementById('draft-body');
  const btn  = document.getElementById('draft-btn');
  if (body) body.innerHTML = renderDraftBody(null);
  if (btn) { btn.disabled = true; btn.textContent = 'Writing…'; }

  try {
    const r = await fetch('/api/tasks/draft', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId: taskDetailId,
        regenerate: !!regenerate,
        recipient: to,
        channel: draftChannel || taskDetail?.draft?.channel || career?.comms?.channel,
      }),
    });
    const d = await r.json();
    draftPending = false;
    if (!d.success) {
      showToast(d.error || 'Could not draft it', 'error');
    } else {
      if (taskDetail) taskDetail.draft = d.draft;
      showToast(d.cached ? 'Loaded the saved draft'
                         : (regenerate ? 'Same point, completely different approach' : 'Draft ready'), 'success');
    }
  } catch (e) {
    draftPending = false;
    showToast(e.message, 'error');
  }
  repaintTask();
}

// Subject and body together, so pasting into a mail client fills both.
function copyDraft(btn) {
  const d = taskDetail?.draft;
  if (!d) return;
  // Read the BOX, not the stored draft. He edits before sending, and copying
  // the original would hand him back the version he just rejected.
  const body = draftText('draft-message-text') || d.body;
  const subject = draftText('draft-subject-text') || d.subject;
  const text = subject ? `${subject}\n\n${body}` : body;
  const done = () => {
    const was = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = was; }, 1400);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => selectAndCopy('draft-message-text', done));
  } else selectAndCopy('draft-message-text', done);
}

/**
 * Escape for use inside a double-quoted HTML attribute. escHtml handles &, <
 * and > only, so a model-written subject containing a quote would close the
 * attribute early and break the field. Anything going into value="..." uses
 * this instead.
 */
function escAttr(str) {
  return escHtml(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Read a drafted message. Every "ready to send" box is an editable textarea now
 * - the agent writes the first version, he writes the one that actually goes -
 * so a reader must take .value, not .textContent. Kept tolerant of both so any
 * surface still rendering a <pre> keeps working.
 */
function draftText(elId) {
  const el = document.getElementById(elId);
  if (!el) return '';
  return ('value' in el ? el.value : el.textContent) || '';
}

/** Grow a draft box to fit its content, so nothing is hidden behind a scrollbar. */
function draftAutoGrow(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight + 2, Math.round(window.innerHeight * 0.55)) + 'px';
}
function draftInit(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  draftAutoGrow(el);
  el.addEventListener('input', () => draftAutoGrow(el));
}

function selectAndCopy(elId, done) {
  const el = document.getElementById(elId);
  if (!el) return;
  // A textarea selects itself; selectNodeContents does nothing useful on one,
  // which would have silently broken copy on the now-editable draft boxes.
  if ('value' in el) {
    el.focus();
    el.setSelectionRange(0, el.value.length);
    try { document.execCommand('copy'); done(); } catch {}
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  try { document.execCommand('copy'); done(); } catch {}
}

// escHtml first, THEN the **bold** markers become <strong> - order matters, or a
// task title containing angle brackets would inject markup.
/* ── REFERENCE CHIPS ──────────────────────────────────────────────────────────
   "D-024" is a filing code, not a sentence. Everywhere the agent writes one,
   it now renders as a chip carrying the decision's actual meaning, hoverable
   for the full line and clickable to the register it lives in. The codes stay
   (they are how the vault and Jira refer to each other) but the reader never
   has to hold them in their head.
   REFS is fetched once per session and shared by every surface. */
let REFS = {};
async function fetchRefs() {
  try { REFS = (await (await fetch('/api/refs')).json()).refs || {}; } catch { REFS = {}; }
}

/**
 * Filenames become the files themselves.
 *
 * A document mentioned anywhere - a lesson, a brief, a decision note - is a
 * reference to something real in the vault or the work folders, and a mention
 * that just sits there as text sends him to the file manager. Every token that
 * looks like a document becomes a chip; the chip opens a live preview pulled
 * from wherever the file actually is (workspace, vault, or OneDrive when this
 * host has neither). Only text nodes are transformed - a filename inside an
 * href or a title attribute is markup, not prose, and rewriting it breaks the
 * page.
 */
const DOC_TOKEN = /\b([A-Za-z0-9][\w.-]{4,140}\.(?:md|docx?|xlsx?|pptx?|pdf|txt|csv|ya?ml|json|png|jpe?g|webp))\b/g;
function docChips(html) {
  return String(html).split(/(<[^>]*>)/g).map(part => {
    if (part.startsWith('<')) return part;
    return part.replace(DOC_TOKEN, (whole) => {
      // Code artifacts read as code, not as documents to preview.
      if (/^(package|package-lock|tsconfig|pyproject|render|policy|config)\./i.test(whole)) return whole;
      return `<span class="docchip" title="Preview ${escAttr(whole)} - pulled live from where it is stored"
        onclick="event.stopPropagation();openDocRef('${escAttr(whole)}')">${whole}</span>`;
    });
  }).join('');
}

function refChips(html) {
  return docChips(String(html).replace(/\b([DRP])-(\d{1,3})\b/g, (whole) => {
    const r = REFS[whole.toUpperCase()];
    if (!r) return whole;
    const label = r.title.length > 46 ? r.title.slice(0, 46) + '…' : r.title;
    const tip = `${whole} · ${r.kind}${r.status ? ` · ${r.status}` : ''}${r.by ? ` · ${r.by}` : ''}${r.date ? ` · ${r.date}` : ''}\n${r.title}`;
    return `<span class="refchip refchip-${r.kind}" title="${escHtml(tip)}"
      onclick="event.stopPropagation();navigate('${r.kind === 'risk' ? 'spaces' : 'decisions'}')"><b>${whole}</b>${escHtml(label)}</span>`;
  }));
}

/**
 * THE READER - the chat rail doubling as a document preview space.
 *
 * On a desktop layout every document reference opens HERE: the rail widens
 * slightly, the chat stays alive underneath, and the file renders the way it
 * would actually look - markdown as designed prose in the lesson style, PDFs
 * in the browser's own viewer, images as images, sheets as a table. Read-only
 * by design: name, meta, Download, Close. He is verifying content, not
 * operating on it. On phones the existing overlay does the job instead - a
 * fixed sheet has no rail to dock into.
 */
// 1081px is where the rail lives in the grid; below that it is an off-canvas
// sheet and the overlay is the right reading surface.
const readerAvailable = () => window.matchMedia('(min-width: 1081px)').matches
  && document.getElementById('reader-dock');
let readerBlobUrl = null;   // revoked on every close/replace so blobs never pile up

let currentRailMode = 'context';
let prevRailMode = 'context';

function setRailMode(mode) {
  prevRailMode = currentRailMode;
  currentRailMode = mode;

  const chatTab = document.getElementById('rail-tab-chat');
  const readerTab = document.getElementById('rail-tab-reader');
  const contextTab = document.getElementById('rail-tab-context');

  if (chatTab) chatTab.classList.toggle('on', mode === 'chat');
  if (readerTab) readerTab.classList.toggle('on', mode === 'reader');
  if (contextTab) contextTab.classList.toggle('on', mode === 'context');

  const readerDock = document.getElementById('reader-dock');
  const contextDock = document.getElementById('chat-rail-context');
  const inputWrap = document.querySelector('.chat-rail-input-wrap');
  const chipsWrap = document.querySelector('.chat-chips');
  const msgsWrap = document.getElementById('chat-rail-messages');

  // Input wrap, action chips, and chat messages are ONLY visible in chat mode!
  if (inputWrap) inputWrap.style.display = (mode === 'chat' ? 'flex' : 'none');
  if (chipsWrap) chipsWrap.style.display = (mode === 'chat' ? 'flex' : 'none');
  if (msgsWrap) msgsWrap.style.display = (mode === 'chat' ? 'block' : 'none');

  if (mode === 'reader') {
    if (readerDock) readerDock.classList.remove('hidden');
    if (contextDock) contextDock.classList.add('hidden');
  } else if (mode === 'context') {
    if (readerDock) readerDock.classList.add('hidden');
    if (contextDock) {
      contextDock.classList.remove('hidden');
      renderRailContext();
    }
  } else { // chat
    if (readerDock) readerDock.classList.add('hidden');
    if (contextDock) contextDock.classList.add('hidden');
  }
}

/* ═══ THE TRUSTED CLOCK ═══════════════════════════════════════════════════
 * Ported from isconl-agent's dev branch (server-time sync, corrected for
 * round-trip, then advanced locally via performance.now() so it stays
 * correct offline and across a laptop sleeping/waking). See CLOCK below for
 * the full rationale; kept verbatim since the reasoning doesn't change by
 * moving host.
 */
const CLOCK = {
  offsetMs: 0, monoAtSync: null, serverAtSync: null,
  trusted: false, lastSyncIso: null, rttMs: null, driftMs: null,
};

function clockAdopt(serverNow, t0, t1) {
  if (!Number.isFinite(serverNow)) return;
  const rtt = Math.max(0, t1 - t0);
  const deviceAtServerRead = t0 + rtt / 2;
  const offset = serverNow - deviceAtServerRead;
  if (CLOCK.trusted && CLOCK.rttMs != null && rtt > CLOCK.rttMs * 4 && rtt > 2000) return;
  CLOCK.driftMs = Math.round(offset);
  CLOCK.offsetMs = offset;
  CLOCK.monoAtSync = performance.now();
  CLOCK.serverAtSync = serverNow;
  CLOCK.trusted = true;
  CLOCK.rttMs = Math.round(rtt);
  CLOCK.lastSyncIso = new Date(serverNow).toISOString();
}

function nowMs() {
  if (CLOCK.trusted && CLOCK.monoAtSync != null) {
    return CLOCK.serverAtSync + (performance.now() - CLOCK.monoAtSync);
  }
  return Date.now();
}
const trustedNow = () => new Date(nowMs());

async function syncClock() {
  const t0 = Date.now();
  try {
    const r = await fetch('/api/time', { cache: 'no-store' });
    const t1 = Date.now();
    if (!r.ok) return false;
    const d = await r.json();
    clockAdopt(Number(d.now), t0, t1);
    return true;
  } catch { return false; }
}

/* ═══ THE DAY MODEL ═══════════════════════════════════════════════════════
 * /api/blocks answers once with the block DEFINITIONS (static: start, end,
 * name) plus a snapshot of "now". The shape of the day comes from the
 * server; the POSITION in it is recomputed locally every tick from the
 * trusted clock, so a rail left open for an hour never shows a stale
 * number and never needs a refetch. Ported from isconl-agent dev branch.
 */
let DAY = null;
let dayInFlight = false;
async function fetchDay(force = false) {
  if (dayInFlight || (DAY && !force)) return;
  dayInFlight = true;
  const t0 = Date.now();
  try {
    const r = await fetch('/api/blocks');
    const t1 = Date.now();
    DAY = await r.json().catch(() => ({ ok: false, error: `unreadable answer (${r.status})` }));
    if (r.ok) DAY.ok = true;
    if (DAY && DAY.ok && Number.isFinite(DAY.serverNow)) clockAdopt(DAY.serverNow, t0, t1);
  } catch (e) {
    DAY = { ok: false, error: /fetch|network/i.test(e.message || '') ? 'could not reach the agent' : e.message };
  } finally {
    dayInFlight = false;
    refreshContextIfActive();
    // The Hub's day card renders "Reading your blocks…" on first paint
    // (DAY is null then) and needs a patch once the fetch resolves - same
    // pattern as #data-health-slot's fetchDataHealth, since nothing else
    // repaints the 'today' view on this async arrival.
    const slot = document.getElementById('day-card-slot');
    if (slot) slot.innerHTML = renderDayBlocks();
  }
}
const dayNow = () => (DAY && DAY.ok ? DAY.now : null);

function fmtBlockMins(m) {
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(Math.floor(m % 60)).padStart(2, '0')}m`
    : m >= 1 ? `${Math.floor(m)}m`
    : `${Math.max(0, Math.round(m * 60))}s`;
}

let CONTEXT_MEETING = null;   // declared for a future live-meeting integration; unused today
function contextMeeting(state) { CONTEXT_MEETING = state || null; refreshContextIfActive(); }
let WEATHER = null;   // declared so ctxSlots' weather candidate degrades gracefully; no forecast source wired up yet

/** Fraction 0..1 through the working day, from the trusted clock against the block span. */
function workingDayFraction(now = trustedNow()) {
  const d = localDayNow(now);
  if (d && typeof d.fraction === 'number') return d.fraction;
  const mins = now.getHours() * 60 + now.getMinutes();
  const start = 8 * 60, end = 17 * 60;
  return Math.max(0, Math.min(1, (mins - start) / (end - start)));
}

/**
 * The day, recomputed from the DEVICE clock against the block definitions -
 * no network touched here, correct to the second, works offline. Mirrors
 * vault/lib/blocks.js's now() exactly, wrap included (Rest runs 21:00-05:00).
 */
function localDayNow(now = trustedNow()) {
  const src = (DAY && DAY.ok)
    ? ((DAY.blocks && DAY.blocks.length) ? DAY.blocks : (DAY.now && DAY.now.blocks))
    : null;
  const bs = (src || []).filter(b => Number.isFinite(b.start) && Number.isFinite(b.end));
  if (!bs.length) return null;
  const mins = now.getHours() * 60 + now.getMinutes()
    + now.getSeconds() / 60 + now.getMilliseconds() / 60000;
  const wraps = (b) => b.end <= b.start;
  const inside = (b) => (wraps(b) ? (mins >= b.start || mins < b.end) : (mins >= b.start && mins < b.end));
  const leftIn = (b) => (wraps(b) && mins >= b.start ? (b.end + 1440) - mins : b.end - mins);

  const awake = bs.filter(b => !wraps(b));
  const dayStart = awake.length ? awake[0].start : 8 * 60;
  const dayEnd = awake.length ? awake[awake.length - 1].end : 17 * 60;
  const current = bs.find(inside) || null;
  const next = bs.find(b => b.start > mins) || null;
  const first = bs[0];
  const untilNext = next ? next.start - mins : first ? (first.start + 1440) - mins : null;

  return {
    mins, dayStart, dayEnd,
    fraction: Math.max(0, Math.min(1, (mins - dayStart) / Math.max(1, dayEnd - dayStart))),
    before: mins < dayStart, after: mins >= dayEnd,
    current: current && { ...current, leftMins: leftIn(current) },
    next: (next || first) && untilNext != null ? { ...(next || first), inMins: untilNext } : null,
  };
}

/** How much working day is left, as the three lines the orb's core carries. */
function workingDayLeft(now = trustedNow()) {
  const d = localDayNow(now);
  if (d) {
    const say = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(Math.floor(m % 60)).padStart(2, '0')}m`
      : m >= 1 ? `${Math.floor(m)}m`
      : `${Math.max(0, Math.round(m * 60))}s`);
    if (d.current) {
      const b = d.current;
      const elapsed = Math.max(0, b.minutes - b.leftMins);
      return { big: say(b.leftMins), label: b.name.toUpperCase(),
        sub: `${b.startClock} - ${b.endClock} · ${say(elapsed)} in` };
    }
    if (d.next) return { big: say(d.next.inMins), label: d.next.name.toUpperCase(),
      sub: `starts ${d.next.startClock}` };
  }
  const mins = now.getHours() * 60 + now.getMinutes();
  const start = 8 * 60, end = 17 * 60;
  const span = '08:00 - 17:00';
  if (mins < start) return { big: '9h 00m', label: 'DAY AHEAD', sub: 'starts 08:00' };
  if (mins >= end) return { big: 'closed', label: 'DAY DONE', sub: span };
  const left = end - mins;
  return { big: `${Math.floor(left / 60)}h ${String(left % 60).padStart(2, '0')}m`,
           label: 'LEFT TODAY', sub: span };
}

/* ═══ THE DAY CARD - ported from legacy/dashboard/app.js's renderDayBlocks
 * (~8064-8279), the 24-hour block rail. localDayNow/workingDayLeft/
 * fmtBlockMins already existed here (built for the orb widget); this adds
 * the visual rail + current-block panel + 3-block window legacy had and
 * hub never got. The full "day space" subpage (all twelve blocks, legacy's
 * renderDaySpace) is NOT ported - this is the Hub card only.
 */

/** One palette for the day, ported verbatim from legacy (his colours, 6 Aug). */
const BLOCK_TONE = {
  protected:  'var(--wx-protected, #8b9cff)',
  learning:   'var(--wx-learn, #22d3ee)',
  flex:       'var(--wx-flex, #9aa4b2)',
  innovator:  'var(--wx-inn, #22c55e)',
  visionary:  'var(--wx-lead, #3b8cff)',
  lunch:      'var(--wx-lunch, #d4a017)',
  creator:    'var(--wx-create, #ff7a1a)',
  connection: 'var(--wx-connect, #ff4d94)',
  home:       'var(--wx-home, #14c8a0)',
  rest:       'var(--wx-rest, #5566cc)',
};
const toneOf = (b) => BLOCK_TONE[b?.axis] || 'var(--text-3)';

/** The three blocks the Hub shows: previous, current, next - wraps at both ends of the day. */
function dayWindow(bs, currentId, live) {
  if (!bs.length) return [];
  const i = bs.findIndex(b => b.id === currentId);
  if (i < 0) return bs.slice(0, 3).map(b => ({ ...b, _rel: 'ahead' }));
  const n = bs.length;
  const prev = bs[(i - 1 + n) % n];
  const next = bs[(i + 1) % n];
  const out = [];
  if (n >= 3) out.push({ ...prev, _rel: 'past' });
  out.push({ ...bs[i], _rel: 'now' });
  if (n >= 2) out.push({ ...next, _rel: 'next' });
  return out;
}

/** The one-line "where the day is" string, from the trusted clock. */
function workingDayLeftLine(d) {
  const say = fmtBlockMins;
  if (d.current) return `${d.current.name} block · ${say(d.current.leftMins)} left${d.current.quiet ? ' · quiet' : ''}`;
  if (d.next) return `${d.next.name} in ${say(d.next.inMins)}`;
  return 'between blocks';
}

/**
 * The Hub's day card: four windows, the work allocated to each, and what
 * did not fit. Ported from legacy's renderDayBlocks(); no day-space
 * subpage here yet, so the header is informational (not a click-through).
 */
function renderDayBlocks() {
  if (!DAY) { fetchDay(); return `
    <div class="card"><div class="view-head"><h1>The day</h1></div>
    <div class="empty-state">Reading your blocks…</div></div>`; }
  if (!DAY.ok) return `
    <div class="card"><div class="view-head" style="display:flex;align-items:baseline;justify-content:space-between">
      <h1>The day</h1>
      <button class="btn btn-ghost rail-btn" onclick="fetchDay(true)">Try again</button></div>
      <div class="empty-state" style="text-align:left">${escHtml(DAY.error || 'the day model could not be read')}</div></div>`;

  const n = DAY.now || {};
  const bs = DAY.blocks || (n.blocks) || [];
  const live = localDayNow();
  const currentId = live?.current?.id || n.current?.id || null;

  const DAY_MIN = 1440;
  const DAY_START = 300; // 05:00, matching legacy's rail origin (his day starts when Protected does)
  const railMin = (m) => (((m - DAY_START) % DAY_MIN) + DAY_MIN) % DAY_MIN;
  const seg = (b) => {
    const s = railMin(b.start);
    let e = railMin(b.end);
    if (e <= s) e += DAY_MIN;
    return e > DAY_MIN ? [[s, DAY_MIN], [0, e - DAY_MIN]] : [[s, e]];
  };

  const nowMin = live?.mins ?? 0;
  const nowRail = railMin(nowMin);
  const railPieces = bs.flatMap(b => seg(b).map(([s, e]) => {
    const left = (s / DAY_MIN * 100).toFixed(3);
    const width = Math.max(0, (e - s) / DAY_MIN * 100).toFixed(3);
    const state = b.id === currentId ? 'now' : (e <= nowRail ? 'past' : 'ahead');
    return `<div class="day-rail-block ${state}${b.placeable ? ' work' : ' personal'}"
      style="left:${left}%;width:${width}%;--seg:${toneOf(b)}"
      title="${escAttr(`${b.name} ${b.startClock}-${b.endClock}${b.placeable ? ` · ${(b.tasks||[]).length}/${b.slots} placed` : ' · personal'}${b.quiet ? ' · quiet hours' : ''}`)}"></div>`;
  }));

  const slots = bs.reduce((s, b) => s + (b.placeable ? b.slots : 0), 0);
  const open = DAY.counts?.open || 0;
  const days = slots ? (open / slots) : null;

  return `
    <div class="card day-card">
      <div class="view-head">
        <h1>The day</h1>
        <div class="view-head-meta" id="day-card-line">${escHtml(live ? workingDayLeftLine(live) : (n.line || ''))}</div>
      </div>

      ${live?.current ? (() => {
        const b = live.current;
        const tone = toneOf(b);
        const elapsed = Math.max(0, b.minutes - b.leftMins);
        const pct = b.minutes ? (elapsed / b.minutes) * 100 : 0;
        const load = b.placeable
          ? `${b.tasks?.length ?? 0} of ${b.slots} slots filled`
          : 'personal time, no board work';
        return `
        <div class="dcb" style="--dcb:${tone}">
          <div class="dcb-top">
            <span class="dcb-dot"></span>
            <span class="dcb-name">${escHtml(b.name)}</span>
            <span class="dcb-axis">${escHtml(b.axis)}</span>
            ${b.quiet ? '<span class="day-block-quiet">quiet</span>' : ''}
            <span class="dcb-span">${escHtml(b.startClock)} - ${escHtml(b.endClock)}</span>
          </div>
          <div class="dcb-bar"><i id="dcb-bar" style="width:${pct.toFixed(2)}%"></i></div>
          <div class="dcb-figs">
            <span class="dcb-fig"><b id="dcb-left">${escHtml(fmtBlockMins(b.leftMins))}</b><em>left</em></span>
            <span class="dcb-fig"><b id="dcb-in">${escHtml(fmtBlockMins(elapsed))}</b><em>elapsed</em></span>
            <span class="dcb-fig"><b>${Math.round(b.minutes / 60 * 10) / 10}h</b><em>the block</em></span>
            <span class="dcb-fig"><b>${escHtml(b.third || '')}</b><em>third of the day</em></span>
            <span class="dcb-fig wide"><b id="dcb-load">${escHtml(load)}</b><em>what is in it</em></span>
          </div>
          ${b.note ? `<div class="dcb-note">${escHtml(b.note)}</div>` : ''}
        </div>`;
      })() : ''}

      <div class="day-rail day-rail-24" id="day-rail">
        ${railPieces.join('')}
        <div class="day-rail-tick" style="left:25%"></div>
        <div class="day-rail-tick" style="left:50%"></div>
        <div class="day-rail-tick" style="left:75%"></div>
        <div class="day-rail-now" id="day-rail-now"
             style="left:${((nowRail / DAY_MIN) * 100).toFixed(3)}%">
          <svg class="rail-mark" viewBox="0 0 256 256" role="img" aria-label="Now">
            <mask id="rail-gap">
              <rect width="256" height="256" fill="#fff"/>
              <circle cx="196" cy="77" r="38" fill="#000"/>
            </mask>
            <circle class="rail-mark-ring" cx="128" cy="128" r="85" fill="none"
                    stroke-width="42" mask="url(#rail-gap)"/>
            <circle class="rail-mark-node" cx="196" cy="77" r="30"/>
          </svg>
        </div>
      </div>
      <div class="day-rail-axis"><span>05</span><span>11</span><span>17</span><span>23</span><span>05</span></div>

      <div class="day-capacity">
        <strong>${slots}</strong> half-hour slots a day across the four work blocks ·
        <strong>${open}</strong> open on the board${days ? ` · about <strong>${days.toFixed(1)}</strong> days of work at this capacity` : ''}
      </div>

      <div class="day-blocks day-blocks-window">
        ${dayWindow(bs, currentId, live).map(b => `
          <div class="day-block${b.id === currentId ? ' now' : ''}${b._rel === 'past' ? ' past' : ''}${b.placeable ? '' : ' day-block-personal'}">
            <div class="day-block-rel">${b._rel === 'past' ? 'just finished' : b._rel === 'next' ? 'next' : 'now'}</div>
            <div class="day-block-head">
              <span class="day-block-dot" style="background:${toneOf(b)}"></span>
              <span class="day-block-name" style="color:${toneOf(b)}">${escHtml(b.name)}</span>
              <span class="day-block-when">${escHtml(b.startClock)} - ${escHtml(b.endClock)}</span>
              ${b.quiet ? '<span class="day-block-quiet" title="No notification, reminder or meeting fires in here">quiet</span>' : ''}
              <span class="day-block-live" data-blk="${escAttr(b.id)}"></span>
              <span class="day-block-cap">${b.placeable ? `${(b.tasks||[]).length}/${b.slots}` : `${Math.round(b.minutes / 60 * 10) / 10}h`}</span>
            </div>
            ${b.id === currentId ? `<div class="day-block-prog" data-blk="${escAttr(b.id)}"><i style="width:0%;background:${toneOf(b)}"></i></div>` : ''}
            ${b.placeable
              ? ((b.tasks||[]).length ? `
                <div class="day-block-tasks">
                  ${b.tasks.map(t => `
                    <button class="day-task${t.overdue ? ' overdue' : ''}" onclick="openTask('${escAttr(t.id)}')"
                            title="${escAttr(`placed here because it ${t.why}`)}">
                      <span class="day-task-title">${escHtml(t.title)}</span>
                      <span class="day-task-meta">${t.overdue ? `overdue ${escHtml(t.due)}`
                        : t.dueToday ? 'due today' : escHtml(t.priority)}</span>
                    </button>`).join('')}
                </div>`
                : `<div class="day-block-empty">${b.done ? 'nothing was placed here' : 'nothing matched this block yet'}</div>`)
              : `<div class="day-block-note">${escHtml(b.note || 'personal time')}</div>`}
            ${b.placeable && b.note ? `<div class="day-block-note">${escHtml(b.note)}</div>` : ''}
          </div>`).join('')}
      </div>

      ${DAY.overflow?.length ? `
        <div class="day-overflow">
          <span class="day-overflow-head">${DAY.overflow.length} beyond today's capacity</span>
          ${DAY.overflow.slice(0, 4).map(t => `
            <button class="day-task" onclick="openTask('${escAttr(t.id)}')">
              <span class="day-task-title">${escHtml(t.title)}</span>
              <span class="day-task-meta">${t.overdue ? `overdue ${escHtml(t.due)}` : escHtml(t.priority)}</span>
            </button>`).join('')}
          ${DAY.overflow.length > 4 ? `<span class="card-meta">and ${DAY.overflow.length - 4} more on the board.</span>` : ''}
        </div>` : ''}

      ${DAY.unplaced?.length ? `
        <div class="day-unplaced">${DAY.unplaced.length} task${DAY.unplaced.length === 1 ? '' : 's'}
          matched no block: ${escHtml(DAY.unplaced.slice(0, 2).map(t => t.title).join('; '))}${
          DAY.unplaced.length > 2 ? ' and others' : ''}.</div>` : ''}
    </div>`;
}

/** 14 days of habit completion, oldest first - which days were kept, which dropped. */
function pulseDays(days = 14) {
  const total = (RHYTHM?.habits || []).length;
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const log = RHYTHM?.logs?.[date] || {};
    const done = Object.values(log).filter(Boolean).length;
    out.push({ date, done, total, frac: total ? Math.min(1, done / total) : 0, today: i === 0 });
  }
  return out;
}

/* ═══ THE FIELD - the only decoration on this surface ═══════════════════
 * A particle network behind everything, drifting slowly enough that you
 * never catch a single node moving. Fixed layout (not random) so a
 * re-render never reshuffles it. Two graphs, opposite rotation directions -
 * the parallax is what reads as depth instead of a spinning ornament.
 */
const CTX_FIELD = [
  { nodes: [[100,120],[148,158],[60,168],[122,206],[74,232],[142,252],[100,290],[56,124]],
    edges: [[0,1],[0,2],[1,3],[2,4],[3,4],[3,5],[4,6],[5,6],[0,7],[2,7]] },
  { nodes: [[80,150],[130,186],[92,224],[136,236],[64,196],[112,268],[86,102]],
    edges: [[0,1],[1,2],[2,3],[0,4],[4,2],[2,5],[3,5],[0,6]] },
];
function ctxField(isCritical) {
  const layer = (g, cls) => `
    <g class="ctx-net-layer ${cls}">
      ${g.edges.map(([a, b], i) =>
        `<line x1="${g.nodes[a][0]}" y1="${g.nodes[a][1]}" x2="${g.nodes[b][0]}" y2="${g.nodes[b][1]}"
               style="animation-delay:-${(i * 1.7).toFixed(1)}s"/>`).join('')}
      ${g.nodes.map(([x, y], i) => `
        <circle cx="${x}" cy="${y}" r="${i % 3 === 0 ? 1.8 : 1.2}"
                style="animation-delay:-${(i * 2.3).toFixed(1)}s;
                       animation-duration:${(7 + (i % 4) * 2.5).toFixed(1)}s"/>`).join('')}
    </g>`;
  return `
    <svg class="ctx-net${isCritical ? ' hot' : ''}" viewBox="0 0 200 400"
         preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      ${layer(CTX_FIELD[0], 'a')}${layer(CTX_FIELD[1], 'b')}
    </svg>`;
}

/**
 * THE TWO SLOTS - chosen, not fixed. Every fact the console holds that
 * could deserve a slot declares itself as a candidate with a score, and the
 * two highest win. Ordered by consequence: nothing syncing > a meeting
 * starting now > overdue > critical > weather about to matter > due today >
 * in review > unseen alerts > next priority > rhythm > the board/clear.
 * Never the same kind twice, never the same task twice under two labels.
 * Ported verbatim from isconl-agent dev branch's ctxSlots().
 */
function ctxSlots() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const tasks = (STATE.tasks || []).filter(t => (t.STATUS || '').toLowerCase() !== 'done');
  const due = (t) => (t.DUE_DATE && t.DUE_DATE !== '-' ? t.DUE_DATE : null);
  const byDue = tasks.filter(due).sort((a, b) => due(a).localeCompare(due(b)));
  const evMin = (e) => { const m = /^(\d{1,2}):(\d{2})/.exec(e.time || ''); return m ? (+m[1] * 60 + +m[2]) : null; };
  const mins = (m) => m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
  const s = [];

  const ms = STATE.services?.msgraph;
  if (ms && ms !== 'connected') s.push({ key: 'sync', score: 99, tone: 'hot',
    head: 'Not syncing', lead: 'OneDrive disconnected',
    meta: 'work stays on this machine', go: "navigate('settings')" });

  const day = localDayNow();
  if (day?.current) {
    const cur = day.current;
    const first = cur.tasks?.[0];
    const say = fmtBlockMins;
    s.push({ key: 'block', score: 94, task: first?.id,
      head: `${cur.name} · ${say(cur.leftMins)} left`,
      lead: first ? first.title
        : cur.placeable ? `Nothing placed in ${cur.name.toLowerCase()}`
        : (cur.note || `${cur.name} - personal time`),
      meta: first ? (first.overdue ? `overdue ${first.due}` : first.dueToday ? 'due today' : first.priority)
        : `${cur.startClock} - ${cur.endClock}${cur.quiet ? ' · quiet' : ''}`,
      go: first ? `openTask('${escAttr(first.id)}')` : "navigate('today')" });
  }

  const overdue = byDue.filter(t => due(t) < today);
  if (overdue.length) s.push({ key: 'overdue', score: 96, tone: 'hot', task: overdue[0].ID,
    head: overdue.length > 1 ? `Overdue · ${overdue.length}` : 'Overdue',
    lead: overdue[0].TITLE, meta: `was due ${due(overdue[0])}`,
    go: `openTask('${escAttr(overdue[0].ID)}')` });

  const critical = tasks.find(t => t.PRIORITY === 'critical');
  if (critical) s.push({ key: 'critical', score: 92, tone: 'hot', task: critical.ID,
    head: 'Critical', lead: critical.TITLE,
    meta: due(critical) ? `due ${due(critical)}` : 'no date set',
    go: `openTask('${escAttr(critical.ID)}')` });

  const ev = (STATE.calendarEvents || [])
    .filter(e => e.date > today || (e.date === today && (evMin(e) === null || evMin(e) >= nowMin - 5)))
    .sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`))[0];
  if (ev) {
    const until = ev.date === today && evMin(ev) !== null ? evMin(ev) - nowMin : null;
    const dayGap = Math.round((new Date(ev.date) - new Date(today)) / 86400000);
    const score =
      until !== null
        ? (until <= 5 ? 98 : until <= 15 ? 97 : until <= 60 ? 95 : until <= 120 ? 93 : 88)
        : dayGap <= 0 ? 88
        : dayGap === 1 ? 80
        : dayGap <= 7 ? 74 : 64;
    const head = until !== null && until <= 5 ? 'Starting now'
      : until !== null && until <= 60 ? `In ${mins(until)}`
      : ev.date === today ? 'Later today'
      : dayGap === 1 ? 'Tomorrow' : 'Ahead';
    const isMeeting = (ev.category || '') === 'meeting';
    s.push({ key: 'event', score,
      tone: until !== null && until <= 60 ? 'hot' : undefined,
      head, lead: ev.title || 'untitled event',
      meta: [ev.date === today ? (ev.time || 'today, all day') : `${ev.date}${ev.time && ev.time !== 'TBC' ? ` · ${ev.time}` : ''}`,
             until !== null && until > 5 ? `in ${mins(until)}` : '',
             isMeeting && until !== null && until <= 120 ? 'open the prep' : ''].filter(Boolean).join(' · '),
      go: "navigate('calendar')" });
  }

  const dueToday = byDue.filter(t => due(t) === today);
  if (dueToday.length) s.push({ key: 'today', score: 84, task: dueToday[0].ID,
    head: dueToday.length > 1 ? `Due today · ${dueToday.length}` : 'Due today',
    lead: dueToday[0].TITLE,
    meta: (dueToday[0].STATUS || 'open').toUpperCase(),
    go: `openTask('${escAttr(dueToday[0].ID)}')` });

  const inReview = tasks.filter(t => (t.STATUS || '').toLowerCase() === 'in review');
  if (inReview.length) s.push({ key: 'review', score: 76, num: true,
    head: 'Waiting on you', lead: String(inReview.length),
    meta: 'in review - only you close them', go: "navigate('tasks')" });

  const unseen = (STATE.notifications || []).filter(n => !n.SEEN_AT || n.SEEN_AT === '-');
  if (unseen.length) s.push({ key: 'alerts', score: 72, num: true,
    head: 'Unseen alerts', lead: String(unseen.length),
    meta: unseen[0].TITLE || 'unread', go: "navigate('notifications')" });

  if (WEATHER && !WEATHER.unavailable && WEATHER.now) {
    const w = WEATHER;
    const advice = w.advice || [];
    const stale = w.fresh === false;
    const ageM = w.ageMinutes;
    const minsTo = (hhmm) => {
      const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
      if (!m) return null;
      const t = (+m[1]) * 60 + (+m[2]);
      return t - nowMin;
    };
    let soonest = null, lead = null;
    for (const a of advice) {
      const d = a.at ? minsTo(a.at) : null;
      if (d != null && d >= -15 && (lead == null || d < lead)) { lead = d; soonest = a; }
    }
    const dayLevel = advice.find(a => !a.at) || null;
    let score = 8, head = 'Weather', body = null;
    if (soonest && lead != null && lead <= 45) {
      score = 86; head = lead <= 5 ? 'Now' : `In ${mins(Math.max(0, lead))}`; body = soonest;
    } else if (soonest && lead != null && lead <= 150) {
      score = 66; head = `At ${soonest.at}`; body = soonest;
    } else if (dayLevel) {
      score = 40; head = 'Today'; body = dayLevel;
    } else if (advice.length) {
      score = 22; head = 'Later'; body = advice[0];
    }
    if (stale) score = Math.round(score * 0.75);
    if (body) {
      s.push({ key: 'weather', score,
        tone: score >= 80 ? 'hot' : undefined,
        head, lead: body.text,
        meta: [`${Math.round(w.now.temp)}${w.units.temp} ${w.now.text.toLowerCase()}`,
               escHtml(w.place),
               stale ? `reading ${ageM != null ? `${ageM} min` : 'age unknown'} old` : ''].filter(Boolean).join(' · '),
        go: "navigate('calendar')" });
    }
  }

  const high = tasks.find(t => t.PRIORITY === 'high');
  if (high) s.push({ key: 'high', score: 58, task: high.ID,
    head: 'Next priority', lead: high.TITLE,
    meta: due(high) ? `due ${due(high)}` : (high.STATUS || 'open').toUpperCase(),
    go: `openTask('${escAttr(high.ID)}')` });

  const hb = pulseDays(1)[0];
  if (hb?.total && hb.done < hb.total) s.push({ key: 'habits', score: nowMin < 18 * 60 ? 44 : 20,
    num: true, head: 'Rhythm', lead: `${hb.done}/${hb.total}`,
    meta: `${hb.total - hb.done} habits left today`, go: "navigate('rhythm')" });

  if (tasks.length) s.push({ key: 'board', score: 12, num: true,
    head: 'The board', lead: String(tasks.length),
    meta: [`${inReview.length} in review`, overdue.length ? `${overdue.length} overdue` : '']
      .filter(Boolean).join(' · '), go: "navigate('tasks')" });
  s.push({ key: 'clear', score: 8, head: 'Clear', lead: 'Queue clear',
    meta: 'nothing waiting on you', go: "navigate('tasks')" });

  const picked = [];
  for (const c of s.sort((a, b) => b.score - a.score)) {
    if (picked.length === 2) break;
    if (picked.some(p => p.key === c.key)) continue;
    if (c.task && picked.some(p => p.task === c.task)) continue;
    picked.push(c);
  }
  return picked;
}

/** One slot, in the console's card. Counts read as numbers, not as sentences. */
function ctxCard(c) {
  return `
    <div class="card ctx-card clickable${c.tone === 'hot' ? ' ctx-card-hot' : ''}"
         data-slot="${escAttr(c.key || '')}"
         role="button" tabindex="0" onclick="${c.go}"
         onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}"
         title="${escAttr(c.lead)}">
      <div class="ctx-card-head">${escHtml(c.head)}</div>
      <div class="ctx-card-lead${c.num ? ' ctx-card-num' : ''}">${escHtml(c.lead)}</div>
      <div class="ctx-card-meta">${escHtml(c.meta)}</div>
    </div>`;
}

/** The meeting pair -- declared for a future live-meeting integration; CONTEXT_MEETING never actually populates today. */
function ctxMeetingCards(m) {
  const mins = Math.floor((m.elapsedSec || 0) / 60);
  const secs = String((m.elapsedSec || 0) % 60).padStart(2, '0');
  const level = Math.max(0, Math.min(1, m.level || 0));
  const marks = (m.marks || []).slice(-3).reverse();
  return `
    <div class="card ctx-card ctx-card-live">
      <div class="ctx-card-head">Recording</div>
      <div class="ctx-card-lead ctx-card-num">${mins}:${secs}</div>
      <div class="ctx-level"><span style="width:${(level * 100).toFixed(0)}%"></span></div>
      <div class="ctx-card-meta">${escHtml(m.source || 'microphone')}</div>
    </div>
    <div class="card ctx-card">
      <div class="ctx-card-head">Marks ${marks.length ? `· ${(m.marks || []).length}` : ''}</div>
      ${marks.length
        ? marks.map(k => `<div class="ctx-mark"><span>${escHtml(k.at || '')}</span> ${escHtml(k.note || 'marked')}</div>`).join('')
        : '<div class="ctx-card-meta">Tap mark when something matters. The timestamp is kept even if the transcript is not.</div>'}
    </div>`;
}

/**
 * The Context rail: a 60/40 split - the working day drawn as an orbital
 * ring (60%), and the two highest-scoring signal cards (40%). Ported from
 * isconl-agent dev branch's renderRailContext(), targeting vault's real
 * /api/blocks and /api/time instead of the monolith's.
 */
function renderRailContext() {
  const container = document.getElementById('chat-rail-context');
  if (!container) return;
  fetchDay();
  startCtxClock();

  const tasks = (STATE.tasks || []).filter(t => t.STATUS !== 'done');
  const criticalTask = tasks.find(t => t.PRIORITY === 'critical');
  const isCritical = !!criticalTask;
  const unseen = (STATE.notifications || []).filter(n => !n.SEEN_AT || n.SEEN_AT === '-').length;
  const live = CONTEXT_MEETING;

  const activity = Math.min(1, (unseen * 0.12) + (tasks.length * 0.04));
  const spin = (base) => (isCritical ? base * 0.3 : base * (1 - activity * 0.55)).toFixed(1);

  const accentBright = isCritical ? '#ff7b72' : 'var(--green-bright)';
  const rgb = isCritical ? '248,81,73' : '63,185,80';

  const dayFrac = workingDayFraction();
  const day = workingDayLeft();
  const REST = -36.869898;   // the brand mark's own rest angle - a still frame of this ring IS the logo

  container.innerHTML = `
    ${ctxField(isCritical)}
    <div class="ctx">
      <div class="ctx-viz${isCritical ? ' ctx-critical' : ''}">
        <div class="ctx-viz-tag">
          <span class="badge ${isCritical ? 'badge-high' : 'badge-low'}"
                style="font-size:0.55rem;font-family:var(--font-mono)">
            ${live ? 'MEETING LIVE' : isCritical ? 'CRITICAL VECTOR' : 'LIVE'}
          </span>
        </div>

        <svg class="ctx-orb" viewBox="0 0 256 256" aria-label="The working day">
          <defs>
            <linearGradient id="ctx-day-grad" gradientUnits="userSpaceOnUse"
                            x1="43" y1="128" x2="213" y2="128">
              <stop offset="0"  style="stop-color:${isCritical ? '#8b1e17' : 'var(--green-dim)'}"/>
              <stop offset="1"  style="stop-color:${isCritical ? 'var(--red)' : 'var(--green)'}"/>
            </linearGradient>
          </defs>

          <circle cx="128" cy="128" r="118" fill="none" stroke="rgba(${rgb},0.16)"
                  stroke-width="1" stroke-dasharray="3 7"
                  style="transform-origin:50% 50%;animation:ctx-spin ${spin(26)}s linear infinite"/>

          <circle cx="128" cy="128" r="85" fill="none" stroke="var(--border)" stroke-width="6"/>
          <circle cx="128" cy="128" r="85" fill="none" stroke="url(#ctx-day-grad)" stroke-width="6"
                  stroke-linecap="round" stroke-dasharray="534.0708" id="ctx-day-arc"
                  stroke-dashoffset="${(534.0708 * (1 - dayFrac)).toFixed(2)}"
                  transform="rotate(${REST} 128 128)"
                  style="transition:stroke-dashoffset 900ms cubic-bezier(.65,0,.35,1)"/>

          <circle cx="128" cy="128" r="56" fill="rgba(${rgb},0.08)"/>
          <text x="128" y="124" text-anchor="middle" class="ctx-core-num" id="ctx-core-num"
                fill="${accentBright}">${day.big}</text>
          <text x="128" y="142" text-anchor="middle" class="ctx-core-lbl" id="ctx-core-lbl">${day.label}</text>
          <text x="128" y="158" text-anchor="middle" class="ctx-core-sub" id="ctx-core-sub">${day.sub}</text>
        </svg>
      </div>

      <div class="ctx-sec-tag"><span class="badge badge-low">${live ? 'IN SESSION' : 'SIGNALS'}</span></div>
      <div class="ctx-cards">
        ${live ? ctxMeetingCards(live) : ctxSlots().map(ctxCard).join('')}
      </div>
    </div>`;
}

/**
 * The perpetual clock: patches the orb's numbers and arc in place every
 * second rather than re-rendering the rail, so the draw-in animation never
 * restarts and an open editor is never fought. Scoped to just the Context
 * panel's own elements -- the dev branch's original also patched a "Day
 * Blocks" Hub card and a calendar day-space that don't exist here.
 */
let ctxLastBlockId = null;
let ctxClockTimer = null;
let clockSyncTimer = null;

function ctxTick() {
  const day = workingDayLeft();
  const num = document.getElementById('ctx-core-num');
  if (num) {
    const lbl = document.getElementById('ctx-core-lbl');
    const sub = document.getElementById('ctx-core-sub');
    const arc = document.getElementById('ctx-day-arc');
    if (num.textContent !== day.big) num.textContent = day.big;
    if (lbl && lbl.textContent !== day.label) lbl.textContent = day.label;
    const subText = CLOCK.trusted ? day.sub : `${day.sub} · device clock`;
    if (sub && sub.textContent !== subText) sub.textContent = subText;
    if (sub) {
      sub.setAttribute('title', CLOCK.trusted
        ? `Synced to the agent${CLOCK.driftMs != null ? `; this device was ${CLOCK.driftMs > 0 ? 'behind' : 'ahead'} by ${Math.abs(CLOCK.driftMs)} ms` : ''}${CLOCK.rttMs != null ? `, round trip ${CLOCK.rttMs} ms` : ''}`
        : 'The agent has not answered, so this is the device clock and may be wrong.');
    }
    if (arc) arc.setAttribute('stroke-dashoffset', (534.0708 * (1 - workingDayFraction())).toFixed(2));
  }

  const d = localDayNow();
  if (d) {
    // The current block's countdown is patched every second (not just on
    // transition), so the rail never shows a minute that's up to 60s stale.
    const blockCard = document.querySelector('.ctx-card[data-slot="block"] .ctx-card-head');
    if (blockCard && d.current) {
      const txt = `${d.current.name} · ${fmtBlockMins(d.current.leftMins)} left`;
      if (blockCard.textContent !== txt) blockCard.textContent = txt;
    }

    // The Hub's day card shares this same tick - marker slides, the line
    // re-reads, block-by-block countdowns and the current block's progress
    // bar update in place, so the card never re-renders while it's on
    // screen. Ported from legacy's ctxTick (~9224-9312).
    const marker = document.getElementById('day-rail-now');
    if (marker) marker.style.left = `${((((d.mins - 300) % 1440 + 1440) % 1440) / 1440 * 100).toFixed(3)}%`;
    const dayLine = document.getElementById('day-card-line');
    if (dayLine) {
      const txt = workingDayLeftLine(d);
      if (dayLine.textContent !== txt) dayLine.textContent = txt;
    }
    for (const el of document.querySelectorAll('.day-block-live')) {
      const b = (dayNow()?.blocks || []).find(x => x.id === el.dataset.blk);
      if (!b) continue;
      const wraps = b.end <= b.start;
      const inside = wraps ? (d.mins >= b.start || d.mins < b.end) : (d.mins >= b.start && d.mins < b.end);
      let txt = '', cls = 'day-block-live';
      if (inside) {
        const leftM = wraps && d.mins >= b.start ? (b.end + 1440) - d.mins : b.end - d.mins;
        txt = `${fmtBlockMins(leftM)} left`; cls += ' on';
      } else if (b.start > d.mins) {
        txt = `in ${fmtBlockMins(b.start - d.mins)}`;
      } else {
        txt = 'done'; cls += ' done';
      }
      if (el.textContent !== txt) el.textContent = txt;
      if (el.className !== cls) el.className = cls;
    }
    for (const el of document.querySelectorAll('.day-block-prog')) {
      const b = (dayNow()?.blocks || []).find(x => x.id === el.dataset.blk);
      if (!b || !b.minutes) continue;
      const wraps = b.end <= b.start;
      const leftM = wraps && d.mins >= b.start ? (b.end + 1440) - d.mins : b.end - d.mins;
      const pct = Math.max(0, Math.min(100, ((b.minutes - leftM) / b.minutes) * 100));
      const bar = el.firstElementChild;
      if (bar) bar.style.width = `${pct.toFixed(2)}%`;
    }
    if (d.current) {
      const b = d.current;
      const elapsed = Math.max(0, b.minutes - b.leftMins);
      const setTxt = (id, v) => { const el = document.getElementById(id); if (el && el.textContent !== v) el.textContent = v; };
      setTxt('dcb-left', fmtBlockMins(b.leftMins));
      setTxt('dcb-in', fmtBlockMins(elapsed));
      setTxt('dcb-load', b.placeable ? `${b.tasks?.length ?? 0} of ${b.slots} slots filled` : 'personal time, no board work');
      const bar = document.getElementById('dcb-bar');
      if (bar && b.minutes) bar.style.width = `${((elapsed / b.minutes) * 100).toFixed(2)}%`;
    }

    // A block CHANGE is structural (which two cards win can change), so the
    // rail repaints once on the transition rather than patching numbers.
    // The Hub's day card repaints too, for the same reason (task lists,
    // now/next labels are structural, not numbers to patch in place).
    if ((d.current?.id || null) !== ctxLastBlockId) {
      ctxLastBlockId = d.current?.id || null;
      refreshContextIfActive();
      const slot = document.getElementById('day-card-slot');
      if (slot) slot.innerHTML = renderDayBlocks();
    }
  }
}

function startCtxClock() {
  if (ctxClockTimer) return;
  ctxTick();
  ctxClockTimer = setInterval(ctxTick, 1000);
  // Monotonic time doesn't drift the way a wall clock does, but
  // performance.now() can still skew slightly over long uptimes.
  clockSyncTimer = setInterval(() => { syncClock().then(ctxTick); }, 10 * 60 * 1000);
  // A sleeping laptop stops timers mid-flight; re-sync on wake rather than
  // trusting a counter that may not have advanced across suspend.
  const wake = () => { if (!document.hidden) syncClock().then(ctxTick); };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('focus', wake);
  window.addEventListener('online', wake);
}

// Auto-refresh Context HUD whenever notifications or STATE changes
function refreshContextIfActive() {
  if (currentRailMode === 'context') renderRailContext();
}

function readerClose() {
  const dock = document.getElementById('reader-dock');
  if (dock) dock.classList.add('hidden');
  document.getElementById('app')?.classList.remove('reader-open');
  if (readerBlobUrl) { URL.revokeObjectURL(readerBlobUrl); readerBlobUrl = null; }
  setRailMode(prevRailMode && prevRailMode !== 'reader' ? prevRailMode : 'chat');
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.getElementById('reader-dock')?.classList.contains('hidden')) readerClose();
});

const READER_KB = (b) => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

/**
 * EDITING IN THE READER.
 *
 * Markdown documents can be edited where they are read. The rules exist
 * because in-place editing broke things before:
 *
 *   - EXPLICIT MODE. Reading is the default; you press Edit. A reading pane
 *     that is silently a text field is how stray keystrokes become commits.
 *   - THE BASELINE IS CHECKED. The text loaded is remembered, and the save
 *     refuses if the file on disk changed underneath - it never overwrites an
 *     edit made elsewhere (in Word, by the agent, on another device).
 *   - NOT REALTIME-PER-KEYSTROKE. A debounced autosave against a synced file
 *     is exactly what corrupted work before: every pause raced the mirror.
 *     Saving is one deliberate action, and it does the whole job atomically -
 *     previous version to the trash, bytes to disk, OneDrive mirrored, Word
 *     twin rebuilt if one exists. Realtime where it counts: by the time the
 *     toast appears, every copy agrees.
 *   - ESCAPE HATCH. Cancel restores the rendered document, unchanged.
 */
let readerEditable = null;   // { file, name, text } for the document on screen
let readerEditing = false;
let readerAutosaveTimer = null;

function readerAddEditAffordance() {
  if (!readerEditable) return;
  const head = document.querySelector('.reader-tools');
  if (!head || document.getElementById('reader-edit-btn')) return;
  const b = document.createElement('button');
  b.className = 'chat-tool'; b.id = 'reader-edit-btn';
  b.title = 'Edit this document';
  b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
  b.onclick = readerStartEdit;
  head.insertBefore(b, head.firstChild);
}

function readerStartEdit() {
  if (!readerEditable || readerEditing) return;
  readerEditing = true;
  const el = document.getElementById('reader-body');
  el.innerHTML = `
    <div class="reader-edit">
      <div class="reader-edit-note">Editing <strong>${escHtml(readerEditable.name)}</strong>.
        Changes autosave after typing and when you press Save. Previous version is backed up.</div>
      <textarea id="reader-edit-text" class="reader-edit-area" spellcheck="true" oninput="readerOnInput()">${escHtml(readerEditable.text)}</textarea>
      <div class="doc-actions" style="padding:0.5rem 0 0">
        <button class="btn btn-primary doc-act" onclick="readerSaveEdit(this)">Save</button>
        <button class="btn btn-ghost doc-act" onclick="readerCancelEdit()">Cancel</button>
        <span class="card-meta" id="reader-edit-status"></span>
      </div>
    </div>`;
  document.getElementById('reader-edit-text')?.focus();
}

function readerOnInput() {
  const status = document.getElementById('reader-edit-status');
  if (status) status.textContent = 'Unsaved changes…';
  clearTimeout(readerAutosaveTimer);
  readerAutosaveTimer = setTimeout(() => {
    const saveBtn = document.querySelector('.reader-edit .btn-primary');
    readerSaveEdit(saveBtn, true);
  }, 2500);
}

function readerCancelEdit() {
  clearTimeout(readerAutosaveTimer);
  readerEditing = false;
  if (!readerEditable) return readerClose();
  if (readerEditable.isMd) {
    readerBody(`<div class="lesson-body">${refChips(learnMd(readerEditable.text))}</div>`);
  } else {
    readerBody(`<pre class="reader-pre">${escHtml(readerEditable.text)}</pre>`);
  }
}

async function readerSaveEdit(btn, isAutosave = false) {
  clearTimeout(readerAutosaveTimer);
  const ta = document.getElementById('reader-edit-text');
  if (!ta || !readerEditable) return;
  const next = ta.value;
  if (next === readerEditable.text) {
    if (!isAutosave) { showToast('Nothing changed', 'info'); readerCancelEdit(); }
    return;
  }
  const was = btn ? btn.textContent : 'Save';
  if (btn && !isAutosave) { btn.disabled = true; btn.textContent = 'Saving…'; }
  const status = document.getElementById('reader-edit-status');
  if (status) status.textContent = isAutosave ? 'Autosaving…' : 'Saving…';
  try {
    const r = await fetch('/api/documents/edit', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: readerEditable.file, text: next, baseline: readerEditable.text }) });
    const d = await r.json();
    if (!d.success) throw new Error(d.error || 'refused');
    readerEditable.text = next;
    if (status) status.textContent = `Saved${d.mirrored ? ' · on OneDrive' : ''}`;
    if (!isAutosave) {
      readerEditing = false;
      if (readerEditable.isMd) {
        readerBody(`<div class="lesson-body">${refChips(learnMd(next))}</div>`);
      } else {
        readerBody(`<pre class="reader-pre">${escHtml(next)}</pre>`);
      }
      showToast(`Saved${d.mirrored ? ' · on OneDrive' : ''}${d.twin ? ` · Word twin rebuilt (${d.twinWords} words)` : ''}. Previous version kept.`, 'success');
      if (typeof taskDetailId !== 'undefined' && taskDetailId) fetchTaskDocs(taskDetailId);
    }
  } catch (e) {
    if (status) status.textContent = `Save failed: ${e.message}`;
    if (!isAutosave) showToast(`Not saved: ${e.message}`, 'error');
  } finally {
    if (btn && !isAutosave) { btn.disabled = false; btn.textContent = was; }
  }
}

/** Open by bare name: locate first, then render. What the doc chips call. */
async function readerOpenByName(name) {
  readerShell(name, 'finding it…');
  try {
    const d = await (await fetch(`/api/documents/locate?name=${encodeURIComponent(name)}`)).json();
    if (!d.found) {
      readerBody(`<div class="reader-note">Not found in the work folders, the vault, or OneDrive.
        If it was renamed, the reference is stale.</div>`);
      readerMeta('nowhere on record');
      return;
    }
    await readerRender(d);
  } catch (e) { readerBody(`<div class="reader-note">${escHtml(e.message)}</div>`); }
}

/** Open by known file token (a deliverable row already knows its rel). */
async function readerOpenByFile(file, name, meta = {}) {
  readerShell(name || file.split('/').pop(), 'opening…');
  await readerRender({ found: true, file, name: name || file.split('/').pop(),
    where: file.startsWith('vault:') ? 'vault' : 'workspace',
    ext: (name || file).slice((name || file).lastIndexOf('.')).toLowerCase(), ...meta });
}

function readerShell(name, note) {
  const dock = document.getElementById('reader-dock');
  if (!dock) return;   // callers check readerAvailable() first; this is the last line of defence
  dock.classList.remove('hidden');
  document.getElementById('app')?.classList.add('reader-open');
  document.getElementById('reader-name').textContent = name;
  document.getElementById('reader-meta').textContent = '';
  document.getElementById('reader-download').style.display = 'none';
  readerBody(`<div class="reader-loading"><div class="spinner-inline"></div><div>${escHtml(note || 'opening…')}</div></div>`);
}
function readerBody(html) { const el = document.getElementById('reader-body'); if (el) el.innerHTML = html; }
function readerMeta(text) { const el = document.getElementById('reader-meta'); if (el) el.textContent = text; }

async function readerRender(d) {
  if (readerBlobUrl) { URL.revokeObjectURL(readerBlobUrl); readerBlobUrl = null; }
  const whereLabel = d.where === 'vault' ? 'in the vault'
                   : d.where === 'workspace' ? 'in the work folders' : 'on OneDrive';
  readerMeta([whereLabel, d.bytes ? READER_KB(d.bytes) : '', d.modified || ''].filter(Boolean).join(' · '));
  document.getElementById('reader-name').textContent = d.name || 'document';

  // Download is honest everywhere: local files stream through raw; a file that
  // only exists on OneDrive hands over its OneDrive page instead.
  const dl = document.getElementById('reader-download');
  if (d.file) {
    dl.style.display = '';
    dl.onclick = () => downloadDocument(d.file, d.name, dl);
  } else if (d.webUrl) {
    dl.style.display = '';
    dl.onclick = () => window.open(d.webUrl, '_blank', 'noreferrer');
  } else dl.style.display = 'none';

  const ext = String(d.ext || '').toLowerCase();
  const isMd = /\.(md|markdown|mdown|mkd)$/i.test(ext) || /\.md$/i.test(d.file || d.name || '');

  // OneDrive-only: no bytes to render here - say so and hand over the link.
  if (!d.file) {
    readerBody(`<div class="reader-note">This copy lives on OneDrive only - nothing local to render.
      ${d.webUrl ? `<a class="btn btn-ghost doc-act" href="${escAttr(d.webUrl)}" target="_blank" rel="noreferrer" style="margin-top:0.5rem">Open on OneDrive ↗</a>` : ''}</div>`);
    return;
  }

  try {
    if (ext === '.pdf') {
      const pdfUrl = `/api/documents/raw?file=${encodeURIComponent(d.file)}`;
      readerBody(`<object class="reader-pdf" data="${pdfUrl}" type="application/pdf" width="100%" height="100%"><iframe class="reader-pdf" src="${pdfUrl}" title="${escAttr(d.name || 'PDF')}"></iframe></object>`);
      return;
    }
    if (/\.(png|jpe?g|gif|webp|svg|ico|bmp)$/.test(ext)) {
      const r = await fetch(`/api/documents/raw?file=${encodeURIComponent(d.file)}`);
      if (!r.ok) throw new Error('could not fetch the file');
      readerBlobUrl = URL.createObjectURL(await r.blob());
      readerBody(`<img src="${readerBlobUrl}" alt="${escAttr(d.name || 'image')}"/>`);
      return;
    }
    if (/\.(mp3|wav|ogg|opus|m4a)$/.test(ext)) {
      const mediaUrl = `/api/documents/raw?file=${encodeURIComponent(d.file)}`;
      readerBody(`<div style="padding:2rem;text-align:center"><audio controls src="${mediaUrl}" style="width:100%;max-width:500px"></audio></div>`);
      return;
    }
    if (/\.(mp4|webm|mov)$/.test(ext)) {
      const mediaUrl = `/api/documents/raw?file=${encodeURIComponent(d.file)}`;
      readerBody(`<div style="padding:1rem;text-align:center"><video controls src="${mediaUrl}" style="width:100%;max-height:70vh;border-radius:6px"></video></div>`);
      return;
    }

    if (isMd && d.preview?.text) {
      readerBody(`<div class="lesson-body">${refChips(learnMd(d.preview.text))}</div>`);
    }

    let rd;
    try {
      const rr = await fetch(`/api/documents/render?file=${encodeURIComponent(d.file)}`,
        { signal: AbortSignal.timeout(25_000) });
      if (!rr.ok) throw new Error(`the server answered ${rr.status}`);
      rd = await rr.json();
    } catch (e) {
      if (e.name === 'TimeoutError' || /abort/i.test(e.name || '')) {
        e = new Error('the read took longer than 25 seconds - OneDrive may be busy, try again in a moment');
      }
      const el = document.getElementById('reader-body');
      if (el && !el.querySelector('.lesson-body')) {
        readerBody(`<div class="reader-note">Could not read the full document: ${escHtml(e.message)}.
          ${d.webUrl ? `<a class="btn btn-ghost doc-act" href="${escAttr(d.webUrl)}" target="_blank" rel="noreferrer" style="margin-top:0.5rem">Open on OneDrive ↗</a>` : ''}</div>`);
      } else if (el) {
        el.insertAdjacentHTML('afterbegin',
          `<div class="reader-note">Showing the stored preview - the full read failed: ${escHtml(e.message)}</div>`);
      }
      return;
    }
    const text = rd.full || rd.preview?.text || '';

    if (isMd) {
      readerBody(`<div class="lesson-body">${refChips(learnMd(text))}</div>`);
      readerEditable = { file: d.file, name: d.name, text, isMd: true };
      readerAddEditAffordance();
    } else if (ext === '.csv' || ext === '.tsv') {
      const sep = ext === '.tsv' ? '\t' : ',';
      const rows = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 300);
      readerBody(`<div class="reader-tablewrap"><table class="reader-table">
        ${rows.map(l => `<tr>${l.split(sep).map(c => `<td>${escHtml(c)}</td>`).join('')}</tr>`).join('')}
      </table></div>${text.split(/\r?\n/).length > 300 ? '<div class="reader-note">First 300 rows - download for the rest.</div>' : ''}`);
      readerEditable = { file: d.file, name: d.name, text, isMd: false };
      readerAddEditAffordance();
    } else if (ext === '.docx') {
      readerBody(`<div class="lesson-body">${text.split(/\n{2,}/).filter(p => p.trim())
        .map(p => `<p>${escHtml(p.trim())}</p>`).join('')}</div>`);
    } else if (ext === '.xlsx' || ext === '.xls') {
      readerBody(`${rd.preview?.cells ? `<div class="reader-note">${rd.preview.cells} text cells - layout lives in the sheet itself; download or open the OneDrive copy for the real grid.</div>` : ''}
        <pre class="reader-pre">${escHtml(text)}</pre>`);
    } else if (text) {
      readerBody(`<pre class="reader-pre">${escHtml(text)}</pre>`);
      readerEditable = { file: d.file, name: d.name, text, isMd: false };
      readerAddEditAffordance();
    } else {
      readerBody(`<div class="reader-note">${escHtml(rd.note || 'No preview for this type - download to open it properly.')}</div>`);
    }
  } catch (e) {
    readerBody(`<div class="reader-note">${escHtml(e.message)}</div>`);
  }
}

/** Every document reference lands here; the dock takes it on desktop. */
async function openDocRef(name) {
  if (readerAvailable()) return readerOpenByName(name);
  let overlay = document.getElementById('chase-overlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'chase-overlay';
  overlay.className = 'chase-overlay';
  overlay.innerHTML = `<div class="chase-box"><div class="brief-pending">
    <div class="spinner-inline"></div><div>Finding ${escHtml(name)}…</div></div></div>`;
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
  try {
    const r = await fetch(`/api/documents/locate?name=${encodeURIComponent(name)}`);
    const d = await r.json();
    const box = overlay.querySelector('.chase-box');
    if (!d.found) {
      box.innerHTML = `<div class="chase-head"><div><strong>${escHtml(name)}</strong></div>
        <button class="btn btn-ghost" style="font-size:0.7rem" onclick="document.getElementById('chase-overlay').remove()">Close</button></div>
        <div class="empty-state">Not found in the work folders, the vault, or OneDrive. If it was renamed, the reference is stale.</div>`;
      return;
    }
    const whereLabel = d.where === 'vault' ? 'in the vault' : d.where === 'workspace' ? 'in the work folders' : 'on OneDrive';
    box.innerHTML = `
      <div class="chase-head">
        <div><strong>${escHtml(d.name || name)}</strong>
          <span class="card-meta"> · ${whereLabel}${d.bytes ? ` · ${d.bytes >= 1048576 ? (d.bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(d.bytes / 1024)) + ' KB'}` : ''}${d.modified ? ` · ${escHtml(d.modified)}` : ''}</span></div>
        <button class="btn btn-ghost" style="font-size:0.7rem" onclick="document.getElementById('chase-overlay').remove()">Close</button>
      </div>
      ${d.kind === 'image' && d.dataUri ? `<img class="doc-image" src="${d.dataUri}" alt="${escHtml(name)}"/>` : ''}
      ${d.preview?.text ? `<pre class="doc-text" id="docref-text" style="max-height:22rem">${escHtml(d.preview.text)}${d.preview.truncated ? '\n\n[…preview - Read all shows the rest]' : ''}</pre>` : ''}
      ${d.note && !d.preview?.text ? `<div class="doc-note">${escHtml(d.note)}</div>` : ''}
      <div class="doc-actions" style="padding:0.55rem 0 0">
        ${d.file && d.preview?.truncated ? `<button class="btn btn-ghost doc-act" onclick="docRefReadAll('${escAttr(d.file)}')">Read all</button>` : ''}
        ${d.file ? `<button class="btn btn-ghost doc-act" onclick="downloadDocument('${escAttr(d.file)}','${escAttr(d.name || name)}',this)">Download</button>` : ''}
        ${d.file && d.where === 'workspace' ? `<button class="btn btn-ghost doc-act" onclick="openDocument('${escAttr(d.file)}',this)">Open here</button>` : ''}
        ${d.webUrl ? `<a class="btn btn-ghost doc-act" href="${escAttr(d.webUrl)}" target="_blank" rel="noreferrer">OneDrive ↗</a>` : ''}
      </div>`;
  } catch (e) {
    const box = overlay.querySelector('.chase-box');
    if (box) box.innerHTML = `<div class="empty-state">${escHtml(e.message)}</div>`;
  }
}

async function docRefReadAll(file) {
  const el = document.getElementById('docref-text');
  if (!el) return;
  try {
    const d = await (await fetch(`/api/documents/render?file=${encodeURIComponent(file)}`)).json();
    if (d.full || d.preview?.text) el.textContent = d.full || d.preview.text;
  } catch { /* the preview stands */ }
}

function briefText(s) {
  return refChips(escHtml(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'));
}

function renderBriefBody(brief) {
  if (briefPending) {
    return `<div class="brief-pending">
      <div class="spinner-inline"></div>
      <div>
        <div>Thinking locally…</div>
        <div class="brief-pending-note">Task titles can name colleagues, so this runs on-device.
        A cold model loads for a few minutes the first time, then stays warm.</div>
      </div>
    </div>`;
  }
  if (!brief) {
    return `<div class="empty-state" style="text-align:left;padding:0.6rem 0">
      Nothing written yet. Everything above came from the task itself … no model required, no opinions involved.
    </div>`;
  }
  if (brief.raw) {
    return `<div class="brief-raw">${escHtml(brief.raw)}</div>`;
  }
  return `
    ${brief.what ? `<div class="brief-what">${briefText(brief.what)}</div>` : ''}
    ${brief.why  ? `<div class="brief-why"><span>Why now</span><div>${briefText(brief.why)}</div></div>` : ''}
    ${brief.done ? `<div class="brief-done"><span>Done when</span><div>${briefText(brief.done)}</div></div>` : ''}
    ${brief.steps?.length ? `
      <div class="brief-steps-label">Steps</div>
      <ol class="brief-steps">${brief.steps.map(s => `<li>${briefText(s)}</li>`).join('')}</ol>` : ''}
    ${brief.need ? `<div class="brief-need"><span>You will need</span><div>${briefText(brief.need)}</div></div>` : ''}
    ${brief.watch ? `<div class="brief-watch"><span>Watch out</span><div>${briefText(brief.watch)}</div></div>` : ''}`;
}

async function generateBrief(regenerate) {
  if (briefPending) return;
  briefPending = true;
  const body = document.getElementById('brief-body');
  const btn  = document.getElementById('brief-btn');
  if (body) body.innerHTML = renderBriefBody(null);
  if (btn) { btn.disabled = true; btn.textContent = 'Thinking…'; }
  try {
    const r = await fetch('/api/tasks/brief', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: taskDetailId, regenerate: !!regenerate }),
    });
    const d = await r.json();
    briefPending = false;
    if (!d.success) {
      showToast(d.error || 'Could not generate', 'error');
      if (taskDetail) taskDetail.brief = taskDetail.brief || null;
    } else {
      if (taskDetail) taskDetail.brief = d.brief;
      showToast(d.cached ? 'Pulled the one I wrote earlier' : 'Written … have a read', 'success');
    }
  } catch (e) {
    briefPending = false;
    showToast(e.message, 'error');
  }
  repaintTask();
}

async function detailUpdate(patch, el) {
  const okDone = await updateTask(taskDetailId, patch, el, { silentRender: true });
  if (okDone) await refreshTaskDetail();
}

async function refreshTaskDetail() {
  try {
    const r = await fetch(`/api/tasks/detail?taskId=${encodeURIComponent(taskDetailId)}`);
    if (r.ok) taskDetail = await r.json();
  } catch (e) {}
  repaintTask();
}

function beginEditDetailTitle() {
  const el = document.getElementById('task-detail-title');
  if (!el || el.dataset.editing === '1') return;
  const original = el.textContent;
  el.dataset.editing = '1';
  const input = document.createElement('input');
  input.type = 'text';
  input.value = original;
  input.className = 'task-edit-input task-hero-edit';
  el.replaceWith(input);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  let settled = false;
  const commit = async () => {
    if (settled) return;
    settled = true;
    const next = input.value.trim();
    if (!next || next === original) { await refreshTaskDetail(); return; }
    const okDone = await updateTask(taskDetailId, { title: next }, null, { silentRender: true });
    if (!okDone) showToast('Title not saved', 'error');
    await refreshTaskDetail();
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { settled = true; refreshTaskDetail(); }
  });
  input.addEventListener('blur', commit);
}

async function detailPushJira() {
  await openJiraReview();
}

async function detailDelete() {
  const title = taskDetail?.task?.TITLE || 'this task';
  const jk = taskDetail?.task?.JIRA_KEY;
  if (!await uiConfirm({ title: 'Delete this task?',
    body: `"${title}"${jk && jk !== '-' ? `\n\nThe linked Jira issue ${jk} is deleted too, and that is company-visible.` : ''}`,
    confirmLabel: 'Delete', danger: true })) return;
  try {
    const r = await fetch('/api/tasks/delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: taskDetailId }),
    });
    const d = await r.json();
    if (!d.success) { showToast(d.error || 'Delete failed', 'error'); return; }
    showToast('Task deleted', 'success');
    await fetchState();
    goBack();
  } catch (e) { showToast(e.message, 'error'); }
}

function copyTaskPrompt(btn) {
  const text = taskDetail?.prompt || '';
  const done = () => {
    const was = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = was; }, 1400);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else fallbackCopy(text, done);
}

// clipboard API needs a secure context, which plain http://<host>:8000 is not on
// a LAN or a server. Selecting the block keeps copy working there.
function fallbackCopy(text, done) {
  const pre = document.getElementById('task-prompt');
  if (!pre) return;
  const range = document.createRange();
  range.selectNodeContents(pre);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) {}
  if (ok) { sel.removeAllRanges(); done(); }
  else showToast('Select the prompt and copy with Ctrl+C', 'info');
}

/**
 * The audit chain, readable. Every entry is tiered by what it would cost if it
 * went unnoticed: CRITICAL is failures, refusals and deletions - the rows a
 * dispute would turn on; NOTABLE is state that changed somewhere that matters
 * (Jira, OneDrive, money, settings); routine is the everyday hum. The chain is
 * verified in the browser - every prev_hash checked against its predecessor -
 * because an audit log you cannot verify is a diary.
 */
let auditTierFilter = 'all';
let auditEntries = [];

function auditTier(action) {
  const a = String(action || '');
  if (/fail|error|blocked|denied|ignored|unavailable|purged|delet|unverified|leak/i.test(a)) return 'critical';
  if (/pushed|exported|sent|created|upserted|updated|migrated|settings|refreshed|snapshot|remind|filed|moved|synced|added|resolved|completed/i.test(a)) return 'notable';
  return 'routine';
}

function renderAudit() {
  return `
    <div class="view-head">
      <h1>Audit chain</h1>
      <div class="view-head-meta">every action, hash-linked - nothing here can be edited without breaking the chain</div>
    </div>
    <div class="card">
      <div class="card-header">
        <span class="card-title">Audit chain</span>
        <span class="card-meta" id="audit-chain-state">verifying…</span>
      </div>
      <div class="audit-filters" id="audit-filters"></div>
      <div id="audit-entries-list" class="audit-rail">Loading…</div>
    </div>`;
}

async function loadAuditLog() {
  try {
    const r = await fetch('/api/audit');
    auditEntries = (await r.json()).entries || [];
  } catch { auditEntries = []; }
  paintAudit();
}

function auditFilter(t) { auditTierFilter = t; paintAudit(); }

function paintAudit() {
  const list = document.getElementById('audit-entries-list');
  const filters = document.getElementById('audit-filters');
  const state = document.getElementById('audit-chain-state');
  if (!list) return;

  // Verify the chain as stored: each entry's prev_hash must equal the hash of
  // the entry before it. Breaks are surfaced on the exact row, not summarised.
  let breaks = 0;
  const rows = auditEntries.map((e, i) => {
    const broken = i > 0 && auditEntries[i - 1].hash && e.prev_hash
      && e.prev_hash !== auditEntries[i - 1].hash;
    if (broken) breaks++;
    return { ...e, tier: auditTier(e.action), broken };
  }).reverse();   // newest first for reading

  if (state) {
    state.textContent = breaks ? `${breaks} chain break${breaks > 1 ? 's' : ''} detected` :
      `${rows.length} entries · chain intact`;
    state.style.color = breaks ? 'var(--red)' : 'var(--text-3)';
  }

  const counts = { all: rows.length, critical: 0, notable: 0, routine: 0 };
  rows.forEach(r => counts[r.tier]++);
  if (filters) {
    filters.innerHTML = ['all', 'critical', 'notable', 'routine'].map(t => `
      <button class="inbox-chan ${t} ${auditTierFilter === t ? 'on' : ''}" onclick="auditFilter('${t}')">
        ${t} <span>${counts[t]}</span></button>`).join('');
  }

  const shown = auditTierFilter === 'all' ? rows : rows.filter(r => r.tier === auditTierFilter);
  list.innerHTML = shown.length ? shown.map(e => {
    const detail = Object.entries(e)
      .filter(([k]) => !['ts', 'action', 'hash', 'prev_hash', 'tier', 'broken'].includes(k))
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ');
    const when = new Date(e.ts);
    return `
    <div class="audit-row ${e.tier} ${e.broken ? 'broken' : ''}" title="${escHtml(e.hash || '')} ← ${escHtml(e.prev_hash || 'genesis')}">
      <span class="audit-tier-dot"></span>
      <div class="audit-main">
        <div class="audit-row-top">
          <span class="audit-name">${escHtml(String(e.action || '').replace(/_/g, ' '))}</span>
          ${e.broken ? '<span class="audit-break">CHAIN BREAK</span>' : ''}
          <span class="audit-when">${when.toLocaleDateString()} ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        ${detail ? `<div class="audit-detail">${escHtml(detail.slice(0, 180))}</div>` : ''}
      </div>
      <code class="audit-hash-mini">${escHtml((e.hash || '').slice(0, 8))}</code>
    </div>`;
  }).join('') : '<div class="empty-state">Nothing at this tier … which is the good outcome.</div>';
}

// ── ROUTER ────────────────────────────────────────────────────────────────────

const VIEWS = {
  today:'renderToday', jira:'renderJira',
  calendar:'renderCalendar', settings:'renderSettings', github:'renderGitHub',
  inbox:'renderInbox', tasks:'renderTasks', decisions:'renderDecisions',
  risks:'renderRisks', 'whatsapp-guide':'renderWhatsAppGuide', audit:'renderAudit',
  files:'renderFileManager', social:'renderSocial', articles:'renderArticles',
};
const viewFns = {
  today:renderToday, jira:renderJira,
  calendar:renderCalendar, settings:renderSettings, github:renderGitHub,
  inbox:renderInbox, tasks:renderTasks, decisions:renderDecisions,
  risks:renderRisks, 'whatsapp-guide':renderWhatsAppGuide, audit:renderAudit,
  files:renderFileManager, social:renderSocial, spaces:renderSpaces,
  task:renderTaskView, finance:renderFinance, planning:renderPlanning,
  journal:renderJournal, learning:renderLearning, circle:renderCircle, ideas:renderIdeas,
  projects:renderProjects, notifications:renderNotifications, articles:renderArticles,
  rhythm:renderRhythm, personal:renderRhythm,
};

/* ── THE NOTIFICATION CENTRE ──────────────────────────────────────────────────
   Everything that wanted attention, from every source, in one list. The console
   is the centre: no opening Jira for a status change, GitHub for a mention, or
   a bank app for a late payment. Nothing is ever deleted - read moves a row to
   "seen", and the archive is where patterns live ("late three months running"
   is only visible because nothing was thrown away). */
let NOTIFS = null;
let notifFilter = 'new';

async function fetchNotifs() {
  try { NOTIFS = (await (await fetch('/api/notifications?limit=200')).json()); }
  catch { NOTIFS = { notifications: [], counts: { all: 0, new: 0 } }; }
  if (currentView === 'notifications') repaintView('notifications');
  paintNotifBadge();
}

// The badge is read from the same payload, so the nav and the view can never
// disagree about how much is waiting.
async function refreshNotifBadge() {
  try {
    const d = await (await fetch('/api/notifications?status=new&limit=1')).json();
    NOTIFS = NOTIFS || { notifications: [], counts: d.counts };
    if (NOTIFS.counts) NOTIFS.counts = d.counts;
    paintNotifBadge(d.counts?.new || 0);
  } catch {}
}

function paintNotifBadge(n) {
  const count = n != null ? n : (NOTIFS?.counts?.new || 0);
  const el = document.getElementById('notif-badge');
  if (el) { el.textContent = count > 99 ? '99+' : String(count); el.hidden = !count; }
  const m = document.getElementById('m-notif-badge');
  if (m) { m.textContent = count > 99 ? '99+' : String(count); m.hidden = !count; }
}

const NOTIF_SOURCE_ICON = {
  tasks: '◱', calendar: '▣', dates: '★', finance: '$', jira: '▤',
  github: '◈', buffer: '◎', vault: '⛁', social: '◎',
};

function renderNotifications() {
  if (!NOTIFS) { fetchNotifs(); return `<div class="card"><div class="empty-state">Reading the notice board…</div></div>`; }
  const all = NOTIFS.notifications || [];
  const rows = notifVisibleRows();
  const counts = NOTIFS.counts || { all: all.length, new: 0 };
  // Sources present, with their unread counts - a filter row that only ever
  // offers what actually exists.
  const sources = [...new Set(all.map(n => n.SOURCE))].sort().map(s => ({
    id: s, total: all.filter(n => n.SOURCE === s).length,
    unread: all.filter(n => n.SOURCE === s && n.STATUS === 'new').length,
  }));
  const selN = notifSelected.size;

  // Two readings of the same board. WAITING is ranked - most consequential and
  // most actionable first, because that list exists to be worked through.
  // EVERYTHING is grouped by day, because history reads as history.
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const dayLabel = (d) => d === today ? 'Today' : d === yesterday ? 'Yesterday' : d;
  const byDay = {};
  if (notifFilter === 'new') {
    byDay['__ranked'] = rows;   // server already ordered these by weight
  } else {
    const chron = rows.slice().sort((a, b) => String(b.TS).localeCompare(String(a.TS)));
    chron.forEach(n => { const d = (n.TS || '').slice(0, 10) || 'undated'; (byDay[d] = byDay[d] || []).push(n); });
  }

  return `
    <div class="view-head">
      <h1>Alerts</h1>
      <div class="view-head-meta">every source in one place … nothing is deleted, because the pattern is the point</div>
    </div>

    <div class="task-filters">
      <div class="task-tabs">
        <button class="task-tab${notifFilter === 'new' ? ' on' : ''}" onclick="notifSetFilter('new')">Waiting <span>${counts.new}</span></button>
        <button class="task-tab${notifFilter === 'all' ? ' on' : ''}" onclick="notifSetFilter('all')">Everything <span>${counts.all}</span></button>
      </div>
      <button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 10px" onclick="notifSweep(this)">Check now</button>
      ${counts.new ? `<button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 10px" onclick="notifSeenAll(this)">Mark all read</button>` : ''}
    </div>

    ${sources.length > 1 ? `
      <div class="notif-sources">
        <button class="notif-src${notifSource === 'all' ? ' on' : ''}" onclick="notifSetSource('all')">All sources</button>
        ${sources.map(s => `<button class="notif-src${notifSource === s.id ? ' on' : ''}" onclick="notifSetSource('${escHtml(s.id)}')">
          <span class="notif-icon">${NOTIF_SOURCE_ICON[s.id] || '•'}</span>${escHtml(s.id)}
          ${s.unread ? `<b>${s.unread}</b>` : `<i>${s.total}</i>`}</button>`).join('')}
      </div>` : ''}

    <!-- The selection bar only exists while something is ticked, so the list is
         never carrying controls nobody is using. -->
    ${selN ? `
      <div class="notif-selbar">
        <span class="notif-selcount">${selN} selected</span>
        <button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 10px" onclick="notifBulk('seen', this)">Mark read</button>
        <button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 10px" onclick="notifBulk('acted', this)">Dealt with</button>
        <button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 10px" onclick="notifBulk('new', this)">Mark unread</button>
        <button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 10px;margin-left:auto"
                onclick="notifSelected.clear();repaintView('notifications')">Clear</button>
      </div>` : ''}

    ${rows.length ? `
      <div class="notif-selectall">
        <label><input type="checkbox" ${rows.length && rows.every(n => notifSelected.has(n.ID)) ? 'checked' : ''}
               onchange="notifSelectAll()"/> Select all ${rows.length} shown</label>
        <span class="card-meta">tick, then shift-click to extend a run</span>
      </div>` : ''}

    ${Object.keys(byDay).length ? Object.entries(byDay).map(([day, items]) => `
      <div class="notif-day">
        <div class="notif-day-head">${day === '__ranked'
          ? `Most pressing first <span>${items.length}</span>`
          : `${escHtml(dayLabel(day))} <span>${items.length}</span>`}</div>
        ${items.map(n => `
          <div class="notif sev-${escHtml(n.SEVERITY)}${n.STATUS === 'new' ? ' is-new' : ''}${notifSelected.has(n.ID) ? ' is-picked' : ''}"
               onclick="notifDetail('${escHtml(n.ID)}', event)">
            <input type="checkbox" class="notif-tick" ${notifSelected.has(n.ID) ? 'checked' : ''}
                   title="Select" onclick="notifToggle('${escHtml(n.ID)}', event)"/>
            <span class="notif-icon" title="${escHtml(n.SOURCE)}">${NOTIF_SOURCE_ICON[n.SOURCE] || '•'}</span>
            <div class="notif-main">
              <div class="notif-title">${refChips(escHtml(n.TITLE))}</div>
              ${n.BODY && n.BODY !== '-' ? `<div class="notif-body">${refChips(escHtml(n.BODY))}</div>` : ''}
              <div class="notif-meta">${escHtml(n.SOURCE)} · ${escHtml((n.TS || '').slice(11, 16))}${n.KIND && n.KIND !== '-' ? ` · ${escHtml(n.KIND)}` : ''}${n.STATUS === 'acted' ? ' · dealt with' : ''}</div>
            </div>
            ${n.STATUS === 'new' ? '<span class="notif-dot" title="Unread"></span>' : ''}
          </div>`).join('')}
      </div>`).join('')
      : `<div class="card"><div class="empty-state">${notifFilter === 'new'
          ? 'Nothing waiting. The agent is watching tasks, the calendar, the ledger, Jira, GitHub and the vault - it will tell you here.'
          : 'Nothing on the board yet. Notices land here as they happen.'}</div></div>`}`;
}

function notifSetFilter(f) { notifFilter = f; notifSelected.clear(); repaintView('notifications'); }
function notifSetSource(s) { notifSource = s; notifSelected.clear(); repaintView('notifications'); }

// ── SELECTION ──
// Tick several and act once. Shift-click extends from the last tick, the way
// every list of this kind has worked for thirty years.
let notifSelected = new Set();
let notifSource = 'all';
let notifLastTicked = null;

function notifToggle(id, ev) {
  ev?.stopPropagation();
  const visible = notifVisibleRows().map(n => n.ID);
  if (ev?.shiftKey && notifLastTicked && visible.includes(notifLastTicked)) {
    const a = visible.indexOf(notifLastTicked), b = visible.indexOf(id);
    visible.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(x => notifSelected.add(x));
  } else {
    notifSelected.has(id) ? notifSelected.delete(id) : notifSelected.add(id);
  }
  notifLastTicked = id;
  repaintView('notifications');
}

function notifVisibleRows() {
  const all = NOTIFS?.notifications || [];
  return all.filter(n => (notifFilter === 'all' || n.STATUS === notifFilter)
                      && (notifSource === 'all' || n.SOURCE === notifSource));
}

function notifSelectAll() {
  const rows = notifVisibleRows();
  const allTicked = rows.length && rows.every(n => notifSelected.has(n.ID));
  if (allTicked) notifSelected.clear();
  else rows.forEach(n => notifSelected.add(n.ID));
  repaintView('notifications');
}

async function notifBulk(status, btn) {
  if (!notifSelected.size) return;
  btn.disabled = true;
  try {
    await fetch('/api/notifications/seen', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...notifSelected], status }) });
    notifSelected.clear();
    await fetchNotifs();
  } catch (e) { showToast(e.message, 'error'); }
  btn.disabled = false;
}

/* ── ONE NOTICE, IN FULL ───────────────────────────────────────────────────────
   Clicking a row used to jump straight to wherever it pointed, which is fine
   for a task and wrong for everything else - it left no room to read the thing
   or decide about it. This opens it instead: the full text, where it came
   from, why it ranked where it did, and the controls that belong to it. */
function notifDetail(id, ev) {
  ev?.stopPropagation();
  const n = (NOTIFS?.notifications || []).find(x => x.ID === id);
  if (!n) return;
  document.getElementById('notif-detail')?.remove();
  const ov = document.createElement('div');
  ov.id = 'notif-detail';
  ov.className = 'modal-overlay';
  ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
  const goLabel = { task: 'Open the task', jira: 'Open the board', finance: 'Open Finance',
    calendar: 'Open the calendar', github: 'Open GitHub', circle: 'Open the Circle',
    settings: 'Open Settings' }[n.VIEW] || 'Open where this came from';
  const when = (n.TS || '').replace('T', ' ').slice(0, 16);

  ov.innerHTML = `
    <div class="modal-box notif-detail-box">
      <div class="modal-header">
        <span class="modal-title">
          <span class="notif-icon sev-${escHtml(n.SEVERITY)}">${NOTIF_SOURCE_ICON[n.SOURCE] || '•'}</span>
          ${escHtml(n.SOURCE)} · ${escHtml(n.KIND)}
        </span>
        <button class="btn btn-ghost" onclick="document.getElementById('notif-detail').remove()">✕</button>
      </div>
      <div class="modal-body">
        <div class="nd-title">${refChips(escHtml(n.TITLE))}</div>
        ${n.BODY && n.BODY !== '-' ? `<div class="nd-body">${refChips(escHtml(n.BODY))}</div>` : ''}
        <div class="nd-facts">
          <div><span>Raised</span>${escHtml(when)}</div>
          <div><span>Severity</span><em class="sev-word sev-${escHtml(n.SEVERITY)}">${escHtml(n.SEVERITY)}</em></div>
          <div><span>Status</span>${escHtml(n.STATUS)}${n.SEEN_AT && n.SEEN_AT !== '-' ? ` · read ${escHtml(n.SEEN_AT.slice(0, 16).replace('T', ' '))}` : ''}</div>
          ${n.RANK != null ? `<div><span>Rank score</span>${n.RANK} <em class="nd-hint">severity + whose stake + how actionable + freshness, unread lifted</em></div>` : ''}
          ${n.REF && n.REF !== '-' ? `<div><span>Reference</span><code>${escHtml(n.REF)}</code></div>` : ''}
          <div><span>Identity</span><code>${escHtml(n.DEDUPE_KEY || n.ID)}</code><em class="nd-hint">this is what stops it being raised twice</em></div>
        </div>
      </div>
      <div class="modal-footer nd-actions">
        ${n.VIEW && n.VIEW !== '-' ? `<button class="btn btn-primary" style="font-size:0.74rem"
          onclick="notifGo('${escHtml(n.ID)}','${escHtml(n.VIEW)}','${escHtml(n.REF)}')">${escHtml(goLabel)}</button>` : ''}
        ${n.STATUS === 'new'
          ? `<button class="btn btn-ghost" style="font-size:0.74rem" onclick="notifMark('${escHtml(n.ID)}','seen')">Mark read</button>`
          : `<button class="btn btn-ghost" style="font-size:0.74rem" onclick="notifMark('${escHtml(n.ID)}','new')">Mark unread</button>`}
        ${n.STATUS !== 'acted' ? `<button class="btn btn-ghost" style="font-size:0.74rem"
          title="Read and dealt with - it stays on the record either way"
          onclick="notifMark('${escHtml(n.ID)}','acted')">Dealt with</button>` : ''}
        <button class="btn btn-ghost" style="font-size:0.74rem"
          onclick="notifSetSource('${escHtml(n.SOURCE)}');document.getElementById('notif-detail').remove()">Only ${escHtml(n.SOURCE)}</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
}

async function notifMark(id, status) {
  try {
    await fetch('/api/notifications/seen', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) });
  } catch (e) { showToast(e.message, 'error'); }
  document.getElementById('notif-detail')?.remove();
  await fetchNotifs();
}

async function notifGo(id, view, ref) {
  document.getElementById('notif-detail')?.remove();
  await notifOpen(id, view, ref);
}

async function notifOpen(id, view, ref) {
  try {
    await fetch('/api/notifications/seen', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
  } catch {}
  const n = (NOTIFS?.notifications || []).find(x => x.ID === id);
  if (n) { n.STATUS = 'seen'; if (NOTIFS.counts) NOTIFS.counts.new = Math.max(0, NOTIFS.counts.new - 1); }
  paintNotifBadge();
  if (view === 'task' && ref && ref !== '-') return openTask(ref);
  if (view && view !== '-' && viewFns[view]) return navigate(view);
  repaintView('notifications');
}

async function notifSeenAll(btn) {
  btn.disabled = true;
  try {
    await fetch('/api/notifications/seen', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) });
    await fetchNotifs();
  } catch (e) { showToast(e.message, 'error'); }
  btn.disabled = false;
}

async function notifSweep(btn) {
  const was = btn.textContent;
  btn.disabled = true; btn.textContent = 'Checking…';
  try {
    const d = await (await fetch('/api/notifications/sweep', { method: 'POST' })).json();
    showToast(d.raised ? `${d.raised} new notice${d.raised === 1 ? '' : 's'}` : 'Nothing new - everything already noticed', 'success');
    await fetchNotifs();
  } catch (e) { showToast(e.message, 'error'); }
  btn.disabled = false; btn.textContent = was;
}

let currentView = 'today';

/**
 * Navigation with real history.
 *
 * Every view change pushes a history entry, so the browser back button, the
 * mouse back button, and a swipe-back on mobile all work, and a view can be
 * linked to or reloaded. Previously the whole console was one history entry, so
 * pressing back left the app entirely - easy to do by reflex and infuriating.
 *
 * `opts.replace` updates in place instead of pushing, used when restoring state
 * from a popstate so going back does not re-push what we just came from.
 */
function viewUrl(viewName, params = {}) {
  const q = new URLSearchParams();
  if (viewName && viewName !== 'today') q.set('v', viewName);
  if (params.taskId) q.set('task', params.taskId);
  if (viewName === 'spaces' && spacesPath.length) q.set('at', spacesPath.join('.'));
  const s = q.toString();
  return s ? `?${s}` : location.pathname;
}

function pushHistory(viewName, params, replace) {
  const state = { view: viewName, ...params, spacesPath: [...spacesPath] };
  try {
    if (replace) history.replaceState(state, '', viewUrl(viewName, params));
    else         history.pushState(state, '', viewUrl(viewName, params));
  } catch (e) { /* file:// or a sandbox without history - navigation still works */ }
}

// ── NAV TRAIL ────────────────────────────────────────────────────────────────
// A short record of where you have been, so the back control can NAME its
// destination. "← Spaces" tells you what will happen; a bare arrow does not.
// Trimmed hard, because this is an orientation aid, not a history browser.
const VIEW_LABELS = {
  today:'Hub', jira:'Kanban', calendar:'Calendar', inbox:'Inbox', notifications:'Alerts',
  github:'GitHub', files:'File Manager', tasks:'Tasks', spaces:'Spaces',
  journal:'Journal', learning:'Learning', circle:'Circle', projects:'Projects', ideas:'Ideas',
  decisions:'Decision Log', risks:'Risk Register', social:'Buffer',
  integrations:'Integrations Hub', audit:'Audit Chain', settings:'Settings',
  task:'Task', 'whatsapp-guide':'WhatsApp',
};
let NAV_TRAIL = [];
const TRAIL_MAX = 8;

function labelFor(view, taskId) {
  if (view === 'task') {
    const t = (STATE.tasks || []).find(x => x.ID === taskId);
    const title = t?.TITLE || '';
    return title ? (title.length > 34 ? title.slice(0, 34) + '…' : title) : 'Task';
  }
  if (view === 'spaces' && spacesPath.length) {
    const chain = spacesChain();
    if (chain.length) return chain[chain.length - 1].LABEL || 'Spaces';
  }
  return VIEW_LABELS[view] || view;
}

function trailPush(view, taskId) {
  const label = labelFor(view, taskId);
  const last = NAV_TRAIL[NAV_TRAIL.length - 1];
  // Re-entering the same place should not stack up identical entries.
  if (last && last.view === view && last.taskId === taskId) { last.label = label; return; }
  NAV_TRAIL.push({ view, taskId, label });
  if (NAV_TRAIL.length > TRAIL_MAX) NAV_TRAIL.shift();
}

function renderNavBar() {
  const bar   = document.getElementById('navbar');
  const back  = document.getElementById('navbar-back');
  const trail = document.getElementById('navbar-trail');
  if (!bar || !back || !trail) return;

  const prev = NAV_TRAIL[NAV_TRAIL.length - 2];
  const here = NAV_TRAIL[NAV_TRAIL.length - 1];

  // Nothing behind you means no bar at all - chrome you cannot use is noise.
  if (!prev) { bar.hidden = true; return; }
  bar.hidden = false;
  back.textContent = `← ${prev.label}`;
  back.onclick = goBack;

  // Show at most the last three hops, oldest first, current one inert.
  const shown = NAV_TRAIL.slice(-3);
  trail.innerHTML = shown.map((n, i) => {
    const isLast = i === shown.length - 1;
    const depth = shown.length - 1 - i;   // how many steps back this is
    return isLast
      ? `<span class="trail-here">${escHtml(n.label)}</span>`
      : `<button class="trail-hop" data-back="${depth}">${escHtml(n.label)}</button>
         <span class="trail-sep">/</span>`;
  }).join('');

  trail.querySelectorAll('[data-back]').forEach(b => {
    b.onclick = () => { const n = Number(b.dataset.back); if (n > 0) history.go(-n); };
  });
}

/**
 * In-app back. Defers to real history so it never disagrees with the browser
 * button, the mouse back button, or a swipe.
 */
function goBack() {
  if (NAV_TRAIL.length > 1 && history.length > 1) { history.back(); return; }
  // Landed here directly - no history to pop, so fall back somewhere sensible.
  navigate(currentView === 'task' ? 'tasks' : 'today');
}

// Alt+← / Alt+→ mirror the browser, and Escape steps back once nothing is open.
// Escape is checked last so it keeps closing menus and modals first.
document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')
              || e.target?.isContentEditable;
  if (e.altKey && e.key === 'ArrowLeft')  { e.preventDefault(); history.back();    return; }
  if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); history.forward(); return; }
  if (e.key === 'Escape' && !typing) {
    const overlayOpen = document.getElementById('task-menu')
                     || document.getElementById('complete-menu')
                     || document.getElementById('assignee-picker')
                     || document.querySelector('.modal-overlay:not(.hidden)');
    if (!overlayOpen && NAV_TRAIL.length > 1) goBack();
  }
});

function restoreFromState(state) {
  const view = (state && state.view) || 'today';
  if (state && Array.isArray(state.spacesPath)) spacesPath = [...state.spacesPath];
  if (view === 'task' && state.taskId) {
    taskDetailId = state.taskId;
    taskDetail = null;
    navigate('task', { taskId: state.taskId }, { fromHistory: true });
    fetch(`/api/tasks/detail?taskId=${encodeURIComponent(state.taskId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        taskDetail = d;
        repaintTask();
      }).catch(() => {});
    return;
  }
  navigate(view, {}, { fromHistory: true });
}

window.addEventListener('popstate', (e) => {
  // Going back consumes a trail entry, so the back control keeps naming the right
  // destination instead of pointing at somewhere already left behind.
  if (NAV_TRAIL.length > 1) NAV_TRAIL.pop();
  restoreFromState(e.state || { view: 'today' });
});

// ── FINANCE ──────────────────────────────────────────────────────────────────
// Every figure here is arithmetic over the vault, computed server-side. The view
// answers three questions in order: where do I stand (net worth, runway), where
// is it going (this month's flow, the trend), and what moves it (goals, and the
// spend Operator himself scored as low-necessity).

let FIN = null;   // last /api/finance/summary payload
let FIN_REVIEW = null;   // last /api/finance/review payload

const FIN_CATEGORIES = ['needs/housing','needs/food','needs/utilities','wants/growth',
  'wants/friends-family','wants/liquid','security/savings','security/emergency','security/debt',
  'fees','business/acexoft-dynamics','transfer/own-accounts'];

async function fetchFinance() {
  try { FIN = await (await fetch('/api/finance/summary')).json(); }
  catch { FIN = null; }
  fetchFinanceReview();
  if (currentView === 'finance') {
    document.getElementById('view-container').innerHTML = renderFinance();
  }
}

async function fetchFinanceReview() {
  try { FIN_REVIEW = await (await fetch('/api/finance/review')).json(); }
  catch { FIN_REVIEW = null; }
  if (currentView === 'finance') repaintView('finance');
}

async function finResolveReview(btn) {
  const row = btn.closest('.fin-review-row');
  const sel = row.querySelector('.fin-review-select');
  const vendor = row.dataset.vendor, category = row.dataset.category;
  const newCategory = sel.value;
  btn.disabled = true; sel.disabled = true; btn.textContent = 'Saving…';
  try {
    const d = await (await fetch('/api/finance/review/resolve', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendor, category, newCategory }) })).json();
    if (d.success) {
      row.classList.add('fin-review-row-done');
      row.style.setProperty('--exit', '1');
      showToast(`${d.changed} transaction${d.changed === 1 ? '' : 's'} moved to ${newCategory}`, 'ok');
      setTimeout(() => fetchFinanceReview(), 260);
    } else {
      showToast(d.error || 'Could not save', 'warn');
      btn.disabled = false; sel.disabled = false; btn.textContent = 'Save';
    }
  } catch {
    showToast('Could not reach the agent', 'warn');
    btn.disabled = false; sel.disabled = false; btn.textContent = 'Save';
  }
}

function finReviewQueue() {
  const r = FIN_REVIEW;
  if (!r || !r.groups || !r.groups.length) return '';
  const catOpts = (current) => FIN_CATEGORIES.map(c =>
    `<option value="${c}"${c === current ? ' selected' : ''}>${escHtml(c)}</option>`).join('');
  return `
    <div class="card fin-review">
      <div class="card-header">
        <span class="card-title">To clarify</span>
        <span class="card-meta">${r.totalFlagged} transaction${r.totalFlagged === 1 ? '' : 's'} · ${r.groups.length} group${r.groups.length === 1 ? '' : 's'}</span>
      </div>
      <div class="fin-review-hint">Grouped by counterparty, biggest first. Pick the right category and save — new statement imports and low-confidence entries land here automatically, so this list keeps working as new transactions come in, not just for tonight's import.</div>
      <div class="fin-review-list">
        ${r.groups.map(g => `
          <div class="fin-review-row conf-${escHtml(g.confidence)}" data-vendor="${escAttr(g.vendor)}" data-category="${escAttr(g.category)}">
            <div class="fin-review-main">
              <span class="fin-review-vendor">${escHtml(g.vendor)}</span>
              <span class="fin-review-badge fin-review-badge-${escHtml(g.confidence)}">${escHtml(g.confidence)}</span>
              <div class="fin-review-sample">${escHtml((g.samples && g.samples[0]) || '')}</div>
            </div>
            <div class="fin-review-nums">
              <span class="fin-review-count">${g.count}×</span>
              <span class="fin-review-amt">${money(g.total)}</span>
            </div>
            <div class="fin-review-action">
              <select class="fin-review-select">${catOpts(g.category)}</select>
              <button class="btn btn-primary fin-review-save" onclick="finResolveReview(this)">Save</button>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

function money(n, cur) {
  const v = Math.round(Number(n) || 0);
  return `${cur || FIN?.currency || 'KES'} ${v.toLocaleString('en-KE')}`;
}

function renderFinance() {
  if (!FIN) { fetchFinance(); return `<div class="card"><div class="empty-state">Reading the ledger…</div></div>`; }
  const f = FIN;
  const nw = f.netWorth || { assets: 0, liabilities: 0, net: 0 };
  const m  = f.month || {};
  const cats = Object.entries(m.byCategory || {}).sort((a, b) => b[1] - a[1]);
  const maxCat = cats.length ? cats[0][1] : 0;
  const trend = f.trend || [];
  const goals = (f.goals || []).filter(g => g.STATUS !== 'done');

  // Trend delta: the drastic-increase question answered with a number.
  let delta = null;
  if (trend.length >= 2) {
    const first = parseFloat(trend[0].NET) || 0;
    const last  = parseFloat(trend[trend.length - 1].NET) || 0;
    delta = { abs: last - first, span: `${trend[0].DATE} → ${trend[trend.length - 1].DATE}` };
  }

  return `
    <div class="view-head">
      <h1>Finance</h1>
      <div class="view-head-meta">${f.sync?.status === 'synced'
        ? `private … synced to your OneDrive Vault${f.sync.at ? ` · ${escHtml(f.sync.at.slice(11, 16))}` : ''}`
        : f.sync?.status === 'offline' || f.sync?.status === 'push failed'
          ? `private … local only right now (${escHtml(f.sync.status)})`
          : 'private … syncing to your OneDrive Vault on first write'}</div>
    </div>

    ${renderSpaceInsight('finance')}

    <div class="fin-headline card">
      ${finHeadTiles(f, nw, m, trend, delta)}
      <div class="fin-snap">
        <button class="btn btn-ghost" onclick="finSnapshot(this)"
                title="Freeze today's position into the trend">Snapshot</button>
        <button class="btn btn-ghost" onclick="window.open('/api/finance/report','_blank')"
                title="Print-ready report - Ctrl+P saves it as PDF">Report</button>
        <button class="btn btn-ghost" onclick="finExportReport(this)"
                title="Save the report (HTML) and full ledger (CSV) to your OneDrive Vault">Export</button>
      </div>
    </div>

    ${delta ? `<div class="fin-delta ${delta.abs >= 0 ? 'up' : 'down'}">
      ${delta.abs >= 0 ? '▲' : '▼'} ${money(Math.abs(delta.abs))} ${delta.abs >= 0 ? 'gained' : 'lost'} ${escHtml(delta.span)}
    </div>` : ''}

    ${finSparkline(trend)}
    ${finReviewQueue()}
    ${finIncomes(f)}
    ${finAllocation(f)}
    ${finAnalysis(f)}
    ${finReceipts()}
    ${finVentures()}

    <div class="grid-2">
      ${finAccountsCard(f)}

      <div class="card">
        <div class="card-header"><span class="card-title">${escHtml(m.month || '')} by category</span>
          <span class="card-meta">${money(m.expense)} out</span></div>
        ${cats.length ? `
          <div class="fin-cats">
            ${cats.map(([cat, amt]) => `
              <div class="fin-cat">
                <span class="fin-cat-name">${escHtml(cat)}</span>
                <div class="fin-cat-bar"><div style="width:${maxCat ? Math.round(amt / maxCat * 100) : 0}%"></div></div>
                <span class="fin-cat-amt">${money(amt)}</span>
              </div>`).join('')}
          </div>
          ${m.lowNecessity ? `<div class="fin-warn">${money(m.lowNecessity)} of this you scored necessity ≤ 4. That is the first lever.</div>` : ''}`
        : `<div class="empty-state" style="text-align:left;padding:0.5rem 0">Nothing logged this month.</div>`}
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Log a transaction</span></div>
      <div class="fin-tx-form">
        <select id="fin-tx-type" class="jira-input"><option value="expense">expense</option><option value="income">income</option></select>
        <input id="fin-tx-amount" class="jira-input" type="number" placeholder="amount" min="0"/>
        <input id="fin-tx-category" class="jira-input" placeholder="category" list="fin-cat-list"/>
        <datalist id="fin-cat-list">${['food','transport','housing','technology','health','education','business','family','giving','entertainment'].map(c => `<option value="${c}">`).join('')}</datalist>
        <input id="fin-tx-desc" class="jira-input" placeholder="what was it" style="min-width:180px"/>
        <select id="fin-tx-necessity" class="jira-input" title="How necessary, 1-10 - your own scale">
          <option value="">necessity?</option>${[1,2,3,4,5,6,7,8,9,10].map(n => `<option>${n}</option>`).join('')}
        </select>
        <button class="btn btn-primary" style="padding:6px 14px" onclick="finAddTx(this)">Log</button>
      </div>
      ${(f.recent || []).length ? `
        <div class="fin-recent">
          ${f.recent.map(t => `
            <div class="fin-tx ${escHtml(t.TYPE)}">
              <span class="fin-tx-date">${escHtml(t.DATE)}</span>
              <span class="fin-tx-desc">${escHtml(t.DESCRIPTION)}</span>
              <span class="fin-tx-cat">${escHtml(t.CATEGORY)}</span>
              <span class="fin-tx-amt">${t.TYPE === 'expense' ? '−' : '+'}${money(t.AMOUNT, t.CURRENCY)}</span>
            </div>`).join('')}
        </div>` : ''}
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Goals</span>
        <button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 9px" onclick="finAddGoal()">Add</button>
      </div>
      ${goals.length ? `
        <div class="fin-goals">
          ${goals.map(g => {
            const target = parseFloat(g.TARGET) || 0, cur = parseFloat(g.CURRENT) || 0;
            const pct = target > 0 ? Math.min(100, Math.round(cur / target * 100)) : 0;
            return `
            <div class="fin-goal">
              <div class="fin-goal-head"><span>${escHtml(g.TITLE)}</span>
                <span>${money(cur)} / ${money(target)}${g.DUE !== '-' ? ` by ${escHtml(g.DUE)}` : ''}</span></div>
              <div class="fin-goal-bar"><div style="width:${pct}%"></div></div>
            </div>`;
          }).join('')}
        </div>` : `
        <div class="empty-state" style="text-align:left;padding:0.5rem 0">
          No goals yet. A number with a date beats a good intention every time … "emergency fund,
          three months of burn" is a strong opener, and the burn figure above already knows the number.
        </div>`}
    </div>`;
}

/**
 * The top strip as a mini dashboard: four stat tiles, each carrying one small
 * honest visual under the number. Every bar is a ratio of two server-side
 * figures - display arithmetic only, the money itself is never derived here.
 */
function finHeadTiles(f, nw, m, trend, delta) {
  // Net worth: how the position splits between what he has and what he owes.
  const grossPos = (nw.assets || 0) + (nw.liabilities || 0);
  const assetPct = grossPos ? Math.round((nw.assets || 0) / grossPos * 100) : 0;

  // Runway: months of burn in hand, drawn against a 12-month track with a
  // 6-month marker - the "three months of burn" goal sits visibly left of it.
  const RUNWAY_TRACK = 12;
  const runwayPct = f.runwayMonths != null
    ? Math.min(100, Math.round(f.runwayMonths / RUNWAY_TRACK * 100)) : 0;

  // Month flow: income vs spend on a shared scale, so the gap IS the message.
  const flowMax = Math.max(m.income || 0, m.expense || 0);
  const inPct  = flowMax ? Math.round((m.income  || 0) / flowMax * 100) : 0;
  const outPct = flowMax ? Math.round((m.expense || 0) / flowMax * 100) : 0;

  // Trend: the sparkline in miniature, plus the delta as the headline number.
  const nets = (trend || []).map(t => parseFloat(t.NET) || 0);
  let sparkTile = '';
  if (nets.length >= 2) {
    const min = Math.min(...nets), max = Math.max(...nets), span = (max - min) || 1;
    const W = 120, H = 30, P = 3;
    const pts = nets.map((n, i) =>
      `${Math.round(P + (i / (nets.length - 1)) * (W - P * 2))},${Math.round(H - P - ((n - min) / span) * (H - P * 2))}`);
    const up = nets[nets.length - 1] >= nets[0];
    sparkTile = `
      <div class="fin-figure">
        <span class="fin-label">Trend · ${trend.length} snapshots</span>
        <span class="fin-value ${delta && delta.abs < 0 ? 'neg' : ''}" style="font-size:1.1rem">
          ${delta ? `${delta.abs >= 0 ? '+' : '−'}${money(Math.abs(delta.abs))}` : '—'}</span>
        <svg class="fin-tile-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="net worth trend">
          <polyline points="${pts.join(' ')}" fill="none"
            stroke="${up ? 'var(--green)' : 'var(--red)'}" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
        <span class="fin-sub">${delta ? escHtml(delta.span) : ''}</span>
      </div>`;
  }

  return `
      <div class="fin-figure">
        <span class="fin-label">Net worth</span>
        <span class="fin-value ${nw.net < 0 ? 'neg' : ''}">${money(nw.net)}</span>
        ${grossPos ? `
        <div class="fin-split" title="${assetPct}% assets, ${100 - assetPct}% owed">
          <div class="fin-split-a" style="width:${assetPct}%"></div>
          <div class="fin-split-l" style="width:${100 - assetPct}%"></div>
        </div>` : ''}
        <span class="fin-sub"><span class="fin-dot a"></span>${money(nw.assets)} assets
          · <span class="fin-dot l"></span>${money(nw.liabilities)} owed</span>
      </div>
      <div class="fin-figure">
        <span class="fin-label">Runway</span>
        <span class="fin-value">${f.runwayMonths != null ? `${f.runwayMonths} mo` : '—'}</span>
        <div class="fin-meter" title="${f.runwayMonths != null ? `${f.runwayMonths} of ${RUNWAY_TRACK} months on the track, marker at 6` : 'no burn figure yet'}">
          <div class="fin-meter-fill" style="width:${runwayPct}%"></div>
          <div class="fin-meter-tick" style="left:50%"></div>
        </div>
        <span class="fin-sub">${f.burn ? `burn ~${money(f.burn)}/mo · marker = 6 mo` : 'needs a month of data'}</span>
      </div>
      <div class="fin-figure">
        <span class="fin-label">${escHtml(m.month || 'This month')}</span>
        <span class="fin-value ${m.netFlow < 0 ? 'neg' : ''}">${m.income || m.expense ? money(m.netFlow) : '—'}</span>
        ${flowMax ? `
        <div class="fin-pair" title="in ${money(m.income)} vs out ${money(m.expense)}">
          <div class="fin-pair-row"><span class="fin-pair-tag">in</span><div class="fin-pair-bar"><div class="in" style="width:${inPct}%"></div></div></div>
          <div class="fin-pair-row"><span class="fin-pair-tag">out</span><div class="fin-pair-bar"><div class="out" style="width:${outPct}%"></div></div></div>
        </div>` : ''}
        <span class="fin-sub">${m.savingsRate != null ? `${m.savingsRate}% of income kept` : `${money(m.expense)} out, no income logged`}</span>
      </div>
      ${sparkTile}`;
}

/**
 * The net-worth line, drawn from the snapshots. Inline SVG, no library - a
 * twelve-point polyline does not need one.
 */
function finSparkline(trend) {
  if (!trend || trend.length < 2) return '';
  const nets = trend.map(t => parseFloat(t.NET) || 0);
  const min = Math.min(...nets), max = Math.max(...nets);
  const span = (max - min) || 1;
  const W = 640, H = 72, PAD = 6;
  const pts = nets.map((n, i) => {
    const x = PAD + (i / (nets.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((n - min) / span) * (H - PAD * 2);
    return `${Math.round(x)},${Math.round(y)}`;
  });
  const up = nets[nets.length - 1] >= nets[0];
  return `
    <div class="card fin-spark-card">
      <div class="card-header"><span class="card-title">Net worth over time</span>
        <span class="card-meta">${trend.length} snapshots</span></div>
      <svg class="fin-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="net worth trend">
        <polyline points="${pts.join(' ')}" fill="none"
          stroke="${up ? 'var(--green)' : 'var(--red)'}" stroke-width="2" stroke-linejoin="round"/>
        ${pts.map(p => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="2.5"
          fill="${up ? 'var(--green)' : 'var(--red)'}"/>`).join('')}
      </svg>
      <div class="fin-spark-axis"><span>${escHtml(trend[0].DATE)}</span><span>${escHtml(trend[trend.length - 1].DATE)}</span></div>
    </div>`;
}

/**
 * Accounts, grouped the way money actually behaves: what you can spend today,
 * what sits in banks, cards and wallets, and what you owe. Every group carries
 * its subtotal, every name and balance edits in place, and debts read as the
 * negative space they are.
 */
const FIN_GROUPS = [
  { key: 'liquid', label: 'Liquid - spendable today', types: ['cash', 'mobile-money'] },
  { key: 'banks',  label: 'Bank accounts',            types: ['bank', 'sacco'] },
  { key: 'wallets',label: 'Cards & wallets',          types: ['card', 'wallet', 'investment', 'receivable'] },
  { key: 'debts',  label: 'Owed - subtracts from net',types: ['debt', 'loan', 'payable', 'credit'] },
];

function finAccountsCard(f) {
  const accounts = f.accounts || [];
  const groups = FIN_GROUPS.map(g => ({
    ...g,
    rows: accounts.filter(a => g.types.includes((a.TYPE || '').toLowerCase())),
  }));
  // Anything with an unrecognised type still shows - misfiled beats invisible.
  const known = new Set(FIN_GROUPS.flatMap(g => g.types));
  const stray = accounts.filter(a => !known.has((a.TYPE || '').toLowerCase()));
  if (stray.length) groups.push({ key: 'other', label: 'Unclassified', types: [], rows: stray });

  return `
    <div class="card">
      <div class="card-header"><span class="card-title">Accounts</span>
        <button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 9px" onclick="finAddAccount()">Add</button>
      </div>
      ${accounts.length ? groups.filter(g => g.rows.length).map(g => {
        const sub = g.rows.reduce((s, a) => s + (parseFloat(a.BALANCE) || 0), 0);
        return `
        <div class="fin-group">
          <div class="fin-group-head">
            <span>${escHtml(g.label)}</span>
            <span class="fin-group-sub ${g.key === 'debts' && sub > 0 ? 'neg' : ''}">${g.key === 'debts' && sub > 0 ? '−' : ''}${money(Math.abs(sub))}</span>
          </div>
          ${g.rows.map(a => `
            <div class="fin-account ${g.key === 'debts' ? 'debt' : ''}">
              <div class="fin-acc-main">
                <span class="fin-acc-name" id="accname-${escHtml(a.ID)}" title="Click to rename"
                      onclick="finEditName('${escHtml(a.ID)}')">${escHtml(a.NAME)}</span>
                <span class="fin-acc-sub">${escHtml(a.TYPE)}${a.INSTITUTION && a.INSTITUTION !== '-' ? ` · ${escHtml(a.INSTITUTION)}` : ''} · as of ${escHtml(a.ASOF)}</span>
                ${a.NOTE && a.NOTE !== '-' ? `<span class="fin-acc-note">${escHtml(a.NOTE)}</span>` : ''}
              </div>
              <input class="fin-acc-balance" type="number" step="0.01" value="${escHtml(a.BALANCE)}"
                     title="Type the new balance and press Enter"
                     onkeydown="if(event.key==='Enter'){finSetBalance('${escHtml(a.ID)}',this)}"/>
            </div>`).join('')}
        </div>`;
      }).join('') : `
        <div class="empty-state" style="text-align:left;padding:0.5rem 0">
          No accounts yet. Add cash, M-Pesa, bank, sacco, investments … and the debts too, as
            type <code>debt</code>. A net worth that ignores what you owe is just a nice feeling.
        </div>`}
    </div>`;
}

// Rename in place: the span becomes an input, Enter commits, Escape walks away.
function finEditName(id) {
  const span = document.getElementById(`accname-${id}`);
  if (!span || span.dataset.editing) return;
  span.dataset.editing = '1';
  const old = span.textContent;
  const input = document.createElement('input');
  input.className = 'fin-acc-rename';
  input.value = old;
  span.replaceWith(input);
  input.focus(); input.select();
  const done = async (commit) => {
    const next = input.value.trim();
    if (commit && next && next !== old) {
      const d = await (await fetch('/api/finance/account', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: next }) })).json();
      showToast(d.success ? 'Renamed … as if it were always called that' : (d.error || 'Refused'), d.success ? 'success' : 'error');
    }
    fetchFinance();
  };
  input.onkeydown = (e) => {
    if (e.key === 'Enter') done(true);
    if (e.key === 'Escape') done(false);
  };
  input.onblur = () => done(false);
}

/**
 * Income streams: what is supposed to arrive, when, from where - and whether it
 * actually has. "Received" is read off the ledger by each stream's match word;
 * a monthly stream past its day with nothing logged shows as overdue, because
 * chasing late money early is one of the cheapest financial habits there is.
 */
function finIncomes(f) {
  const inc = f.incomes || { streams: [], expectedMonthly: 0 };
  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Income streams</span>
        <div style="display:flex;gap:0.5rem;align-items:center">
          ${inc.expectedMonthly ? `<span class="card-meta">${money(inc.expectedMonthly)} expected monthly</span>` : ''}
          <button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 9px" onclick="finAddIncome()">Add</button>
        </div>
      </div>
      ${inc.streams.length ? `
        <div class="fin-streams">
          ${inc.streams.map(s => {
            const paused = s.STATUS === 'paused';
            const ok = s.received >= s.expected && s.expected > 0;
            return `
            <div class="fin-stream ${paused ? 'paused' : ''} ${s.overdue ? 'overdue' : ''}">
              <div class="fin-stream-main">
                <span class="fin-stream-name">${escHtml(s.NAME)}</span>
                <span class="fin-stream-sub">${escHtml(s.SOURCE !== '-' ? s.SOURCE : '')}${s.dueDay ? ` · by the ${s.dueDay}${['st','nd','rd'][((s.dueDay + 90) % 100 - 10) % 10 - 1] || 'th'}` : ''} · ${escHtml(s.RECURS)}</span>
              </div>
              <div class="fin-stream-state">
                ${paused ? '<span class="fin-stream-flag">paused</span>'
                  : s.overdue ? '<span class="fin-stream-flag hot">not yet in - chase it</span>'
                  : ok ? '<span class="fin-stream-flag ok">received</span>'
                  : s.received > 0 ? `<span class="fin-stream-flag">partial · ${money(s.received)}</span>`
                  : '<span class="fin-stream-flag dim">expected</span>'}
                <span class="fin-stream-amt">${money(s.expected)}</span>
              </div>
              <div class="fin-stream-actions">
                <button class="btn btn-ghost" style="font-size:0.66rem;padding:1px 7px"
                        onclick="finToggleIncome('${escHtml(s.ID)}','${paused ? 'active' : 'paused'}')">${paused ? 'resume' : 'pause'}</button>
              </div>
            </div>`;
          }).join('')}
        </div>` : `
        <div class="empty-state" style="text-align:left;padding:0.5rem 0">
          No streams configured. Start with the salary … the amount, the day it lands, and a
          match word so the ledger recognises the money when it finally shows up.
        </div>`}
    </div>`;
}

function finAddIncome() {
  uiForm('Add income stream', [
    { id: 'name', label: 'Stream name', placeholder: 'Viva salary, DareHustle consulting' },
    { id: 'amount', label: 'Expected amount per cycle (KES)', type: 'number', value: '0' },
    { id: 'recurs', label: 'Recurs', type: 'select', value: 'monthly', options: ['monthly', 'weekly', 'once'] },
    { id: 'day', label: 'Day it usually lands', type: 'number', placeholder: '5',
      hint: 'Monthly streams only - leave blank otherwise. Late streams get flagged.' },
    { id: 'source', label: 'Source', placeholder: 'employer / client / product' },
    { id: 'match', label: 'Match word', placeholder: 'salary',
      hint: 'How ledger entries are recognised as this stream.' },
  ], async (v) => {
    if (!v.name) { showToast('Name the stream first', 'warn'); return false; }
    v.day = v.day || '-';
    v.match = v.match || v.name.split(/\s+/)[0].toLowerCase();
    const ok = await finPost('/api/finance/income', v, 'Stream configured … I will tell you when it is late');
    if (ok) fetchFinance();
    return ok;
  });
}

function finToggleIncome(id, status) {
  fetch('/api/finance/income', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status }) }).then(r => r.json()).then(() => fetchFinance());
}

// ── RECEIPTS & STATEMENTS ─────────────────────────────────────────────────────
// The dedicated drop point: a receipt photo or a statement goes to the OneDrive
// vault first (this desktop is a cache, not a home), comes back distilled into
// ledger-ready rows, and each row is logged only when Operator says so.
let finReceipt = { busy: false, result: null, error: null };
const FIN_RECEIPTS_FOLDER = 'Sconl/Core/Apex/Vault/vault-documents/finance/receipts';

function finReceipts() {
  const r = finReceipt.result;
  const x = r?.extracted;
  const single = x && !x.transactions ? x : null;
  const txs = x?.transactions || null;
  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Receipts &amp; statements</span>
        <button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 9px" title="Browse the filed documents"
                onclick="fmPendingPath='${FIN_RECEIPTS_FOLDER}';navigate('files')">Open folder</button>
      </div>
      <label class="fin-drop${finReceipt.busy ? ' busy' : ''}">
        <input type="file" accept="image/*,.pdf,.csv,.txt" hidden onchange="finReceiptUpload(this)"/>
        ${finReceipt.busy
          ? `<div class="spinner-inline"></div><div>Filing to OneDrive and reading it…</div>`
          : `<div class="fin-drop-main"><strong>Tap to upload</strong> a receipt photo or a statement</div>
             <div class="fin-drop-sub">image, PDF or CSV · filed to the Vault first · distilled to rows you confirm</div>`}
      </label>
      ${finReceipt.error ? `<div class="fin-warn">${escHtml(finReceipt.error)}</div>` : ''}
      ${r?.note ? `<div class="fin-warn">${escHtml(r.note)}</div>` : ''}
      ${r?.filed ? `<div class="fin-drop-filed">Filed to <code>${escHtml(r.filed.split('/').slice(-3).join('/'))}</code></div>` : ''}
      ${single ? finExtractRow(single, -1) : ''}
      ${txs && txs.length ? `
        <div class="fin-extract-head">
          <span>${x.summary?.period ? `${escHtml(String(x.summary.period))} · ` : ''}${txs.length} transactions read</span>
          <button class="btn btn-primary" style="font-size:0.68rem;padding:2px 10px"
                  onclick="finLogAll(this)">Log all readable</button>
        </div>
        ${txs.slice(0, 40).map((t, i) => finExtractRow(t, i)).join('')}` : ''}
    </div>`;
}

function finExtractRow(t, i) {
  const amount = Number(t.amount);
  const ok = Number.isFinite(amount) && amount > 0 && (t.type === 'expense' || t.type === 'income');
  return `
    <div class="fin-extract-row">
      <span class="fin-extract-date">${escHtml(t.date || 'today')}</span>
      <span class="fin-extract-desc">${escHtml(t.vendor || t.description || 'unlabelled')}${t.category ? ` <em>${escHtml(String(t.category))}</em>` : ''}</span>
      <span class="fin-extract-amt${t.type === 'income' ? ' in' : ''}">${ok ? money(amount) : '?'}</span>
      ${ok ? `<button class="btn btn-ghost fin-extract-log" onclick="finLogExtract(${i}, this)">Log</button>`
           : `<span class="fin-extract-skip" title="Unreadable - log it by hand">unreadable</span>`}
    </div>`;
}

function finReceiptUpload(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (file.size > 6 * 1024 * 1024) { showToast('Keep uploads under 6 MB', 'warn'); input.value = ''; return; }
  const kind = file.type.startsWith('image/') ? 'receipt' : 'statement';
  finReceipt = { busy: true, result: null, error: null };
  repaintView('finance');
  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = String(reader.result).split(',')[1] || '';
    try {
      const d = await (await fetch('/api/finance/receipt', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type || 'application/octet-stream',
                               content: base64, kind }) })).json();
      finReceipt = d.success
        ? { busy: false, result: { ...d, kind },
            error: d.extracted ? null : 'Filed, but I could not read it - log the numbers by hand.' }
        : { busy: false, result: null, error: d.error || 'Upload failed' };
    } catch (e) { finReceipt = { busy: false, result: null, error: e.message }; }
    if (currentView === 'finance') repaintView('finance');
  };
  reader.readAsDataURL(file);
}

async function finTxQuiet(t) {
  try {
    const d = await (await fetch('/api/finance/tx', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: t.type === 'income' ? 'income' : 'expense',
        amount: t.amount, date: t.date || undefined,
        category: t.category || 'uncategorised',
        description: t.description || t.vendor || 'from upload',
        vendor: t.vendor || undefined,
        note: `logged from uploaded ${finReceipt.result?.kind || 'receipt'}`,
      }) })).json();
    return !!d.success;
  } catch { return false; }
}

async function finLogExtract(i, btn) {
  const x = finReceipt.result?.extracted;
  const t = i < 0 ? x : x?.transactions?.[i];
  if (!t) return;
  btn.disabled = true; btn.textContent = 'Logging…';
  const ok = await finTxQuiet(t);
  if (ok) { btn.textContent = 'Logged ✓'; showToast('Logged to the ledger', 'success'); fetchFinance(); }
  else { btn.disabled = false; btn.textContent = 'Log'; showToast('Refused - check the row', 'error'); }
}

async function finLogAll(btn) {
  const txs = finReceipt.result?.extracted?.transactions || [];
  btn.disabled = true; btn.textContent = 'Logging…';
  let done = 0;
  for (const t of txs) {
    if (Number(t.amount) > 0 && (t.type === 'expense' || t.type === 'income')) {
      if (await finTxQuiet(t)) done++;
    }
  }
  showToast(`${done} of ${txs.length} logged to the ledger`, done ? 'success' : 'error');
  await fetchFinance();
}

/**
 * Ventures: his products, each reporting whatever metrics its endpoint exposes.
 * The convention is one small GET returning flat JSON numbers - the card renders
 * exactly the keys it receives, and an unreachable endpoint says so plainly.
 */
let VENTURES = null;
async function fetchVentures(force) {
  try { VENTURES = (await (await fetch(`/api/ventures${force ? '?refresh=1' : ''}`)).json()).ventures || []; }
  catch { VENTURES = []; }
  repaintView('finance');
}

function finVentures() {
  if (VENTURES === null) { fetchVentures(); return ''; }
  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Ventures</span>
        <div style="display:flex;gap:0.4rem;align-items:center">
          <button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 9px" onclick="fetchVentures(true)">Refresh</button>
          <button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 9px" onclick="finAddVenture()">Add</button>
        </div>
      </div>
      ${VENTURES.length ? `
        <div class="fin-ventures">
          ${VENTURES.map(v => `
            <div class="fin-venture">
              <div class="fin-venture-head">
                <span class="fin-venture-name">${escHtml(v.NAME)}</span>
                <span class="fin-venture-kind">${escHtml(v.KIND)}</span>
                ${v.fetchedAt ? `<span class="card-meta">as of ${escHtml(v.fetchedAt.slice(11, 16))}</span>` : ''}
              </div>
              ${v.metrics && Object.keys(v.metrics).length ? `
                <div class="fin-venture-metrics">
                  ${Object.entries(v.metrics).slice(0, 8).map(([k, val]) => `
                    <div class="fin-metric"><span>${escHtml(k)}</span><strong>${escHtml(String(val))}</strong></div>`).join('')}
                </div>`
              : v.error ? `<div class="fin-venture-err">unreachable: ${escHtml(v.error)}</div>`
              : `<div class="fin-venture-err dim">${v.ANALYTICS_URL === '-' ? 'no endpoint configured yet' : 'no data yet'}</div>`}
            </div>`).join('')}
        </div>` : `
        <div class="empty-state" style="text-align:left;padding:0.5rem 0">
          Nothing plugged in yet. When a product ships, give it a metrics endpoint
          returning flat JSON (<code>{"mrr": 0, "users": 0}</code>) and add it here -
          the dashboard renders whatever it reports. Auth tokens go in the secret
          store by name, never in the registry.
        </div>`}
    </div>`;
}

function finAddVenture() {
  uiForm('Register venture', [
    { id: 'name', label: 'Venture name', placeholder: 'WellPath, Keyvanos' },
    { id: 'kind', label: 'Kind', type: 'select', value: 'saas', options: ['saas', 'app', 'service'] },
    { id: 'url', label: 'Metrics endpoint URL', placeholder: 'https://… (blank = configure later)',
      hint: 'One small GET returning flat JSON numbers - the card renders whatever it reports.' },
    { id: 'authSecret', label: 'Secret-store key for its auth token', placeholder: 'blank = public endpoint' },
  ], async (v) => {
    if (!v.name) { showToast('Name the venture first', 'warn'); return false; }
    const ok = await finPost('/api/ventures/upsert', v, 'Venture registered … now show me numbers');
    if (ok) fetchVentures(true);
    return ok;
  });
}

/**
 * The recursive 50-30-20, as amounts. Every bucket splits its parent - needs
 * 50/30/20 into housing/food/utilities, wants into growth/friends/liquid,
 * security into savings/emergency/debt - each with its destination account
 * where the model routes one.
 */
function finAllocation(f) {
  const a = f.allocation;
  if (!a) return '';
  const label = { needs: 'Needs', wants: 'Wants', security: 'Security',
    housing: 'Housing', food: 'Food & groceries', utilities: 'Utilities',
    growth: 'Growth', 'friends-family': 'Friends & family', liquid: 'Daily liquid',
    savings: 'Savings', emergency: 'Emergency fund', debt: 'Debt repayment' };
  return `
    <div class="card">
      <div class="card-header"><span class="card-title">Allocation - recursive 50-30-20</span>
        <span class="card-meta">${a.planned ? `plan on the expected ${money(a.base)}` : `on ${money(a.base)} income this month`}</span></div>
      <div class="fin-alloc">
        ${a.buckets.map(b => `
          <div class="fin-alloc-bucket">
            <div class="fin-alloc-head">
              <span>${escHtml(label[b.name] || b.name)}</span>
              <span>${Math.round(b.share * 100)}% · <strong>${money(b.amount)}</strong></span>
            </div>
            ${b.children.map(k => `
              <div class="fin-alloc-row">
                <span>${escHtml(label[k.name] || k.name)}</span>
                <span class="fin-alloc-amt">${money(k.amount)}</span>
              </div>`).join('')}
          </div>`).join('')}
      </div>
    </div>`;
}

/**
 * The analysis. Every line is arithmetic with a recommendation attached, computed
 * from the ledger - the same judgement a good adviser applies, minus the fee and
 * the guesswork. Nothing here is model-generated; money gets arithmetic.
 */
function finAnalysis(f) {
  const nw = f.netWorth || {}; const m = f.month || {};
  const L = [];
  const debts = (f.accounts || []).filter(a => ['debt','loan','payable','credit'].includes((a.TYPE || '').toLowerCase()));

  // Income health first - money that should have arrived and has not is the most
  // actionable line on this card.
  const streams = f.incomes?.streams || [];
  for (const s of streams.filter(x => x.overdue)) {
    L.push({ level: 'warn',
      text: `${escHtml(s.NAME)} (${money(s.expected)}) was expected by the ${s.dueDay}th and has not landed. Chase it now - politely, in writing, while it is only days late.` });
  }
  const active = streams.filter(x => (x.STATUS || 'active') === 'active' && x.expected > 0);
  if (active.length >= 1 && f.incomes.expectedMonthly > 0) {
    const top = active.slice().sort((a, b) => b.expected - a.expected)[0];
    const share = Math.round((top.expected / f.incomes.expectedMonthly) * 100);
    if (share >= 80) L.push({ level: 'info',
      text: `${escHtml(top.NAME)} is ${share}% of expected income. One source is a single point of failure - the ventures below are the diversification play.` });
  }

  if (debts.length && nw.assets > 0) {
    const ratio = Math.round((nw.liabilities / nw.assets) * 100);
    L.push({ level: ratio > 50 ? 'warn' : 'ok',
      text: `Debt is ${ratio}% of assets (${money(nw.liabilities)} across ${debts.length} ${debts.length === 1 ? 'account' : 'accounts'}). ${ratio > 50 ? 'Priority: pay down the most expensive one before adding any investment.' : 'Manageable - keep the most expensive one shrinking.'}` });
  } else if (!debts.length && (f.accounts || []).length) {
    L.push({ level: 'ok', text: 'No debts on record. If that is genuinely true, everything saved compounds for you; if a debt is missing, add it - the picture is only useful when it is honest.' });
  }

  if (m.savingsRate != null) {
    L.push({ level: m.savingsRate >= 20 ? 'ok' : 'warn',
      text: `Keeping ${m.savingsRate}% of income this month${m.savingsRate >= 20 ? ' - at or above the 20% floor that compounds into real net worth.' : ' - below a 20% floor. The fastest lever is the low-necessity spend below, the second is income, and only then cutting essentials.'}` });
  } else if (m.expense > 0) {
    L.push({ level: 'warn', text: `${money(m.expense)} out this month with no income logged. Log income too, or every rate on this page reads as zero.` });
  }

  if (m.lowNecessity > 0 && m.expense > 0) {
    const share = Math.round((m.lowNecessity / m.expense) * 100);
    L.push({ level: share > 25 ? 'warn' : 'ok',
      text: `${money(m.lowNecessity)} (${share}%) of the month's spend carries your own necessity score of 4 or less. That is the discretionary envelope - decide its size on purpose.` });
  }

  if (f.runwayMonths != null) {
    L.push({ level: f.runwayMonths >= 3 ? 'ok' : 'warn',
      text: `Runway is ${f.runwayMonths} months at the current burn.${f.runwayMonths < 3 ? ' Under the 3-month emergency floor - build that before any illiquid move.' : ' The emergency floor is covered; surplus above ~6 months of burn can work harder than cash.'}` });
  }

  const cats = Object.entries(m.byCategory || {}).sort((a, b) => b[1] - a[1]);
  if (cats.length >= 2 && m.expense > 0) {
    const [top, amt] = cats[0];
    const share = Math.round((amt / m.expense) * 100);
    if (share >= 40) L.push({ level: 'info',
      text: `${escHtml(top)} is ${share}% of the month. One category that big is either structural (fine, plan around it) or a leak (fix it) - decide which.` });
  }

  for (const g of (f.goals || []).filter(x => x.STATUS === 'active' && x.DUE !== '-')) {
    const target = parseFloat(g.TARGET) || 0, cur = parseFloat(g.CURRENT) || 0;
    const daysLeft = Math.ceil((Date.parse(g.DUE) - Date.now()) / 86400000);
    if (target > cur && daysLeft > 0) {
      const perMonth = Math.round((target - cur) / Math.max(1, daysLeft / 30));
      L.push({ level: 'info', text: `"${escHtml(g.TITLE)}" needs ${money(perMonth)}/month to land by ${escHtml(g.DUE)}.` });
    }
  }

  if (!L.length) return '';
  return `
    <div class="card">
      <div class="card-header"><span class="card-title">Analysis</span>
        <span class="card-meta">arithmetic, not vibes</span></div>
      <div class="fin-insights">
        ${L.map(i => `<div class="fin-insight ${i.level}"><span></span><div>${i.text}</div></div>`).join('')}
      </div>
    </div>`;
}

async function finAddTx(btn) {
  const v = (id) => document.getElementById(id)?.value?.trim();
  const p = { type: v('fin-tx-type'), amount: v('fin-tx-amount'), category: v('fin-tx-category'),
              description: v('fin-tx-desc'), necessity: v('fin-tx-necessity') };
  if (!p.amount) { showToast('An amount would help', 'warn'); return; }
  btn.disabled = true;
  try {
    const d = await (await fetch('/api/finance/tx', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })).json();
    if (d.success) { showToast(`Logged … ${d.id}`, 'success'); await fetchFinance(); }
    else showToast(d.error || 'Refused', 'error');
  } catch (e) { showToast(e.message, 'error'); }
  btn.disabled = false;
}

async function finSetBalance(id, input) {
  try {
    const d = await (await fetch('/api/finance/account', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, balance: input.value }) })).json();
    if (d.success) { showToast('Noted … net worth recalculated', 'success'); await fetchFinance(); }
    else showToast(d.error || 'Refused', 'error');
  } catch (e) { showToast(e.message, 'error'); }
}

/* ══════════════════════════════════════════════════════════════════════════
   DIALOGS
   The console asked twenty-three questions through the browser's own prompt()
   and confirm() boxes: stock OS grey, unstyleable, wrong font, no dark mode,
   and on a phone a system sheet that looks nothing like the app it interrupted.
   Multi-field entry was worse - six chained prompts, no way back, and one
   Escape lost the lot.

   Three dialogs replace all of them, all promise-based so a caller reads as
   straight-line code:
     uiForm(title, fields, submit)  - many fields, validated, server-confirmed
     uiPrompt({...})                - one field
     uiConfirm({...})               - yes or no, with danger styling
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Ask a yes/no question. Resolves true only on the confirming button.
 * Escape, the backdrop and Cancel all resolve false, so a stray keypress can
 * never delete anything.
 */
function uiConfirm({ title, body = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  return new Promise(resolve => {
    document.getElementById('ui-confirm')?.remove();
    const ov = document.createElement('div');
    ov.id = 'ui-confirm';
    ov.className = 'modal-overlay';
    const done = (val) => { ov.remove(); document.removeEventListener('keydown', onKey); resolve(val); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); done(false); }
      if (e.key === 'Enter')  { e.preventDefault(); done(true); }
    };
    ov.innerHTML = `
      <div class="modal-box ui-dialog${danger ? ' is-danger' : ''}">
        <div class="modal-header">
          <span class="modal-title">${escHtml(title)}</span>
        </div>
        ${body ? `<div class="modal-body"><div class="ui-dialog-body">${escHtml(body)}</div></div>` : ''}
        <div class="modal-footer">
          <button class="btn btn-ghost" data-no>${escHtml(cancelLabel)}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${escHtml(confirmLabel)}</button>
        </div>
      </div>`;
    ov.onclick = (e) => { if (e.target === ov) done(false); };
    ov.querySelector('[data-no]').onclick = () => done(false);
    ov.querySelector('[data-yes]').onclick = () => done(true);
    document.body.appendChild(ov);
    document.addEventListener('keydown', onKey);
    // Focus the safe option on a destructive question, the action otherwise.
    ov.querySelector(danger ? '[data-no]' : '[data-yes]').focus();
  });
}

/** Ask for one value. Resolves the trimmed string, or null if dismissed. */
function uiPrompt({ title, label = '', value = '', placeholder = '', hint = '', type = 'text',
                    multiline = false, confirmLabel = 'Save' }) {
  return new Promise(resolve => {
    document.getElementById('ui-prompt')?.remove();
    const ov = document.createElement('div');
    ov.id = 'ui-prompt';
    ov.className = 'modal-overlay';
    const done = (val) => { ov.remove(); document.removeEventListener('keydown', onKey); resolve(val); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); done(null); } };
    ov.innerHTML = `
      <div class="modal-box ui-dialog">
        <div class="modal-header"><span class="modal-title">${escHtml(title)}</span>
          <button class="btn btn-ghost" data-no>✕</button></div>
        <div class="modal-body">
          ${label ? `<label for="ui-prompt-field">${escHtml(label)}</label>` : ''}
          ${multiline
            ? `<textarea id="ui-prompt-field" rows="5" placeholder="${escHtml(placeholder)}">${escHtml(value)}</textarea>`
            : `<input id="ui-prompt-field" type="${escHtml(type)}" value="${escHtml(value)}" placeholder="${escHtml(placeholder)}"/>`}
          ${hint ? `<div class="finform-hint">${escHtml(hint)}</div>` : ''}
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" data-cancel>Cancel</button>
          <button class="btn btn-primary" data-ok>${escHtml(confirmLabel)}</button>
        </div>
      </div>`;
    ov.onclick = (e) => { if (e.target === ov) done(null); };
    const field = ov.querySelector('#ui-prompt-field');
    const submit = () => { const v = field.value.trim(); done(v || null); };
    ov.querySelector('[data-no]').onclick = () => done(null);
    ov.querySelector('[data-cancel]').onclick = () => done(null);
    ov.querySelector('[data-ok]').onclick = submit;
    if (!multiline) field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });
    document.body.appendChild(ov);
    document.addEventListener('keydown', onKey);
    field.focus();
    field.select?.();
  });
}

/**
 * Many fields at once, validated, and closing only when the server has said
 * yes - the shape every "Add" in the console now uses.
 */
function uiForm(title, fields, submit) {
  document.getElementById('fin-form-overlay')?.remove();
  const ov = document.createElement('div');
  ov.id = 'fin-form-overlay';
  ov.className = 'modal-overlay';
  ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
  ov.innerHTML = `
    <div class="modal-box" style="max-width:420px">
      <div class="modal-header"><span class="modal-title">${escHtml(title)}</span>
        <button class="btn btn-ghost" onclick="document.getElementById('fin-form-overlay').remove()">✕</button></div>
      <div class="modal-body">
        ${fields.map(f => `
          <label for="ff-${f.id}">${escHtml(f.label)}</label>
          ${f.type === 'select'
            ? `<select id="ff-${f.id}">${f.options.map(o =>
                `<option value="${escHtml(o)}"${o === f.value ? ' selected' : ''}>${escHtml(o)}</option>`).join('')}</select>`
            : `<input id="ff-${f.id}" type="${f.type || 'text'}" value="${escHtml(f.value || '')}"
                 placeholder="${escHtml(f.placeholder || '')}"${f.type === 'number' ? ' inputmode="decimal" step="any"' : ''}/>`}
          ${f.hint ? `<div class="finform-hint">${escHtml(f.hint)}</div>` : ''}`).join('')}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="document.getElementById('fin-form-overlay').remove()">Cancel</button>
        <button class="btn btn-primary" id="ff-save">Save</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  ov.querySelector('input,select')?.focus();
  ov.querySelector('#ff-save').onclick = async (e) => {
    const btn = e.currentTarget;
    const vals = {};
    fields.forEach(f => { vals[f.id] = ov.querySelector(`#ff-${f.id}`)?.value?.trim() ?? ''; });
    btn.disabled = true;
    const ok = await submit(vals);
    btn.disabled = false;
    if (ok) ov.remove();
  };
  ov.querySelectorAll('input').forEach(i => i.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); ov.querySelector('#ff-save').click(); }
  }));
}

async function finPost(url, payload, okMsg) {
  try {
    const d = await (await fetch(url, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).json();
    if (d.success) { showToast(okMsg, 'success'); return true; }
    showToast(d.error || 'Refused', 'error'); return false;
  } catch (e) { showToast(e.message, 'error'); return false; }
}

function finAddAccount() {
  uiForm('Add account', [
    { id: 'name', label: 'Account name', placeholder: 'M-Pesa, Equity current, cash in hand' },
    { id: 'type', label: 'Type', type: 'select', value: 'cash',
      options: ['cash', 'mobile-money', 'bank', 'sacco', 'investment', 'receivable', 'debt'],
      hint: 'Debts subtract from net worth on their own - enter the balance as a positive number.' },
    { id: 'balance', label: 'Current balance (KES)', type: 'number', value: '0' },
  ], async (v) => {
    if (!v.name) { showToast('A name would help', 'warn'); return false; }
    const ok = await finPost('/api/finance/account', v, 'Account added … the picture just got more honest');
    if (ok) fetchFinance();
    return ok;
  });
}

function finAddGoal() {
  uiForm('Add goal', [
    { id: 'title', label: 'Goal', placeholder: 'Emergency fund - 3 months of burn' },
    { id: 'target', label: 'Target amount (KES)', type: 'number', value: '0' },
    { id: 'due', label: 'Target date', type: 'date', hint: 'Optional - a standing goal can live without one.' },
  ], async (v) => {
    if (!v.title) { showToast('Name the goal first', 'warn'); return false; }
    const ok = await finPost('/api/finance/goal', v, 'Goal added … a number with a date');
    if (ok) fetchFinance();
    return ok;
  });
}

/**
 * Export controls: the period and the formats are choices, not defaults forced
 * on you. Presets cover the common cases; custom dates cover the rest; the same
 * period drives View (browser / print) and Export (filed to the OneDrive Vault).
 */
function finExportReport() {
  let overlay = document.getElementById('chase-overlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'chase-overlay';
  overlay.className = 'chase-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const firstOfMonth = iso(new Date(today.getFullYear(), today.getMonth(), 1));
  const firstOfLast = iso(new Date(today.getFullYear(), today.getMonth() - 1, 1));
  const endOfLast = iso(new Date(today.getFullYear(), today.getMonth(), 0));
  const ytd = `${today.getFullYear()}-01-01`;

  overlay.innerHTML = `
    <div class="chase-box">
      <div class="chase-head"><div><strong>Export financial report</strong></div>
        <button class="btn btn-ghost" style="font-size:0.7rem" onclick="document.getElementById('chase-overlay').remove()">Close</button></div>
      <div class="fin-export-grid">
        <label>Period
          <select id="fx-period" class="jira-input" onchange="document.getElementById('fx-custom').style.display=this.value==='custom'?'flex':'none'">
            <option value="${firstOfMonth}|${iso(today)}">This month</option>
            <option value="${firstOfLast}|${endOfLast}">Last month</option>
            <option value="${ytd}|${iso(today)}">Year to date</option>
            <option value="all">All time</option>
            <option value="custom">Custom range…</option>
          </select></label>
        <div id="fx-custom" style="display:none;gap:0.5rem">
          <label>From <input id="fx-from" type="date" class="jira-input" value="${firstOfMonth}"/></label>
          <label>To <input id="fx-to" type="date" class="jira-input" value="${iso(today)}"/></label>
        </div>
        <div class="fx-formats">
          <label><input type="checkbox" id="fx-pdf" checked/> PDF statement</label>
          <label><input type="checkbox" id="fx-csv" checked/> CSV ledger (Excel)</label>
          <label><input type="checkbox" id="fx-html"/> HTML (print-ready)</label>
        </div>
      </div>
      <div class="draft-actions">
        <button class="btn btn-primary" style="font-size:0.72rem;padding:4px 12px" onclick="finDoExport(this)">Export to OneDrive</button>
        <button class="btn btn-ghost" style="font-size:0.72rem;padding:4px 10px" onclick="finViewReport('html')">View</button>
        <button class="btn btn-ghost" style="font-size:0.72rem;padding:4px 10px" onclick="finViewReport('pdf')">View PDF</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function finExportPeriod() {
  const v = document.getElementById('fx-period')?.value || 'all';
  if (v === 'all') return { all: true };
  if (v === 'custom') return { from: document.getElementById('fx-from')?.value, to: document.getElementById('fx-to')?.value };
  const [from, to] = v.split('|');
  return { from, to };
}

function finViewReport(format) {
  const p = finExportPeriod();
  const q = p.all ? 'all=1' : `from=${p.from}&to=${p.to}`;
  window.open(`/api/finance/report?${q}${format === 'pdf' ? '&format=pdf' : ''}`, '_blank');
}

async function finDoExport(btn) {
  const p = finExportPeriod();
  const formats = ['pdf', 'csv', 'html'].filter(f => document.getElementById(`fx-${f}`)?.checked);
  if (!formats.length) { showToast('Pick a format … I cannot export into the void', 'warn'); return; }
  const was = btn.textContent;
  btn.disabled = true; btn.textContent = 'Exporting…';
  try {
    const d = await (await fetch('/api/finance/report/export', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...p, formats }) })).json();
    showToast(d.success ? `Saved to OneDrive · ${(d.files || []).join(', ')}` : (d.error || 'Export failed'),
              d.success ? 'success' : 'error');
    if (d.success) document.getElementById('chase-overlay')?.remove();
  } catch (e) { showToast(e.message, 'error'); }
  btn.disabled = false; btn.textContent = was;
}

async function finSnapshot(btn) {
  btn.disabled = true;
  try {
    const d = await (await fetch('/api/finance/snapshot', { method: 'POST' })).json();
    if (d.success) { showToast(`Position frozen: ${money(d.snapshot.NET)}`, 'success'); await fetchFinance(); }
  } catch (e) { showToast(e.message, 'error'); }
  btn.disabled = false;
}

/**
 * The orientation strip.
 *
 * One line of altitude, one line of the next move, and the pressure nobody put on
 * the board. It sits above every view because the failure mode it exists for is
 * having ten well-run screens and no idea whether the week is going well.
 *
 * Cached in STATE and refreshed on task changes rather than fetched per navigation,
 * so switching views never waits on it.
 */
let orientation = null;

async function fetchOrientation() {
  try {
    const r = await fetch('/api/orientation');
    // A failed fetch keeps the last good strip on screen - stale beats vanished.
    // Today's lockout hid the strip for hours this way; only an explicit
    // available:false from the server may take it down now.
    if (r.ok) orientation = await r.json();
  } catch { /* keep the previous orientation */ }
  renderOrientation();
}

// One line: the next move on the left, the numbers that matter on the right.
// Everything else - what the numbers mean, who is quietly waiting - lives one
// click away in a popover, so the strip never competes with the view below it.
let orientOpen = false;

function renderOrientation() {
  const el = document.getElementById('orientation-strip');
  if (!el) return;
  const o = orientation;
  if (!o || !o.available) { el.hidden = true; return; }
  el.hidden = false;

  const c = o.counts || {};
  // Every number opens the list it was counted from - a figure you cannot
  // click is a claim you cannot check.
  const chip = (n, label, cls, tip) => n
    ? `<button class="orient-chip ${cls}" onclick="orientChipGo('${label}')"
         title="${escHtml(tip || 'Open the tasks behind this number')}"><b>${n}</b>${label}</button>` : '';
  const pressureN = (o.pressure || []).length;

  const gaps = o.gaps || [];

  el.innerHTML = `
    <div class="orient-main">
      <div class="orient-row">
        <div class="orient-next ${o.zoomIn.taskId ? 'linked' : ''}"
             ${o.zoomIn.taskId ? `onclick="openTask('${escHtml(o.zoomIn.taskId)}')" title="Open this task"` : ''}>
          <span class="orient-label">Next</span>
          <span class="orient-title">${escHtml(o.zoomIn.line)}</span>
          <span class="orient-when">${escHtml(o.zoomIn.detail)}</span>
        </div>
        <div class="orient-chips">
          ${chip(c.overdue, 'overdue', 'red')}
          ${chip(c.dueToday, 'today', 'amber')}
          ${chip(c.high, 'high', '')}
          ${chip(c.pending, 'waiting', '', o.zoomOut.detail)}
          ${pressureN ? `<button class="orient-chip orient-more${orientOpen ? ' on' : ''}"
              onclick="toggleOrient(event)" title="Standing items nobody put on the board"><b>${pressureN}</b>standing</button>` : ''}
        </div>
      </div>
      ${gaps.length ? `
        <div class="orient-watch">
          <span class="orient-watch-label">Watch</span>
          <div class="orient-gaps">
          ${gaps.map(g => g.taskId
            ? `<button class="orient-gap" onclick="openTask('${escHtml(g.taskId)}')">${refChips(escHtml(g.text))}</button>`
            : g.decisionId
              ? `<button class="orient-gap" title="The nudge is already written - click for it"
                   onclick="showChase('${escHtml(g.decisionId)}')">${refChips(escHtml(g.text))}<span class="orient-gap-cue">draft ready</span></button>`
              : `<span class="orient-gap inert">${refChips(escHtml(g.text))}</span>`).join('')}
          </div>
        </div>` : ''}
    </div>
    ${orientOpen && pressureN ? `
      <div class="orient-pop">
        ${o.pressure.map(p => `
          <div class="orient-pop-row">
            ${p.who ? `<span>${escHtml(p.who)}</span>` : '<span>·</span>'}
            <div>${escHtml(p.text)}</div>
          </div>`).join('')}
        ${o.zoomOut.detail ? `<div class="orient-pop-foot">${escHtml(o.zoomOut.detail)}</div>` : ''}
      </div>` : ''}`;
}

function toggleOrient(e) {
  e.stopPropagation();
  orientOpen = !orientOpen;
  renderOrientation();
}

// A strip chip lands on the Tasks list, pre-filtered where a filter exists.
function orientChipGo(kind) {
  taskFilters = { ...taskFilters, view: 'open', prio: kind === 'high' ? 'high' : '', tag: '' };
  navigate('tasks');
}

// The pre-written chase, one click from the Watch line. The pregen loop keeps
// these ready; if one is not there yet, this generates it on the spot.
async function showChase(decisionId) {
  let overlay = document.getElementById('chase-overlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'chase-overlay';
  overlay.className = 'chase-overlay';
  overlay.innerHTML = `<div class="chase-box"><div class="brief-pending">
    <div class="spinner-inline"></div><div>Fetching the chase for ${escHtml(decisionId)}…</div></div></div>`;
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);

  try {
    const d = await (await fetch(`/api/decisions/chase?id=${encodeURIComponent(decisionId)}`)).json();
    if (!d.success) {
      overlay.querySelector('.chase-box').innerHTML =
        `<div class="empty-state">${escHtml(d.error || 'Not available')}</div>`;
      return;
    }
    overlay.querySelector('.chase-box').innerHTML = `
      <div class="chase-head">
        <div><strong>${escHtml(d.decision.id)}</strong> · pending on ${escHtml(d.decision.by)} since ${escHtml(d.decision.date)}</div>
        <button class="btn btn-ghost" style="font-size:0.7rem" onclick="document.getElementById('chase-overlay').remove()">Close</button>
      </div>
      <div class="chase-to">To <strong>${escHtml(d.draft.to)}</strong> via ${escHtml(d.draft.channel)}</div>
      <textarea class="draft-message draft-editable" id="chase-text" spellcheck="true" aria-label="The message - edit it before you send it">${escHtml(d.draft.body)}</textarea><div class="draft-editable-hint">Edit it freely - what you leave here is what gets copied.</div>
      ${d.draft.checks?.length ? `<div class="draft-checks"><div class="draft-checks-label">Check before sending</div>
        ${d.draft.checks.map(c => `<div class="draft-check"><code>${escHtml(c.found)}</code><span>${escHtml(c.say)}</span></div>`).join('')}</div>` : ''}
      <div class="draft-actions">
        <button class="btn btn-primary" style="font-size:0.72rem;padding:3px 10px"
                onclick="navigator.clipboard?.writeText(draftText('chase-text')).then(()=>showToast('Copied … go be charming','success'))">Copy message</button>
        <button class="btn btn-ghost" style="font-size:0.72rem;padding:3px 10px"
                onclick="rechase('${escHtml(decisionId)}', this)">Different angle</button>
      </div>`;
  } catch (e) {
    overlay.querySelector('.chase-box').innerHTML = `<div class="empty-state">${escHtml(e.message)}</div>`;
  }
}

async function rechase(id, btn) {
  btn.disabled = true; btn.textContent = 'Rewriting…';
  try {
    await fetch('/api/decisions/chase', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    showChase(id);
  } catch (e) { showToast(e.message, 'error'); }
}

function navigate(viewName, params = {}, opts = {}) {
  if (!viewFns[viewName]) return;
  if (!opts.fromHistory) {
    pushHistory(viewName, params, currentView === viewName && viewName !== 'task');
    trailPush(viewName, params.taskId);
  }
  currentView = viewName;
  markBadgeSeen(viewName);   // opening the view clears its notification badge
  setPanelFocus('main');
  clearCardFocus();      // the view is about to re-render; any card focus is stale
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view===viewName));
  // The rail shows where you are: Command plus the one group holding this view.
  if (typeof syncNavGroupToView === 'function') syncNavGroupToView(viewName);
  // All three axis buttons share data-view="spaces", so narrow the highlight to
  // the axis actually being viewed rather than lighting up all three.
  if (viewName === 'spaces') {
    const axisId = spacesPath[0] || '';
    document.querySelectorAll('.nav-item[data-axis]').forEach(el =>
      el.classList.toggle('active', el.dataset.axis === axisId));
  }
  // Same narrowing for the Circle rings and the Project categories - all
  // their items share one data-view, so only the selected one stays lit.
  if (viewName === 'circle') {
    document.querySelectorAll('.nav-item[data-ring]').forEach(el =>
      el.classList.toggle('active', el.dataset.ring === circleRing));
  }
  if (viewName === 'projects') {
    document.querySelectorAll('.nav-item[data-cat]').forEach(el =>
      el.classList.toggle('active', el.dataset.cat === projectCat));
  }
  const container = document.getElementById('view-container');
  container.innerHTML = viewFns[viewName]();
  renderNavBar();
  container.scrollTop = 0;   // arriving somewhere new should start at the top
  // A chosen destination dismisses whichever mobile layer was up, and the tab
  // bar follows the view. Both are no-ops on desktop.
  if (typeof mShellClose === 'function') { mShellClose(); }
  if (viewName==='github')   Promise.all([fetchGhSnapshot(), STATE.contributions?Promise.resolve():fetchContributions()]).then(()=>{ if(currentView==='github') container.innerHTML=renderGitHub(); });
  if (viewName==='jira')     fetchJiraIssues().then(()=>{ if(currentView==='jira') container.innerHTML=renderJira(); });
  if (viewName==='settings') fetchState().then(()=>{ if(currentView==='settings') { container.innerHTML=renderSettings(); loadApkCard(); } });
  if (viewName==='audit')    loadAuditLog();
  if (viewName==='notifications') fetchNotifs();
  if (viewName==='finance')  fetchFinance();
  if (viewName==='planning') fetchPlans();
  // Files always opens at the OneDrive root unless a space explicitly handed a
  // path over for this one visit.
  if (viewName==='files')    { const p = fmPendingPath || 'root'; fmPendingPath = null; setTimeout(()=>fmNavigate(p), 100); }
  if (viewName==='social')   { setTimeout(()=>loadBufferDesk(), 60); }
  // Tree is small and cached after the first load, so re-render only when the
  // fetch actually had to happen.
  if (viewName==='spaces' && !STATE.spacesTree) {
    fetchSpaces().then(()=>{ if(currentView==='spaces') container.innerHTML=renderSpaces(); });
  }
}

// ── ACTIONS ───────────────────────────────────────────────────────────────────

/**
 * Checking a task off asks which kind of finished it is, rather than assuming.
 * Work that needs someone else's eyes goes to In Review; work that is genuinely
 * closed goes to Done. Both mirror to the matching Jira column.
 */
function markDone(taskId, jiraKey, el) {
  if (typeof jiraKey === 'object') { el = jiraKey; jiraKey = ''; }
  closeCompleteMenu();

  const menu = document.createElement('div');
  menu.className = 'complete-menu';
  menu.id = 'complete-menu';
  menu.innerHTML = `
    <div class="complete-menu-label">Mark as</div>
    <button class="complete-menu-btn review">In Review</button>
    <button class="complete-menu-btn done">Done</button>`;

  const anchor = el || document.getElementById(`task-row-${taskId}`);
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    menu.style.top  = `${r.bottom + 6}px`;
    menu.style.left = `${r.left}px`;
  }
  document.body.appendChild(menu);

  // Keep the box in the viewport when the row sits near the bottom edge.
  const mr = menu.getBoundingClientRect();
  if (mr.bottom > window.innerHeight - 8 && anchor) {
    menu.style.top = `${anchor.getBoundingClientRect().top - mr.height - 6}px`;
  }

  menu.querySelector('.review').onclick = () => completeTask(taskId, jiraKey, 'review', el);
  menu.querySelector('.done').onclick   = () => completeTask(taskId, jiraKey, 'done', el);

  // Defer so the click that opened the menu does not immediately dismiss it.
  setTimeout(() => {
    document.addEventListener('click', onCompleteMenuOutside);
    document.addEventListener('keydown', onCompleteMenuKey);
  }, 0);
}

function onCompleteMenuOutside(e) {
  if (!e.target.closest('#complete-menu')) closeCompleteMenu();
}
function onCompleteMenuKey(e) {
  if (e.key === 'Escape') closeCompleteMenu();
}
function closeCompleteMenu() {
  const m = document.getElementById('complete-menu');
  if (m) m.remove();
  document.removeEventListener('click', onCompleteMenuOutside);
  document.removeEventListener('keydown', onCompleteMenuKey);
}

async function completeTask(taskId, jiraKey, target, el) {
  closeCompleteMenu();
  if (el) el.classList.add('done');
  try {
    const r = await fetch('/api/tasks/done', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, jiraKey: jiraKey || undefined, target }),
    });
    const res = await r.json();
    if (!res.success) { showToast(res.error || 'Update failed', 'error'); if (el) el.classList.remove('done'); return; }

    const label = target === 'review' ? 'In Review' : 'Done';
    if (res.jira && res.jira.success)        showToast(`Task → ${label}; Jira ${res.jiraKey} moved to ${res.jira.newStatus || label}`, 'success');
    else if (res.jiraKey && res.jira?.error) showToast(`Task → ${label}. Jira not moved: ${res.jira.error}`, 'warn');
    else                                     showToast(`Task marked ${label}`, 'success');

    await fetchState();
    await fetchJiraIssues();
    navigate(currentView);
  } catch(e) { showToast(e.message, 'error'); if (el) el.classList.remove('done'); }
}

/**
 * Patch one task. Used by the urgency / status / due-date controls and by the
 * inline title editor. Re-fetches state so the row reflects what was actually
 * persisted rather than what we optimistically typed - GATE actions never lie.
 */
async function updateTask(taskId, patch, el, opts = {}) {
  if (el) el.disabled = true;
  try {
    const r = await fetch('/api/tasks/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, ...patch }),
    });
    const res = await r.json();
    if (!res.success) { showToast(res.error || 'Update failed', 'error'); return false; }

    const what = Object.keys(patch)[0];
    if (res.jira && res.jira.success === false) {
      showToast(`Saved locally. Jira not updated: ${res.jira.error}`, 'warn');
    } else if (res.jira && res.jira.warning) {
      showToast(res.jira.warning, 'warn');
    } else if (res.jira && res.jira.success) {
      showToast(`${what} updated and synced to ${res.jira.key}`, 'success');
    } else {
      showToast(`${what} updated`, 'success');
    }

    await fetchState();
    if (patch.status === 'done' || patch.priority) await fetchJiraIssues();
    // The task detail screen re-reads and repaints itself, so a generic
    // re-navigate here would fight it and lose any open editor.
    if (!opts.silentRender) navigate(currentView, {}, { fromHistory: true });
    return true;
  } catch (e) {
    showToast(e.message, 'error');
    return false;
  } finally {
    if (el) el.disabled = false;
  }
}

// Swap the title line for an input. Enter or blur saves, Escape abandons.
function beginEditTask(taskId) {
  const titleEl = document.getElementById(`task-title-${taskId}`);
  if (!titleEl || titleEl.dataset.editing === '1') return;
  const original = titleEl.textContent;
  titleEl.dataset.editing = '1';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = original;
  input.className = 'task-edit-input';
  titleEl.replaceWith(input);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  let settled = false;
  const restore = (text) => {
    if (settled) return;
    settled = true;
    const span = document.createElement('div');
    span.className = titleEl.className;
    span.id = titleEl.id;
    span.style.cursor = 'text';
    span.title = 'Click to edit';
    span.textContent = text;
    span.onclick = () => beginEditTask(taskId);
    input.replaceWith(span);
  };

  const commit = async () => {
    const next = input.value.trim();
    if (!next || next === original) { restore(original); return; }
    settled = true;                       // updateTask re-renders the whole view
    const okDone = await updateTask(taskId, { title: next });
    if (!okDone) { settled = false; restore(original); }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { settled = false; restore(original); }
  });
  input.addEventListener('blur', commit);
}

async function quickAddTask() {
  const input = document.getElementById('quick-task-input');
  const title = input?.value.trim();
  if (!title) return;
  showToast('Adding task…','info');
  try {
    const r = await fetch('/api/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,status:'today',priority:'medium',syncJira:true})});
    const data = await r.json();
    showToast(data?.jira?.key ? `Task added + synced as ${data.jira.key}!` : 'Task added','success');
  } catch(e) {}
  if (input) input.value='';
  await fetchState(); await fetchJiraIssues(); navigate('today');
}

async function addTask() {
  const input = document.getElementById('new-task-input');
  const title = input?.value.trim();
  if (!title) return;
  try { await fetch('/api/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,status:'today',priority:'medium',syncJira:true})}); } catch(e) {}
  if (input) input.value='';
  await fetchState(); navigate('tasks');
}

// ── TOAST ─────────────────────────────────────────────────────────────────────

function showToast(msg, type='info') {
  let c = document.getElementById('toast-container');
  if (!c) {
    c = document.createElement('div');
    c.id='toast-container';
    Object.assign(c.style,{position:'fixed',bottom:'1.5rem',right:'380px',zIndex:'9999',display:'flex',flexDirection:'column',gap:'0.5rem'});
    document.body.appendChild(c);
  }
  const colors={success:'var(--green)',error:'var(--red)',info:'var(--cyan)',warn:'var(--amber)'};
  const t = document.createElement('div');
  Object.assign(t.style,{background:'var(--panel)',border:`1px solid ${colors[type]||colors.info}`,color:'var(--text)',padding:'0.6rem 1rem',borderRadius:'var(--r-md)',fontSize:'0.83rem',boxShadow:'var(--shadow-modal)',maxWidth:'320px',transition:'opacity 0.3s'});
  t.textContent=msg;
  c.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),300);},3500);
  // Keep Context HUD in sync with any state-changing notification
  try { refreshContextIfActive(); } catch {}
}

// ── CHAT RAIL ─────────────────────────────────────────────────────────────────

// Appending with `innerHTML +=` re-parses and rebuilds the whole thread on every
// message, which drops event listeners, fights the scroll position, and is what
// made this feel janky. Everything below builds real DOM nodes and appends them.

const chatBox = () => document.getElementById('chat-rail-messages');

function chatScrollToEnd(smooth = true) {
  const box = chatBox();
  if (!box) return;
  box.scrollTo({ top: box.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

/** Render a safe subset of markdown. Input is escaped FIRST, so model output
 *  can never inject HTML. */
function chatFormat(text) {
  let s = escHtml(String(text ?? ''));
  s = s.replace(/```([\s\S]*?)```/g, (_m, code) => `<pre class="code-block">${code.trim()}</pre>`);
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Links. An answer about a task or an idea should be one tap from the thing
  // itself, so a [label](?v=ideas) target navigates in place rather than
  // reloading the console; anything http:// opens in a new tab. Runs after
  // escaping, so the href is built from already-safe text.
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_m, label, href) => {
    if (/^\?v=/.test(href)) {
      const q = new URLSearchParams(href.slice(1));
      const view = (q.get('v') || '').replace(/[^\w-]/g, '');
      const task = (q.get('task') || '').replace(/[^\w-]/g, '');
      if (!view) return label;
      return `<a href="${href}" class="chat-link" onclick="chatGo('${view}','${task}');return false">${label}</a>`;
    }
    if (/^https?:\/\//i.test(href)) {
      return `<a href="${href}" class="chat-link" target="_blank" rel="noreferrer">${label}</a>`;
    }
    return label;
  });
  // Bare urls that were not already turned into anchors above.
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g,
    (_m, pre, u) => `${pre}<a href="${u}" class="chat-link" target="_blank" rel="noreferrer">${u}</a>`);

  s = s.replace(/\n/g, '<br>');
  return s;
}

/**
 * An idea was captured from the conversation. Refresh the pipeline if he is
 * looking at it, and say so plainly if he is not - a capture he cannot see is
 * the exact failure this whole system exists to fix.
 */
function onIdeasCaptured(ids) {
  fetchIdeas();
  if (currentView !== 'ideas') {
    showToast(`${ids.length === 1 ? 'Idea' : `${ids.length} ideas`} captured to the vault`, 'success');
  }
}

/** Follow a link the assistant put in a reply. Closes the sheet on a phone. */
function chatGo(view, taskId) {
  if (taskId && view === 'task') { openTask(taskId); return; }
  if (!viewFns[view]) { showToast(`No ${view} view to open`, 'warn'); return; }
  navigate(view);
}

function chatAppend(role, html, opts = {}) {
  const box = chatBox();
  if (!box) return null;
  const el = document.createElement('div');
  el.className = 'chat-msg ' + (role === 'user' ? 'user' : 'agent');
  if (opts.id) el.id = opts.id;
  if (opts.error) el.style.color = 'var(--red)';

  const label = document.createElement('div');
  label.className = 'msg-role';
  label.textContent = role === 'user' ? 'You' : 'iSconl';
  el.appendChild(label);

  const body = document.createElement('div');
  body.className = 'msg-content';
  body.innerHTML = html;          // callers pass already-escaped/formatted html
  el.appendChild(body);

  // Every message carries its own copy button and can be picked up by the
  // selection bar. Transient messages - the typing indicator, action cards -
  // opt out, so there is never a copy button on something with nothing to copy.
  if (!opts.transient) {
    el.classList.add('chat-msg-real');
    const act = document.createElement('button');
    act.className = 'chat-msg-copy';
    act.type = 'button';
    act.title = 'Copy this message';
    act.setAttribute('aria-label', 'Copy this message');
    act.textContent = 'Copy';
    act.onclick = (e) => { e.stopPropagation(); chatCopyMessage(el, act); };
    el.appendChild(act);
    el.addEventListener('click', () => {
      if (!document.body.classList.contains('chat-selecting')) return;
      el.classList.toggle('picked');
      chatSelCount();
    });
  }

  box.appendChild(el);
  chatScrollToEnd();
  return el;
}

// ── CHAT: COPY, SELECT, EXPORT, THREADS ──────────────────────────────────────
// The affordances every other assistant has, and the one thing they mostly do
// not: the transcript is his, in his vault, on his OneDrive.

/** The readable text of one rendered message, without the role label. */
function chatMsgText(el) {
  const body = el.querySelector('.msg-content');
  if (!body) return '';
  const clone = body.cloneNode(true);
  clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  return (clone.textContent || '').trim();
}

/**
 * Copy that works over plain http too. The clipboard API needs a secure
 * context, which this console is not on a LAN, so fall back to a selection
 * and execCommand rather than failing silently.
 */
function chatCopyText(text, done) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(done, () => chatCopyFallback(text, done));
  } else chatCopyFallback(text, done);
}
function chatCopyFallback(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  Object.assign(ta.style, { position:'fixed', top:'-1000px', opacity:'0' });
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); done(); }
  catch { showToast('Copy blocked by the browser', 'error'); }
  finally { ta.remove(); }
}

function chatCopyMessage(el, btn) {
  const text = chatMsgText(el);
  if (!text) return;
  chatCopyText(text, () => {
    const was = btn.textContent;
    btn.textContent = 'Copied';
    btn.classList.add('done');
    setTimeout(() => { btn.textContent = was; btn.classList.remove('done'); }, 1500);
  });
}

function chatToggleSelect() {
  const on = document.body.classList.toggle('chat-selecting');
  document.getElementById('chat-selbar')?.classList.toggle('hidden', !on);
  document.getElementById('chat-select-btn')?.classList.toggle('on', on);
  if (!on) document.querySelectorAll('.chat-msg.picked').forEach(m => m.classList.remove('picked'));
  else showToast('Tap messages to pick them', 'info');
  chatSelCount();
}

function chatSelCount() {
  const n = document.querySelectorAll('.chat-msg.picked').length;
  const el = document.getElementById('chat-selcount');
  if (el) el.textContent = `${n} selected`;
  return n;
}

function chatPickedText() {
  return [...document.querySelectorAll('.chat-msg.picked')].map(el => {
    const who = el.classList.contains('user') ? 'Architect' : 'iSconl';
    return `${who}: ${chatMsgText(el)}`;
  }).join('\n\n');
}

function chatCopySelected(btn) {
  const text = chatPickedText();
  if (!text) return showToast('Nothing picked yet', 'warn');
  chatCopyText(text, () => {
    const was = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = was; }, 1500);
    showToast(`${chatSelCount()} messages copied`, 'success');
  });
}

/**
 * Export. A selection exports exactly what he picked, straight from the screen.
 * The whole conversation comes from the server instead, because the vault holds
 * turns that scrolled out of the DOM long ago.
 */
async function chatExport(selectionOnly) {
  if (selectionOnly) {
    const text = chatPickedText();
    if (!text) return showToast('Nothing picked yet', 'warn');
    return chatDownload(text, `${new Date().toISOString().slice(0,10).replace(/-/g,'')}_chat_selection.md`);
  }
  const fmt = await uiConfirm({ title:'Export this conversation?',
    body:'The whole thread is written out as markdown, including anything that has scrolled out of view.',
    confirmLabel:'Export' });
  if (!fmt) return;
  try {
    const d = await (await fetch('/api/chat/export', { method:'POST',
      headers:{'Content-Type':'application/json'}, body: JSON.stringify({ format:'md' }) })).json();
    if (!d.success) throw new Error(d.error || 'refused');
    chatDownload(d.content, d.filename);
  } catch (e) { showToast(e.message, 'error'); }
}

function chatDownload(text, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type:'text/markdown' }));
  a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  showToast('Exported', 'success');
}

async function chatToggleHistory() {
  const box = document.getElementById('chat-history');
  if (!box) return;
  if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  box.innerHTML = `<div class="chat-hist-empty">Looking…</div>`;
  try {
    const d = await (await fetch('/api/chat/threads')).json();
    const list = d.threads || [];
    box.innerHTML = list.length ? list.map(t => `
      <div class="chat-hist${t.ID === d.current ? ' current' : ''}" onclick="chatOpenThread('${escHtml(t.ID)}')">
        <span class="chat-hist-title">${escHtml(t.TITLE)}</span>
        <span class="chat-hist-meta">${fmtWhen(t.UPDATED_AT)} · ${t.COUNT} message${t.COUNT === '1' ? '' : 's'}</span>
        <button class="chat-hist-del" title="Delete this conversation"
                onclick="event.stopPropagation();chatDeleteThread('${escHtml(t.ID)}')">✕</button>
      </div>`).join('')
      : `<div class="chat-hist-empty">No stored conversations yet. This one is being saved as you go.</div>`;
  } catch {
    box.innerHTML = `<div class="chat-hist-empty">Could not read the history.</div>`;
  }
}

async function chatOpenThread(id) {
  try {
    const d = await (await fetch('/api/chat/thread/open', { method:'POST',
      headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) })).json();
    if (!d.success) throw new Error(d.error || 'could not open it');
    const box = chatBox();
    box.innerHTML = '';
    (d.messages || []).forEach(m => chatAppend(m.role === 'user' ? 'user' : 'agent', chatFormat(m.content)));
    document.getElementById('chat-history')?.classList.add('hidden');
    chatScrollToEnd();
    showToast('Conversation reopened', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

async function chatDeleteThread(id) {
  const ok = await uiConfirm({ title:'Delete this conversation?',
    body:'It goes out of the vault entirely, including from OneDrive on the next sync.',
    confirmLabel:'Delete', danger:true });
  if (!ok) return;
  await fetch('/api/chat/thread/delete', { method:'POST',
    headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) });
  showToast('Deleted', 'info');
  chatToggleHistory(); chatToggleHistory();
}

async function chatNewThread() {
  await fetch('/api/chat/thread/new', { method:'POST',
    headers:{'Content-Type':'application/json'}, body:'{}' });
  const box = chatBox();
  if (box) box.innerHTML = '';
  document.getElementById('chat-history')?.classList.add('hidden');
  renderChatGreeting();
  showToast('New conversation. The last one is saved.', 'success');
}

/** One typing indicator at a time, removed no matter how the turn ends. */
let chatTypingEl = null;
/**
 * Waiting state that tells the truth as time passes.
 *
 * A static "thinking..." is indistinguishable from a hang, and a local model can
 * legitimately need minutes on its first call. So the label escalates and an
 * elapsed counter runs: you always know whether to keep waiting.
 */
let chatTypingTimer = null;

const WAIT_STAGES = [
  { at: 0,  text: 'thinking' },
  { at: 6,  text: 'still thinking' },
  { at: 15, text: 'working on it' },
  { at: 30, text: 'the local model is waking up, this only happens once' },
  { at: 75, text: 'still loading weights, genuinely worth the wait' },
  { at: 150, text: 'nearly there, or nearly not' },
];

function chatShowTyping(label = 'thinking') {
  chatClearTyping();
  const box = chatBox();
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'chat-msg agent chat-typing';
  el.innerHTML = `<div class="msg-role">iSconl</div>
    <div class="msg-content chat-waiting">
      <span class="chat-wait-label">${escHtml(label)}</span><span class="chat-dots"></span>
      <span class="chat-wait-elapsed"></span>
    </div>`;
  box.appendChild(el);
  chatTypingEl = el;
  chatScrollToEnd();

  // Only escalate for the generic wait; a specific label ("distilling") is
  // already informative and should not be overwritten.
  const generic = label === 'thinking';
  const started = Date.now();
  chatTypingTimer = setInterval(() => {
    if (!chatTypingEl || !document.body.contains(chatTypingEl)) return;
    const secs = Math.floor((Date.now() - started) / 1000);
    const elapsed = chatTypingEl.querySelector('.chat-wait-elapsed');
    if (elapsed) elapsed.textContent = secs >= 4 ? `${secs}s` : '';
    if (generic) {
      const stage = [...WAIT_STAGES].reverse().find(s => secs >= s.at);
      const lbl = chatTypingEl.querySelector('.chat-wait-label');
      if (stage && lbl && lbl.textContent !== stage.text) lbl.textContent = stage.text;
    }
  }, 1000);
}

function chatClearTyping() {
  if (chatTypingTimer) { clearInterval(chatTypingTimer); chatTypingTimer = null; }
  if (chatTypingEl) { chatTypingEl.remove(); chatTypingEl = null; }
  // Belt and braces: clear any orphan left by an earlier bug or a reload.
  document.querySelectorAll('.chat-typing').forEach(n => n.remove());
}

function chatSetBusy(busy) {
  const btn = document.getElementById('chat-rail-send-btn');
  const ta  = document.getElementById('chat-rail-textarea');
  if (btn) { btn.disabled = busy; btn.textContent = busy ? 'Sending' : 'Send'; }
  if (ta)  { ta.disabled = busy; if (!busy) ta.focus(); }
}

function railChatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendRailChat(); }
}

async function sendRailChat() {
  const ta = document.getElementById('chat-rail-textarea');
  if (!ta || ta.disabled) return;
  const text = ta.value.trim();
  if (!text) return;
  if (!chatBox()) { showToast('Chat panel not ready', 'error'); return; }

  chatAppend('user', chatFormat(text));
  ta.value = '';
  ta.style.height = '';           // reset autosize
  chatSetBusy(true);

  // Multi-line pasted content that looks like a task list goes to the distiller.
  const lower = text.toLowerCase();
  const looksLikeTasks =
    (lower.startsWith('distill') || lower.startsWith('extract') ||
     (text.includes('\n') && /(^|\n)\s*(?:[-*•]|\d+[.)])\s+/.test(text)))
    && !lower.startsWith('gh ');

  try {
    if (looksLikeTasks) {
      chatShowTyping('distilling into tasks');
      let handled = false;
      try {
        const r = await fetch('/api/distill', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, syncJira: true }),
        });
        if (r.ok) {
          const data = await r.json().catch(() => ({}));
          if (data.success && data.tasks?.length) {
            chatClearTyping();
            await fetchState();
            await fetchJiraIssues();
            renderDistillationInChat(data.tasks);
            handled = true;
          }
        }
      } catch { /* fall through to a normal chat turn */ }

      if (!handled) {
        chatShowTyping('thinking');
        const reply = await postChat(text);
        chatClearTyping();
        chatAppend('agent', chatFormat(reply));
      }
    } else {
      // Try to ACT before trying to talk. "mark the gap register done" should do
      // the thing, not describe how one might go about doing the thing. Parsing is
      // instant, so this costs nothing when the sentence is only a question.
      const acted = await tryAction(text);
      if (!acted) {
        const streamed = await streamChat(text);
        if (!streamed) {
          // Streaming unavailable or it produced nothing; fall back to one reply.
          chatShowTyping('thinking');
          const reply = await postChat(text);
          chatClearTyping();
          chatAppend('agent', chatFormat(reply));
        }
      }
    }
  } catch (e) {
    chatClearTyping();
    const msg = /failed|fetch|network/i.test(e.message || '')
      ? 'Could not reach the agent. Is it still running on this port?'
      : `Chat error: ${e.message}`;
    chatAppend('agent', escHtml(msg), { error: true });
  } finally {
    chatClearTyping();               // never leave a stuck "thinking..."
    chatSetBusy(false);
    chatScrollToEnd();
  }
}

/**
 * Stream a reply, painting words as they arrive. Returns true if it produced text.
 *
 * Total time is the same; what changes is that the answer starts within a second or
 * two instead of appearing all at once minutes later. On this hardware that is the
 * difference between the panel looking broken and looking like it is thinking.
 *
 * Written against fetch + a ReadableStream rather than EventSource, because
 * EventSource cannot POST and cannot carry the Authorization header.
 */
async function streamChat(text) {
  const box = chatBox();
  if (!box || !window.ReadableStream) return false;

  let el = null, buffer = '', started = false;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), CHAT_TIMEOUT_MS);

  chatShowTyping('thinking');
  try {
    const r = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ message: text }),
      signal: ac.signal,
    });
    if (!r.ok || !r.body) { chatClearTyping(); return false; }

    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let pending = '';

    const paint = (piece) => {
      if (!started) {
        // First token: replace the waiting indicator with a real message bubble.
        chatClearTyping();
        el = document.createElement('div');
        el.className = 'chat-msg agent';
        el.innerHTML = `<div class="msg-role">iSconl</div><div class="msg-content streaming"></div>`;
        box.appendChild(el);
        started = true;
      }
      buffer += piece;
      const target = el.querySelector('.msg-content');
      if (target) target.innerHTML = chatFormat(buffer);
      chatScrollToEnd();
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += dec.decode(value, { stream: true });

      // SSE frames are separated by a blank line; a frame can arrive split.
      let sep;
      while ((sep = pending.indexOf('\n\n')) >= 0) {
        const frame = pending.slice(0, sep);
        pending = pending.slice(sep + 2);
        const ev = (frame.match(/^event:\s*(.+)$/m) || [])[1];
        const raw = (frame.match(/^data:\s*(.+)$/m) || [])[1];
        if (!raw) continue;
        let d; try { d = JSON.parse(raw); } catch { continue; }

        if (ev === 'token' && d.t) paint(d.t);
        else if (ev === 'done') {
          if (d.captured?.length) onIdeasCaptured(d.captured);
          if (d.response && !started) paint(d.response);
          else if (d.response && started && d.response !== buffer) {
            // Server did post-processing; trust its final text over our assembly.
            buffer = d.response;
            const target = el.querySelector('.msg-content');
            if (target) target.innerHTML = chatFormat(buffer);
          }
        }
        else if (ev === 'error') { chatClearTyping(); return false; }
      }
    }

    if (el) el.querySelector('.msg-content')?.classList.remove('streaming');
    chatClearTyping();
    return !!buffer.trim();
  } catch (e) {
    chatClearTyping();
    // A partial answer already on screen is a success, not a failure.
    if (el) { el.querySelector('.msg-content')?.classList.remove('streaming'); return !!buffer.trim(); }
    return false;
  } finally { clearTimeout(timer); }
}

/**
 * Attempt the sentence as an action. Returns true if it was handled.
 *
 * Anything gated comes back as a plan the user has to accept, so a delete or an
 * outward-facing Jira write always crosses an explicit yes. Nothing destructive
 * happens because a regex felt confident.
 */
async function tryAction(text) {
  let d;
  try {
    const r = await fetch('/api/act', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    d = await r.json();
  } catch (e) { return false; }

  if (!d || !d.understood) return false;

  if (d.needsClarification) {
    const opts = (d.options || []).map(o =>
      `<button class="chip" onclick="quickAsk(${JSON.stringify(`__ID__:${o.id}`).replace(/"/g, '&quot;')})">${escHtml(o.title.slice(0, 60))}</button>`
    ).join('');
    chatAppend('agent', `${escHtml(d.describe)}${opts ? `<div class="chat-inline-chips">${opts}</div>` : ''}`);
    return true;
  }

  if (d.needsConfirmation) {
    renderActionConfirm(d.plan, d.describe);
    return true;
  }

  await applyActionResult(d);
  return true;
}

function renderActionConfirm(plan, describe) {
  const id = 'confirm-' + Math.random().toString(36).slice(2, 9);
  chatAppend('agent', `
    <div class="action-confirm" id="${id}">
      <div class="action-confirm-text">${escHtml(describe)}</div>
      <div class="action-confirm-btns">
        <button class="btn btn-primary" data-yes>Do it</button>
        <button class="btn btn-ghost" data-no>Leave it</button>
      </div>
    </div>`, { transient: true });
  const box = document.getElementById(id);
  if (!box) return;
  box.querySelector('[data-no]').onclick = () => {
    box.outerHTML = `<div class="action-declined">Left alone.</div>`;
  };
  box.querySelector('[data-yes]').onclick = async () => {
    box.querySelectorAll('button').forEach(b => b.disabled = true);
    try {
      const r = await fetch('/api/act', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, confirm: true }),
      });
      const d = await r.json();
      box.remove();
      await applyActionResult(d);
    } catch (e) {
      box.remove();
      chatAppend('agent', escHtml(e.message), { error: true });
    }
  };
}

async function applyActionResult(d) {
  chatAppend('agent', escHtml(d.message || (d.ok ? 'Done.' : 'That did not work.')),
             d.ok ? {} : { error: true });
  const refresh = d.refresh || [];
  if (refresh.includes('tasks')) await fetchState();
  if (refresh.includes('jira'))  await fetchJiraIssues();
  if (refresh.includes('ideas')) await fetchIdeas();
  if (d.navigate) { navigate(d.navigate); return; }
  // Repaint whichever view is showing the thing that just changed.
  if (refresh.length && ['today','tasks','jira','ideas'].includes(currentView)) {
    navigate(currentView, {}, { fromHistory: true });
  }
  if (currentView === 'task' && refresh.includes('tasks')) await refreshTaskDetail();
}

function quickAsk(q) {
  const ta = document.getElementById('chat-rail-textarea');
  if (!ta) return;
  // Disambiguation chips send back a task ID so the parser cannot mis-match twice.
  if (typeof q === 'string' && q.startsWith('__ID__:')) {
    const id = q.slice(7);
    const t = (STATE.tasks || []).find(x => x.ID === id);
    ta.value = t ? `mark ${t.ID} done` : id;
  } else ta.value = q;
  sendRailChat();
}

function escHtml(str) { return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/**
 * The one date formatter for the whole console.
 *
 * A bare "2026-07-29" makes him do arithmetic to work out whether that was a
 * Wednesday and whether it has passed. So every date carries its weekday, and
 * anything with a real time of day carries the time too. Date-only values are
 * never given a fake midnight - if the source has no clock, neither does the
 * output.
 *
 *   fmtWhen('2026-07-29')            -> 'Wed 29 Jul 2026'
 *   fmtWhen('2026-07-29T14:05:00Z')  -> 'Wed 29 Jul 2026, 17:05'   (his timezone)
 *   fmtWhen(x, { long: true })       -> 'Wednesday, 29 July 2026 at 17:05'
 *   fmtWhen(x, { rel: true })        -> '... · 1 day ago'
 */
function fmtWhen(value, opts = {}) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw || raw === '-') return '-';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return escHtml(raw);

  // A plain YYYY-MM-DD has no time in it; parsed as UTC midnight it would
  // display as the previous evening in Nairobi. Render those as pure dates.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const wantTime = opts.time !== false && !dateOnly;
  const long = !!opts.long;

  const datePart = dateOnly
    ? new Date(raw + 'T12:00:00').toLocaleDateString('en-GB',
        long ? { weekday:'long', day:'numeric', month:'long', year:'numeric' }
             : { weekday:'short', day:'numeric', month:'short', year:'numeric' })
    : d.toLocaleDateString('en-GB',
        long ? { weekday:'long', day:'numeric', month:'long', year:'numeric' }
             : { weekday:'short', day:'numeric', month:'short', year:'numeric' });

  let out = datePart.replace(/,$/, '');
  if (wantTime) {
    // "at" rather than another comma: en-GB already puts one after the weekday,
    // and "Wed, 29 Jul 2026, 17:05" makes the reader parse two clauses.
    const t = d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', hour12:false });
    out += ` at ${t}`;
  }
  if (opts.rel) { const r = relWhen(d); if (r) out += ` · ${r}`; }
  return out;
}

/** "3 days ago" / "in 2 days" / "today". Companion to fmtWhen, never alone. */
function relWhen(value) {
  const d = value instanceof Date ? value : new Date(String(value));
  if (isNaN(d.getTime())) return '';
  const days = Math.round((d.setHours(12,0,0,0) - new Date().setHours(12,0,0,0)) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days < 0) return `${Math.abs(days)} days ago`;
  return `in ${days} days`;
}

// ── COMMAND PALETTE ───────────────────────────────────────────────────────────

function openCmd() { const o=document.getElementById('cmd-overlay'); const i=document.getElementById('cmd-input'); o?.classList.remove('hidden'); i&&setTimeout(()=>i.focus(),50); }
function closeCmd() { document.getElementById('cmd-overlay')?.classList.add('hidden'); const i=document.getElementById('cmd-input'); if(i)i.value=''; document.getElementById('cmd-result')?.classList.add('hidden'); document.getElementById('cmd-suggestions')?.classList.remove('hidden'); }
function showCmdResult(text) { const r=document.getElementById('cmd-result'); const s=document.getElementById('cmd-suggestions'); if(r){r.textContent=text;r.classList.remove('hidden');} s?.classList.add('hidden'); }

document.addEventListener('keydown', e => {
  if ((e.ctrlKey||e.metaKey)&&e.key==='k') { e.preventDefault(); openCmd(); }
  if (e.key==='Escape') closeCmd();
});

// ── POLLING ───────────────────────────────────────────────────────────────────

// ── NAV GROUPS ───────────────────────────────────────────────────────────────
// Collapsible sidebar groups. Every group collapses by default on load;
// only the one holding the active view opens - see syncNavGroupToView.
/**
 * ONE GROUP OPEN, EVER: wherever you are. No group is pinned - Hub included -
 * so the rail never shows more than the single group holding the view
 * currently on screen. Everything else stays folded until you go there.
 *
 * The open group follows navigation rather than being chosen: going to
 * Finance opens PERSONAL and folds whatever was open before, so the rail is
 * always showing where you actually are.
 */
let navOpenGroup = null;          // the one group currently open

function setNavGroupCollapsed(g, collapsed) {
  const body = document.getElementById(`nav-group-${g}`);
  const head = document.querySelector(`.nav-group-head[data-group="${g}"]`);
  if (!body || !head) return;
  body.classList.toggle('collapsed', collapsed);
  head.classList.toggle('collapsed', collapsed);
}

/** Open exactly this group (or none), folding every other. */
function navOpenOnly(g) {
  navOpenGroup = g || null;
  document.querySelectorAll('.nav-group-head').forEach(head => {
    const id = head.dataset.group;
    setNavGroupCollapsed(id, id !== navOpenGroup);
  });
}

/** Which group holds the nav item for a view. */
function navGroupForView(view) {
  const item = document.querySelector(`.nav-item[data-view="${view}"]`);
  const body = item?.closest('.nav-group-body');
  return body ? body.id.replace('nav-group-', '') : null;
}

/** Follow the view. Called from navigate() so the rail always tracks where you are. */
function syncNavGroupToView(view) {
  const g = navGroupForView(view);
  if (!g) return;
  if (g !== navOpenGroup) navOpenOnly(g);
}

function initNavGroups() {
  document.querySelectorAll('.nav-group-head').forEach(head => {
    const g = head.dataset.group;
    if (!document.getElementById(`nav-group-${g}`)) return;
    // Clicking an open group closes it; clicking a closed one makes it the
    // open one, folding whatever was open before.
    head.addEventListener('click', () => navOpenOnly(navOpenGroup === g ? null : g));
  });

  // Collapsed by default; syncNavGroupToView (below) opens whichever group
  // holds the actual starting view, so no group is ever open without reason.
  navOpenOnly(null);
  syncNavGroupToView(currentView);
}
document.addEventListener('DOMContentLoaded', initNavGroups);

// ── THE CIRCLE ───────────────────────────────────────────────────────────────
// Everyone, in three rings: Family / Professional / Social - the same shape as
// OneDrive's Sconl/Circle. Due-for-contact is computed server-side; the DIA
// button opens or refreshes the person's private analysis profile.

let CIRCLE = null;
let circleOpenPerson = null;
let circleRing = 'all';   // the high-level ring tab: all / family / professional / social

async function fetchCircle() {
  try { CIRCLE = await (await fetch('/api/circle')).json(); }
  catch { CIRCLE = null; }
  if (currentView === 'circle') {
    document.getElementById('view-container').innerHTML = renderCircle();
  }
}

function renderCircle() {
  if (!CIRCLE) { fetchCircle(); return `<div class="card"><div class="empty-state">Gathering the circle…</div></div>`; }
  const people = CIRCLE.people || [];
  const due = people.filter(p => p.dueIn != null && p.dueIn <= 0);

  // Each ring wears its own colour - family green, professional blue, social
  // violet - carried on the header and a dot per card. No urgency strips on
  // the cards themselves; "due now" stays as text.
  const RING_COLOR = { family: '#3fb950', professional: '#58a6ff', social: '#bc8cff' };
  const ring = (name, key) => {
    const members = people.filter(p => p.CIRCLE === key);
    if (!members.length) return '';
    const col = RING_COLOR[key];
    return `
      <div class="card">
        <div class="card-header">
          <span class="card-title"><span class="ring-dot" style="background:${col}"></span>${name}</span>
          <span class="card-meta">${members.length}</span></div>
        <div class="circle-grid">
          ${members.sort((a, b) => (a.dueIn ?? 9e9) - (b.dueIn ?? 9e9)).map(p => `
            <div class="circle-card" onclick="circleOpen('${escHtml(p.ID)}')">
              <div class="circle-name"><span class="ring-dot sm" style="background:${col}"></span>${escHtml(p.NAME)}</div>
              <div class="circle-role">${escHtml(p.ROLE !== '-' ? p.ROLE : (p.GROUP !== '-' ? p.GROUP : ''))}</div>
              <div class="circle-meta">
                ${p.lastTouch ? `last ${escHtml(p.lastTouch)}` : 'no touch on record'}
                ${p.dueIn != null ? (p.dueIn <= 0 ? ` · <span class="circle-due">due now</span>` : ` · due in ${p.dueIn}d`) : ''}
              </div>
              ${p.reachout ? `<div class="circle-ready u-${escHtml(p.reachout.urgency || 'low')}"
                   title="${escHtml(p.reachout.why || '')} · ${escHtml(p.reachout.channel || '')}">message ready</div>` : ''}
            </div>`).join('')}
        </div>
      </div>`;
  };

  if (circleOpenPerson) return renderCirclePerson();

  setTimeout(circleLoadAnalysis, 0);
  const RINGS = [['all', 'Everyone'], ['family', 'Family'], ['professional', 'Professional'], ['social', 'Social']];
  return `
    <div class="view-head">
      <h1>Circle</h1>
      <div class="view-head-meta">private … synced to your OneDrive like everything else</div>
    </div>
    <div class="task-tabs" style="margin-bottom:0.8rem">
      ${RINGS.map(([id, label]) => `
        <button class="task-tab${circleRing === id ? ' on' : ''}"
          onclick="circleRing='${id}';repaintView('circle')">${label}
          ${id !== 'all' ? `<span>${people.filter(p => p.CIRCLE === id).length}</span>` : `<span>${people.length}</span>`}</button>`).join('')}
    </div>
    ${due.length ? `<div class="fin-delta down" style="margin-bottom:0.8rem">
      ${due.length} ${due.length === 1 ? 'person is' : 'people are'} due for contact: ${due.slice(0, 4).map(p => escHtml(p.NAME)).join(', ')}${due.length > 4 ? '…' : ''}</div>` : ''}
    <div class="card">
      <div class="card-header"><span class="card-title">Who can help with…</span>
        <span class="card-meta">searches capabilities, roles and profiles - warm paths included</span></div>
      <div class="jr-compose-row">
        <input id="whocan-q" class="jira-input" style="flex:1;min-width:200px"
               placeholder="e.g. wordpress pipeline, brand, folder access, ministry networks"
               onkeydown="if(event.key==='Enter')circleWhoCan()"/>
        <button class="btn btn-primary" style="padding:6px 14px" onclick="circleWhoCan()">Find</button>
      </div>
      <div id="whocan-out"></div>
    </div>
    ${circleRing === 'all' || circleRing === 'family' ? ring('Family', 'family') : ''}
    ${circleRing === 'all' || circleRing === 'professional' ? ring('Professional', 'professional') : ''}
    ${circleRing === 'all' || circleRing === 'social' ? ring('Social', 'social') : ''}
    <div class="card">
      <div class="card-header"><span class="card-title">Add a person</span></div>
      <div class="jr-compose-row">
        <input id="cp-name" class="jira-input" placeholder="Name" style="min-width:11rem"/>
        <select id="cp-circle" class="jira-input"><option>family</option><option>professional</option><option selected>social</option></select>
        <input id="cp-role" class="jira-input" placeholder="role / relationship"/>
        <input id="cp-cadence" class="jira-input" type="number" placeholder="contact every N days" style="width:11rem"/>
        <button class="btn btn-primary" style="padding:6px 14px" onclick="circleAdd(this)">Add</button>
      </div>
    </div>
    ${renderChatImport()}
    <div id="circle-analysis-slot"></div>`;
}

async function circleLoadAnalysis() {
  try {
    const d = await (await fetch('/api/circle/analysis')).json();
    const slot = document.getElementById('circle-analysis-slot');
    if (!slot) return;
    slot.innerHTML = d.content
      ? `<div class="card"><div class="card-header"><span class="card-title">Circle intelligence</span>
           <span class="card-meta">precomputed - regenerates in the background on new context</span></div>
           <div class="lesson-body insight">${learnMd(d.content)}</div></div>`
      : `<div class="card"><div class="empty-state">The first circle-wide read is being written in the background - it appears here on its own.</div></div>`;
  } catch {}
}

/* ── CHAT ARCHIVE IMPORT ──────────────────────────────────────────────────────
   A real conversation is the richest evidence there is about a person - far
   better than anything inferred. Export the chat, drop the .zip here, and the
   agent files it to OneDrive, reads it on the private route, and rewrites the
   DIA profiles and contact history from what the messages actually show. */
let chatImport = { busy: false, result: null, error: null };

function renderChatImport() {
  const r = chatImport.result;
  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Read a chat archive</span>
        <span class="card-meta">private · filed to your Vault · never sent to a cloud model</span>
      </div>
      <label class="fin-drop${chatImport.busy ? ' busy' : ''}">
        <input type="file" accept=".zip,.txt" hidden onchange="chatImportUpload(this)"/>
        ${chatImport.busy
          ? `<div class="spinner-inline"></div><div>Filing, reading and rewriting the profiles… this takes a moment</div>`
          : `<div class="fin-drop-main"><strong>Drop a chat export</strong> - WhatsApp, Telegram or Signal (.zip or .txt)</div>
             <div class="fin-drop-sub">Everyone recognised gets their profile and contact history rebuilt from the real messages</div>`}
      </label>
      ${chatImport.error ? `<div class="fin-warn">${escHtml(chatImport.error)}</div>` : ''}
      ${r ? `
        <div class="fin-drop-filed">
          ${r.messages} messages read${r.channel ? ` · ${escHtml(r.channel)}` : ''}${r.filed ? ' · filed to the Vault' : ' · NOT filed (connect Microsoft 365)'}
        </div>
        ${r.updated?.length ? `
          <div class="fin-extract-head"><span>Profiles rewritten from the archive</span></div>
          ${r.updated.map(u => `
            <div class="fin-extract-row" style="grid-template-columns:1fr auto auto">
              <span class="fin-extract-desc"><strong>${escHtml(u.name)}</strong>${u.note ? ` <em>${escHtml(u.note)}</em>` : ''}</span>
              <span class="fin-extract-amt">${u.messages} msgs</span>
              <button class="btn btn-ghost fin-extract-log" onclick="circleOpen('${escHtml(u.id)}')">Open</button>
            </div>`).join('')}` : `<div class="fin-warn">Nobody in the archive matched anyone in your Circle.</div>`}
        ${r.unmatched?.length ? `
          <div class="fin-extract-head"><span>In the archive but not in your Circle</span></div>
          <div class="chat-unmatched">
            ${r.unmatched.map(u => `<span class="chat-unmatched-chip" title="${u.count} messages">${escHtml(u.speaker)} <b>${u.count}</b></span>`).join('')}
          </div>
          <div class="evt-import-note">Add anyone worth tracking above, then re-run the import and their profile builds itself.</div>` : ''}
      ` : ''}
    </div>`;
}

function chatImportUpload(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  if (f.size > 12 * 1024 * 1024) { showToast('Export one chat rather than everything - keep it under 12 MB', 'warn'); input.value = ''; return; }
  chatImport = { busy: true, result: null, error: null };
  repaintView('circle');
  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = String(reader.result).split(',')[1] || '';
    try {
      const d = await (await fetch('/api/circle/import-chat', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: f.name, content: base64 }) })).json();
      chatImport = d.success
        ? { busy: false, result: d, error: null }
        : { busy: false, result: null, error: d.error || 'Import failed' };
      if (d.success) { await fetchCircle(); refreshNotifBadge(); }
    } catch (e) { chatImport = { busy: false, result: null, error: e.message }; }
    if (currentView === 'circle') repaintView('circle');
  };
  reader.readAsDataURL(f);
}

function personInsightCallout(p) {
  const lastTouch = (p.recent || [])[0];
  const daysSince = lastTouch?.DATE ? Math.round((new Date() - new Date(lastTouch.DATE)) / 86400000) : null;
  const cadence = p.CIRCLE === 'family' ? 7 : p.CIRCLE === 'professional' ? 14 : 21;
  const isDue = daysSince === null || daysSince >= cadence;

  let advice = `Active relationship in the ${p.CIRCLE} ring.`;
  if (isDue) {
    advice = `Touch window active: ${daysSince !== null ? `last contact ${daysSince} days ago (${lastTouch.CHANNEL || 'interaction'})` : 'no recent interactions logged'}. Reach out to maintain momentum.`;
  } else {
    advice = `Contact healthy: last touch was ${daysSince} days ago via ${lastTouch.CHANNEL || 'interaction'}. Next cadence check in ${cadence - daysSince} days.`;
  }

  if (p.NOTE && p.NOTE !== '-') {
    advice += ` Key context: ${p.NOTE}`;
  }

  return `
    <div class="card learn-resume" style="border-left:3px solid ${p.CIRCLE === 'family' ? 'var(--green)' : p.CIRCLE === 'professional' ? 'var(--cyan)' : 'var(--violet)'};margin-bottom:1rem">
      <div style="font-size:0.62rem;font-weight:650;color:var(--green);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.25rem">
        Relationship Intelligence · ${escHtml(p.CIRCLE)} Ring
      </div>
      <div style="font-size:0.88rem;font-weight:650;color:var(--text);margin-bottom:0.25rem">
        ${escHtml(p.NAME)} ${isDue ? '· Touch Suggested' : '· Cadence Healthy'}
      </div>
      <div style="font-size:0.78rem;color:var(--text-3);line-height:1.45">
        ${escHtml(advice)}
      </div>
    </div>`;
}

function renderCirclePerson() {
  const p = (CIRCLE.people || []).find(x => x.ID === circleOpenPerson);
  if (!p) { circleOpenPerson = null; return renderCircle(); }
  const ringCol = { family: '#3fb950', professional: '#58a6ff', social: '#bc8cff' }[p.CIRCLE] || 'var(--text-3)';
  return `
    <div class="view-head">
      <h1><span class="ring-dot" style="background:${ringCol}"></span>${escHtml(p.NAME)}</h1>
      <div class="view-head-meta crumbs">
        <a href="#" class="crumb-link" onclick="circleOpenPerson=null;repaintView('circle');return false">Circle</a>
        <span class="crumb-sep">/</span><span class="crumb-here">${escHtml(p.CIRCLE)}${p.GROUP !== '-' && p.GROUP !== p.CIRCLE ? ` · ${escHtml(p.GROUP)}` : ''}</span>
        ${p.FOLDER && p.FOLDER !== '-' ? `<button class="btn btn-ghost crumb-action" title="Their files, in the File Manager"
          onclick="circleOpenFolder('${escHtml(p.FOLDER)}','${escHtml(p.NAME)}')">Open folder</button>` : ''}</div>
    </div>

    ${personInsightCallout(p)}`;
}

let REACHOUT = {};

async function loadReachout(personId) {
  try {
    const d = await (await fetch(`/api/circle/reachout?id=${encodeURIComponent(personId)}`)).json();
    REACHOUT[personId] = d;
    paintReachout(personId);
    // A stale draft is served instantly and rewritten behind it; come back for
    // the fresh words once the rewrite has had time to land.
    if (d.stale) setTimeout(() => loadReachout(personId), 9000);
  } catch (e) {
    const el = document.getElementById('reachout-body');
    if (el) el.innerHTML = `<div class="empty-state" style="text-align:left">${escHtml(e.message)}</div>`;
  }
}

function paintReachout(personId) {
  const el = document.getElementById('reachout-body');
  const d = REACHOUT[personId];
  if (!el) return;
  if (!d || d.error) {
    el.innerHTML = `<div class="empty-state" style="text-align:left;padding:0.4rem 0">
      ${escHtml(d?.error || 'No message yet - it is being written in the background.')}</div>`;
    return;
  }
  const r = d.reachout || {};
  el.innerHTML = `
    <div class="ro-head">
      <span class="ro-urgency u-${escHtml(r.urgency || 'low')}">${escHtml(r.urgency || 'low')} priority</span>
      <span class="ro-why">${escHtml(r.why || '')}</span>
      <span class="ro-channel">${escHtml(r.channel || '')}</span>
      ${d.stale ? '<span class="ro-stale">rewriting with the newest context…</span>' : ''}
    </div>
    <div class="ro-intent"><span>The angle</span>${escHtml(r.intent || '')}</div>
    <textarea class="ro-body draft-editable" id="ro-text" spellcheck="true" aria-label="The message - edit it before you send it">${escHtml(r.body || '')}</textarea><div class="draft-editable-hint">Edit it freely - what you leave here is what gets copied.</div>
    <div class="ro-actions">
      <button class="btn btn-primary" style="font-size:0.72rem;padding:4px 12px"
              onclick="reachoutCopy(this)">Copy the message</button>
      <button class="btn btn-ghost" style="font-size:0.72rem;padding:4px 10px"
              title="Logs the touch, and the next message rewrites itself from there"
              onclick="circleSent('${escHtml(personId)}', this)">Sent it - log the touch</button>
      <button class="btn btn-ghost" style="font-size:0.72rem;padding:4px 10px"
              onclick="reachoutRegen('${escHtml(personId)}', this)">Different words</button>
      ${r.generatedAt ? `<span class="card-meta">written ${escHtml(r.generatedAt.slice(0, 10))}</span>` : ''}
    </div>`;
}

function reachoutCopy(btn) {
  const t = draftText('ro-text');
  navigator.clipboard?.writeText(t).then(() => {
    const was = btn.textContent; btn.textContent = 'Copied ✓';
    showToast('Copied … go be charming', 'success');
    setTimeout(() => { btn.textContent = was; }, 1800);
  });
}

async function reachoutRegen(personId, btn, intent) {
  const was = btn.textContent;
  btn.disabled = true; btn.textContent = 'Writing…';
  try {
    const d = await (await fetch('/api/circle/reachout', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: personId, intent: intent || '' }) })).json();
    if (d.success) { REACHOUT[personId] = { reachout: d.reachout, stale: false }; paintReachout(personId); }
    else showToast(d.error || 'Could not write it', 'error');
  } catch (e) { showToast(e.message, 'error'); }
  btn.disabled = false; btn.textContent = was;
}

function reachoutAngle(personId) {
  const intent = document.getElementById('cd-intent')?.value.trim();
  if (!intent) { showToast('Say what the message should achieve', 'warn'); return; }
  const btn = document.querySelector('#reachout-card .jr-compose-row .btn');
  if (btn) reachoutRegen(personId, btn, intent);
}

async function circleWhoCan() {
  const q = document.getElementById('whocan-q')?.value.trim();
  if (!q) return;
  const out = document.getElementById('whocan-out');
  out.innerHTML = '<div class="empty-state">Searching the graph…</div>';
  try {
    const d = await (await fetch(`/api/circle/whocan?q=${encodeURIComponent(q)}`)).json();
    const direct = d.direct || [], adj = d.adjacent || [];
    out.innerHTML = (direct.length || adj.length) ? `
      ${direct.map(x => `<div class="fin-tx linked" onclick="circleOpen('${escHtml(x.id)}')">
        <span class="fin-tx-desc"><strong>${escHtml(x.name)}</strong> · ${escHtml(x.role !== '-' ? x.role : x.circle)}
        ${x.why.length ? `<br><small style="color:var(--text-3)">${escHtml(x.why[0])}</small>` : ''}</span></div>`).join('')}
      ${adj.length ? `<div class="card-meta" style="margin:0.5rem 0 0.2rem">Warm paths</div>` +
        adj.map(x => `<div class="fin-tx linked" onclick="circleOpen('${escHtml(x.id)}')">
          <span class="fin-tx-desc">${escHtml(x.name)} <small style="color:var(--text-3)">- ${escHtml(x.note)}</small></span></div>`).join('') : ''}`
      : '<div class="empty-state">Nobody on record matches yet - capabilities grow as evidence lands.</div>';
  } catch (e) { out.innerHTML = `<div class="empty-state" style="color:var(--red)">${escHtml(e.message)}</div>`; }
}

function renderCirclePerson() {
  const p = (CIRCLE.people || []).find(x => x.ID === circleOpenPerson);
  if (!p) { circleOpenPerson = null; return renderCircle(); }
  const ringCol = { family: '#3fb950', professional: '#58a6ff', social: '#bc8cff' }[p.CIRCLE] || 'var(--text-3)';
  return `
    <div class="view-head">
      <h1><span class="ring-dot" style="background:${ringCol}"></span>${escHtml(p.NAME)}</h1>
      <div class="view-head-meta crumbs">
        <a href="#" class="crumb-link" onclick="circleOpenPerson=null;repaintView('circle');return false">Circle</a>
        <span class="crumb-sep">/</span><span class="crumb-here">${escHtml(p.CIRCLE)}${p.GROUP !== '-' && p.GROUP !== p.CIRCLE ? ` · ${escHtml(p.GROUP)}` : ''}</span>
        ${p.FOLDER && p.FOLDER !== '-' ? `<button class="btn btn-ghost crumb-action" title="Their files, in the File Manager"
          onclick="circleOpenFolder('${escHtml(p.FOLDER)}','${escHtml(p.NAME)}')">Open folder</button>` : ''}</div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">On record</span>
        <span class="card-meta">${p.MET !== '-' ? `known since ${escHtml(p.MET)} · ` : ''}${p.touchCount} touch${p.touchCount === 1 ? '' : 'es'} logged</span></div>
      <div class="jr-compose-row">
        <label class="circle-field">role<input id="ce-role" class="jira-input" value="${escHtml(p.ROLE !== '-' ? p.ROLE : '')}"/></label>
        <label class="circle-field">channel<input id="ce-channel" class="jira-input" value="${escHtml(p.CHANNEL !== '-' ? p.CHANNEL : '')}" style="width:7.5rem"/></label>
        <label class="circle-field">contact every<input id="ce-cadence" class="jira-input" type="number" value="${escHtml(p.CADENCE_DAYS !== '-' ? p.CADENCE_DAYS : '')}" style="width:5.5rem" title="days"/></label>
        <button class="btn btn-ghost" style="padding:5px 12px;align-self:flex-end" onclick="circleSave('${escHtml(p.ID)}',this)">Save</button>
      </div>
      <div class="jr-compose-row" style="margin-top:0.35rem">
        <label class="circle-field" style="flex:1">note<input id="ce-note" class="jira-input" style="width:100%" value="${escHtml(p.NOTE !== '-' ? p.NOTE : '')}"/></label>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Log a touch</span></div>
      <div class="jr-compose-row">
        <select id="ct-channel" class="jira-input"><option>whatsapp</option><option>call</option><option>email</option><option>in-person</option><option>chat</option></select>
        <input id="ct-summary" class="jira-input" placeholder="What happened - one line for the record" style="flex:1;min-width:180px"/>
        <input id="ct-next" class="jira-input" placeholder="next step, if any"/>
        <button class="btn btn-primary" style="padding:6px 14px" onclick="circleTouch('${escHtml(p.ID)}',this)">Log touch</button>
      </div>
      ${(p.recent || []).length ? `<div style="margin-top:0.6rem">${p.recent.map(t => `
        <div class="fin-tx"><span class="fin-tx-date">${escHtml(t.DATE)}</span>
          <span class="fin-tx-desc">${escHtml(t.SUMMARY)}${t.NEXT && t.NEXT !== '-' ? ` <span style="color:var(--text-3)">→ ${escHtml(t.NEXT)}</span>` : ''}</span>
          <span class="fin-tx-cat">${escHtml(t.CHANNEL)}</span></div>`).join('')}</div>`
      : '<div class="empty-state" style="padding:0.5rem 0;text-align:left">No touches on record yet. A captured message from them counts automatically.</div>'}
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Engagement</span>
        <span class="card-meta">${p.touchCount} touch${p.touchCount === 1 ? '' : 'es'} · last 26 weeks</span></div>
      ${circleEngagement(p.touchDates || [], ringCol)}
    </div>

    <div class="card reachout-card" id="reachout-card">
      <div class="card-header"><span class="card-title">Ready to send</span>
        <span class="card-meta">written in their register, kept current with every interaction</span></div>
      <div id="reachout-body"><div class="empty-state" style="text-align:left;padding:0.4rem 0">Loading the message…</div></div>
      <div class="jr-compose-row" style="margin-top:0.7rem">
        <input id="cd-intent" class="jira-input" style="flex:1;min-width:200px"
               placeholder="Want a different angle? Say what the message must achieve"
               onkeydown="if(event.key==='Enter')reachoutAngle('${escHtml(p.ID)}')"/>
        <button class="btn btn-ghost" style="padding:6px 14px" onclick="reachoutAngle('${escHtml(p.ID)}')">Rewrite</button>
      </div>
      <div id="cd-out"></div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">DIA profile</span>
        <div style="display:flex;gap:0.5rem;align-items:center">
          ${p.diaUpdated ? `<span class="card-meta">self-updates · last ${escHtml(p.diaUpdated)}</span>` : ''}
          <button class="btn ${p.hasDia ? 'btn-ghost' : 'btn-primary'}" style="font-size:0.72rem;padding:3px 10px"
                  onclick="circleDia('${escHtml(p.ID)}',this)">${p.hasDia ? 'Refresh analysis' : 'Run the analysis'}</button>
        </div></div>
      <div id="dia-body">${p.hasDia ? '<div class="empty-state">Loading profile…</div>' : `<div class="empty-state">
        No profile yet. The analysis follows your DIA framework - grounded only in what is on record, with open
        questions where the record is thin. Once it exists it refreshes itself: every logged touch, every captured
        message from them, and a daily sweep for anything stale.</div>`}
    </div></div>`;
}

/**
 * The engagement heatmap: 26 weeks x 7 days, one cell per day, intensity from
 * touch count, tinted with the person's ring colour. GitHub's idea, dressed
 * for this console: rounded cells, a quiet month row, hover tells the truth.
 */
function circleEngagement(dates, color) {
  const counts = {};
  (dates || []).forEach(d => { if (/^\d{4}-\d{2}-\d{2}/.test(d)) counts[d.slice(0, 10)] = (counts[d.slice(0, 10)] || 0) + 1; });
  const DAY = 864e5, today = new Date(); today.setHours(0, 0, 0, 0);
  // A full year: 52 weeks back, aligned to Monday.
  const WEEKS = 52;
  const start = new Date(today.getTime() - (WEEKS * 7 - 1) * DAY);
  start.setTime(start.getTime() - ((start.getDay() + 6) % 7) * DAY);
  const weeks = [];
  for (let w = 0; ; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(start.getTime() + (w * 7 + d) * DAY);
      if (day > today) break;
      const key = day.toISOString().slice(0, 10);
      col.push({ key, n: counts[key] || 0 });
    }
    if (!col.length) break;
    weeks.push(col);
    if (weeks.length >= WEEKS + 1) break;
  }
  // Month labels as grid spans: each label owns exactly its weeks, so labels
  // can never collide. A month shorter than 3 columns stays unlabelled.
  const spans = [];
  weeks.forEach((col, w) => {
    const m = new Date(start.getTime() + w * 7 * DAY).getMonth();
    if (spans.length && spans[spans.length - 1].m === m) spans[spans.length - 1].n++;
    else spans.push({ m, n: 1, label: new Date(start.getTime() + w * 7 * DAY).toLocaleString('en', { month: 'short' }) });
  });
  const max = Math.max(1, ...Object.values(counts));
  const cell = (c) => {
    const alpha = c.n === 0 ? 0.07 : 0.25 + 0.75 * Math.min(1, c.n / max);
    return `<div class="eng-cell" title="${c.key}${c.n ? ` · ${c.n} touch${c.n === 1 ? '' : 'es'}` : ''}"
      style="background:${color};opacity:${alpha.toFixed(2)}"></div>`;
  };
  return `
    <div class="eng-wrap">
      <div class="eng-months" style="grid-template-columns:${spans.map(s => `${s.n * 14 - 3}px`).join(' ')}">
        ${spans.map(s => `<span>${s.n >= 3 ? s.label : ''}</span>`).join('')}</div>
      <div class="eng-grid">${weeks.map(col => `<div class="eng-week">${col.map(cell).join('')}</div>`).join('')}</div>
    </div>`;
}

// He sent the drafted message - one press logs the interaction, updates
// last-touch, and lets the DIA refresh. The Circle and his outbox are one
// system; nothing gets logged twice.
async function circleSent(id, btn) {
  const p = (CIRCLE.people || []).find(x => x.ID === id);
  // Log what was actually sent, not a generic line - the next draft reads this.
  const sentBody = REACHOUT[id]?.reachout?.body || '';
  const summary = `Sent: ${(sentBody.split('\n').find(l => l.trim()) || 'the drafted message').slice(0, 90)}`;
  btn.disabled = true;
  try {
    const d = await (await fetch('/api/circle/touch', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId: id, channel: REACHOUT[id]?.reachout?.channel || (p?.CHANNEL !== '-' ? p?.CHANNEL : 'message'), summary }) })).json();
    if (d.success) {
      showToast('Sent and logged - the next message is already rewriting', 'success');
      await fetchCircle(); repaintView('circle');
      // The touch just changed the context, so the standing draft is stale by
      // definition: fetch again and the server hands back the rewritten one.
      loadReachout(id);
      refreshNotifBadge();
    } else showToast(d.error || 'Refused', 'error');
  } catch (e) { showToast(e.message, 'error'); }
  btn.disabled = false;
}

async function circleDraft(id) {
  const intent = document.getElementById('cd-intent')?.value.trim();
  if (!intent) { showToast('Say what the message must achieve', 'error'); return; }
  const out = document.getElementById('cd-out');
  out.innerHTML = '<div class="empty-state">Writing in their register…</div>';
  try {
    const d = await (await fetch('/api/circle/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId: id, intent }) })).json();
    out.innerHTML = d.success ? `<div class="jr-ai-note">${escHtml(d.draft)}</div>`
      : `<div class="empty-state" style="color:var(--red)">${escHtml(d.error || 'No draft available')}</div>`;
  } catch (e) { out.innerHTML = `<div class="empty-state" style="color:var(--red)">${escHtml(e.message)}</div>`; }
}

// ── PROJECTS ─────────────────────────────────────────────────────────────────
// One space per venture: the registered row plus its live Render instance,
// health-checked server-side. The iframe loads the deployed product itself.

let PROJECTS = null;
let projectOpen = null;
let projectCat = 'all';   // the sidebar menu selection: all / portfolio / product / platform

async function fetchProjects() {
  try { PROJECTS = await (await fetch('/api/projects')).json(); }
  catch { PROJECTS = null; }
  if (currentView === 'projects') {
    document.getElementById('view-container').innerHTML = renderProjects();
  }
}

function renderProjects() {
  if (!PROJECTS) { fetchProjects(); return `<div class="card"><div class="empty-state">Checking the fleet…</div></div>`; }
  const list = PROJECTS.projects || [];
  const open = projectOpen ? list.find(x => x.ID === projectOpen) : null;

  if (open) {
    const url = open.RENDER_URL !== '-' ? open.RENDER_URL : '';
    return `
      <div class="view-head">
        <h1>${escHtml(open.NAME)}</h1>
        <div class="view-head-meta crumbs">
          <a href="#" class="crumb-link" onclick="projectOpen=null;repaintView('projects');return false">Projects</a>
          <span class="crumb-sep">/</span><span class="crumb-here">${escHtml(open.KIND)} · ${escHtml(open.STATUS)}</span>
          ${url ? `<a class="btn btn-ghost crumb-action" href="${escHtml(url)}" target="_blank" rel="noreferrer">Live instance</a>` : ''}
          ${open.GITHUB && open.GITHUB !== '-' ? `<a class="btn btn-ghost crumb-action" href="https://github.com/${escHtml(open.GITHUB)}" target="_blank" rel="noreferrer">GitHub</a>` : ''}
          ${open.FOLDER && open.FOLDER !== '-' ? `<button class="btn btn-ghost crumb-action"
            onclick="circleOpenFolder('${escHtml(open.FOLDER)}','${escHtml(open.NAME)}')">Open folder</button>` : ''}
        </div>
      </div>
      ${open.NOTE && open.NOTE !== '-' ? `<div class="card"><div class="learn-goal">${escHtml(open.NOTE)}</div></div>` : ''}
      ${url ? `
        <div class="card" style="padding:0;overflow:hidden">
          <iframe src="${escHtml(url)}" style="width:100%;height:70vh;border:0;background:#fff"
                  sandbox="allow-scripts allow-same-origin allow-forms"
                  title="${escHtml(open.NAME)} live instance"></iframe>
        </div>
        <div class="card-meta" style="margin-top:0.4rem">If the instance refuses to embed, its headers forbid iframes - use open ↗ above.</div>`
      : `<div class="card"><div class="empty-state">No deployed instance on record. Paste the Render URL below.</div>
          <div class="jr-compose-row"><input id="pj-url" class="jira-input" style="flex:1" placeholder="https://…onrender.com"/>
          <button class="btn btn-primary" style="padding:6px 14px" onclick="projectSetUrl('${escHtml(open.ID)}')">Save</button></div></div>`}`;
  }

  // Three sections, three purposes: Portfolio is work delivered for others,
  // Products are his own monetizable systems (they surface in Finance as
  // alternative income sources), Platforms are the business websites.
  const card = (v) => `
      <div class="circle-card" onclick="projectOpen='${escHtml(v.ID)}';repaintView('projects')">
        <div class="circle-name">${v.live ? `<span class="ring-dot sm" style="background:${v.live.up ? 'var(--green)' : 'var(--red)'}"></span>` : '<span class="ring-dot sm" style="background:var(--text-3)"></span>'}${escHtml(v.NAME)}</div>
        <div class="circle-role">${escHtml(v.KIND)} · ${escHtml(v.STATUS)}</div>
        <div class="circle-meta">${v.live ? (v.live.up ? `up · ${v.live.ms}ms` : 'unreachable') : 'no instance linked'}${v.GITHUB && v.GITHUB !== '-' ? ' · git' : ''}${v.FOLDER && v.FOLDER !== '-' ? ' · drive' : ''}</div>
      </div>`;
  const section = (title, cat, meta) => {
    const items = list.filter(v => (v.CATEGORY || '-') === cat);
    if (!items.length) return '';
    return `
      <div class="card">
        <div class="card-header"><span class="card-title">${title}</span>
          <span class="card-meta">${meta}</span></div>
        <div class="circle-grid">${items.map(card).join('')}</div>
      </div>`;
  };
  const uncat = list.filter(v => !['portfolio', 'product', 'platform'].includes(v.CATEGORY));
  return `
    <div class="view-head">
      <h1>Projects</h1>
      <div class="view-head-meta">status checked from the agent, never guessed</div>
    </div>
    ${projectCat === 'all' || projectCat === 'portfolio' ? section('Portfolio', 'portfolio', 'built for clients and users') : ''}
    ${projectCat === 'all' || projectCat === 'product' ? section('Products', 'product', 'own IP · monetizable · registered in Finance as alternative income sources') : ''}
    ${projectCat === 'all' || projectCat === 'platform' ? section('Platforms', 'platform', 'the business websites - Acexoft Dynamics and kin') : ''}
    ${uncat.length ? `<div class="card"><div class="card-header"><span class="card-title">Uncategorised</span></div>
      <div class="circle-grid">${uncat.map(card).join('')}</div></div>` : ''}
    ${!list.length ? '<div class="empty-state">No ventures registered. They live in finance/ventures.tsv.</div>' : ''}`;
}

async function projectSetUrl(id) {
  const url = document.getElementById('pj-url')?.value.trim();
  try {
    const d = await (await fetch('/api/projects/url', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, url }) })).json();
    if (d.success) { showToast('Instance linked', 'success'); PROJECTS = null; fetchProjects(); }
    else showToast(d.error || 'Refused', 'error');
  } catch (e) { showToast(e.message, 'error'); }
}

// Jump to their OneDrive folder in the File Manager, right where they live.
function circleOpenFolder(folder, name) {
  navigate('files');
  setTimeout(() => { try { fmNavigate(folder, name); } catch {} }, 250);
}

async function circleSave(id, btn) {
  btn.disabled = true;
  try {
    const d = await (await fetch('/api/circle/person', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: (CIRCLE.people.find(x => x.ID === id) || {}).NAME,
        role: document.getElementById('ce-role').value, channel: document.getElementById('ce-channel').value,
        cadence: document.getElementById('ce-cadence').value, note: document.getElementById('ce-note').value }) })).json();
    if (d.success) { showToast('Saved', 'success'); await fetchCircle(); repaintView('circle'); }
    else showToast(d.error || 'Refused', 'error');
  } catch (e) { showToast(e.message, 'error'); }
  btn.disabled = false;
}

async function circleOpen(id) {
  circleOpenPerson = id;
  repaintView('circle');
  loadReachout(id);          // the message is already written; fetch and show it
  const p = (CIRCLE.people || []).find(x => x.ID === id);
  if (p?.hasDia) {
    try {
      const d = await (await fetch(`/api/circle/dia?id=${encodeURIComponent(id)}`)).json();
      const el = document.getElementById('dia-body');
      if (el && d.content) el.innerHTML = `<div class="lesson-body insight">${learnMd(d.content)}</div>`;
    } catch {}
  }
}

async function circleAdd(btn) {
  const name = document.getElementById('cp-name')?.value.trim();
  if (!name) { showToast('A person needs a name', 'error'); return; }
  btn.disabled = true;
  try {
    const d = await (await fetch('/api/circle/person', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, circle: document.getElementById('cp-circle').value,
        role: document.getElementById('cp-role').value, cadence: document.getElementById('cp-cadence').value }) })).json();
    if (d.success) { showToast(`${name} joins the circle`, 'success'); await fetchCircle(); }
    else showToast(d.error || 'Refused', 'error');
  } catch (e) { showToast(e.message, 'error'); }
  btn.disabled = false;
}

async function circleTouch(id, btn) {
  const summary = document.getElementById('ct-summary')?.value.trim();
  if (!summary) { showToast('One line for the record - what happened', 'error'); return; }
  btn.disabled = true;
  try {
    const d = await (await fetch('/api/circle/touch', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId: id, channel: document.getElementById('ct-channel').value,
        summary, next: document.getElementById('ct-next').value }) })).json();
    if (d.success) { showToast('Logged', 'success'); await fetchCircle(); repaintView('circle'); }
    else showToast(d.error || 'Refused', 'error');
  } catch (e) { showToast(e.message, 'error'); }
  btn.disabled = false;
}

async function circleDia(id, btn) {
  btn.disabled = true; btn.textContent = 'Analysing…';
  try {
    const d = await (await fetch('/api/circle/dia', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }) })).json();
    const el = document.getElementById('dia-body');
    if (d.success && el) { el.innerHTML = `<div class="lesson-body insight">${learnMd(d.content)}</div>`;
      const p = (CIRCLE.people || []).find(x => x.ID === id); if (p) p.hasDia = true;
      btn.textContent = 'Refresh analysis'; }
    else { showToast(d.error || 'No analysis available', 'error'); btn.textContent = 'Run the analysis'; }
  } catch (e) { showToast(e.message, 'error'); btn.textContent = 'Run the analysis'; }
  btn.disabled = false;
}

// ── LEARNING ─────────────────────────────────────────────────────────────────
// The agent as tutor. Courses come from the vault (OneDrive-synced); a lesson
// opens in a reader with a tutor box underneath that answers on plane B,
// grounded in the lesson plus live context.

let LEARN = null;
let learnOpen = { course: null, file: null, content: '' };
let learnCourseOpen = null;   // course id when browsing its modules
let learnNote = { text: '', loadedFor: null, savedAt: null, timer: null };
let learnRestorePct = null;   // scroll depth to restore once the lesson paints

async function fetchLearning() {
  try { LEARN = await (await fetch('/api/learning')).json(); }
  catch { LEARN = null; }
  if (currentView === 'learning') {
    document.getElementById('view-container').innerHTML = renderLearning();
  }
}

/**
 * The reading position, remembered to the paragraph.
 *
 * The reader's scroll is written back on a debounce (1.2s of stillness), one
 * row per course in the vault, so "continue where you left off" reopens the
 * exact spot - on this machine, on the phone, on Render - not the top of a
 * module he was forty minutes into. Positions are data, not actions: they sync
 * like everything else in the vault but are never audited per-scroll.
 */
let learnScrollTimer = null;
window.addEventListener('scroll', () => {
  if (currentView !== 'learning' || !learnOpen.course || !learnOpen.file) return;
  clearTimeout(learnScrollTimer);
  learnScrollTimer = setTimeout(() => {
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    const pct = Math.round((window.scrollY / max) * 100);
    fetch('/api/learning/resume', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ course: learnOpen.course, lesson: learnOpen.file, scrollPct: pct }) }).catch(() => {});
  }, 1200);
}, { passive: true });

/** Jump straight back into the exact spot a resume row describes. */
async function learnResume(course, lesson, pct) {
  learnCourseOpen = course;
  learnRestorePct = Number(pct) || 0;
  await learnOpenLesson(course, lesson);
}

// ── PERSONAL SPACE: RHYTHM HABIT TRACKER ─────────────────────────────────────
let RHYTHM = null;
let rhythmFilter = 'all';
let SPACE_INSIGHTS = {
  calendar: { title: 'Temporal Alignment & Focus', category: 'Today in History', text: 'On August 1, 1971, the Concert for Bangladesh pioneered global music philanthropy. Structure your day with singular focus.', tone: 'gold' },
  ideas: { title: 'Spark & Innovation Discipline', category: 'Executive Foresight', text: 'Great products come from ruthless iteration. Promoted ideas are 4.2x more likely to ship when paired with a clear Definition of Done.', tone: 'cyan' },
  planning: { title: 'Strategic Execution & Runway', category: 'Execution Discipline', text: 'Runway is measured by delivered software, not drafted roadmaps. Focus on closing open rungs in the fortnight sprint.', tone: 'violet' },
  finance: { title: 'Asset Preservation & 50/30/20 Rule', category: 'Financial Strategy', text: 'Target 50% Needs, 30% Wants, and 20% Savings. Keeping variable wants under target secures a high liquidity buffer.', tone: 'green' },
  rhythm: { title: 'Personal Discipline & Peak Performance', category: 'Consistency & Momentum', text: 'Discipline is consistency over intensity. Small daily habit check-ins compound into sovereign execution power.', tone: 'green' }
};

async function fetchInsights() {
  try {
    const r = await fetch('/api/insights');
    if (r.ok) {
      const data = await r.json();
      if (data.insights) SPACE_INSIGHTS = { ...SPACE_INSIGHTS, ...data.insights };
    }
  } catch {}
}

function renderSpaceInsight(space) {
  const ins = SPACE_INSIGHTS[space];
  if (!ins) return '';
  const accentColor = ins.tone === 'gold' ? 'var(--amber)' : ins.tone === 'cyan' ? 'var(--cyan)' : ins.tone === 'violet' ? 'var(--violet)' : 'var(--green)';
  return `
    <div class="card learn-resume" style="border-left:3px solid ${accentColor};margin-bottom:1rem">
      <div style="font-size:0.62rem;font-weight:650;color:${accentColor};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.25rem">
        ${escHtml(ins.category || 'Executive Insight')}
      </div>
      <div style="font-size:0.88rem;font-weight:650;color:var(--text);margin-bottom:0.25rem">
        ${escHtml(ins.title)}
      </div>
      <div style="font-size:0.78rem;color:var(--text-3);line-height:1.45">
        ${escHtml(ins.text)}
      </div>
    </div>`;
}

function setRhythmFilter(filter) {
  rhythmFilter = filter;
  repaintView('rhythm');
}

async function fetchRhythm() {
  try {
    const r = await fetch('/api/personal/rhythm');
    if (r.ok) RHYTHM = await r.json();
  } catch { RHYTHM = null; }
}

async function rhythmToggleHabit(habitId, done) {
  const todayStr = new Date().toISOString().slice(0, 10);
  try {
    const r = await fetch('/api/personal/rhythm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toggleHabit: { date: todayStr, habitId, done } })
    });
    const d = await r.json();
    if (d.success) {
      if (RHYTHM) {
        if (!RHYTHM.logs) RHYTHM.logs = {};
        if (!RHYTHM.logs[todayStr]) RHYTHM.logs[todayStr] = {};
        RHYTHM.logs[todayStr][habitId] = done;
      }
      showToast(done ? 'Habit completed!' : 'Habit unchecked', 'info');
      repaintView('rhythm');
    }
  } catch (e) { showToast(e.message, 'error'); }
}

function openHabitDetailModal(habitId) {
  if (!RHYTHM) return;
  const h = (RHYTHM.habits || []).find(x => x.id === habitId);
  if (!h) return;
  const logs = RHYTHM.logs || {};
  const dates = Object.keys(logs).sort().reverse();
  let streak = 0;
  let maxStreak = 0;
  let doneCount30 = 0;

  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10);
    if (logs[d] && logs[d][habitId]) {
      doneCount30++;
      streak++;
      if (streak > maxStreak) maxStreak = streak;
    } else if (i > 0) {
      streak = 0;
    }
  }

  const pct30 = Math.round((doneCount30 / 30) * 100);

  openModal(`
    <div style="padding:0.4rem">
      <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:1rem">
        <span style="font-size:1.8rem">${h.icon || '📌'}</span>
        <div>
          <h2 style="margin:0;font-size:1.2rem">${escHtml(h.title)}</h2>
          <div style="font-size:0.75rem;color:var(--text-3)">${h.auto ? `Automated from ${h.auto}` : 'Manual check-in habit'}</div>
        </div>
      </div>

      <div class="cards-grid-3" style="margin-bottom:1rem">
        <div class="stat-card"><div class="stat-number txt-green">${doneCount30} / 30</div><div class="stat-label">30-Day Completion</div></div>
        <div class="stat-card"><div class="stat-number" style="color:var(--cyan)">${pct30}%</div><div class="stat-label">Consistency Rate</div></div>
        <div class="stat-card"><div class="stat-number" style="color:var(--violet)">${maxStreak} days</div><div class="stat-label">Best Streak</div></div>
      </div>

      <div class="card" style="margin-bottom:1rem">
        <div class="card-header"><span class="card-title">Recent Activity Logs</span></div>
        <div class="settings-grid" style="max-height:180px;overflow-y:auto;gap:0.3rem">
          ${dates.slice(0, 14).map(d => `
            <div style="display:flex;justify-content:space-between;padding:4px 8px;border-bottom:1px solid var(--border);font-size:0.78rem">
              <span>${d}</span>
              <span style="color:${logs[d] && logs[d][habitId] ? 'var(--green)' : 'var(--text-3)'}">${logs[d] && logs[d][habitId] ? '✓ Done' : '—'}</span>
            </div>`).join('')}
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:0.5rem">
        <button class="btn btn-primary" onclick="closeModal()">Close</button>
      </div>
    </div>
  `);
}

function renderRhythm() {
  if (!RHYTHM) {
    fetchRhythm().then(() => repaintView('rhythm'));
    return `<div class="card"><div class="empty-state">Opening Rhythm habit tracker…</div></div>`;
  }

  const habits = RHYTHM.habits || [];
  const logs = RHYTHM.logs || {};
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayLog = logs[todayStr] || {};
  const bySrc = RHYTHM.bySource || {};
  const activeDays = bySrc[rhythmFilter] || RHYTHM.days || [];

  const filters = [
    { id: 'all', label: 'All Activity' },
    { id: 'github', label: 'GitHub' },
    { id: 'learning', label: 'Learning' },
    { id: 'journal', label: 'Journal' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'custom', label: 'Custom' }
  ];

  return `
    <div class="view-head">
      <h1>Rhythm</h1>
      <div class="view-head-meta" style="display:flex;justify-content:space-between;align-items:center;width:100%">
        <span>Personal habit tracker · Autonomous activity stream & granular controls</span>
        <button class="btn btn-ghost" onclick="navigate('today')" style="font-size:0.75rem">Go to Dashboard ↗</button>
      </div>
    </div>

    ${renderSpaceInsight('rhythm')}

    <div class="card-header" style="margin-bottom:0.6rem">
      <div class="task-tabs">
        ${filters.map(f => `<button class="task-tab${rhythmFilter === f.id ? ' on' : ''}" onclick="setRhythmFilter('${f.id}')">${f.label}</button>`).join('')}
      </div>
    </div>

    ${renderContributionMap({ days: activeDays })}

    <div class="card">
      <div class="card-header">
        <span class="card-title">Daily Discipline</span>
        <span class="card-meta">${todayStr} · Click habit card for granular view</span>
      </div>
      <div class="wishlist-grid" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));margin-top:0.8rem">
        ${habits.map(h => {
          const isDone = !!todayLog[h.id];
          return `
            <div class="b-card ${isDone ? 'done' : ''}" style="cursor:pointer;background:${isDone ? 'var(--green-bg)' : 'var(--panel)'}"
                 onclick="openHabitDetailModal('${escAttr(h.id)}')">
              <div class="b-head">
                <span>${h.icon || '📌'} ${escHtml(h.title)}</span>
                ${h.auto ? `<span class="badge badge-low" style="font-size:0.6rem">Auto: ${escHtml(h.auto)}</span>` : ''}
              </div>
              <div style="display:flex;align-items:center;justify-content:space-between;margin-top:0.6rem">
                <span style="font-size:0.75rem;color:${isDone ? 'var(--green)' : 'var(--text-3)'}">
                  ${isDone ? '✓ Completed' : 'Pending'}
                </span>
                ${!h.auto ? `<input type="checkbox" ${isDone ? 'checked' : ''} style="cursor:pointer"
                             onclick="event.stopPropagation();rhythmToggleHabit('${escAttr(h.id)}', this.checked)"/>` : ''}
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

function renderLearning() {
  if (!LEARN) { fetchLearning(); return `<div class="card"><div class="empty-state">Opening the classroom…</div></div>`; }
  const courses = LEARN.courses || [];

  if (learnOpen.course && learnOpen.file) {
    const course = courses.find(c => c.ID === learnOpen.course) || {};
    const lesson = (course.lessons || []).find(l => l.file === learnOpen.file) || {};
    return `
      <div class="view-head">
        <h1>${escHtml(lesson.title || 'Lesson')}</h1>
        <div class="view-head-meta crumbs">
          <a href="#" class="crumb-link" onclick="learnBack();learnCourseOpen=null;repaintView('learning');return false">Learning</a>
          <span class="crumb-sep">/</span>
          <a href="#" class="crumb-link" onclick="learnBack();return false">${escHtml(course.TITLE || 'Course')}</a>
          <span class="crumb-sep">/</span><span class="crumb-here">${escHtml(lesson.title || 'Lesson')}</span>
        </div>
        <!-- When this module was last revised, when he last read it, and a way
             straight to the source file in the vault - which is the same file
             OneDrive holds. A date without its weekday makes him do arithmetic. -->
        <div class="view-head-meta">
          ${lesson.revisedAt ? `revised ${fmtWhen(lesson.revisedAt, { rel: true })}` : ''}
          ${lesson.touchedAt ? ` · last read ${fmtWhen(lesson.touchedAt, { rel: true })}` : ''}
          ${lesson.words ? ` · ${lesson.words} words, about ${Math.max(1, Math.round(lesson.words / 200))} min` : ''}
          ${lesson.vaultPath ? `<a href="#" class="learn-artifact" title="Open the source file in the vault"
             onclick="learnOpenSource('${escHtml(lesson.vaultPath)}');return false">source</a>` : ''}
        </div>
      </div>
      <div class="card lesson-card">
        <!-- refChips turns every D-024 / R-06 / P-nn in the text into a link to
             the actual decision or risk. The lessons are full of them and they
             were dead plain text until now. -->
        <div class="lesson-body">${refChips(learnMd(learnOpen.content))}</div>
        <div class="lesson-actions">
          ${(() => {
            const ls = course.lessons || [];
            const i = ls.findIndex(l => l.file === lesson.file);
            const prev = i > 0 ? ls[i - 1] : null;
            const next = i >= 0 && i < ls.length - 1 ? ls[i + 1] : null;
            return `
              ${prev ? `<button class="btn btn-ghost" onclick="learnOpenLesson('${escHtml(course.ID)}','${escHtml(prev.file)}')">← ${escHtml(prev.title.slice(0, 32))}</button>` : '<span></span>'}
              <button class="btn ${lesson.status === 'done' ? 'btn-ghost' : 'btn-primary'}"
                      onclick="learnMark('${escHtml(course.ID)}','${escHtml(lesson.file)}','${lesson.status === 'done' ? 'learning' : 'done'}')">
                ${lesson.status === 'done' ? 'Mark as still learning' : 'Mark lesson done'}</button>
              ${next ? `<button class="btn btn-ghost" onclick="learnMark('${escHtml(course.ID)}','${escHtml(lesson.file)}','done',true);learnOpenLesson('${escHtml(course.ID)}','${escHtml(next.file)}')"
                title="Marks this one done and moves on">${escHtml(next.title.slice(0, 32))} →</button>` : ''}`;
          })()}
        </div>
      </div>
      ${course.ID === 'financial-intelligence' || (learnOpen.content || '').includes('$$') ? renderDynamicFinancialCalculators() : ''}
      <div class="card">
        <div class="card-header"><span class="card-title">Your notes on this module</span>
          <span class="card-meta" id="lesson-note-status">${learnNote.loadedFor === `${learnOpen.course}/${learnOpen.file}`
            ? (learnNote.savedAt ? `saved ${fmtWhen(learnNote.savedAt, { rel: true })}` : 'nothing noted yet')
            : 'loading…'}</span></div>
        <textarea id="lesson-note-text" class="lesson-note" spellcheck="true" rows="4"
          placeholder="Margin space. What surprised you, what looks out of date, what to ask Alex - anything. The tutor reads these with every answer, and the agent uses them when it revises this module."
          oninput="learnNoteInput(this)">${learnNote.loadedFor === `${learnOpen.course}/${learnOpen.file}` ? escHtml(learnNote.text) : ''}</textarea>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Ask the tutor</span>
          <span class="card-meta">answers use this lesson, your notes, plus live context</span></div>
        <div class="jr-compose-row">
          <input id="tutor-q" class="jira-input" style="flex:1;min-width:200px"
                 placeholder="Anything unclear, or anything deeper - ask it here"
                 onkeydown="if(event.key==='Enter')learnAsk(this)"/>
          <button class="btn btn-primary" style="padding:6px 14px" onclick="learnAsk(document.getElementById('tutor-q'))">Ask</button>
        </div>
        <div id="tutor-answer"></div>
      </div>`;
  }

  // Level 2: one course, browsed - full module list with next-up marker.
  if (learnCourseOpen) {
    const c = courses.find(x => x.ID === learnCourseOpen);
    if (!c) { learnCourseOpen = null; }
    else {
      const lessons = c.lessons || [];
      const done = lessons.filter(l => l.status === 'done').length;
      const next = lessons.find(l => l.status !== 'done');
      return `
      <div class="view-head">
        <h1>${escHtml(c.TITLE)}</h1>
        <div class="view-head-meta crumbs">
          <a href="#" class="crumb-link" onclick="learnCourseOpen=null;repaintView('learning');return false">Learning</a>
          <span class="crumb-sep">/</span><span class="crumb-here">${done}/${lessons.length} lessons done · updated ${fmtWhen(c.UPDATED_AT, { rel: true })}</span>
        </div>
      </div>
      <div class="card">
        <div class="fin-goal-bar" style="margin-bottom:0.7rem"><div style="width:${lessons.length ? Math.round(done / lessons.length * 100) : 0}%"></div></div>
        <div class="learn-goal">${escHtml(c.GOAL)}</div>
        ${(() => {
          // The exact spot beats the next-unfinished guess: if a resume row
          // exists for this course, the button reopens lesson AND scroll.
          const rs = (LEARN.resume || []).find(r => r.COURSE_ID === c.ID);
          const rsLesson = rs && lessons.find(l => l.file === rs.LESSON);
          if (rsLesson) return `<button class="btn btn-primary" style="margin-bottom:0.8rem"
            onclick="learnResume('${escAttr(c.ID)}','${escAttr(rs.LESSON)}',${parseInt(rs.SCROLL_PCT, 10) || 0})"
            title="Reopens ${escAttr(rsLesson.title)} at the same spot">Continue exactly where you left off - ${escHtml(rsLesson.title.slice(0, 34))}${parseInt(rs.SCROLL_PCT, 10) ? `, ${parseInt(rs.SCROLL_PCT, 10)}% in` : ''} →</button>`;
          if (next) return `<button class="btn btn-primary" style="margin-bottom:0.8rem"
            onclick="learnOpenLesson('${escHtml(c.ID)}','${escHtml(next.file)}')">${done ? 'Continue where you left off' : 'Start the course'} →</button>`;
          return `<div class="fin-delta up" style="margin-bottom:0.8rem">Course complete. It stays alive - modules revise when reality moves.</div>`;
        })()}
        ${lessons.length ? `<div class="learn-lessons">
          ${lessons.map((l, i) => `
            <div class="learn-lesson linked${next && l.file === next.file ? ' is-next' : ''}"
                 onclick="learnOpenLesson('${escHtml(c.ID)}','${escHtml(l.file)}')">
              <span class="learn-num">${String(i + 1).padStart(2, '0')}</span>
              <span class="learn-check ${escHtml(l.status)}">${l.status === 'done' ? '✓' : l.status === 'learning' ? '◐' : '○'}</span>
              <span class="learn-title">${escHtml(l.title)}</span>
              ${next && l.file === next.file ? '<span class="learn-next-tag">next up</span>' : ''}
              <!-- A date he can act on: the weekday is what tells him whether
                   "the 29th" was before or after the meeting. -->
              <span class="learn-lesson-meta">${l.touchedAt
                ? `read ${fmtWhen(l.touchedAt)}`
                : l.revisedAt ? `revised ${fmtWhen(l.revisedAt)}` : ''}</span>
            </div>`).join('')}
        </div>` : `<div class="empty-state">No lessons visible. If this is a fresh host, the vault sync
          brings course content down on its next pass - give it a minute, then reopen.</div>`}
        <div class="card-meta" style="margin-top:0.6rem">living course - the current-state module updates first when reality moves</div>
      </div>`;
    }
  }

  // Level 1: the landing - the catalog of everything being learned, grouped by
  // classroom so it stays legible past the first three courses.
  const byRoom = courses.reduce((acc, c) => {
    const room = (c.CLASSROOM && c.CLASSROOM !== '-') ? c.CLASSROOM : 'Other';
    (acc[room] = acc[room] || []).push(c);
    return acc;
  }, {});

  const courseCard = (c) => {
    const lessons = c.lessons || [];
    const done = lessons.filter(l => l.status === 'done').length;
    const pct = lessons.length ? Math.round(done / lessons.length * 100) : 0;
    const next = lessons.find(l => l.status !== 'done');
    return `
      <div class="circle-card" onclick="learnCourseOpen='${escHtml(c.ID)}';repaintView('learning')">
        <div class="circle-name">${escHtml(c.TITLE)}${c.LEVEL && c.LEVEL !== '-'
          ? `<span class="learn-level" title="This course starts from nothing and goes all the way">${escHtml(c.LEVEL.replace(/-/g, ' '))}</span>` : ''}</div>
        ${c.SUBTITLE && c.SUBTITLE !== '-' ? `<div class="circle-role">${escHtml(c.SUBTITLE)}</div>` : ''}
        <div class="fin-goal-bar" style="margin:0.45rem 0"><div style="width:${pct}%"></div></div>
        <div class="circle-meta">${lessons.length} module${lessons.length === 1 ? '' : 's'} · ${done} done${
          next ? ` · next: ${escHtml(next.title.slice(0, 30))}…` : lessons.length ? ' · complete' : ''}</div>
      </div>`;
  };

  // The resume banner: the newest reading position across every course, so one
  // tap puts him back on the exact paragraph. Rendered only when there is
  // genuinely somewhere to return to.
  const rs = (LEARN.resume || [])[0];
  const rsCourse = rs && courses.find(c => c.ID === rs.COURSE_ID);
  const rsLesson = rsCourse && (rsCourse.lessons || []).find(l => l.file === rs.LESSON);
  const resumeBanner = rsLesson ? `
    <div class="card learn-resume" onclick="learnResume('${escAttr(rs.COURSE_ID)}','${escAttr(rs.LESSON)}',${parseInt(rs.SCROLL_PCT, 10) || 0})"
         title="Reopens the module at the same spot">
      <div class="learn-resume-label">Continue exactly where you left off</div>
      <div class="learn-resume-line"><strong>${escHtml(rsLesson.title)}</strong>
        <span class="card-meta"> · ${escHtml(rsCourse.TITLE)} · ${parseInt(rs.SCROLL_PCT, 10) || 0}% in${rs.UPDATED_AT && rs.UPDATED_AT !== '-' ? ` · ${fmtWhen(rs.UPDATED_AT, { rel: true })}` : ''}</span></div>
    </div>` : '';

  return `
    <div class="view-head">
      <h1>Learning</h1>
      <div class="view-head-meta">private classroom … every course starts from the beginning and goes to expertise, in plain language</div>
    </div>
    ${resumeBanner}
    ${courses.length ? Object.entries(byRoom).map(([room, list]) => `
      <div class="learn-section-head">${escHtml(room)}</div>
      <div class="circle-grid" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">
        ${list.map(courseCard).join('')}
      </div>`).join('')
      : `<div class="empty-state">No courses yet.</div>`}
    <div class="card" style="margin-top:0.8rem">
      <div class="card-header"><span class="card-title">Commission a new course</span></div>
      <div class="learn-goal">Name a topic in the chat - or to Claude in a work session - and it gets built the
        way these were: from the ground up, assuming no prior knowledge, every term stated and then explained
        in plain words, carried all the way to the point where you could teach it back. Grounded in your real
        context, living in the vault, taught by the tutor.</div>
    </div>`;
}

// Minimal markdown for lessons: headings, bold, lists, paragraphs - plus the
// course's own idioms rendered as first-class shapes: the "You will be able
// to" objective becomes a banner, "Check yourself" becomes a quiz card, and
// "Watch for" becomes a caution strip. Content is escaped FIRST - the vault
// is trusted, but habits are habits.
function renderMathLatex(latex, isBlock = false) {
  const clean = String(latex || '').trim();
  if (!clean) return '';

  if (window.katex && typeof window.katex.renderToString === 'function') {
    try {
      return window.katex.renderToString(clean, { displayMode: isBlock, throwOnError: false });
    } catch (e) {}
  }

  let formatted = escHtml(clean);
  formatted = formatted.replace(/\\text\s*\{([^}]+)\}/g, '$1');

  while (formatted.includes('\\frac')) {
    formatted = formatted.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g,
      '<span class="m-frac"><span class="m-num">$1</span><span class="m-den">$2</span></span>');
  }

  formatted = formatted
    .replace(/\\times/g, ' × ')
    .replace(/\\cdot/g, ' · ')
    .replace(/\\div/g, ' ÷ ')
    .replace(/\\pm/g, ' ± ')
    .replace(/\\ge/g, ' ≥ ')
    .replace(/\\le/g, ' ≤ ')
    .replace(/\\neq/g, ' ≠ ')
    .replace(/\\approx/g, ' ≈ ')
    .replace(/\\longrightarrow/g, ' ⟶ ')
    .replace(/\\rightarrow/g, ' → ')
    .replace(/\\leftarrow/g, ' ← ')
    .replace(/\\infty/g, '∞')
    .replace(/\\Delta/g, 'Δ')
    .replace(/\\Sigma/g, 'Σ')
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\pi/g, 'π');

  formatted = formatted
    .replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>')
    .replace(/\^([a-zA-Z0-9+\-=()]+)/g, '<sup>$1</sup>')
    .replace(/_\{([^}]+)\}/g, '<sub>$1</sub>')
    .replace(/_([a-zA-Z0-9+\-=()]+)/g, '<sub>$1</sub>');

  formatted = formatted
    .replace(/\\left\(/g, '(')
    .replace(/\\right\)/g, ')')
    .replace(/\\left\[/g, '[')
    .replace(/\\right\]/g, ']');

  return isBlock
    ? `<div class="m-block-eq">${formatted}</div>`
    : `<span class="m-inline-eq">${formatted}</span>`;
}

function learnMd(src) {
  let rawSrc = String(src || '');
  const mathPlaceholders = [];

  // Extract $$...$$ display math blocks
  rawSrc = rawSrc.replace(/\$\$([\s\S]+?)\$\$/g, (_m, eq) => {
    const idx = mathPlaceholders.length;
    const html = `<div class="math-block-card"><div class="math-card-label">Equation</div><div class="math-rendered">${renderMathLatex(eq, true)}</div></div>`;
    mathPlaceholders.push(html);
    return `\n\n___MATH_PH_${idx}___\n\n`;
  });

  // Extract $...$ inline math
  rawSrc = rawSrc.replace(/(^|[\s(])\$([^\$\n]+)\$(?=[\s.,;:)]|$)/g, (_m, prefix, eq) => {
    const idx = mathPlaceholders.length;
    const html = `<span class="math-inline-badge">${renderMathLatex(eq, false)}</span>`;
    mathPlaceholders.push(html);
    return `${prefix}___MATH_PH_${idx}___`;
  });

  const esc = escHtml(rawSrc);
  let inQuiz = false;
  const out = [];
  const closeQuiz = () => { if (inQuiz) { out.push('</div>'); inQuiz = false; } };

  const inline = (s) => s
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_m, label, href) =>
      /^https?:\/\//i.test(href)
        ? `<a href="${href}" class="lesson-link" target="_blank" rel="noreferrer">${label}</a>`
        : /^\?v=/.test(href)
          ? `<a href="${href}" class="lesson-link" onclick="chatGo('${(new URLSearchParams(href.slice(1)).get('v') || '').replace(/[^\w-]/g,'')}','');return false">${label}</a>`
          : label)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:)]|$)/g, '$1<em>$2</em>');

  const restoreMath = (text) => text.replace(/___MATH_PH_(\d+)___/g, (_m, idx) => mathPlaceholders[parseInt(idx, 10)] || '');

  const lines = esc.split(/\r?\n/);
  const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  const isTableRule = (l) => /^\s*\|[\s:|-]+\|\s*$/.test(l) && l.includes('-');
  const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

  // Every callout below (Jargon, What you will learn, What to watch for, the
  // two book callouts) is written as hand-wrapped prose in the source -
  // "**Jargon:** hero image - ..." running onto a second and sometimes
  // third physical line with no blank line between them, one logical
  // sentence split for readability in an editor. A line-by-line match only
  // ever caught the first physical line; the wrapped remainder fell out as
  // a bare paragraph directly under the box it was meant to be inside -
  // most visibly wrong for a book citation, since `[Author, Title, ...]`
  // is exactly the part most likely to have wrapped onto its own line.
  // This joins every continuation line up to the next blank line or the
  // start of a new block, so the whole sentence - citation included -
  // lands inside the one callout it belongs to.
  const CALLOUT_OPENER = /^\*\*(Jargon|In plain language|Plain language|The word|In a book|Book|Research|Book quote|You will be able to|What you will learn|What will be learnt|Watch for|What to watch for|Watch out for|Careful):?\*\*/i;
  const isBlockStart = (l) => !l.trim() || isTableRow(l) || /^#{1,4} /.test(l) ||
    /^\s*(---+|\*\*\*+)\s*$/.test(l) || /^&gt;\s?/.test(l) ||
    /^\s{2,}[-*]\s/.test(l) || /^\d+\. /.test(l) || /^[-*] /.test(l) || CALLOUT_OPENER.test(l);
  function gatherWrapped(startIdx) {
    let j = startIdx + 1;
    const parts = [lines[startIdx]];
    while (j < lines.length && !isBlockStart(lines[j])) { parts.push(lines[j]); j++; }
    return { text: parts.join(' '), nextIdx: j - 1 };
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes('___MATH_PH_')) {
      const phMatch = line.match(/^___MATH_PH_(\d+)___$/);
      if (phMatch) {
        closeQuiz();
        out.push(restoreMath(line));
        continue;
      }
    }

    if (isTableRow(line) && isTableRule(lines[i + 1] || '') ) {
      const head = cells(line);
      const align = cells(lines[i + 1]).map(c =>
        /^:.*:$/.test(c) ? 'center' : /:$/.test(c) ? 'right' : 'left');
      const body = [];
      let j = i + 2;
      while (j < lines.length && isTableRow(lines[j])) { body.push(cells(lines[j])); j++; }
      closeQuiz();
      out.push('<div class="lesson-table-wrap"><table class="lesson-table"><thead><tr>' +
        head.map((h, k) => `<th style="text-align:${align[k] || 'left'}">${restoreMath(inline(h))}</th>`).join('') +
        '</tr></thead><tbody>' +
        body.map(r => '<tr>' + head.map((_h, k) =>
          `<td style="text-align:${align[k] || 'left'}">${restoreMath(inline(r[k] || ''))}</td>`).join('') + '</tr>').join('') +
        '</tbody></table></div>');
      i = j - 1;
      continue;
    }

    if (/^## (Check yourself|Open questions)/i.test(line)) {
      closeQuiz(); out.push(`<div class="lesson-quiz"><h3>${restoreMath(inline(line.slice(3)))}</h3>`); inQuiz = true; continue; }
    if (/^## Watch\b/i.test(line)) {
      closeQuiz(); out.push(`<div class="lesson-quiz watch-box"><h3>${restoreMath(inline(line.slice(3)))}</h3>`); inQuiz = true; continue; }
    if (/^\*\*(Jargon|In plain language|Plain language|The word):?\*\*/i.test(line)) {
      const { text, nextIdx } = gatherWrapped(i);
      out.push(`<div class="lesson-jargon">${restoreMath(inline(text.replace(/^\*\*(Jargon|In plain language|Plain language|The word):?\*\*\s*/i, '<span>Jargon</span>')))}</div>`);
      i = nextIdx; continue; }
    // The two book callouts: `[Author, Title, year, chapter]` at the end of
    // the (now fully joined) text is the citation - split onto its own
    // mono sub-line so it reads as a checkable reference, not more prose.
    // House style ("cite it or do not claim it", 7 Aug 2026): never render
    // a book callout that has no bracketed citation - that shape means the
    // citation was dropped, not that it doesn't need one, so it falls
    // through to a plain paragraph instead of a callout implying a source
    // that isn't actually named.
    if (/^\*\*(In a book|Book|Research):?\*\*/i.test(line)) {
      const { text, nextIdx } = gatherWrapped(i);
      const m = text.match(/^\*\*(In a book|Book|Research):?\*\*\s*([\s\S]*?)\s*\[([^\]]+)\]\s*$/i);
      if (m) out.push(`<div class="lesson-book"><span>In a book</span>${restoreMath(inline(m[2]))}<div class="lesson-cite">${restoreMath(inline(m[3]))}</div></div>`);
      else out.push(`<p>${restoreMath(inline(text))}</p>`);
      i = nextIdx; continue;
    }
    if (/^\*\*Book quote:?\*\*/i.test(line)) {
      const { text, nextIdx } = gatherWrapped(i);
      const m = text.match(/^\*\*Book quote:?\*\*\s*([\s\S]*?)\s*\[([^\]]+)\]\s*$/i);
      if (m) out.push(`<div class="lesson-book-quote"><span>Book quote</span>&ldquo;${restoreMath(inline(m[1]))}&rdquo;<div class="lesson-cite">${restoreMath(inline(m[2]))}</div></div>`);
      else out.push(`<p>${restoreMath(inline(text))}</p>`);
      i = nextIdx; continue;
    }
    if (/^#### /.test(line)) { out.push(`<h5>${restoreMath(inline(line.slice(5)))}</h5>`); continue; }
    if (/^### /.test(line)) { out.push(`<h4>${restoreMath(inline(line.slice(4)))}</h4>`); continue; }
    if (/^## /.test(line))  { closeQuiz(); out.push(`<h3>${restoreMath(inline(line.slice(3)))}</h3>`); continue; }
    if (/^# /.test(line))   { closeQuiz(); out.push(`<h2>${restoreMath(inline(line.slice(2)))}</h2>`); continue; }
    if (/^\*\*(You will be able to|What you will learn|What will be learnt):?\*\*/i.test(line)) {
      const { text, nextIdx } = gatherWrapped(i);
      out.push(`<div class="lesson-objective">${restoreMath(inline(text.replace(/^\*\*(You will be able to|What you will learn|What will be learnt):?\*\*\s*/i, '<span>What you will learn</span>')))}</div>`);
      i = nextIdx; continue; }
    if (/^\*\*(Watch for|What to watch for|Watch out for|Careful):?\*\*/i.test(line)) {
      const { text, nextIdx } = gatherWrapped(i);
      closeQuiz(); out.push(`<div class="lesson-watch">${restoreMath(inline(text.replace(/^\*\*(Watch for|What to watch for|Watch out for|Careful):?\*\*\s*/i, '<span>What to watch for</span>')))}</div>`);
      i = nextIdx; continue; }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { closeQuiz(); out.push('<hr class="lesson-rule">'); continue; }
    if (/^&gt;\s?/.test(line)) { out.push(`<blockquote class="lesson-quote">${restoreMath(inline(line.replace(/^&gt;\s?/, '')))}</blockquote>`); continue; }
    if (/^\s{2,}[-*]\s/.test(line)) { out.push(`<div class="md-li md-li-sub">${restoreMath(inline(line.trim().slice(2)))}</div>`); continue; }
    if (/^\d+\. /.test(line)) { out.push(`<div class="md-li md-li-num">${restoreMath(inline(line))}</div>`); continue; }
    if (/^[-*] /.test(line))  { out.push(`<div class="md-li">• ${restoreMath(inline(line.slice(2)))}</div>`); continue; }
    if (!line.trim())         { out.push('<div class="md-gap"></div>'); continue; }
    out.push(`<p>${restoreMath(inline(line))}</p>`);
  }
  closeQuiz();
  return out.join('');
}

function renderDynamicFinancialCalculators() {
  return `
    <div class="card fin-calc-card" style="background:var(--bg-raised);border:1px solid var(--cyan-dim);border-radius:var(--r-md);padding:1.1rem;margin-top:1rem">
      <div class="card-header" style="margin-bottom:0.8rem">
        <span class="card-title" style="color:var(--cyan);font-size:0.92rem">Interactive $1B Wealth Compounding & Valuation Calculator</span>
        <span class="card-meta">Live compounding math & valuation modeling</span>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:0.8rem;margin-bottom:1rem">
        <div>
          <label style="font-size:0.7rem;color:var(--text-3);display:block;margin-bottom:3px">Starting Net Worth ($P):</label>
          <input id="calc-p" type="number" class="input" style="font-size:0.82rem;padding:4px 8px" value="1000000" oninput="runFinancialCalc()"/>
        </div>
        <div>
          <label style="font-size:0.7rem;color:var(--text-3);display:block;margin-bottom:3px">Annual Growth / Yield Rate ($r\%$):</label>
          <input id="calc-r" type="number" class="input" style="font-size:0.82rem;padding:4px 8px" value="25" oninput="runFinancialCalc()"/>
        </div>
        <div>
          <label style="font-size:0.7rem;color:var(--text-3);display:block;margin-bottom:3px">Monthly Reinvestment ($PMT):</label>
          <input id="calc-pmt" type="number" class="input" style="font-size:0.82rem;padding:4px 8px" value="50000" oninput="runFinancialCalc()"/>
        </div>
        <div>
          <label style="font-size:0.7rem;color:var(--text-3);display:block;margin-bottom:3px">Time Horizon (Years $t$):</label>
          <input id="calc-t" type="number" class="input" style="font-size:0.82rem;padding:4px 8px" value="15" oninput="runFinancialCalc()"/>
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg);padding:0.9rem 1.1rem;border-radius:var(--r-md);border:1px solid var(--border);flex-wrap:wrap;gap:0.6rem">
        <div>
          <div style="font-size:0.66rem;color:var(--text-3);text-transform:uppercase;letter-spacing:0.05em">Projected Net Worth ($A$)</div>
          <div id="calc-result-nw" style="font-size:1.6rem;font-weight:700;color:var(--green-bright);margin-top:2px">$41,835,114</div>
        </div>
        <div>
          <div style="font-size:0.66rem;color:var(--text-3);text-transform:uppercase;letter-spacing:0.05em">Goal Milestone ($1B Target)</div>
          <div id="calc-result-pct" style="font-size:1.2rem;font-weight:600;color:var(--cyan);margin-top:2px">4.2% of $1B</div>
        </div>
        <div style="width:100%;background:var(--border);height:7px;border-radius:99px;overflow:hidden;margin-top:0.4rem">
          <div id="calc-progress-bar" style="width:4.2%;background:linear-gradient(90deg, var(--cyan), var(--green-bright));height:100%;transition:width 0.3s"></div>
        </div>
      </div>
    </div>`;
}

function runFinancialCalc() {
  const p = parseFloat(document.getElementById('calc-p')?.value) || 0;
  const r = (parseFloat(document.getElementById('calc-r')?.value) || 0) / 100;
  const pmt = parseFloat(document.getElementById('calc-pmt')?.value) || 0;
  const t = parseFloat(document.getElementById('calc-t')?.value) || 0;

  const n = 12;
  const ratePerPeriod = r / n;
  const totalPeriods = n * t;

  const compoundingFactor = Math.pow(1 + ratePerPeriod, totalPeriods);
  const principalGrowth = p * compoundingFactor;
  const annuityGrowth = ratePerPeriod > 0 ? pmt * ((compoundingFactor - 1) / ratePerPeriod) : pmt * totalPeriods;
  const total = principalGrowth + annuityGrowth;

  const target = 1000000000;
  const pct = Math.min(100, Math.max(0, (total / target) * 100));

  const nwEl = document.getElementById('calc-result-nw');
  const pctEl = document.getElementById('calc-result-pct');
  const barEl = document.getElementById('calc-progress-bar');

  if (nwEl) nwEl.textContent = '$' + Math.round(total).toLocaleString();
  if (pctEl) pctEl.textContent = pct.toFixed(1) + '% of $1B';
  if (barEl) barEl.style.width = pct + '%';
}

// The vault's home on OneDrive. A lesson is a real markdown file, so "source"
// opens the folder it actually lives in rather than describing where it is.
const VAULT_DRIVE_ROOT = 'Sconl/Core/Apex/Vault/vault-documents/isconl-vault';

function learnOpenSource(vaultPath) {
  const dir = String(vaultPath || '').split('/').slice(0, -1).join('/');
  openSpaceInFiles(dir ? `${VAULT_DRIVE_ROOT}/${dir}` : VAULT_DRIVE_ROOT);
}

async function learnOpenLesson(course, file) {
  try {
    const d = await (await fetch(`/api/learning/lesson?course=${encodeURIComponent(course)}&file=${encodeURIComponent(file)}`)).json();
    if (d.content == null) { showToast(d.error || 'Lesson unavailable', 'error'); return; }
    learnOpen = { course, file, content: d.content };
    learnNote = { text: '', loadedFor: null, savedAt: null, timer: null };
    const lesson = ((LEARN.courses || []).find(c => c.ID === course)?.lessons || []).find(l => l.file === file);
    if (lesson && lesson.status === 'new') learnMark(course, file, 'learning', true);
    repaintView('learning');
    // Restore the exact reading position when arriving via resume; otherwise
    // start at the top like any freshly opened document.
    if (learnRestorePct != null) {
      const pct = learnRestorePct; learnRestorePct = null;
      requestAnimationFrame(() => {
        const doc = document.documentElement;
        const max = Math.max(0, doc.scrollHeight - window.innerHeight);
        window.scrollTo(0, Math.round(max * (pct / 100)));
      });
    } else {
      window.scrollTo(0, 0);
      // Opening a lesson IS the new resume point, even before he scrolls.
      fetch('/api/learning/resume', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course, lesson: file, scrollPct: 0 }) }).catch(() => {});
    }
    learnLoadNote(course, file);
  } catch (e) { showToast(e.message, 'error'); }
}

function learnBack() {
  learnCourseOpen = learnOpen.course || learnCourseOpen;   // return to the course page, not past it
  learnOpen = { course: null, file: null, content: '' };
  fetchLearning();
}

// ── MODULE NOTES ──────────────────────────────────────────────────────────────
// His margin space, saved to the vault beside the lesson. The tutor loads these
// into every answer, and the agent reads them when revising a course - a note
// saying "this changed on Friday" is the cheapest course-update instruction
// there is. Autosaved on a debounce; the status line always tells the truth
// about whether the words are on disk yet.

async function learnLoadNote(course, file) {
  try {
    const d = await (await fetch(`/api/learning/notes?course=${encodeURIComponent(course)}&file=${encodeURIComponent(file)}`)).json();
    learnNote = { text: d.text || '', loadedFor: `${course}/${file}`, savedAt: d.updatedAt || null, timer: null };
    const ta = document.getElementById('lesson-note-text');
    if (ta && !ta.value) ta.value = learnNote.text;
    const st = document.getElementById('lesson-note-status');
    if (st) st.textContent = learnNote.savedAt ? `saved ${fmtWhen(learnNote.savedAt, { rel: true })}` : 'nothing noted yet';
  } catch { /* the panel still works; the first save creates the file */ }
}

function learnNoteInput(ta) {
  clearTimeout(learnNote.timer);
  const st = document.getElementById('lesson-note-status');
  if (st) st.textContent = 'writing…';
  learnNote.timer = setTimeout(async () => {
    try {
      const r = await fetch('/api/learning/notes', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course: learnOpen.course, file: learnOpen.file, text: ta.value }) });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'refused');
      learnNote.savedAt = d.updatedAt;
      if (st) st.textContent = 'saved - the tutor and the agent read these';
    } catch (e) { if (st) st.textContent = `NOT SAVED: ${e.message}`; }
  }, 1400);
}

async function learnMark(course, file, status, silent) {
  try {
    await fetch('/api/learning/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ course, lesson: file, status }) });
    const l = ((LEARN?.courses || []).find(c => c.ID === course)?.lessons || []).find(x => x.file === file);
    if (l) l.status = status;
    if (!silent) { showToast(status === 'done' ? 'Lesson done. It compounds.' : 'Back to learning', 'success'); repaintView('learning'); }
  } catch (e) { if (!silent) showToast(e.message, 'error'); }
}

async function learnAsk(input) {
  const q = (input?.value || '').trim();
  if (!q) return;
  const box = document.getElementById('tutor-answer');
  box.innerHTML = '<div class="empty-state">The tutor is reading…</div>';
  try {
    const d = await (await fetch('/api/learning/tutor', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ course: learnOpen.course, file: learnOpen.file, question: q }) })).json();
    // The tutor was the one AI surface still rendering as flat escaped text, so
    // its headings, tables and jargon boxes never appeared. It reads like the
    // lesson now, which is the whole point of a tutor.
    box.innerHTML = d.success
      ? insightMd(d.answer)
      : `<div class="empty-state" style="color:var(--red)">${escHtml(d.error || 'No answer available')}</div>`;
    if (d.success) input.value = '';
  } catch (e) { box.innerHTML = `<div class="empty-state" style="color:var(--red)">${escHtml(e.message)}</div>`; }
}

// ── IDEAS ────────────────────────────────────────────────────────────────────
// The idea pipeline, and the answer to "where can I see all the ideas". Every
// idea he has ever dictated to the chat lands in spark/ideas.tsv and therefore
// on OneDrive within the minute. Capture is one field; everything else - stage,
// type, scoring, the sharpening pass - is optional and can happen later, which
// is the only way a capture surface survives contact with a real thought.

let IDEAS = null;
let ideaFilters = { stage: '', type: '', domain: '', q: '' };
let ideaOpen = null;      // the id of the expanded card

async function fetchIdeas() {
  try { IDEAS = await (await fetch('/api/ideas')).json(); }
  catch { IDEAS = null; }
  if (currentView === 'ideas') {
    document.getElementById('view-container').innerHTML = renderIdeas();
  }
}

// Impact over effort, the same lever-pair the ledger uses. Unscored ideas sort
// last rather than sorting as zero - "not scored yet" is not "not worth doing".
function ideaLeverage(i) {
  const im = parseInt(i.IMPACT, 10), ef = parseInt(i.EFFORT, 10);
  if (isNaN(im)) return -1;
  return im / (isNaN(ef) ? 5 : Math.max(1, ef));
}

const IDEA_STAGE_LABEL = { captured:'Captured', shaping:'Shaping', committed:'Committed',
                           shipped:'Shipped', parked:'Parked' };

/**
 * Where an idea came from, in words. It matters more than it looks: an idea he
 * deliberately typed and one the journal noticed him having are different kinds
 * of thing, and the second deserves a second look rather than being trusted the
 * same way. A raw "journal-J1785403972457" told him nothing.
 */
function ideaOrigin(source) {
  const s = String(source || '').trim();
  if (s.startsWith('journal-')) return 'noticed in a journal entry';
  if (s === 'chat')  return 'caught in conversation';
  if (s === 'ui')    return 'captured here';
  if (s === 'seed')  return 'seeded with the vault';
  if (s === 'telegram') return 'sent from Telegram';
  return `via ${escHtml(s || 'unknown')}`;
}

function renderIdeas() {
  if (!IDEAS) { fetchIdeas(); return `<div class="card"><div class="empty-state">Opening the pipeline…</div></div>`; }
  const all = IDEAS.ideas || [];
  const s = IDEAS.stats || {};
  const f = ideaFilters;
  const sel = (v, cur) => v === cur ? ' selected' : '';

  let rows = all.filter(i => i.STATUS !== 'dropped');
  if (f.stage)  rows = rows.filter(i => i.STAGE === f.stage);
  if (f.type)   rows = rows.filter(i => i.TYPE === f.type);
  if (f.domain) rows = rows.filter(i => i.DOMAIN === f.domain);
  if (f.q) {
    const q = f.q.toLowerCase();
    rows = rows.filter(i => `${i.TITLE} ${i.BODY} ${i.TAGS} ${i.DOMAIN} ${i.NOTE}`.toLowerCase().includes(q));
  }
  rows = rows.slice().sort((a, b) => ideaLeverage(b) - ideaLeverage(a)
    || String(b.CREATED_AT).localeCompare(String(a.CREATED_AT)));

  const stageCount = (st) => all.filter(i => i.STATUS !== 'dropped' && i.STAGE === st).length;

  return `
    <div class="view-head">
      <h1>Ideas</h1>
      <div class="view-head-meta">every idea you have logged, from anywhere - vault-synced to OneDrive like everything else</div>
    </div>

    ${renderSpaceInsight('ideas')}

    <div class="fin-headline card">
      <div class="fin-figure">
        <span class="fin-label">Captured</span>
        <span class="fin-value">${s.total || 0}</span>
        <span class="fin-sub">${s.open || 0} still open</span>
      </div>
      <div class="fin-figure">
        <span class="fin-label">About iSconl</span>
        <span class="fin-value">${s.agent || 0}</span>
        <span class="fin-sub">improvements to me</span>
      </div>
      <div class="fin-figure">
        <span class="fin-label">Shipped</span>
        <span class="fin-value">${s.shipped || 0}</span>
        <span class="fin-sub">built and live</span>
      </div>
      <div class="fin-snap">
        <button class="btn btn-ghost" onclick="ideasReview(this)"
                title="Themes across everything captured, what is ready, what to drop">Review the pipeline</button>
      </div>
    </div>

    <div id="ideas-review-panel"></div>

    <div class="card">
      <div class="card-header"><span class="card-title">Capture</span>
        <span class="card-meta">a title is enough - file it later</span></div>
      <input id="idea-title" class="jira-input" style="width:100%"
             placeholder="The idea, in one line. Say it however it arrived."
             onkeydown="if(event.key==='Enter'&&(event.metaKey||event.ctrlKey))ideaCapture(this)"/>
      <textarea id="idea-body" class="jira-input" rows="3" style="width:100%;resize:vertical;margin-top:0.45rem"
                placeholder="Anything more, if there is more. Optional."></textarea>
      <div class="jr-compose-row">
        <select id="idea-type" class="jira-input" title="What kind of idea">
          ${(IDEAS.types || []).map(t => `<option value="${t}"${t === 'agent' ? ' selected' : ''}>${t}</option>`).join('')}
        </select>
        <input id="idea-domain" class="jira-input" placeholder="area (learning, chat, finance…)" style="flex:1;min-width:130px"/>
        <input id="idea-tags" class="jira-input" placeholder="tags, comma separated" style="flex:1;min-width:120px"/>
        <button class="btn btn-primary" style="padding:6px 16px" onclick="ideaCapture(this)">Capture</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">The pipeline</span>
        <span class="card-meta">${rows.length} shown${rows.length !== all.length ? ` of ${all.length}` : ''}</span>
      </div>

      <div class="task-filters">
        <div class="task-tabs">
          <button class="task-tab${!f.stage ? ' on' : ''}" onclick="ideaFilter({stage:''})">All <span>${s.open || 0}</span></button>
          ${(IDEAS.stages || []).map(st => `
            <button class="task-tab${f.stage === st ? ' on' : ''}" onclick="ideaFilter({stage:'${st}'})">
              ${IDEA_STAGE_LABEL[st] || st} <span>${stageCount(st)}</span></button>`).join('')}
        </div>
        <select class="task-select" onchange="ideaFilter({type:this.value})" title="Filter by kind">
          <option value=""${sel('', f.type)}>any kind</option>
          ${(IDEAS.types || []).map(t => `<option value="${t}"${sel(t, f.type)}>${t}</option>`).join('')}
        </select>
        ${(IDEAS.domains || []).length ? `
          <select class="task-select" onchange="ideaFilter({domain:this.value})" title="Filter by area">
            <option value=""${sel('', f.domain)}>any area</option>
            ${IDEAS.domains.map(d => `<option value="${escHtml(d)}"${sel(d, f.domain)}>${escHtml(d)}</option>`).join('')}
          </select>` : ''}
        <input class="task-select idea-search" value="${escHtml(f.q)}" placeholder="search…"
               oninput="ideaSearch(this.value)" style="min-width:120px"/>
        ${f.stage || f.type || f.domain || f.q
          ? `<button class="btn btn-ghost" style="font-size:0.68rem;padding:2px 8px"
               onclick="ideaFilter({stage:'',type:'',domain:'',q:''})">clear</button>` : ''}
      </div>

      ${rows.length ? `<div class="idea-list">${rows.map(ideaCard).join('')}</div>`
        : `<div class="empty-state">${all.length
            ? 'Nothing matches those filters. The ideas are still there, just not these ones.'
            : 'No ideas captured yet. Type one above, or just say it to the chat - it lands here either way.'}</div>`}
    </div>`;
}

// One idea. Collapsed it is a line you can scan; open it is the whole thing,
// editable in place. No separate edit mode, because an idea you have to open a
// dialog to refine is an idea you stop refining.
function ideaCard(i) {
  const open = ideaOpen === i.ID;
  const im = i.IMPACT !== '-' ? i.IMPACT : null;
  const ef = i.EFFORT !== '-' ? i.EFFORT : null;
  const tags = String(i.TAGS || '').split(',').map(t => t.trim()).filter(t => t && t !== '-');

  return `
  <div class="idea${open ? ' is-open' : ''} stage-${escHtml(i.STAGE)}" id="idea-${escHtml(i.ID)}">
    <div class="idea-head" onclick="ideaToggle('${escHtml(i.ID)}')">
      <span class="idea-stage-dot" title="${escHtml(IDEA_STAGE_LABEL[i.STAGE] || i.STAGE)}"></span>
      <span class="idea-title">${escHtml(i.TITLE)}</span>
      <span class="idea-chips">
        <span class="jr-chip idea-type-chip">${escHtml(i.TYPE)}</span>
        ${i.DOMAIN && i.DOMAIN !== '-' ? `<span class="jr-chip">${escHtml(i.DOMAIN)}</span>` : ''}
        ${im ? `<span class="jr-chip" title="impact ${im} over effort ${ef || '?'}">${im}/${ef || '?'}</span>` : ''}
      </span>
      <span class="idea-caret">${open ? '▾' : '▸'}</span>
    </div>

    ${open ? `
    <div class="idea-body">
      <textarea class="jira-input idea-edit-body" id="ib-${escHtml(i.ID)}" rows="4"
                placeholder="What this idea actually is.">${escHtml(i.BODY)}</textarea>

      <div class="idea-grid">
        <label>Stage
          <select class="task-select" onchange="ideaSave('${escHtml(i.ID)}',{stage:this.value},this)">
            ${(IDEAS.stages || []).map(st => `<option value="${st}"${st === i.STAGE ? ' selected' : ''}>${IDEA_STAGE_LABEL[st] || st}</option>`).join('')}
          </select></label>
        <label>Kind
          <select class="task-select" onchange="ideaSave('${escHtml(i.ID)}',{type:this.value},this)">
            ${(IDEAS.types || []).map(t => `<option value="${t}"${t === i.TYPE ? ' selected' : ''}>${t}</option>`).join('')}
          </select></label>
        <label>Impact
          <select class="task-select" onchange="ideaSave('${escHtml(i.ID)}',{impact:this.value},this)">
            <option value="">-</option>
            ${[1,2,3,4,5,6,7,8,9,10].map(n => `<option${String(n) === i.IMPACT ? ' selected' : ''}>${n}</option>`).join('')}
          </select></label>
        <label>Effort
          <select class="task-select" onchange="ideaSave('${escHtml(i.ID)}',{effort:this.value},this)">
            <option value="">-</option>
            ${[1,2,3,4,5,6,7,8,9,10].map(n => `<option${String(n) === i.EFFORT ? ' selected' : ''}>${n}</option>`).join('')}
          </select></label>
      </div>

      <div class="jr-compose-row">
        <input class="jira-input" id="id-${escHtml(i.ID)}" value="${escHtml(i.DOMAIN === '-' ? '' : i.DOMAIN)}"
               placeholder="area" style="flex:1;min-width:110px"/>
        <input class="jira-input" id="it-${escHtml(i.ID)}" value="${escHtml(tags.join(', '))}"
               placeholder="tags, comma separated" style="flex:2;min-width:140px"/>
        <button class="btn btn-ghost" style="padding:5px 12px" onclick="ideaSaveFields('${escHtml(i.ID)}',this)">Save</button>
      </div>

      ${tags.length ? `<div class="idea-tagrow">${tags.map(t =>
        `<span class="jr-chip jr-tags-chip">${escHtml(t)}</span>`).join('')}</div>` : ''}

      ${i.NOTE ? `<div class="idea-note"><span>Note</span>${escHtml(i.NOTE)}</div>` : ''}

      <div id="idea-ai-${escHtml(i.ID)}">${i.AI_NOTE ? insightMd(i.AI_NOTE) : ''}</div>

      <div class="idea-actions">
        <span class="idea-meta">${escHtml(i.ID)} · captured ${fmtWhen(i.CREATED_AT, { time: false })} · ${ideaOrigin(i.SOURCE)}</span>
        <span class="idea-act-btns">
          <button class="btn btn-primary" style="font-size:0.68rem;padding:3px 11px"
                  onclick="ideaRefine('${escHtml(i.ID)}',this)"
                  title="Sharpen this into something buildable">${i.AI_NOTE ? 'Refine again' : 'Refine'}</button>
          <button class="btn btn-ghost" style="font-size:0.68rem;padding:3px 11px"
                  onclick="ideaToTask('${escHtml(i.ID)}',this)" title="Put it on the board as a task">To task</button>
          <button class="btn btn-ghost danger-btn" style="font-size:0.68rem;padding:3px 9px"
                  onclick="ideaDelete('${escHtml(i.ID)}')" title="Delete this idea">✕</button>
        </span>
      </div>
    </div>` : `
    <div class="idea-peek">${escHtml(String(i.BODY || '').replace(/\n+/g, ' ').slice(0, 150))}${String(i.BODY || '').length > 150 ? '…' : ''}</div>`}
  </div>`;
}

function ideaFilter(patch) { ideaFilters = { ...ideaFilters, ...patch }; repaintView('ideas'); }

// Search repaints without stealing focus back from the box he is typing in.
let _ideaSearchTimer = null;
function ideaSearch(v) {
  ideaFilters.q = v;
  clearTimeout(_ideaSearchTimer);
  _ideaSearchTimer = setTimeout(() => {
    repaintView('ideas');
    const box = document.querySelector('.idea-search');
    if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
  }, 220);
}

function ideaToggle(id) { ideaOpen = ideaOpen === id ? null : id; repaintView('ideas'); }

async function ideaCapture(btn) {
  const title = document.getElementById('idea-title').value.trim();
  if (!title) return showToast('An idea needs a line', 'warn');
  btn.disabled = true; btn.textContent = 'Capturing…';
  try {
    const d = await (await fetch('/api/ideas/add', { method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        title,
        body: document.getElementById('idea-body').value.trim(),
        type: document.getElementById('idea-type').value,
        domain: document.getElementById('idea-domain').value.trim(),
        tags: document.getElementById('idea-tags').value.trim(),
        source: 'ui',
      }) })).json();
    if (!d.success) throw new Error(d.error || 'refused');
    showToast(`Captured as ${d.id}`, 'success');
    await fetchIdeas();
    // The filing pass runs server-side after the write; pick it up shortly.
    setTimeout(fetchIdeas, 6000);
  } catch (e) { showToast(e.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Capture'; }
}

async function ideaSave(id, patch, el) {
  if (el) el.disabled = true;
  try {
    const d = await (await fetch('/api/ideas/update', { method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id, ...patch }) })).json();
    if (!d.success) throw new Error(d.error || 'refused');
    await fetchIdeas();
  } catch (e) { showToast(e.message, 'error'); }
  finally { if (el) el.disabled = false; }
}

function ideaSaveFields(id, btn) {
  return ideaSave(id, {
    body:   document.getElementById(`ib-${id}`).value,
    domain: document.getElementById(`id-${id}`).value.trim(),
    tags:   document.getElementById(`it-${id}`).value.trim(),
  }, btn).then(() => showToast('Saved', 'success'));
}

async function ideaRefine(id, btn) {
  const box = document.getElementById(`idea-ai-${id}`);
  btn.disabled = true; btn.textContent = 'Thinking…';
  box.innerHTML = `<div class="empty-state">Sharpening it…</div>`;
  try {
    const d = await (await fetch('/api/ideas/refine', { method:'POST',
      headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) })).json();
    if (!d.success) throw new Error(d.error || 'refused');
    box.innerHTML = insightMd(d.note);
    // Refresh the cache so a repaint keeps the note rather than losing it.
    const row = (IDEAS.ideas || []).find(x => x.ID === id);
    if (row) row.AI_NOTE = d.note;
  } catch (e) {
    box.innerHTML = `<div class="empty-state" style="color:var(--red)">${escHtml(e.message)}</div>`;
  } finally { btn.disabled = false; btn.textContent = 'Refine again'; }
}

// An idea that is ready stops being an idea. This is the doorway out of the
// pipeline and onto the board, and it marks the idea committed on the way.
async function ideaToTask(id, btn) {
  const idea = (IDEAS.ideas || []).find(x => x.ID === id);
  if (!idea) return;
  const ok = await uiConfirm({ title: 'Put it on the board?',
    body: `"${idea.TITLE}" becomes a task in Scope, and the idea moves to Committed.`,
    confirmLabel: 'Add the task' });
  if (!ok) return;
  btn.disabled = true;
  try {
    const d = await (await fetch('/api/tasks', { method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ title: idea.TITLE, priority: 'medium',
                             why: idea.BODY || `From idea ${idea.ID}.` }) })).json();
    if (d.error) throw new Error(d.error);
    await ideaSave(id, { stage: 'committed', links: `${idea.LINKS && idea.LINKS !== '-' ? idea.LINKS + ' ' : ''}task` });
    showToast('On the board. It is a task now, not a thought.', 'success');
  } catch (e) { showToast(e.message, 'error'); }
  finally { btn.disabled = false; }
}

async function ideaDelete(id) {
  const ok = await uiConfirm({ title: 'Delete this idea?',
    body: 'It goes out of the vault entirely. Parking it instead keeps it without it being in the way.',
    confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  const d = await (await fetch('/api/ideas/delete', { method:'POST',
    headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) })).json();
  if (d.success) { showToast('Deleted', 'info'); ideaOpen = null; await fetchIdeas(); }
  else showToast('Could not delete that one', 'error');
}

async function ideasReview(btn) {
  const box = document.getElementById('ideas-review-panel');
  btn.disabled = true; btn.textContent = 'Reading…';
  box.innerHTML = `<div class="card"><div class="empty-state">Reading the whole pipeline…</div></div>`;
  try {
    const d = await (await fetch('/api/ideas/review', { method:'POST',
      headers:{'Content-Type':'application/json'}, body: '{}' })).json();
    if (!d.success) throw new Error(d.error || 'refused');
    box.innerHTML = `<div class="card jr-review">
      <div class="card-header"><span class="card-title">The pipeline, read</span>
        <span class="card-meta">${fmtWhen(new Date().toISOString())}</span></div>
      ${insightMd(d.review)}</div>`;
  } catch (e) {
    box.innerHTML = `<div class="card"><div class="empty-state" style="color:var(--red)">${escHtml(e.message)}</div></div>`;
  } finally { btn.disabled = false; btn.textContent = 'Review the pipeline'; }
}

// ── JOURNAL ──────────────────────────────────────────────────────────────────
// Private writing with an AI that reads closely. Entries live in the vault
// (spark/journal.tsv), so they are on OneDrive within the minute. The numbers
// on the strip are computed server-side; the model only ever interprets.

let JOURNAL = null;

async function fetchJournal() {
  try { JOURNAL = await (await fetch('/api/journal')).json(); }
  catch { JOURNAL = null; }
  if (currentView === 'journal') {
    document.getElementById('view-container').innerHTML = renderJournal();
  }
}

function renderJournal() {
  if (!JOURNAL) { fetchJournal(); return `<div class="card"><div class="empty-state">Opening the journal…</div></div>`; }
  const s = JOURNAL.stats || {};
  const entries = JOURNAL.entries || [];
  const chip = (v, label) => v != null && v !== '' ? `<span class="jr-chip" title="${label}">${label} ${v}</span>` : '';

  return `
    <div class="view-head">
      <h1>Journal</h1>
      <div class="view-head-meta">private … vault-synced to OneDrive like everything else.
        Every entry is read for ideas and goals - anything found lands in
        <a href="?v=ideas" class="lesson-link" onclick="navigate('ideas');return false">Ideas</a> and
        <a href="?v=planning" class="lesson-link" onclick="navigate('planning');return false">Planning</a> for you to keep or drop.</div>
    </div>

    <div class="fin-headline card">
      <div class="fin-figure">
        <span class="fin-label">Streak</span>
        <span class="fin-value">${s.streak || 0}<span style="font-size:0.8rem;font-weight:400"> day${s.streak === 1 ? '' : 's'}</span></span>
        <span class="fin-sub">${s.week || 0} entr${s.week === 1 ? 'y' : 'ies'} this week · ${s.total || 0} total</span>
      </div>
      <div class="fin-figure">
        <span class="fin-label">Mood</span>
        <span class="fin-value">${s.mood7 != null ? s.mood7 : '—'}</span>
        <span class="fin-sub">7-day avg${s.mood30 != null ? ` · ${s.mood30} over 30` : ''}</span>
      </div>
      <div class="fin-figure">
        <span class="fin-label">Energy</span>
        <span class="fin-value">${s.energy7 != null ? s.energy7 : '—'}</span>
        <span class="fin-sub">7-day avg${s.energy30 != null ? ` · ${s.energy30} over 30` : ''}</span>
      </div>
      <div class="fin-snap">
        <button class="btn btn-ghost" onclick="journalReview(this)"
                title="Patterns across the recent entries - themes, turning points, recommendations">Review</button>
      </div>
    </div>

    <div id="journal-review-panel"></div>

    <div class="card">
      <div class="card-header"><span class="card-title">Writing activity</span>
        <span class="card-meta">last 26 weeks</span></div>
      ${circleEngagement(entries.map(e => e.DATE), 'var(--green)')}
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Today</span></div>
      <textarea id="jr-body" class="jira-input" rows="5" style="width:100%;resize:vertical"
        placeholder="What actually happened, and what it did to you. Nobody reads this but you and the reflection."></textarea>
      <div class="jr-compose-row">
        <select id="jr-mood" class="jira-input" title="Mood, 1-10">
          <option value="">mood?</option>${[1,2,3,4,5,6,7,8,9,10].map(n => `<option>${n}</option>`).join('')}
        </select>
        <select id="jr-energy" class="jira-input" title="Energy, 1-10">
          <option value="">energy?</option>${[1,2,3,4,5,6,7,8,9,10].map(n => `<option>${n}</option>`).join('')}
        </select>
        <input id="jr-tags" class="jira-input" placeholder="tags, comma separated" style="flex:1;min-width:120px"/>
        <button class="btn btn-ghost" style="padding:6px 14px" onclick="journalAdd(this)">Save</button>
        <button class="btn btn-primary" style="padding:6px 16px" title="Save the entry and read it closely, now"
                onclick="journalAddAnalyse(this)">Save &amp; analyse</button>
      </div>
      <div id="jr-analysis-out"></div>
    </div>

    ${entries.length ? entries.map(e => `
      <div class="card jr-entry">
        <div class="jr-entry-head">
          <span class="jr-date">${escHtml(e.DATE)}</span>
          <span class="jr-chips">
            ${chip(e.MOOD !== '-' ? e.MOOD : '', 'mood')}
            ${chip(e.ENERGY !== '-' ? e.ENERGY : '', 'energy')}
            ${e.TAGS && e.TAGS !== '-' ? `<span class="jr-chip jr-tags-chip">${escHtml(e.TAGS)}</span>` : ''}
          </span>
          <span class="jr-entry-actions">
            <button class="btn btn-ghost" style="font-size:0.68rem;padding:2px 9px"
                    onclick="journalReflect('${escHtml(e.ID)}',this)">${e.AI_NOTE ? 'Reflect again' : 'Reflect'}</button>
            <button class="btn btn-ghost" style="font-size:0.68rem;padding:2px 9px"
                    onclick="journalDelete('${escHtml(e.ID)}')" title="Delete this entry">✕</button>
          </span>
        </div>
        <div class="jr-body">${escHtml(e.BODY)}</div>
        ${e.AI_NOTE ? `<div id="jr-note-${escHtml(e.ID)}">${insightMd(e.AI_NOTE)}</div>` : `<div id="jr-note-${escHtml(e.ID)}"></div>`}
      </div>`).join('')
    : `<div class="card"><div class="empty-state">Nothing written yet. The first entry is the hardest;
        the second is a habit forming. Start with today.</div></div>`}`;
}

async function journalAdd(btn) {
  const body = document.getElementById('jr-body').value.trim();
  if (!body) { showToast('An empty entry is not an entry', 'error'); return; }
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const d = await (await fetch('/api/journal/add', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body,
        mood: document.getElementById('jr-mood').value,
        energy: document.getElementById('jr-energy').value,
        tags: document.getElementById('jr-tags').value }) })).json();
    if (d.success) { showToast('Written. It counts.', 'success'); await fetchJournal(); }
    else { showToast(d.error || 'Could not save', 'error'); btn.disabled = false; btn.textContent = 'Save'; }
  } catch (e) { showToast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Save'; }
}

// Save the day's input AND analyse it immediately - the reflection appears
// right under the compose box while the background inferences (people
// mentions, money flags) land on the record as usual.
async function journalAddAnalyse(btn) {
  const body = document.getElementById('jr-body').value.trim();
  if (!body) { showToast('An empty entry is not an entry', 'error'); return; }
  btn.disabled = true; btn.textContent = 'Saving…';
  const out = document.getElementById('jr-analysis-out');
  try {
    const d = await (await fetch('/api/journal/add', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body,
        mood: document.getElementById('jr-mood').value,
        energy: document.getElementById('jr-energy').value,
        tags: document.getElementById('jr-tags').value }) })).json();
    if (!d.success) { showToast(d.error || 'Could not save', 'error'); btn.disabled = false; btn.textContent = 'Save & analyse'; return; }
    btn.textContent = 'Analysing…';
    if (out) out.innerHTML = '<div class="empty-state">Saved. Reading it closely…</div>';
    const a = await (await fetch('/api/journal/reflect', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: d.id }) })).json();
    if (out) out.innerHTML = a.success ? insightMd(a.note)
      : `<div class="empty-state">Saved - the deep read will land on the entry when a model is reachable.</div>`;
    await fetchJournal();
  } catch (e) { showToast(e.message, 'error'); }
  btn.disabled = false; btn.textContent = 'Save & analyse';
}

/**
 * The insight renderer: every piece of content whose job is keeping Architect
 * current - journal readings, reviews, tutor answers, circle analysis - wears
 * the SAME styling as the lessons. AI section labels (READ:, THEMES:,
 * WATCH:, DO: ...) become headings; the markdown shapes do the rest.
 */
function insightMd(text) {
  const prepared = String(text || '').split(/\r?\n/).map(line => {
    const m = line.match(/^([A-Z][A-Z ]{1,16}):\s*(.*)$/);
    if (m && !/^https?/i.test(line)) {
      const label = m[1].charAt(0) + m[1].slice(1).toLowerCase();
      return m[2] ? `## ${label}\n${m[2]}` : `## ${label}`;
    }
    return line;
  }).join('\n');
  return `<div class="lesson-body insight">${refChips(learnMd(prepared))}</div>`;
}

async function journalReflect(id, btn) {
  btn.disabled = true; btn.textContent = 'Reading…';
  try {
    const d = await (await fetch('/api/journal/reflect', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })).json();
    if (d.success) {
      const el = document.getElementById(`jr-note-${id}`);
      if (el) { el.className = ''; el.innerHTML = insightMd(d.note); }
      btn.textContent = 'Reflect again'; btn.disabled = false;
    } else { showToast(d.error || 'No reflection available', 'error'); btn.disabled = false; btn.textContent = 'Reflect'; }
  } catch (e) { showToast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Reflect'; }
}

async function journalReview(btn) {
  btn.disabled = true; btn.textContent = 'Reading…';
  try {
    const d = await (await fetch('/api/journal/review', { method: 'POST' })).json();
    const panel = document.getElementById('journal-review-panel');
    if (d.success && panel) {
      panel.innerHTML = `<div class="card jr-review">
        <div class="card-header"><span class="card-title">The read</span>
          <span class="card-meta">${d.stats.entries} entries · mood ${d.stats.mood ?? 'n/a'} · energy ${d.stats.energy ?? 'n/a'}</span></div>
        ${insightMd(d.review)}</div>`;
    } else showToast(d.error || 'Not enough material yet', 'error');
  } catch (e) { showToast(e.message, 'error'); }
  btn.disabled = false; btn.textContent = 'Review';
}

async function journalDelete(id) {
  if (!await uiConfirm({ title: 'Delete this entry?',
    body: 'It leaves the journal. The vault git history still holds its past.',
    confirmLabel: 'Delete', danger: true })) return;
  fetch('/api/journal/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }) }).then(r => r.json()).then(d => {
      if (d.success) { showToast('Entry removed', 'info'); fetchJournal(); }
      else showToast('Could not delete', 'error');
    });
}

// ── PLANNING & STRATEGY ──────────────────────────────────────────────────────
// Goals stated plainly; the agent proposes the tasks; nothing lands unreviewed.
// Accepted tasks carry ORIGIN plan:<id>, so the board always knows which of its
// rows exist because of which ambition.

let PLANS = null;
let planProposals = {};   // planId -> [{title, priority, due, keep}]
let planEvents = {};      // planId -> [{title, date, time, category, keep}]
let planLadders = {};     // planId -> {fiveyear, year, cycle, sprint, reality}
let STRATEGY = null;

async function fetchPlans() {
  try { PLANS = (await (await fetch('/api/plans')).json()).plans || []; }
  catch { PLANS = []; }
  repaintView('planning');
}

// What each cycle theme is FOR - the year as a 13-act arc, four weeks per act.
// The words are defaults to argue with, not doctrine; the structure is the point:
// a theme tells you what kind of work the window favours, so goals land in
// windows shaped for them.
// Each theme says what the 28 days are FOR, plus the trap that window sets.
// Defaults to argue with, not doctrine - but a theme with no teeth is decoration.
const EQ_THEME_MEANING = {
  // Written in the register the owner actually plays in: position, leverage,
  // patience, compounding. A theme is the kind of move this window favours.
  Plant: { do: 'Open the positions. Put in motion the ventures the rest of the year will compound.',
           trap: 'Opening moves are cheap and intoxicating. Nine openings and no follow-through is a year that evaporates.' },
  Push:  { do: 'Apply pressure until what you planted moves on its own. Momentum now, refinement later.',
           trap: 'Polish flatters; position pays. A rough piece advancing beats a perfect piece parked.' },
  Climb: { do: 'Raise the standard where it is seen and judged - from working to good, from good to undeniable.',
           trap: 'The standard is infinite. Choose the two fronts that get judged and hold the rest at fine.' },
  Reap:  { do: 'Take what is ripe off the board: ship it, invoice it, publish it, bank it.',
           trap: 'Unclaimed wins expire quietly. A victory nobody witnessed moves nothing.' },
  Dig:   { do: 'Go narrow and deep on the one capability that deserves mastery. Depth is leverage.',
           trap: 'Depth on the wrong front is an expensive hobby. Choose once, with intent.' },
  Weave: { do: 'Connect the pieces - systems out of parts, allies out of acquaintances, patterns out of notes.',
           trap: 'Connecting seduces endlessly. Two joins that hold beat a diagram of twelve.' },
  Mend:  { do: 'Repair the machine and its operator. Refactor, rest, restore - maintenance is how position is kept.',
           trap: 'Mending is the first thing sacrificed when someone else is loud. Guard it like territory.' },
  Scout: { do: 'Lift your head. Read the terrain, the players, and the year after this one.',
           trap: 'Reconnaissance can become residence. Return with a decision, not a mood board.' },
  Scale: { do: 'Multiply what has proved itself - more reach, more capacity, more compounding.',
           trap: 'Scaling the unproven multiplies the flaw. Proof first, then volume.' },
  Make:  { do: 'Build unbriefed - the writing, the craft, the work nobody commissioned. It is what builds the name.',
           trap: 'This window gets sold to paid work every single time. Refusing that sale is the whole point.' },
  Run:   { do: 'Protect long unbroken stretches and let practised skill run at full speed.',
           trap: 'Flow dies of meetings. Defend the calendar or the theme is theatre.' },
  Stock: { do: 'Provision the endgame - logistics, groundwork, the dull moves that make the close easy.',
           trap: 'Dull work deferred matures into an emergency, always in the worst possible week.' },
  Audit: { do: 'Judge the year without flattery. Keep what compounded, cut what merely performed.',
           trap: 'An audit that finds nothing wrong was not an audit. Write the uncomfortable line down.' },
};

/**
 * The year as a board: thirteen 28-day windows, each with its theme and its two
 * sprints, the current one marked. Under it, what the windows actually hold -
 * the active goals sorted by the horizon they are committed to. Deterministic
 * arithmetic from the equicycle engine; no model involved.
 */
// Horizons said in words rather than codes: "5y" is a database value, not a
// thing anyone says.
const PLAN_HORIZON_LABEL = {
  sprint: 'this sprint', cycle: 'this cycle', quarter: 'this quarter',
  year: 'this year', '5y': 'five years', decade: 'the decade',
};

function renderYearMap(active, ctx) {
  const themes = ['Plant','Push','Climb','Reap','Dig','Weave','Mend','Scout','Scale','Make','Run','Stock','Audit'];
  const today = new Date();
  const eqYear = today.getMonth() < 5 ? today.getFullYear() - 1 : today.getFullYear();
  const june1 = new Date(eqYear, 5, 1);
  const eqStart = new Date(eqYear, 5, 1 + ((7 - june1.getDay()) % 7));
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const cells = themes.map((th, i) => {
    const n = i + 1;
    const start = new Date(eqStart.getTime() + i * 28 * 86400000);
    const end = new Date(start.getTime() + 27 * 86400000);
    const now = n === ctx.cycleNum;
    const s1 = 2 * n - 1, s2 = 2 * n;
    return `
      <div class="ym-cell${now ? ' now' : ''}${n < ctx.cycleNum ? ' past' : ''}"
           title="${escHtml(EQ_THEME_MEANING[th]?.do || '')}">
        <div class="ym-theme">${th}</div>
        <div class="ym-dates">${fmt(start)} - ${fmt(end)}</div>
        <div class="ym-sprints">S${s1}${now && ctx.sprintNum === s1 ? ' ·' : ''} / S${s2}${now && ctx.sprintNum === s2 ? ' ·' : ''}</div>
        ${now ? `<div class="ym-here">here · day ${ctx.dayInCycle}</div>` : ''}
      </div>`;
  }).join('');

  const buckets = { now: [], quarter: [], far: [] };
  active.forEach(p => {
    const b = { sprint: 'now', cycle: 'now', quarter: 'quarter' }[p.HORIZON] || 'far';
    buckets[b].push(p);
  });
  const li = (p) => `<div class="ym-plan"><span class="ym-plan-h">${escHtml(p.HORIZON)}</span><span>${escHtml(p.TITLE)}</span></div>`;

  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">The year, mapped</span>
        <span class="card-meta">13 cycles · 26 sprints · Equicycle ${ctx.eqYear}</span>
      </div>
      <div class="ym-grid">${cells}</div>
      <div class="ym-work">
        <div class="ym-col"><div class="ym-col-head">This cycle and sprint</div>
          ${buckets.now.length ? buckets.now.map(li).join('')
            : '<div class="ym-none">No goal committed to this window yet - state one below and ladder it down.</div>'}</div>
        <div class="ym-col"><div class="ym-col-head">This quarter</div>
          ${buckets.quarter.length ? buckets.quarter.map(li).join('')
            : '<div class="ym-none">Open - the quarter inherits what the cycle proves.</div>'}</div>
        <div class="ym-col"><div class="ym-col-head">The year and beyond</div>
          ${buckets.far.length ? buckets.far.map(li).join('')
            : '<div class="ym-none">The standing ambitions live here.</div>'}</div>
      </div>
      <div class="ym-note">Ladder any goal below and its window becomes dated tasks - the sprint is whatever the TASK rungs say this fortnight is for.</div>
    </div>`;
}

function renderPlanning() {
  if (PLANS === null) { fetchPlans(); return `<div class="card"><div class="empty-state">Loading plans…</div></div>`; }
  const active = PLANS.filter(p => p.STATUS === 'active');
  const done = PLANS.filter(p => p.STATUS !== 'active');
  const tags = STATE.tags || [];
  const ctx = getEquicycleContext();
  const firstHalf = ctx.dayInCycle <= 14;
  const cycPct = Math.min(100, Math.round((ctx.dayInCycle / 28) * 100));
  const cycTone = cycPct >= 85 ? 'red' : cycPct >= 60 ? 'amber' : 'green';

  return `
    <div class="view-head">
      <h1>Planning &amp; Strategy</h1>
      <div class="view-head-meta">the long game, on a dated board … goals become moves, moves become position, position compounds</div>
    </div>

    ${renderSpaceInsight('planning')}

    <div class="card plan-where">
      <div class="plan-where-theme">
        <span class="eq-theme">${escHtml(ctx.theme)}</span>
        <span class="plan-where-cycle">Cycle ${ctx.cycleNum} of 13 · day ${ctx.dayInCycle} of 28</span>
        <span class="plan-where-left tone-${cycTone}">${28 - ctx.dayInCycle} days left</span>
      </div>
      <div class="plan-where-track"><div class="tone-${cycTone}" style="width:${cycPct}%"></div></div>
      <div class="plan-where-meaning">${escHtml(EQ_THEME_MEANING[ctx.theme]?.do || '')}</div>
      ${EQ_THEME_MEANING[ctx.theme]?.trap ? `
        <div class="plan-where-trap"><span>The trap</span>${escHtml(EQ_THEME_MEANING[ctx.theme].trap)}</div>` : ''}
      <div class="plan-where-sprint">
        <strong>Sprint ${ctx.sprintNum}</strong> is this window's ${firstHalf
          ? 'opening fortnight - commit the pieces this theme favours and set them moving'
          : 'closing fortnight - land what the opening set in motion; new openings wait for the next cycle'}.
        Every goal below becomes dated moves: tasks and calendar entries timed to land inside these windows.
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">State a goal</span>
        ${active.length ? `<button class="btn btn-ghost" style="font-size:0.7rem;padding:2px 10px"
                onclick="planStrategy(this)">${STRATEGY ? 'Read it again' : 'Where do I stand?'}</button>` : ''}
      </div>
      <div class="plan-form">
        <input id="plan-title" class="jira-input" style="flex:1;min-width:16rem"
               placeholder="In your own words … ship the hero rollout, get the emergency fund to three months, learn to say no by Friday"/>
        <select id="plan-horizon" class="jira-input" title="The window it should land inside">
          <option value="sprint">this sprint (14d)</option>
          <option value="cycle" selected>this cycle (28d)</option>
          <option value="quarter">quarter (90d)</option>
          <option value="year">year</option>
          <option value="5y">five years</option>
          <option value="decade">decade</option>
        </select>
        <select id="plan-tag" class="jira-input">
          <option value="">untagged</option>
          ${tags.map(t => `<option value="${escHtml(t.id)}">${escHtml(t.label)}</option>`).join('')}
        </select>
        <button class="btn btn-primary" style="padding:6px 14px" onclick="planAdd(this)">Add goal</button>
      </div>
    </div>

    ${(() => {
      // The Life Lens: the eight areas a life gets read across. "MPG" was the
      // framework's filing name, not a word anyone would say out loud.
      // Active goals are matched by keyword (crude on purpose -
      // computed, not inferred); a dark category is shown dark, because a
      // blind spot named is the point of the lens.
      const LIFE_AREAS = [
        ['Legacy', /legacy|compound|ip\b|aquifer|isconl|system/i],
        ['Contribution', /volunt|contribut|giv|serv|communit|ministry/i],
        ['Finance', /financ|money|fund|income|invest|net worth|emergency/i],
        ['Physical', /physi|gym|fitness|health|body|run|sleep/i],
        ['Mental', /mental|read|learn|study|course|mind/i],
        ['Devotion', /devot|spirit|faith|church|pray/i],
        ['Adventure', /adventur|travel|explor|new ground|grow/i],
        ['Content', /content|publish|write|video|post|create/i],
      ];
      const lens = LIFE_AREAS.map(([name, re]) => [name, active.filter(p => re.test(p.TITLE + ' ' + (p.NOTE || ''))).length]);
      return `
      <div class="card">
        <div class="card-header"><span class="card-title">The Life Lens</span>
          <span class="card-meta">the eight areas a life is read across · dim means nothing active there</span></div>
        <div class="life-lens">
          ${lens.map(([name, n]) => `<span class="life-area${n ? ' lit' : ''}" title="${n} active goal${n === 1 ? '' : 's'}">${name}${n ? ` <b>${n}</b>` : ''}</span>`).join('')}
        </div>
      </div>`;
    })()}

    ${renderStrategy()}

    ${active.map(p => {
      const props = planProposals[p.ID];
      // The endpoint always attaches tasks, but a plan must render even if a
      // row arrives bare - one malformed plan must never blank the whole view.
      const openTasks = (p.tasks || []).filter(t => t.STATUS !== 'done');
      const doneTasks = (p.tasks || []).filter(t => t.STATUS === 'done');
      return `
      <div class="card plan-card">
        <!-- A goal is a sentence, so it is set as one: sentence case at a
             readable size, its window as a quiet chip above, and the actions on
             their own line underneath where they cannot crowd the words. -->
        <div class="plan-head">
          <div class="plan-chips">
            <span class="plan-horizon h-${escHtml(p.HORIZON)}">${escHtml(PLAN_HORIZON_LABEL[p.HORIZON] || p.HORIZON)}</span>
            ${p.TAG && p.TAG !== '-' ? `<span class="trow-tag" style="${tagStyle(p.TAG)}">${escHtml(tagLabel(p.TAG))}</span>` : ''}
          </div>
          <h2 class="plan-title">${escHtml(p.TITLE)}</h2>
          ${p.NOTE && p.NOTE !== '-' ? `<div class="plan-note">${escHtml(p.NOTE)}</div>` : ''}
          <div class="plan-actions">
            ${['year', '5y', 'decade'].includes(p.HORIZON) ? `
            <button class="btn btn-ghost" style="font-size:0.7rem;padding:3px 11px"
                    title="Walk it down: five years, this year, this cycle, this sprint, first tasks"
                    onclick="planLadder('${escHtml(p.ID)}', this)">${planLadders[p.ID] ? 'Re-ladder' : 'Ladder it down'}</button>` : ''}
            <button class="btn ${p.tasks.length ? 'btn-ghost' : 'btn-primary'}" style="font-size:0.7rem;padding:3px 11px"
                    onclick="planDistill('${escHtml(p.ID)}', this)">${p.tasks.length ? 'Distill more' : 'Distill to tasks'}</button>
            <button class="btn btn-ghost plan-done-btn" style="font-size:0.7rem;padding:3px 11px"
                    onclick="planSetStatus('${escHtml(p.ID)}','achieved')">Achieved</button>
          </div>
        </div>

        ${p.tasks.length ? `
          <div class="plan-progress">
            <div class="fin-goal-bar" style="flex:1"><div style="width:${p.tasks.length ? Math.round(doneTasks.length / p.tasks.length * 100) : 0}%"></div></div>
            <span class="card-meta">${doneTasks.length}/${p.tasks.length} done</span>
          </div>
          <div class="plan-tasks">
            ${openTasks.map(t => `
              <div class="plan-task linked" onclick="openTask('${escHtml(t.ID)}')">
                <span class="prio-edge prio-${escHtml(t.PRIORITY)}"></span>
                <span class="plan-task-title">${escHtml(t.TITLE)}</span>
                <span class="plan-task-due">${t.DUE_DATE !== '-' ? escHtml(t.DUE_DATE) : ''}</span>
              </div>`).join('')}
          </div>` : ''}

        ${planLadders[p.ID] ? `
          <div class="plan-ladder">
            ${[['Five years', planLadders[p.ID].fiveyear], ['This year', planLadders[p.ID].year],
               ['This cycle', planLadders[p.ID].cycle], ['This sprint', planLadders[p.ID].sprint]]
              .filter(r => r[1]).map(r => `
              <div class="plan-rung"><span class="plan-rung-label">${r[0]}</span>
                <span class="plan-rung-text">${escHtml(r[1])}</span></div>`).join('')}
            ${planLadders[p.ID].reality ? `
              <div class="plan-rung plan-rung-reality"><span class="plan-rung-label">Reality</span>
                <span class="plan-rung-text">${escHtml(planLadders[p.ID].reality)}</span></div>` : ''}
          </div>` : ''}

        ${props ? `
          <div class="plan-proposals">
            <div class="plan-proposals-head">Proposed … untick anything you disagree with, then accept</div>
            ${props.map((t, i) => `
              <div class="plan-proposal">
                <input type="checkbox" ${t.keep ? 'checked' : ''} onchange="planProposals['${escHtml(p.ID)}'][${i}].keep=this.checked"/>
                <input class="jira-input" style="flex:1" value="${escHtml(t.title)}"
                       oninput="planProposals['${escHtml(p.ID)}'][${i}].title=this.value"/>
                <select class="task-select" onchange="planProposals['${escHtml(p.ID)}'][${i}].priority=this.value">
                  ${['high','medium','low'].map(x => `<option${x === t.priority ? ' selected' : ''}>${x}</option>`).join('')}
                </select>
                <input type="date" class="task-select" value="${escHtml(t.due)}"
                       onchange="planProposals['${escHtml(p.ID)}'][${i}].due=this.value"/>
              </div>`).join('')}
            ${(planEvents[p.ID] || []).length ? `
              <div class="plan-proposals-head" style="margin-top:0.6rem">And for the calendar</div>
              ${planEvents[p.ID].map((e, i) => `
                <div class="plan-proposal">
                  <input type="checkbox" ${e.keep ? 'checked' : ''} onchange="planEvents['${escHtml(p.ID)}'][${i}].keep=this.checked"/>
                  <input class="jira-input" style="flex:1" value="${escHtml(e.title)}"
                         oninput="planEvents['${escHtml(p.ID)}'][${i}].title=this.value"/>
                  <span class="plan-ev-kind">${escHtml(e.category)}</span>
                  <input type="date" class="task-select" value="${escHtml(e.date)}"
                         onchange="planEvents['${escHtml(p.ID)}'][${i}].date=this.value"/>
                </div>`).join('')}` : ''}
            <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
              <button class="btn btn-primary" style="font-size:0.72rem;padding:4px 12px"
                      onclick="planAccept('${escHtml(p.ID)}', this)">Accept the ticked ones</button>
              <button class="btn btn-ghost" style="font-size:0.72rem"
                      onclick="delete planProposals['${escHtml(p.ID)}'];delete planEvents['${escHtml(p.ID)}'];repaintView('planning')">Bin the lot</button>
            </div>
          </div>` : ''}
      </div>`;
    }).join('') || `
      <div class="card"><div class="empty-state" style="text-align:left">
        No goals yet, which makes the countdowns in the top band a very precise
        measurement of nothing. State one above and they start to mean something.
      </div></div>`}

    ${done.length ? `
      <div class="card">
        <div class="card-header"><span class="card-title">Closed</span></div>
        ${done.map(p => `<div class="plan-closed">${escHtml(p.TITLE)} <span class="card-meta">${escHtml(p.STATUS)}</span></div>`).join('')}
      </div>` : ''}`;
}

async function planAdd(btn) {
  const title = document.getElementById('plan-title')?.value.trim();
  if (!title) { showToast('I will need the goal itself', 'warn'); return; }
  btn.disabled = true;
  try {
    const d = await (await fetch('/api/plans/add', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title,
        horizon: document.getElementById('plan-horizon')?.value,
        tag: document.getElementById('plan-tag')?.value }) })).json();
    showToast(d.success ? 'On the record … now let me break it up' : (d.error || 'Refused'),
              d.success ? 'success' : 'error');
    if (d.success) await fetchPlans();
  } catch (e) { showToast(e.message, 'error'); }
  btn.disabled = false;
}

// Walk a decade-scale ambition down to rungs and first tasks. The tasks land in
// the same veto-then-accept proposals flow as distill - nothing is adopted
// silently, and the REALITY rung keeps the ladder honest.
async function planLadder(id, btn) {
  const was = btn.textContent;
  btn.disabled = true; btn.textContent = 'Walking it down…';
  try {
    const d = await (await fetch('/api/plans/ladder', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })).json();
    if (!d.success) { showToast(d.error || 'Could not ladder that one', 'error'); }
    else {
      planLadders[id] = d.rungs || {};
      planProposals[id] = (d.proposals || []).map(t => ({ ...t, keep: true }));
      repaintView('planning');
      showToast(`Laddered … ${(d.proposals || []).length} first task${(d.proposals || []).length === 1 ? '' : 's'} to veto or accept`, 'success');
    }
  } catch (e) { showToast(e.message, 'error'); }
  btn.disabled = false; btn.textContent = was;
}

async function planDistill(id, btn) {
  const was = btn.textContent;
  btn.disabled = true; btn.textContent = 'Thinking…';
  try {
    const d = await (await fetch('/api/plans/distill', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })).json();
    if (!d.success) { showToast(d.error || 'Could not distill that one', 'error'); }
    else {
      planProposals[id] = (d.proposals || []).map(t => ({ ...t, keep: true }));
      planEvents[id] = (d.events || []).map(e => ({ ...e, keep: true }));
      repaintView('planning');
      const n = planProposals[id].length, m = planEvents[id].length;
      showToast(`${n} task${n === 1 ? '' : 's'}${m ? ` and ${m} calendar entr${m === 1 ? 'y' : 'ies'}` : ''} … yours to veto`, 'success');
    }
  } catch (e) { showToast(e.message, 'error'); }
  btn.disabled = false; btn.textContent = was;
}

async function planAccept(id, btn) {
  const chosen = (planProposals[id] || []).filter(t => t.keep && t.title.trim());
  const evs = (planEvents[id] || []).filter(e => e.keep && e.title.trim());
  if (!chosen.length && !evs.length) { showToast('Nothing ticked … so nothing happens', 'warn'); return; }
  btn.disabled = true;
  try {
    const d = await (await fetch('/api/plans/accept', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, tasks: chosen, events: evs }) })).json();
    if (d.success) {
      const bits = [];
      if (d.added?.length) bits.push(`${d.added.length} on the board`);
      if (d.events?.length) bits.push(`${d.events.length} on the calendar`);
      showToast(`${bits.join(', ')} … the goal now has somewhere to be`, 'success');
      delete planProposals[id]; delete planEvents[id];
      await fetchState(); await fetchCalendarEvents(); await fetchPlans();
    } else showToast(d.error || 'Refused', 'error');
  } catch (e) { showToast(e.message, 'error'); }
  btn.disabled = false;
}

// The strategy read: where the goals sit against the real terrain.
async function planStrategy(btn) {
  const was = btn.textContent;
  btn.disabled = true; btn.textContent = 'Reading the terrain…';
  try {
    const d = await (await fetch('/api/plans/strategy', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
    if (!d.success) showToast(d.error || 'Could not read it', 'error');
    else { STRATEGY = d.strategy; repaintView('planning'); }
  } catch (e) { showToast(e.message, 'error'); }
  btn.disabled = false; btn.textContent = was;
}

function renderStrategy() {
  const s = STRATEGY;
  if (!s) return '';
  return `
    <div class="card strat-card">
      <div class="card-header">
        <span class="card-title">The read</span>
        <span class="card-meta">${escHtml(s.theme)} · ${s.daysLeft} days left · ${escHtml((s.generatedAt || '').slice(11, 16))}</span>
      </div>
      ${s.position ? `<div class="strat-position">${escHtml(s.position)}</div>` : ''}
      ${s.leverage?.length ? `
        <div class="strat-block">
          <div class="strat-label good">Where the leverage is</div>
          ${s.leverage.map(l => `<div class="strat-line">${escHtml(l)}</div>`).join('')}
        </div>` : ''}
      ${s.exposed?.length ? `
        <div class="strat-block">
          <div class="strat-label warn">Where you are thin</div>
          ${s.exposed.map(l => `<div class="strat-line">${escHtml(l)}</div>`).join('')}
        </div>` : ''}
      ${s.window ? `<div class="strat-window"><span>If only one thing</span>${escHtml(s.window)}</div>` : ''}
    </div>`;
}

function planSetStatus(id, status) {
  fetch('/api/plans/update', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status }) }).then(() => fetchPlans());
}

/**
 * Badges behave like notifications, not counters. A number appears only when
 * something is NEW since the view was last opened; opening the view marks it
 * seen and the badge disappears. A permanent "12" next to Jira is wallpaper -
 * unread-since-you-looked is information.
 */
function badgeSeenKey(name) { return `isconl-seen-${name}`; }

function updateBadges() {
  const totals = {
    jira: (STATE.jiraIssues || []).length,
    inbox: (STATE.feed || []).filter(m => m.STATUS === 'new').length,
    decisions: 0,   // populated when the decisions data carries a pending count
  };
  for (const [name, total] of Object.entries(totals)) {
    const el = document.getElementById(`${name}-badge`);
    if (!el) continue;
    const seen = parseInt(localStorage.getItem(badgeSeenKey(name)) || '0', 10);
    const fresh = Math.max(0, total - seen);
    el.textContent = fresh;
    el.style.display = fresh > 0 ? '' : 'none';
  }
}

// Opening a view is what "reading the notification" means here.
function markBadgeSeen(view) {
  const totals = { jira: (STATE.jiraIssues || []).length,
                   inbox: (STATE.feed || []).filter(m => m.STATUS === 'new').length };
  if (view in totals) {
    localStorage.setItem(badgeSeenKey(view), String(totals[view]));
    updateBadges();
  }
}

function startPolling() {
  setInterval(async () => {
    await fetchState();
    updateBadges();
    if (currentView==='jira') { await fetchJiraIssues(); document.getElementById('view-container') && (document.getElementById('view-container').innerHTML=renderJira()); }
  }, 90000);
}

// ── INIT ──────────────────────────────────────────────────────────────────────

async function init() {
  // Nothing loads until the token is accepted - the console is private.
  if (!(await ensureAuthenticated())) return;

  await fetchState();
  fetchGhSnapshot();          // not awaited -- see the comment above these
  fetchJiraIssues();          // three definitions. First paint no longer
  fetchCalendarEvents();      // waits ~13-15s on GitHub/Jira/calendar.
  await fetchRefs();          // so D-024 reads as itself from the first paint
  await syncClock();          // the agent is the clock authority, not this device
  await fetchDay();           // block definitions, so the trusted clock has a day to count against
  startCtxClock();            // ticks every second, monotonic, correct offline

  renderEqHeader();
  refreshNotifBadge();

  // data-axis lets the three Spaces buttons share one view while each entering
  // the tree at its own axis.
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => btn.addEventListener('click', ()=>{
    if (btn.dataset.axis) spacesPath = [btn.dataset.axis];
    if (btn.dataset.ring) { circleRing = btn.dataset.ring; circleOpenPerson = null; }
    if (btn.dataset.cat) { projectCat = btn.dataset.cat; projectOpen = null; }
    navigate(btn.dataset.view);
  }));
  document.getElementById('cmd-trigger')?.addEventListener('click', openCmd);
  document.getElementById('cmd-overlay')?.addEventListener('click', e=>{ if(e.target.id==='cmd-overlay') closeCmd(); });
  document.querySelectorAll('.cmd-item').forEach(item => item.addEventListener('click', ()=>{
    if (item.dataset.view) { closeCmd(); navigate(item.dataset.view); }
    if (item.dataset.gh) { closeCmd(); quickAsk(item.dataset.gh); }
  }));
  const cmdInput=document.getElementById('cmd-input');
  if (cmdInput) cmdInput.addEventListener('keydown', async e=>{
    if (e.key==='Enter') { const q=e.target.value.trim(); if(!q)return; showCmdResult('Thinking…'); const resp=await postChat(q).catch(()=>'Offline.'); showCmdResult(resp); }
  });

  updateBadges();

  // Request notification permission early
  if ('Notification' in window) Notification.requestPermission();

  initPanelFocus();
  renderChatGreeting();
  startPolling();
  setRailMode('context'); // Boot into Context HUD as default

  // Open whatever the URL names, so a reload or a shared link lands where you
  // expect rather than always dumping you on Command. Unknown views fall back.
  const q = new URLSearchParams(location.search);
  const wanted = q.get('v') || 'today';
  const wantedTask = q.get('task');
  const at = q.get('at');
  if (at) spacesPath = at.split('.').filter(Boolean);

  if (wanted === 'task' && wantedTask) {
    // replaceState first so the very first back press has somewhere to land.
    pushHistory('tasks', {}, true);
    openTask(wantedTask);
  } else if (viewFns[wanted]) {
    navigate(wanted, {}, { fromHistory: true });
    pushHistory(wanted, {}, true);
  } else {
    navigate('today', {}, { fromHistory: true });
    pushHistory('today', {}, true);
  }
}

// ── MOBILE SHELL ──────────────────────────────────────────────────────────────
// Below 820px the sidebar is a drawer, the assistant is a full-height sheet,
// and the tab bar is the thumb's home row. All state lives on <body> classes so
// the CSS owns every transition and this stays a handful of small verbs.

function mNavOpen()   { document.body.classList.add('m-nav-open'); document.body.classList.remove('m-chat-open'); mTabSync(); }
function mNavClose()  { document.body.classList.remove('m-nav-open'); }
function mNavToggle() { document.body.classList.contains('m-nav-open') ? mNavClose() : mNavOpen(); }
function mChatOpen()  { document.body.classList.add('m-chat-open'); document.body.classList.remove('m-nav-open'); mTabSync(); }
function mChatClose() { document.body.classList.remove('m-chat-open'); mTabSync(); }
function mChatToggle(){ document.body.classList.contains('m-chat-open') ? mChatClose() : mChatOpen(); }
function mShellClose(){ mNavClose(); document.body.classList.remove('m-chat-open'); mTabSync(); }
function mGo(view)    { mShellClose(); navigate(view); }

// The tab bar mirrors where you are: view tabs from currentView, the Ask tab
// from whether the sheet is up, the inbox badge from the sidebar's own badge.
function mTabSync() {
  const chatOpen = document.body.classList.contains('m-chat-open');
  document.querySelectorAll('#m-tabs .m-tab[data-mview]').forEach(el =>
    el.classList.toggle('active', !chatOpen && el.dataset.mview === currentView));
  const ask = document.getElementById('m-tab-ask');
  if (ask) ask.classList.toggle('active', chatOpen);
  paintNotifBadge();
}

// Escape backs out of whichever mobile layer is up (harmless on desktop:
// neither class is ever set there).
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') mShellClose(); });

document.addEventListener('DOMContentLoaded', init);
