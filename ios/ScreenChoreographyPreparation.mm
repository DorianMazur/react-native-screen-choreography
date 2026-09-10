#import "ScreenChoreographyPreparation.h"

#import <QuartzCore/QuartzCore.h>
#import <UIKit/UIKit.h>

#include <atomic>
#include <climits>
#include <cmath>

@class SCHPreparationJob;

// CADisplayLink retains its target. The proxy must not retain the job, which
// owns the display link and is retained only by the module's pending requests.
@interface SCHPreparationDisplayLinkTarget : NSObject
@property (nonatomic, weak) SCHPreparationJob *job;
- (void)tick:(CADisplayLink *)displayLink;
@end

@interface SCHPreparationJob : NSObject
@property (nonatomic, copy) NSString *requestId;
@property (nonatomic, copy) NSNumber *screenTag;
@property (nonatomic, copy) NSArray<NSNumber *> *viewTags;
@property (nonatomic, weak) RCTViewRegistry *viewRegistry;
@property (nonatomic, copy) RCTPromiseResolveBlock resolve;
@property (nonatomic, copy) void (^onFinish)(SCHPreparationJob *job);
@property (nonatomic, assign) CFTimeInterval startedAt;
@property (nonatomic, assign) CFTimeInterval deadlineAt;
- (void)start;
- (void)sample:(CADisplayLink *)displayLink;
- (void)finish:(BOOL)ready;
@end

@implementation SCHPreparationDisplayLinkTarget
- (void)tick:(CADisplayLink *)displayLink
{
  [self.job sample:displayLink];
}
@end

static BOOL SCHPreparationValidTag(double value)
{
  return std::isfinite(value) && value > 0 && std::floor(value) == value && value <= INT_MAX;
}

static BOOL SCHPreparationValidRect(CGRect rect)
{
  return std::isfinite(rect.origin.x) && std::isfinite(rect.origin.y) &&
      std::isfinite(rect.size.width) && std::isfinite(rect.size.height) &&
      rect.size.width > 0 && rect.size.height > 0;
}

static BOOL SCHPreparationRectsClose(CGRect first, CGRect second)
{
  const CGFloat epsilon = 0.5;
  return std::abs(first.origin.x - second.origin.x) <= epsilon &&
      std::abs(first.origin.y - second.origin.y) <= epsilon &&
      std::abs(first.size.width - second.size.width) <= epsilon &&
      std::abs(first.size.height - second.size.height) <= epsilon;
}

static BOOL SCHPreparationHasPendingLayout(UIView *view, UIWindow *window)
{
  for (UIView *ancestor = view; ancestor; ancestor = ancestor.superview) {
    if ([ancestor.layer needsLayout]) {
      return YES;
    }
    if (ancestor == window) {
      break;
    }
  }
  return NO;
}

@implementation SCHPreparationJob {
  CADisplayLink *_displayLink;
  dispatch_source_t _deadlineTimer;
  NSMapTable<NSNumber *, UIView *> *_attachedViews;
  NSMutableSet<NSNumber *> *_attachedTags;
  __weak UIWindow *_attachedWindow;
  NSArray<NSValue *> *_previousRects;
  CFTimeInterval _lastFrameTimestamp;
  NSUInteger _sampleCount;
  BOOL _finished;
}

- (instancetype)init
{
  if ((self = [super init])) {
    _attachedViews = [NSMapTable strongToWeakObjectsMapTable];
    _attachedTags = [NSMutableSet new];
    _lastFrameTimestamp = -1;
  }
  return self;
}

- (void)start
{
  const CFTimeInterval remaining = self.deadlineAt - CACurrentMediaTime();
  if (remaining <= 0 || !self.viewRegistry) {
    [self finish:NO];
    return;
  }

  __weak SCHPreparationJob *weakSelf = self;
  _deadlineTimer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, dispatch_get_main_queue());
  dispatch_source_set_timer(_deadlineTimer,
                           dispatch_time(DISPATCH_TIME_NOW, (int64_t)(remaining * NSEC_PER_SEC)),
                           DISPATCH_TIME_FOREVER,
                           0);
  dispatch_source_set_event_handler(_deadlineTimer, ^{
    [weakSelf finish:NO];
  });
  dispatch_resume(_deadlineTimer);

  SCHPreparationDisplayLinkTarget *target = [SCHPreparationDisplayLinkTarget new];
  target.job = self;
  _displayLink = [CADisplayLink displayLinkWithTarget:target selector:@selector(tick:)];
  [_displayLink addToRunLoop:NSRunLoop.mainRunLoop forMode:NSRunLoopCommonModes];
}

