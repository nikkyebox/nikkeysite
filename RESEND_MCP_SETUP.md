# Resend MCP Setup - Automated Configuration

## What is Resend MCP?

**MCP (Model Context Protocol)** = AI agents can control Resend directly via:
- Create/send emails
- Manage domains
- Setup webhooks
- Track events
- All via natural language

## Quick Setup (Choose One)

### Option 1: OAuth (Recommended for Web Clients)

```bash
# 1. Your browser opens → log in to Resend
# 2. MCP gets automatic OAuth access to your account
# 3. No API key needed in config
```

### Option 2: API Key (For Headless/CI)

```bash
# Add to your MCP config:
claude mcp add --transport http resend \
  https://mcp.resend.com/mcp \
  --header "Authorization: Bearer re_your_api_key_here"
```

## What Can MCP Automate?

```
✅ Create API keys
✅ Verify domains (nikkeybox.jp)
✅ Create webhooks
✅ Send test emails
✅ Manage contacts
✅ Setup broadcasts
✅ Read bounce reports
✅ Configure DKIM/SPF
```

## Configuration Steps

### 1. Verify Your Domain (nikkeybox.jp)

```json
{
  "action": "create_domain",
  "domain": "nikkeybox.jp"
}
```

Output:
```json
{
  "domain_id": "abc123",
  "status": "pending_verification",
  "records": [
    {
      "type": "TXT",
      "name": "nikkeybox.jp",
      "value": "v=spf1 include:sendingdomain.resend.dev ~all"
    },
    {
      "type": "CNAME",
      "name": "bounce._domainkey.nikkeybox.jp",
      "value": "bounce.sendingdomain.resend.dev"
    }
  ]
}
```

**Action**: Add these DNS records in your domain registrar's control panel.

### 2. Create API Key (Sending Only)

```json
{
  "action": "create_api_key",
  "name": "nikkeybox-production",
  "permissions": ["sending"]
}
```

Output: `re_xxxxxxxxx` → Save to Vercel environment!

### 3. Setup Webhook

```json
{
  "action": "create_webhook",
  "url": "https://nikkeybox.jp/api/webhook-resend",
  "events": [
    "email.sent",
    "email.delivered",
    "email.bounced",
    "email.opened",
    "email.clicked"
  ]
}
```

Output: `whsec_xxxxxxxxx` → Save to Vercel!

### 4. Send Test Email

```json
{
  "action": "send_email",
  "from": "contato@nikkeybox.jp",
  "to": "seu_email_teste@gmail.com",
  "subject": "Test Email from NikkeyBox",
  "html": "<h1>Resend + NikkeyBox Integration Works!</h1>"
}
```

## Using with Claude Code (This Session)

You can ask Claude to:
- "Setup Resend domain for nikkeybox.jp"
- "Create webhook for email events"
- "Send test email to verify setup"
- "List all email events sent this month"

Claude will use MCP to execute these automatically!

## Environment Variables Required

```bash
RESEND_API_KEY=re_xxxxxxxx              # From MCP create_api_key
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxx    # From MCP create_webhook
RESEND_FROM_EMAIL=contato@nikkeybox.jp
```

## Webhook Event Workflow

```
Email Sent → Resend
    ↓
Email Delivered/Bounced → Webhook triggers
    ↓
/api/webhook-resend receives event
    ↓
Log status, update DB
    ↓
Return HTTP 200 (fast)
```

## Testing Locally with Resend CLI

```bash
# Install Resend CLI
npm install -g resend-cli

# Listen for webhooks locally
resend webhooks listen

# Output:
# ✅ Webhook tunnel started on https://abc123.ngrok.io
# (Register this URL in Resend dashboard)

# Send test email
resend send \
  --from "contato@nikkeybox.jp" \
  --to "seu_email@gmail.com" \
  --subject "Test"
```

## Next Steps

1. ✅ API key already created (saved in Vercel)
2. ✅ Webhook handler created (`/api/webhook-resend`)
3. ⏳ Domain verification (add DNS records)
4. ⏳ Test email flow end-to-end

## Resources

- MCP Docs: https://resend.com/mcp
- Domain Verification: https://resend.com/docs/domains
- Webhook Events: https://resend.com/docs/webhooks
- Resend CLI: https://resend.com/blog/resend-cli-2

---

**To request automated setup, tell Claude:**
> "Use Resend MCP to verify nikkeybox.jp domain and setup email webhook"
