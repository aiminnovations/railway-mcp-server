import { GraphQLClient } from "graphql-request";

const RAILWAY_API_URL = "https://backboard.railway.com/graphql/v2";

// Railway supports two token types:
// - Account/Workspace tokens: Authorization: Bearer <token>
// - Project tokens: Project-Access-Token: <token>
// We support both. Project tokens are scoped to a single project+environment.

type TokenConfig = {
  token: string;
  type: "account" | "project";
};

function getTokenConfig(): TokenConfig {
  // RAILWAY_ACCOUNT_TOKEN for account-level access
  const accountToken = process.env.RAILWAY_ACCOUNT_TOKEN;
  if (accountToken) {
    return { token: accountToken, type: "account" };
  }

  // RAILWAY_TOKEN as project token (default for Railway deployments)
  const projectToken = process.env.RAILWAY_TOKEN;
  if (projectToken) {
    return { token: projectToken, type: "project" };
  }

  throw new Error(
    "No Railway token found. Set RAILWAY_ACCOUNT_TOKEN (account-level) or RAILWAY_TOKEN (project-scoped)."
  );
}

function getClient(): GraphQLClient {
  const config = getTokenConfig();
  const headers: Record<string, string> = {
    "x-source": "juniper-railway-mcp-server",
  };

  if (config.type === "account") {
    headers["Authorization"] = `Bearer ${config.token}`;
  } else {
    headers["Project-Access-Token"] = config.token;
  }

  return new GraphQLClient(RAILWAY_API_URL, { headers });
}

function getPublicClient(): GraphQLClient {
  return new GraphQLClient(RAILWAY_API_URL, {
    headers: {
      "x-source": "juniper-railway-mcp-server",
    },
  });
}

// Get project/environment IDs from the project token itself
export async function getProjectTokenInfo(): Promise<{
  projectId: string;
  environmentId: string;
} | null> {
  const config = getTokenConfig();
  if (config.type !== "project") return null;

  const client = getClient();
  const query = `query { projectToken { projectId environmentId } }`;
  const data = await client.request<{
    projectToken: { projectId: string; environmentId: string };
  }>(query);
  return data.projectToken;
}

// ── Types ──────────────────────────────────────────────────────────

export type Project = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  team?: { id: string; name: string } | null;
  environments: { edges: Array<{ node: { id: string; name: string } }> };
  services: { edges: Array<{ node: { id: string; name: string } }> };
};

export type Service = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type Environment = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type Deployment = {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  staticUrl?: string;
  meta?: Record<string, unknown>;
};

export type Variable = {
  name: string;
  value: string;
};

export type DeploymentLog = {
  message: string;
  timestamp: string;
  severity?: string;
};

// ── Queries ────────────────────────────────────────────────────────

