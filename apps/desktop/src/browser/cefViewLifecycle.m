#import <Cocoa/Cocoa.h>
#include <string.h>

int32_t pideckGetDownloadsDirectory(char *buffer, uint32_t capacity) {
  @autoreleasepool {
    NSString *path = NSSearchPathForDirectoriesInDomains(NSDownloadsDirectory, NSUserDomainMask, YES).firstObject;
    const char *value = path.UTF8String;
    if (!value) return -1;
    size_t length = strlen(value);
    if (length + 1 > capacity) return -2;
    memcpy(buffer, value, length + 1);
    return (int32_t)length;
  }
}
#import <objc/runtime.h>

@interface NSObject (PiDeckCEFView)
@property(nonatomic, readonly) NSView *nsView;
@property(nonatomic, readonly) uint32_t webviewId;
- (void)removeAbstractViewWithId:(uint32_t)viewId;
@end

static IMP originalRemove;

static void removeEmbeddedCEFView(id object, SEL command) {
  id owner = object;
  void (^removeOnMain)(void) = ^{
    @autoreleasepool {
      NSView *view = [owner nsView];
      NSView *parent = view.superview;
      if ([parent respondsToSelector:@selector(removeAbstractViewWithId:)]) {
        [(id)parent removeAbstractViewWithId:[owner webviewId]];
      }
      // CEF's default windowed close targets [view window]; detach before closing.
      [view removeFromSuperview];
      ((void (*)(id, SEL))originalRemove)(owner, command);
    }
  };
  if ([NSThread isMainThread]) removeOnMain();
  else dispatch_sync(dispatch_get_main_queue(), removeOnMain);
}

int pideckInstallCEFViewLifecycle(void) {
  if (originalRemove) return 0;
  Class viewClass = NSClassFromString(@"CEFWebViewImpl");
  if (!viewClass) return 1;
  Method remove = class_getInstanceMethod(viewClass, @selector(remove));
  if (!remove || !class_getInstanceMethod(viewClass, @selector(nsView)) ||
      !class_getInstanceMethod(viewClass, @selector(webviewId))) return 2;
  originalRemove = method_setImplementation(remove, (IMP)removeEmbeddedCEFView);
  return originalRemove ? 0 : 3;
}
