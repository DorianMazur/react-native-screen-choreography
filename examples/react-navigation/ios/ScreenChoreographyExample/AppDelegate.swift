import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "ScreenChoreographyExample",
      in: window,
      initialProperties: performanceInitialProperties(),
      launchOptions: launchOptions
    )

    return true
  }

  private func performanceInitialProperties() -> [AnyHashable: Any]? {
    let arguments = ProcessInfo.processInfo.arguments
    guard let index = arguments.firstIndex(of: "--performanceScenario"),
      arguments.indices.contains(index + 1),
      ["ordinary", "live"].contains(arguments[index + 1])
    else {
      return nil
    }

    let profileIndex = arguments.firstIndex(of: "--performanceReactProfile")
    let reactProfile = profileIndex.map { index in
      arguments.indices.contains(index + 1)
        && ["true", "1"].contains(arguments[index + 1].lowercased())
    } ?? false

    return [
      "performanceScenario": arguments[index + 1],
      // The matching production profiling renderer is selected at bundle time.
      "performanceReactProfile": reactProfile,
    ]
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
