#import <React/RCTMountingTransactionObserving.h>
#import <React/RCTScrollViewComponentView.h>
#import <React/RCTViewComponentView.h>
#import <react/renderer/components/ScreenChoreographyViewSpec/ComponentDescriptors.h>
#import <react/renderer/components/ScreenChoreographyViewSpec/Props.h>

using namespace facebook::react;

// Only the renderer moves. Its Fabric layout and the portal hierarchy stay intact.
@interface ScreenChoreographyScrollTrack : RCTViewComponentView <UIScrollViewDelegate, RCTMountingTransactionObserving>
@end

@implementation ScreenChoreographyScrollTrack {
  NSMapTable<NSNumber *, RCTScrollViewComponentView *> *_scrollers;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<ScreenChoreographyScrollTrackComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if ((self = [super initWithFrame:frame])) {
    static const auto defaults = std::make_shared<const ScreenChoreographyScrollTrackProps>();
    _props = defaults;
    _scrollers = [NSMapTable strongToWeakObjectsMapTable];
  }
  return self;
}

- (void)unbind
{
  for (RCTScrollViewComponentView *view in _scrollers.objectEnumerator) {
    [view.scrollViewDelegateSplitter removeDelegate:self];
  }
  [_scrollers removeAllObjects];
  self.layer.sublayerTransform = CATransform3DIdentity;
}

- (void)bindIfNeeded
{
  const auto &props = *std::static_pointer_cast<const ScreenChoreographyScrollTrackProps>(_props);
  if (!self.window || !props.following) return;
  for (const auto &anchor : props.anchors) {
    NSNumber *key = @(anchor.tag);
    RCTScrollViewComponentView *view = [_scrollers objectForKey:key];
    if (view && view.tag == anchor.tag && view.window == self.window) continue;
    [view.scrollViewDelegateSplitter removeDelegate:self];
    [_scrollers removeObjectForKey:key];
    UIView *candidate = [self.window viewWithTag:anchor.tag];
    if ([candidate isKindOfClass:RCTScrollViewComponentView.class]) {
      view = (RCTScrollViewComponentView *)candidate;
      [_scrollers setObject:view forKey:key];
      [view.scrollViewDelegateSplitter addDelegate:self];
    }
  }
  [self updateScrollTranslation];
}

- (void)updateScrollTranslation
{
  const auto &props = *std::static_pointer_cast<const ScreenChoreographyScrollTrackProps>(_props);
  CGFloat dx = 0, dy = 0;
  for (const auto &anchor : props.anchors) {
    RCTScrollViewComponentView *view = [_scrollers objectForKey:@(anchor.tag)];
    if (!view || view.tag != anchor.tag || view.window != self.window) continue;
    const CGPoint offset = view.scrollView.contentOffset;
    const CGFloat x = anchor.x - offset.x, y = anchor.y - offset.y;
    dx += anchor.xx * x + anchor.yx * y;
    dy += anchor.xy * x + anchor.yy * y;
  }
  const auto translation = CATransform3DMakeTranslation(dx, dy, 0);
  if (!CATransform3DEqualToTransform(self.layer.sublayerTransform, translation)) {
    [CATransaction begin];
    [CATransaction setDisableActions:YES];
    self.layer.sublayerTransform = translation;
    [CATransaction commit];
  }
}

- (void)scrollViewDidScroll:(UIScrollView *)scrollView
{
  [self updateScrollTranslation];
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  [self unbind];
  [super updateProps:props oldProps:oldProps];
  [self bindIfNeeded];
}

- (void)didMoveToWindow
{
  [super didMoveToWindow];
  if (self.window) [self bindIfNeeded];
  else [self unbind];
}

- (void)mountingTransactionDidMount:(const MountingTransaction &)transaction
               withSurfaceTelemetry:(const SurfaceTelemetry &)surfaceTelemetry
{
  [self bindIfNeeded];
}

- (void)prepareForRecycle
{
  [self unbind];
  [super prepareForRecycle];
}

@end
