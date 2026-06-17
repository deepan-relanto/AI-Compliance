const RELANTO_NAMES = [
  "Ananya",
  "Rahul",
  "Priya",
  "Vikram",
  "Meera",
  "Arjun",
  "Kavya",
  "Sanjay",
  "Nalini",
  "Deepak",
];

const BANNED_PROMPT_PATTERNS = [
  /\byou are working on\b/i,
  /\bwhile completing\b/i,
  /\bduring ["']/i,
  /\bthis training module\b/i,
  /\bthe ppt\b/i,
  /\bslide deck titled\b/i,
  /\btraining checkpoint\b/i,
];

/** Reject prompts that cite the module/PPT title or use lazy templates. */
export function isAcceptableMcqPrompt(
  prompt: string,
  moduleTitle: string,
): boolean {
  const text = prompt.trim();
  if (text.length < 90) return false;

  const title = moduleTitle.trim();
  if (title.length >= 3) {
    const titleLower = title.toLowerCase();
    if (text.toLowerCase().includes(titleLower)) return false;
    // Quoted variant
    if (text.includes(`"${title}"`) || text.includes(`'${title}'`)) return false;
  }

  if (BANNED_PROMPT_PATTERNS.some((re) => re.test(text))) return false;

  const hasQuestion =
    /\?\s*$/.test(text) ||
    /what should|what is the best|what must|how should/i.test(text);
  if (!hasQuestion) return false;

  return true;
}

export function relantoNameForIndex(index: number): string {
  return RELANTO_NAMES[index % RELANTO_NAMES.length];
}

/** Build a scenario question from PDF excerpt — never uses module title. */
export function buildRelantoScenarioPrompt(
  topic: string,
  index: number,
): string {
  const name = relantoNameForIndex(index);
  const policy = topic.replace(/\s+/g, " ").trim().slice(0, 200);
  const policyClause = policy
    ? ` Company policy from today's training: ${policy}`
    : "";

  const templates = [
    `${name} is preparing for a client status call from a co-working space on public Wi‑Fi.${policyClause} A teammate says VPN is optional if the client portal uses HTTPS. What should ${name} do?`,
    `${name} receives a USB drive from a vendor at a client site.${policyClause} The vendor offers to install a "quick fix" utility on ${name}'s laptop. What is the best course of action?`,
    `${name} needs to finish deliverables tonight and considers copying client files to a personal cloud folder.${policyClause} What should ${name} do?`,
    `${name} gets a Teams message with a link to "reset your password" — the URL domain is one character off from Microsoft.${policyClause} What should ${name} do first?`,
    `${name}'s manager asks them to share login credentials so a offshore colleague can unblock a ticket faster.${policyClause} What should ${name} do?`,
    `${name} wants to paste a client error log into a public AI chatbot to draft a response faster.${policyClause} What is the most compliant action?`,
    `${name} finds an unattended printed client report in a shared printer tray.${policyClause} What should ${name} do?`,
    `${name} is asked to join a client call from a personal phone because the company laptop audio failed.${policyClause} They plan to screen-share sensitive data. What should ${name} do first?`,
  ];

  return templates[index % templates.length];
}
