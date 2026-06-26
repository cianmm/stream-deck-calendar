# Stream Deck Calendar Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A macOS Elgato Stream Deck plugin that shows your next joinable meeting on a key and opens its link when pressed within a 2-minutes-before-through-end window.

**Architecture:** A Node.js/TypeScript plugin (Elgato SDK) owns all Stream Deck concerns — timers, button rendering, press handling. A tiny bundled Swift/EventKit binary (`calendar-helper`) does all calendar reads and emits JSON; the plugin spawns it. All decision logic lives in pure, unit-tested TypeScript (`state.ts`, `render.ts`, `helper-client.ts`); the native surface stays minimal.

**Tech Stack:** `@elgato/streamdeck` Node SDK + `@elgato/cli` (`streamdeck`) for scaffold/build/package; TypeScript; Vitest for tests; Swift Package Manager (EventKit) for the helper; sdpi-components for the Property Inspector.

## Global Constraints

- Plugin UUID: `com.cianmm.calendar`. Action UUID: `com.cianmm.calendar.next-meeting`.
- Platform: macOS only. Manifest `OS` minimum `12`; helper Swift package `platforms: [.macOS(.v12)]`. EventKit full-access path requires macOS 14+ at runtime (older falls back to `requestAccess`).
- Node version: `20` (declared in manifest `Nodejs.Version`).
- "Next meeting" = soonest event that is (a) on a selected calendar, (b) has a non-empty `event.url`, (c) has `endDate > now`. Events without a URL are skipped entirely.
- Link source: EventKit `event.url` only. No notes/location scanning.
- Join window: opens at exactly `start − 2min`, stays open through `end` (inclusive). Press is a no-op outside it.
- Settings key for selected calendars: `calendarIds` (array of strings).
- Poll interval: 60_000 ms. Tick (re-render) interval: 1_000 ms.
- Colors (used verbatim by `state.ts` and `render.ts`):
  - idle: bar `#3a3a3d`, keyBg `#19191b`
  - countdown: bar `#e0a13a`, keyBg `#19191b`
  - join-window: bar `#3ec46d`, keyBg `#19191b`
  - live: bar `#ff5a5f`, keyBg `#3a1417`
  - access-error / error: bar `#ff5a5f`, keyBg `#3a1417`
- All text rendered into the key is sentence/normal case; badges may be short tokens (`NOW`, `IN 25`, `JOIN · 1m`).

---

### Task 1: Scaffold plugin project + manifest + tooling

Sets up a buildable Elgato plugin skeleton with the correct UUIDs, a single "Next Meeting" action that registers and connects, and Vitest wired up. Configuration, manifest, and a placeholder action are folded in here because nothing is independently testable until the project builds.

**Files:**
- Create (via CLI then edit): `package.json`, `rollup.config.mjs`, `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `com.cianmm.calendar.sdPlugin/manifest.json`
- Create: `src/plugin.ts`
- Create: `src/actions/next-meeting.ts` (placeholder)

**Interfaces:**
- Produces: `NextMeetingAction` class (default export-less, named export) registered in `plugin.ts`; settings type `NextMeetingSettings = { calendarIds?: string[] }`.

- [ ] **Step 1: Scaffold with the Elgato CLI**

Run:
```bash
npx @elgato/cli@latest create
```
Answer prompts: Author `Cian Mac Mahon`, Plugin name `Calendar`, UUID `com.cianmm.calendar`, generate into the current repo. If the CLI insists on a subfolder, scaffold in a temp dir and move `package.json`, `rollup.config.mjs`, `tsconfig.json`, `src/`, and `com.cianmm.calendar.sdPlugin/` into the repo root.

Expected: a `com.cianmm.calendar.sdPlugin/` bundle and `src/plugin.ts` exist.

- [ ] **Step 2: Add Vitest**

Run:
```bash
npm install -D vitest
```
Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```
Add to `package.json` `"scripts"`: `"test": "vitest run"`, `"test:watch": "vitest"`, and ensure `"typecheck": "tsc --noEmit"` exists.

- [ ] **Step 3: Set the manifest**

