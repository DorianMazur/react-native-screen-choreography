#import "ScreenChoreographyPreparation.h"
#import <ReactCommon/RCTTurboModuleWithJSIBindings.h>
#include "../cpp/FabricLayoutCapture.h"

@interface ScreenChoreographyPreparation () <RCTTurboModuleWithJSIBindings>
@end

@implementation ScreenChoreographyPreparation
RCT_EXPORT_MODULE(ScreenChoreographyPreparation)

+ (BOOL)requiresMainQueueSetup { return NO; }

- (void)installJSIBindingsWithRuntime:(facebook::jsi::Runtime &)runtime
                        callInvoker:(const std::shared_ptr<facebook::react::CallInvoker> &)callInvoker
{
  screenchoreography::installFabricLayoutCapture(runtime, callInvoker);
}

- (NSNumber *)install { return @YES; }

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeChoreographyPreparationSpecJSI>(params);
}
@end
