import { describe, it, expect } from "vitest";
import { renderKeySvg } from "../src/calendar/render";
import type { RenderModel } from "../src/calendar/state";

const base: RenderModel = {
  state: "countdown",
  badge: "IN 25",
  timeRange: "10:25–10:55",
  title: "Design review",
  barColor: "#e0a13a",
  keyBg: "#19191b",
  pressAction: "none",
};

describe("renderKeySvg", () => {
  it("produces an svg root", () => {
    const svg = renderKeySvg(base);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trim().endsWith("</svg>")).toBe(true);
  });

  it("includes badge, time range, title words and colors", () => {
    const svg = renderKeySvg(base);
    expect(svg).toContain("IN 25");
    expect(svg).toContain("10:25–10:55");
    // The title may wrap across lines, so assert the words are present.
    expect(svg).toContain("Design");
    expect(svg).toContain("review");
    expect(svg).toContain("#e0a13a");
    expect(svg).toContain("#19191b");
  });

  it("escapes XML-special characters in the title", () => {
    const svg = renderKeySvg({ ...base, title: "Q&A <all>" });
    expect(svg).toContain("Q&amp;A");
    expect(svg).toContain("&lt;all&gt;");
    expect(svg).not.toContain("<all>");
  });

  it("wraps a multi-word title so no line is the whole title", () => {
    const svg = renderKeySvg({ ...base, title: "Team Aluminum sync" });
    // Each word ends up on its own line; the full string never appears.
    expect(svg).not.toContain("Team Aluminum sync");
    expect(svg).toContain("Aluminum");
    expect(svg).toContain("sync");
  });

  it("condenses an over-long single word instead of clipping it", () => {
    const svg = renderKeySvg({ ...base, title: "Supercalifragilistic" });
    expect(svg).toContain("Supercalifragilistic");
    expect(svg).toContain('lengthAdjust="spacingAndGlyphs"');
  });

  it("omits time/title rows when absent (idle)", () => {
    const svg = renderKeySvg({
      state: "idle", badge: "", barColor: "#3a3a3d", keyBg: "#19191b", pressAction: "none",
    });
    expect(svg).toContain("No meetings");
  });
});
