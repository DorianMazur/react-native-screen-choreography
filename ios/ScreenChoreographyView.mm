#import "ScreenChoreographyView.h"

#import <React/RCTConversions.h>
#import <React/RCTSurfaceTouchHandler.h>
#import <QuartzCore/QuartzCore.h>

#import <react/renderer/components/ScreenChoreographyViewSpec/ComponentDescriptors.h>
#import <react/renderer/components/ScreenChoreographyViewSpec/EventEmitters.h>
#import <react/renderer/components/ScreenChoreographyViewSpec/Props.h>
#import <react/renderer/components/ScreenChoreographyViewSpec/RCTComponentViewHelpers.h>

#import "RCTFabricComponentsPlugins.h"

using namespace facebook::react;

namespace {

// Children use window coordinates independently of the anchor's ancestors.
class ScreenChoreographyWindowComponentDescriptor final : public ScreenChoreographyViewComponentDescriptor {
 public:
  using ScreenChoreographyViewComponentDescriptor::ScreenChoreographyViewComponentDescriptor;

  ShadowNodeTraits getTraits() const override
  {
    auto traits = ScreenChoreographyViewComponentDescriptor::getTraits();
    traits.set(ShadowNodeTraits::Trait::RootNodeKind);
    return traits;
  }
};

} // namespace

@interface ScreenChoreographyWindowContainer : UIView
@property (nonatomic, assign) BOOL foreground;
@property (nonatomic, weak) UIView *anchor;
@end

@implementation ScreenChoreographyWindowContainer

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    self.backgroundColor = UIColor.clearColor;
    self.opaque = NO;
    self.clipsToBounds = NO;
    self.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    self.accessibilityViewIsModal = NO;
    self.isAccessibilityElement = NO;
  }
  return self;
}

- (UIResponder *)nextResponder
{
  // Portaled Modal children still present through their original controller.
  return self.anchor ?: [super nextResponder];
}

- (UIView *)hitTest:(CGPoint)point withEvent:(UIEvent *)event
{
  if (!self.foreground) return nil;
  UIView *hit = [super hitTest:point withEvent:event];
  return hit == self ? nil : hit;
}

@end

@interface ScreenChoreographyView () <RCTScreenChoreographyViewViewProtocol>
@end

@implementation ScreenChoreographyView {
  ScreenChoreographyWindowContainer *_windowContainer;
  __weak UIWindow *_lastWindow;
  RCTSurfaceTouchHandler *_foregroundTouchHandler;
  BOOL _foreground;
  BOOL _active;
  BOOL _prepared;
  BOOL _attachmentAcknowledged;
  BOOL _presentationRequested;
  BOOL _presentationAcknowledged;
  BOOL _presentationCheckPending;
  CFTimeInterval _attachmentDeadline;
  CFTimeInterval _presentationDeadline;
  NSArray<NSString *> *_expectedHostNames;
  CADisplayLink *_presentationDisplayLink;
  std::string _sessionId;
  NSUInteger _presentationRequestId;
  NSUInteger _dismissalRequestId;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<ScreenChoreographyWindowComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const ScreenChoreographyViewProps>();
    _props = defaultProps;

    _windowContainer = [[ScreenChoreographyWindowContainer alloc] initWithFrame:CGRectZero];
    _windowContainer.anchor = self;

    self.backgroundColor = UIColor.clearColor;
    self.opaque = NO;
    self.userInteractionEnabled = NO;
    self.clipsToBounds = NO;
  }
  return self;
}

- (void)dealloc
{
  [_presentationDisplayLink invalidate];
  [_foregroundTouchHandler detachFromView:_windowContainer];
  [_windowContainer removeFromSuperview];
}

- (UIView *)hitTest:(CGPoint)point withEvent:(UIEvent *)event
{
  return nil;
}

- (void)didMoveToSuperview
{
  [super didMoveToSuperview];
  if (self.superview == nil) {
    [self detachWindowContainer];
    _lastWindow = nil;
  } else if (_active) {
    [self presentWindowContainer];
  }
}

- (void)didMoveToWindow
{
  [super didMoveToWindow];
  if (self.window != nil) {
    _lastWindow = self.window;
  }
  if (self.superview == nil) {
    [self detachWindowContainer];
    _lastWindow = nil;
  } else if (_active) {
    [self presentWindowContainer];
  } else if (self.window != nil && _windowContainer.window != self.window) {
    [self detachWindowContainer];
  }
}

