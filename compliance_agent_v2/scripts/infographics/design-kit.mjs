/**
 * Vector design kit for the course infographics.
 *
 * Everything is authored as SVG so the artwork stays resolution-independent:
 * text is real text (no model-generated typos, no blurry upscaling) and the
 * raster export can be regenerated at any pixel density.
 */

export const FONT = "'Segoe UI', 'Inter', 'Helvetica Neue', Arial, sans-serif";

export const C = {
  ink: "#111427",
  inkSoft: "#4b5169",
  inkFaint: "#6b7185",
  brand: "#2e3192",
  brandDeep: "#1b1d5e",
  brandSoft: "#ecedf8",
  accent: "#f15a24",
  accentSoft: "#fdece4",
  line: "#e2e5f1",
  panel: "#f7f8fc",
  white: "#ffffff",
  teal: "#0d8f9c",
  tealSoft: "#e4f5f7",
  green: "#12805f",
  greenSoft: "#e3f4ee",
  amber: "#b45309",
  amberSoft: "#fdf1de",
  rose: "#c02434",
  roseSoft: "#fdeaec",
  violet: "#6127c4",
  violetSoft: "#f0e9fd",
  sky: "#1d63c9",
  skySoft: "#e6effc",
};

/* ------------------------------------------------------------------ text --- */

const NARROW = new Set("iljtfrI'\"!.,;:|()[]{}/\\-·".split(""));
const WIDE = new Set("mwMW@%".split(""));

function charFactor(ch) {
  if (ch === " ") return 0.27;
  if (NARROW.has(ch)) return 0.315;
  if (WIDE.has(ch)) return 0.86;
  if (ch >= "A" && ch <= "Z") return 0.645;
  if (ch >= "0" && ch <= "9") return 0.56;
  return 0.53;
}

/** Approximate advance width — tuned against Segoe UI metrics, ~4% slack. */
export function textWidth(text, size, weight = 400, tracking = 0) {
  const weightFactor = weight >= 700 ? 1.055 : weight >= 600 ? 1.03 : 1;
  let total = 0;
  for (const ch of text) total += charFactor(ch) * size * weightFactor;
  return total + tracking * Math.max(0, text.length - 1);
}

