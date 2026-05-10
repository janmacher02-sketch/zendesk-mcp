import express, { Request, Response, NextFunction } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "./tools.js";

const app = express();
app.use(express.json());

// ─── Auth middleware (Unkey via REST — NO SDK) ────────────────────────────────

const UNKEY_ROOT_KEY = process.env.UNKEY_ROOT_KEY ?? "";
const UNKEY_API_ID = process.env.UNKEY_API_ID ?? "";

const freeCalls = new Map<string, { count: number; resetAt: number }>();
const FREE_LIMIT = 10;
const UPGRADE_URL = "https://buy.stripe.com/4gM3cw8Dz28qcAYdHJaEE00";

async function verifyKeyViaRest(apiKey: string): Promise<{ valid: boolean; remaining?: number; reset?: number }> {
  const res = await fetch("https://api.unkey.dev/v1/keys.verifyKey", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: apiKey, apiId: UNKEY_API_ID }),
  });
  if (!res.ok) return { valid: false };
  const data = await res.json() as any;
  return { valid: data.valid === true, remaining: data.remaining, reset: data.ratelimit?.reset };
}

async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"] ?? "";
  const apiKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : (req.headers["x-api-key"] as string ?? "");

  if (apiKey) {
    const result = await verifyKeyViaRest(apiKey);
    if (!result.valid) {
      res.status(401).json({ error: "Invalid API key.", message: `"Get a valid key at `" + UPGRADE_URL + `" (`$9/month, unlimited).`" });
      return;
    }
    if (result.remaining !== undefined && result.remaining <= 0) {
      res.status(429).json({ error: "Rate limit exceeded.", message: "Upgrade at " + UPGRADE_URL });
      return;
    }
    next();
    return;
  }

  const ip = (req.headers["x-forwarded-for"] as string ?? req.socket.remoteAddress ?? "unknown").split(",")[0].trim();
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const entry = freeCalls.get(ip);

  if (!entry || entry.resetAt < now) {
    freeCalls.set(ip, { count: 1, resetAt: now + dayMs });
    next();
    return;
  }
  if (entry.count >= FREE_LIMIT) {
    res.status(429).json({ error: `Free tier limit reached (${FREE_LIMIT} calls/day).`, message: "Unlimited for $9/month: " + UPGRADE_URL, upgrade: UPGRADE_URL });
    return;
  }
  entry.count++;
  next();
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get("/", (_req, res) => {
  res.json({ name: "zendesk-mcp", version: "1.0.0", status: "ok" });
});

app.post("/mcp", authMiddleware, async (req, res) => {
  const server = new McpServer({ name: "zendesk-mcp", version: "1.0.0" });
  registerTools(server);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`zendesk-mcp running on port ${PORT}`));
