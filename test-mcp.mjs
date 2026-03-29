// Full MCP test script
const BASE = 'https://railway-mcp-server-production-b5b5.up.railway.app/mcp';
const API_KEY = '21c5c217-bf10-4539-8b4a-296aab7a2ca9';

function parseSSE(text) {
  const results = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      results.push(JSON.parse(line.slice(6)));
    }
  }
  return results;
}

async function mcpCall(sessionId, id, method, params = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Authorization': `Bearer ${API_KEY}`,
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;

  const res = await fetch(BASE, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });

  const newSession = res.headers.get('mcp-session-id');
  const text = await res.text();
  const parsed = parseSSE(text);
  return { sessionId: newSession || sessionId, data: parsed[0] || JSON.parse(text) };
}

async function main() {
  // 1. Initialize
  let { sessionId, data } = await mcpCall(null, 1, 'initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' },
  });
  console.log('Session:', sessionId);
  console.log('Server:', data.result.serverInfo.name, data.result.serverInfo.version);

  // 2. Send initialized notification
  await mcpCall(sessionId, null, 'notifications/initialized', {});

  // 3. List tools
  const { data: toolsData } = await mcpCall(sessionId, 2, 'tools/list');
  const tools = toolsData.result?.tools || [];
  console.log(`\n${tools.length} tools registered:`);
  tools.forEach(t => console.log(`  - ${t.name}: ${t.description?.substring(0, 60)}...`));

  // 4. check-railway-status
  console.log('\n--- check-railway-status ---');
  const { data: statusData } = await mcpCall(sessionId, 3, 'tools/call', {
    name: 'check-railway-status',
    arguments: {},
  });
  console.log(statusData.result?.content?.[0]?.text);

  // 5. list-projects
  console.log('\n--- list-projects ---');
  const { data: projData } = await mcpCall(sessionId, 4, 'tools/call', {
    name: 'list-projects',
    arguments: {},
  });
  console.log(projData.result?.content?.[0]?.text);

  // 6. list-services
  console.log('\n--- list-services ---');
  const { data: svcData } = await mcpCall(sessionId, 5, 'tools/call', {
    name: 'list-services',
    arguments: { projectId: '7f42e961-233b-4f31-ac46-e5e9cdf80260' },
  });
  console.log(svcData.result?.content?.[0]?.text);

  // 7. list-environments
  console.log('\n--- list-environments ---');
  const { data: envData } = await mcpCall(sessionId, 6, 'tools/call', {
    name: 'list-environments',
    arguments: { projectId: '7f42e961-233b-4f31-ac46-e5e9cdf80260' },
  });
  console.log(envData.result?.content?.[0]?.text);
}

main().catch(console.error);
