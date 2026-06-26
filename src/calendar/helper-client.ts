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
