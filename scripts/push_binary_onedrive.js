#!/usr/bin/env node
// One-off binary OneDrive push, reusing vault's own graph client + secrets
// exactly as vault/src/server.js wires them, since the HTTP /onedrive/upload
// route only accepts JSON text content (fine for .md, wrong for .docx).
// Run from inside vault/ so its relative requires resolve.
const path = require('path');
const fs = require('fs');
const VAULT = 'D:/work/dev/iSconl/vault';
process.chdir(VAULT);
const secretStore = require(path.join(VAULT, 'lib/secrets'));
const { createGraphClient } = require(path.join(VAULT, 'lib/graph'));

const FOLDER = 'Sconl/Core/Axial/Visionary/Corporate/2026-viva-valentia';
const CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function encodePathSegments(p) {
  return p.split('/').map(encodeURIComponent).join('/');
}

async function main() {
  await secretStore.init();
  let graphConfig = {
    clientId: process.env.MSGRAPH_CLIENT_ID || secretStore.get('MSGRAPH_CLIENT_ID') || '',
    clientSecret: process.env.MSGRAPH_CLIENT_SECRET || secretStore.get('MSGRAPH_CLIENT_SECRET') || '',
    accessToken: process.env.MSGRAPH_ACCESS_TOKEN || '',
    refreshToken: secretStore.get('MSGRAPH_REFRESH_TOKEN') || '',
    tenantId: process.env.MSGRAPH_TENANT_ID || secretStore.get('MSGRAPH_TENANT_ID') || '',
  };
  const graph = createGraphClient({
    getConfig: () => graphConfig,
    setConfig: (patch) => { graphConfig = { ...graphConfig, ...patch }; },
    onTokenRefreshed: async () => {},
    auditLog: { log: () => {} },
  });

  const files = process.argv.slice(2);
  for (const filePath of files) {
    const fileName = path.basename(filePath);
    const buf = fs.readFileSync(filePath);
    const target = `${FOLDER}/${fileName}`;
    const res = await graph.graphRequest(`/v1.0/me/drive/root:/${encodePathSegments(target)}:/content`, {
      method: 'PUT',
      body: buf,
      headers: { 'Content-Type': CT },
    });
    if (res.status === 200 || res.status === 201) {
      console.log(`OK  ${fileName}  ->  ${res.data.webUrl || '(no url)'}`);
    } else {
      console.log(`FAIL ${fileName}  status=${res.status}  ${JSON.stringify(res.data).slice(0, 300)}`);
    }
  }
}

main().catch(e => { console.error('ERROR', e); process.exit(1); });
