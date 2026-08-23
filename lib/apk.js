'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const APK_TICKET_TTL_MS = 15 * 60 * 1000;
const apkTickets = new Map();

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

function getLatestInfo(baseDir) {
  const local = findLocalApk(baseDir);
  if (!local) {
    return {
      available: false,
      error: 'No local APK build found on this workstation.',
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
    notes: 'Mobile shell 5-tab redesign, context ring card, learning prefetch manifest, and audio library player.',
    source: 'local',
    downloadUrl: '/api/apk/download',
  };
}

module.exports = {
  issueTicket,
  isTicketValid,
  findLocalApk,
  getLatestInfo,
  formatSize,
};
