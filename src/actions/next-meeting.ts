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
