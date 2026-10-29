#import "ScreenChoreographyPresentationWindow.h"

@implementation ScreenChoreographyPresentationWindow {
  __weak UIWindow *_previousKeyWindow;
  BOOL _presented;
}

- (instancetype)initWithSourceWindow:(UIWindow *)window contentView:(UIView *)contentView
{
  self = window.windowScene != nil ? [super initWithWindowScene:window.windowScene]
                                  : [super initWithFrame:window.frame];
  if (self) {
    _sourceWindow = window;
    self.frame = window.frame;
    self.windowLevel = window.windowLevel;
    self.backgroundColor = UIColor.clearColor;
    self.overrideUserInterfaceStyle = window.overrideUserInterfaceStyle;
    self.tintColor = window.tintColor;
    self.accessibilityViewIsModal = YES;
    UIViewController *controller = [UIViewController new];
    controller.view = contentView;
    self.rootViewController = controller;
  }
  return self;
}

- (void)present
{
  if (_presented) return;
  _presented = YES;
  _previousKeyWindow = _sourceWindow;
  for (UIWindow *window in self.windowScene.windows) {
    if (window.isKeyWindow) _previousKeyWindow = window;
  }
  [self makeKeyAndVisible];
}

- (void)dismiss
{
  if (!_presented) return;
  _presented = NO;
  BOOL wasKey = self.isKeyWindow;
  [self endEditing:YES];
  [self.rootViewController dismissViewControllerAnimated:NO completion:nil];
  self.hidden = YES;
  self.rootViewController = nil;
  // An independently owned tray can close beneath another tray. Do not steal
  // focus from the window above us or restore a window that has already closed.
  UIWindow *restore = _previousKeyWindow;
  while (restore.hidden && [restore isKindOfClass:ScreenChoreographyPresentationWindow.class]) {
    restore = ((ScreenChoreographyPresentationWindow *)restore)->_previousKeyWindow;
  }
  if (restore == nil || restore.hidden) restore = _sourceWindow;
  if (wasKey && restore != nil && !restore.hidden) [restore makeKeyWindow];
  self.windowScene = nil;
}

@end
