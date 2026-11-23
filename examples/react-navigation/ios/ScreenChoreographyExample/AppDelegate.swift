import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  private static let scenario = ProcessInfo.processInfo.environment["PERFORMANCE_SCENARIO"]
  private static let benchmarking = ["gallery", "trips", "wallet", "tray-wallet", "tray-gallery"].contains(scenario ?? "")

  static func main() {
    UIApplicationMain(CommandLine.argc, CommandLine.unsafeArgv,
                      benchmarking ? NSStringFromClass(BenchmarkApplication.self) : nil,
                      NSStringFromClass(AppDelegate.self))
  }

  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?
  private var launchOptions: [UIApplication.LaunchOptionsKey: Any]?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    self.launchOptions = launchOptions
    return true
  }

  func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(
      name: "Default Configuration",
      sessionRole: connectingSceneSession.role
    )
    configuration.delegateClass = SceneDelegate.self
    return configuration
  }

  func start(in scene: UIWindowScene) {
    if let existingWindow = window {
      existingWindow.windowScene = scene
      existingWindow.makeKeyAndVisible()
      return
    }

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    let window = UIWindow(windowScene: scene)
    self.window = window

    factory.startReactNative(
      withModuleName: "ScreenChoreographyExample",
      in: window,
      initialProperties: Self.benchmarking ? ["performanceScenario": Self.scenario!] : nil,
      launchOptions: launchOptions
    )
  }
}

@objc(SceneDelegate)
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard
      let windowScene = scene as? UIWindowScene,
      let appDelegate = UIApplication.shared.delegate as? AppDelegate
    else {
      return
    }
    appDelegate.start(in: windowScene)
    window = appDelegate.window
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
