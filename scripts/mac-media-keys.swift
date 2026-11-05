import AppKit
import Foundation

// Listens for the keyboard volume keys and prints one JSON object per key press.
// The LG HDMI output has no macOS volume, so these keys never change a system level.
final class KeyTap {
  private var port: CFMachPort?
  private let volumeUp = 0
  private let volumeDown = 1
  private let auxControlSubtype = 8
  private let keyDownState = 0x0A

  func start() -> Bool {
    let mask = CGEventMask(1 << 14)
    let userInfo = Unmanaged.passUnretained(self).toOpaque()
    guard let created = CGEvent.tapCreate(
      tap: .cgSessionEventTap,
      place: .headInsertEventTap,
      options: .listenOnly,
      eventsOfInterest: mask,
      callback: { _, type, event, userInfo in
        let tap = Unmanaged<KeyTap>.fromOpaque(userInfo!).takeUnretainedValue()
        return tap.handle(type: type, event: event)
      },
      userInfo: userInfo
    ) else {
      return false
    }
    port = created
    let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, created, 0)
    CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
    CGEvent.tapEnable(tap: created, enable: true)
    return true
  }

  func handle(type: CGEventType, event: CGEvent) -> Unmanaged<CGEvent>? {
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
      if let port { CGEvent.tapEnable(tap: port, enable: true) }
      return Unmanaged.passUnretained(event)
    }
    guard let nsEvent = NSEvent(cgEvent: event), nsEvent.subtype.rawValue == auxControlSubtype else {
      return Unmanaged.passUnretained(event)
    }
    let data1 = nsEvent.data1
    let keyCode = (data1 & 0xFFFF0000) >> 16
    let keyDown = ((data1 & 0xFF00) >> 8) == keyDownState
    guard keyDown else { return Unmanaged.passUnretained(event) }
    let direction: Int
    switch keyCode {
    case volumeUp: direction = 1
    case volumeDown: direction = -1
    default: return Unmanaged.passUnretained(event)
    }
    print("{\"type\":\"key\",\"direction\":\(direction)}")
    fflush(stdout)
    return Unmanaged.passUnretained(event)
  }
}

let tap = KeyTap()
if !tap.start() {
  fputs("{\"type\":\"error\",\"error\":\"accessibility\"}\n", stdout)
  fflush(stdout)
  exit(1)
}
CFRunLoopRun()
