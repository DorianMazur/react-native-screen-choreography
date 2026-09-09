#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

// Example-app reporting only. This module does not instrument the library or
// claim React durations from a Release build without profiling support.
@interface ChoreographyBenchmark : NSObject <RCTBridgeModule>
@end

@implementation ChoreographyBenchmark

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

RCT_REMAP_METHOD(finishRun,
                 finishRun:(NSString *)json
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];
  id report = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:&error] : nil;
  if (![report isKindOfClass:[NSDictionary class]]) {
    reject(@"INVALID_BENCHMARK_REPORT", @"Expected a JSON report object", error);
    return;
  }

  NSFileManager *manager = [NSFileManager defaultManager];
  NSURL *documents = [[manager URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask] firstObject];
  NSURL *directory = [documents URLByAppendingPathComponent:@"choreography-benchmarks" isDirectory:YES];
  if (!directory || ![manager createDirectoryAtURL:directory
                       withIntermediateDirectories:YES attributes:nil error:&error]) {
    reject(@"BENCHMARK_EXPORT_FAILED", @"Could not create benchmark report directory", error);
    return;
  }

  NSString *filename = [NSString stringWithFormat:@"run-%@.json", [NSUUID UUID].UUIDString];
  NSURL *destination = [directory URLByAppendingPathComponent:filename];
  if (![data writeToURL:destination options:NSDataWritingAtomic error:&error]) {
    reject(@"BENCHMARK_EXPORT_FAILED", @"Could not write benchmark report", error);
    return;
  }
  resolve(destination.path);
}

@end