- (void)updateLayoutMetrics:(LayoutMetrics const &)layoutMetrics oldLayoutMetrics:(LayoutMetrics const &)oldLayoutMetrics
{
  [super updateLayoutMetrics:layoutMetrics oldLayoutMetrics:oldLayoutMetrics];
  UIWindow *window = _windowContainer.window;
  if (window != nil) {
    _windowContainer.frame = window.bounds;
  }
  if (_active) {
    [self presentWindowContainer];
  }
}

- (void)mountChildComponentView:(UIView<RCTComponentViewProtocol> *)childComponentView index:(NSInteger)index
{
  [_windowContainer insertSubview:childComponentView atIndex:index];
}

- (void)unmountChildComponentView:(UIView<RCTComponentViewProtocol> *)childComponentView index:(NSInteger)index
{
  [childComponentView removeFromSuperview];
}

- (void)presentWindowContainer
{
  if (!_active || self.superview == nil) {
    return;
  }
  // Native modals can detach ancestors; retain only this anchor's owning window.
  UIWindow *window = self.window ?: _lastWindow;
  if (window == nil) {
    return;
  }
  if (self.window != nil) {
    _lastWindow = self.window;
  }
  if (_windowContainer.superview != window) {
    [_windowContainer removeFromSuperview];
    _windowContainer.frame = window.bounds;
  }
  [self insertWindowContainerInWindow:window];
  if (_foreground && _foregroundTouchHandler == nil) {
    _foregroundTouchHandler = [RCTSurfaceTouchHandler new];
    [_foregroundTouchHandler attachToView:_windowContainer];
  }
  _windowContainer.frame = window.bounds;
  [self acknowledgeAttachmentIfReady];
  [self schedulePresentationReady];
}

- (void)insertWindowContainerInWindow:(UIWindow *)window
{
  // Reordering this foreground container can cover a Modal presented by its children.
  if (_foreground && _windowContainer.superview == window) return;
  // Insert above controller content, below independent window overlays.
  UIView *below = nil;
  for (UIViewController *controller = window.rootViewController; controller != nil;
       controller = controller.presentedViewController) {
    UIView *content = controller.viewIfLoaded;
    if (content.window != window) continue;
    while (content.superview != nil && content.superview != window) content = content.superview;
    if (content.superview == window) below = content;
  }
  NSArray<UIView *> *siblings = window.subviews;
  for (UIView *view in siblings) {
    if (view == _windowContainer || ![view isKindOfClass:ScreenChoreographyWindowContainer.class]) continue;
    ScreenChoreographyWindowContainer *layer = (ScreenChoreographyWindowContainer *)view;
    if (layer.foreground && !_foreground) continue;
    if (below == nil || [siblings indexOfObject:view] > [siblings indexOfObject:below]) below = view;
  }
  if (below != nil) {
    if (_windowContainer.superview != window ||
        [siblings indexOfObject:_windowContainer] != [siblings indexOfObject:below] + 1) {
      [window insertSubview:_windowContainer aboveSubview:below];
    }
  } else if (_windowContainer.superview != window || siblings.firstObject != _windowContainer) {
    [window insertSubview:_windowContainer atIndex:0];
  }
}

- (void)detachWindowContainer
{
  // Keep counters monotonic across recycling to invalidate stale callbacks.
  _presentationRequestId += 1;
  _presentationCheckPending = NO;
  [_presentationDisplayLink invalidate];
  _presentationDisplayLink = nil;
  _dismissalRequestId += 1;
  [_foregroundTouchHandler detachFromView:_windowContainer];
  _foregroundTouchHandler = nil;
  [_windowContainer removeFromSuperview];
}