Overwrite `com.cianmm.calendar.sdPlugin/manifest.json`:
```json
{
  "Name": "Calendar",
  "Version": "1.0.0.0",
  "Author": "Cian Mac Mahon",
  "UUID": "com.cianmm.calendar",
  "Description": "Shows your next meeting and joins it from a single key.",
  "Category": "Calendar",
  "Icon": "imgs/plugin/marketplace",
  "CategoryIcon": "imgs/plugin/category-icon",
  "CodePath": "bin/plugin.js",
  "SDKVersion": 2,
  "Software": { "MinimumVersion": "6.5" },
  "Nodejs": { "Version": "20", "Debug": "enabled" },
  "OS": [{ "Platform": "mac", "MinimumVersion": "12" }],
  "Actions": [
    {
      "Name": "Next Meeting",
      "UUID": "com.cianmm.calendar.next-meeting",
      "Icon": "imgs/actions/next-meeting/icon",
      "Tooltip": "Shows your next meeting and opens its link.",
      "Controllers": ["Keypad"],
      "PropertyInspectorPath": "ui/inspector.html",
      "States": [{ "Image": "imgs/actions/next-meeting/key", "TitleAlignment": "middle" }]
    }
  ]
}
```
Keep whatever placeholder icons the CLI generated under `imgs/` (rename folders to match the paths above if needed).

- [ ] **Step 4: Placeholder action + registration**

Create `src/actions/next-meeting.ts`:
```ts
import { action, SingletonAction, type WillAppearEvent } from "@elgato/streamdeck";

export type NextMeetingSettings = {
  calendarIds?: string[];
};

@action({ UUID: "com.cianmm.calendar.next-meeting" })
export class NextMeetingAction extends SingletonAction<NextMeetingSettings> {
  override onWillAppear(ev: WillAppearEvent<NextMeetingSettings>): void {
    void ev.action.setTitle("Calendar");
  }
}
```
Set `src/plugin.ts`:
```ts
import streamDeck from "@elgato/streamdeck";
import { NextMeetingAction } from "./actions/next-meeting";

streamDeck.actions.registerAction(new NextMeetingAction());
streamDeck.connect();
```

- [ ] **Step 5: Build and typecheck**

Run:
```bash
npm run build && npm run typecheck && npm test
```
Expected: build emits `com.cianmm.calendar.sdPlugin/bin/plugin.js`; typecheck passes; `vitest run` reports "No test files found" (exit 0) — acceptable for this task.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold Stream Deck calendar plugin skeleton"
```

---

### Task 2: Shared types + state machine (`state.ts`)

The heart of the plugin: pure logic mapping a helper result + current time to a render model and a press action. Fully TDD with an injected clock.

**Files:**
- Create: `src/calendar/types.ts`
- Create: `src/calendar/state.ts`
- Test: `tests/state.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  export interface Meeting {
    title: string;
    start: Date;
    end: Date;
    url: string;
    calendarId: string;
  }
  export type HelperResult =
    | { kind: "meeting"; meeting: Meeting }
    | { kind: "none" }
    | { kind: "permission_denied" }
    | { kind: "error"; message: string };
  ```
- Produces (`state.ts`):
  ```ts
  export type ButtonState =
    | "idle" | "countdown" | "join-window" | "live" | "access-error" | "error";
  export type PressAction = "open-link" | "open-settings" | "none";
  export interface RenderModel {
    state: ButtonState;
    badge: string;
    timeRange?: string;
    title?: string;
    barColor: string;
    keyBg: string;
    pressAction: PressAction;
  }
  export function computeRenderModel(result: HelperResult, now: Date): RenderModel;
  ```

- [ ] **Step 1: Write the failing tests**

Create `tests/state.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `computeRenderModel` / `types` not found.

- [ ] **Step 3: Write `types.ts`**

Create `src/calendar/types.ts`:
```ts
export interface Meeting {
  title: string;
  start: Date;
  end: Date;
  url: string;
  calendarId: string;
}

export type HelperResult =
  | { kind: "meeting"; meeting: Meeting }
  | { kind: "none" }
  | { kind: "permission_denied" }
  | { kind: "error"; message: string };
```

- [ ] **Step 4: Implement `state.ts`**

