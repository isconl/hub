'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const APK_TICKET_TTL_MS = 15 * 60 * 1000;
const apkTickets = new Map();

// BN26091010: releases from `isconl/app`'s own GitHub Releases (already
// built/signed/published by app-build.yml on every `apk-v*` tag) are the
// real "update without USB" source -- the local-dir scan below stays as
// the dev-workstation fallback for whoever is running hub without a
// network path to GitHub, not the primary path anymore.
const GITHUB_RELEASE_CACHE_MS = 5 * 60 * 1000;
let releaseCache = { ts: 0, repo: null, data: null };

function issueTicket() {
  const now = Date.now();
  for (const [t, exp] of apkTickets) {
    if (exp < now) apkTickets.delete(t);
  }
  const token = crypto.randomBytes(24).toString('hex');
  apkTickets.set(token, now + APK_TICKET_TTL_MS);
  return token;
}

function isTicketValid(token) {
  if (!token) return false;
  const exp = apkTickets.get(token);
  if (!exp) return false;
  if (exp < Date.now()) {
    apkTickets.delete(token);
    return false;
  }
  return true;
}

function findLocalApk(baseDir) {
  const explicit = String(process.env.ISCONL_APK_FILE || '').trim();
  if (explicit && fs.existsSync(explicit)) return explicit;

  const candidateDirs = [
    path.join(baseDir, 'dist'),
    path.join(baseDir, 'public', 'apk'),
    path.join(baseDir, 'app', 'build', 'app', 'outputs', 'flutter-apk'),
  ];

  for (const dir of candidateDirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir)
        .filter(f => /\.apk$/i.test(f) && !f.endsWith('-unsigned.apk'))
        .map(f => ({
          path: path.join(dir, f),
          filename: f,
          stat: fs.statSync(path.join(dir, f)),
        }))
        .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

      if (files.length > 0) return files[0].path;
    } catch {}
  }
  return null;
}

function formatSize(bytes) {
  const n = Number(bytes || 0);
  if (!n) return '';
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}

function defaultGithubRepo() {
  return String(process.env.APK_GITHUB_REPO || 'isconl/app').trim();
}

function defaultGithubToken() {
  if (process.env.ISCONL_GITHUB_TOKEN) return process.env.ISCONL_GITHUB_TOKEN;
  // Lazy require -- avoids a hard dependency for callers/tests that never
  // touch the GitHub path (secretStore does its own Bitwarden sync work
  // at require time in some environments).
  try {
    const secretStore = require('./secrets');
    return secretStore.get('ISCONL_GITHUB_TOKEN') || '';
  } catch {
    return '';
  }
}

