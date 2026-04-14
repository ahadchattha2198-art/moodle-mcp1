#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getConfig } from "./config.js";
import { MoodleClient } from "./moodle-client.js";
import { registerCourseTools } from "./tools/courses.js";
import { registerFileTools } from "./tools/files.js";

async function main() {
  const config = getConfig();
  const client = await MoodleClient.create(config);

  const server = new McpServer({
    name: "moodle-mcp",
    version: "0.1.0",
  });

  registerCourseTools(server, client);
  registerFileTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Failed to start moodle-mcp:", err.message);
  process.exit(1);
});
