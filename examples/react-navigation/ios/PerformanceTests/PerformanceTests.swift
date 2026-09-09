import XCTest

/// Release-only native measurements. Clock results describe the complete
/// automation-driven round trip, including real input acknowledgments; they
/// are not presented as a precise animation duration or time to first frame.
final class PerformanceTests: XCTestCase {
  private var reactProfile: Bool {
    ["true", "1"].contains(
      (ProcessInfo.processInfo.environment["PERFORMANCE_REACT_PROFILE"] ?? "").lowercased()
    )
  }

  override func setUpWithError() throws {
    continueAfterFailure = false
  }

  func testOrdinaryLaunch() throws {
    try XCTSkipIf(reactProfile, "Native timing requires the normal Release renderer")
    measureLaunch(scenario: "ordinary")
  }

  func testLiveLaunch() throws {
    try XCTSkipIf(reactProfile, "Native timing requires the normal Release renderer")
    measureLaunch(scenario: "live")
  }

  func testOrdinaryRoundTrip() throws {
    try XCTSkipIf(reactProfile, "Native timing requires the normal Release renderer")
    measureRoundTrip(scenario: "ordinary")
  }

  func testLiveRoundTrip() throws {
    try XCTSkipIf(reactProfile, "Native timing requires the normal Release renderer")
    measureRoundTrip(scenario: "live")
  }

  func testOrdinaryReactProfile() throws {
    try XCTSkipUnless(reactProfile, "Requires the production profiling renderer build")
    collectReactProfile(scenario: "ordinary")
  }

  func testLiveReactProfile() throws {
    try XCTSkipUnless(reactProfile, "Requires the production profiling renderer build")
    collectReactProfile(scenario: "live")
  }

  private func application(scenario: String) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = [
      "--performanceScenario", scenario,
      "--performanceReactProfile", reactProfile ? "true" : "false",
    ]
    return app
  }

  private func element(_ id: String, in app: XCUIApplication) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: id).firstMatch
  }

  private func waitFor(_ id: String, in app: XCUIApplication,
                       file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertTrue(element(id, in: app).waitForExistence(timeout: 30),
                  "Missing benchmark acknowledgment: \(id)", file: file, line: line)
  }

  private func tap(_ id: String, in app: XCUIApplication,
                   file: StaticString = #filePath, line: UInt = #line) {
    waitFor(id, in: app, file: file, line: line)
    let control = element(id, in: app)
    XCTAssertTrue(control.isHittable, "Benchmark control is not hittable: \(id)",
                  file: file, line: line)
    control.tap()
  }

  private func completeRoundTrip(in app: XCUIApplication) {
    tap("benchmark-start", in: app)
    waitFor("benchmark-detail-settled", in: app)
    tap("benchmark-detail-probe", in: app)
    waitFor("benchmark-detail-probe-ack", in: app)
    tap("benchmark-back", in: app)
    waitFor("benchmark-list-settled", in: app)
    tap("benchmark-list-probe", in: app)
    waitFor("benchmark-list-probe-ack", in: app)
  }

  private func reset(in app: XCUIApplication) {
    waitFor("benchmark-run-id", in: app)
    let run = element("benchmark-run-id", in: app)
    let previous = (run.value as? String) ?? run.label
    tap("benchmark-reset", in: app)
    let changed = XCTNSPredicateExpectation(
      predicate: NSPredicate { [self] _, _ in
        let current = element("benchmark-run-id", in: app)
        guard current.exists else { return false }
        let value = (current.value as? String) ?? current.label
        return !value.isEmpty && value != previous
      }, object: nil
    )
    XCTAssertEqual(XCTWaiter.wait(for: [changed], timeout: 30), .completed,
                   "Reset did not publish a new benchmark run")
    // Waiting for a new run first prevents accepting the previous ready marker.
    waitFor("benchmark-ready", in: app)
  }

  private func exportReport(in app: XCUIApplication) {
    tap("benchmark-end", in: app)
    // Completion appears only after the native file write Promise resolves.
    waitFor("benchmark-export-complete", in: app)
  }

  private func collectReactProfile(scenario: String) {
    let app = application(scenario: scenario)
    app.launch()
    waitFor("benchmark-ready", in: app)
    reset(in: app)
    completeRoundTrip(in: app)
    exportReport(in: app)
    app.terminate()
  }

  private func measureLaunch(scenario: String) {
    let app = application(scenario: scenario)
    let options = XCTMeasureOptions()
    options.iterationCount = 3
    options.invocationOptions = [.manuallyStart, .manuallyStop]
    measure(metrics: [XCTApplicationLaunchMetric(waitUntilResponsive: true)], options: options) {
      app.terminate()
      startMeasuring()
      app.launch()
      waitFor("benchmark-ready", in: app)
      stopMeasuring()
    }
    app.terminate()
  }

  private func measureRoundTrip(scenario: String) {
    let app = application(scenario: scenario)
    app.launch()
    waitFor("benchmark-ready", in: app)
    // Explicitly warm caches before the measured iterations. XCTest also
    // discards its first iteration; report both facts when comparing runs.
    completeRoundTrip(in: app)

    let options = XCTMeasureOptions()
    options.iterationCount = 3
    options.invocationOptions = [.manuallyStart, .manuallyStop]
    measure(metrics: [XCTClockMetric(), XCTMemoryMetric(application: app)], options: options) {
      reset(in: app)
      startMeasuring()
      completeRoundTrip(in: app)
      stopMeasuring()
      exportReport(in: app)
    }
    app.terminate()
  }
}
