import { describe, it, expect, vi, beforeEach } from "vitest";

const { openUrl } = vi.hoisted(() => ({ openUrl: vi.fn() }));
vi.mock("@elgato/streamdeck", () => ({
  default: { system: { openUrl }, logger: { error: vi.fn(), info: vi.fn() } },
  action: () => (target: unknown) => target,
  SingletonAction: class {},
}));

import { NextMeetingAction } from "../src/actions/next-meeting";
import type { HelperResult } from "../src/calendar/types";

const liveResult: HelperResult = {
  kind: "meeting",
  meeting: {
    title: "Standup",
    start: new Date(Date.now() - 60_000),
    end: new Date(Date.now() + 600_000),
    url: "https://meet.example/live",
    calendarId: "cal-1",
  },
};

describe("NextMeetingAction.onKeyDown", () => {
  beforeEach(() => openUrl.mockClear());

  it("opens the meeting url when in the join window", async () => {
    const a = new NextMeetingAction();
    (a as unknown as { cached: HelperResult }).cached = liveResult;
    await a.onKeyDown({ action: {} } as never);
    expect(openUrl).toHaveBeenCalledWith("https://meet.example/live");
  });

  it("does nothing when there is no joinable meeting", async () => {
    const a = new NextMeetingAction();
    (a as unknown as { cached: HelperResult }).cached = { kind: "none" };
    await a.onKeyDown({ action: {} } as never);
    expect(openUrl).not.toHaveBeenCalled();
  });

  it("opens system settings on permission error", async () => {
    const a = new NextMeetingAction();
    (a as unknown as { cached: HelperResult }).cached = { kind: "permission_denied" };
    await a.onKeyDown({ action: {} } as never);
    expect(openUrl).toHaveBeenCalledWith(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars",
    );
  });
});
