#import "ScreenChoreographyView.h"

#import <React/RCTConversions.h>
#import <QuartzCore/QuartzCore.h>

#import <react/renderer/components/ScreenChoreographyViewSpec/ComponentDescriptors.h>
#import <react/renderer/components/ScreenChoreographyViewSpec/EventEmitters.h>
#import <react/renderer/components/ScreenChoreographyViewSpec/Props.h>
#import <react/renderer/components/ScreenChoreographyViewSpec/RCTComponentViewHelpers.h>

#import "RCTFabricComponentsPlugins.h"

using namespace facebook::react;

@implementation ScreenChoreographyView {
  UIView * _hostView;
  UIView * _dismissalSnapshot;
  BOOL _active;
  NSInteger _presentationRequestId;
  NSInteger _dismissalRequestId;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
    return concreteComponentDescriptorProvider<ScreenChoreographyViewComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const ScreenChoreographyViewProps>();
    _props = defaultProps;

  _hostView = [[UIView alloc] initWithFrame:self.bounds];
  _hostView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
  _hostView.backgroundColor = UIColor.clearColor;
  _hostView.userInteractionEnabled = NO;
  _hostView.clipsToBounds = NO;
  _hostView.hidden = YES;

  self.backgroundColor = UIColor.clearColor;
  self.opaque = NO;
  self.userInteractionEnabled = NO;
  self.clipsToBounds = NO;
  self.contentView = _hostView;
  }

  return self;
}

- (void)didMoveToWindow
{
  [super didMoveToWindow];

  if (_active) {
    [self schedulePresentationReady];
  }
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];

  _active = NO;
  _presentationRequestId = 0;
  _dismissalRequestId = 0;
  [_dismissalSnapshot removeFromSuperview];
  _dismissalSnapshot = nil;
  _hostView.hidden = YES;
  self.alpha = 0.0;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
    const auto &oldViewProps = *std::static_pointer_cast<ScreenChoreographyViewProps const>(_props);
    const auto &newViewProps = *std::static_pointer_cast<ScreenChoreographyViewProps const>(props);

    [super updateProps:props oldProps:oldProps];

  if (oldViewProps.active != newViewProps.active) {
    _active = newViewProps.active;

    if (_active) {
      _dismissalRequestId += 1;
      [_dismissalSnapshot removeFromSuperview];
      _dismissalSnapshot = nil;
      _hostView.hidden = NO;
      self.alpha = 1.0;
      [self schedulePresentationReady];
    } else {
      _presentationRequestId += 1;
      UIView *snapshot = nil;
      if (_hostView.window != nil && !CGRectIsEmpty(_hostView.bounds)) {
        snapshot = [_hostView snapshotViewAfterScreenUpdates:NO];
      }

      [_dismissalSnapshot removeFromSuperview];
      _dismissalSnapshot = nil;

      if (snapshot != nil) {
        snapshot.frame = _hostView.frame;
        snapshot.userInteractionEnabled = NO;
        [self addSubview:snapshot];
        _dismissalSnapshot = snapshot;
        self.alpha = 1.0;
        _hostView.hidden = YES;

        NSInteger dismissalId = ++_dismissalRequestId;
        __weak __typeof(self) weakSelf = self;
        // Two main-runloop hops ≈ two display-link ticks: long enough for any
        // pending Reanimated UI commit to land before we clear the snapshot.
        dispatch_async(dispatch_get_main_queue(), ^{
          dispatch_async(dispatch_get_main_queue(), ^{
            __strong __typeof(weakSelf) strongSelf = weakSelf;
            if (strongSelf == nil || strongSelf->_active ||
                dismissalId != strongSelf->_dismissalRequestId) {
              return;
            }
            [strongSelf->_dismissalSnapshot removeFromSuperview];
            strongSelf->_dismissalSnapshot = nil;
            strongSelf.alpha = 0.0;
          });
        });
      } else {
        _dismissalRequestId += 1;
        self.alpha = 0.0;
        _hostView.hidden = YES;
      }
    }
  }
}

- (void)schedulePresentationReady
{
  if (!_active || self.window == nil) {
    return;
  }

  NSInteger requestId = ++_presentationRequestId;
  __weak __typeof(self) weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    __strong __typeof(weakSelf) strongSelf = weakSelf;
    if (strongSelf == nil || !strongSelf->_active || strongSelf.window == nil ||
      strongSelf->_eventEmitter == nil || requestId != strongSelf->_presentationRequestId) {
      return;
    }

    auto emitter =
      std::static_pointer_cast<const ScreenChoreographyViewEventEmitter>(strongSelf->_eventEmitter);
    emitter->onPresentationReady(
      ScreenChoreographyViewEventEmitter::OnPresentationReady{
        .timestamp = CACurrentMediaTime() * 1000.0,
      });
  });
}

@end
