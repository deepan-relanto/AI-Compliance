/**
 * Module 4 — Prompt Engineering Essentials.
 *
 * Rebuilt from scratch: the five building blocks run across the top as the
 * hero, with the before/after, the four quality moves and the pitfalls below.
 */
import {
  BODY_BOTTOM,
  BODY_TOP,
  C,
  MARGIN,
  W,
  centeredText,
  footer,
  header,
  icon,
  iconTile,
  labelledRow,
  paragraph,
  rect,
  sectionLabel,
  stack,
  svgDocument,
  textWidth,
} from "./design-kit.mjs";

const BLOCKS = [
  {
    n: "1",
    name: "Task",
    ask: "What exactly should it do?",
    example: "Draft a one-page project status update.",
    color: C.brand,
    tint: C.brandSoft,
    iconName: "target",
  },
  {
    n: "2",
    name: "Context",
    ask: "What background does it need?",
    example: "Vendor slipped two weeks; the steering committee reads it.",
    color: C.teal,
    tint: C.tealSoft,
    iconName: "brief",
  },
  {
    n: "3",
    name: "Format",
    ask: "What should output look like?",
    example: "Three sections, 300 words, summary first.",
    color: C.violet,
    tint: C.violetSoft,
    iconName: "list",
  },
  {
    n: "4",
    name: "Constraints",
    ask: "What rules apply?",
    example: "Neutral tone, British English, no speculation.",
    color: C.amber,
    tint: C.amberSoft,
    iconName: "filter",
  },
  {
    n: "5",
    name: "Examples",
    ask: "What does good look like?",
    example: "Reuse last month's update as the style reference.",
    color: C.green,
    tint: C.greenSoft,
    iconName: "layers",
  },
];

const COL_A = { x: MARGIN, w: 456 };
const COL_B = { x: MARGIN + 482, w: 456 };
const COL_C = { x: MARGIN + 964, w: 524 };

function columnHeader({ x, y, w, text, color = C.accent }) {
  return {
    svg:
      sectionLabel({ x, y, text, color }) +
      rect({ x, y: y + 22, w, h: 2, r: 1, fill: color, opacity: 0.28 }),
    height: 34,
  };
}

function blockCard({ x, y, w, h, block }) {
  const padX = 16;
  const textW = w - padX * 2;
  const askBlock = paragraph({
    x: x + padX,
    y: y + 84,
    text: block.ask,
    size: 13,
    weight: 400,
    color: C.inkSoft,
    maxWidth: textW,
    lineHeight: 1.34,
  });
  const exampleTop = y + 84 + askBlock.height + 11;
  const exampleBody = paragraph({
    x: x + padX + 12,
    y: exampleTop + 25,
    text: `“${block.example}”`,
    size: 12.4,
    weight: 600,
    color: C.ink,
    maxWidth: textW - 24,
    lineHeight: 1.38,
  });
  const clipId = `block-${block.n}`;
  return (
    rect({ x, y, w, h, r: 15, fill: C.white, stroke: C.line }) +
    `<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="15"/></clipPath>` +
    `<g clip-path="url(#${clipId})">${rect({ x, y, w, h: 6, fill: block.color })}</g>` +
    iconTile({
      name: block.iconName,
      x: x + padX,
      y: y + 18,
      size: 34,
      fill: block.tint,
      color: block.color,
      glyph: 20,
    }) +
    `<text x="${x + w - padX}" y="${y + 44}" font-family="'Segoe UI', Arial, sans-serif" font-size="28" font-weight="700" fill="${block.tint}" text-anchor="end">${block.n}</text>` +
    centeredText({
      x: x + padX,
      y: y + 56,
      h: 26,
      text: block.name,
      size: 19,
      weight: 700,
      color: C.ink,
    }) +
    askBlock.svg +
    rect({
      x: x + padX,
      y: exampleTop,
      w: textW,
      h: y + h - 15 - exampleTop,
      r: 11,
      fill: block.tint,
    }) +
    `<text x="${x + padX + 12}" y="${exampleTop + 16}" font-family="'Segoe UI', Arial, sans-serif" font-size="9.6" font-weight="700" fill="${block.color}" letter-spacing="1.4">EXAMPLE</text>` +
    exampleBody.svg
  );
}

