/**
 * Extracts plain text from an uploaded question paper. Word and PDF only.
 *
 * This runs at authoring time on a machine with internet, never during a test,
 * because the parsing step below calls an external model. By the time a test is
 * published the questions are ordinary database rows with no such dependency.
 */

import mammoth from "mammoth";

export type DocumentKind = "docx" | "pdf";

export function detectKind(filename: string): DocumentKind | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".pdf")) return "pdf";
  return null;
}

/** Word documents convert cleanly to text, preserving list structure. */
async function extractDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/** PDF text layer. Scanned PDFs with no text layer come back nearly empty. */
async function extractPdf(buffer: Buffer): Promise<string> {
  // pdf-parse is CommonJS and reads a sample file at import time from its index,
  // so the inner library entry point is imported directly to avoid that.
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as (
    b: Buffer,
  ) => Promise<{ text: string }>;
  const result = await pdfParse(buffer);
  return result.text;
}

export async function extractText(
  buffer: Buffer,
  kind: DocumentKind,
): Promise<string> {
  const text = kind === "docx" ? await extractDocx(buffer) : await extractPdf(buffer);
  return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
