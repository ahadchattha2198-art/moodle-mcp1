import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MoodleClient } from "../moodle-client.js";
import type { FileRef } from "../file-id-store.js";

interface ModuleContent {
  type: string;
  fileurl: string;
}

interface CourseModule {
  contents?: ModuleContent[];
}

interface CourseSection {
  modules: CourseModule[];
}

const TEXT_MIMES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-yaml",
  "application/yaml",
]);

function isTextMime(mime: string): boolean {
  return mime.startsWith("text/") || TEXT_MIMES.has(mime);
}

function isDocx(mime: string, filename: string): boolean {
  return (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    filename.toLowerCase().endsWith(".docx")
  );
}

function isPptx(mime: string, filename: string): boolean {
  return (
    mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mime === "application/vnd.ms-powerpoint.presentation.macroEnabled.12" ||
    filename.toLowerCase().endsWith(".pptx") ||
    filename.toLowerCase().endsWith(".pptm")
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(s);
}

/**
 * Extract plain text from a .docx file using mammoth (browser build).
 * Returns null if extraction fails.
 */
async function extractDocxText(bytes: Uint8Array): Promise<string | null> {
  try {
    // mammoth browser build works with ArrayBuffer
    const mammoth = await import("mammoth/mammoth.browser.min.js");
    const result = await mammoth.extractRawText({ arrayBuffer: bytes.buffer });
    return result.value?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Extract plain text from a .pptx file by unzipping and parsing slide XML.
 * PPTX is a ZIP of XML files — we parse slide*.xml files directly.
 * This avoids any Node.js-specific dependencies, works in Cloudflare Workers.
 */
async function extractPptxText(bytes: Uint8Array): Promise<string | null> {
  try {
    // Dynamically import fflate (a pure-JS zip library already used by many CF Workers packages)
    const { unzipSync } = await import("fflate");
    const files = unzipSync(bytes);

    const slideTexts: string[] = [];

    // Get slide files sorted in order: ppt/slides/slide1.xml, slide2.xml, etc.
    const slideKeys = Object.keys(files)
      .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)/)?.[1] ?? "0");
        const numB = parseInt(b.match(/slide(\d+)/)?.[1] ?? "0");
        return numA - numB;
      });

    const decoder = new TextDecoder("utf-8");

    for (const key of slideKeys) {
      const xml = decoder.decode(files[key]);
      // Extract all <a:t> text elements from the slide XML
      const matches = xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g);
      const texts: string[] = [];
      for (const match of matches) {
        const t = match[1].trim();
        if (t) texts.push(t);
      }
      if (texts.length > 0) {
        const slideNum = key.match(/slide(\d+)/)?.[1];
        slideTexts.push(`--- Slide ${slideNum} ---\n${texts.join(" ")}`);
      }
    }

    return slideTexts.length > 0 ? slideTexts.join("\n\n") : null;
  } catch {
    return null;
  }
}

/**
 * Re-check that the file behind this ref is still visible to the current
 * user. Catches unenrolment, module hides, file removal between the list
 * call and the download call.
 */
async function reauthorize(client: MoodleClient, ref: FileRef): Promise<boolean> {
  try {
    const sections = await client.call<CourseSection[]>("core_course_get_contents", {
      courseid: ref.courseId,
    });
    for (const section of sections) {
      for (const mod of section.modules) {
        for (const file of mod.contents ?? []) {
          if (file.type === "file" && file.fileurl === ref.fileurl) return true;
        }
      }
    }
  } catch {
    return false;
  }
  return false;
}

export function registerDownloadTool(server: McpServer, client: MoodleClient): void {
  server.tool(
    "moodle_download_file",
    "Download a Moodle course file by its opaque fileId (from moodle_list_resources). Returns text for text/JSON/XML/DOCX/PPTX files; returns the raw bytes as an embedded resource for binary formats like PDFs and images. The server fetches the file — you never need to fetch Moodle URLs directly.",
    {
      fileId: z.string().describe("Opaque fileId returned by moodle_list_resources"),
    },
    async ({ fileId }) => {
      const ref = await client.fileIdStore.open(fileId, client.userId);
      if (!ref) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: "fileId is invalid, expired, or was not issued to the current user. Re-run moodle_list_resources to get fresh IDs.",
            },
          ],
        };
      }

      const visible = await reauthorize(client, ref);
      if (!visible) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: "Access denied: this file is no longer visible to you (unenrolled, hidden, or removed).",
            },
          ],
        };
      }

      let downloaded;
      try {
        downloaded = await client.downloadFile(ref.fileurl);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Download failed: ${message}` }],
        };
      }

      const mime = downloaded.mime || ref.mime || "application/octet-stream";
      const resourceUri = `moodle://files/${encodeURIComponent(ref.filename)}`;

      // --- Plain text files ---
      if (isTextMime(mime)) {
        const text = new TextDecoder("utf-8", { fatal: false }).decode(downloaded.bytes);
        return {
          content: [
            {
              type: "text" as const,
              text: `**${ref.filename}** (${mime})\n\n${text}`,
            },
          ],
        };
      }

      // --- DOCX: extract text with mammoth ---
      if (isDocx(mime, ref.filename)) {
        const text = await extractDocxText(downloaded.bytes);
        if (text) {
          return {
            content: [
              {
                type: "text" as const,
                text: `**${ref.filename}** (Word document — extracted text)\n\n${text}`,
              },
            ],
          };
        }
        // Fall through to binary if extraction failed
      }

      // --- PPTX: extract text slide by slide ---
      if (isPptx(mime, ref.filename)) {
        const text = await extractPptxText(downloaded.bytes);
        if (text) {
          return {
            content: [
              {
                type: "text" as const,
                text: `**${ref.filename}** (PowerPoint — extracted text)\n\n${text}`,
              },
            ],
          };
        }
        // Fall through to binary if extraction failed
      }

      // --- Everything else: return as embedded binary resource ---
      return {
        content: [
          {
            type: "text" as const,
            text: `**${ref.filename}** (${mime}, ${downloaded.bytes.length} bytes) — embedded below.`,
          },
          {
            type: "resource" as const,
            resource: {
              uri: resourceUri,
              mimeType: mime,
              blob: bytesToBase64(downloaded.bytes),
            },
          },
        ],
      };
    },
  );
}