function promptSample({ x, y, w, label, labelColor, tint, stroke, iconName, text, note }) {
  const padX = 16;
  const textBlock = paragraph({
    x: x + padX,
    y: y + 42,
    text,
    size: 13.2,
    weight: 400,
    color: C.ink,
    maxWidth: w - padX * 2,
    lineHeight: 1.45,
    italic: true,
  });
  const noteBlock = paragraph({
    x: x + padX,
    y: y + 42 + textBlock.height + 10,
    text: note,
    size: 12.5,
    weight: 700,
    color: labelColor,
    maxWidth: w - padX * 2,
    lineHeight: 1.36,
  });
  const h = 42 + textBlock.height + 10 + noteBlock.height + 16;
  return {
    height: h,
    svg:
      rect({ x, y, w, h, r: 13, fill: tint, stroke }) +
      icon({ name: iconName, x: x + padX, y: y + 13, size: 18, color: labelColor }) +
      centeredText({
        x: x + padX + 26,
        y: y + 11,
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

/** Compact effort-vs-stakes calibration bar. */
function stakesBar({ x, y, w }) {
  const rows = [
    ["Quick factual question", "one clear sentence", C.green, C.greenSoft],
    ["Client, people or board work", "full five-block brief", C.rose, C.roseSoft],
  ];
  const titleH = 26;
  let cursor = y + titleH + 8;
  const bars = [];
  for (const [left, right, color, tint] of rows) {
    bars.push(
      rect({ x, y: cursor, w, h: 34, r: 9, fill: tint }) +
        rect({ x, y: cursor, w: 4, h: 34, r: 2, fill: color }) +
        centeredText({
          x: x + 14,
          y: cursor,
          h: 34,
          text: left,
          size: 13.2,
          weight: 700,
          color,
        }) +
        centeredText({
          x: x + w - 14,
          y: cursor,
          h: 34,
          text: right,
          size: 13,
          weight: 400,
          color: C.inkSoft,
          anchor: "end",
        }),
    );
    cursor += 38;
  }
  return {
    height: cursor - 4 - y - 4,
    svg:
      icon({ name: "scale", x, y: y + 3, size: 20, color: C.brand }) +
      centeredText({
        x: x + 28,
        y,
        h: titleH,
        text: "Match effort to the stakes",
        size: 15.4,
        weight: 700,
        color: C.ink,
      }) +
      bars.join(""),
  };
}

function pitfallRow({ x, y, w, title, body }) {
  const iconSize = 20;
  const textX = x + iconSize + 12;
  const textW = w - iconSize - 12;
  const titleBlock = paragraph({
    x: textX,
    y,
    text: title,
    size: 14.4,
    weight: 700,
    color: C.ink,
    maxWidth: textW,
    lineHeight: 1.2,
  });
  const bodyBlock = paragraph({
    x: textX,
    y: y + titleBlock.height + 3,
    text: body,
    size: 12.9,
    weight: 400,
    color: C.inkSoft,
    maxWidth: textW,
    lineHeight: 1.38,
  });
  return {
    height: titleBlock.height + 3 + bodyBlock.height,
    svg:
      `<circle cx="${x + 10}" cy="${y + 10}" r="10" fill="${C.roseSoft}"/>` +
      icon({ name: "cross", x: x + 4, y: y + 4, size: 12, color: C.rose, strokeWidth: 2.1 }) +
      titleBlock.svg +
      bodyBlock.svg,
  };
}

export function render() {
  const parts = [];

  parts.push(
    header({
      moduleLabel: "Module 04  ·  Prompt Engineering Essentials",
      title: "Brief the AI like a capable new colleague",
      subtitle:
        "There are no magic phrases. Output quality tracks the quality of your instructions — so cover the five blocks, then refine instead of restarting.",
    }),
  );

  /* --------------------------------------------------- hero: 5 blocks --- */
  const labelW = textWidth(
    "The five blocks every strong prompt covers".toUpperCase(),
    12.5,
    700,
    2.1,
  );
  parts.push(
    sectionLabel({ x: MARGIN, y: BODY_TOP, text: "The five blocks every strong prompt covers" }),
    rect({
      x: MARGIN + labelW + 18,
      y: BODY_TOP + 8,
      w: W - MARGIN * 2 - labelW - 18,
      h: 2,
      r: 1,
      fill: C.accent,
      opacity: 0.28,
    }),
  );

  const heroY = BODY_TOP + 30;
  const heroH = 190;
  const gap = 14;
  const blockW = (W - MARGIN * 2 - gap * (BLOCKS.length - 1)) / BLOCKS.length;
  BLOCKS.forEach((block, i) => {
    parts.push(
      blockCard({
        x: MARGIN + i * (blockW + gap),
        y: heroY,
        w: blockW,
        h: heroH,
        block,
      }),
    );
    if (i < BLOCKS.length - 1) {
      const cx = MARGIN + i * (blockW + gap) + blockW + gap / 2;
      parts.push(
        `<path d="M${cx - 3.5} ${heroY + heroH / 2 - 5} l4 5 -4 5" fill="none" stroke="${C.line}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
    }
  });

  const lowerTop = heroY + heroH + 30;

  /* ------------------------------------------------------- column A --- */
  const a = stack(lowerTop, BODY_BOTTOM, "M4 col A");
  a.add(
    columnHeader({
      x: COL_A.x,
      y: lowerTop,
      w: COL_A.w,
      text: "One line vs a real brief",
    }),
    12,
  );
  a.add(
    promptSample({
      x: COL_A.x,
      y: a.y,
      w: COL_A.w,
      label: "ONE-LINE PROMPT",
      labelColor: C.rose,
      tint: C.roseSoft,
      stroke: "#f4c4c9",
      iconName: "cross",
      text: "“Write something about our project delay.”",
      note: "No audience, no facts, no format — the model has to guess all three.",
    }),
    12,
    { sticky: true },
  );
  a.add(
    promptSample({
      x: COL_A.x,
      y: a.y,
      w: COL_A.w,
      label: "BRIEFED PROMPT",
      labelColor: C.green,
      tint: C.greenSoft,
      stroke: "#bfe4d6",
      iconName: "check",
      text: "“Draft a 300-word status update for the steering committee. The vendor slipped two weeks; mitigation is agreed. Three sections, neutral tone, no speculation.”",
      note: "Same effort to type. A usable first draft instead of filler.",
    }),
    16,
  );
  a.add(stakesBar({ x: COL_A.x, y: a.y, w: COL_A.w }));
  parts.push(a.done({ justify: true }));

  /* ------------------------------------------------------- column B --- */
  const b = stack(lowerTop, BODY_BOTTOM, "M4 col B");
  b.add(
    columnHeader({
      x: COL_B.x,
      y: lowerTop,
      w: COL_B.w,
      text: "Four moves that lift quality",
      color: C.brand,
    }),
    14,
  );
  const moves = [
    ["compass", "Ground it in your source", "Paste the real material — source grounding is your biggest accuracy lever."],
    ["user", "Assign a role", "“Act as a sceptical CFO” surfaces objections a neutral voice never raises."],
    ["list", "Structure the output", "Name the sections, length and order you want."],
    ["layers", "Show an example", "One sample beats five adjectives every time."],
  ];
  for (const [i, [iconName, title, body]] of moves.entries()) {
    const row = labelledRow({
      x: COL_B.x,
      y: b.y,
      w: COL_B.w,
      badgeText: "",
      title,
      body,
      badgeFill: "none",
      badgeSize: 32,
      titleSize: 15.2,
      bodySize: 13.4,
    });
    b.raw(
      iconTile({
        name: iconName,
        x: COL_B.x,
        y: b.y - 4,
        size: 32,
        fill: C.brandSoft,
        color: C.brand,
        glyph: 19,
      }),
    );
    b.add(row, i === moves.length - 1 ? 18 : 14, { sticky: i === 0 });
  }

  const refineY = b.y;
  const refineBody = paragraph({
    x: COL_B.x + 18,
    y: refineY + 44,
    text: "“Keep the structure, rewrite section two with the delay detail.” Starting over throws away the half that already worked.",
    size: 13.4,
    weight: 400,
    color: C.inkSoft,
    maxWidth: COL_B.w - 36,
    lineHeight: 1.42,
  });
  const refineH = 44 + refineBody.height + 18;
  b.add({
    height: refineH,
    svg:
      rect({
        x: COL_B.x,
        y: refineY,
        w: COL_B.w,
        h: refineH,
        r: 14,
        fill: C.panel,
        stroke: C.line,
      }) +
      icon({ name: "loop", x: COL_B.x + 18, y: refineY + 16, size: 20, color: C.accent }) +
      centeredText({
        x: COL_B.x + 46,
        y: refineY + 14,
        h: 24,
        text: "Refine — don't restart",
        size: 15.6,
        weight: 700,
        color: C.ink,
      }) +
      refineBody.svg,
  });
  parts.push(b.done({ justify: true }));

  /* ------------------------------------------------------- column C --- */
  const c = stack(lowerTop, BODY_BOTTOM, "M4 col C");
  c.add(
    columnHeader({
      x: COL_C.x,
      y: lowerTop,
      w: COL_C.w,
      text: "Pitfalls to avoid",
      color: C.rose,
    }),
    12,
  );
  const pitfalls = [
    ["Mind-reader assumption", "No paste, no context — the model cannot invent your facts."],
    ["Kitchen-sink prompt", "Too many jobs at once. Split it into clear, separate tasks."],
    ["Adjective trap", "“Make it punchy and professional” — show an example instead."],
    ["One-shot surrender", "First draft weak? Refine once before blaming the tool."],
    ["Stale conversation", "New task means a new chat. Old context quietly misleads."],
  ];
  for (const [i, [title, body]] of pitfalls.entries()) {
    c.add(
      pitfallRow({ x: COL_C.x, y: c.y, w: COL_C.w, title, body }),
      i === pitfalls.length - 1 ? 18 : 12,
      { sticky: i === 0 },
    );
  }

  const guardY = c.y;
  const guardBody = paragraph({
    x: COL_C.x + 50,
    y: guardY + 44,
    text: "A perfect prompt does not replace verification, fairness checks, approved tools or minimising the data you paste.",
    size: 13.4,
    weight: 400,
    color: C.inkSoft,
    maxWidth: COL_C.w - 70,
    lineHeight: 1.42,
  });
  const guardH = 44 + guardBody.height + 18;
  c.add({
    height: guardH,
    svg:
      rect({
        x: COL_C.x,
        y: guardY,
        w: COL_C.w,
        h: guardH,
        r: 14,
        fill: C.brandSoft,
        stroke: "#cdcfee",
      }) +
      icon({ name: "shieldCheck", x: COL_C.x + 16, y: guardY + 16, size: 22, color: C.brand }) +
      centeredText({
        x: COL_C.x + 50,
        y: guardY + 14,
        h: 24,
        text: "Modules 1–3 still apply",
        size: 15.6,
        weight: 700,
        color: C.brand,
      }) +
      guardBody.svg,
  });
  parts.push(c.done({ justify: true }));

  parts.push(
    footer({
      text: "Before you send: scan for Task · Context · Format · Constraints · Examples — every missing block is a guess the AI has to make.",
      right: "MODULE 04 REFERENCE",
    }),
  );

  return svgDocument(parts);
}
