/** Module 2 — Responsible AI & Ethics quick-reference infographic. */
import {
  BODY_BOTTOM,
  BODY_TOP,
  C,
  MARGIN,
  W,
  card,
  centeredText,
  footer,
  header,
  icon,
  labelledRow,
  paragraph,
  pill,
  rect,
  sectionLabel,
  stack,
  svgDocument,
} from "./design-kit.mjs";

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

function stakeRow({ x, y, w, level, work, action, color, tint }) {
  const padX = 15;
  const labelW = 132;
  const textX = x + padX + labelW;
  const textW = w - padX * 2 - labelW;
  const workBlock = paragraph({
    x: textX,
    y: y + 15,
    text: work,
    size: 14.8,
    weight: 700,
    color: C.ink,
    maxWidth: textW,
    lineHeight: 1.22,
  });
  const actionBlock = paragraph({
    x: textX,
    y: y + 15 + workBlock.height + 5,
    text: action,
    size: 13.6,
    weight: 400,
    color: C.inkSoft,
    maxWidth: textW,
    lineHeight: 1.4,
  });
  const h = Math.max(76, 15 + workBlock.height + 5 + actionBlock.height + 15);
  return {
    height: h,
    svg:
      rect({ x, y, w, h, r: 12, fill: tint }) +
      rect({ x, y, w: 4, h, r: 2, fill: color }) +
      centeredText({
        x: x + padX,
        y,
        h,
        text: level,
        size: 14.2,
        weight: 700,
        color,
        tracking: 0.4,
      }) +
      workBlock.svg +
      actionBlock.svg,
  };
}

function tagCloud({ x, y, w, items, color, fill }) {
  let cx = x;
  let cy = y;
  const parts = [];
  for (const item of items) {
    const p = pill({
      x: cx,
      y: cy,
      text: item,
      size: 12.4,
      weight: 700,
      color,
      fill,
      h: 27,
      padX: 12,
      tracking: 0.3,
    });
    if (cx + p.w > x + w) {
      cx = x;
      cy += 34;
      parts.push(
        pill({
          x: cx,
          y: cy,
          text: item,
          size: 12.4,
          weight: 700,
          color,
          fill,
          h: 27,
          padX: 12,
          tracking: 0.3,
        }).svg,
      );
      cx += p.w + 8;
      continue;
    }
    parts.push(p.svg);
    cx += p.w + 8;
  }
  return { svg: parts.join(""), height: cy - y + 27 };
}

