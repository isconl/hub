'use strict';
/**
 * BL26091107 -- server-side lesson PDF rendering. The browser already builds
 * the exact standalone HTML learnViewArtifact() would show (see
 * learnStandaloneHtml() in web/static/app.js); this just prints that HTML
 * with headless Chromium instead of the OS print dialog, so a real PDF file
 * comes back as one direct download. One shared browser instance, launched
 * lazily and reused across requests -- launching Chromium per-request would
 * be needlessly slow for what is otherwise a fast, synchronous-feeling action.
 */

let puppeteer;
let browserPromise = null;

function getPuppeteer() {
  if (!puppeteer) puppeteer = require('puppeteer');
  return puppeteer;
}

function getBrowser() {
  if (!browserPromise) {
    browserPromise = getPuppeteer().launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    browserPromise.catch(() => { browserPromise = null; }); // let a failed launch be retried, not cached forever
  }
  return browserPromise;
}

/** Renders a self-contained HTML string (already produced client-side) to an A4 PDF buffer. */
async function renderHtmlToPdf(html) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '1.6cm', bottom: '1.6cm', left: '1.6cm', right: '1.6cm' },
    });
  } finally {
    await page.close();
  }
}

async function shutdown() {
  if (!browserPromise) return;
  try { const b = await browserPromise; await b.close(); } catch {}
  browserPromise = null;
}

module.exports = { renderHtmlToPdf, shutdown };
