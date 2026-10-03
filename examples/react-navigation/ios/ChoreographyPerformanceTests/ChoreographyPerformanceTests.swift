import XCTest

/// Same release fixture and real touch/probe sequence as the Android collector.
final class ChoreographyPerformanceTests: XCTestCase {
  func testGallery() throws { try run("gallery", open: "View Aurora", back: "Back to gallery") }
  func testTrips() throws { try run("trips", open: "Open SEILAND NORWAY trip", back: "Back to trips") }
  func testWallet() throws { try run("wallet", open: "Open Polygon", back: "Back to wallet") }

  private func run(_ scenario: String, open: String, back: String) throws {
    continueAfterFailure = false
    let cycles = Int(ProcessInfo.processInfo.environment["PERFORMANCE_TIMING_CYCLES"] ?? "20") ?? 0
    XCTAssertTrue((1...99).contains(cycles), "Cycle count must be in 1...99")
    let app = XCUIApplication()
    app.launchEnvironment["PERFORMANCE_SCENARIO"] = scenario
    app.launch()
    defer { app.terminate() }
    awaitMarker(app, "benchmark-ready", timeout: 60)
    for _ in 0..<cycles {
      tap(app, open, leadingQuarter: true)
      awaitMarker(app, "benchmark-detail-settled")
      tap(app, "benchmark-detail-probe")
      awaitMarker(app, "benchmark-detail-probe-ack")
      tap(app, back)
      awaitMarker(app, "benchmark-list-settled")
      tap(app, "benchmark-list-probe")
      awaitMarker(app, "benchmark-list-probe-ack")
    }
    tap(app, "benchmark-end")
    awaitMarker(app, "benchmark-export-complete")
  }

  private func element(_ app: XCUIApplication, _ label: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: label).firstMatch
  }

  private func awaitMarker(_ app: XCUIApplication, _ label: String, timeout: TimeInterval = 15) {
    XCTAssertTrue(element(app, label).waitForExistence(timeout: timeout), "Missing fixture marker: \(label)")
  }

  private func tap(_ app: XCUIApplication, _ label: String, leadingQuarter: Bool = false) {
    let target = element(app, label)
    XCTAssertTrue(target.waitForExistence(timeout: 15), "Missing fixture control: \(label)")
    XCTAssertTrue(target.isEnabled, "Disabled fixture control: \(label)")
    // Coordinates inject a real touch, including for cards behind the toolbar.
    target.coordinate(withNormalizedOffset: CGVector(dx: leadingQuarter ? 0.25 : 0.5, dy: 0.5)).tap()
  }
}
