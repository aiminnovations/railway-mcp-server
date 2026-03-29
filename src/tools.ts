import { z } from "zod";
import * as api from "./railway-api.js";

type ToolResponse = { content: Array<{ type: "text"; text: string }> };
const text = (t: string): ToolResponse => ({ content: [{ type: "text", text: t }] });

// ── check-status ───────────────────────────────────────────────────

export const checkStatusTool = {
  name: "check-railway-status",
  title: "Check Railway API Status",
  description:
    "Verify that the Railway API connection is working and the token is valid. Returns account info.",
  inputSchema: {},
  handler: async (): Promise<ToolResponse> => {
    try {
      const me = await api.whoami();
      const teams = me.teams.map((t) => t.name).join(", ") || "none";
      return text(
        `Railway API Status: Connected\n\n` +
          `Account: ${me.email}\n` +
          `Name: ${me.name || "N/A"}\n` +
          `User ID: ${me.id}\n` +
          `Teams: ${teams}`
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return text(`Railway API Status: FAILED\n\nError: ${msg}`);
    }
  },
};

// ── list-projects ──────────────────────────────────────────────────

export const listProjectsTool = {
  name: "list-projects",
  title: "List Railway Projects",
  description: "List all Railway projects for the authenticated account.",
  inputSchema: {},
  handler: async (): Promise<ToolResponse> => {
    try {
      const projects = await api.listProjects();
      if (projects.length === 0) return text("No projects found.");

      const list = projects
        .map((p) => {
          const envs = p.environments.edges.map((e) => e.node.name).join(", ");
          const svcs = p.services.edges.map((e) => e.node.name).join(", ");
          return (
            `**${p.name}** (ID: ${p.id})\n` +
            `  Team: ${p.team?.name || "Personal"}\n` +
            `  Environments: ${envs || "none"}\n` +
            `  Services: ${svcs || "none"}\n` +
            `  Updated: ${new Date(p.updatedAt).toLocaleDateString()}`
          );
        })
        .join("\n\n");

      return text(`Found ${projects.length} project(s):\n\n${list}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return text(`Failed to list projects: ${msg}`);
    }
  },
};

// ── get-project ────────────────────────────────────────────────────

export const getProjectTool = {
  name: "get-project",
  title: "Get Railway Project Details",
  description: "Get detailed information about a specific Railway project by ID.",
  inputSchema: {
    projectId: z.string().describe("The Railway project ID"),
  },
  handler: async ({ projectId }: { projectId: string }): Promise<ToolResponse> => {
    try {
      const p = await api.getProject(projectId);
      const envs = p.environments.edges.map((e) => `  - ${e.node.name} (${e.node.id})`).join("\n");
      const svcs = p.services.edges.map((e) => `  - ${e.node.name} (${e.node.id})`).join("\n");

      return text(
        `**${p.name}** (${p.id})\n` +
          `Description: ${p.description || "N/A"}\n` +
          `Team: ${p.team?.name || "Personal"}\n` +
          `Created: ${new Date(p.createdAt).toLocaleDateString()}\n` +
          `Updated: ${new Date(p.updatedAt).toLocaleDateString()}\n\n` +
          `Environments:\n${envs || "  none"}\n\n` +
          `Services:\n${svcs || "  none"}`
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return text(`Failed to get project: ${msg}`);
    }
  },
};

// ── list-services ──────────────────────────────────────────────────

export const listServicesTool = {
  name: "list-services",
  title: "List Railway Services",
  description: "List all services in a Railway project.",
  inputSchema: {
    projectId: z.string().describe("The Railway project ID"),
  },
  handler: async ({ projectId }: { projectId: string }): Promise<ToolResponse> => {
    try {
      const services = await api.listServices(projectId);
      if (services.length === 0) return text("No services found in this project.");

      const list = services
        .map((s) => `- **${s.name}** (ID: ${s.id})`)
        .join("\n");

      return text(`Found ${services.length} service(s):\n\n${list}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return text(`Failed to list services: ${msg}`);
    }
  },
};

// ── list-environments ──────────────────────────────────────────────

export const listEnvironmentsTool = {
  name: "list-environments",
  title: "List Railway Environments",
  description: "List all environments in a Railway project.",
  inputSchema: {
    projectId: z.string().describe("The Railway project ID"),
  },
  handler: async ({ projectId }: { projectId: string }): Promise<ToolResponse> => {
    try {
      const envs = await api.listEnvironments(projectId);
      if (envs.length === 0) return text("No environments found.");

      const list = envs
        .map((e) => `- **${e.name}** (ID: ${e.id})`)
        .join("\n");

      return text(`Found ${envs.length} environment(s):\n\n${list}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return text(`Failed to list environments: ${msg}`);
    }
  },
};

// ── list-deployments ───────────────────────────────────────────────

export const listDeploymentsTool = {
  name: "list-deployments",
  title: "List Railway Deployments",
  description: "List deployments for a service in a project.",
  inputSchema: {
    projectId: z.string().describe("The Railway project ID"),
    serviceId: z.string().describe("The Railway service ID"),
    environmentId: z.string().optional().describe("Filter by environment ID"),
    limit: z.number().optional().describe("Max deployments to return (default 20)"),
  },
  handler: async ({
    projectId,
    serviceId,
    environmentId,
    limit,
  }: {
    projectId: string;
    serviceId: string;
    environmentId?: string;
    limit?: number;
  }): Promise<ToolResponse> => {
    try {
      const deployments = await api.listDeployments(projectId, serviceId, environmentId, limit);
      if (deployments.length === 0) return text("No deployments found.");

      const list = deployments
        .map(
          (d) =>
            `- **${d.status}** (ID: ${d.id})\n` +
            `  Created: ${new Date(d.createdAt).toLocaleString()}\n` +
            (d.staticUrl ? `  URL: ${d.staticUrl}\n` : "")
        )
        .join("\n");

      return text(`Found ${deployments.length} deployment(s):\n\n${list}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return text(`Failed to list deployments: ${msg}`);
    }
  },
};

// ── get-deployment-logs ────────────────────────────────────────────

export const getDeploymentLogsTool = {
  name: "get-deployment-logs",
  title: "Get Deployment Logs",
  description: "Get runtime logs for a specific deployment.",
  inputSchema: {
    deploymentId: z.string().describe("The deployment ID"),
    limit: z.number().optional().describe("Max log lines (default 500)"),
  },
  handler: async ({
    deploymentId,
    limit,
  }: {
    deploymentId: string;
    limit?: number;
  }): Promise<ToolResponse> => {
    try {
      const logs = await api.getDeploymentLogs(deploymentId, limit);
      if (logs.length === 0) return text("No deployment logs found.");

      const formatted = logs
        .map((l) => `[${l.timestamp}] ${l.severity || "INFO"}: ${l.message}`)
        .join("\n");

      return text(`Deployment logs (${logs.length} lines):\n\n${formatted}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return text(`Failed to get deployment logs: ${msg}`);
    }
  },
};

// ── get-build-logs ─────────────────────────────────────────────────

export const getBuildLogsTool = {
  name: "get-build-logs",
  title: "Get Build Logs",
  description: "Get build logs for a specific deployment.",
  inputSchema: {
    deploymentId: z.string().describe("The deployment ID"),
    limit: z.number().optional().describe("Max log lines (default 500)"),
  },
  handler: async ({
    deploymentId,
    limit,
  }: {
    deploymentId: string;
    limit?: number;
  }): Promise<ToolResponse> => {
    try {
      const logs = await api.getBuildLogs(deploymentId, limit);
      if (logs.length === 0) return text("No build logs found.");

      const formatted = logs
        .map((l) => `[${l.timestamp}] ${l.severity || "INFO"}: ${l.message}`)
        .join("\n");

      return text(`Build logs (${logs.length} lines):\n\n${formatted}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return text(`Failed to get build logs: ${msg}`);
    }
  },
};

// ── list-variables ─────────────────────────────────────────────────

export const listVariablesTool = {
  name: "list-variables",
  title: "List Railway Variables",
  description: "List environment variables for a service in a project environment.",
  inputSchema: {
    projectId: z.string().describe("The Railway project ID"),
    environmentId: z.string().describe("The environment ID"),
    serviceId: z.string().describe("The service ID"),
  },
  handler: async ({
    projectId,
    environmentId,
    serviceId,
  }: {
    projectId: string;
    environmentId: string;
    serviceId: string;
  }): Promise<ToolResponse> => {
    try {
      const vars = await api.getVariables(projectId, environmentId, serviceId);
      const keys = Object.keys(vars);
      if (keys.length === 0) return text("No variables found.");

      const list = keys
        .sort()
        .map((k) => `- **${k}** = ${vars[k]}`)
        .join("\n");

      return text(`Found ${keys.length} variable(s):\n\n${list}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return text(`Failed to list variables: ${msg}`);
    }
  },
};

// ── set-variables ──────────────────────────────────────────────────

export const setVariablesTool = {
  name: "set-variables",
  title: "Set Railway Variables",
  description: "Set environment variables for a service. Pass variables as key=value pairs.",
  inputSchema: {
    projectId: z.string().describe("The Railway project ID"),
    environmentId: z.string().describe("The environment ID"),
    serviceId: z.string().describe("The service ID"),
    variables: z
      .array(z.string())
      .describe("Array of 'KEY=VALUE' pairs to set"),
  },
  handler: async ({
    projectId,
    environmentId,
    serviceId,
    variables,
  }: {
    projectId: string;
    environmentId: string;
    serviceId: string;
    variables: string[];
  }): Promise<ToolResponse> => {
    try {
      const varsObj: Record<string, string> = {};
      for (const v of variables) {
        const idx = v.indexOf("=");
        if (idx === -1) return text(`Invalid variable format: "${v}". Use KEY=VALUE.`);
        varsObj[v.substring(0, idx)] = v.substring(idx + 1);
      }

      await api.upsertVariables(projectId, environmentId, serviceId, varsObj);
      return text(`Successfully set ${variables.length} variable(s).`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return text(`Failed to set variables: ${msg}`);
    }
  },
};

// ── create-project ─────────────────────────────────────────────────

export const createProjectTool = {
  name: "create-project",
  title: "Create Railway Project",
  description: "Create a new Railway project.",
  inputSchema: {
    name: z.string().describe("Name for the new project"),
    teamId: z.string().optional().describe("Team ID to create the project in"),
  },
  handler: async ({
    name,
    teamId,
  }: {
    name: string;
    teamId?: string;
  }): Promise<ToolResponse> => {
    try {
      const project = await api.createProject(name, teamId);
      return text(
        `Project created successfully:\n\n` +
          `**${project.name}** (ID: ${project.id})\n` +
          `Created: ${new Date(project.createdAt).toLocaleDateString()}`
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return text(`Failed to create project: ${msg}`);
    }
  },
};

// ── create-environment ─────────────────────────────────────────────

export const createEnvironmentTool = {
  name: "create-environment",
  title: "Create Railway Environment",
  description:
    "Create a new environment in a project. Optionally duplicate from an existing environment.",
  inputSchema: {
    projectId: z.string().describe("The Railway project ID"),
    name: z.string().describe("Name for the new environment"),
    sourceEnvironmentId: z
      .string()
      .optional()
      .describe("Environment ID to duplicate from"),
  },
  handler: async ({
    projectId,
    name,
    sourceEnvironmentId,
  }: {
    projectId: string;
    name: string;
    sourceEnvironmentId?: string;
  }): Promise<ToolResponse> => {
    try {
      const env = await api.createEnvironment(projectId, name, sourceEnvironmentId);
      return text(
        `Environment created:\n\n` +
          `**${env.name}** (ID: ${env.id})\n` +
          `Created: ${new Date(env.createdAt).toLocaleDateString()}`
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return text(`Failed to create environment: ${msg}`);
    }
  },
};

// ── generate-domain ────────────────────────────────────────────────

export const generateDomainTool = {
  name: "generate-domain",
  title: "Generate Railway Domain",
  description:
    "Generate a .railway.app domain for a service, or list existing domains.",
  inputSchema: {
    projectId: z.string().describe("The Railway project ID"),
    serviceId: z.string().describe("The service ID"),
    environmentId: z.string().describe("The environment ID"),
  },
  handler: async ({
    projectId,
    serviceId,
    environmentId,
  }: {
    projectId: string;
    serviceId: string;
    environmentId: string;
  }): Promise<ToolResponse> => {
    try {
      // First check if domains already exist
      const existing = await api.getServiceDomains(projectId, serviceId, environmentId);
      if (existing.length > 0) {
        return text(
          `Existing domains:\n\n${existing.map((d) => `- ${d}`).join("\n")}`
        );
      }

      // Generate a new one
      const domain = await api.generateServiceDomain(serviceId, environmentId);
      return text(`Domain generated: ${domain}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return text(`Failed to generate domain: ${msg}`);
    }
  },
};

// ── search-templates ───────────────────────────────────────────────

export const searchTemplatesTool = {
  name: "search-templates",
  title: "Search Railway Templates",
  description: "Search the Railway template library by name, description, or category.",
  inputSchema: {
    searchQuery: z
      .string()
      .optional()
      .describe("Search query to filter templates (leave empty for all)"),
  },
  handler: async ({
    searchQuery,
  }: {
    searchQuery?: string;
  }): Promise<ToolResponse> => {
    try {
      const { templates, filteredCount, totalCount } = await api.searchTemplates(searchQuery);
      if (templates.length === 0) {
        return text(`No templates found matching "${searchQuery}". Total available: ${totalCount}`);
      }

      const top = templates.slice(0, 20);
      const list = top
        .map(
          (t, i) =>
            `${i + 1}. **${t.name}** ${t.isVerified ? "(verified)" : ""}\n` +
            `   ID: ${t.id}\n` +
            `   ${t.description || "No description"}\n` +
            `   Category: ${t.category} | Active: ${t.activeProjects}`
        )
        .join("\n\n");

      return text(
        `Showing ${top.length} of ${filteredCount} matching templates (${totalCount} total):\n\n${list}`
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return text(`Failed to search templates: ${msg}`);
    }
  },
};

// ── deploy-template ────────────────────────────────────────────────

export const deployTemplateTool = {
  name: "deploy-template",
  title: "Deploy Railway Template",
  description: "Deploy a template to a Railway project and environment.",
  inputSchema: {
    templateId: z.string().describe("The template ID to deploy"),
    projectId: z.string().describe("The target project ID"),
    environmentId: z.string().describe("The target environment ID"),
    teamId: z.string().optional().describe("Team ID (optional)"),
  },
  handler: async ({
    templateId,
    projectId,
    environmentId,
    teamId,
  }: {
    templateId: string;
    projectId: string;
    environmentId: string;
    teamId?: string;
  }): Promise<ToolResponse> => {
    try {
      // First find the template to get its config
      const { templates } = await api.searchTemplates();
      const template = templates.find((t) => t.id === templateId);
      if (!template) {
        return text(`Template with ID "${templateId}" not found.`);
      }

      const result = await api.deployTemplate(
        templateId,
        projectId,
        environmentId,
        template.serializedConfig,
        teamId
      );

      return text(
        `Template deployed successfully:\n\n` +
          `Template: ${template.name}\n` +
          `Project ID: ${result.projectId}\n` +
          `Workflow ID: ${result.workflowId}`
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return text(`Failed to deploy template: ${msg}`);
    }
  },
};

// ── Export all tools ───────────────────────────────────────────────

export const allTools = [
  checkStatusTool,
  listProjectsTool,
  getProjectTool,
  listServicesTool,
  listEnvironmentsTool,
  listDeploymentsTool,
  getDeploymentLogsTool,
  getBuildLogsTool,
  listVariablesTool,
  setVariablesTool,
  createProjectTool,
  createEnvironmentTool,
  generateDomainTool,
  searchTemplatesTool,
  deployTemplateTool,
];
