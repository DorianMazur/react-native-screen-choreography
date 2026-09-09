#import "ScreenChoreographySnapshotView.h"

#import <QuartzCore/QuartzCore.h>
#import <objc/runtime.h>
#import <react/renderer/components/ScreenChoreographyViewSpec/ComponentDescriptors.h>
#import <react/renderer/components/ScreenChoreographyViewSpec/EventEmitters.h>
#import <react/renderer/components/ScreenChoreographyViewSpec/Props.h>

using namespace facebook::react;

// A source can have only one capture owner. An old component must never restore
// the alpha of a source that a newer capture now owns.
static char SnapshotSourceOwnerKey;

@implementation ScreenChoreographySnapshotView {
  UIView *_snapshot;
  __weak UIView *_source;
  NSUUID *_sourceOwner;
  CGFloat _sourceAlpha;
  CGRect _sourceFrame;
  NSInteger _sourceTag;
  NSString *_captureId;
  BOOL _stretch;
  BOOL _attempted;
  NSUInteger _generation;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<ScreenChoreographySnapshotViewComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const ScreenChoreographySnapshotViewProps>();
    _props = defaultProps;
    _captureId = @"";
    self.userInteractionEnabled = NO;
    self.accessibilityElementsHidden = YES;
    self.backgroundColor = UIColor.clearColor;
    self.opaque = NO;
  }
  return self;
}

- (void)releaseCapture
{
  ++_generation;
  UIView *source = _source;
  if (source != nil && objc_getAssociatedObject(source, &SnapshotSourceOwnerKey) == _sourceOwner) {
    // Fabric may have recycled the object for a different React tag meanwhile.
    if (source.tag == _sourceTag) source.alpha = _sourceAlpha;
    objc_setAssociatedObject(source, &SnapshotSourceOwnerKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  }
  _source = nil;
  _sourceOwner = nil;
  [_snapshot removeFromSuperview];
  _snapshot = nil;
  _attempted = NO;
}

- (void)dealloc
{
  [self releaseCapture];
}

- (void)prepareForRecycle
{
  [self releaseCapture];
  _sourceTag = 0;
  _captureId = @"";
  _stretch = NO;
  [super prepareForRecycle];
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &next = *std::static_pointer_cast<const ScreenChoreographySnapshotViewProps>(props);
  NSString *captureId = [NSString stringWithUTF8String:next.captureId.c_str()];
  if (_sourceTag != next.sourceTag || ![_captureId isEqualToString:captureId]) {
    [self releaseCapture];
    _sourceTag = next.sourceTag;
    _captureId = captureId;
  }
  _stretch = next.stretch;
  [super updateProps:props oldProps:oldProps];
  self.userInteractionEnabled = NO;
  self.accessibilityElementsHidden = YES;
  [self setNeedsLayout];
  [self scheduleCapture];
}

- (void)didMoveToWindow
{
  [super didMoveToWindow];
  if (self.window == nil) [self releaseCapture];
  else [self scheduleCapture];
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  _snapshot.frame = _stretch ? self.bounds : _sourceFrame;
  [self scheduleCapture];
}

- (void)emitCaptured:(BOOL)success generation:(NSUInteger)generation captureId:(NSString *)captureId
{
  if (generation != _generation || self.window == nil || _eventEmitter == nullptr) return;
  auto emitter = std::static_pointer_cast<const ScreenChoreographySnapshotViewEventEmitter>(_eventEmitter);
  emitter->onCaptured(ScreenChoreographySnapshotViewEventEmitter::OnCaptured{
    .captureId = std::string(captureId.UTF8String),
    .success = static_cast<bool>(success),
  });
}

- (void)scheduleCapture
{
  if (_attempted || _sourceTag <= 0 || _captureId.length == 0 || self.window == nil ||
      CGRectIsEmpty(self.bounds)) return;
  _attempted = YES;
  const NSUInteger generation = _generation;
  NSString *captureId = [_captureId copy];
  __weak __typeof(self) weakSelf = self;
  // Wait for this Fabric mount pass to attach all peers before resolving the tag.
  dispatch_async(dispatch_get_main_queue(), ^{
    __strong __typeof(weakSelf) self = weakSelf;
    if (self == nil || generation != self->_generation || self.window == nil) return;
    UIView *source = [self.window viewWithTag:self->_sourceTag];
    if (source == nil || source == self || [source isKindOfClass:UIWindow.class] ||
        source.window != self.window || CGRectIsEmpty(source.bounds) || source.hidden ||
        [self isDescendantOfView:source] || [source isDescendantOfView:self] ||
        objc_getAssociatedObject(source, &SnapshotSourceOwnerKey) != nil) {
      [self emitCaptured:NO generation:generation captureId:captureId];
      return;
    }
    UIView *snapshot = [source resizableSnapshotViewFromRect:source.bounds
                                       afterScreenUpdates:NO
                                            withCapInsets:UIEdgeInsetsZero];
    if (snapshot == nil) {
      [self emitCaptured:NO generation:generation captureId:captureId];
      return;
    }
    self->_sourceFrame = [source convertRect:source.bounds toView:self];
    snapshot.frame = self->_stretch ? self.bounds : self->_sourceFrame;
    snapshot.userInteractionEnabled = NO;
    snapshot.accessibilityElementsHidden = YES;
    self->_snapshot = snapshot;
    self->_source = source;
    self->_sourceAlpha = source.alpha;
    self->_sourceOwner = [NSUUID UUID];
    objc_setAssociatedObject(source, &SnapshotSourceOwnerKey, self->_sourceOwner, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    [CATransaction begin];
    [CATransaction setDisableActions:YES];
    [CATransaction setCompletionBlock:^{
      [weakSelf emitCaptured:YES generation:generation captureId:captureId];
    }];
    [self addSubview:snapshot];
    source.alpha = 0;
    [CATransaction commit];
  });
}

@end
