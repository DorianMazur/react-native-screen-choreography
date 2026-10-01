import Foundation
import React
import UIKit

/// Only benchmark launches install this window. Event and ack times share iOS uptime.
final class BenchmarkWindow: UIWindow {
  override func sendEvent(_ event: UIEvent) {
    for touch in event.allTouches ?? [] where touch.phase == .ended {
      BenchmarkRecorder.record(touch, in: self)
    }
    super.sendEvent(event)
  }
}

private enum BenchmarkRecorder {
  static var touches: [[String: Any]] = []
  static var acknowledgements: [[String: Any]] = []
  static var droppedSamples = 0
  static var now: Double { ProcessInfo.processInfo.systemUptime * 1000 }

  static func record(_ touch: UITouch, in window: UIWindow) {
    guard touches.count < 20000 else { droppedSamples += 1; return }
    let point = touch.location(in: window)
    touches.append([
      "kind": "window-touch-ended", "eventUptimeMs": touch.timestamp * 1000,
      "dispatchUptimeMs": now, "x": point.x, "y": point.y,
    ])
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
