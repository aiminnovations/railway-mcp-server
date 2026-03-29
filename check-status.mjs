const TOKEN = '09e842ac-1e09-49b3-9da6-79c0eba40a7f';
const PROJECT_ID = '7f42e961-233b-4f31-ac46-e5e9cdf80260';
const SERVICE_ID = 'b0aadbfa-466c-41a5-85d8-9cbcf318e501';
const API = 'https://backboard.railway.com/graphql/v2';
const headers = { 'Content-Type': 'application/json', 'Project-Access-Token': TOKEN };

const r = await fetch(API, {
  method: 'POST', headers,
  body: JSON.stringify({
    query: `query($input: DeploymentListInput!) {
      deployments(input: $input, first: 5) {
        edges { node { id status createdAt staticUrl } }
      }
    }`,
    variables: { input: { projectId: PROJECT_ID, serviceId: SERVICE_ID } }
  })
});
const data = await r.json();
console.log(JSON.stringify(data, null, 2));