export function wrapText(text, maxWidth, size, weight = 400, tracking = 0) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (textWidth(candidate, size, weight, tracking) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Multi-line text block. Returns the markup plus the height it consumed so
 * callers can stack content without hand-maintaining coordinates.
 */
export function paragraph({
  x,
  y,
  text,
  size = 15,
  weight = 400,
  color = C.inkSoft,
  maxWidth = 400,
  lineHeight = 1.42,
  tracking = 0,
  anchor = "start",
  italic = false,
  maxLines,
}) {
  const lines = wrapText(text, maxWidth, size, weight, tracking);
  const shown = maxLines ? lines.slice(0, maxLines) : lines;
  const step = size * lineHeight;
  const baseline = y + size * 0.8;
  const tspans = shown
    .map(
      (line, i) =>
        `<tspan x="${round(x)}" dy="${i === 0 ? 0 : round(step)}">${esc(line)}</tspan>`,
    )
    .join("");
  const svg = `<text x="${round(x)}" y="${round(baseline)}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${color}"${
    tracking ? ` letter-spacing="${tracking}"` : ""
  }${italic ? ` font-style="italic"` : ""}${
    anchor !== "start" ? ` text-anchor="${anchor}"` : ""
  }>${tspans}</text>`;
  return { svg, height: shown.length * step - (step - size * 1.16), lines: shown.length };
}

/** Single line of text vertically centred inside a box of height `h`. */
export function centeredText({
  x,
  y,
  h,
  text,
  size = 15,
  weight = 600,
  color = C.ink,
  anchor = "start",
  tracking = 0,
}) {
  const baseline = y + h / 2 + size * 0.35;
  return `<text x="${round(x)}" y="${round(baseline)}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${color}"${
    tracking ? ` letter-spacing="${tracking}"` : ""
  }${anchor !== "start" ? ` text-anchor="${anchor}"` : ""}>${esc(text)}</text>`;
}

export function round(n) {
  return Math.round(n * 100) / 100;
}

/* ----------------------------------------------------------------- shapes --- */

export function rect({ x, y, w, h, r = 0, fill = C.white, stroke, strokeWidth = 1, opacity }) {
  return `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="${r}" fill="${fill}"${
    stroke ? ` stroke="${stroke}" stroke-width="${strokeWidth}"` : ""
  }${opacity != null ? ` opacity="${opacity}"` : ""}/>`;
}

export function sectionLabel({ x, y, text, color = C.accent, size = 12.5 }) {
  return `<text x="${round(x)}" y="${round(y + size * 0.8)}" font-family="${FONT}" font-size="${size}" font-weight="700" fill="${color}" letter-spacing="2.1">${esc(
    text.toUpperCase(),
  )}</text>`;
}

/** Small pill used for tags, class names and inline metadata. */
export function pill({
  x,
  y,
  text,
  size = 12,
  weight = 700,
  color = C.brand,
  fill = C.brandSoft,
  padX = 11,
  h = 25,
  tracking = 0.6,
  stroke,
}) {
  const w = textWidth(text, size, weight, tracking) + padX * 2;
  return {
    w,
    h,
    svg:
      rect({ x, y, w, h, r: h / 2, fill, stroke, strokeWidth: 1 }) +
      centeredText({ x: x + padX, y, h, text, size, weight, color, tracking }),
  };
}

/** Numbered / lettered badge. */
export function badge({ x, y, size = 34, text, fill = C.brand, color = C.white, fontSize = 16, r }) {
  const radius = r == null ? 10 : r;
  return (
    rect({ x, y, w: size, h: size, r: radius, fill }) +
    `<text x="${round(x + size / 2)}" y="${round(y + size / 2 + fontSize * 0.35)}" font-family="${FONT}" font-size="${fontSize}" font-weight="700" fill="${color}" text-anchor="middle">${esc(
      text,
    )}</text>`
  );
}

/* ------------------------------------------------------------------ icons --- */

/** 24×24 stroke glyphs, drawn crisp at any scale. */
const GLYPHS = {
  shield: "M12 3.2 19 6v5.6c0 4-2.9 6.7-7 8.2-4.1-1.5-7-4.2-7-8.2V6z",
  scale: "M12 4v15M6.5 19h11M4 9h16M4 9l-2.2 5.2a3.4 3.4 0 0 0 4.4 0zM20 9l2.2 5.2a3.4 3.4 0 0 1-4.4 0z",
  eye: "M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12S18 18.2 12 18.2 2.5 12 2.5 12z",
  eyeDot: "M12 9.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z",
  lock: "M6 11h12v9H6zM8.6 11V8.2a3.4 3.4 0 0 1 6.8 0V11",
  doc: "M6.5 3h7.6L18.5 7.4V21h-12zM14 3v4.6h4.4M9 12h6M9 15.5h6M9 19h4",
  alert: "M12 4.2 21 19.5H3zM12 9.6v4.6M12 16.6v.6",
  check: "M5.5 12.6 10 17l8.5-9",
  cross: "M7 7l10 10M17 7 7 17",
  gate: "M4 20V7l8-3 8 3v13M4 20h16M12 9v11M8 11v9M16 11v9",
  layers: "M12 3.5 21 8l-9 4.5L3 8zM3 12.4l9 4.5 9-4.5M3 16.4l9 4.5 9-4.5",
  target: "M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M12 6.6a5.4 5.4 0 1 0 0 10.8 5.4 5.4 0 0 0 0-10.8zM12 10.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z",
  loop: "M20 12a8 8 0 0 1-13.7 5.6M4 12a8 8 0 0 1 13.7-5.6M4 17.5V12h5.5M20 6.5V12h-5.5",
  user: "M12 4.4a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 0 0 0-7.4zM4.8 20.2c0-3.6 3.2-5.6 7.2-5.6s7.2 2 7.2 5.6z",
  users: "M9 5a3.3 3.3 0 1 0 0 6.6A3.3 3.3 0 0 0 9 5zM2.8 19.6c0-3.3 2.8-5.1 6.2-5.1s6.2 1.8 6.2 5.1M16.4 6.2a3 3 0 0 1 0 5.9M18 14.9c2 .6 3.4 2.1 3.4 4.7",
  tag: "M4 11.4 11.6 3.8H20v8.4L12.4 20zM16.2 8.2h.5",
  clock: "M12 4.2a7.8 7.8 0 1 0 0 15.6 7.8 7.8 0 0 0 0-15.6zM12 8.2V12l3 2.2",
  spark: "M12 3.4l1.9 5.2 5.2 1.9-5.2 1.9L12 17.6l-1.9-5.2L4.9 10.5l5.2-1.9zM18.8 16.4l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8z",
  chat: "M4 5.5h16v10H12l-4.6 3.6v-3.6H4z",
  laptop: "M5 6.4h14v9.2H5zM2.6 18.6h18.8M9.6 15.6h4.8",
  flag: "M6 3.6v17M6 4.6h11l-1.8 3.6L17 11.8H6",
  list: "M4.4 6.6h2.2M4.4 12h2.2M4.4 17.4h2.2M9.6 6.6H20M9.6 12H20M9.6 17.4H20",
  filter: "M3.6 5.4h16.8l-6.4 7.4v6.4l-4-2.2v-4.2z",
  ban: "M12 3.9a8.1 8.1 0 1 0 0 16.2 8.1 8.1 0 0 0 0-16.2zM6.4 6.4l11.2 11.2",
  key: "M14.8 3.8a5 5 0 1 0-4.4 8.1L3.6 18.6v1.8h2.6l1-1.4h1.6v-1.6h1.6l1.5-1.6-.5-2.2a5 5 0 0 0 3.4-9.8zM16 8.1h.5",
  compass: "M12 3.9a8.1 8.1 0 1 0 0 16.2 8.1 8.1 0 0 0 0-16.2zM15.2 8.8l-1.8 4.6-4.6 1.8 1.8-4.6z",
  bolt: "M13.4 3.4 6.8 13.4h4.2l-1 7.2 6.8-10.2h-4.2z",
  brief: "M3.6 8.4h16.8v11H3.6zM8.8 8.4V6.2h6.4v2.2M3.6 13.6h16.8",
  stamp: "M8 3.8h8v4.4l-1.6 3.4h-4.8L8 8.2zM4.6 13.4h14.8v3H4.6zM4.6 19.4h14.8",
  bulb: "M12 3.6a5.6 5.6 0 0 0-3.2 10.2v2.4h6.4v-2.4A5.6 5.6 0 0 0 12 3.6zM9.6 19.2h4.8M10.4 21.4h3.2",
  shieldCheck: "M12 3.2 19 6v5.6c0 4-2.9 6.7-7 8.2-4.1-1.5-7-4.2-7-8.2V6zM8.8 11.8 11.3 14.3l4-4.4",
};

export function icon({
  name,
  x,
  y,
  size = 22,
  color = C.brand,
  strokeWidth = 1.8,
  extras = [],
}) {
  const path = GLYPHS[name];
  if (!path) throw new Error(`Unknown glyph: ${name}`);
  const scale = size / 24;
  const paths = [path, ...extras.map((n) => GLYPHS[n])].filter(Boolean);
  const body = paths
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="${color}" stroke-width="${round(
          strokeWidth / scale,
        )}" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join("");
  return `<g transform="translate(${round(x)} ${round(y)}) scale(${round(scale)})">${body}</g>`;
}

