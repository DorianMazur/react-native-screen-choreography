import Foundation
import React
import UIKit

/// Only benchmark launches use this application. Include touches in tray and modal
/// windows as well as the app window. Event and ack times share iOS uptime.
final class BenchmarkApplication: UIApplication {
  override func sendEvent(_ event: UIEvent) {
    for touch in event.allTouches ?? [] where touch.phase == .began || touch.phase == .ended || touch.phase == .cancelled {
      if let window = touch.window { BenchmarkRecorder.record(touch, in: window) }
    }
    super.sendEvent(event)
  }
}

private enum BenchmarkRecorder {
  static var touches: [[String: Any]] = []
  static var touchEvents: [[String: Any]] = []
  static var acknowledgements: [[String: Any]] = []
  static var droppedSamples = 0
  static var now: Double { ProcessInfo.processInfo.systemUptime * 1000 }

  static func record(_ touch: UITouch, in window: UIWindow) {
    guard touchEvents.count < 20000 else { droppedSamples += 1; return }
    let point = touch.location(in: window)
    let sample: [String: Any] = [
      "eventUptimeMs": touch.timestamp * 1000,
      "dispatchUptimeMs": now, "x": point.x, "y": point.y,
    ]
    if touch.phase == .ended {
      // Preserve the ended-touch stream used to validate probe timing.
      touches.append(sample.merging(["kind": "window-touch-ended"]) { _, value in value })
    }
    var path: [[String: Any]] = []
    var view = touch.view
    while let current = view {
      path.append([
        "class": NSStringFromClass(type(of: current)), "tag": current.tag,
        "identifier": current.accessibilityIdentifier ?? "",
        "alpha": current.alpha, "interactive": current.isUserInteractionEnabled,
      ])
      view = current.superview
    }
    touchEvents.append(sample.merging([
      "phase": touch.phase == .began ? "began" : touch.phase == .ended ? "ended" : "cancelled",
      "windowClass": NSStringFromClass(type(of: window)),
      "windowLevel": window.windowLevel.rawValue,
      "targetPath": path,
    ]) { _, value in value })
  }
}

@objc(ChoreographyBenchmark)
final class ChoreographyBenchmark: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { true }
  @objc var methodQueue: DispatchQueue { .main }

  @objc func acknowledgeInput(_ screen: String) {
    guard BenchmarkRecorder.acknowledgements.count < 20000 else {
      BenchmarkRecorder.droppedSamples += 1
      return
    }
    let ack = BenchmarkRecorder.now
    let event = BenchmarkRecorder.touches.last?["eventUptimeMs"] as? Double
    BenchmarkRecorder.acknowledgements.append([
      "probe": screen, "eventUptimeMs": event as Any? ?? NSNull(),
      "nativeAckUptimeMs": ack,
      "touchToNativeAckMs": event.map { ack - $0 } as Any? ?? NSNull(),
    ])
  }

  @objc func finishRun(_ json: String,
                       resolve: RCTPromiseResolveBlock,
                       reject: RCTPromiseRejectBlock) {
    do {
      guard ProcessInfo.processInfo.environment["PERFORMANCE_SCENARIO"] != nil,
            let data = json.data(using: .utf8),
            var run = try JSONSerialization.jsonObject(with: data) as? [String: Any]
      else { throw NSError(domain: "Benchmark", code: 1) }
      let directory = try FileManager.default.url(for: .documentDirectory, in: .userDomainMask,
                                                  appropriateFor: nil, create: true)
        .appendingPathComponent("performance", isDirectory: true)
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      let exportID = UUID().uuidString
      run["jsRunId"] = run["runId"]
      run["runId"] = exportID
      run["native"] = [
        "platform": "ios", "clock": "ios-uptime-ms", "device": UIDevice.current.model,
        "exportedAtUptimeMs": BenchmarkRecorder.now,
        "droppedSamples": BenchmarkRecorder.droppedSamples,
        "touches": BenchmarkRecorder.touches,
        "touchEvents": BenchmarkRecorder.touchEvents,
        "inputAcknowledgements": BenchmarkRecorder.acknowledgements,
      ]
      let file = directory.appendingPathComponent("\(exportID).json")
      try JSONSerialization.data(withJSONObject: run, options: [.prettyPrinted, .sortedKeys])
        .write(to: file, options: .atomic)
      resolve(file.path)
    } catch {
      reject("BENCHMARK_EXPORT_FAILED", error.localizedDescription, error)
    }
  }
}
