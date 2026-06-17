/**
 * Prompt templates for generating a full question pool from the complete PDF text.
 */

export const MCQ_SYSTEM_PROMPT = `You are a senior compliance assessment designer at Relanto (global IT services company).

Write realistic workplace SCENARIO questions — the same quality as Relanto's standard compliance assessments.

STRICT RULES FOR EVERY QUESTION:
1. Start with a NAMED Relanto employee (e.g. Ananya, Rahul, Priya, Vikram, Meera) in a SPECIFIC situation.
2. Ground the dilemma in the PDF training content (policies, procedures, client rules).
3. End with "What should [name] do?" or "What is the best course of action?"
4. Exactly 4 options (ids: a, b, c, d) — one correct, three plausible wrong choices.
5. Explanation: exactly TWO sentences (specific, not generic):
   - Why the correct option follows policy.
   - Why the tempting wrong options are unsafe or non-compliant.

FORBIDDEN (instant reject if you write these):
- NEVER mention the module title, PPT name, document name, or "Security Awareness" as a label.
- NEVER write "You are working on [title]…" or "While completing [title]…" or "During [title]…"
- NEVER say "this training module", "the slide deck", or "the PPT".
- No duplicate scenarios. No "all/none of the above".

Output valid JSON only (no markdown).

{
  "questions": [
    {
      "prompt": "...",
      "options": [{"id":"a","label":"..."},{"id":"b","label":"..."},{"id":"c","label":"..."},{"id":"d","label":"..."}],
      "correctOptionId":"a",
      "explanation":"..."
    }
  ]
}`;

const GOLD_EXAMPLES = `GOLD-STANDARD examples (match this quality — do NOT copy verbatim):

Example A:
"Priya is working late on a banking client deliverable. She considers uploading the workbook to her personal Google Drive so she can edit from home on her tablet. Client data must stay on approved systems. What should Priya do?"
Correct: use only client-approved VPN and systems; obtain written approval before any exception.

Example B:
"Rahul receives a WhatsApp message from an unknown number claiming to be IT support, asking him to click a link to 'fix his expired password'. What should Rahul do first?"
Correct: do not click; verify through official IT/security channel.

Example C:
"Ananya's teammate offers to log into the client VPN using Ananya's credentials because his own access is pending. The client demo is in 20 minutes. What should Ananya do?"
Correct: refuse credential sharing; request proper access through approval process.

Example D:
"Vikram wants to use a free online PDF merger to combine confidential client slides before a review. The tool is not on the approved software list. What is the best action?"
Correct: use only IT-approved tools; never upload client data to unapproved sites.`;

export function buildMcqUserPrompt(params: {
  moduleTitle: string;
  fullText: string;
  questionCount: number;
}): string {
  const { fullText, questionCount } = params;
  return `${GOLD_EXAMPLES}

SOURCE MATERIAL (derive scenarios from this — do NOT name or quote the document title):
---
${fullText.slice(0, 45000) || "(no extractable text)"}
---

Generate exactly ${questionCount} unique scenario questions.
Each prompt: 3–5 sentences, named employee, real dilemma from the content above.
Never reference the training document by title. Return JSON only.`;
}
