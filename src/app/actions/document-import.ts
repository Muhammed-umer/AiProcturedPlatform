"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { sections, questions, options } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { detectKind, extractText } from "@/lib/document-extract";
import {
  parseQuestionsWithAi,
  isAiConfigured,
  type AiParsedQuestion,
} from "@/lib/ai-parse";
import type { QuestionType } from "@/db/schema";

export interface DocumentParseState {
  error?: string;
  questions?: AiParsedQuestion[];
  fileName?: string;
}

/**
 * Reads an uploaded Word or PDF paper and returns draft questions for the
 * human review screen. Nothing is saved here. Saving happens only after the
 * admin approves the questions with commitReviewedQuestions below.
 */
export async function extractDocument(
  _prev: DocumentParseState,
  formData: FormData,
): Promise<DocumentParseState> {
  await requireAdmin();

  if (!isAiConfigured()) {
    return {
      error:
        "AI document parsing is not switched on. Set ANTHROPIC_API_KEY in the server .env file on a machine with internet, then restart. The spreadsheet import needs no such setup.",
    };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a Word or PDF file to upload" };
  }

  const kind = detectKind(file.name);
  if (!kind) {
    return { error: "Only .docx and .pdf files are supported here. Use the spreadsheet import for other formats." };
  }

  let text: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    text = await extractText(buffer, kind);
  } catch {
    return { error: "That file could not be read. It may be corrupted or password protected." };
  }

  const result = await parseQuestionsWithAi(text);

  if (!result.ok) {
    return { error: result.message ?? "The document could not be parsed." };
  }

  return { questions: result.questions, fileName: file.name };
}

export interface CommitState {
  error?: string;
  success?: string;
}

/**
 * Saves the questions the admin approved on the review screen. The review UI
 * sends the final, edited questions as JSON, so what is saved is exactly what
 * the human confirmed, not the raw model output.
 */
export async function commitReviewedQuestions(
  _prev: CommitState,
  formData: FormData,
): Promise<CommitState> {
  await requireAdmin();

  const testId = String(formData.get("testId") ?? "");
  const payload = String(formData.get("questions") ?? "");

  if (!testId) return { error: "Missing test" };

  let parsed: AiParsedQuestion[];
  try {
    parsed = JSON.parse(payload);
  } catch {
    return { error: "The reviewed questions could not be read. Please try again." };
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { error: "No questions were selected to save" };
  }

  // Validate each question the same way the manual form does, so a bad edit on
  // the review screen cannot save a broken question.
  for (const [i, q] of parsed.entries()) {
    const n = i + 1;
    if (!q.body || q.body.trim().length === 0) {
      return { error: `Question ${n} has no text` };
    }
    if (q.type === "fill_blank") {
      if (!q.acceptedAnswers || q.acceptedAnswers.filter(Boolean).length === 0) {
        return { error: `Question ${n} needs at least one accepted answer` };
      }
    } else {
      const opts = (q.options ?? []).filter((o) => o.body.trim());
      if (opts.length < 2) return { error: `Question ${n} needs at least two options` };
      const correct = opts.filter((o) => o.isCorrect);
      if (correct.length === 0) return { error: `Question ${n} has no correct option marked` };
      if (q.type === "mcq_single" && correct.length !== 1) {
        return { error: `Question ${n} is single-answer but has ${correct.length} correct options` };
      }
    }
  }

  const existingSections = await db
    .select({ id: sections.id, name: sections.name })
    .from(sections)
    .where(eq(sections.testId, testId));

  const byName = new Map(
    existingSections.map((s) => [s.name.trim().toLowerCase(), s.id]),
  );
  let ordinal = existingSections.length;

  for (const q of parsed) {
    const sectionName = q.section?.trim() || "Section A";
    const key = sectionName.toLowerCase();
    let sectionId = byName.get(key);

    if (!sectionId) {
      const created = await db
        .insert(sections)
        .values({
          testId,
          name: sectionName,
          ordinal: ordinal++,
          defaultMarks: "1",
          negativeMarks: "0",
        })
        .returning({ id: sections.id });
      sectionId = created[0].id;
      byName.set(key, sectionId);
    }

    const [{ n } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(questions)
      .where(eq(questions.sectionId, sectionId));

    const created = await db
      .insert(questions)
      .values({
        sectionId,
        type: q.type as QuestionType,
        body: q.body.trim(),
        ordinal: n,
        marksOverride: q.marks !== null && q.marks !== undefined ? String(q.marks) : null,
        acceptedAnswers:
          q.type === "fill_blank"
            ? (q.acceptedAnswers ?? []).map((a) => a.trim()).filter(Boolean)
            : null,
      })
      .returning({ id: questions.id });

    if (q.type !== "fill_blank") {
      const opts = (q.options ?? []).filter((o) => o.body.trim());
      await db.insert(options).values(
        opts.map((o, idx) => ({
          questionId: created[0].id,
          body: o.body.trim(),
          isCorrect: o.isCorrect,
          ordinal: idx,
        })),
      );
    }
  }

  revalidatePath(`/admin/tests/${testId}`);
  return {
    success: `${parsed.length} question${parsed.length === 1 ? "" : "s"} saved`,
  };
}
