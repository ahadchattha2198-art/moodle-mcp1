# moodle-mcp: Hosting + README Design Spec

**Date:** 2026-04-18
**Scope:** Cloudflare Worker transport, 8-tool install section, README polish

---

## 1. Cloudflare Worker Transport

### Goal
Add a second MCP transport so users can get a hosted URL without breaking the existing `npx moodle-mcp` stdio flow.

### Approach
Add `src/worker.ts` as a Cloudflare Worker entry point. It wires the same tool + prompt handlers from `src/tools/` and `src/prompts/` over `StreamableHTTPServerTransport`. The existing `src/server.ts` (stdio) is untouched.

### New files

**`src/worker.ts`**
- Exports a `fetch(request, env)` handler (CF Worker interface)
- Reads `MOODLE_URL` and `MOODLE_TOKEN` from `env` bindings (not `process.env`)
- Creates a `MoodleClient` from those bindings
- Registers all existing tool + prompt handlers
- Handles the request via `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk`

**`wrangler.toml`**
```toml
name = "moodle-mcp"
main = "dist/worker.js"
compatibility_date = "2024-01-01"

[vars]
MOODLE_URL = ""
MOODLE_TOKEN = ""
```
Users set `MOODLE_URL` and `MOODLE_TOKEN` as secrets in the CF dashboard (not in the toml file).

**`tsconfig.worker.json`**
Extends `tsconfig.json`, sets `"entryPoints": ["src/worker.ts"]` targeting `dist/worker.js` for `wrangler deploy`.

### Build scripts (additions to `package.json`)
```json
"build:worker": "tsc -p tsconfig.worker.json",
"deploy": "npm run build:worker && wrangler deploy"
```

### Deploy flow for users
1. Click **"Deploy to Cloudflare"** button in README (uses CF's deploy-button scheme)
2. Set `MOODLE_URL` + `MOODLE_TOKEN` as CF environment secrets
3. Receive URL: `https://moodle-mcp.<subdomain>.workers.dev`
4. Paste URL into any MCP client config

### Cost
CF Workers free tier: 100k requests/day, 10ms CPU/request — sufficient for a REST proxy.

### Constraints
- `StreamableHTTPServerTransport` must be used (not `SSEServerTransport` which requires persistent connections CF Workers don't support)
- `fetch` in the worker uses CF's native fetch, not Node's — no change needed since `MoodleClient` already uses `globalThis.fetch`
- No `process.env` in `worker.ts` — env comes from CF bindings via the `env` parameter

---

## 2. 8-Tool Install Section

### Goal
Replace the current two-tool "Quick Start" with a comprehensive install section covering the top 8 MCP clients, each with both local (npx) and hosted (CF URL) variants.

### Structure
```
## Install

Pick your delivery mode first:
- **Local** — runs on your machine via npx, no hosting needed
- **Hosted** — deploy your own Cloudflare Worker, paste the URL

Then pick your MCP client:
```

### Tools covered

| # | Tool | Config location | Special |
|---|------|----------------|---------|
| 1 | Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) / `%APPDATA%\Claude\...` (Win) | Both options |
| 2 | Claude Code (CLI) | CLI command | `claude mcp add moodle npx moodle-mcp` |
| 3 | Cursor | `.cursor/mcp.json` | Both options |
| 4 | VS Code | `.vscode/mcp.json` | Both options |
| 5 | Windsurf | `~/.codeium/windsurf/mcp_config.json` | Both options |
| 6 | Zed | `~/.config/zed/settings.json` | Both options |
| 7 | Continue.dev | `~/.continue/config.json` | Both options |
| 8 | Cline | GUI settings (JSON shown as reference) | Both options |

### ChatGPT
No native MCP support as of 2026-04-18. Include a "ChatGPT — Coming Soon" row with a link to OpenAI's MCP announcement.

### Presentation
Each tool entry is a `<details>` collapsible block to avoid a wall of JSON. Each block contains:
- Config file path (with OS variants where relevant)
- Ready-to-paste JSON/YAML snippet
- `claude mcp add` one-liner where the tool supports it

---

## 3. README Polish

### Badges (top of README, below title line)
```md
[![npm version](https://img.shields.io/npm/v/moodle-mcp)](https://www.npmjs.com/package/moodle-mcp)
[![npm downloads](https://img.shields.io/npm/dm/moodle-mcp)](https://www.npmjs.com/package/moodle-mcp)
[![GitHub stars](https://img.shields.io/github/stars/1alexandrer/moodle-mcp?style=social)](https://github.com/1alexandrer/moodle-mcp)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178c6?logo=typescript&logoColor=white)]()
[![Node](https://img.shields.io/badge/Node-18+-339933?logo=node.js&logoColor=white)]()
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)]()
[![MIT License](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)
```

### npm callout block
Near the top, below the tagline:
```md
> 📦 **[moodle-mcp on npm](https://www.npmjs.com/package/moodle-mcp)** — `npx moodle-mcp`
```

### Star history chart
At the bottom of the README, above Contributing:
```md
## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=1alexandrer/moodle-mcp&type=Date)](https://star-history.com/#1alexandrer/moodle-mcp)
```

### Obsidian graph preview
A `## Knowledge Graph` section inside "Obsidian Finals Prep":
```md
![Obsidian knowledge graph](docs/assets/graph-preview.png)
*Your entire course as a linked knowledge graph — built in one command.*
```
The image slot `docs/assets/graph-preview.png` is a placeholder; a real screenshot is added after running `/build-study-notes` once. The section renders gracefully (broken image shows alt text) until the screenshot is added.

---

## Out of Scope
- Multi-tenant shared hosting (each user hosts their own CF Worker)
- ChatGPT MCP support (not available yet)
- Changing any existing tool logic or prompts
- Adding tests for the worker transport
