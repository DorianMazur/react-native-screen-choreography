#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * TurboModule that captures per-element bitmap snapshots for the
 * choreography overlay. Snapshots are written as PNG files into a
 * dedicated subdirectory of NSTemporaryDirectory and released explicitly
 * by the JS coordinator when a transition session ends.
 */
@interface ScreenChoreographySnapshot : NSObject

@end

NS_ASSUME_NONNULL_END
