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

  it("includes badge, time range, title and colors", () => {
    const svg = renderKeySvg(base);
    expect(svg).toContain("IN 25");
    expect(svg).toContain("10:25–10:55");
    expect(svg).toContain("Design review");
    expect(svg).toContain("#e0a13a");
    expect(svg).toContain("#19191b");
  });

  it("escapes XML-special characters in the title", () => {
    const svg = renderKeySvg({ ...base, title: "Q&A <all>" });
    expect(svg).toContain("Q&amp;A &lt;all&gt;");
    expect(svg).not.toContain("Q&A <all>");
  });

  it("omits time/title rows when absent (idle)", () => {
    const svg = renderKeySvg({
      state: "idle", badge: "", barColor: "#3a3a3d", keyBg: "#19191b", pressAction: "none",
    });
    expect(svg).toContain("No meetings");
  });
});