Create `src/calendar/state.ts`:
```ts
import type { HelperResult } from "./types";

export type ButtonState =
  | "idle" | "countdown" | "join-window" | "live" | "access-error" | "error";
export type PressAction = "open-link" | "open-settings" | "none";

export interface RenderModel {
  state: ButtonState;
  badge: string;
  timeRange?: string;
  title?: string;
  barColor: string;
  keyBg: string;
  pressAction: PressAction;
}

const JOIN_LEAD_MS = 2 * 60 * 1000;

const COLORS = {
  idleBar: "#3a3a3d",
  countdownBar: "#e0a13a",
  joinBar: "#3ec46d",
  liveBar: "#ff5a5f",
  errorBar: "#ff5a5f",
  keyDark: "#19191b",
  keyLive: "#3a1417",
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function minutesUntil(target: Date, now: Date): number {
  return Math.ceil((target.getTime() - now.getTime()) / 60000);
}

export function computeRenderModel(result: HelperResult, now: Date): RenderModel {
  if (result.kind === "permission_denied") {
    return {
      state: "access-error",
      badge: "ACCESS",
      barColor: COLORS.errorBar,
      keyBg: COLORS.keyLive,
      pressAction: "open-settings",
    };
  }
  if (result.kind === "error") {
    return {
      state: "error",
      badge: "ERROR",
      barColor: COLORS.errorBar,
      keyBg: COLORS.keyLive,
      pressAction: "none",
    };
  }
  if (result.kind === "none" || now.getTime() > result.meeting.end.getTime()) {
    return {
      state: "idle",
      badge: "",
      barColor: COLORS.idleBar,
      keyBg: COLORS.keyDark,
      pressAction: "none",
    };
  }

  const { meeting } = result;
  const timeRange = `${formatTime(meeting.start)}–${formatTime(meeting.end)}`;
  const startMs = meeting.start.getTime();
  const nowMs = now.getTime();

  if (nowMs < startMs - JOIN_LEAD_MS) {
    return {
      state: "countdown",
      badge: `IN ${minutesUntil(meeting.start, now)}`,
      timeRange,
      title: meeting.title,
      barColor: COLORS.countdownBar,
      keyBg: COLORS.keyDark,
      pressAction: "none",
    };
  }

  if (nowMs < startMs) {
    return {
      state: "join-window",
      badge: `JOIN · ${minutesUntil(meeting.start, now)}m`,
      timeRange,
      title: meeting.title,
      barColor: COLORS.joinBar,
      keyBg: COLORS.keyDark,
      pressAction: "open-link",
    };
  }

  return {
    state: "live",
    badge: "NOW",
    timeRange,
    title: meeting.title,
    barColor: COLORS.liveBar,
    keyBg: COLORS.keyLive,
    pressAction: "open-link",
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all `computeRenderModel` tests green).

- [ ] **Step 6: Commit**

```bash
git add src/calendar/types.ts src/calendar/state.ts tests/state.test.ts
git commit -m "feat: add calendar state machine"
```

---

### Task 3: Key rendering (`render.ts`)

Turns a `RenderModel` into an SVG string for `setImage`. Kept separate from the action so it is unit-testable.

**Files:**
- Create: `src/calendar/render.ts`
- Test: `tests/render.test.ts`

**Interfaces:**
- Consumes: `RenderModel` from `state.ts`.
- Produces: `export function renderKeySvg(model: RenderModel): string;` (returns a complete `<svg>...</svg>` string, 72×72 viewBox).

- [ ] **Step 1: Write the failing tests**

Create `tests/render.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `renderKeySvg` not found.

- [ ] **Step 3: Implement `render.ts`**

Create `src/calendar/render.ts`:
```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/calendar/render.ts tests/render.test.ts
git commit -m "feat: render meeting key as svg"
```

---

### Task 4: Helper client (`helper-client.ts`)

Spawns the Swift binary, parses JSON, and returns typed results. The native call is injected so it can be tested without the binary.

**Files:**
- Create: `src/calendar/helper-client.ts`
- Test: `tests/helper-client.test.ts`

