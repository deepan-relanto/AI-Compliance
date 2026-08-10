/** Module 3 — AI Security, Privacy & Compliance quick-reference infographic. */
import {
  BODY_BOTTOM,
  BODY_TOP,
  C,
  MARGIN,
  card,
  centeredText,
  footer,
  header,
  icon,
  labelledRow,
  paragraph,
  rect,
  sectionLabel,
  stack,
  svgDocument,
} from "./design-kit.mjs";

const LEFT = { x: MARGIN, w: 772 };
const RIGHT = { x: MARGIN + 800, w: 688 };

function columnHeader({ x, y, w, text, color = C.accent }) {
  return {
    svg:
      sectionLabel({ x, y, text, color }) +
      rect({ x, y: y + 22, w, h: 2, r: 1, fill: color, opacity: 0.28 }),
    height: 34,
  };
}

/** Column geometry shared by the classification table head and its rows. */
const CLASS_COLS = { padX: 16, nameW: 130, coversW: 292, gutter: 18 };

function classGeometry(x, w) {
  const coversX = x + CLASS_COLS.padX + CLASS_COLS.nameW;
  const dividerX = coversX + CLASS_COLS.coversW + CLASS_COLS.gutter;
  const ruleX = dividerX + CLASS_COLS.gutter;
  return { coversX, dividerX, ruleX, ruleW: w - (ruleX - x) - CLASS_COLS.padX };
}

function classRow({ x, y, w, name, covers, rule, color, tint }) {
  const { padX } = CLASS_COLS;
  const { coversX, dividerX, ruleX, ruleW } = classGeometry(x, w);

  const coversBlock = paragraph({
    x: coversX,
    y: y + 16,
    text: covers,
    size: 13.8,
    weight: 400,
    color: C.inkSoft,
    maxWidth: CLASS_COLS.coversW,
    lineHeight: 1.4,
  });
  const ruleBlock = paragraph({
    x: ruleX,
    y: y + 16,
    text: rule,
    size: 13.8,
    weight: 600,
    color,
    maxWidth: ruleW,
    lineHeight: 1.4,
  });
  const h = Math.max(72, 16 + Math.max(coversBlock.height, ruleBlock.height) + 16);
  return {
    height: h,
    svg:
      rect({ x, y, w, h, r: 12, fill: tint }) +
      rect({ x, y, w: 5, h, r: 2.5, fill: color }) +
      centeredText({
        x: x + padX,
        y,
        h,
        text: name,
        size: 16.4,
        weight: 700,
        color,
      }) +
      rect({ x: dividerX, y: y + 12, w: 1, h: h - 24, fill: "#ffffff", opacity: 0.9 }) +
      coversBlock.svg +
      ruleBlock.svg,
  };
}

function promptBox({ x, y, w, label, labelColor, tint, stroke, text, note, iconName }) {
  const padX = 16;
  const textBlock = paragraph({
    x: x + padX,
    y: y + 46,
    text,
    size: 13.8,
    weight: 400,
    color: C.ink,
    maxWidth: w - padX * 2,
    lineHeight: 1.45,
    italic: true,
  });
  const noteBlock = paragraph({
    x: x + padX,
    y: y + 46 + textBlock.height + 11,
    text: note,
    size: 12.8,
    weight: 700,
    color: labelColor,
    maxWidth: w - padX * 2,
    lineHeight: 1.35,
  });
  const h = 46 + textBlock.height + 11 + noteBlock.height + 16;
  return {
    height: h,
    svg:
      rect({ x, y, w, h, r: 13, fill: tint, stroke }) +
      icon({ name: iconName, x: x + padX, y: y + 14, size: 18, color: labelColor }) +
      centeredText({
        x: x + padX + 26,
        y: y + 12,
        h: 22,
        text: label,
        size: 12.2,
        weight: 700,
        color: labelColor,
        tracking: 1.3,
      }) +
      textBlock.svg +
      noteBlock.svg,
  };
}

