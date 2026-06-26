import { describe, it, expect } from "vitest";
import { computeRenderModel } from "../src/calendar/state";
import type { HelperResult, Meeting } from "../src/calendar/types";

const at = (iso: string) => new Date(iso);
const meeting = (start: string, end: string): HelperResult => ({
  kind: "meeting",
  meeting: {
    title: "Design review",
    start: at(start),
    end: at(end),
    url: "https://example.com/join",
    calendarId: "cal-1",
  } satisfies Meeting,
});

describe("computeRenderModel", () => {
  it("idle when no meeting", () => {
    const m = computeRenderModel({ kind: "none" }, at("2026-06-26T10:00:00Z"));
    expect(m.state).toBe("idle");
    expect(m.pressAction).toBe("none");
    expect(m.keyBg).toBe("#19191b");
  });

  it("countdown more than 2 min before start", () => {
    const m = computeRenderModel(meeting("2026-06-26T10:25:00Z", "2026-06-26T10:55:00Z"), at("2026-06-26T10:00:00Z"));
    expect(m.state).toBe("countdown");
    expect(m.badge).toBe("IN 25");
    expect(m.timeRange).toBe("10:25–10:55");
    expect(m.title).toBe("Design review");
    expect(m.barColor).toBe("#e0a13a");
    expect(m.pressAction).toBe("none");
  });

  it("countdown rounds minutes up", () => {
    const m = computeRenderModel(meeting("2026-06-26T10:24:30Z", "2026-06-26T10:55:00Z"), at("2026-06-26T10:00:00Z"));
    expect(m.badge).toBe("IN 25");
  });

  it("join-window opens exactly 2 minutes before start", () => {
    const m = computeRenderModel(meeting("2026-06-26T10:02:00Z", "2026-06-26T10:30:00Z"), at("2026-06-26T10:00:00Z"));
    expect(m.state).toBe("join-window");
    expect(m.badge).toBe("JOIN · 2m");
    expect(m.barColor).toBe("#3ec46d");
    expect(m.pressAction).toBe("open-link");
  });

  it("still countdown one second before the window opens", () => {
    const m = computeRenderModel(meeting("2026-06-26T10:02:01Z", "2026-06-26T10:30:00Z"), at("2026-06-26T10:00:00Z"));
    expect(m.state).toBe("countdown");
    expect(m.pressAction).toBe("none");
  });

  it("live from start through end inclusive", () => {
    const live = meeting("2026-06-26T10:00:00Z", "2026-06-26T10:30:00Z");
    const atStart = computeRenderModel(live, at("2026-06-26T10:00:00Z"));
    expect(atStart.state).toBe("live");
    expect(atStart.badge).toBe("NOW");
    expect(atStart.barColor).toBe("#ff5a5f");
    expect(atStart.keyBg).toBe("#3a1417");
    expect(atStart.pressAction).toBe("open-link");

    const atEnd = computeRenderModel(live, at("2026-06-26T10:30:00Z"));
    expect(atEnd.state).toBe("live");
    expect(atEnd.pressAction).toBe("open-link");
  });

  it("idle once the meeting has ended", () => {
    const m = computeRenderModel(meeting("2026-06-26T09:00:00Z", "2026-06-26T09:30:00Z"), at("2026-06-26T09:30:01Z"));
    expect(m.state).toBe("idle");
    expect(m.pressAction).toBe("none");
  });

  it("permission denied opens settings on press", () => {
    const m = computeRenderModel({ kind: "permission_denied" }, at("2026-06-26T10:00:00Z"));
    expect(m.state).toBe("access-error");
    expect(m.pressAction).toBe("open-settings");
  });

  it("error state is non-actionable", () => {
    const m = computeRenderModel({ kind: "error", message: "boom" }, at("2026-06-26T10:00:00Z"));
    expect(m.state).toBe("error");
    expect(m.pressAction).toBe("none");
  });
});
