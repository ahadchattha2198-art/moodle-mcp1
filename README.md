# moodle-mcp

An MCP server that connects Claude Desktop to your Moodle — access your courses, files, and resources directly from chat.

## Quick Setup (3 steps)

### 1. Find your Moodle URL

Open any page on your school's Moodle and copy the base URL — everything up to (and including) the domain:

```
https://moodle.myuniversity.edu
```

You can also paste a full course URL like `https://moodle.myuniversity.edu/course/view.php?id=5` — the server extracts the base automatically.

### 2. Add to Claude Desktop config

Open your Claude Desktop config file:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Add the following (create the file if it doesn't exist):

```json
{
  "mcpServers": {
    "moodle": {
      "command": "npx",
      "args": ["-y", "moodle-mcp"],
      "env": {
        "MOODLE_URL": "https://moodle.myuniversity.edu",
        "MOODLE_USERNAME": "your-username",
        "MOODLE_PASSWORD": "your-password"
      }
    }
  }
}
```

**Prefer a token?** Replace `MOODLE_USERNAME` / `MOODLE_PASSWORD` with:
```json
"MOODLE_TOKEN": "your-token-here"
```
To get a token: Moodle profile → Preferences → Security keys.

### 3. Restart Claude Desktop

Restart Claude Desktop, then try:
> *"What courses am I enrolled in?"*
> *"Show me the files for my Biology course."*

---

## Available Tools

| Tool | What it does |
|---|---|
| `moodle_list_courses` | List all your enrolled courses (with IDs) |
| `moodle_get_course` | Get sections and modules of a specific course |
| `moodle_list_resources` | List downloadable files in a course with direct download links |

---

## Troubleshooting

**"Web services are not enabled"**
Your school hasn't enabled Moodle's web services API. Send this to your IT/admin team:
> *Please enable Web Services at: Site Administration → Plugins → Web services → Overview → Enable web services. Also enable the REST protocol and the Moodle Mobile app service.*

**"Moodle login failed" / "Invalid token"**
- Double-check your Moodle URL (no trailing slash issues — the server handles them, but verify it's correct)
- Verify your username and password by logging into Moodle manually
- Some schools require VPN — connect first, then restart Claude Desktop
- Try generating a token manually (Moodle profile → Preferences → Security keys) and using `MOODLE_TOKEN` instead

**"moodle_mobile_app service not available"**
Ask your Moodle admin to enable the **Moodle mobile web service** at Site Administration → Plugins → Web services → Manage services.

---

## Running Locally (for development)

```bash
git clone https://github.com/yourusername/moodle-mcp
cd moodle-mcp
npm install
npm run build
```

Test with the MCP inspector:
```bash
MOODLE_URL=https://your-moodle.edu MOODLE_TOKEN=yourtoken npm run dev
```

---

## Contributing

Adding a new tool is straightforward:

1. Create (or extend) a file in `src/tools/`
2. Export a handler function and a `registerXTools(server, client)` function
3. Import and call `registerXTools` in `src/server.ts`
4. Rebuild with `npm run build`

The `client.call<T>(wsfunction, params)` method handles all Moodle API communication. See the [Moodle Web Services API](https://docs.moodle.org/dev/Web_services) for available functions.

---

## License

MIT
