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

const HELPER_PATH = join(dirname(fileURLToPath(import.meta.url)), "CalendarHelper.app");

type KeyAction = { setImage: (image: string) => Promise<void> };

@action({ UUID: "com.cianmm.calendar.next-meeting" })
export class NextMeetingAction extends SingletonAction<NextMeetingSettings> {
  private cached: HelperResult = { kind: "none" };
  private calendarIds: string[] = [];
  private currentAction: KeyAction | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private polling = false;

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
    ev: SendToPluginEvent<{ event?: string }, NextMeetingSettings>,
  ): Promise<void> {
    const payload = ev.payload;
    if (payload?.event === "getCalendars") {
      const cals = await listCalendars(HELPER_PATH);
      await streamDeck.ui.sendToPropertyInspector({
        event: "getCalendars",
        items: cals.map((c) => ({ label: c.title, value: c.id })),
      });
    }
  }

  private async poll(): Promise<void> {
    // Single-flight: a helper launch can block (e.g. waiting on a first-run
    // permission prompt). Without this guard the 60s timer stacks a new
    // launch — and a new prompt — on every tick while one is pending.
    if (this.polling) return;
    this.polling = true;
    try {
      this.cached = await getNextMeeting(HELPER_PATH, this.calendarIds);
    } catch (err) {
      streamDeck.logger.error("poll failed", err);
      this.cached = { kind: "error", message: String(err) };
    } finally {
      this.polling = false;
    }
  }

  private render(): void {
    if (!this.currentAction) return;
    const model = computeRenderModel(this.cached, new Date());
    void this.currentAction.setImage(`data:image/svg+xml,${encodeURIComponent(renderKeySvg(model))}`);
  }
}
