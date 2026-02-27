# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference

| Item | Value |
|------|-------|
| **URL** | https://moltbot-sandbox.ancient-glitter-9ac9.workers.dev |
| **Admin** | https://moltbot-sandbox.ancient-glitter-9ac9.workers.dev/_admin/ |
| **Debug** | https://moltbot-sandbox.ancient-glitter-9ac9.workers.dev/debug/logs |
| **Cloudflare Account** | Yeo UX (`7865043d9ae730882b77f3d5d670c158`) |
| **Upstream** | https://github.com/cloudflare/moltworker |
| **Telegram Bot** | @dangusClawdBot (token in `wrangler.jsonc` vars) |

## Build & Development Commands

```bash
npm run build          # Vite build (React admin UI → dist/client/)
npm run deploy         # Build + wrangler deploy
npm run start          # wrangler dev (local Worker - WebSocket won't work, HTTP only)
npm run dev            # Vite dev server (admin UI only)
npm run typecheck      # tsc --noEmit
npm run types          # wrangler types (regenerate Cloudflare bindings)
npm test               # vitest run
npm run test:watch     # vitest watch mode
npm run test:coverage  # vitest with coverage
```

### Running a Single Test File

```bash
npx vitest run src/auth/jwt.test.ts
npx vitest run src/gateway/env.test.ts
```

### Local Development

Create a `.dev.vars` file (gitignored) with overrides for `wrangler dev`:
```
DEV_MODE=true               # Skip CF Access auth + device pairing
DEBUG_ROUTES=true            # Enable /debug endpoints
```

### Deploying

```bash
npm run deploy                        # Standard deploy
npx wrangler tail moltbot-sandbox --format pretty  # View live logs after deploy
```

When changing `start-moltbot.sh`, `moltbot.json.template`, or `skills/`, bump the cache bust comment in `Dockerfile` to force a container rebuild:
```dockerfile
# Build cache bust: 2026-02-27-v27-hypertask-skill  ← increment this
```

**Important**: Docker layer caching is aggressive — even after changing files, you may need to clear the build cache:
```bash
docker builder prune -af && docker rmi $(docker images -q "moltbot-sandbox*") 2>/dev/null
npm run deploy
```

**After deploy**: The container keeps running with the old gateway process. To pick up new env vars, you must kill the gateway and let `ensureMoltbotGateway` restart it. Use the debug endpoint or redeploy with a Dockerfile change.

## Architecture

**Cloudflare Worker (Hono)** → proxies HTTP/WebSocket to → **Sandbox Container** running **Moltbot gateway on port 18789**.

```
Browser → Zero Trust Auth → Cloudflare Worker (src/index.ts)
                               ├── /_admin/*  → React SPA (src/client/)
                               ├── /api/*     → Admin API (src/routes/api.ts)
                               ├── /cdp/*     → Chrome DevTools Protocol shim (src/routes/cdp.ts)
                               ├── /debug/*   → Debug endpoints (src/routes/debug.ts)
                               ├── /public    → /sandbox-health, /api/status, /api/env-check (no auth)
                               └── /*         → Proxy to Moltbot gateway in sandbox container
```

### Key Components

- **`src/index.ts`** — Main Hono app. Middleware chain: logging → sandbox init → public routes → CDP → env validation → CF Access auth → API → admin UI → debug → token cookie persistence → catch-all proxy. The proxy handles both HTTP and WebSocket (with error message transformation). Includes cookie middleware that saves `?token=` to a 1-year HttpOnly cookie so users don't need to re-enter it.

- **`src/config.ts`** — Central constants: `MOLTBOT_PORT` (18789), `STARTUP_TIMEOUT_MS` (180s), `R2_MOUNT_PATH` (`/data/moltbot`), `R2_BUCKET_NAME` (`moltbot-data`).

- **`src/gateway/`** — Manages the Moltbot gateway lifecycle inside the sandbox container:
  - `process.ts` — Find/start/kill gateway process. Port 18789, 180s startup timeout.
  - `env.ts` — Builds environment variables passed to the container from `MoltbotEnv`.
  - `r2.ts` — Mounts R2 bucket via s3fs at `/data/moltbot`.
  - `sync.ts` — Cron-triggered rsync backup to R2 every 5 minutes.

- **`src/auth/`** — Cloudflare Access JWT verification. `DEV_MODE=true` bypasses auth entirely.

