import type { RenderModel } from "./state";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapTitle(title: string, perLine = 14, maxLines = 3): string[] {
  const words = title.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > perLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
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

  const titleLines = model.title ? wrapTitle(model.title) : [];
  const titleSvg = titleLines
    .map(
      (line, i) =>
        `<text x="14" y="${44 + i * 11}" fill="#f2f2f4" font-family="Helvetica,Arial,sans-serif" font-size="10" font-weight="500">${esc(line)}</text>`,
    )
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" rx="8" fill="${model.keyBg}"/>`,
    `<rect x="0" y="0" width="5" height="${H}" fill="${model.barColor}"/>`,
    `<text x="14" y="16" fill="${model.barColor}" font-family="Helvetica,Arial,sans-serif" font-size="11" font-weight="700">${esc(model.badge)}</text>`,
    model.timeRange
      ? `<text x="14" y="29" fill="#9a9aa0" font-family="Helvetica,Arial,sans-serif" font-size="9">${esc(model.timeRange)}</text>`
      : "",
    titleSvg,
    `</svg>`,
  ].join("");
}
