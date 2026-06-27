import type { RenderModel } from "./state";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Approximate width of one character as a fraction of the font size for the
// key's sans-serif font at weight 500. Slightly generous so we wrap a touch
// early rather than clip.
const CHAR_RATIO = 0.6;
const TITLE_MIN_FONT = 7;
const TITLE_MAX_FONT = 11;

// Left edge of the content, leaving a small gap after the 5px accent bar.
const CONTENT_X = 9.5;

// Lay out the title within `availWidth` pixels: pick the largest font (within
// bounds) at which the longest word fits, wrap greedily to that width, cap at
// `maxLines` with an ellipsis. Returns the chosen font size and the lines.
function layoutTitle(
  title: string,
  availWidth: number,
  maxLines = 3,
): { fontSize: number; lines: string[] } {
  const words = title.split(/\s+/).filter(Boolean);
  const longest = words.reduce((m, w) => Math.max(m, w.length), 1);
  const fontSize = Math.max(
    TITLE_MIN_FONT,
    Math.min(TITLE_MAX_FONT, Math.floor(availWidth / (longest * CHAR_RATIO))),
  );
  const perLine = Math.max(1, Math.floor(availWidth / (CHAR_RATIO * fontSize)));

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > perLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  if (lines.length > maxLines) {
    const shown = lines.slice(0, maxLines);
    const last = shown[maxLines - 1];
    shown[maxLines - 1] =
      last.length > perLine - 1 ? `${last.slice(0, Math.max(1, perLine - 1))}…` : `${last}…`;
    return { fontSize, lines: shown };
  }
  return { fontSize, lines };
}

export function renderKeySvg(model: RenderModel): string {
  const W = 72;
  const H = 72;

  if (model.state === "idle") {
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
      `<rect width="${W}" height="${H}" rx="8" fill="${model.keyBg}"/>`,
      `<rect x="0" y="0" width="5" height="${H}" fill="${model.barColor}"/>`,
      `<text x="${W / 2}" y="${H / 2 + 4}" fill="#7a7a80" font-family="Helvetica,Arial,sans-serif" font-size="9" text-anchor="middle">No meetings</text>`,
      `</svg>`,
    ].join("");
  }

  const textX = CONTENT_X;
  const availWidth = W - textX - 4;
  const { fontSize: titleFont, lines: titleLines } = model.title
    ? layoutTitle(model.title, availWidth)
    : { fontSize: TITLE_MAX_FONT, lines: [] };
  const lineHeight = titleFont + 2;
  const titleSvg = titleLines
    .map((line, i) => {
      // Safety net: condense (never clip) a line that would still overflow.
      const estWidth = line.length * CHAR_RATIO * titleFont;
      const fit = estWidth > availWidth ? ` textLength="${availWidth}" lengthAdjust="spacingAndGlyphs"` : "";
      return `<text x="${textX}" y="${42 + i * lineHeight}" fill="#f2f2f4" font-family="Helvetica,Arial,sans-serif" font-size="${titleFont}" font-weight="500"${fit}>${esc(line)}</text>`;
    })
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" rx="8" fill="${model.keyBg}"/>`,
    `<rect x="0" y="0" width="5" height="${H}" fill="${model.barColor}"/>`,
    `<text x="${CONTENT_X}" y="16" fill="${model.barColor}" font-family="Helvetica,Arial,sans-serif" font-size="11" font-weight="700">${esc(model.badge)}</text>`,
    model.timeRange
      ? `<text x="${CONTENT_X}" y="29" fill="#9a9aa0" font-family="Helvetica,Arial,sans-serif" font-size="9">${esc(model.timeRange)}</text>`
      : "",
    titleSvg,
    `</svg>`,
  ].join("");
}
