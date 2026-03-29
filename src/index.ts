import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { allTools } from "./tools.js";

const PORT = parseInt(process.env.PORT || "3000", 10);
const API_KEY = process.env.JUNIPER_API_KEY;

const app = express();
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "juniper-railway-mcp-server", version: "1.0.1", tools: allTools.length });
});

// Auth middleware for MCP endpoint
function authenticate(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  if (!API_KEY) {
    // No key configured = no auth required (dev mode)
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: "Authorization header required" });
    return;
  }

  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (token !== API_KEY) {
    res.status(403).json({ error: "Invalid API key" });
    return;
  }

  next();
}

// Store active transports by session ID
const transports = new Map<string, StreamableHTTPServerTransport>();

// MCP Streamable HTTP endpoint
app.post("/mcp", authenticate, async (req, res) => {
  try {
    // Check for existing session
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // New session - create server + transport
    const server = new McpServer(
      {
        name: "juniper-railway-mcp-server",
        title: "Juniper Railway MCP Server",
        version: "1.0.0",
      },
      {
        capabilities: {
          logging: {},
        },
      }
    );

    // Register all tools
    for (const tool of allTools) {
      server.registerTool(
        tool.name,
        {
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
        },
        tool.handler as Parameters<typeof server.registerTool>[2]
      );
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (id) => {
        transports.set(id, transport);
      },
    });

    transport.onclose = () => {
      const sid = (transport as unknown as { sessionId?: string }).sessionId;
      if (sid) transports.delete(sid);
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// Handle GET for SSE stream (for session keepalive / server-sent events)
app.get("/mcp", authenticate, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: "Invalid or missing session ID" });
    return;
  }

  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, res);
});

// Handle DELETE for session cleanup
app.delete("/mcp", authenticate, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: "Invalid or missing session ID" });
    return;
  }

  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, res);
  transports.delete(sessionId);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Juniper Railway MCP Server listening on port ${PORT}`);
  console.log(`Health: http://0.0.0.0:${PORT}/health`);
  console.log(`MCP endpoint: http://0.0.0.0:${PORT}/mcp`);
  console.log(`Auth: ${API_KEY ? "enabled" : "disabled (no JUNIPER_API_KEY set)"}`);
});