/** Icon inside a soft tinted tile — the standard card marker. */
export function iconTile({ name, x, y, size = 38, fill, color, glyph = 21, extras }) {
  return (
    rect({ x, y, w: size, h: size, r: 11, fill }) +
    icon({
      name,
      x: x + (size - glyph) / 2,
      y: y + (size - glyph) / 2,
      size: glyph,
      color,
      extras,
    })
  );
}

/* ------------------------------------------------------------------ cards --- */

/**
 * Standard content card. Height is derived from the wrapped copy, so columns
 * can be stacked programmatically and never overflow silently.
 */
export function card({
  x,
  y,
  w,
  title,
  body,
  iconName,
  tint = C.brandSoft,
  iconColor = C.brand,
  iconExtras,
  titleSize = 17.4,
  bodySize = 14.2,
  titleColor = C.ink,
  bodyColor = C.inkSoft,
  fill = C.white,
  stroke = C.line,
  padX = 18,
  padY = 16,
  radius = 14,
  accentBar,
  minHeight = 0,
  footnote,
}) {
  const hasIcon = Boolean(iconName);
  const tileSize = 36;
  const textX = x + padX + (hasIcon ? tileSize + 13 : 0);
  const textW = w - padX * 2 - (hasIcon ? tileSize + 13 : 0);
  const titleBlock = paragraph({
    x: textX,
    y: y + padY - 1,
    text: title,
    size: titleSize,
    weight: 700,
    color: titleColor,
    maxWidth: textW,
    lineHeight: 1.24,
  });
  let cursor = y + padY + titleBlock.height + 7;
  let bodyBlock = { svg: "", height: 0 };
  if (body) {
    bodyBlock = paragraph({
      x: textX,
      y: cursor,
      text: body,
      size: bodySize,
      weight: 400,
      color: bodyColor,
      maxWidth: textW,
      lineHeight: 1.44,
    });
    cursor += bodyBlock.height;
  }
  let footBlock = { svg: "", height: 0 };
  if (footnote) {
    cursor += 8;
    footBlock = paragraph({
      x: textX,
      y: cursor,
      text: footnote,
      size: bodySize - 0.6,
      weight: 600,
      color: iconColor,
      maxWidth: textW,
      lineHeight: 1.4,
    });
    cursor += footBlock.height;
  }
  const contentBottom = cursor + padY;
  const iconBottom = hasIcon ? y + padY + tileSize + padY - 2 : 0;
  const h = Math.max(minHeight, contentBottom - y, iconBottom - y);

  const svg =
    rect({ x, y, w, h, r: radius, fill, stroke }) +
    (accentBar
      ? rect({ x, y: y + 14, w: 4, h: h - 28, r: 2, fill: accentBar })
      : "") +
    (hasIcon
      ? iconTile({
          name: iconName,
          x: x + padX,
          y: y + padY - 2,
          size: tileSize,
          fill: tint,
          color: iconColor,
          extras: iconExtras,
        })
      : "") +
    titleBlock.svg +
    bodyBlock.svg +
    footBlock.svg;

  return { svg, height: h };
}

