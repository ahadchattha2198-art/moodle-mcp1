import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MoodleClient } from "../moodle-client.js";

interface ContentFile {
  filename: string;
  fileurl: string;
  filesize: number;
  mimetype?: string;
  timemodified: number;
}

interface Resource {
  id: number;
  name: string;
  coursemodule: number;
  contentfiles: ContentFile[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function listResources(client: MoodleClient, courseId: number): Promise<string> {
  const resources = await client.call<Resource[]>("mod_resource_get_resources_by_courses", {
    "courseids[0]": courseId,
  });
  if (resources.length === 0) return "No downloadable files found in this course.";

  const lines: string[] = [`## Files in Course ${courseId}\n`];
  for (const r of resources) {
    lines.push(`**${r.name}**`);
    for (const f of r.contentfiles) {
      const url = client.fileUrl(f.fileurl);
      const size = formatSize(f.filesize);
      lines.push(`  - [${f.filename}](${url}) *(${size})*`);
    }
  }
  return lines.join("\n");
}

export function registerFileTools(server: McpServer, client: MoodleClient): void {
  server.tool(
    "moodle_list_resources",
    "List downloadable files and resources in a course. Returns authenticated download URLs.",
    { courseId: z.number().describe("Course ID from moodle_list_courses") },
    async ({ courseId }) => ({
      content: [{ type: "text" as const, text: await listResources(client, courseId) }],
    })
  );
}
