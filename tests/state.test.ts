import { describe, it, expect } from "vitest";
import { computeRenderModel } from "../src/calendar/state";
import type { HelperResult, Meeting } from "../src/calendar/types";

const at = (iso: string) => new Date(iso);
const meeting = (start: Date, end: Date): HelperResult => ({
  kind: "meeting",
  meeting: {
    title: "Design review",
    start,
    end,
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
    const start = new Date(2026, 5, 26, 10, 25);
    const end = new Date(2026, 5, 26, 10, 55);
    const now = new Date(2026, 5, 26, 10, 0);
    const m = computeRenderModel(meeting(start, end), now);
    expect(m.state).toBe("countdown");
    expect(m.badge).toBe("IN 25m");
    expect(m.timeRange).toBe("10:25–10:55");
    expect(m.title).toBe("Design review");
    expect(m.barColor).toBe("#e0a13a");
    expect(m.pressAction).toBe("none");
  });

  it("countdown rounds minutes up", () => {
    const start = new Date(2026, 5, 26, 10, 24, 30);
    const end = new Date(2026, 5, 26, 10, 55, 0);
    const now = new Date(2026, 5, 26, 10, 0, 0);
    const m = computeRenderModel(meeting(start, end), now);
    expect(m.badge).toBe("IN 25m");
  });

  it("countdown shows minutes up to and including 90 minutes", () => {
    const start = new Date(2026, 5, 26, 11, 30);
    const end = new Date(2026, 5, 26, 12, 0);
    const now = new Date(2026, 5, 26, 10, 0);
    const m = computeRenderModel(meeting(start, end), now);
    expect(m.badge).toBe("IN 90m");
  });

  it("countdown shows hours between 90 minutes and a day", () => {
    const start = new Date(2026, 5, 26, 13, 0); // 3h away
    const end = new Date(2026, 5, 26, 13, 30);
    const now = new Date(2026, 5, 26, 10, 0);
    const m = computeRenderModel(meeting(start, end), now);
    expect(m.badge).toBe("IN 3h");
  });

  it("countdown shows days beyond 24 hours", () => {
    const start = new Date(2026, 5, 28, 14, 45); // ~2 days away
    const end = new Date(2026, 5, 28, 15, 15);
    const now = new Date(2026, 5, 26, 14, 45);
    const m = computeRenderModel(meeting(start, end), now);
    expect(m.badge).toBe("IN 2d");
  });

  it("join-window opens exactly 2 minutes before start", () => {
    const start = new Date(2026, 5, 26, 10, 2, 0);
    const end = new Date(2026, 5, 26, 10, 30, 0);
    const now = new Date(2026, 5, 26, 10, 0, 0);
    const m = computeRenderModel(meeting(start, end), now);
    expect(m.state).toBe("join-window");
    expect(m.badge).toBe("JOIN · 2m");
    expect(m.barColor).toBe("#3ec46d");
    expect(m.pressAction).toBe("open-link");
  });

  it("still countdown one second before the window opens", () => {
    const start = new Date(2026, 5, 26, 10, 2, 1);
    const end = new Date(2026, 5, 26, 10, 30, 0);
    const now = new Date(2026, 5, 26, 10, 0, 0);
    const m = computeRenderModel(meeting(start, end), now);
    expect(m.state).toBe("countdown");
    expect(m.pressAction).toBe("none");
  });

  it("live from start through end inclusive", () => {
    const start = new Date(2026, 5, 26, 10, 0, 0);
    const end = new Date(2026, 5, 26, 10, 30, 0);
    const live = meeting(start, end);
    const atStart = computeRenderModel(live, start);
    expect(atStart.state).toBe("live");
    expect(atStart.badge).toBe("NOW");
    expect(atStart.barColor).toBe("#ff5a5f");
    expect(atStart.keyBg).toBe("#3a1417");
    expect(atStart.pressAction).toBe("open-link");

    const atEnd = computeRenderModel(live, end);
    expect(atEnd.state).toBe("live");
    expect(atEnd.pressAction).toBe("open-link");
  });

  it("idle once the meeting has ended", () => {
    const start = new Date(2026, 5, 26, 9, 0, 0);
    const end = new Date(2026, 5, 26, 9, 30, 0);
    const now = new Date(2026, 5, 26, 9, 30, 1);
    const m = computeRenderModel(meeting(start, end), now);
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
