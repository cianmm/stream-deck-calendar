import Foundation
import EventKit

let store = EKEventStore()
let iso = ISO8601DateFormatter()

let allArgs = Array(CommandLine.arguments.dropFirst())

// Optional `--out <path>`: when this helper is launched as a .app bundle via
// `open` (which it must be, so macOS attaches the Calendar grant to the app's
// bundle id), the caller does not receive the process's stdout. In that case
// write the JSON result to this file instead. Without --out we print to stdout
// as normal (used for local/Terminal debugging).
var outPath: String? = nil
if let i = allArgs.firstIndex(of: "--out"), i + 1 < allArgs.count {
    outPath = allArgs[i + 1]
}

func emitString(_ s: String) {
    if let path = outPath {
        try? s.write(toFile: path, atomically: true, encoding: .utf8)
    } else {
        print(s)
    }
}

func emitJSON(_ obj: Any) {
    if let data = try? JSONSerialization.data(withJSONObject: obj),
       let str = String(data: data, encoding: .utf8) {
        emitString(str)
    }
}

func fail(_ message: String) -> Never {
    emitJSON(["error": message])
    exit(1)
}

// Known video-conferencing hosts (substring-matched against the URL host). A
// link on one of these is treated as the meeting's join link in preference to
// any other URL found in the event. Covers the widely used platforms.
let meetingHosts = [
    "meet.google.com", "hangouts.google.com",          // Google Meet
    "zoom.us", "zoom.com", "zoomgov.com",              // Zoom
    "teams.microsoft.com", "teams.live.com", "teams.microsoft.us", // Microsoft Teams
    "facetime.apple.com",                              // FaceTime
    "webex.com",                                       // Cisco Webex
    "whereby.com",                                     // Whereby
    "meet.jit.si",                                     // Jitsi
    "gotomeeting.com", "gotomeet.me", "meet.goto.com", // GoTo Meeting
    "bluejeans.com",                                   // BlueJeans
    "chime.aws",                                       // Amazon Chime
    "around.co",                                       // Around
    "join.skype.com", "skype.com",                     // Skype
    "discord.gg", "discord.com",                       // Discord
    "ringcentral.com",                                 // RingCentral
    "8x8.vc",                                          // 8x8
    "tldv.io",                                         // tl;dv
]

// Extract http(s) URLs from free text with a simple regex. (NSDataDetector was
// unreliable here — it returned no matches for valid links in some contexts.)
func allURLs(in text: String) -> [String] {
    guard !text.isEmpty,
          let re = try? NSRegularExpression(pattern: "https?://[^\\s<>\"']+", options: [.caseInsensitive])
    else { return [] }
    let range = NSRange(text.startIndex..<text.endIndex, in: text)
    var urls: [String] = []
    re.enumerateMatches(in: text, options: [], range: range) { match, _, _ in
        guard let match, let r = Range(match.range, in: text) else { return }
        var url = String(text[r])
        // Trim trailing punctuation that commonly abuts a URL in prose.
        while let last = url.last, ").,;:!]>".contains(last) { url.removeLast() }
        if !url.isEmpty { urls.append(url) }
    }
    return urls
}

// Resolve an event's join link: the dedicated URL field wins; otherwise scan
// the location then the notes, preferring a known conferencing host and
// falling back to the first link found.
func resolveMeetingURL(_ ev: EKEvent) -> String? {
    if let u = ev.url?.absoluteString, !u.isEmpty { return u }
    let fields = [ev.location ?? "", ev.notes ?? ""]
    for field in fields {
        for u in allURLs(in: field) {
            if let host = URL(string: u)?.host?.lowercased(),
               meetingHosts.contains(where: { host.contains($0) }) {
                return u
            }
        }
    }
    for field in fields {
        if let u = allURLs(in: field).first { return u }
    }
    return nil
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

// Strip `--out <path>` so it does not interfere with command parsing.
var args: [String] = []
var skipNext = false
for a in allArgs {
    if skipNext { skipNext = false; continue }
    if a == "--out" { skipNext = true; continue }
    args.append(a)
}

guard let command = args.first else { fail("missing_command") }

switch command {
case "list-calendars":
    let cals = store.calendars(for: .event).map {
        ["id": $0.calendarIdentifier, "title": $0.title]
    }
    emitJSON(cals)

case "next-meeting":
    var ids: [String] = []
    if let idx = args.firstIndex(of: "--calendars") {
        ids = Array(args[(idx + 1)...])
    }
    let chosen = store.calendars(for: .event).filter { ids.contains($0.calendarIdentifier) }
    if chosen.isEmpty {
        emitString("null")
        exit(0)
    }
    let now = Date()
    let until = Calendar.current.date(byAdding: .day, value: 30, to: now)!
    let predicate = store.predicateForEvents(withStart: now, end: until, calendars: chosen)
    let candidates = store.events(matching: predicate)
        .filter { !$0.isAllDay && $0.endDate > now && resolveMeetingURL($0) != nil }
        .sorted { $0.startDate < $1.startDate }

    guard let event = candidates.first, let url = resolveMeetingURL(event) else {
        emitString("null")
        exit(0)
    }
    // No gap before the meeting that follows this one: worth a heads-up so the
    // user knows to wrap up instead of finding out when this one's badge flips.
    let backToBack = candidates.count > 1 && candidates[1].startDate <= event.endDate
    emitJSON([
        "title": event.title ?? "(no title)",
        "startISO": iso.string(from: event.startDate),
        "endISO": iso.string(from: event.endDate),
        "url": url,
        "calendarId": event.calendar.calendarIdentifier,
        "backToBack": backToBack,
    ])

default:
    fail("unknown_command")
}
