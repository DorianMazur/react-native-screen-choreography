#include "FabricLayoutCapture.h"
#include <cxxreact/ReactNativeVersion.h>

#if REACT_NATIVE_VERSION_MINOR < 81
#error "Screen Choreography requires React Native 0.81 or newer."
#endif
#include <react/renderer/core/LayoutableShadowNode.h>
#include <react/renderer/uimanager/UIManagerBinding.h>
#include <react/renderer/uimanager/UIManagerMountHook.h>

#include <atomic>
#include <cmath>
#include <limits>
#include <mutex>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace screenchoreography {
using namespace facebook;
using namespace facebook::react;

namespace {
class MountedLayouts final : public UIManagerMountHook, public std::enable_shared_from_this<MountedLayouts> {
 public:
  MountedLayouts(std::shared_ptr<UIManagerBinding> binding, jsi::Runtime &runtime,
      std::shared_ptr<CallInvoker> callInvoker)
      : binding_(std::move(binding)), manager_(binding_->getUIManager()), runtime_(runtime), callInvoker_(std::move(callInvoker)) {
    manager_.registerMountHook(*this);
  }

  ~MountedLayouts() noexcept override { manager_.unregisterMountHook(*this); }

  void shadowTreeDidMount(const RootShadowNode::Shared &root, HighResTimeStamp) noexcept override {
    std::lock_guard lock(mutex_);
    // Do not prolong a surface/node's lifetime across unmount or reload.
    roots_[root->getSurfaceId()] = root;
    notifyMount();
  }

  void shadowTreeDidUnmount(SurfaceId surface, HighResTimeStamp) noexcept override {
    std::lock_guard lock(mutex_);
    roots_.erase(surface);
    notifyMount();
  }

  size_t subscribe(jsi::Function callback) {
    const auto id = ++nextListener_;
    listeners_.emplace(id, std::move(callback));
    listenerCount_.store(listeners_.size());
    return id;
  }

  void unsubscribe(size_t id) {
    listeners_.erase(id);
    listenerCount_.store(listeners_.size());
  }

  jsi::Value capture(jsi::Runtime &runtime, const std::vector<Tag> &screens, const std::vector<Tag> &tags) {
    std::vector<RootShadowNode::Shared> roots;
    {
      std::lock_guard lock(mutex_);
      for (auto it = roots_.begin(); it != roots_.end();) {
        if (auto root = it->second.lock()) {
          roots.push_back(std::move(root));
          ++it;
        } else {
          it = roots_.erase(it);
        }
      }
    }
    for (const auto &root : roots) {
      if (!isCurrent(root) || !find(*root, screens.front())) continue;
      jsi::Array result(runtime, tags.size());
      for (size_t i = 0; i < tags.size(); ++i) {
        const auto screenNode = find(*root, screens[i]);
        if (!screenNode) return jsi::Value::null();
        const auto screenMetrics = LayoutableShadowNode::computeRelativeLayoutMetrics(
            screenNode->getFamily(), *root, {});
        if (!valid(screenMetrics)) return jsi::Value::null();
        // Searching below the requested screen prevents cross-screen matches.
        const auto node = find(*screenNode, tags[i]);
        if (!node) return jsi::Value::null();
        // Same layout policy / coordinate space as Reanimated measure(), but
        // every element comes from ONE completed mounted revision.
        const auto metrics = LayoutableShadowNode::computeRelativeLayoutMetrics(node->getFamily(), *root, {});
        if (!valid(metrics)) return jsi::Value::null();
        const auto &frame = metrics.frame;
        jsi::Object item(runtime);
        item.setProperty(runtime, "pageX", static_cast<double>(frame.origin.x));
        item.setProperty(runtime, "pageY", static_cast<double>(frame.origin.y));
        item.setProperty(runtime, "width", static_cast<double>(frame.size.width));
        item.setProperty(runtime, "height", static_cast<double>(frame.size.height));
        result.setValueAtIndex(runtime, i, std::move(item));
      }
      // A new commit can arrive while we compute the batch. Never mix it in.
      if (!isCurrent(root)) return jsi::Value::null();
      return result;
    }
    return jsi::Value::null();
  }

 private:
  void notifyMount() noexcept {
    if (!callInvoker_ || listenerCount_.load() == 0 || notificationPending_.exchange(true)) return;
    // Never access JSI on the mounting thread. Weak ownership prevents queued
    // notifications from retaining a torn-down runtime or surface.
    auto weak = weak_from_this();
    callInvoker_->invokeAsync([weak] {
      const auto self = weak.lock();
      if (!self) return;
      self->notificationPending_.store(false);
      std::vector<size_t> ids;
      for (const auto &listener : self->listeners_) ids.push_back(listener.first);
      for (const auto id : ids) {
        auto found = self->listeners_.find(id);
        if (found == self->listeners_.end()) continue;
        auto callback = jsi::Value(self->runtime_, found->second).asObject(self->runtime_).asFunction(self->runtime_);
        callback.call(self->runtime_);
      }
    });
  }