/** Compact row: badge on the left, title + copy on the right, no container. */
export function labelledRow({
  x,
  y,
  w,
  badgeText,
  title,
  body,
  badgeFill = C.brand,
  badgeColor = C.white,
  badgeSize = 30,
  badgeRadius,
  titleSize = 15.6,
  bodySize = 13.8,
  titleColor = C.ink,
  bodyColor = C.inkSoft,
  gap = 13,
}) {
  const textX = x + badgeSize + gap;
  const textW = w - badgeSize - gap;
  const titleBlock = paragraph({
    x: textX,
    y,
    text: title,
    size: titleSize,
    weight: 700,
    color: titleColor,
    maxWidth: textW,
    lineHeight: 1.24,
  });
  let cursor = y + titleBlock.height + 4;
  let bodyBlock = { svg: "", height: 0 };
  if (body) {
    bodyBlock = paragraph({
      x: textX,
      y: cursor,
      text: body,
      size: bodySize,
      weight: 400,
      color: bodyColor,
      maxWidth: textW,
      lineHeight: 1.42,
    });
    cursor += bodyBlock.height;
  }
  return {
    svg:
      badge({
        x,
        y: y - 3,
        size: badgeSize,
        text: badgeText,
        fill: badgeFill,
        color: badgeColor,
        fontSize: badgeSize * 0.45,
        r: badgeRadius,
      }) +
      titleBlock.svg +
      bodyBlock.svg,
    height: Math.max(cursor - y, badgeSize - 3),
  };
}

/* ------------------------------------------------------------------ frame --- */

export const W = 1600;
export const H = 940;
export const MARGIN = 56;
export const FOOTER_H = 72;
export const BODY_TOP = 196;
export const BODY_BOTTOM = H - FOOTER_H - 10;

export function defs() {
  return `<defs>
    <linearGradient id="topbar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${C.brand}"/>
      <stop offset="0.55" stop-color="#5b3fb0"/>
      <stop offset="1" stop-color="${C.accent}"/>
    </linearGradient>
    <linearGradient id="footer" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${C.brandDeep}"/>
      <stop offset="1" stop-color="#33368f"/>
    </linearGradient>
    <linearGradient id="wash" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="${C.brandSoft}" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>`;
}

