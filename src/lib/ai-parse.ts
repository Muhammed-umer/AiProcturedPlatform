/**
 * Turns the text of a question paper into structured draft questions using
 * Claude. This is the one place in the system that needs internet, and it runs
 * only while staff prepare a test.
 *
 * The output is always reviewed by a human before it is saved, so this aims for
 * a good first draft rather than perfection. Every question carries a
 * confidence value so the review screen can flag the doubtful ones.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { QuestionType } from "@/db/schema";

export interface AiParsedOption {
  body: string;
  isCorrect: boolean;
}

export interface AiParsedQuestion {
  section: string;
  type: QuestionType;
  body: string;
  options: AiParsedOption[];
  acceptedAnswers: string[] | null;
  marks: number | null;
  confidence: number;
  needsReview: boolean;
}

export interface AiParseResult {
  ok: boolean;
  questions: AiParsedQuestion[];
  message?: string;
}

const MODEL = "claude-opus-5";

const QUESTION_TOOL = {
  name: "record_questions",
  description:
    "Record the questions extracted from an exam paper as structured data.",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            section: {
              type: "string",
              description:
                "Section or topic heading this question sits under. Use 'Section A' if the paper has none.",
            },
            type: {
              type: "string",
              enum: ["mcq_single", "mcq_multiple", "fill_blank"],
              description:
                "mcq_single for one correct option, mcq_multiple for several, fill_blank for a typed answer.",
            },
            body: { type: "string", description: "The question text." },
            options: {
              type: "array",
              description: "Empty for fill_blank.",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  body: { type: "string" },
                  isCorrect: { type: "boolean" },
                },
                required: ["body", "isCorrect"],
              },
            },
            acceptedAnswers: {
              type: ["array", "null"],
              description:
                "Accepted text answers for fill_blank, else null.",
              items: { type: "string" },
            },
            marks: {
              type: ["number", "null"],
              description: "Marks if the paper states them, else null.",
            },
            confidence: {
              type: "number",
              description:
                "0 to 1. How sure you are this was extracted correctly, especially the correct answer.",
            },
          },
          required: [
            "section",
            "type",
            "body",
            "options",
            "acceptedAnswers",
            "marks",
            "confidence",
          ],
        },
      },
    },
    required: ["questions"],
  },
  strict: true,
};

const SYSTEM = `You extract multiple-choice and fill-in-the-blank questions from exam papers into structured data.

Rules:
- Preserve the exact wording of each question and option.
- If the paper marks a correct answer (bold, an answer key, an asterisk, or a separate answers section), set isCorrect accordingly. If no correct answer is indicated, still record the question but set every option's isCorrect to false and lower the confidence.
- mcq_single has exactly one correct option. mcq_multiple has two or more. fill_blank has no options; put the answer text in acceptedAnswers.
- Group questions under the section or topic headings present in the paper. If there are none, use "Section A".
- Set confidence below 0.8 for anything you are unsure about: unclear correct answers, mathematical notation, questions that refer to a diagram, or garbled text.
- Do not invent questions. Only record what is in the paper.`;

/** True when the extraction should be flagged for closer human review. */
function flagForReview(q: AiParsedQuestion): boolean {
  if (q.confidence < 0.8) return true;
  if (q.type !== "fill_blank") {
    if (q.options.length < 2) return true;
    if (!q.options.some((o) => o.isCorrect)) return true;
    if (q.type === "mcq_single" && q.options.filter((o) => o.isCorrect).length !== 1)
      return true;
  } else if (!q.acceptedAnswers || q.acceptedAnswers.length === 0) {
    return true;
  }
  return false;
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function parseQuestionsWithAi(
  text: string,
): Promise<AiParseResult> {
  if (!isAiConfigured()) {
    return {
      ok: false,
      questions: [],
      message:
        "AI parsing is not configured. Set ANTHROPIC_API_KEY in .env on a machine with internet to use this, or use the spreadsheet import instead.",
    };
  }

  if (text.trim().length < 20) {
    return {
      ok: false,
      questions: [],
      message:
        "Almost no text could be read from that file. If it is a scanned PDF, retype the questions or use the spreadsheet import.",
    };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      tools: [QUESTION_TOOL],
      // Nudge the model to use the tool without forcing it, which this model
      // family rejects; the strict schema keeps the arguments valid.
      messages: [
        {
          role: "user",
          content: `Extract every question from this exam paper and record them with the record_questions tool.\n\n---\n\n${text.slice(0, 100_000)}`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return {
        ok: false,
        questions: [],
        message:
          "The parsing service declined this document. Please use the spreadsheet import for this file.",
      };
    }

    const toolUse = response.content.find(
      (block) => block.type === "tool_use" && block.name === "record_questions",
    );

    if (!toolUse || toolUse.type !== "tool_use") {
      return {
        ok: false,
        questions: [],
        message:
          "No questions could be extracted from that document. Try the spreadsheet import.",
      };
    }

    const raw = toolUse.input as { questions?: AiParsedQuestion[] };
    const questions = (raw.questions ?? []).map((q) => ({
      ...q,
      options: q.options ?? [],
      acceptedAnswers: q.acceptedAnswers ?? null,
      needsReview: flagForReview({ ...q, options: q.options ?? [], needsReview: false }),
    }));

    if (questions.length === 0) {
      return {
        ok: false,
        questions: [],
        message: "No questions were found in that document.",
      };
    }

    return { ok: true, questions };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The parsing request failed.";
    return {
      ok: false,
      questions: [],
      message: `Could not reach the parsing service: ${message}`,
    };
  }
}