- **`src/routes/`** — Route handlers:
  - `api.ts` — Runs CLI commands in the container (e.g., `clawdbot devices list --json`). CLI commands take 10-15s due to WebSocket overhead.
  - `admin-ui.ts` — Serves the React SPA from the ASSETS binding at `/_admin/`.
  - `debug.ts` — Debug endpoints for container inspection (requires `DEBUG_ROUTES=true`). Includes: `/debug/logs`, `/debug/processes`, `/debug/container-config`, `/debug/cli`, `/debug/env`, `/debug/ws-test`.
  - `public.ts` — Unauthenticated routes (health checks, env check, status).

- **`src/client/`** — React admin UI built with Vite, served from `dist/client/` via ASSETS binding.

- **`src/routes/cdp.ts`** — CDP (Chrome DevTools Protocol) WebSocket shim. Translates CDP commands to Cloudflare Browser Rendering Puppeteer calls. Authenticated via `?secret=<CDP_SECRET>` query param (NOT behind Zero Trust). Supports Page, Runtime, DOM, Input, Network, Emulation, Fetch domains.

- **`start-moltbot.sh`** — Container entrypoint. Restores R2 backup, initializes config from `moltbot.json.template`, configures AI provider from env vars (priority: Moonshot at `api.moonshot.ai/v1` → OpenRouter → AI Gateway → Anthropic), configures Telegram/Discord/Slack channels, sets `plugins.entries` for each channel, configures browser profiles for Cloudflare Browser Rendering, starts `clawdbot gateway`.

- **`Dockerfile`** — Based on `cloudflare/sandbox:0.7.0`. Installs Node.js 22, pnpm, and `clawdbot` CLI globally. Copies skills from `skills/` (e.g., `cloudflare-browser` for headless browser automation).

### Important: CLI is Still Named `clawdbot`

The upstream CLI hasn't been renamed yet. All CLI commands, config paths (`~/.clawdbot/`), and process names use `clawdbot`, not `moltbot`.

## Accessing Debug Endpoints

Debug routes are behind Zero Trust. Use the service token from the VPS:

```bash
CF_ID=$(grep -oP "CF_ACCESS_CLIENT_ID=['\"]?\K[^'\"]*" ~/.bashrc | head -1)
CF_SECRET=$(grep -oP "CF_ACCESS_CLIENT_SECRET=['\"]?\K[^'\"]*" ~/.bashrc | head -1)
curl -s -H "CF-Access-Client-Id: $CF_ID" -H "CF-Access-Client-Secret: $CF_SECRET" \
  "https://moltbot-sandbox.ancient-glitter-9ac9.workers.dev/debug/logs"
```

**Important**: `source ~/.bashrc` doesn't reliably export env vars in subshells. Use `grep -oP` to extract values directly from `~/.bashrc` instead of relying on `$CF_ACCESS_CLIENT_ID` / `$CF_ACCESS_CLIENT_SECRET` env vars.

The service token has a "Service Auth" (`non_identity` decision) policy on the Moltbot Access app (ID: `800039cc-74f2-4236-8e7f-41fd7c3cf9dc`).

### Useful Debug Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/debug/logs` | Gateway stdout/stderr |
| `/debug/container-config` | Current `clawdbot.json` in the container |
| `/debug/processes?logs=true` | All container processes with logs |
| `/debug/cli?cmd=<url-encoded-cmd>` | Run arbitrary CLI command in container (no env vars!) |
| `/debug/env` | Which Worker env vars are set (sanitized) |
| `/debug/ws-test` | Interactive WebSocket debug page |

**Warning**: `/debug/cli` runs commands WITHOUT the Worker's env vars. Don't use it to start the gateway — use the normal request flow instead.

## Restarting the Gateway

When you need to restart the gateway (e.g., after changing env vars):

1. Kill the current gateway: `curl .../debug/cli?cmd=kill+-9+<PID>` (find PID in logs)
2. Trigger restart by making any request through the catch-all proxy: `curl .../any-path`
3. The Worker's `ensureMoltbotGateway` will start a fresh gateway with correct env vars

**Never** use `wrangler containers delete` — it causes an unrecoverable `DURABLE_OBJECT_ALREADY_HAS_APPLICATION` error. If this happens, the only fix is deleting the entire worker with `npx wrangler delete` and redeploying from scratch.

## Adding New Functionality

### New Environment Variable

1. Add to `MoltbotEnv` interface in `src/types.ts`
2. If passed to container, add to `buildEnvVars()` in `src/gateway/env.ts`
3. If used in startup, add handling in `start-moltbot.sh`

### New API Endpoint

1. Add route handler in `src/routes/api.ts`
2. Add types in `src/types.ts` if needed
3. Update client API in `src/client/api.ts` for admin UI integration

