require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "ScreenChoreography"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/DorianMazur/react-native-screen-choreography.git", :tag => "v#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift,cpp}", "cpp/**/*.{h,cpp}"
  s.private_header_files = "ios/**/*.h", "cpp/**/*.h"

  s.pod_target_xcconfig = {
    "SCREEN_CHOREOGRAPHY_TRACE_PRESENTATION" => "0",
    "GCC_PREPROCESSOR_DEFINITIONS" => "$(inherited) SCREEN_CHOREOGRAPHY_TRACE_PRESENTATION=$(SCREEN_CHOREOGRAPHY_TRACE_PRESENTATION)"
  }

  install_modules_dependencies(s)
end
