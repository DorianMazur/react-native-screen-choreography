#import <UIKit/UIKit.h>

// Modal foreground content has a real presentation root, independent of the
// navigation controller or native modal beneath it.
@interface ScreenChoreographyPresentationWindow : UIWindow
@property (nonatomic, weak, readonly) UIWindow *sourceWindow;
- (instancetype)initWithSourceWindow:(UIWindow *)window contentView:(UIView *)contentView;
- (void)present;
- (void)dismiss;
@end
