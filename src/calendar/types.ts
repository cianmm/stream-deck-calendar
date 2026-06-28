export interface Meeting {
  title: string;
  start: Date;
  end: Date;
  url: string;
  calendarId: string;
  backToBack: boolean;
}

export type HelperResult =
  | { kind: "meeting"; meeting: Meeting }
  | { kind: "none" }
  | { kind: "permission_denied" }
  | { kind: "error"; message: string };
