// Mock n8n outbound webhook — local demo harness (ADR-0008 outbound n8n, 丙).
// Stands in for the real n8n "create license request" workflow. Receives the
// platform POST (X-N8n-Key + payload), pretends n8n created sc_request (REQ) +
// one sc_req_item (RITM) per line, and SYNCHRONOUSLY responds with their ids
// (CONTRACT-OUTBOUND Fork 2). Echoes each line's skuId in the SAME order so
// N8nWorkflowProvider's validation (line count + skuId + sysId) passes.
//
// Run: node scripts/demo-harness/mock-n8n.js   (or: npm run demo:mock-n8n)
// Point the API at it:
//   REQUEST_SUBMISSION_PROVIDER=n8n
//   N8N_OUTBOUND_WEBHOOK_URL=http://localhost:8990/webhook/create-license-request
//   N8N_OUTBOUND_WEBHOOK_KEY=<any>   (this mock does not enforce it; it only logs)
// Port override: MOCK_N8N_PORT=8990
const http = require('http');

const PORT = Number(process.env.MOCK_N8N_PORT ?? 8990);
let req = 77770;
let ritm = 88880;
const pad = (n) => String(n).padStart(7, '0');

const server = http.createServer((r, res) => {
  let body = '';
  r.on('data', (c) => (body += c));
  r.on('end', () => {
    let p = {};
    try {
      p = body ? JSON.parse(body) : {};
    } catch {
      p = {};
    }
    console.log(
      `[mock-n8n] ${r.method} ${r.url} X-N8n-Key=${r.headers['x-n8n-key']} ` +
        `payload=${JSON.stringify(p)}`,
    );

    const n = ++req;
    const lineItems = (p.lineItems ?? []).map((l) => {
      const m = ++ritm;
      // echo the same skuId + order → provider validation passes
      return { skuId: l.skuId, sysId: `n8n-ritm-${m}`, number: `RITM${pad(m)}` };
    });
    const result = {
      request: { sysId: `n8n-req-${n}`, number: `REQ${pad(n)}` },
      lineItems,
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  });
});

server.listen(PORT, () =>
  console.log(
    `[mock-n8n] listening on http://localhost:${PORT}/webhook/create-license-request`,
  ),
);
