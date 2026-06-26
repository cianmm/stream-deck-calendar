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