  bool isCurrent(const RootShadowNode::Shared &root) const {
    bool current = false;
    manager_.getShadowTreeRegistry().visit(root->getSurfaceId(), [&](const ShadowTree &tree) {
      const auto &mounting = tree.getMountingCoordinator();
      current = !mounting->hasPendingTransactions() &&
          mounting->getBaseRevision().rootShadowNode == root &&
          tree.getCurrentRevision().rootShadowNode == root;
    });
    return current;
  }

  static const ShadowNode *find(const ShadowNode &root, Tag tag) {
    if (root.getTag() == tag) return &root;
    for (const auto &child : root.getChildren()) {
      if (auto match = find(*child, tag)) return match;
    }
    return nullptr;
  }

  static bool valid(const LayoutMetrics &metrics) {
    const auto &frame = metrics.frame;
    return metrics != EmptyLayoutMetrics && std::isfinite(frame.origin.x) && std::isfinite(frame.origin.y) &&
        std::isfinite(frame.size.width) && std::isfinite(frame.size.height) &&
        frame.size.width > 0 && frame.size.height > 0;
  }

  // Holding the binding keeps its UIManager alive until our hook unregisters.
  std::shared_ptr<UIManagerBinding> binding_;
  UIManager &manager_;
  jsi::Runtime &runtime_;
  std::shared_ptr<CallInvoker> callInvoker_;
  std::unordered_map<size_t, jsi::Function> listeners_; // JS thread only.
  size_t nextListener_{0};
  std::atomic<size_t> listenerCount_{0};
  std::atomic<bool> notificationPending_{false};
  std::mutex mutex_;
  std::unordered_map<SurfaceId, std::weak_ptr<const RootShadowNode>> roots_;
};

bool validTag(const jsi::Value &value) {
  if (!value.isNumber()) return false;
  const auto n = value.getNumber();
  return std::isfinite(n) && n > 0 && n <= std::numeric_limits<Tag>::max() && std::floor(n) == n;
}
} // namespace

void installFabricLayoutCapture(jsi::Runtime &runtime, const std::shared_ptr<CallInvoker> &callInvoker) {
  auto binding = UIManagerBinding::getBinding(runtime);
  if (!binding) return;
  auto layouts = std::make_shared<MountedLayouts>(std::move(binding), runtime, callInvoker);
  runtime.global().setProperty(runtime, "__screenChoreographySubscribeFabricMount",
      jsi::Function::createFromHostFunction(runtime, jsi::PropNameID::forAscii(runtime, "subscribeFabricMount"), 1,
          [layouts](jsi::Runtime &rt, const jsi::Value &, const jsi::Value *args, size_t count) -> jsi::Value {
            if (count != 1 || !args[0].isObject() || !args[0].asObject(rt).isFunction(rt)) return jsi::Value::undefined();
            const auto id = layouts->subscribe(args[0].asObject(rt).asFunction(rt));
            return jsi::Function::createFromHostFunction(rt, jsi::PropNameID::forAscii(rt, "unsubscribeFabricMount"), 0,
                [layouts, id](jsi::Runtime &, const jsi::Value &, const jsi::Value *, size_t) -> jsi::Value {
                  layouts->unsubscribe(id);
                  return jsi::Value::undefined();
                });
          }));
  runtime.global().setProperty(runtime, "__screenChoreographyCaptureFabricLayout",
      jsi::Function::createFromHostFunction(runtime,
          jsi::PropNameID::forAscii(runtime, "captureFabricLayout"), 2,
          [layouts](jsi::Runtime &rt, const jsi::Value &, const jsi::Value *args, size_t count) -> jsi::Value {
            if (count != 2 || !args[0].isObject() || !args[0].asObject(rt).isArray(rt) ||
                !args[1].isObject() || !args[1].asObject(rt).isArray(rt))
              return jsi::Value::null();
            const auto array = args[1].asObject(rt).asArray(rt);
            const auto screensArray = args[0].asObject(rt).asArray(rt);
            const auto size = array.size(rt);
            if (size == 0 || size > 400 || screensArray.size(rt) != size) return jsi::Value::null();
            std::vector<Tag> screens;
            screens.reserve(size);
            std::vector<Tag> tags;
            tags.reserve(size);
            std::unordered_set<Tag> unique;
            for (size_t i = 0; i < size; ++i) {
              const auto value = array.getValueAtIndex(rt, i);
              const auto screenValue = screensArray.getValueAtIndex(rt, i);
              if (!validTag(screenValue) || !validTag(value)) return jsi::Value::null();
              const auto tag = static_cast<Tag>(value.getNumber());
              if (!unique.insert(tag).second) return jsi::Value::null();
              screens.push_back(static_cast<Tag>(screenValue.getNumber()));
              tags.push_back(tag);
            }
            return layouts->capture(rt, screens, tags);
          }));
}
} // namespace screenchoreography
