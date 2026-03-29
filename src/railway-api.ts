import { GraphQLClient } from "graphql-request";

const RAILWAY_API_URL = "https://backboard.railway.com/graphql/v2";

function getToken(): string {
  const token = process.env.RAILWAY_TOKEN;
  if (!token) {
    throw new Error("RAILWAY_TOKEN environment variable is not set");
  }
  return token;
}

function getClient(): GraphQLClient {
  return new GraphQLClient(RAILWAY_API_URL, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "x-source": "juniper-railway-mcp-server",
    },
  });
}

function getPublicClient(): GraphQLClient {
  return new GraphQLClient(RAILWAY_API_URL, {
    headers: {
      "x-source": "juniper-railway-mcp-server",
    },
  });
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
  id: string;
  email: string;
  name?: string;
  teams: Array<{ id: string; name: string }>;
}> {
  const client = getClient();
  const query = `
    query {
      me {
        id
        email
        name
        teams {
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

  const data = await client.request<{
    me: {
      id: string;
      email: string;
      name?: string;
      teams: { edges: Array<{ node: { id: string; name: string } }> };
    };
  }>(query);

  return {
    id: data.me.id,
    email: data.me.email,
    name: data.me.name,
    teams: data.me.teams.edges.map((e) => e.node),
  };
}
