'use strict';
/**
 * Serves the compiled Flutter web console (`flutter build web` output) from
 * hub's own plain http server -- no framework in use here, so this is a
 * small hand-rolled equivalent of the legacy monolith's dashboard static
 * handler (isconl-agent/server.js, ~line 13536), not a new pattern.
 *
 * Deliberately NO wildcard SPA fallback to index.html for unknown paths: the
 * Flutter app is a single MaterialApp with no URL-based routing, so there is
 * no other browser-navigable path that needs catching. Revisit only if a
 * later phase adds go_router-style deep-linking on web.
 */

const fs = require('fs');
const path = require('path');

// Charset declared explicitly on every text type -- without it the browser
// may guess the wrong encoding and mangle anything non-ASCII.
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * @param {object} opts
 * @param {string} opts.webDir - directory holding `flutter build web`'s output
 */
function createStaticServer({ webDir }) {
  const root = path.resolve(webDir);
  const indexPath = path.join(root, 'index.html');
  // Checked once at boot, not per-request: this is what makes the whole
  // thing inert (maybeServe always returns false) on any deployment that
  // hasn't built the web target -- zero risk to engines-only setups.
  const available = fs.existsSync(indexPath);

  /**
   * @returns {Promise<boolean>} true if this request was fully handled
   * (response already sent, one way or another -- 200, 304, or a real 404
   * for a path that looked like ours but wasn't a file)
   */
  function maybeServe(req, pathname, res) {
    return new Promise((resolve) => {
      if (!available || req.method !== 'GET') return resolve(false);

      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      const resolved = path.resolve(root, relative);
      // Path-traversal guard: the resolved path must stay inside root.
      if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        return resolve(false);
      }

      fs.stat(resolved, (err, stat) => {
        if (err || !stat.isFile()) return resolve(false);

        // NO HEURISTIC CACHING, EVER -- see isconl-agent/server.js's own
        // comment on this (a week-old cached dashboard once ran silently
        // against a current server). no-cache forces revalidation on every
        // load; the Last-Modified/304 pair below keeps that cheap.
        const lastMod = stat.mtime.toUTCString();
        if (req.headers['if-modified-since'] === lastMod) {
          res.writeHead(304, { 'Cache-Control': 'no-cache', 'Last-Modified': lastMod });
          res.end();
          return resolve(true);
        }

        fs.readFile(resolved, (readErr, data) => {
          if (readErr) return resolve(false);
          const ext = path.extname(resolved);
          res.writeHead(200, {
            // Binary/unrecognised assets (wasm, fonts) must not default to
            // text/plain the way the legacy table did -- that fallback was
            // only ever safe there because its whole asset set was text.
            'Content-Type': MIME[ext] || 'application/octet-stream',
            'Cache-Control': 'no-cache',
            'Last-Modified': lastMod,
          });
          res.end(data);
          resolve(true);
        });
      });
    });
  }

  return { available, maybeServe };
}

module.exports = { createStaticServer };
