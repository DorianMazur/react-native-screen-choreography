cmake_minimum_required(VERSION 3.22.1)
project(screenchoreography)
set(CMAKE_CXX_STANDARD 20)
find_package(ReactAndroid REQUIRED CONFIG)
find_package(fbjni REQUIRED CONFIG)
add_library(screenchoreography SHARED
  src/main/cpp/FabricLayoutBindings.cpp
  ../cpp/FabricLayoutCapture.cpp)
target_include_directories(screenchoreography PRIVATE ../cpp)
target_link_libraries(screenchoreography ReactAndroid::jsi ReactAndroid::reactnative fbjni::fbjni)
# Keep 16 KB alignment when the app uses an NDK older than r28.
target_link_options(screenchoreography PRIVATE
  "-Wl,-z,max-page-size=16384" "-Wl,-z,common-page-size=16384")
target_compile_options(screenchoreography PRIVATE -fexceptions -frtti -Wall -Werror)
target_compile_definitions(screenchoreography PRIVATE
  FOLLY_NO_CONFIG=1 FOLLY_MOBILE=1 FOLLY_USE_LIBCPP=1 FOLLY_CFG_NO_COROUTINES=1)
if(ReactAndroid_VERSION_MINOR GREATER_EQUAL 83)
  target_compile_definitions(screenchoreography PRIVATE RN_SERIALIZABLE_STATE)
endif()