export function render() {
  const parts = [];

  parts.push(
    header({
      moduleLabel: "Module 02  ·  Responsible AI & Ethics",
      title: "You own every AI-assisted outcome",
      subtitle:
        "Principles are not posters — they are what you do at the keyboard. Run the PACT check before any sensitive AI use, match oversight to the stakes, and never cross the deception line.",
    }),
  );

  /* ------------------------------------------------------- column A --- */
  const a = stack(BODY_TOP, BODY_BOTTOM, "M2 col A");
  a.add(
    columnHeader({
      x: COL_A.x,
      y: BODY_TOP,
      w: COL_A.w,
      text: "Principles that show up in daily work",
    }),
    8,
  );
  a.add(
    card({
      x: COL_A.x,
      y: a.y,
      w: COL_A.w,
      iconName: "stamp",
      tint: C.brandSoft,
      iconColor: C.brand,
      title: "Accountability stays with you",
      body: "You can delegate the typing to AI. You cannot delegate responsibility for what you send.",
      footnote: "Your sign-off means you checked it.",
    }),
    14,
    { sticky: true },
  );
  a.add(
    card({
      x: COL_A.x,
      y: a.y,
      w: COL_A.w,
      iconName: "scale",
      tint: C.tealSoft,
      iconColor: C.teal,
      title: "Fairness needs an active check",
      body: "Bias enters through training data and shows up subtly in people-related output.",
      footnote: "Review shortlists, ratings and scores by hand.",
    }),
  );
  a.add(
    card({
      x: COL_A.x,
      y: a.y,
      w: COL_A.w,
      iconName: "eye",
      iconExtras: ["eyeDot"],
      tint: C.violetSoft,
      iconColor: C.violet,
      title: "Transparency and explainability",
      body: "Disclose meaningful AI involvement. “The algorithm decided” is never an explanation.",
      footnote: "Can't explain it without the score? It isn't ready.",
    }),
  );
  a.add(
    card({
      x: COL_A.x,
      y: a.y,
      w: COL_A.w,
      iconName: "users",
      tint: C.skySoft,
      iconColor: C.sky,
      title: "Meaningful human oversight",
      body: "Never rubber-stamp an AI suggestion. Keep the authority — and the time — to overrule it.",
    }),
  );
  parts.push(a.done({ justify: true }));

  /* ------------------------------------------------------- column B --- */
  const b = stack(BODY_TOP, BODY_BOTTOM, "M2 col B");
  b.add(
    columnHeader({
      x: COL_B.x,
      y: BODY_TOP,
      w: COL_B.w,
      text: "The PACT check",
      color: C.brand,
    }),
    8,
  );

  const pactRows = [
    {
      letter: "P",
      title: "Permission",
      body: "Allowed by policy? Approved tool? Is this data appropriate to share with it?",
    },
    {
      letter: "A",
      title: "Accuracy & fairness",
      body: "Have you verified the output? Could it be biased against anyone affected?",
    },
    {
      letter: "C",
      title: "Candor",
      body: "Would you be comfortable if everyone affected knew exactly how AI was used?",
    },
    {
      letter: "T",
      title: "Takeover",
      body: "Is a human still making the consequential call, with authority to overrule?",
    },
  ];

  const panelX = COL_B.x;
  const panelY = b.y;
  const panelPad = 18;
  const rowParts = [];
  let rowY = panelY + 58;
  for (const [i, row] of pactRows.entries()) {
    const r = labelledRow({
      x: panelX + panelPad,
      y: rowY,
      w: COL_B.w - panelPad * 2,
      badgeText: row.letter,
      title: row.title,
      body: row.body,
      badgeFill: C.brand,
      badgeSize: 32,
      badgeRadius: 16,
    });
    rowParts.push(r.svg);
    rowY += r.height + (i === pactRows.length - 1 ? 0 : 18);
  }
  const panelH = rowY + panelPad + 2 - panelY;
  b.add(
    {
      height: panelH,
      svg:
        rect({
          x: panelX,
          y: panelY,
          w: COL_B.w,
          h: panelH,
          r: 16,
          fill: C.panel,
          stroke: C.line,
        }) +
        rect({ x: panelX, y: panelY, w: COL_B.w, h: 44, r: 16, fill: C.brand }) +
        rect({ x: panelX, y: panelY + 28, w: COL_B.w, h: 16, fill: C.brand }) +
        centeredText({
          x: panelX + panelPad,
          y: panelY,
          h: 44,
          text: "RUN THIS BEFORE ANY SENSITIVE AI USE",
          size: 12.6,
          weight: 700,
          color: C.white,
          tracking: 1.5,
        }) +
        icon({
          name: "shieldCheck",
          x: panelX + COL_B.w - panelPad - 22,
          y: panelY + 11,
          size: 22,
          color: "#a9abe6",
        }) +
        rowParts.join(""),
    },
    18,
    { sticky: true },
  );

  const misuseY = b.y;
  const misuseTags = tagCloud({
    x: COL_B.x + 18,
    y: misuseY + 74,
    w: COL_B.w - 36,
    items: ["Deception", "Manipulation", "Harassment", "Dishonesty", "Circumvention"],
    color: C.rose,
    fill: C.white,
  });
  const misuseNote = paragraph({
    x: COL_B.x + 18,
    y: misuseY + 74 + misuseTags.height + 12,
    text: "Never engage in these — and report them if you encounter them.",
    size: 13.2,
    weight: 600,
    color: C.rose,
    maxWidth: COL_B.w - 36,
  });
  const misuseH = misuseY + 74 + misuseTags.height + 12 + misuseNote.height + 18 - misuseY;
  b.add({
    height: misuseH,
    svg:
      rect({
        x: COL_B.x,
        y: misuseY,
        w: COL_B.w,
        h: misuseH,
        r: 16,
        fill: C.roseSoft,
        stroke: "#f4c4c9",
      }) +
      icon({ name: "ban", x: COL_B.x + 18, y: misuseY + 18, size: 22, color: C.rose }) +
      paragraph({
        x: COL_B.x + 48,
        y: misuseY + 18,
        text: "Deception is the bright line",
        size: 16.5,
        weight: 700,
        color: C.rose,
        maxWidth: COL_B.w - 66,
      }).svg +
      misuseTags.svg +
      misuseNote.svg,
  });
  parts.push(b.done({ justify: true }));

  /* ------------------------------------------------------- column C --- */
  const c = stack(BODY_TOP, BODY_BOTTOM, "M2 col C");
  c.add(
    columnHeader({
      x: COL_C.x,
      y: BODY_TOP,
      w: COL_C.w,
      text: "Oversight matches the stakes",
      color: C.teal,
    }),
    8,
  );
  c.add(
    stakeRow({
      x: COL_C.x,
      y: c.y,
      w: COL_C.w,
      level: "LOW STAKES",
      work: "Internal drafts, brainstorms, summaries",
      action: "A quick read-through is enough before you use it.",
      color: C.green,
      tint: C.greenSoft,
    }),
    12,
    { sticky: true },
  );
  c.add(
    stakeRow({
      x: COL_C.x,
      y: c.y,
      w: COL_C.w,
      level: "MEDIUM STAKES",
      work: "Client emails, reports, external content",
      action: "Full fact-check plus your normal approval chain.",
      color: C.amber,
      tint: C.amberSoft,
    }),
    12,
    { sticky: true },
  );
  c.add(
    stakeRow({
      x: COL_C.x,
      y: c.y,
      w: COL_C.w,
      level: "HIGH STAKES",
      work: "Decisions about people, pay, or contracts",
      action: "A documented human decision. AI informs; it never decides.",
      color: C.rose,
      tint: C.roseSoft,
    }),
    18,
    { sticky: true },
  );

  const deepY = c.y;
  const deepBody = paragraph({
    x: COL_C.x + 54,
    y: deepY + 48,
    text: "Never create synthetic audio or video of a real person without written authorization — and always verify the unexpected request.",
    size: 14.2,
    weight: 400,
    color: C.inkSoft,
    maxWidth: COL_C.w - 54 - 20,
    lineHeight: 1.44,
  });
  const flagLine = paragraph({
    x: COL_C.x + 20,
    y: deepY + 48 + deepBody.height + 16,
    text: "Urgency + secrecy + payment  →  verify out of band on a known number, then report it.",
    size: 13.8,
    weight: 700,
    color: C.brand,
    maxWidth: COL_C.w - 40,
  });
  const deepH = deepY + 48 + deepBody.height + 16 + flagLine.height + 20 - deepY;
  c.add({
    height: deepH,
    svg:
      rect({
        x: COL_C.x,
        y: deepY,
        w: COL_C.w,
        h: deepH,
        r: 16,
        fill: C.white,
        stroke: C.line,
      }) +
      icon({ name: "alert", x: COL_C.x + 20, y: deepY + 20, size: 24, color: C.accent }) +
      paragraph({
        x: COL_C.x + 54,
        y: deepY + 19,
        text: "Deepfakes: create never, verify always",
        size: 16.5,
        weight: 700,
        color: C.ink,
        maxWidth: COL_C.w - 74,
      }).svg +
      deepBody.svg +
      rect({
        x: COL_C.x + 14,
        y: deepY + 48 + deepBody.height + 10,
        w: COL_C.w - 28,
        h: flagLine.height + 12,
        r: 10,
        fill: C.brandSoft,
      }) +
      flagLine.svg,
  });
  c.add(
    card({
      x: COL_C.x,
      y: c.y,
      w: COL_C.w,
      iconName: "flag",
      tint: C.accentSoft,
      iconColor: C.accent,
      title: "Know your reporting channel",
      body: "Find out now — before you need it — how to report AI misuse, fraud or a suspected deepfake at Relanto.",
      footnote: "Manager · HR · Legal · Security · AI policy owner",
    }),
  );
  parts.push(c.done({ justify: true }));

  parts.push(
    footer({
      text: "Any “no” or “not sure” in the PACT check? Pause — adjust it, or ask your manager, HR, Legal or the AI policy owner.",
      right: "MODULE 02 REFERENCE",
    }),
  );

  return svgDocument(parts);
}