export async function listProjects(): Promise<Project[]> {
  const config = getTokenConfig();

  if (config.type === "project") {
    // Project tokens can only access their own project
    const tokenInfo = await getProjectTokenInfo();
    if (!tokenInfo) throw new Error("Failed to get project token info");
    const project = await getProject(tokenInfo.projectId);
    return [project];
  }

  // Account token - can list all projects
  const client = getClient();
  const query = `
    query {
      me {
        projects {
          edges {
            node {
              id
              name
              description
              createdAt
              updatedAt
              team {
                id
                name
              }
              environments {
                edges {
                  node {
                    id
                    name
                  }
                }
              }
              services {
                edges {
                  node {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await client.request<{
    me: { projects: { edges: Array<{ node: Project }> } };
  }>(query);

  return data.me.projects.edges.map((e) => e.node);
}

export async function getProject(projectId: string): Promise<Project> {
  const client = getClient();
  const query = `
    query($projectId: String!) {
      project(id: $projectId) {
        id
        name
        description
        createdAt
        updatedAt
        team {
          id
          name
        }
        environments {
          edges {
            node {
              id
              name
            }
          }
        }
        services {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    }
  `;

  const data = await client.request<{ project: Project }>(query, { projectId });
  return data.project;
}

export async function listServices(projectId: string): Promise<Service[]> {
  const client = getClient();
  const query = `
    query($projectId: String!) {
      project(id: $projectId) {
        services {
          edges {
            node {
              id
              name
              createdAt
              updatedAt
            }
          }
        }
      }
    }
  `;

  const data = await client.request<{
    project: { services: { edges: Array<{ node: Service }> } };
  }>(query, { projectId });

  return data.project.services.edges.map((e) => e.node);
}

export async function listEnvironments(projectId: string): Promise<Environment[]> {
  const client = getClient();
  const query = `
    query($projectId: String!) {
      project(id: $projectId) {
        environments {
          edges {
            node {
              id
              name
              createdAt
              updatedAt
            }
          }
        }
      }
    }
  `;

  const data = await client.request<{
    project: { environments: { edges: Array<{ node: Environment }> } };
  }>(query, { projectId });

  return data.project.environments.edges.map((e) => e.node);
}

export async function listDeployments(
  projectId: string,
  serviceId: string,
  environmentId?: string,
  limit = 20
): Promise<Deployment[]> {
  const client = getClient();
  const query = `
    query($input: DeploymentListInput!) {
      deployments(input: $input) {
        edges {
          node {
            id
            status
            createdAt
            updatedAt
            staticUrl
            meta
          }
        }
      }
    }
  `;

  const input: Record<string, unknown> = {
    projectId,
    serviceId,
  };
  if (environmentId) {
    input.environmentId = environmentId;
  }

  const data = await client.request<{
    deployments: { edges: Array<{ node: Deployment }> };
  }>(query, { input });

  return data.deployments.edges.map((e) => e.node).slice(0, limit);
}

export async function getDeploymentLogs(
  deploymentId: string,
  limit = 500
): Promise<DeploymentLog[]> {
  const client = getClient();
  const query = `
    query($deploymentId: String!, $limit: Int) {
      deploymentLogs(deploymentId: $deploymentId, limit: $limit) {
        message
        timestamp
        severity
      }
    }
  `;

  const data = await client.request<{
    deploymentLogs: DeploymentLog[];
  }>(query, { deploymentId, limit });

  return data.deploymentLogs;
}

export async function getBuildLogs(
  deploymentId: string,
  limit = 500
): Promise<DeploymentLog[]> {
  const client = getClient();
  const query = `
    query($deploymentId: String!, $limit: Int) {
      buildLogs(deploymentId: $deploymentId, limit: $limit) {
        message
        timestamp
        severity
      }
    }
  `;

  const data = await client.request<{
    buildLogs: DeploymentLog[];
  }>(query, { deploymentId, limit });

  return data.buildLogs;
}

export async function getVariables(
  projectId: string,
  environmentId: string,
  serviceId: string
): Promise<Record<string, string>> {
  const client = getClient();
  const query = `
    query($projectId: String!, $environmentId: String!, $serviceId: String!) {
      variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
    }
  `;

  const data = await client.request<{
    variables: Record<string, string>;
  }>(query, { projectId, environmentId, serviceId });

  return data.variables;
}

export async function upsertVariables(
  projectId: string,
  environmentId: string,
  serviceId: string,
  variables: Record<string, string>
): Promise<boolean> {
  const client = getClient();
  const query = `
    mutation($input: VariableCollectionUpsertInput!) {
      variableCollectionUpsert(input: $input)
    }
  `;

  await client.request(query, {
    input: {
      projectId,
      environmentId,
      serviceId,
      variables,
    },
  });

  return true;
}

export async function createProject(name: string, teamId?: string): Promise<Project> {
  const client = getClient();
  const query = `
    mutation($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        id
        name
        description
        createdAt
        updatedAt
        environments {
          edges {
            node {
              id
              name
            }
          }
        }
        services {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    }
  `;

  const input: Record<string, unknown> = { name };
  if (teamId) input.teamId = teamId;

  const data = await client.request<{ projectCreate: Project }>(query, { input });
  return data.projectCreate;
}

export async function createEnvironment(
  projectId: string,
  name: string,
  sourceEnvironmentId?: string
): Promise<Environment> {
  const client = getClient();
  const query = `
    mutation($input: EnvironmentCreateInput!) {
      environmentCreate(input: $input) {
        id
        name
        createdAt
        updatedAt
      }
    }
  `;

  const input: Record<string, unknown> = { projectId, name };
  if (sourceEnvironmentId) {
    input.sourceEnvironmentId = sourceEnvironmentId;
  }

  const data = await client.request<{ environmentCreate: Environment }>(query, { input });
  return data.environmentCreate;
}

export async function generateServiceDomain(
  serviceId: string,
  environmentId: string
): Promise<string> {
  const client = getClient();
  const query = `
    mutation($input: ServiceDomainCreateInput!) {
      serviceDomainCreate(input: $input) {
        domain
      }
    }
  `;

  const data = await client.request<{
    serviceDomainCreate: { domain: string };
  }>(query, {
    input: { serviceId, environmentId },
  });

  return data.serviceDomainCreate.domain;
}

export async function getServiceDomains(
  projectId: string,
  serviceId: string,
  environmentId: string
): Promise<string[]> {
  const client = getClient();
  const query = `
    query($projectId: String!, $serviceId: String!, $environmentId: String!) {
      allDomains(projectId: $projectId, serviceId: $serviceId, environmentId: $environmentId) {
        serviceDomains {
          domain
        }
        customDomains {
          domain
        }
      }
    }
  `;

  const data = await client.request<{
    allDomains: {
      serviceDomains: Array<{ domain: string }>;
      customDomains: Array<{ domain: string }>;
    };
  }>(query, { projectId, serviceId, environmentId });

  const serviceDomains = data.allDomains.serviceDomains.map((d) => d.domain);
  const customDomains = data.allDomains.customDomains.map((d) => d.domain);
  return [...customDomains, ...serviceDomains];
}

// ── Service operations ─────────────────────────────────────────────

export async function createService(
  projectId: string,
  name: string,
  source?: { repo?: string; image?: string }
): Promise<Service> {
  const client = getClient();
  const query = `
    mutation($input: ServiceCreateInput!) {
      serviceCreate(input: $input) {
        id
        name
        createdAt
        updatedAt
      }
    }
  `;

  const input: Record<string, unknown> = { projectId, name };
  if (source) input.source = source;

  const data = await client.request<{ serviceCreate: Service }>(query, { input });
  return data.serviceCreate;
}

export async function connectServiceToRepo(
  serviceId: string,
  repo: string,
  branch?: string
): Promise<void> {
  const client = getClient();
  const query = `
    mutation($id: String!, $input: ServiceConnectInput!) {
      serviceConnect(id: $id, input: $input) {
        id
      }
    }
  `;

  const input: Record<string, string> = { repo };
  if (branch) input.branch = branch;

  await client.request(query, { id: serviceId, input });
}

export async function updateServiceInstance(
  serviceId: string,
  environmentId: string,
  config: {
    startCommand?: string;
    buildCommand?: string;
    rootDirectory?: string;
    healthcheckPath?: string;
    numReplicas?: number;
    sleepApplication?: boolean;
    dockerfilePath?: string;
    region?: string;
  }
): Promise<boolean> {
  const client = getClient();
  const query = `
    mutation($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
      serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
    }
  `;

  await client.request(query, { serviceId, environmentId, input: config });
  return true;
}

export async function triggerDeploy(
  serviceId: string,
  environmentId: string
): Promise<boolean> {
  const client = getClient();
  const query = `
    mutation($serviceId: String!, $environmentId: String!) {
      serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
    }
  `;

  await client.request(query, { serviceId, environmentId });
  return true;
}

export async function createCustomDomain(
  projectId: string,
  environmentId: string,
  serviceId: string,
  domain: string
): Promise<{
  id: string;
  dnsRecords: Array<{ hostlabel: string; requiredValue: string }>;
}> {
  const client = getClient();
  const query = `
    mutation($input: CustomDomainCreateInput!) {
      customDomainCreate(input: $input) {
        id
        status {
          dnsRecords {
            hostlabel
            requiredValue
          }
        }
      }
    }
  `;

  const data = await client.request<{
    customDomainCreate: {
      id: string;
      status: { dnsRecords: Array<{ hostlabel: string; requiredValue: string }> };
    };
  }>(query, { input: { projectId, environmentId, serviceId, domain } });

  return {
    id: data.customDomainCreate.id,
    dnsRecords: data.customDomainCreate.status.dnsRecords,
  };
}

// ── Template operations (public API) ───────────────────────────────

export type Template = {
  id: string;
  name: string;
  description: string;
  category: string;
  serializedConfig: Record<string, unknown>;
  activeProjects: number;
  health: number;
  totalPayout: number;
  isVerified: boolean;
};

export async function searchTemplates(searchQuery?: string): Promise<{
  templates: Template[];
  filteredCount: number;
  totalCount: number;
}> {
  const { default: Fuse } = await import("fuse.js");
  const client = getPublicClient();

  const query = `
    query {
      templates {
        edges {
          node {
            id
            name
            description
            category
            serializedConfig
            activeProjects
            health
            totalPayout
            isVerified
          }
        }
      }
    }
  `;

  const data = await client.request<{
    templates: { edges: Array<{ node: Template }> };
  }>(query);

  const templates = data.templates.edges.map((e) => e.node);
  const totalCount = templates.length;

  // Sort: verified first, then by payout, activeProjects, health
  templates.sort((a, b) => {
    if (a.isVerified !== b.isVerified) return a.isVerified ? -1 : 1;
    if (a.totalPayout !== b.totalPayout) return (b.totalPayout || 0) - (a.totalPayout || 0);
    if (a.activeProjects !== b.activeProjects) return (b.activeProjects || 0) - (a.activeProjects || 0);
    return (b.health || 0) - (a.health || 0);
  });

  if (!searchQuery?.trim()) {
    return { templates, filteredCount: totalCount, totalCount };
  }

  const fuse = new Fuse(templates, {
    keys: ["name", "description", "category"],
    threshold: 0.3,
  });
  const filtered = fuse.search(searchQuery.trim()).map((r) => r.item);

  return { templates: filtered, filteredCount: filtered.length, totalCount };
}

export async function deployTemplate(
  templateId: string,
  projectId: string,
  environmentId: string,
  serializedConfig: Record<string, unknown>,
  teamId?: string
): Promise<{ projectId: string; workflowId: string }> {
  const client = getClient();
  const query = `
    mutation deployTemplate($environmentId: String, $projectId: String, $templateId: String!, $teamId: String, $serializedConfig: SerializedTemplateConfig!) {
      templateDeployV2(input: {
        environmentId: $environmentId,
        projectId: $projectId,
        templateId: $templateId,
        teamId: $teamId,
        serializedConfig: $serializedConfig
      }) {
        projectId
        workflowId
      }
    }
  `;

  const data = await client.request<{
    templateDeployV2: { projectId: string; workflowId: string };
  }>(query, { environmentId, projectId, templateId, teamId, serializedConfig });

  return data.templateDeployV2;
}

// ── Account Info ───────────────────────────────────────────────────

export async function whoami(): Promise<{
  tokenType: "account" | "project";
  id?: string;
  email?: string;
  name?: string;
  projectId?: string;
  environmentId?: string;
  projectName?: string;
}> {
  const config = getTokenConfig();

  if (config.type === "project") {
    const tokenInfo = await getProjectTokenInfo();
    if (!tokenInfo) throw new Error("Failed to get project token info");

    // Get project name
    const project = await getProject(tokenInfo.projectId);

    return {
      tokenType: "project",
      projectId: tokenInfo.projectId,
      environmentId: tokenInfo.environmentId,
      projectName: project.name,
    };
  }

  // Account token
  const client = getClient();
  const query = `query { me { id email name } }`;
  const data = await client.request<{
    me: { id: string; email: string; name?: string };
  }>(query);

  return {
    tokenType: "account",
    id: data.me.id,
    email: data.me.email,
    name: data.me.name,
  };
}
