#include <ReactCommon/BindingsInstallerHolder.h>
#include <fbjni/fbjni.h>
#include "FabricLayoutCapture.h"

using namespace facebook;

class FabricLayoutBindings : public jni::JavaClass<FabricLayoutBindings> {
 public:
  static constexpr auto kJavaDescriptor = "Lcom/screenchoreography/ScreenChoreographyPreparationModule;";
  static jni::local_ref<react::BindingsInstallerHolder::javaobject> getBindingsInstaller(
      jni::alias_ref<FabricLayoutBindings>) {
    return react::BindingsInstallerHolder::newObjectCxxArgs(
        [](jsi::Runtime &runtime, const std::shared_ptr<react::CallInvoker> &callInvoker) {
          screenchoreography::installFabricLayoutCapture(runtime, callInvoker);
        });
  }
};

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *vm, void *) {
  return jni::initialize(vm, [] {
    FabricLayoutBindings::javaClassLocal()->registerNatives({
        makeNativeMethod("getBindingsInstaller", FabricLayoutBindings::getBindingsInstaller),
    });
  });
}
