import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// ─── Config ───────────────────────────────────────────────────────────────────

// Users provide their own Zendesk credentials via env vars or pass-through
const ZENDESK_SUBDOMAIN = process.env.ZENDESK_SUBDOMAIN ?? "";
const ZENDESK_EMAIL = process.env.ZENDESK_EMAIL ?? "";
const ZENDESK_API_TOKEN = process.env.ZENDESK_API_TOKEN ?? "";

function getZendeskAuth(): { baseUrl: string; headers: Record<string, string> } {
  if (!ZENDESK_SUBDOMAIN || !ZENDESK_EMAIL || !ZENDESK_API_TOKEN) {
    throw new Error("Missing Zendesk credentials. Set ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, and ZENDESK_API_TOKEN.");
  }
  const token = Buffer.from(`${ZENDESK_EMAIL}/token:${ZENDESK_API_TOKEN}`).toString("base64");
  return {
    baseUrl: `https://${ZENDESK_SUBDOMAIN}.zendesk.com`,
    headers: {
      "Authorization": `Basic ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
  };
}

async function zendeskFetch(path: string): Promise<{ ok: boolean; data: unknown; error?: string }> {
  try {
    const { baseUrl, headers } = getZendeskAuth();
    const res = await fetch(`${baseUrl}${path}`, { headers });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, data: null, error: `Zendesk API ${res.status}: ${text.slice(0, 500)}` };
    }
    return { ok: true, data: await res.json() };
  } catch (err) {
    return { ok: false, data: null, error: String(err) };
  }
}

function formatResult(result: { ok: boolean; data: unknown; error?: string }): { content: Array<{ type: "text"; text: string }> } {
  if (!result.ok) {
    return { content: [{ type: "text", text: `Error: ${result.error}` }] };
  }
  return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
}

// ─── Tool Registration ───────────────────────────────────────────────────────

export function registerTools(server: McpServer) {

  // Tool 1: Search tickets
  server.tool(
    "search_tickets",
    "Search Zendesk tickets by query string. Supports Zendesk search syntax (status:open, priority:high, assignee:name, tags:billing, etc.).",
    {
      query: z.string().describe("Zendesk search query, e.g. 'status:open priority:urgent' or 'type:ticket subject:billing'"),
      sortBy: z.enum(["created_at", "updated_at", "priority", "status"]).optional().describe("Sort field. Default: updated_at"),
      sortOrder: z.enum(["asc", "desc"]).optional().describe("Sort order. Default: desc"),
      page: z.number().optional().describe("Page number for pagination. Default: 1"),
    },
    async ({ query, sortBy, sortOrder, page }) => {
      const fullQuery = `type:ticket ${query}`;
      const params = new URLSearchParams({
        query: fullQuery,
        sort_by: sortBy ?? "updated_at",
        sort_order: sortOrder ?? "desc",
        page: String(page ?? 1),
      });
      const result = await zendeskFetch(`/api/v2/search.json?${params}`);
      return formatResult(result);
    }
  );

  // Tool 2: Get ticket by ID
  server.tool(
    "get_ticket",
    "Get a specific Zendesk ticket by its ID. Returns full ticket details including comments, tags, custom fields.",
    {
      ticketId: z.number().describe("Zendesk ticket ID"),
      includeComments: z.boolean().optional().describe("Include ticket comments/conversation. Default: false"),
    },
    async ({ ticketId, includeComments }) => {
      const result = await zendeskFetch(`/api/v2/tickets/${ticketId}.json`);
      if (!result.ok) return formatResult(result);

      if (includeComments) {
        const comments = await zendeskFetch(`/api/v2/tickets/${ticketId}/comments.json`);
        const combined = {
          ticket: result.data,
          comments: comments.ok ? comments.data : { error: comments.error },
        };
        return { content: [{ type: "text", text: JSON.stringify(combined, null, 2) }] };
      }
      return formatResult(result);
    }
  );

  // Tool 3: Search users
  server.tool(
    "search_users",
    "Search Zendesk users by name, email, or query. Returns user profiles with role, organization, tags.",
    {
      query: z.string().describe("Search query — name, email, or Zendesk search syntax (e.g. 'type:user role:admin')"),
    },
    async ({ query }) => {
      const fullQuery = `type:user ${query}`;
      const params = new URLSearchParams({ query: fullQuery });
      const result = await zendeskFetch(`/api/v2/search.json?${params}`);
      return formatResult(result);
    }
  );

  // Tool 4: Get user by ID
  server.tool(
    "get_user",
    "Get a specific Zendesk user by ID. Returns full profile, organization membership, and recent tickets.",
    {
      userId: z.number().describe("Zendesk user ID"),
    },
    async ({ userId }) => {
      const result = await zendeskFetch(`/api/v2/users/${userId}.json`);
      return formatResult(result);
    }
  );

  // Tool 5: List organizations
  server.tool(
    "list_organizations",
    "List Zendesk organizations. Returns organization names, domains, tags, and user counts.",
    {
      page: z.number().optional().describe("Page number. Default: 1"),
      perPage: z.number().optional().describe("Results per page (max 100). Default: 25"),
    },
    async ({ page, perPage }) => {
      const params = new URLSearchParams({
        page: String(page ?? 1),
        per_page: String(perPage ?? 25),
      });
      const result = await zendeskFetch(`/api/v2/organizations.json?${params}`);
      return formatResult(result);
    }
  );

  // Tool 6: Get ticket metrics
  server.tool(
    "get_ticket_metrics",
    "Get performance metrics for a specific ticket — first reply time, full resolution time, reopens, replies.",
    {
      ticketId: z.number().describe("Zendesk ticket ID"),
    },
    async ({ ticketId }) => {
      const result = await zendeskFetch(`/api/v2/tickets/${ticketId}/metrics.json`);
      return formatResult(result);
    }
  );

  // Tool 7: Search knowledge base articles
  server.tool(
    "search_articles",
    "Search Zendesk Help Center knowledge base articles. Returns matching articles with title, body excerpt, and URL.",
    {
      query: z.string().describe("Search query for articles"),
      locale: z.string().optional().describe("Locale filter, e.g. 'en-us', 'cs'. Default: en-us"),
    },
    async ({ query, locale }) => {
      const params = new URLSearchParams({
        query,
        "filter[locales]": locale ?? "en-us",
      });
      const result = await zendeskFetch(`/api/v2/help_center/articles/search.json?${params}`);
      return formatResult(result);
    }
  );

  // Tool 8: Get ticket satisfaction ratings
  server.tool(
    "get_satisfaction_ratings",
    "Get recent CSAT (customer satisfaction) ratings. Returns scores, comments, and associated tickets.",
    {
      score: z.enum(["good", "bad", "offered", "unoffered"]).optional().describe("Filter by score type"),
      page: z.number().optional().describe("Page number. Default: 1"),
    },
    async ({ score, page }) => {
      const params = new URLSearchParams({ page: String(page ?? 1) });
      if (score) params.set("score", score);
      const result = await zendeskFetch(`/api/v2/satisfaction_ratings.json?${params}`);
      return formatResult(result);
    }
  );

  // Tool 9: List views (saved ticket filters)
  server.tool(
    "list_views",
    "List all shared/personal Zendesk views (saved ticket filters). Returns view name, conditions, and ticket count.",
    {
      active: z.boolean().optional().describe("Only active views. Default: true"),
    },
    async ({ active }) => {
      const endpoint = (active ?? true) ? "/api/v2/views/active.json" : "/api/v2/views.json";
      const result = await zendeskFetch(endpoint);
      return formatResult(result);
    }
  );

  // Tool 10: Get view ticket count
  server.tool(
    "get_view_count",
    "Get the ticket count for a specific Zendesk view. Useful for quick dashboarding.",
    {
      viewId: z.number().describe("Zendesk view ID"),
    },
    async ({ viewId }) => {
      const result = await zendeskFetch(`/api/v2/views/${viewId}/count.json`);
      return formatResult(result);
    }
  );
}