function githubApiRequest(pathAndQuery, token, accept) {
  return new Promise((resolve, reject) => {
    const headers = {
      'Accept': accept || 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'isconl-hub',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const req = https.request(
      { hostname: 'api.github.com', path: pathAndQuery, method: 'GET', headers },
      res => {
        // Binary asset download: don't buffer, hand the raw response back
        // for the caller to pipe (redirects are followed by Node's https
        // client automatically only for the initial 3xx to the asset's
        // signed storage URL when we re-request that Location ourselves --
        // see downloadGithubAsset below).
        if (accept === 'application/octet-stream') return resolve(res);
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, data }); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

/** GET the latest GitHub release for `repo` (owner/name). Null on any failure -- caller falls back to the local scan. */
async function fetchGithubLatestRelease(repo, token) {
  if (releaseCache.repo === repo && Date.now() - releaseCache.ts < GITHUB_RELEASE_CACHE_MS) {
    return releaseCache.data;
  }
  try {
    const res = await githubApiRequest(`/repos/${repo}/releases/latest`, token);
    if (res.status !== 200 || !res.data || typeof res.data !== 'object') {
      releaseCache = { ts: Date.now(), repo, data: null };
      return null;
    }
    const assets = Array.isArray(res.data.assets) ? res.data.assets : [];
    const apkAsset = assets.find(a => /\.apk$/i.test(a.name || ''));
    if (!apkAsset) {
      releaseCache = { ts: Date.now(), repo, data: null };
      return null;
    }
    const versionMatch = String(res.data.tag_name || '').match(/(\d+\.\d+\.\d+)/);
    const data = {
      version: versionMatch ? versionMatch[1] : String(res.data.tag_name || '').replace(/^apk-v?/, ''),
      tag: res.data.tag_name,
      filename: apkAsset.name,
      size: apkAsset.size,
      publishedAt: res.data.published_at || res.data.created_at,
      notes: res.data.body || '',
      assetApiUrl: `/repos/${repo}/releases/assets/${apkAsset.id}`,
      assetId: apkAsset.id,
    };
    releaseCache = { ts: Date.now(), repo, data };
    return data;
  } catch {
    releaseCache = { ts: Date.now(), repo, data: null };
    return null;
  }
}

/**
 * Resolve the latest available build. GitHub Releases (the real
 * update-without-USB source) is tried first; the local workstation
 * dist/build-output scan is the fallback when GitHub is unreachable, the
 * repo has no APK release yet, or no token is configured for a private
 * repo. `opts.repo`/`opts.token` let tests/callers override resolution.
 */
async function getLatestInfo(baseDir, opts = {}) {
  const repo = opts.repo || defaultGithubRepo();
  const token = opts.token !== undefined ? opts.token : defaultGithubToken();

  const release = opts.disableGithub ? null : await fetchGithubLatestRelease(repo, token);
  if (release) {
    return {
      available: true,
      version: release.version,
      tag: release.tag,
      filename: release.filename,
      size: release.size,
      sizeLabel: formatSize(release.size),
      publishedAt: release.publishedAt,
      notes: release.notes || 'See the GitHub release for details.',
      source: 'github',
      downloadUrl: '/api/apk/download',
      assetApiUrl: release.assetApiUrl,
    };
  }

  const local = findLocalApk(baseDir);
  if (!local) {
    return {
      available: false,
      error: 'No GitHub release and no local APK build found on this workstation.',
    };
  }

  const stat = fs.statSync(local);
  const filename = path.basename(local);
  const versionMatch = filename.match(/v(\d+\.\d+\.\d+)/);
  const version = versionMatch ? versionMatch[1] : '0.2.0';

  return {
    available: true,
    version,
    tag: `apk-v${version}`,
    filename,
    size: stat.size,
    sizeLabel: formatSize(stat.size),
    publishedAt: stat.mtime.toISOString(),
    notes: 'Local workstation build (no matching GitHub release found).',
    source: 'local',
    downloadUrl: '/api/apk/download',
  };
}

/** Stream a GitHub release asset to `res` (the asset API redirects to a signed, unauthenticated storage URL -- the token is only ever sent to api.github.com, never forwarded to that redirect target). */
function streamGithubAsset(assetApiUrl, token, filename, res) {
  return new Promise((resolve, reject) => {
    https.get(
      {
        hostname: 'api.github.com',
        path: assetApiUrl,
        headers: {
          'Accept': 'application/octet-stream',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'isconl-hub',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      assetRes => {
        if (assetRes.statusCode >= 300 && assetRes.statusCode < 400 && assetRes.headers.location) {
          // Follow the redirect to the signed storage URL ourselves, with a
          // plain (unauthenticated) request -- https.get would otherwise
          // resend our GitHub token to a third-party host.
          https.get(assetRes.headers.location, storageRes => {
            res.writeHead(200, {
              'Content-Type': 'application/vnd.android.package-archive',
              'Content-Disposition': `attachment; filename="${filename}"`,
              'Content-Length': storageRes.headers['content-length'],
              'Cache-Control': 'no-store',
            });
            storageRes.pipe(res);
            storageRes.on('end', resolve);
            storageRes.on('error', reject);
          }).on('error', reject);
          return;
        }
        reject(new Error(`GitHub asset request failed: ${assetRes.statusCode}`));
      }
    ).on('error', reject);
  });
}

module.exports = {
  issueTicket,
  isTicketValid,
  findLocalApk,
  getLatestInfo,
  formatSize,
  fetchGithubLatestRelease,
  streamGithubAsset,
  defaultGithubRepo,
  defaultGithubToken,
};
