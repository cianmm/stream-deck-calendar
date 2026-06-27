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

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Countdown label that scales its unit to the distance: minutes up to 90 min,
// then hours up to a day, then days. Keeps the badge readable for far-off
// meetings (e.g. "IN 2d" instead of "IN 2978").
function formatCountdown(start: Date, now: Date): string {
  const ms = start.getTime() - now.getTime();
  if (ms <= 90 * MINUTE) return `IN ${Math.ceil(ms / MINUTE)}m`;
  if (ms <= DAY) return `IN ${Math.round(ms / HOUR)}h`;
  return `IN ${Math.round(ms / DAY)}d`;
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
      badge: formatCountdown(meeting.start, now),
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
