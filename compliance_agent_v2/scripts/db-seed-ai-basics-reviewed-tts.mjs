/**
 * Publish reviewed, human-authored narration for the live AI basics course.
 * No LLM is called. Safe to rerun: the sandbox's narration rows are replaced
 * transactionally with the reviewed slide-level records below.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const SOURCE_MODULE_ID = "course-ai-basics-1783575957097";
const SANDBOX_ID = `tts-${SOURCE_MODULE_ID}`;

function loadEnv() {
  const raw = readFileSync(join(root, ".env"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

const narrations = [
  {
    stepType: "pdf",
    stepOrder: 1,
    slideIndex: 0,
    title: "AI Fundamentals and Terminology",
    script:
      "Welcome to AI Fundamentals and Terminology. This module builds a practical foundation for using artificial intelligence at work, with no technical background required. You will learn the language, opportunities, limitations, and review habits needed to use AI responsibly.",
  },
  {
    stepType: "pdf",
    stepOrder: 1,
    slideIndex: 1,
    title: "Executive Summary",
    script:
      "Shared AI literacy is now a business requirement. Employees already use AI, but inconsistent vocabulary and limited awareness of failure modes can create silent risk. A common foundation improves prompts, reduces avoidable errors, and helps teams adopt AI productively while keeping human judgment in control.",
  },
  {
    stepType: "pdf",
    stepOrder: 1,
    slideIndex: 2,
    title: "Course Overview",
    script:
      "We begin with a clear overview of what this course will accomplish. The goal is to give every employee a shared understanding of AI, its workplace relevance, and the practical responsibilities that come with using it. This foundation will help you make better decisions throughout the rest of the module.",
  },
  {
    stepType: "pdf",
    stepOrder: 1,
    slideIndex: 3,
    title: "Why AI Literacy Matters",
    script:
      "Artificial intelligence is already part of everyday work, whether through writing tools, meeting summaries, search, or customer systems. Without shared literacy, teams risk miscommunication, misplaced trust, and missed opportunities. By the end of this module, you should be able to explain core concepts, identify useful applications, recognize limitations, and review AI output responsibly.",
  },
  {
    stepType: "pdf",
    stepOrder: 1,
    slideIndex: 4,
    title: "Introduction",
    script:
      "This section introduces artificial intelligence in practical, non-technical terms. We will connect AI to familiar workplace tools, separate reality from common misconceptions, and establish the mindset needed to use these systems safely. Think of this as the starting point for confident, responsible AI use.",
  },
  {
    stepType: "pdf",
    stepOrder: 1,
    slideIndex: 5,
    title: "AI as a Workplace Capability",
    script:
      "Traditional software follows precise rules and usually produces the same result each time. AI systems handle broader and more variable tasks, but their answers can change and may be confidently wrong. Treat AI like a fast, well-read colleague: valuable for assistance, but always subject to human review before important work is used.",
  },
  {
    stepType: "pdf",
    stepOrder: 1,
    slideIndex: 6,
    title: "Common AI Myths",
    script:
      "Several common myths lead to unsafe AI use. AI does not think like a person, it is not always correct, and it does not remove human accountability. Clear instructions, approved tools, and informed review matter far more than technical expertise, so every employee can use AI effectively when these safeguards are followed.",
  },
  {
    stepType: "pdf",
    stepOrder: 1,
    slideIndex: 7,
    title: "Key Concepts",
    script:
      "We will now build the vocabulary needed to discuss AI clearly. This section connects artificial intelligence, machine learning, generative AI, large language models, assistants, and automation. Understanding how these ideas relate makes it easier to select the right tool and recognize where human oversight is necessary.",
  },
  {
    stepType: "pdf",
    stepOrder: 1,
    slideIndex: 8,
    title: "The AI Concept Map",
    script:
      "Artificial intelligence is the broad category of systems that perform tasks associated with human intelligence. Machine learning is a subset that learns patterns from data, while generative AI creates new content. Large language models are generative systems focused on language, and they power many chat assistants, summarizers, and document tools used at work.",
  },
  {
    stepType: "pdf",
    stepOrder: 1,
    slideIndex: 9,
    title: "Automation, AI, and Assistants",
    script:
      "Automation is best for structured, repeatable processes governed by fixed rules. AI is better suited to language, variation, and ambiguity, but its outputs vary and require review. A useful rule is simple: use automation for predictable checklists, and use AI for judgment-oriented assistance only when a human remains accountable.",
  },
  {
    stepType: "pdf",
    stepOrder: 1,
    slideIndex: 10,
    title: "Training Data and Hallucinations",
    script:
      "AI models learn patterns from historical training data, so they may not know recent events or private company information unless that context is provided. They can also generate plausible but fabricated facts, a behavior known as hallucination. Always verify names, dates, statistics, and citations against authoritative sources before using them in decisions or client-facing work.",
  },
  {
    stepType: "pdf",
    stepOrder: 1,
    slideIndex: 11,
    title: "Prompts, Tokens, and Context",
    script:
      "The quality of an AI response depends heavily on the instructions and context you provide. Strong prompts define the task, audience, format, tone, and constraints, while grounded context gives the model the facts it needs. For large documents, work in manageable sections and provide the relevant source material instead of expecting the AI to know internal details.",
  },
  {
    stepType: "pdf",
    stepOrder: 1,
    slideIndex: 12,
    title: "Fine-Tuning",
    script:
      "Fine-tuning adapts a general AI model to a specific domain using carefully selected specialist data. Technical teams manage the training, evaluation, and deployment process, while employees benefit from an assistant that understands company terminology and workflows more accurately. Even a specialized model still requires governance and human review.",
  },
  {
    stepType: "pdf",
    stepOrder: 1,
    slideIndex: 13,
    title: "Workplace Use Cases",
    script:
      "Across functions, AI is most valuable for first drafts, summarization, brainstorming, translation, and organizing information. Human resources, sales, marketing, finance, project management, and support teams can all save time with these patterns. The consistent boundary is that AI accelerates preparation, while people retain judgment, quality control, and final approval.",
  },
  {
    stepType: "pdf",
    stepOrder: 1,
    slideIndex: 14,
    title: "AI Risks and Governance",
    script:
      "Fluent output is not the same as accurate output. AI may reflect bias, rely on stale knowledge, fail at exact arithmetic, or produce convincing errors without recognizing their consequences. Governance controls should match these risks, and responsibility for every decision remains with the employee and organization using the result.",
  },
  {
    stepType: "pdf",
    stepOrder: 1,
    slideIndex: 15,
    title: "Human-in-the-Loop Control",
    script:
      "Human judgment is the final control in every AI-assisted workflow. Review the output, verify important facts, use authoritative sources, and work only with approved tools when information is sensitive. AI can speed up a draft, but a person must decide whether the result is accurate, appropriate, and ready to publish.",
  },
  {
    stepType: "pdf",
    stepOrder: 1,
    slideIndex: 16,
    title: "Enterprise AI Maturity",
    script:
      "Enterprise AI maturity begins with awareness and develops through shared literacy, practical proficiency, and responsible leadership. This module moves employees toward a common vocabulary and consistent review habits. Those capabilities form the foundation for advanced prompting, workflow integration, governance, and strategy.",
  },
  {
    stepType: "pdf",
    stepOrder: 1,
    slideIndex: 17,
    title: "Six Operating Principles",
    script:
      "Six principles support safe and effective AI use. Confidence does not guarantee accuracy, context improves relevance, and the right tool must match the task. Clear prompts, awareness of predictable failure modes, and continued human accountability turn AI from an uncontrolled risk into a useful workplace capability.",
  },
  {
    stepType: "pdf",
    stepOrder: 1,
    slideIndex: 18,
    title: "Apply What You Learned",
    script:
      "You have completed the foundation of enterprise AI awareness. Apply these concepts in your next approved AI interaction by giving clear context, checking the result, and taking responsibility for the final output. The next modules will build deeper skills in prompting, workplace tools, governance, and AI strategy.",
  },
  {
    stepType: "scenarios",
    stepOrder: 2,
    slideIndex: 0,
    title: "Scenario-Based Learning",
    script:
      "This practice section turns the concepts into realistic workplace decisions. Choose the department closest to your role, examine the situation, and decide how you would respond before viewing the recommended approach. Focus on the reasoning behind each choice, because the same control habits apply across functions.",
  },
  {
    stepType: "scenarios",
    stepOrder: 2,
    slideIndex: 1,
    title: "Choose Your Department",
    script:
      "Select the department that best matches your work to begin a relevant scenario. As you move through the situation, identify where AI adds value, what could go wrong, and which facts require verification. Compare your decision with the recommendation and carry the takeaway into your daily work.",
  },
  {
    stepType: "mindmap",
    stepOrder: 4,
    slideIndex: 0,
    title: "AI Fundamentals Mind Map",
    rawText:
      "Enterprise AI fundamentals: core concepts, terminology, automation versus AI, workplace applications, limitations, risks, and best practices.",
    script:
      "This mind map brings the course together in one connected view. Explore how core concepts and terminology link to workplace applications, risks, and best practices. The central message is that useful AI adoption combines clear prompts and context with verification, approved tools, protected data, and human accountability.",
  },
];

loadEnv();
const url =
  process.env.DATABASE_URL?.trim() ||
  process.env.postgres_neon?.trim() ||
  process.env.POSTGRES_NEON?.trim();
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { ssl: "require", max: 1 });

try {
  const existingRows = await sql`
    SELECT source_step_type, slide_index, raw_text
    FROM tts_course_script_segments
    WHERE module_id = ${SANDBOX_ID}
      AND fragment_index = 0
    ORDER BY step_order, slide_index
  `;
  const rawBySlide = new Map(
    existingRows.map((row) => [
      `${String(row.source_step_type)}:${Number(row.slide_index)}`,
      String(row.raw_text ?? ""),
    ]),
  );

  await sql.begin(async (tx) => {
    await tx`DELETE FROM tts_course_script_segments WHERE module_id = ${SANDBOX_ID}`;

    for (const narration of narrations) {
      const rawText =
        narration.rawText ??
        rawBySlide.get(`${narration.stepType}:${narration.slideIndex}`) ??
        narration.title;
      await tx`
        INSERT INTO tts_course_script_segments (
          module_id, source_step_type, step_order, beat_key, slide_index,
          fragment_index, slide_title, raw_text, script_text
        )
        VALUES (
          ${SANDBOX_ID},
          ${narration.stepType},
          ${narration.stepOrder},
          ${`${narration.stepType}:${narration.stepOrder}:${narration.slideIndex}:0`},
          ${narration.slideIndex},
          0,
          ${narration.title},
          ${rawText},
          ${narration.script}
        )
      `;
    }

    await tx`
      UPDATE tts_course_modules
      SET tts_enabled = TRUE,
          avatar_enabled = TRUE,
          script_status = 'reviewed',
          updated_at = NOW()
      WHERE id = ${SANDBOX_ID}
        AND source_module_id = ${SOURCE_MODULE_ID}
    `;
  });

  const summary = await sql`
    SELECT
      tts_enabled,
      avatar_enabled,
      script_status,
      (SELECT COUNT(*)::int FROM tts_course_script_segments s WHERE s.module_id = t.id) AS scripts,
      (SELECT MIN(length(script_text))::int FROM tts_course_script_segments s WHERE s.module_id = t.id) AS shortest,
      (SELECT MAX(length(script_text))::int FROM tts_course_script_segments s WHERE s.module_id = t.id) AS longest
    FROM tts_course_modules t
    WHERE id = ${SANDBOX_ID}
  `;
  console.log("Published reviewed narration:", summary[0]);
} catch (error) {
  console.error("Failed to seed reviewed narration:", error);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
