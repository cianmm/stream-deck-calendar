import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HelperResult } from "./types";

export type ExecResult = { stdout: string; stderr: string; code: number };
export type ExecFn = (file: string, args: string[]) => Promise<ExecResult>;

// Launch a .app bundle via `open` so macOS attaches the Calendar grant to the
// app's bundle id. `open` does not relay the child's stdout, so we pass an
// `--out <file>` the helper writes its JSON to, wait for the app to exit
// (`-W`), then read the file back. `-n` forces a fresh instance each poll.
const openAppExec: ExecFn = (appPath, args) =>
  new Promise((resolve) => {
    const dir = mkdtempSync(join(tmpdir(), "cal-helper-"));
    const outFile = join(dir, "out.json");
    execFile(
      "open",
      ["-W", "-n", appPath, "--args", ...args, "--out", outFile],
      { maxBuffer: 1024 * 1024 },
      () => {
        // `open -W` cannot always block on a short-lived app, so it may return
        // before the helper has flushed its output file. Poll briefly for it.
        const deadline = Date.now() + 2000;
        const tryRead = () => {
          let stdout = "";
          try {
            stdout = readFileSync(outFile, "utf8");
          } catch {
            stdout = "";
          }
          if (stdout.trim() === "" && Date.now() < deadline) {
            setTimeout(tryRead, 100);
            return;
          }
          try {
            rmSync(dir, { recursive: true, force: true });
          } catch {
            // best-effort cleanup
          }
          resolve({ stdout, stderr: "", code: 0 });
        };
        tryRead();
      },
    );
  });

// The helper signals failure with a JSON object carrying an `error` field.
// We key on that content (not the process exit code), because when launched
// via `open` the caller never sees the helper's exit code.
function errorField(value: unknown): string | undefined {
  if (value && typeof value === "object" && "error" in value) {
    const err = (value as { error: unknown }).error;
    if (typeof err === "string") return err;
  }
  return undefined;
}

export async function getNextMeeting(
  binaryPath: string,
  calendarIds: string[],
  exec: ExecFn = openAppExec,
): Promise<HelperResult> {
  const { stdout } = await exec(binaryPath, ["next-meeting", "--calendars", ...calendarIds]);
  const trimmed = stdout.trim();
  if (trimmed === "" || trimmed === "null") return { kind: "none" };

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return { kind: "error", message: "invalid_json" };
  }

  const err = errorField(raw);
  if (err) {
    return err === "permission_denied" ? { kind: "permission_denied" } : { kind: "error", message: err };
  }

  const meeting = raw as {
    title: string;
    startISO: string;
    endISO: string;
    url: string;
    calendarId: string;
    backToBack?: boolean;
  };
  return {
    kind: "meeting",
    meeting: {
      title: meeting.title,
      start: new Date(meeting.startISO),
      end: new Date(meeting.endISO),
      url: meeting.url,
      calendarId: meeting.calendarId,
      backToBack: Boolean(meeting.backToBack),
    },
  };
}

export async function listCalendars(
  binaryPath: string,
  exec: ExecFn = openAppExec,
): Promise<{ id: string; title: string }[]> {
  const { stdout } = await exec(binaryPath, ["list-calendars"]);
  const trimmed = stdout.trim();
  if (trimmed === "") return [];
  try {
    const arr = JSON.parse(trimmed);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
