# Zendesk MCP

MCP server for **Zendesk** — search tickets, users, knowledge base articles, get metrics, CSAT ratings, and manage views via Zendesk REST API v2.

## Tools

| Tool | Description |
|------|-------------|
| `search_tickets` | Search tickets using Zendesk query syntax |
| `get_ticket` | Get ticket details with optional comments |
| `search_users` | Search users by name, email, or role |
| `get_user` | Get user profile and organization |
| `list_organizations` | List all organizations |
| `get_ticket_metrics` | Get first reply time, resolution time, reopens |
| `search_articles` | Search Help Center knowledge base |
| `get_satisfaction_ratings` | Get CSAT ratings with comments |
| `list_views` | List saved ticket views/filters |
| `get_view_count` | Get ticket count for a view |

## Pricing

- **Free tier**: 10 calls/day — no signup required
- **Paid**: Unlimited API access via API key

## Setup

Your Zendesk instance credentials must be configured as environment variables:

```env
ZENDESK_SUBDOMAIN=your-company    # e.g. "acme" for acme.zendesk.com
ZENDESK_EMAIL=admin@acme.com       # Agent email
ZENDESK_API_TOKEN=your_token_here  # API token from Admin > Channels > API
```

## Quick Start

```json
{
  "mcpServers": {
    "zendesk": {
      "url": "https://YOUR_RAILWAY_URL/mcp",
      "headers": {
        "x-api-key": "your_api_key_here"
      }
    }
  }
}
```

## License

MIT
