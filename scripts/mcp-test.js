// Minimal MCP SSE client to connect and print initial events
import EventSource from 'eventsource';

const URL = 'https://mcp.mercadolibre.com/mcp';
const TOKEN = process.env.MCP_TOKEN || 'APP_USR-8272938861648337-102118-7fbfced7ced742702a181aa1ea66f083-2083211186';

console.log('Connecting to MCP SSE...');
const es = new EventSource(URL, {
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    Accept: 'text/event-stream',
  },
});

const timeoutMs = 20000;
const timer = setTimeout(() => {
  console.log('No events received within timeout, closing.');
  es.close();
  process.exit(0);
}, timeoutMs);

es.onopen = () => {
  console.log('SSE open');
  // Send a JSON-RPC request to list tools (method name may vary by server)
  const reqId = `${Date.now()}`;
  const payload = {
    jsonrpc: '2.0',
    id: reqId,
    method: 'tools/list',
    params: {},
  };
  fetch(URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }).then(async (r) => {
    console.log('POST status:', r.status);
    const txt = await r.text().catch(() => '');
    if (txt) console.log('POST body:', txt);
  }).catch((e) => console.error('POST error:', e.message));
};

es.onerror = (err) => {
  console.error('SSE error', err);
};

es.onmessage = (msg) => {
  console.log('EVENT:', msg.data);
  // Try to parse JSON-RPC responses
  try {
    const data = JSON.parse(msg.data);
    if (data?.jsonrpc === '2.0') {
      console.log('JSON-RPC:', data);
    }
  } catch {}
};