export function render() {
  const parts = [];

  parts.push(
    header({
      moduleLabel: "Module 03  ·  AI Security, Privacy & Compliance",
      title: "Match the class, share the minimum, report fast",
      subtitle:
        "Once data enters a prompt it lives under someone else's systems and settings. Classify before you paste, strip what the tool does not need, and stay inside approved tools.",
    }),
  );

  /* ---------------------------------------------------------- left --- */
  const l = stack(BODY_TOP, BODY_BOTTOM, "M3 left");
  l.add(
    columnHeader({
      x: LEFT.x,
      y: BODY_TOP,
      w: LEFT.w,
      text: "Classify before you paste  ·  then match the tool",
    }),
    10,
  );
  const head = classGeometry(LEFT.x, LEFT.w);
  l.raw(
    `<text x="${head.coversX}" y="${BODY_TOP + 46}" font-family="'Segoe UI', Arial, sans-serif" font-size="11" font-weight="700" fill="${C.inkFaint}" letter-spacing="1.6">WHAT IT COVERS</text>` +
      `<text x="${head.ruleX}" y="${BODY_TOP + 46}" font-family="'Segoe UI', Arial, sans-serif" font-size="11" font-weight="700" fill="${C.inkFaint}" letter-spacing="1.6">AI RULE OF THUMB</text>`,
  );
  l.move(22);
  l.add(
    classRow({
      x: LEFT.x,
      y: l.y,
      w: LEFT.w,
      name: "Public",
      covers: "Website content, press releases, published reports",
      rule: "Generally safe with approved tools",
      color: C.green,
      tint: C.greenSoft,
    }),
    10,
    { sticky: true },
  );
  l.add(
    classRow({
      x: LEFT.x,
      y: l.y,
      w: LEFT.w,
      name: "Internal",
      covers: "Org charts, memos, process docs not meant for outsiders",
      rule: "Approved tools only, per policy",
      color: C.sky,
      tint: C.skySoft,
    }),
    10,
    { sticky: true },
  );
  l.add(
    classRow({
      x: LEFT.x,
      y: l.y,
      w: LEFT.w,
      name: "Confidential",
      covers: "Strategy, financials, contracts, customer lists, source code",
      rule: "Only tools cleared for confidential data — and share the minimum",
      color: C.amber,
      tint: C.amberSoft,
    }),
    10,
    { sticky: true },
  );
  l.add(
    classRow({
      x: LEFT.x,
      y: l.y,
      w: LEFT.w,
      name: "Restricted",
      covers: "Trade secrets, M&A, security details, sensitive personal data",
      rule: "Usually excluded from AI entirely — check first",
      color: C.rose,
      tint: C.roseSoft,
    }),
    16,
    { sticky: true },
  );

  l.add(
    card({
      x: LEFT.x,
      y: l.y,
      w: LEFT.w,
      iconName: "users",
      tint: C.violetSoft,
      iconColor: C.violet,
      title: "Identity and contracts change the rules",
      body: "Names, IDs, health, pay and performance data carry the strictest obligations — and a client contract can forbid AI processing outright, whatever the tool allows.",
      footnote: "Check the contract and the policy before the paste, not after.",
    }),
    16,
  );

  const halfW = (LEFT.w - 20) / 2;
  const risky = promptBox({
    x: LEFT.x,
    y: l.y,
    w: halfW,
    label: "RISKY PROMPT",
    labelColor: C.rose,
    tint: C.roseSoft,
    stroke: "#f4c4c9",
    iconName: "ban",
    text: "“Rewrite this termination letter for John Tan, ID 48812, dismissed over the fraud case…”",
    note: "Real identity + case detail into an outside system.",
  });
  const safer = promptBox({
    x: LEFT.x + halfW + 20,
    y: l.y,
    w: halfW,
    label: "SAFER VERSION",
    labelColor: C.green,
    tint: C.greenSoft,
    stroke: "#bfe4d6",
    iconName: "check",
    text: "“Rewrite a termination template — firm but respectful. Reason: serious policy violation. Use [NAME].”",
    note: "Same task, same quality, no personal data.",
  });
  l.add({
    height: Math.max(risky.height, safer.height),
    svg: risky.svg + safer.svg,
  });
  parts.push(l.done({ justify: true }));

  /* --------------------------------------------------------- right --- */
  const r = stack(BODY_TOP, BODY_BOTTOM, "M3 right");
  r.add(
    columnHeader({
      x: RIGHT.x,
      y: BODY_TOP,
      w: RIGHT.w,
      text: "Safe prompting in five moves",
      color: C.brand,
    }),
    12,
  );

  const moves = [
    ["1", "Minimum", "Paste the paragraph, not the contract; the error, not the codebase."],
    ["2", "Anonymize", "Replace names with Client A, Product X, Region 1 — keep your key offline."],
    ["3", "Generalize", "Ask the question in abstract form when no client detail is needed."],
    ["4", "Synthetic", "Build templates on fictional data, then apply them inside approved systems."],
    ["5", "Check files", "Uploads and screenshots carry hidden tabs, metadata and stray names."],
  ];
  for (const [i, [num, title, body]] of moves.entries()) {
    r.add(
      labelledRow({
        x: RIGHT.x,
        y: r.y,
        w: RIGHT.w,
        badgeText: num,
        title,
        body,
        badgeFill: C.brand,
        badgeSize: 28,
        badgeRadius: 9,
        titleSize: 15.4,
        bodySize: 13.8,
      }),
      i === moves.length - 1 ? 20 : 14,
      { sticky: true },
    );
  }

  r.add(
    columnHeader({
      x: RIGHT.x,
      y: r.y,
      w: RIGHT.w,
      text: "Two habits that prevent most incidents",
      color: C.accent,
    }),
    12,
  );

  const cardW = (RIGHT.w - 20) / 2;
  const shadow = card({
    x: RIGHT.x,
    y: r.y,
    w: cardW,
    iconName: "ban",
    tint: C.white,
    iconColor: C.rose,
    fill: C.roseSoft,
    stroke: "#f4c4c9",
    title: "No shadow AI",
    titleColor: C.rose,
    body: "Personal accounts, unvetted browser extensions and free websites put company data outside every control.",
  });
  const mistake = card({
    x: RIGHT.x + cardW + 20,
    y: r.y,
    w: cardW,
    iconName: "clock",
    tint: C.white,
    iconColor: C.amber,
    fill: C.amberSoft,
    stroke: "#f3d6a8",
    title: "If a mistake happens",
    titleColor: C.amber,
    body: "Tell your manager and security contact in minutes. Never delete to hide it — concealment is the real offence.",
  });
  const pairH = Math.max(shadow.height, mistake.height);
  r.add({ height: pairH, svg: shadow.svg + mistake.svg }, 18, { sticky: true });

  const testY = r.y;
  const testBody = paragraph({
    x: RIGHT.x + 62,
    y: testY + 44,
    text: "If you would not post it on the company's public website, it is not Public data. When unsure, treat it as the higher class.",
    size: 13.8,
    weight: 400,
    color: C.inkSoft,
    maxWidth: RIGHT.w - 62 - 20,
    lineHeight: 1.42,
  });
  const testH = 44 + testBody.height + 20;
  r.add({
    height: testH,
    svg:
      rect({
        x: RIGHT.x,
        y: testY,
        w: RIGHT.w,
        h: testH,
        r: 16,
        fill: C.brandSoft,
        stroke: "#cdcfee",
      }) +
      icon({ name: "compass", x: RIGHT.x + 20, y: testY + 18, size: 26, color: C.brand }) +
      paragraph({
        x: RIGHT.x + 62,
        y: testY + 18,
        text: "The public-website test",
        size: 16.5,
        weight: 700,
        color: C.brand,
        maxWidth: RIGHT.w - 82,
      }).svg +
      testBody.svg,
  });
  parts.push(r.done({ justify: true, maxExtra: 60 }));

  parts.push(
    footer({
      text: "Sensitivity lives in content and combinations, not word count — and polish is no longer proof that something is legitimate.",
      right: "MODULE 03 REFERENCE",
    }),
  );

  return svgDocument(parts);
}
