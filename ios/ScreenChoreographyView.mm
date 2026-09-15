#import "ScreenChoreographyView.h"

#import <React/RCTConversions.h>
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

- (UIView *)hitTest:(CGPoint)point withEvent:(UIEvent *)event
{
  return nil;
}

@end

@implementation ScreenChoreographyView {
  ScreenChoreographyWindowContainer *_windowContainer;
  __weak UIWindow *_lastWindow;
  UIView *_hostView;
  UIView *_dismissalFrame;
  BOOL _active;
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
    _hostView = [[UIView alloc] initWithFrame:CGRectZero];
    _hostView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    _hostView.backgroundColor = UIColor.clearColor;
    _hostView.userInteractionEnabled = NO;
    _hostView.clipsToBounds = NO;
    _hostView.hidden = YES;
    [_windowContainer addSubview:_hostView];

    self.backgroundColor = UIColor.clearColor;
    self.opaque = NO;
    self.userInteractionEnabled = NO;
    self.clipsToBounds = NO;
  }
  return self;
}

- (void)dealloc
{
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
    _hostView.frame = _windowContainer.bounds;
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
  _hostView.hidden = NO;
  if (_windowContainer.superview != window) {
    [_windowContainer removeFromSuperview];
    _windowContainer.frame = window.bounds;
    [window addSubview:_windowContainer];
  }
  _windowContainer.frame = window.bounds;
  _hostView.frame = _windowContainer.bounds;
  [self schedulePresentationReady];
}

- (void)detachWindowContainer
{
  // Keep counters monotonic across recycling to invalidate stale callbacks.
  _presentationRequestId += 1;
  _dismissalRequestId += 1;
  [_dismissalFrame removeFromSuperview];
  _dismissalFrame = nil;
  _hostView.hidden = YES;
  [_windowContainer removeFromSuperview];
}

- (void)prepareForRecycle
{
  [self detachWindowContainer];
  _active = NO;
  _lastWindow = nil;
  [super prepareForRecycle];
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &newViewProps = *std::static_pointer_cast<ScreenChoreographyViewProps const>(props);

  [super updateProps:props oldProps:oldProps];

  // Recycling resets native state but may retain active props.
  if (_active != newViewProps.active) {
    _active = newViewProps.active;

    if (_active) {
      _dismissalRequestId += 1;
      [_dismissalFrame removeFromSuperview];
      _dismissalFrame = nil;
      _hostView.hidden = NO;
      [self presentWindowContainer];
    } else {
      _presentationRequestId += 1;
      UIView *snapshot = nil;
      if (_hostView.window != nil && !CGRectIsEmpty(_hostView.bounds)) {
        snapshot = [_hostView snapshotViewAfterScreenUpdates:NO];
      }

      [_dismissalFrame removeFromSuperview];
      _dismissalFrame = nil;
      _hostView.hidden = YES;

      if (snapshot != nil) {
        snapshot.frame = _hostView.frame;
        snapshot.userInteractionEnabled = NO;
        snapshot.isAccessibilityElement = NO;
        snapshot.accessibilityElementsHidden = YES;
        [_windowContainer addSubview:snapshot];
        _dismissalFrame = snapshot;

        NSUInteger dismissalId = ++_dismissalRequestId;
        __weak __typeof(self) weakSelf = self;
        // Allow pending UI commits to settle; queue hops do not guarantee display frames.
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
      } else {
        [self detachWindowContainer];
      }
    }
  }
}

- (void)schedulePresentationReady
{
  UIWindow *window = _windowContainer.window;
  if (!_active || self.superview == nil || window == nil || CGRectIsEmpty(_windowContainer.bounds)) {
    return;
  }

  NSUInteger requestId = ++_presentationRequestId;
  __weak UIWindow *presentedWindow = window;
  __weak __typeof(self) weakSelf = self;
  // Wait for the mounting transaction before acknowledging presentation.
  [CATransaction begin];
  [CATransaction setCompletionBlock:^{
    __strong __typeof(weakSelf) strongSelf = weakSelf;
    UIWindow *window = presentedWindow;
    if (strongSelf == nil || !strongSelf->_active || strongSelf.superview == nil || window == nil ||
        strongSelf->_windowContainer.window != window || strongSelf->_eventEmitter == nil ||
        requestId != strongSelf->_presentationRequestId) {
      return;
    }

    auto emitter =
      std::static_pointer_cast<const ScreenChoreographyViewEventEmitter>(strongSelf->_eventEmitter);
    emitter->onPresentationReady(
      ScreenChoreographyViewEventEmitter::OnPresentationReady{
        .timestamp = CACurrentMediaTime() * 1000.0,
      });
  }];
  [CATransaction commit];
}

@end