- (void)sample:(CADisplayLink *)displayLink
{
  if (_finished || displayLink.timestamp == _lastFrameTimestamp) {
    return;
  }
  _lastFrameTimestamp = displayLink.timestamp;
  _sampleCount += 1;
  if (CACurrentMediaTime() >= self.deadlineAt || !self.viewRegistry) {
    [self finish:NO];
    return;
  }

  RCTViewRegistry *registry = self.viewRegistry;
  UIView *root = [registry viewForReactTag:self.screenTag];
  if (root && root.tag != self.screenTag.integerValue) {
    [self finish:NO];
    return;
  }
  UIWindow *window = root.window;
  UIView *previousRoot = [_attachedViews objectForKey:self.screenTag];
  // A tag can disappear or be recycled while another requested view mounts.
  // Once attached, never accept a replacement under the same numeric tag.
  if ([_attachedTags containsObject:self.screenTag] &&
      (!previousRoot || root != previousRoot || !window || window != _attachedWindow)) {
    [self finish:NO];
    return;
  }
  if (!root || !window) {
    _previousRects = nil;
    return;
  }
  if (!_attachedWindow) {
    _attachedWindow = window;
  }
  [_attachedViews setObject:root forKey:self.screenTag];
  [_attachedTags addObject:self.screenTag];

  // Display links fire before UIKit's layout/commit phase. Flush pending
  // ancestor layout as well as the screen so insets are included in the sample.
  [window layoutIfNeeded];
  [root layoutIfNeeded];
  if (root.window != window || root.tag != self.screenTag.integerValue ||
      [registry viewForReactTag:self.screenTag] != root) {
    [self finish:NO];
    return;
  }

  NSMutableArray<NSValue *> *rects = [NSMutableArray arrayWithCapacity:self.viewTags.count + 1];
  const CGRect rootRect = [root convertRect:root.bounds toView:window];
  BOOL complete = SCHPreparationValidRect(root.bounds) && SCHPreparationValidRect(rootRect) &&
      !SCHPreparationHasPendingLayout(root, window);
  [rects addObject:[NSValue valueWithCGRect:rootRect]];
  for (NSNumber *tag in self.viewTags) {
    UIView *view = [registry viewForReactTag:tag];
    if (view && view.tag != tag.integerValue) {
      [self finish:NO];
      return;
    }
    UIView *previousView = [_attachedViews objectForKey:tag];
    const BOOL attachedBefore = [_attachedTags containsObject:tag];
    const BOOL attachedNow = view && view.window == window && (view == root || [view isDescendantOfView:root]);
    if (attachedBefore && (!previousView || view != previousView || !attachedNow)) {
      [self finish:NO];
      return;
    }
    if (!attachedNow) {
      complete = NO;
      continue;
    }
    [_attachedViews setObject:view forKey:tag];
    [_attachedTags addObject:tag];
    const CGRect rect = [view convertRect:view.bounds toView:window];
    complete = complete && SCHPreparationValidRect(view.bounds) && SCHPreparationValidRect(rect) &&
        !SCHPreparationHasPendingLayout(view, window);
    [rects addObject:[NSValue valueWithCGRect:rect]];
  }

  if (!complete) {
    _previousRects = nil;
    return;
  }
  BOOL stable = _previousRects != nil && _previousRects.count == rects.count;
  for (NSUInteger index = 0; stable && index < rects.count; index++) {
    stable = SCHPreparationRectsClose(_previousRects[index].CGRectValue, rects[index].CGRectValue);
  }
  _previousRects = rects;
  if (CACurrentMediaTime() >= self.deadlineAt) {
    [self finish:NO];
  } else if (stable) {
    [self finish:YES];
  }
}