**Interfaces:**
- Consumes: `HelperResult`, `Meeting` from `types.ts`.
- Produces:
  ```ts
  export type ExecResult = { stdout: string; stderr: string; code: number };
  export type ExecFn = (file: string, args: string[]) => Promise<ExecResult>;
  export function getNextMeeting(binaryPath: string, calendarIds: string[], exec?: ExecFn): Promise<HelperResult>;
  export function listCalendars(binaryPath: string, exec?: ExecFn): Promise<{ id: string; title: string }[]>;
  ```

- [ ] **Step 1: Write the failing tests**

Create `tests/helper-client.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `helper-client.ts`**

Create `src/calendar/helper-client.ts`:
```ts
import { execFile } from "node:child_process";
import type { HelperResult } from "./types";

export type ExecResult = { stdout: string; stderr: string; code: number };
export type ExecFn = (file: string, args: string[]) => Promise<ExecResult>;

const defaultExec: ExecFn = (file, args) =>
  new Promise((resolve) => {
    execFile(file, args, { maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      const code =
        err && typeof (err as NodeJS.ErrnoException).code === "number"
          ? ((err as NodeJS.ErrnoException).code as unknown as number)
          : err
            ? 1
            : 0;
      resolve({ stdout: stdout?.toString() ?? "", stderr: stderr?.toString() ?? "", code });
    });
  });

function parseErrorMessage(stdout: string): string {
  try {
    const obj = JSON.parse(stdout.trim());
    if (obj && typeof obj.error === "string") return obj.error;
  } catch {
    // fall through
  }
  return "error";
}

export async function getNextMeeting(
  binaryPath: string,
  calendarIds: string[],
  exec: ExecFn = defaultExec,
): Promise<HelperResult> {
  const { stdout, code } = await exec(binaryPath, ["next-meeting", "--calendars", ...calendarIds]);
  if (code !== 0) {
    const msg = parseErrorMessage(stdout);
    return msg === "permission_denied" ? { kind: "permission_denied" } : { kind: "error", message: msg };
  }
  const trimmed = stdout.trim();
  if (trimmed === "" || trimmed === "null") return { kind: "none" };
  let raw: { title: string; startISO: string; endISO: string; url: string; calendarId: string };
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return { kind: "error", message: "invalid_json" };
  }
  return {
    kind: "meeting",
    meeting: {
      title: raw.title,
      start: new Date(raw.startISO),
      end: new Date(raw.endISO),
      url: raw.url,
      calendarId: raw.calendarId,
    },
  };
}