## Testing

Tests use Vitest with colocated `*.test.ts` files next to source. Shared mock helpers in `src/test-utils.ts` (`createMockEnv()`, `createMockSandbox()`, `createMockProcess()`).

Key test files:
- `auth/jwt.test.ts`, `auth/middleware.test.ts` — Auth logic
- `gateway/env.test.ts`, `gateway/process.test.ts`, `gateway/r2.test.ts`, `gateway/sync.test.ts` — Gateway lifecycle
- `utils/logging.test.ts` — Log redaction

### CI/CD

GitHub Actions (`.github/workflows/test.yml`) runs on push/PR to main:
- **Unit job**: typecheck + vitest
- **E2E job**: 3 matrix configs (base, telegram, discord) using `cctr` test runner with Playwright, 15-min timeout. Records video and posts to PRs.

## Critical Gotchas

### Secrets Don't Bind at Runtime

Wrangler `secret put` values are NOT visible to the Worker. ALL config is stored as plaintext in `wrangler.jsonc` under `vars`. **DO NOT commit wrangler.jsonc to git.**

### R2 Storage

- Bucket: `moltbot-data`, mounted via s3fs at `/data/moltbot`
- This IS the R2 bucket — `rm -rf` will delete backups
- Use `rsync -r --no-times` (s3fs doesn't support setting timestamps)
- Don't rely on `sandbox.mountBucket()` errors — check `mount | grep s3fs` instead
- Cron syncs config to R2 every 5 minutes; restored on container restart

### Telegram Channel

- Bot: @dangusClawdBot
- `dmPolicy: "open"` with `allowFrom: ["*"]` — anyone can DM the bot
- The gateway requires BOTH `channels.telegram.enabled` AND `plugins.entries.telegram.enabled` to be set. The startup script handles both.
- If Telegram shows "configured, not enabled yet" on startup, `plugins.entries.telegram.enabled` is missing. Run `clawdbot doctor --fix` in the container or redeploy (the startup script now sets it).

### Token Cookie Persistence

The catch-all proxy middleware saves the gateway `?token=` param to an HttpOnly cookie (`moltbot_token`, 1 year expiry). Users only need to provide the token once per browser.

### Browser Rendering (Cloudflare)

- **Binding**: `BROWSER` in `wrangler.jsonc` — provides headless Chrome via Cloudflare Browser Rendering
- **CDP shim**: `/cdp` route translates Chrome DevTools Protocol to Puppeteer calls. Authenticated via `CDP_SECRET` query param, NOT behind Zero Trust
- **Gateway integration**: `start-moltbot.sh` configures `browser.profiles.default` with the HTTPS discovery URL (`/cdp/json/version?secret=...`). The gateway auto-discovers the WebSocket URL from the discovery endpoint.
- **Browser profile requirements**: Must include `cdpUrl` (HTTPS, not WSS) and `color` (any hex color string). Missing `color` causes config validation error.
- **Skill**: `cloudflare-browser` is a workspace skill (ready). Gateway logs `[browser/server] Browser control listening on http://127.0.0.1:18791/` on success.
- **If browser fails to start**: Check stderr for `browser.profiles.default.cdpUrl must be http(s)` (means WSS was used instead of HTTPS) or `browser.profiles.default.color: Invalid input` (missing color field).

### Moltbot Config Validation

- `agents.defaults.model` must be `{ "primary": "model/name" }` not a string
- `gateway.mode` must be `"local"` for headless operation
- `gateway.bind` is not a config option — use `--bind` CLI flag
- `browser.profiles.default.cdpUrl` must be `https://` not `wss://`
- `browser.profiles.default.color` is required (any hex color string)
- `models.providers.*.api` must be one of: `openai-completions`, `openai-responses`, `anthropic-messages`, `google-generative-ai`, `github-copilot`, `bedrock-converse-stream`. Moonshot uses `openai-completions` (standard `/v1/chat/completions`), NOT `openai-responses`.
- **Moonshot API base URL**: Must be `https://api.moonshot.ai/v1` (NOT `api.moonshot.cn`). Keys starting with `sk-kimi-` are Kimi Coding keys (restricted to coding agents); use regular `sk-` keys from `platform.moonshot.ai`.

### WebSocket in Local Dev

`wrangler dev` can't proxy WebSocket through the sandbox. HTTP works. Deploy to Cloudflare for full testing.

### Zero Trust Auth

- Team domain: `vwo-analyzer.cloudflareaccess.com`
- AUD: `50f6785e2c5d7cdf2ce8b4e8aabcb49a81aa119c4c7d7aab2c3f7b9cc6115ec9`
- Zero Trust intercepts ALL requests at the CDN edge (including public routes from curl). Only browser-authenticated users and the service token can reach the Worker.
- Service token policy: "Service Token Auth" (`non_identity` decision) on the Moltbot Access app.

## AI Models

Provider priority in `start-moltbot.sh`: **Moonshot → OpenRouter → AI Gateway → Anthropic**. Default model: Kimi K2.5 (`moonshot/kimi-k2.5` via direct Moonshot API at `api.moonshot.ai/v1`, or `moonshotai/kimi-k2.5` via OpenRouter). Uses `openai-completions` API type (NOT `openai-responses` — Moonshot doesn't support the Responses API). 7 OpenRouter models also configured as fallbacks.

## Skills

Skills live in `skills/` and are copied into the container at `/root/clawd/skills/`. Each skill has a `SKILL.md` (frontmatter + instructions) and optional `scripts/`.

| Skill | Purpose |
|-------|---------|
| `cloudflare-browser` | Headless Chrome via Cloudflare Browser Rendering CDP |
| `hypertask` | Task management via Hypertask MCP API |
| `voice` | Send Telegram voice messages via Edge TTS (no API key needed) |

### Hypertask Skill

The `skills/hypertask/` skill connects to Hypertask via MCP protocol (streamable HTTP at `https://mcp.hypertask.ai/mcp`). The helper script `scripts/hypertask-mcp.js` handles MCP handshake + tool calls. Requires `HYPERTASK_BEARER_TOKEN` env var.

Available tools: `hypertask_get_user_context`, `hypertask_list_tasks`, `hypertask_get_tasks`, `hypertask_search_tasks`, `hypertask_create_task`, `hypertask_update_task`, `hypertask_add_comment_to_task`, `hypertask_get_comments_for_task`, `hypertask_section`, `hypertask_list_projects`, `hypertask_move_task_between_boards`.

**Note**: The bearer token is a JWT with an expiry (`exp` claim). Check and refresh before it expires.

### Voice Skill

The `skills/voice/` skill sends Telegram voice messages using Microsoft Edge TTS (free, no API key). The script at `scripts/voice-send.js` synthesizes text to MP3 via `@andresaya/edge-tts` and sends it via Telegram's `sendVoice` API.

```bash
node /root/clawd/skills/voice/scripts/voice-send.js '<text>' '<chat_id>' [voice] [rate]
```

- Default voice: `en-US-AvaMultilingualNeural`
- Output format: MP3 (`audio-24khz-48kbitrate-mono-mp3`) — OGG/OPUS silently fails in this library version
- Requires `TELEGRAM_BOT_TOKEN` env var (already configured in the container)

### Adding a New Skill

1. Create `skills/<name>/SKILL.md` with YAML frontmatter (`name`, `description`, optional `user-invocable: true`)
2. Add helper scripts in `skills/<name>/scripts/` if needed
3. Bump the cache bust comment in `Dockerfile` to force rebuild
4. Clear Docker build cache (`docker builder prune -af && docker rmi` old images) before deploying — wrangler's Docker layer caching is aggressive

## Environment Variables (wrangler.jsonc vars)

| Variable | Purpose |
|----------|---------|
| `MOLTBOT_GATEWAY_TOKEN` | Bearer token for gateway auth |
| `OPENROUTER_API_KEY` | AI model access via OpenRouter |
| `MOONSHOT_API_KEY` | Direct Kimi K2.5 API via `api.moonshot.ai` (takes priority over OpenRouter). Key starts with `sk-` (NOT `sk-kimi-` which is Kimi Coding only) |
| `TELEGRAM_BOT_TOKEN` | @dangusClawdBot Telegram bot token |
| `TELEGRAM_DM_POLICY` | `open` — allow all DMs without pairing |
| `R2_ACCESS_KEY_ID` | S3-compatible R2 credentials |
| `R2_SECRET_ACCESS_KEY` | S3-compatible R2 credentials |
| `CF_ACCOUNT_ID` | Cloudflare account for R2 |
| `CF_ACCESS_TEAM_DOMAIN` | Zero Trust team domain |
| `CF_ACCESS_AUD` | Zero Trust audience tag |
| `DEBUG_ROUTES` | `true` to enable /debug/* endpoints |
| `CDP_SECRET` | Shared secret for `/cdp` Browser Rendering endpoint |
| `HYPERTASK_BEARER_TOKEN` | JWT token for Hypertask MCP API (has expiry) |
