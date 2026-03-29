// Deployment script for Railway MCP Server

const TOKEN = '09e842ac-1e09-49b3-9da6-79c0eba40a7f';
const PROJECT_ID = '7f42e961-233b-4f31-ac46-e5e9cdf80260';
const ENV_ID = '04b0c3ef-7f57-4a97-89d4-fe785c680b68';
const API = 'https://backboard.railway.com/graphql/v2';
const headers = { 'Content-Type': 'application/json', 'Project-Access-Token': TOKEN };

async function gql(query, variables) {
  const r = await fetch(API, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });
  const data = await r.json();
  if (data.errors) {
    console.error('GraphQL Error:', JSON.stringify(data.errors, null, 2));
    throw new Error(data.errors[0].message);
  }
  return data.data;
}

async function main() {
  // Step 1: Create service linked to GitHub repo
  console.log('Creating service...');
  const svc = await gql(
    `mutation($input: ServiceCreateInput!) { serviceCreate(input: $input) { id name } }`,
    { input: { projectId: PROJECT_ID, name: 'railway-mcp-server', source: { repo: 'aiminnovations/railway-mcp-server' } } }
  );
  const serviceId = svc.serviceCreate.id;
  console.log('Service created:', serviceId, svc.serviceCreate.name);

  // Step 2: Set environment variables
  console.log('Setting env vars...');
  await gql(
    `mutation($input: VariableCollectionUpsertInput!) { variableCollectionUpsert(input: $input) }`,
    {
      input: {
        projectId: PROJECT_ID,
        environmentId: ENV_ID,
        serviceId,
        variables: {
          RAILWAY_TOKEN: TOKEN,
          JUNIPER_API_KEY: '21c5c217-bf10-4539-8b4a-296aab7a2ca9',
          PORT: '3000',
        },
      },
    }
  );
  console.log('Variables set.');

  // Step 3: Generate railway.app domain
  console.log('Generating domain...');
  const dom = await gql(
    `mutation($input: ServiceDomainCreateInput!) { serviceDomainCreate(input: $input) { domain } }`,
    { input: { serviceId, environmentId: ENV_ID } }
  );
  console.log('Domain:', dom.serviceDomainCreate.domain);

  console.log('\nDeployment initiated! The service will build from GitHub automatically.');
  console.log('Service ID:', serviceId);
  console.log('Health check URL:', `https://${dom.serviceDomainCreate.domain}/health`);
  console.log('MCP URL:', `https://${dom.serviceDomainCreate.domain}/mcp`);
}

main().catch(console.error);
