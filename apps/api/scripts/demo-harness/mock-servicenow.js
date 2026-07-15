// Mock ServiceNow Table API — local demo harness (ADR-0008 outbound direct, 乙).
// Stands in for a real SN instance so the outbound create flow
// (POST /requests → DirectServiceNowProvider → ServiceNowService.createRecord)
// runs end-to-end WITHOUT touching a real ServiceNow. Returns
// {result:{sys_id, number}} for POST/PATCH on /api/now/table/{table}, and logs
// each call so you can see exactly what representative fields the provider sends
// (e.g. sc_req_item.cat_item currently = skuId GUID — a placeholder flagged in
// docs/05-usage/SERVICENOW-CONTRACT-ALIGNMENT.md §🅒).
//
// Run: node scripts/demo-harness/mock-servicenow.js   (or: npm run demo:mock-sn)
// Point the API at it:  SERVICENOW_INSTANCE_URL=http://localhost:8980
// Port override: MOCK_SN_PORT=8980
const http = require('http');

const PORT = Number(process.env.MOCK_SN_PORT ?? 8980);
let req = 12340;
let ritm = 45670;
const pad = (n) => String(n).padStart(7, '0');

const server = http.createServer((r, res) => {
  let body = '';
  r.on('data', (c) => (body += c));
  r.on('end', () => {
    const m = r.url.match(/\/api\/now\/table\/([^/?]+)(?:\/([^/?]+))?/);
    const table = m ? m[1] : '?';
    const sysIdInPath = m ? m[2] : undefined;
    let parsed = {};
    try {
      parsed = body ? JSON.parse(body) : {};
    } catch {
      parsed = { _raw: body };
    }
    console.log(
      `[mock-sn] ${r.method} ${r.url} table=${table}` +
        (sysIdInPath ? ` sysId=${sysIdInPath}` : '') +
        ` body=${JSON.stringify(parsed)}`,
    );

    let result;
    if (r.method === 'POST' && table === 'sc_request') {
      const n = ++req;
      result = { sys_id: `reqsys-${n}`, number: `REQ${pad(n)}` };
    } else if (r.method === 'POST' && table === 'sc_req_item') {
      const n = ++ritm;
      result = { sys_id: `ritmsys-${n}`, number: `RITM${pad(n)}` };
    } else if (r.method === 'PATCH') {
      // write-back (addWorkNote / updateRecord) — echo the record.
      result = { sys_id: sysIdInPath ?? 'unknown', ...parsed };
    } else if (r.method === 'GET') {
      result = { sys_id: sysIdInPath ?? 'unknown' };
    } else {
      result = { sys_id: `generic-${req}` };
    }
    res.writeHead(r.method === 'POST' ? 201 : 200, {
      'Content-Type': 'application/json',
    });
    res.end(JSON.stringify({ result }));
  });
});

server.listen(PORT, () =>
  console.log(`[mock-sn] listening on http://localhost:${PORT}`),
);