- (void)prepareForRecycle
{
  [self detachWindowContainer];
  _active = NO;
  _foreground = NO;
  _windowContainer.foreground = NO;
  _prepared = NO;
  _attachmentAcknowledged = NO;
  _presentationRequested = NO;
  _presentationAcknowledged = NO;
  _expectedHostNames = nil;
  _sessionId.clear();
  _lastWindow = nil;
  [super prepareForRecycle];
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &newViewProps = *std::static_pointer_cast<ScreenChoreographyViewProps const>(props);
  const bool sessionChanged = _sessionId != newViewProps.sessionId;
  _foreground = newViewProps.foreground;
  _windowContainer.foreground = _foreground;
  if (!_foreground && _foregroundTouchHandler != nil) {
    [_foregroundTouchHandler detachFromView:_windowContainer];
    _foregroundTouchHandler = nil;
  }

  if (sessionChanged) {
    _presentationRequestId += 1;
    _presentationCheckPending = NO;
    [_presentationDisplayLink invalidate];
    _presentationDisplayLink = nil;
    _prepared = NO;
    _attachmentAcknowledged = NO;
    _presentationRequested = NO;
    _presentationAcknowledged = NO;
    _presentationDeadline = 0;
    _sessionId = newViewProps.sessionId;
  }

  NSMutableArray<NSString *> *hostNames = [NSMutableArray array];
  if (newViewProps.expectedHostNames.size() <= 400) {
    for (const auto &name : newViewProps.expectedHostNames) {
      NSString *value = [NSString stringWithUTF8String:name.c_str()];
      if (value.length == 0 || [hostNames containsObject:value]) {
        [hostNames removeAllObjects];
        break;
      }
      [hostNames addObject:value];
    }
  }
  _expectedHostNames = hostNames;
  if (newViewProps.presentationRequested && !_presentationRequested && !_sessionId.empty()) {
    // React may reapply false animated props; latch until the session changes.
    _presentationRequested = YES;
    _presentationDeadline = CACurrentMediaTime() + 1.0;
  }

  [super updateProps:props oldProps:oldProps];

  [self applyActive:(newViewProps.active || _prepared)];
  if (_active && (sessionChanged || _prepared || _foreground)) {
    [self presentWindowContainer];
  }
}

- (void)handleCommand:(const NSString *)commandName args:(const NSArray *)args
{
  RCTScreenChoreographyViewHandleCommand(self, commandName, args);
}

- (void)prepare:(NSString *)sessionId
{
  if (sessionId.length == 0 || _sessionId != std::string(sessionId.UTF8String)) {
    return;
  }
  if (!_prepared) {
    _prepared = YES;
    _attachmentDeadline = CACurrentMediaTime() + 1.0;
  }
  [self applyActive:YES];
  [self presentWindowContainer];
  if (!_attachmentAcknowledged && _presentationDisplayLink == nil && CACurrentMediaTime() < _attachmentDeadline) {
    _presentationDisplayLink = [CADisplayLink displayLinkWithTarget:self selector:@selector(retryPresentation:)];
    [_presentationDisplayLink addToRunLoop:NSRunLoop.mainRunLoop forMode:NSRunLoopCommonModes];
  }
}

- (void)applyActive:(BOOL)active
{
  // Recycling resets native state but may retain active props.
  if (_active != active) {
    _active = active;

    if (_active) {
      _dismissalRequestId += 1;
      [self presentWindowContainer];
    } else {
      if (_foreground) {
        [self detachWindowContainer];
        return;
      }
      _presentationRequestId += 1;
      _presentationCheckPending = NO;
      [_presentationDisplayLink invalidate];
      _presentationDisplayLink = nil;
      if (_windowContainer.window == nil || CGRectIsEmpty(_windowContainer.bounds)) {
        [self detachWindowContainer];
        return;
      }

      NSUInteger dismissalId = ++_dismissalRequestId;
      __weak __typeof(self) weakSelf = self;
      // Keep the live container attached while pending portal commits settle.
      // Preserve the existing queue delay; it does not guarantee display frames.
      dispatch_async(dispatch_get_main_queue(), ^{
        dispatch_async(dispatch_get_main_queue(), ^{
          __strong __typeof(weakSelf) strongSelf = weakSelf;
          if (strongSelf == nil || strongSelf->_active ||
              dismissalId != strongSelf->_dismissalRequestId) {
            return;
          }
          [strongSelf detachWindowContainer];
        });
      });
    }
  }
}

- (void)emitPresentationStage:(const std::string &)stage
{
  if (_eventEmitter == nullptr) return;
  auto emitter = std::static_pointer_cast<const ScreenChoreographyViewEventEmitter>(_eventEmitter);
  emitter->onPresentationReady(ScreenChoreographyViewEventEmitter::OnPresentationReady{
      .timestamp = CACurrentMediaTime() * 1000.0,
      .sessionId = _sessionId,
      .stage = stage,
  });
}

- (void)acknowledgeAttachmentIfReady
{
  if (!_prepared || _attachmentAcknowledged || !_active || self.superview == nil ||
      _windowContainer.window == nil || _eventEmitter == nullptr ||
      CACurrentMediaTime() >= _attachmentDeadline || ![self transitionHostsAreReady:NO]) return;
  _attachmentAcknowledged = YES;
  [self emitPresentationStage:"attached"];
}

