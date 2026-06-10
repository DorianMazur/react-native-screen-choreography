#import "ScreenChoreographySnapshot.h"

#import <UIKit/UIKit.h>

#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>

#import <ScreenChoreographyViewSpec/ScreenChoreographyViewSpec.h>

using namespace facebook::react;

static NSString *const kSnapshotDirectoryName = @"screen-choreography-snapshots";

static NSString *SnapshotDirectoryPath(void)
{
  return [NSTemporaryDirectory() stringByAppendingPathComponent:kSnapshotDirectoryName];
}

@interface ScreenChoreographySnapshot () <NativeScreenChoreographySnapshotSpec>
@end

@implementation ScreenChoreographySnapshot

RCT_EXPORT_MODULE(ScreenChoreographySnapshot)

@synthesize viewRegistry_DEPRECATED = _viewRegistry;

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (void)captureView:(double)reactTag
            resolve:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject
{
  __weak __typeof(self) weakSelf = self;
  RCTExecuteOnMainQueue(^{
    __strong __typeof(weakSelf) strongSelf = weakSelf;
    if (strongSelf == nil) {
      reject(@"snapshot_unavailable", @"Module deallocated", nil);
      return;
    }

    UIView *view = [strongSelf->_viewRegistry viewForReactTag:@((NSInteger)reactTag)];
    if (view == nil || view.window == nil || CGRectIsEmpty(view.bounds)) {
      reject(@"snapshot_unavailable", @"View not found, detached, or has zero size", nil);
      return;
    }

    CGRect bounds = view.bounds;
    UIGraphicsImageRendererFormat *format = [UIGraphicsImageRendererFormat preferredFormat];
    format.opaque = NO;
    UIGraphicsImageRenderer *renderer =
      [[UIGraphicsImageRenderer alloc] initWithBounds:bounds format:format];

    // Rendering the subtree directly (instead of a window-level capture)
    // ignores ancestor opacity, so hidden pending-target elements still
    // produce a faithful bitmap.
    UIImage *image = [renderer imageWithActions:^(__unused UIGraphicsImageRendererContext *context) {
      [view drawViewHierarchyInRect:bounds afterScreenUpdates:NO];
    }];

    // Encode and write off the main thread; only the capture must be on main.
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
      NSData *data = UIImagePNGRepresentation(image);
      if (data == nil) {
        reject(@"snapshot_failed", @"Failed to encode snapshot", nil);
        return;
      }

      NSString *directory = SnapshotDirectoryPath();
      NSError *directoryError = nil;
      if (![[NSFileManager defaultManager] createDirectoryAtPath:directory
                                     withIntermediateDirectories:YES
                                                      attributes:nil
                                                           error:&directoryError]) {
        reject(@"snapshot_failed", @"Failed to create snapshot directory", directoryError);
        return;
      }

      NSString *filename =
        [[[NSUUID UUID] UUIDString] stringByAppendingPathExtension:@"png"];
      NSString *path = [directory stringByAppendingPathComponent:filename];

      NSError *writeError = nil;
      if (![data writeToFile:path options:NSDataWritingAtomic error:&writeError]) {
        reject(@"snapshot_failed", @"Failed to write snapshot", writeError);
        return;
      }

      resolve(@{
        @"uri" : [[NSURL fileURLWithPath:path] absoluteString],
        @"width" : @(bounds.size.width),
        @"height" : @(bounds.size.height),
      });
    });
  });
}

- (void)releaseSnapshot:(NSString *)uri
{
  NSURL *url = [NSURL URLWithString:uri];
  if (url == nil || !url.fileURL) {
    return;
  }

  // Only delete files inside our own snapshot directory.
  NSString *directory = [SnapshotDirectoryPath() stringByStandardizingPath];
  NSString *path = [url.path stringByStandardizingPath];
  if (![path hasPrefix:[directory stringByAppendingString:@"/"]]) {
    return;
  }

  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    [[NSFileManager defaultManager] removeItemAtPath:path error:nil];
  });
}

- (std::shared_ptr<TurboModule>)getTurboModule:(const ObjCTurboModule::InitParams &)params
{
  return std::make_shared<NativeScreenChoreographySnapshotSpecJSI>(params);
}

@end