export function header({ moduleLabel, title, subtitle }) {
  const wordmarkX = W - MARGIN;
  return [
    rect({ x: 0, y: 0, w: W, h: H, fill: C.white }),
    `<circle cx="${W - 150}" cy="-40" r="300" fill="url(#wash)"/>`,
    rect({ x: 0, y: 0, w: W, h: 7, fill: "url(#topbar)" }),
    sectionLabel({ x: MARGIN, y: 46, text: moduleLabel, color: C.accent, size: 13 }),
    paragraph({
      x: MARGIN,
      y: 70,
      text: title,
      size: 40,
      weight: 700,
      color: C.ink,
      maxWidth: 1010,
      lineHeight: 1.15,
    }).svg,
    paragraph({
      x: MARGIN,
      y: 126,
      text: subtitle,
      size: 16.5,
      weight: 400,
      color: C.inkFaint,
      maxWidth: 1020,
      lineHeight: 1.42,
      maxLines: 2,
    }).svg,
    `<text x="${wordmarkX}" y="62" font-family="${FONT}" font-size="23" font-weight="700" fill="${C.brand}" text-anchor="end" letter-spacing="4.5">RELANTO<tspan fill="${C.accent}">.</tspan></text>`,
    `<text x="${wordmarkX}" y="94" font-family="${FONT}" font-size="12" font-weight="600" fill="${C.inkFaint}" text-anchor="end" letter-spacing="1.6">AI COMPLIANCE ACADEMY</text>`,
    `<text x="${wordmarkX}" y="118" font-family="${FONT}" font-size="12" font-weight="600" fill="${C.brand}" text-anchor="end" letter-spacing="1.6">QUICK REFERENCE SHEET</text>`,
    rect({ x: MARGIN, y: 176, w: W - MARGIN * 2, h: 1, fill: C.line }),
  ].join("\n");
}

export function footer({ text, right }) {
  const h = FOOTER_H;
  const y = H - h;
  return [
    rect({ x: 0, y, w: W, h, fill: "url(#footer)" }),
    rect({ x: 0, y, w: 8, h, fill: C.accent }),
    icon({ name: "spark", x: MARGIN - 8, y: y + h / 2 - 12, size: 24, color: C.accent }),
    centeredText({
      x: MARGIN + 26,
      y,
      h,
      text,
      size: 17,
      weight: 600,
      color: C.white,
    }),
    right
      ? centeredText({
          x: W - MARGIN,
          y,
          h,
          text: right,
          size: 12.5,
          weight: 600,
          color: "#b9bbe4",
          anchor: "end",
          tracking: 1.4,
        })
      : "",
  ].join("\n");
}

export function svgDocument(bodyParts) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
${defs()}
${bodyParts.filter(Boolean).join("\n")}
</svg>`;
}

/**
 * Column layout helper. Tracks a running y cursor while measuring content, and
 * on `done({ justify: true })` spreads any leftover space across the gaps so a
 * column reaches the bottom of the board instead of leaving a dead band.
 * Items marked `sticky` keep their distance to the item above (section labels
 * stay attached to the block they introduce).
 */
export function stack(startY, limit, label) {
  const items = [];
  let pending = [];
  let y = startY;
  return {
    add(result, gap = 14, opts = {}) {
      items.push({
        svg: pending.join("") + result.svg,
        height: result.height,
        gap,
        sticky: Boolean(opts.sticky),
      });
      pending = [];
      y += result.height + gap;
      return this;
    },
    raw(svg) {
      pending.push(svg);
      return this;
    },
    move(dy) {
      y += dy;
      return this;
    },
    get y() {
      return y;
    },
    done({ justify = false, maxExtra = 34 } = {}) {
      const trailingGap = items.length ? items[items.length - 1].gap : 0;
      const naturalBottom = y - trailingGap;
      const slots = items.filter((item, i) => i > 0 && !item.sticky).length;
      let extra = 0;
      if (justify && limit && slots > 0) {
        const slack = limit - naturalBottom;
        if (slack > 0) extra = Math.min(maxExtra, slack / slots);
      }
      let shift = 0;
      const out = items.map((item, i) => {
        if (i > 0 && !item.sticky) shift += extra;
        return shift > 0.01
          ? `<g transform="translate(0 ${round(shift)})">${item.svg}</g>`
          : item.svg;
      });
      const bottom = naturalBottom + shift;
      if (limit && bottom > limit + 0.5) {
        console.warn(
          `  ! ${label} overflows by ${Math.round(bottom - limit)}px (bottom ${Math.round(bottom)} > ${limit})`,
        );
      } else if (limit) {
        console.log(`  · ${label} bottom ${Math.round(bottom)} / ${limit}`);
      }
      return [...out, ...pending].join("\n");
    },
  };
}
