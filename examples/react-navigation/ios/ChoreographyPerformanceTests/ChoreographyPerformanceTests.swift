import XCTest

/// Same release fixture and real touch/probe sequence as the Android collector.
final class ChoreographyPerformanceTests: XCTestCase {
  private var activeApp: XCUIApplication?
  private var inputHistory: [[String: Any]] = []

  override func tearDownWithError() throws {
    defer { activeApp?.terminate() }
    if let app = activeApp,
       (testRun?.failureCount ?? 0) + (testRun?.unexpectedExceptionCount ?? 0) > 0 {
      preserveFailure(app)
    }
    try super.tearDownWithError()
  }

  func testGallery() throws { try run("gallery", open: "View Aurora", back: "Back to gallery") }
  func testTrips() throws { try run("trips", open: "Open SEILAND NORWAY trip", back: "Back to trips") }
  func testWallet() throws { try run("wallet", open: "Open Polygon", back: "Back to wallet") }
  func testWalletTray() throws { try runTray("tray-wallet", controls: ["Wallet dynamic tray", "Send money", "Choose recipient", "Alex Morgan", "Back in tray", "Back in tray", "Back in tray", "Close tray"]) }
  func testGalleryTray() throws { try runTray("tray-gallery", controls: ["Gallery dynamic tray", "Explore Plus", "Good to know", "Back in tray", "Back in tray", "Close tray"]) }

  private func runTray(_ scenario: String, controls: [String]) throws {
    continueAfterFailure = false
    let cycles = Int(ProcessInfo.processInfo.environment["PERFORMANCE_TIMING_CYCLES"] ?? "20") ?? 0
    XCTAssertTrue((1...99).contains(cycles), "Cycle count must be in 1...99")
    let app = XCUIApplication()
    activeApp = app
    app.launchEnvironment["PERFORMANCE_SCENARIO"] = scenario
    app.launch()
    awaitMarker(app, "benchmark-ready", timeout: 60)
    for cycle in 0..<cycles {
      for (index, control) in controls.enumerated() {
        let step = cycle * controls.count + index + 1
        if scenario == "tray-gallery" && index == 2 {
          scrollTo(app, control)
        }
        tap(app, control)
        awaitMarker(app, "benchmark-tray-step-\(step)-settled")
        tap(app, "benchmark-tray-probe")
        awaitMarker(app, "benchmark-tray-step-\(step)-probe-ack")
        if scenario == "tray-wallet" && index == 1 {
          tap(app, "Amount")
          element(app, "Amount").typeText("4")
          XCTAssertEqual(element(app, "Amount").value as? String, "4")
        }
        if scenario == "tray-wallet" && index == 5 {
          XCTAssertEqual(element(app, "Amount").value as? String, "4", "Back lost the retained draft")
        }
      }
    }
    tap(app, "benchmark-end")
    awaitMarker(app, "benchmark-export-complete")
  }

  private func run(_ scenario: String, open: String, back: String) throws {
    continueAfterFailure = false
    let cycles = Int(ProcessInfo.processInfo.environment["PERFORMANCE_TIMING_CYCLES"] ?? "20") ?? 0
    XCTAssertTrue((1...99).contains(cycles), "Cycle count must be in 1...99")
    let app = XCUIApplication()
    activeApp = app
    app.launchEnvironment["PERFORMANCE_SCENARIO"] = scenario
    app.launch()
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
    recordInput("wait", label)
    let target = element(app, label)
    let found = target.exists || target.waitForExistence(timeout: timeout)
    recordInput(found ? "marker-found" : "marker-missing", label)
    XCTAssertTrue(found, "Missing fixture marker: \(label)")
  }

  private func tap(_ app: XCUIApplication, _ label: String, leadingQuarter: Bool = false) {
    let target = element(app, label)
    XCTAssertTrue(target.exists || target.waitForExistence(timeout: 15), "Missing fixture control: \(label)")
    XCTAssertTrue(target.isEnabled, "Disabled fixture control: \(label)")
    let frame = target.frame
    recordInput("tap", label, fields: [
      "x": frame.minX + frame.width * (leadingQuarter ? 0.25 : 0.5),
      "y": frame.midY, "frame": [frame.minX, frame.minY, frame.width, frame.height],
    ])
    // Coordinates inject a real touch, including for cards behind the toolbar.
    target.coordinate(withNormalizedOffset: CGVector(dx: leadingQuarter ? 0.25 : 0.5, dy: 0.5)).tap()
  }

  private func scrollTo(_ app: XCUIApplication, _ label: String) {
    for _ in 0..<5 {
      let target = element(app, label)
      if target.exists && target.isHittable { return }
      let scroll = app.scrollViews.firstMatch
      XCTAssertTrue(scroll.exists, "No scroll container for fixture control: \(label)")
      recordInput("scroll-up", label)
      scroll.swipeUp()
    }
    XCTAssertTrue(element(app, label).isHittable, "Fixture control not found after scrolling: \(label)")
  }

  private func recordInput(_ kind: String, _ label: String, fields: [String: Any] = [:]) {
    inputHistory.append(fields.merging([
      "kind": kind, "label": label,
      "uptimeMs": ProcessInfo.processInfo.systemUptime * 1000,
    ]) { _, value in value })
  }

  private func preserveFailure(_ app: XCUIApplication) {
    if let data = try? JSONSerialization.data(withJSONObject: inputHistory, options: [.prettyPrinted, .sortedKeys]) {
      let history = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
      history.name = "Failed benchmark input history"
      history.lifetime = .keepAlways
      add(history)
    }
    guard app.state == .runningForeground else { return }
    let hierarchy = XCTAttachment(string: app.debugDescription)
    hierarchy.name = "Failed benchmark UI hierarchy"
    hierarchy.lifetime = .keepAlways
    add(hierarchy)
    // A lost tap never starts a request, so the fixture's request timeout cannot
    // export it. Preserve the partial run before terminating, without retrying
    // the failed action or replacing the original XCTest failure.
    let export = element(app, "benchmark-end")
    guard export.exists, export.isEnabled,
          !element(app, "benchmark-export-complete").exists else { return }
    export.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
    let saved = element(app, "benchmark-export-complete").waitForExistence(timeout: 5)
    print("Failure diagnostic export completed: \(saved)")
  }
}
