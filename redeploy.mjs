// Quick redeploy: delete service and recreate from latest GitHub code
const TOKEN = '09e842ac-1e09-49b3-9da6-79c0eba40a7f';
const PROJECT_ID = '7f42e961-233b-4f31-ac46-e5e9cdf80260';
const ENV_ID = '04b0c3ef-7f57-4a97-89d4-fe785c680b68';
const API = 'https://backboard.railway.com/graphql/v2';
const headers = { 'Content-Type': 'application/json', 'Project-Access-Token': TOKEN };

async function gql(query, variables) {
  const r = await fetch(API, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
  const data = await r.json();
  if (data.errors && !data.data) throw new Error(data.errors[0].message);
  return data.data;
}

// Get current service ID
const project = await gql(
  `query($id: String!) { project(id: $id) { services { edges { node { id name } } } } }`,
  { id: PROJECT_ID }
);
const services = project.project.services.edges;

for (const svc of services) {
  if (svc.node.name === 'railway-mcp-server') {
    console.log('Deleting service:', svc.node.id);
    await gql(`mutation($id: String!) { serviceDelete(id: $id) }`, { id: svc.node.id });
    console.log('Deleted.');
  }
}

// Wait a moment
await new Promise(r => setTimeout(r, 2000));

// Recreate
console.log('Creating service...');
const svc = await gql(
  `mutation($input: ServiceCreateInput!) { serviceCreate(input: $input) { id name } }`,
  { input: { projectId: PROJECT_ID, name: 'railway-mcp-server', source: { repo: 'aiminnovations/railway-mcp-server' } } }
);
const serviceId = svc.serviceCreate.id;
console.log('Created:', serviceId);

// Set env vars
await gql(
  `mutation($input: VariableCollectionUpsertInput!) { variableCollectionUpsert(input: $input) }`,
  { input: { projectId: PROJECT_ID, environmentId: ENV_ID, serviceId, variables: {
    RAILWAY_TOKEN: TOKEN,
    JUNIPER_API_KEY: '21c5c217-bf10-4539-8b4a-296aab7a2ca9',
    PORT: '3000',
  }}}
);
console.log('Env vars set.');

// Generate domain
const dom = await gql(
  `mutation($input: ServiceDomainCreateInput!) { serviceDomainCreate(input: $input) { domain } }`,
  { input: { serviceId, environmentId: ENV_ID } }
);
console.log('Domain:', dom.serviceDomainCreate.domain);
console.log('Health:', `https://${dom.serviceDomainCreate.domain}/health`);
console.log('MCP:', `https://${dom.serviceDomainCreate.domain}/mcp`);
