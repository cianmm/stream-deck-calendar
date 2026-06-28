import { describe, it, expect } from "vitest";
import { getNextMeeting, listCalendars, type ExecFn } from "../src/calendar/helper-client";

const exec = (out: string, code = 0): ExecFn => async () => ({ stdout: out, stderr: "", code });

describe("getNextMeeting", () => {
  it("parses a meeting into typed dates", async () => {
    const json = JSON.stringify({
      title: "Standup",
      startISO: "2026-06-26T10:00:00Z",
      endISO: "2026-06-26T10:15:00Z",
      url: "https://meet.example/abc",
      calendarId: "cal-1",
    });
    const r = await getNextMeeting("/bin/helper", ["cal-1"], exec(json));
    expect(r.kind).toBe("meeting");
    if (r.kind !== "meeting") throw new Error("expected meeting");
    expect(r.meeting.title).toBe("Standup");
    expect(r.meeting.start.toISOString()).toBe("2026-06-26T10:00:00.000Z");
    expect(r.meeting.url).toBe("https://meet.example/abc");
    expect(r.meeting.backToBack).toBe(false);
  });

  it("parses backToBack when the helper reports it", async () => {
    const json = JSON.stringify({
      title: "Standup",
      startISO: "2026-06-26T10:00:00Z",
      endISO: "2026-06-26T10:15:00Z",
      url: "https://meet.example/abc",
      calendarId: "cal-1",
      backToBack: true,
    });
    const r = await getNextMeeting("/bin/helper", ["cal-1"], exec(json));
    if (r.kind !== "meeting") throw new Error("expected meeting");
    expect(r.meeting.backToBack).toBe(true);
  });

  it("returns none for literal null", async () => {
    expect((await getNextMeeting("/bin/helper", ["cal-1"], exec("null\n"))).kind).toBe("none");
  });

  it("returns none for empty output", async () => {
    expect((await getNextMeeting("/bin/helper", ["cal-1"], exec(""))).kind).toBe("none");
  });

  it("maps permission_denied error", async () => {
    const r = await getNextMeeting("/bin/helper", ["cal-1"], exec('{"error":"permission_denied"}', 1));
    expect(r.kind).toBe("permission_denied");
  });

  it("maps other non-zero exits to error", async () => {
    const r = await getNextMeeting("/bin/helper", ["cal-1"], exec('{"error":"boom"}', 1));
    expect(r.kind).toBe("error");
    if (r.kind !== "error") throw new Error("expected error");
    expect(r.message).toBe("boom");
  });

  it("maps invalid JSON to error", async () => {
    const r = await getNextMeeting("/bin/helper", ["cal-1"], exec("not json", 0));
    expect(r.kind).toBe("error");
  });

  it("passes calendar ids after --calendars", async () => {
    let received: string[] = [];
    const spy: ExecFn = async (_file, args) => {
      received = args;
      return { stdout: "null", stderr: "", code: 0 };
    };
    await getNextMeeting("/bin/helper", ["a", "b"], spy);
    expect(received).toEqual(["next-meeting", "--calendars", "a", "b"]);
  });
});

describe("listCalendars", () => {
  it("parses calendars", async () => {
    const json = JSON.stringify([{ id: "1", title: "Work" }, { id: "2", title: "Home" }]);
    const cals = await listCalendars("/bin/helper", exec(json));
    expect(cals).toEqual([{ id: "1", title: "Work" }, { id: "2", title: "Home" }]);
  });

  it("returns [] on permission denied", async () => {
    const cals = await listCalendars("/bin/helper", exec('{"error":"permission_denied"}', 1));
    expect(cals).toEqual([]);
  });
});