- (void)finish:(BOOL)ready
{
  if (_finished) {
    return;
  }
  _finished = YES;
  [_displayLink invalidate];
  _displayLink = nil;
  if (_deadlineTimer) {
    dispatch_source_cancel(_deadlineTimer);
    _deadlineTimer = nil;
  }
  RCTPromiseResolveBlock resolve = self.resolve;
  self.resolve = nil;
  void (^onFinish)(SCHPreparationJob *) = self.onFinish;
  self.onFinish = nil;
  [_attachedViews removeAllObjects];
  [_attachedTags removeAllObjects];
  _previousRects = nil;
  if (onFinish) {
    onFinish(self);
  }
  if (resolve) {
    resolve(@{
      @"ready" : @(ready),
      @"sampleCount" : @(_sampleCount),
      @"elapsedMs" : @(MAX(0, (CACurrentMediaTime() - self.startedAt) * 1000))
    });
  }
}

- (void)dealloc
{
  [_displayLink invalidate];
  if (_deadlineTimer) {
    dispatch_source_cancel(_deadlineTimer);
  }
}
@end

@implementation ScreenChoreographyPreparation {
  NSMutableDictionary<NSString *, SCHPreparationJob *> *_jobs;
  std::atomic<bool> _invalidated;
}

RCT_EXPORT_MODULE(ScreenChoreographyPreparation)
@synthesize viewRegistry_DEPRECATED = _viewRegistry_DEPRECATED;

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (instancetype)init
{
  if ((self = [super init])) {
    _jobs = [NSMutableDictionary new];
    _invalidated.store(false);
  }
  return self;
}

- (void)awaitLayout:(NSString *)requestId
         screenTag:(double)screenTag
          viewTags:(NSArray *)viewTags
         timeoutMs:(double)timeoutMs
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
  const CFTimeInterval startedAt = CACurrentMediaTime();
  const BOOL validTimeout = std::isfinite(timeoutMs) && timeoutMs > 0;
  const double boundedTimeout = validTimeout ? MIN(timeoutMs, 500) : 0;
  const BOOL validScreenTag = SCHPreparationValidTag(screenTag);
  NSMutableArray<NSNumber *> *tags = [NSMutableArray arrayWithCapacity:viewTags.count];
  BOOL validTags = YES;
  for (id tag in viewTags) {
    if (![tag isKindOfClass:NSNumber.class] || !SCHPreparationValidTag([tag doubleValue])) {
      validTags = NO;
      break;
    }
    [tags addObject:tag];
  }
  const BOOL valid = validTimeout && validScreenTag && validTags && requestId.length > 0;
  NSString *key = [requestId copy] ?: @"";
  NSArray<NSNumber *> *tagSnapshot = [tags copy];
  dispatch_async(dispatch_get_main_queue(), ^{
    [self->_jobs[key] finish:NO];
    SCHPreparationJob *job = [SCHPreparationJob new];
    job.requestId = key;
    job.screenTag = @(screenTag);
    job.viewTags = tagSnapshot;
    job.viewRegistry = self.viewRegistry_DEPRECATED;
    job.startedAt = startedAt;
    job.deadlineAt = startedAt + boundedTimeout / 1000;
    job.resolve = resolve;
    if (!valid || self->_invalidated.load()) {
      [job finish:NO];
      return;
    }
    __weak ScreenChoreographyPreparation *weakSelf = self;
    job.onFinish = ^(SCHPreparationJob *finishedJob) {
      ScreenChoreographyPreparation *strongSelf = weakSelf;
      if (strongSelf && strongSelf->_jobs[key] == finishedJob) {
        [strongSelf->_jobs removeObjectForKey:key];
      }
    };
    self->_jobs[key] = job;
    [job start];
  });
}

- (void)cancel:(NSString *)requestId
{
  NSString *key = [requestId copy] ?: @"";
  dispatch_async(dispatch_get_main_queue(), ^{
    [self->_jobs[key] finish:NO];
  });
}

- (void)invalidate
{
  _invalidated.store(true);
  dispatch_async(dispatch_get_main_queue(), ^{
    for (SCHPreparationJob *job in self->_jobs.allValues) {
      [job finish:NO];
    }
    [self->_jobs removeAllObjects];
  });
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeChoreographyPreparationSpecJSI>(params);
}
@end