- (void)collectReadyHosts:(UIView *)view
                 visible:(BOOL)visible
     requireLiveChildren:(BOOL)requireLiveChildren
               remaining:(NSMutableSet<NSString *> *)remaining
{
  const BOOL isVisible = visible && !view.hidden && view.alpha > 0 && view.layer.opacity > 0;
  NSString *name = view.accessibilityIdentifier;
  if (name != nil && [remaining containsObject:name] && (!requireLiveChildren || isVisible) &&
      view.window == _windowContainer.window && !CGRectIsEmpty(view.bounds)) {
    if (!requireLiveChildren) {
      [remaining removeObject:name];
    } else {
      for (UIView *child in view.subviews) {
        if (child.window == _windowContainer.window && !CGRectIsEmpty(child.bounds)) {
          [remaining removeObject:name];
          break;
        }
      }
    }
  }
  if (remaining.count == 0) return;
  for (UIView *child in view.subviews) {
    [self collectReadyHosts:child visible:isVisible requireLiveChildren:requireLiveChildren remaining:remaining];
  }
}

- (BOOL)transitionHostsAreReady:(BOOL)requireLiveChildren
{
  if (_expectedHostNames.count == 0) return NO;
  NSMutableSet<NSString *> *remaining = [NSMutableSet setWithArray:_expectedHostNames];
  [self collectReadyHosts:_windowContainer visible:YES requireLiveChildren:requireLiveChildren remaining:remaining];
  return remaining.count == 0;
}

- (void)retryPresentation:(CADisplayLink *)displayLink
{
  if (!_active || !_prepared || _presentationAcknowledged ||
      (!_attachmentAcknowledged && CACurrentMediaTime() >= _attachmentDeadline) ||
      (_attachmentAcknowledged && (!_presentationRequested || CACurrentMediaTime() >= _presentationDeadline))) {
    [_presentationDisplayLink invalidate];
    _presentationDisplayLink = nil;
    return;
  }
  if (!_attachmentAcknowledged) {
    [self acknowledgeAttachmentIfReady];
    return;
  }
  [self schedulePresentationReady];
}

- (void)schedulePresentationReady
{
  UIWindow *window = _windowContainer.window;
  if (!_prepared || _foreground || !_active || _presentationAcknowledged || _presentationCheckPending || self.superview == nil ||
      window == nil || CGRectIsEmpty(_windowContainer.bounds) ||
      !_presentationRequested || CACurrentMediaTime() >= _presentationDeadline) {
    return;
  }

  NSUInteger requestId = ++_presentationRequestId;
  _presentationCheckPending = YES;
  const std::string sessionId = _sessionId;
  __weak UIWindow *presentedWindow = window;
  __weak __typeof(self) weakSelf = self;
  // Wait for the mounting transaction before acknowledging presentation.
  [CATransaction begin];
  [CATransaction setCompletionBlock:^{
    __strong __typeof(weakSelf) strongSelf = weakSelf;
    UIWindow *window = presentedWindow;
    if (strongSelf == nil || requestId != strongSelf->_presentationRequestId || sessionId != strongSelf->_sessionId) {
      return;
    }
    strongSelf->_presentationCheckPending = NO;
    if (!strongSelf->_active || strongSelf.superview == nil || window == nil ||
        strongSelf->_windowContainer.window != window || strongSelf->_eventEmitter == nil ||
        CACurrentMediaTime() >= strongSelf->_presentationDeadline) return;
    if (![strongSelf transitionHostsAreReady:YES]) {
      if (strongSelf->_presentationDisplayLink == nil && CACurrentMediaTime() < strongSelf->_presentationDeadline) {
        strongSelf->_presentationDisplayLink =
            [CADisplayLink displayLinkWithTarget:strongSelf selector:@selector(retryPresentation:)];
        [strongSelf->_presentationDisplayLink addToRunLoop:NSRunLoop.mainRunLoop forMode:NSRunLoopCommonModes];
      }
      return;
    }
    strongSelf->_presentationAcknowledged = YES;
    [strongSelf->_presentationDisplayLink invalidate];
    strongSelf->_presentationDisplayLink = nil;
    [strongSelf emitPresentationStage:"presented"];
  }];
  [CATransaction commit];
}

@end
