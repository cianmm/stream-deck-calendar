# Stream Deck Calendar Plugin — Design

**Date:** 2026-06-26
**Status:** Approved

## Goal

An Elgato Stream Deck plugin (macOS) that surfaces the user's next joinable
meeting on a single key and lets them join it with one press during a defined
window.

Requirements, restated:

1. Connect to the macOS Apple Calendar (via EventKit).
2. Show the next meeting on the key.
3. If that meeting has a join link, pressing the key from **2 minutes before the
   start through the end of the meeting** opens the link. Outside that window a
   press does nothing.

## Key decisions

- **Calendar access:** native Swift binary using **EventKit**, bundled in the
  plugin and shelled out to from Node. Most reliable; clean access to event
  fields; standard macOS Calendar permission prompt.
- **What counts as the "next meeting":** the soonest event that is (a) on a
  user-selected calendar, (b) has a non-empty `event.url`, and (c) has not yet
  ended. Events without a URL are **skipped**, not displayed.
- **Where the link comes from:** EventKit's dedicated `event.url` field only.
  (Future extension point: fall back to scanning location/notes for a join URL —
  out of scope for v1.)
- **Calendar selection:** a Property Inspector lets the user pick which
  calendars are watched; selection persisted to action settings.
- **Button display:** status badge (`IN 25` countdown → `JOIN · 1m` → `NOW`),
  time range, and title, with a left accent bar colored by state. Full state
  colors (grey idle / amber countdown / green join-window / red live).
- **Press behavior:** opens the link only inside the join window; no-op outside.

## Tech stack

- Official Elgato **Node.js + TypeScript SDK** (`@elgato/streamdeck`), scaffolded
  and packaged with the `streamdeck` CLI.
- Swift package producing a universal (arm64 + x86_64) `calendar-helper` binary,
  copied into the `.sdPlugin` bundle at build time.

## Architecture

```
stream-deck-calendar/
├─ com.cianmm.calendar.sdPlugin/        # installable plugin bundle
│  ├─ manifest.json                     # 1 action: "Next Meeting"
│  ├─ bin/calendar-helper               # compiled Swift EventKit binary (universal)
│  ├─ ui/inspector.html                 # Property Inspector (calendar pickers)
│  └─ (built JS emitted here from src/)
├─ helper/                              # Swift package for calendar-helper
│  └─ Sources/.../main.swift
├─ src/                                 # TypeScript plugin
│  ├─ plugin.ts                         # entry: registers the action
│  ├─ actions/next-meeting.ts          # timers, state machine, rendering, keyDown
│  ├─ calendar/helper-client.ts        # spawn + JSON parse, typed results/errors
│  └─ calendar/state.ts                 # pure state-machine + render-model logic
└─ package.json / rollup config         # from `streamdeck` CLI template
```

Two processes communicating via spawn + JSON over stdout:

- **Node plugin** — owns all Stream Deck concerns: UI, timers, button state,
  press handling.
- **Swift helper** — owns EventKit. Knows nothing about Stream Deck.

This keeps the native surface tiny and pushes all decision logic into testable
TypeScript.

## Components

### `calendar-helper` (Swift / EventKit)

A CLI binary. On launch it requests Calendar access (the grant is cached by
macOS after the first prompt). Commands:

- `list-calendars` → JSON `[{ "id": string, "title": string }]`
- `next-meeting --calendars <id> [<id> ...]` → the soonest event matching the
  rules above, as:
  ```json
  { "title": string, "startISO": string, "endISO": string,
    "url": string, "calendarId": string }
  ```
  or `null` when there is no such event.

Failure modes are expressed on stdout/exit code so the client can distinguish
"permission denied" from "no meeting":

- exit non-zero + `{ "error": "permission_denied" }` when access is not granted.
- exit non-zero + `{ "error": "<message>" }` for unexpected failures.

### `helper-client.ts`

Spawns the binary, parses JSON, and surfaces a typed result:
`{ kind: "meeting", meeting } | { kind: "none" } | { kind: "permission_denied" }
| { kind: "error", message }`. Single choke point for all native calls.

### `state.ts` (pure logic)

Given a cached `next-meeting` result and the current time, produces a render
model and a `canJoin` boolean. No I/O — fully unit-testable with an injected
clock.

States:

| Condition (relative to start `S`, end `E`, now `N`) | State        | Color | Press   |
|------------------------------------------------------|--------------|-------|---------|
| no meeting / `kind: none`                            | idle         | grey  | no-op   |
| `N < S − 2min`                                       | countdown    | amber | no-op   |
| `S − 2min ≤ N < S`                                   | join-window  | green | open    |
| `S ≤ N ≤ E`                                          | live         | red   | open    |
| `N > E`                                              | (expired — replaced on next poll) | — | — |
| `kind: permission_denied`                            | access-error | red   | open System Settings → Privacy → Calendars |
| `kind: error`                                        | error        | red   | no-op (retries on poll) |

Boundaries are inclusive as written: the join window opens exactly at `S − 2min`
and remains open through `E`.

### `next-meeting.ts` (the action)

- **Poll** the helper every ~60 s, plus immediately on `willAppear` and whenever
  settings change. Caches the typed result.
- **Tick** every 1 s from the cached result to update the countdown and flip
  state at the correct second (no EventKit call per second).
- Renders the key image (`setImage`) from the render model.
- Handles `keyDown`: open the URL when `canJoin`, otherwise ignore.
- Clears timers on `willDisappear`.

### `inspector.html` (Property Inspector)

Requests `list-calendars` via the plugin, renders a checkbox per calendar, and
persists selected calendar IDs into action settings. Empty selection → plugin
shows an idle "open settings" prompt.

## Data flow

```
inspector.html ──set selected calendarIds──▶ action settings
        ▲                                          │
        │ list-calendars (JSON)                    │ on change / 60s / willAppear
        │                                          ▼
  helper-client ◀── spawn ──▶ calendar-helper ──▶ EventKit ──▶ Calendar
        │
        ▼ cached typed result
  state.ts (cached result + now) ──▶ render model + canJoin
        │                                  │
        ▼ every 1s                         ▼ keyDown
  setImage(key)                       openUrl when canJoin
```

## Error handling

- **Permission denied** → distinct access-error key; pressing opens System
  Settings → Privacy → Calendars. Re-checked on each poll.
- **Helper missing / crash / malformed JSON** → error key; logged via the SDK
  logger; plugin keeps retrying on the poll interval (no crash loop).
- **`keyDown` outside the join window** → silently ignored.
- **No calendars selected** → idle state prompting the user to open settings.

## Testing

- **`state.ts`** — pure unit tests with a fixed clock and fixture results, TDD,
  covering every transition and the exact boundaries (`S − 2min` and `E`).
- **`helper-client.ts`** — unit tests against captured helper stdout fixtures
  (meeting / none / permission_denied / malformed), spawn mocked.
- **Swift helper** — kept thin; smoke-tested manually against real Calendar.app.
- **End-to-end** — manual install into Stream Deck with a seeded test event,
  verifying countdown, the 2-minute join-window opening, and link launch.

## Out of scope (v1)

- Scanning location/notes for join links (URL field only).
- Multiple meeting keys / multi-day agenda views.
- Non-macOS platforms.
- Auto-launching the meeting without a press.
