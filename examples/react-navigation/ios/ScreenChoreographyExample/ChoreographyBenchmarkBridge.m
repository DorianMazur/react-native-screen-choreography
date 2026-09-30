#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ChoreographyBenchmark, NSObject)
RCT_EXTERN_METHOD(acknowledgeInput:(NSString *)screen)
RCT_EXTERN_METHOD(finishRun:(NSString *)json
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
@end
