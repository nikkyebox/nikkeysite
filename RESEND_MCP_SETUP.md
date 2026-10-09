# Resend MCP Setup

## What is Resend MCP?

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets an AI agent call the Resend API directly (API keys, domains, webhooks, contacts) instead of you doing it by hand in the dashboard. This is a per-developer Claude Code CLI setting, not part of the NikkeyBox codebase — nothing in this repo registers or depends on it.

For the API key, webhook endpoint and environment variables this project actually uses, see [RESEND_SETUP.md](./RESEND_SETUP.md). This doc only covers connecting the MCP server.

## Connect the MCP Server

### Option 1: OAuth (recommended)

```bash
claude mcp add --transport http resend https://mcp.resend.com/mcp
```

Your browser opens to log in to Resend; no API key goes into the MCP config.

### Option 2: API Key (headless/CI)

```bash
claude mcp add --transport http resend \
  https://mcp.resend.com/mcp \
  --header "Authorization: Bearer re_your_api_key_here"
```

Use a Resend API key from https://resend.com/api-keys (see RESEND_SETUP.md for how this project creates and stores one).

## Using It

Once connected, you can ask Claude to perform Resend actions (list domains, check webhook status, inspect bounce reports) through natural language instead of the dashboard. Actions that change production — creating a new API key, registering a webhook, verifying a domain — still need your explicit approval; MCP access does not change that.

## Resources

- MCP docs: https://resend.com/mcp
- Resend API keys: https://resend.com/api-keys