export async function listCalendars(
  binaryPath: string,
  exec: ExecFn = defaultExec,
): Promise<{ id: string; title: string }[]> {
  const { stdout, code } = await exec(binaryPath, ["list-calendars"]);
  if (code !== 0) return [];
  try {
    const arr = JSON.parse(stdout.trim());
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/calendar/helper-client.ts tests/helper-client.test.ts
git commit -m "feat: add swift helper client"
```

---

### Task 5: Swift EventKit helper binary

The native calendar reader. No TS tests (EventKit/TCC can't be unit-tested); deliverable is verified by running the binary manually.

**Files:**
- Create: `helper/Package.swift`
- Create: `helper/Info.plist`
- Create: `helper/Sources/calendar-helper/main.swift`
- Create: `scripts/build-helper.sh`

**Interfaces:**
- Produces a binary copied to `com.cianmm.calendar.sdPlugin/bin/calendar-helper` supporting:
  - `list-calendars` → `[{ "id", "title" }]`
  - `next-meeting --calendars <id> [<id> ...]` → meeting JSON or `null`
  - error JSON `{ "error": "permission_denied" | "<msg>" }` with non-zero exit on failure.

- [ ] **Step 1: Write `Package.swift`**

Create `helper/Package.swift`:
```swift
// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "calendar-helper",
    platforms: [.macOS(.v12)],
    targets: [
        .executableTarget(
            name: "calendar-helper",
            path: "Sources/calendar-helper",
            linkerSettings: [
                .unsafeFlags([
                    "-Xlinker", "-sectcreate",
                    "-Xlinker", "__TEXT",
                    "-Xlinker", "__info_plist",
                    "-Xlinker", "Info.plist",
                ])
            ]
        )
    ]
)
```

- [ ] **Step 2: Write `Info.plist`**

Create `helper/Info.plist` (embedded so macOS shows a usage string for the TCC prompt):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSCalendarsFullAccessUsageDescription</key>
  <string>Shows your next meeting and opens its link on your Stream Deck.</string>
  <key>NSCalendarsUsageDescription</key>
  <string>Shows your next meeting and opens its link on your Stream Deck.</string>
</dict>
</plist>
```

- [ ] **Step 3: Write `main.swift`**

Create `helper/Sources/calendar-helper/main.swift`:
```swift
import Foundation
import EventKit

let store = EKEventStore()
let iso = ISO8601DateFormatter()

func printJSON(_ obj: Any) {
    if let data = try? JSONSerialization.data(withJSONObject: obj),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
}

func fail(_ message: String) -> Never {
    printJSON(["error": message])
    exit(1)
}

func requestAccess() -> Bool {
    let sem = DispatchSemaphore(value: 0)
    var granted = false
    if #available(macOS 14.0, *) {
        store.requestFullAccessToEvents { ok, _ in granted = ok; sem.signal() }
    } else {
        store.requestAccess(to: .event) { ok, _ in granted = ok; sem.signal() }
    }
    sem.wait()
    return granted
}

guard requestAccess() else { fail("permission_denied") }

let args = Array(CommandLine.arguments.dropFirst())
guard let command = args.first else { fail("missing_command") }

switch command {
case "list-calendars":
    let cals = store.calendars(for: .event).map {
        ["id": $0.calendarIdentifier, "title": $0.title]
    }
    printJSON(cals)

case "next-meeting":
    var ids: [String] = []
    if let idx = args.firstIndex(of: "--calendars") {
        ids = Array(args[(idx + 1)...])
    }
    let chosen = store.calendars(for: .event).filter { ids.contains($0.calendarIdentifier) }
    if chosen.isEmpty {
        print("null")
        exit(0)
    }
    let now = Date()
    let until = Calendar.current.date(byAdding: .day, value: 30, to: now)!
    let predicate = store.predicateForEvents(withStart: now, end: until, calendars: chosen)
    let next = store.events(matching: predicate)
        .filter { ev in
            guard let url = ev.url?.absoluteString, !url.isEmpty else { return false }
            return ev.endDate > now
        }
        .sorted { $0.startDate < $1.startDate }
        .first

    guard let event = next, let url = event.url?.absoluteString else {
        print("null")
        exit(0)
    }
    printJSON([
        "title": event.title ?? "(no title)",
        "startISO": iso.string(from: event.startDate),
        "endISO": iso.string(from: event.endDate),
        "url": url,
        "calendarId": event.calendar.calendarIdentifier,
    ])

default:
    fail("unknown_command")
}
```

- [ ] **Step 4: Write the build script**

Create `scripts/build-helper.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
HELPER_DIR="$(cd "$(dirname "$0")/../helper" && pwd)"
DEST_DIR="$(cd "$(dirname "$0")/.." && pwd)/com.cianmm.calendar.sdPlugin/bin"

cd "$HELPER_DIR"
swift build -c release --arch arm64 --arch x86_64
BIN_PATH="$(swift build -c release --arch arm64 --arch x86_64 --show-bin-path)/calendar-helper"

mkdir -p "$DEST_DIR"
cp "$BIN_PATH" "$DEST_DIR/calendar-helper"
chmod +x "$DEST_DIR/calendar-helper"
echo "Copied helper to $DEST_DIR/calendar-helper"
```
Then: `chmod +x scripts/build-helper.sh`.

- [ ] **Step 5: Build and smoke-test the binary**

Run:
```bash
./scripts/build-helper.sh
./com.cianmm.calendar.sdPlugin/bin/calendar-helper list-calendars
```
Expected: macOS shows a Calendar access prompt on first run; after granting, the command prints a JSON array of `{id,title}`. Then run `./com.cianmm.calendar.sdPlugin/bin/calendar-helper next-meeting --calendars <id>` with a real calendar id and confirm it prints a meeting JSON or `null`.

If the access prompt does not appear or returns `permission_denied`, grant the binary (or its parent process) access under System Settings → Privacy & Security → Calendars, then re-run. Record the working invocation.

- [ ] **Step 6: Add a `prebuild` hook and commit**

Add to `package.json` `"scripts"`: `"build:helper": "./scripts/build-helper.sh"` and prepend it to the existing build, e.g. `"build": "./scripts/build-helper.sh && rollup -c"` (keep whatever the CLI generated after the `&&`).

```bash
git add helper scripts package.json
git commit -m "feat: add swift eventkit helper binary"
```
(Do not commit the compiled `calendar-helper` binary or `helper/.build/`; add them to `.gitignore`.)

- [ ] **Step 7: Ignore build artifacts**

Append to `.gitignore`:
```
helper/.build/
com.cianmm.calendar.sdPlugin/bin/calendar-helper
```
Commit:
```bash
git add .gitignore
git commit -m "chore: ignore helper build artifacts"
```

---

### Task 6: Wire the action (timers, rendering, key press)

Connects everything: polls the helper, ticks every second to re-render via `setImage`, and opens the link on press inside the join window.

**Files:**
- Modify: `src/actions/next-meeting.ts`
- Test: `tests/action.test.ts`

**Interfaces:**
- Consumes: `computeRenderModel` (`state.ts`), `renderKeySvg` (`render.ts`), `getNextMeeting` (`helper-client.ts`), `HelperResult` (`types.ts`).
- Produces: finalized `NextMeetingAction` with `onWillAppear`, `onWillDisappear`, `onDidReceiveSettings`, `onKeyDown`.

- [ ] **Step 1: Write the failing test**

Create `tests/action.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const openUrl = vi.fn();
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `onKeyDown` behavior not implemented (or `cached` undefined).

- [ ] **Step 3: Implement the action**

Replace `src/actions/next-meeting.ts` with:
```ts
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import streamDeck, {
  action,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  type SendToPluginEvent,
  type JsonValue,
} from "@elgato/streamdeck";

import { computeRenderModel } from "../calendar/state";
import { renderKeySvg } from "../calendar/render";
import { getNextMeeting, listCalendars } from "../calendar/helper-client";
import type { HelperResult } from "../calendar/types";

export type NextMeetingSettings = {
  calendarIds?: string[];
};

const POLL_MS = 60_000;
const TICK_MS = 1_000;
const SETTINGS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars";

const HELPER_PATH = join(dirname(fileURLToPath(import.meta.url)), "calendar-helper");

type KeyAction = { setImage: (image: string) => Promise<void> };

@action({ UUID: "com.cianmm.calendar.next-meeting" })
export class NextMeetingAction extends SingletonAction<NextMeetingSettings> {
  private cached: HelperResult = { kind: "none" };
  private calendarIds: string[] = [];
  private currentAction: KeyAction | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  override async onWillAppear(ev: WillAppearEvent<NextMeetingSettings>): Promise<void> {
    this.currentAction = ev.action as unknown as KeyAction;
    this.calendarIds = ev.payload.settings.calendarIds ?? [];
    await this.poll();
    this.render();
    this.pollTimer ??= setInterval(() => void this.poll(), POLL_MS);
    this.tickTimer ??= setInterval(() => this.render(), TICK_MS);
  }

  override onWillDisappear(_ev: WillDisappearEvent<NextMeetingSettings>): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.pollTimer = null;
    this.tickTimer = null;
    this.currentAction = null;
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<NextMeetingSettings>): Promise<void> {
    this.calendarIds = ev.payload.settings.calendarIds ?? [];
    await this.poll();
    this.render();
  }

  override async onKeyDown(ev: KeyDownEvent<NextMeetingSettings>): Promise<void> {
    void ev;
    const model = computeRenderModel(this.cached, new Date());
    if (model.pressAction === "open-link" && this.cached.kind === "meeting") {
      await streamDeck.system.openUrl(this.cached.meeting.url);
    } else if (model.pressAction === "open-settings") {
      await streamDeck.system.openUrl(SETTINGS_URL);
    }
  }

  override async onSendToPlugin(
    ev: SendToPluginEvent<JsonValue, NextMeetingSettings>,
  ): Promise<void> {
    const payload = ev.payload as { event?: string };
    if (payload?.event === "getCalendars") {
      const cals = await listCalendars(HELPER_PATH);
      await ev.action.sendToPropertyInspector({
        event: "getCalendars",
        items: cals.map((c) => ({ label: c.title, value: c.id })),
      });
    }
  }

  private async poll(): Promise<void> {
    try {
      this.cached = await getNextMeeting(HELPER_PATH, this.calendarIds);
    } catch (err) {
      streamDeck.logger.error("poll failed", err);
      this.cached = { kind: "error", message: String(err) };
    }
  }

  private render(): void {
    if (!this.currentAction) return;
    const model = computeRenderModel(this.cached, new Date());
    void this.currentAction.setImage(`data:image/svg+xml,${encodeURIComponent(renderKeySvg(model))}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all action tests green, plus existing suites).

- [ ] **Step 5: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both succeed. If `import.meta` errors under the TS config, ensure `tsconfig.json` has `"module": "ESNext"` / `"moduleResolution": "Bundler"` (the CLI template already targets ESM).

- [ ] **Step 6: Commit**

```bash
git add src/actions/next-meeting.ts tests/action.test.ts
git commit -m "feat: wire next-meeting action timers, render and press"
```

---

### Task 7: Property Inspector (calendar picker)

Lets the user choose which calendars are watched. The plugin-side datasource handler was already added in Task 6 (`onSendToPlugin` → `getCalendars`); this task adds the UI and verifies it.

**Files:**
- Create: `com.cianmm.calendar.sdPlugin/ui/inspector.html`
- Create (vendored): `com.cianmm.calendar.sdPlugin/ui/sdpi-components.js`

**Interfaces:**
- Consumes: plugin `getCalendars` datasource responding with `{ event: "getCalendars", items: [{ label, value }] }`.
- Produces: persisted setting `calendarIds: string[]` consumed by the action.

- [ ] **Step 1: Vendor sdpi-components**

Run:
```bash
curl -L -o com.cianmm.calendar.sdPlugin/ui/sdpi-components.js https://sdpi-components.dev/releases/v4/sdpi-components.js
```
Expected: a non-empty JS file is downloaded (so the PI works offline).

- [ ] **Step 2: Write the Property Inspector HTML**

Create `com.cianmm.calendar.sdPlugin/ui/inspector.html`:
```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script src="sdpi-components.js"></script>
  </head>
  <body>
    <sdpi-item label="Calendars">
      <sdpi-checkbox-list setting="calendarIds" datasource="getCalendars"></sdpi-checkbox-list>
    </sdpi-item>
  </body>
</html>
```

- [ ] **Step 3: Build, install, and verify end-to-end**

Run:
```bash
npm run build
npx @elgato/cli link com.cianmm.calendar.sdPlugin
npx @elgato/cli restart com.cianmm.calendar
```
Then in the Stream Deck app: add the "Next Meeting" action to a key, open its Property Inspector, and confirm the calendar checkboxes populate (proves the `getCalendars` datasource round-trip). Select a calendar that has an upcoming event with a join URL.

Verify the full behavior against a seeded test event:
- More than 2 min before start → amber key, `IN n`, pressing does nothing.
- Within 2 min before start → green key, `JOIN · nm`, pressing opens the link.
- During the meeting → red key, `NOW`, pressing opens the link.
- No upcoming joinable event → grey "No meetings".

- [ ] **Step 4: Commit**

```bash
git add com.cianmm.calendar.sdPlugin/ui/inspector.html com.cianmm.calendar.sdPlugin/ui/sdpi-components.js
git commit -m "feat: add calendar-picker property inspector"
```

---

## Verification

After all tasks:
- `npm test` — all suites pass (state, render, helper-client, action).
- `npm run typecheck` — clean.
- `./scripts/build-helper.sh` then `npm run build` — produce a loadable `.sdPlugin`.
- Manual end-to-end on a real Stream Deck with a seeded event covering each state and the 2-minute join window (Task 7, Step 3).
