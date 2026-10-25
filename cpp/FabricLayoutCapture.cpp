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
constexpr int kCommitRaceAttempts = 3;

struct CapturedFrame {
  double pageX;
  double pageY;
  double width;
  double height;
};

// Shared across RN/UI runtimes; never retain JSI values or Fabric nodes.
struct NativeCaptureRequest {
  SurfaceId surface;
  std::vector<Tag> screens;
  std::vector<Tag> tags;
  std::vector<ShadowNodeFamily::Weak> screenFamilies;
  std::vector<ShadowNodeFamily::Weak> families;
  std::atomic<bool> consumed{false};
  std::mutex mutex;
  bool invalidated{false};
  std::weak_ptr<const RootShadowNode> mountedRoot;
  std::vector<CapturedFrame> frames;
};

class MountedLayouts;
struct NativeCaptureOwner {
  std::mutex mutex;
  MountedLayouts *owner{nullptr};
};

class MountedLayouts final : public UIManagerMountHook, public std::enable_shared_from_this<MountedLayouts> {
 public:
  MountedLayouts(std::shared_ptr<UIManagerBinding> binding, jsi::Runtime &runtime,
      std::shared_ptr<CallInvoker> callInvoker)
      : binding_(std::move(binding)), manager_(binding_->getUIManager()), runtime_(runtime), callInvoker_(std::move(callInvoker)) {
    nativeOwner_->owner = this;
    manager_.registerMountHook(*this);
  }

  ~MountedLayouts() noexcept override {
    {
      std::lock_guard lock(nativeOwner_->mutex);
      nativeOwner_->owner = nullptr;
    }
    manager_.unregisterMountHook(*this);
  }

  void shadowTreeDidMount(const RootShadowNode::Shared &root, HighResTimeStamp) noexcept override {
    std::vector<std::shared_ptr<NativeCaptureRequest>> requests;
    {
      std::lock_guard lock(mutex_);
      roots_[root->getSurfaceId()] = root;
      collectRequests(root->getSurfaceId(), requests);
    }
    for (const auto &request : requests) refreshRequest(request, root);
    notifyMount();
  }

  void shadowTreeDidUnmount(SurfaceId surface, HighResTimeStamp) noexcept override {
    std::vector<std::shared_ptr<NativeCaptureRequest>> requests;
    {
      std::lock_guard lock(mutex_);
      roots_.erase(surface);
      collectRequests(surface, requests);
    }
    for (const auto &request : requests) invalidateRequest(request);
    notifyMount();
  }

  void invalidate() {
    invalidated_.store(true);
    std::vector<std::shared_ptr<NativeCaptureRequest>> requests;
    {
      std::lock_guard lock(mutex_);
      for (const auto &weak : requests_) {
        if (auto request = weak.lock()) requests.push_back(std::move(request));
      }
      requests_.clear();
    }
    for (const auto &request : requests) invalidateRequest(request);
  }

  jsi::Value prepareNativeCapture(jsi::Runtime &runtime, const std::vector<Tag> &screens,
      const std::vector<Tag> &tags) {
    if (invalidated_.load()) return jsi::Value::null();
    std::shared_ptr<NativeCaptureRequest> request;
    RootShadowNode::Shared committedRoot;
    // Other threads commit too (Reanimated applies animated props on the UI
    // thread), so the root can advance while identities are collected. Retry
    // against the newer revision instead of dropping the transition.
    for (int attempt = 0; attempt < kCommitRaceAttempts && !request; ++attempt) {
      bool advanced = false;
      manager_.getShadowTreeRegistry().enumerate([&](const ShadowTree &tree, bool &stop) {
        const auto root = tree.getCurrentRevision().rootShadowNode;
        if (!root || !find(*root, screens.front())) return;
        auto candidate = std::make_shared<NativeCaptureRequest>();
        candidate->surface = root->getSurfaceId();
        candidate->screens = screens;
        candidate->tags = tags;
        for (size_t i = 0; i < tags.size(); ++i) {
          const auto screen = find(*root, screens[i]);
          const auto node = screen ? find(*screen, tags[i]) : nullptr;
          if (!node) return;
          candidate->screenFamilies.push_back(screen->getFamilyShared());
          candidate->families.push_back(node->getFamilyShared());
        }
        stop = true;
        if (tree.getCurrentRevision().rootShadowNode != root) {
          advanced = true;
          return;
        }
        request = std::move(candidate);
        committedRoot = root;
      });
      if (request && !isCommitted(committedRoot)) {
        request.reset();
        advanced = true;
      }
      if (!advanced) break;
    }
    if (!request) return jsi::Value::null();

    RootShadowNode::Shared mountedRoot;
    {
      std::lock_guard lock(mutex_);
      for (auto it = requests_.begin(); it != requests_.end();) {
        if (it->expired()) it = requests_.erase(it);
        else ++it;
      }
      requests_.push_back(request);
      const auto found = roots_.find(request->surface);
      if (found != roots_.end()) mountedRoot = found->second.lock();
    }
    // On iOS, the base revision can advance before UIKit mounts it.
    if (mountedRoot) refreshRequest(request, mountedRoot);
    const auto owner = nativeOwner_;
    return jsi::Function::createFromHostFunction(runtime,
        jsi::PropNameID::forAscii(runtime, "readNativeCapture"), 0,
        [owner, request](jsi::Runtime &rt, const jsi::Value &, const jsi::Value *args, size_t count) -> jsi::Value {
          const bool validateOnly = count == 1 && args[0].isBool() && args[0].getBool();
          if (count == 1 && args[0].isBool() && !args[0].getBool()) {
            request->consumed.store(true);
            invalidateRequest(request);
            return jsi::Value::undefined();
          }
          std::lock_guard lock(owner->mutex);
          if (validateOnly) return jsi::Value(owner->owner && owner->owner->validateNativeCapture(request));
          if (!owner->owner || count != 0) return jsi::Value::null();
          return owner->owner->readNativeCapture(rt, request);
        });
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
  // Requires mutex_.
  void collectRequests(SurfaceId surface, std::vector<std::shared_ptr<NativeCaptureRequest>> &result) {
    for (auto it = requests_.begin(); it != requests_.end();) {
      if (auto request = it->lock()) {
        if (request->consumed.load()) {
          it = requests_.erase(it);
          continue;
        }
        if (request->surface == surface) result.push_back(std::move(request));
        ++it;
      } else {
        it = requests_.erase(it);
      }
    }
  }

  static void invalidateRequest(const std::shared_ptr<NativeCaptureRequest> &request) {
    std::lock_guard lock(request->mutex);
    request->invalidated = true;
    request->mountedRoot.reset();
    request->frames.clear();
  }

  void refreshRequest(const std::shared_ptr<NativeCaptureRequest> &request,
      const RootShadowNode::Shared &root) {
    if (invalidated_.load() || request->consumed.load() || !isCurrent(root)) return;
    std::lock_guard lock(request->mutex);
    if (request->invalidated || request->consumed.load()) return;
    std::vector<CapturedFrame> frames;
    frames.reserve(request->tags.size());
    for (size_t i = 0; i < request->tags.size(); ++i) {
      const auto expectedScreen = request->screenFamilies[i].lock();
      const auto expectedNode = request->families[i].lock();
      const auto screen = find(*root, request->screens[i]);
      const auto node = screen ? find(*screen, request->tags[i]) : nullptr;
      if (!expectedScreen || !expectedNode || !screen || !node ||
          &screen->getFamily() != expectedScreen.get() || &node->getFamily() != expectedNode.get()) {
        request->invalidated = true;
        request->mountedRoot.reset();
        request->frames.clear();
        return;
      }
      const auto screenMetrics = LayoutableShadowNode::computeRelativeLayoutMetrics(screen->getFamily(), *root, {});
      const auto metrics = LayoutableShadowNode::computeRelativeLayoutMetrics(node->getFamily(), *root, {});
      if (!valid(screenMetrics) || !valid(metrics)) {
        request->mountedRoot.reset();
        request->frames.clear();
        return;
      }
      const auto &frame = metrics.frame;
      frames.push_back({static_cast<double>(frame.origin.x), static_cast<double>(frame.origin.y),
          static_cast<double>(frame.size.width), static_cast<double>(frame.size.height)});
    }
    if (!isCurrent(root)) return;
    request->frames = std::move(frames);
    request->mountedRoot = root;
  }

  jsi::Value readNativeCapture(jsi::Runtime &runtime, const std::shared_ptr<NativeCaptureRequest> &request) {
    if (invalidated_.load()) return jsi::Value::null();
    RootShadowNode::Shared root;
    std::vector<CapturedFrame> frames;
    {
      std::lock_guard lock(request->mutex);
      if (request->invalidated || request->consumed.load()) return jsi::Value::null();
      root = request->mountedRoot.lock();
      frames = request->frames;
    }
    if (!root || frames.size() != request->tags.size() || !isCurrent(root)) return jsi::Value::null();
    jsi::Array result(runtime, frames.size());
    for (size_t i = 0; i < frames.size(); ++i) {
      const auto &frame = frames[i];
      jsi::Object item(runtime);
      item.setProperty(runtime, "pageX", frame.pageX);
      item.setProperty(runtime, "pageY", frame.pageY);
      item.setProperty(runtime, "width", frame.width);
      item.setProperty(runtime, "height", frame.height);
      result.setValueAtIndex(runtime, i, std::move(item));
    }
    if (invalidated_.load() || !isCurrent(root)) return jsi::Value::null();
    {
      std::lock_guard lock(request->mutex);
      if (request->invalidated || request->consumed.exchange(true)) return jsi::Value::null();
      request->mountedRoot.reset();
      request->frames.clear();
    }
    return result;
  }

  bool validateNativeCapture(const std::shared_ptr<NativeCaptureRequest> &request) const {
    if (invalidated_.load()) return false;
    {
      std::lock_guard lock(request->mutex);
      if (request->invalidated) return false;
    }
    bool valid = false;
    // Identity is what matters here. A commit landing mid-check (for example an
    // animated prop update) re-checks the newer revision; identities confirmed on
    // a committed revision stay valid, and presentation validates again later.
    for (int attempt = 0; attempt < kCommitRaceAttempts; ++attempt) {
      bool advanced = false;
      valid = false;
      manager_.getShadowTreeRegistry().visit(request->surface, [&](const ShadowTree &tree) {
        const auto root = tree.getCurrentRevision().rootShadowNode;
        if (!root || root->getSurfaceId() != request->surface) return;
        for (size_t i = 0; i < request->tags.size(); ++i) {
          const auto expectedScreen = request->screenFamilies[i].lock();
          const auto expectedNode = request->families[i].lock();
          if (!expectedScreen || !expectedNode) return;
          const auto screen = find(*root, request->screens[i]);
          const auto node = screen ? find(*screen, request->tags[i]) : nullptr;
          if (!screen || !node || &screen->getFamily() != expectedScreen.get() ||
              &node->getFamily() != expectedNode.get()) return;
        }
        valid = true;
        advanced = tree.getCurrentRevision().rootShadowNode != root;
      });
      if (!valid || !advanced) break;
    }
    std::lock_guard lock(request->mutex);
    return valid && !invalidated_.load() && !request->invalidated;
  }

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

  bool isCommitted(const RootShadowNode::Shared &root) const {
    bool current = false;
    manager_.getShadowTreeRegistry().visit(root->getSurfaceId(), [&](const ShadowTree &tree) {
      current = tree.getCurrentRevision().rootShadowNode == root;
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
  std::atomic<bool> invalidated_{false};
  // Keep JS-owned bindings/listeners from being destroyed on the UI runtime.
  std::shared_ptr<NativeCaptureOwner> nativeOwner_{std::make_shared<NativeCaptureOwner>()};
  std::mutex mutex_;
  std::unordered_map<SurfaceId, std::weak_ptr<const RootShadowNode>> roots_;
  std::vector<std::weak_ptr<NativeCaptureRequest>> requests_;
};

bool validTag(const jsi::Value &value) {
  if (!value.isNumber()) return false;
  const auto n = value.getNumber();
  return std::isfinite(n) && n > 0 && n <= std::numeric_limits<Tag>::max() && std::floor(n) == n;
}

bool readTags(jsi::Runtime &runtime, const jsi::Value *args, size_t count,
    std::vector<Tag> &screens, std::vector<Tag> &tags) {
  if (count != 2 || !args[0].isObject() || !args[0].asObject(runtime).isArray(runtime) ||
      !args[1].isObject() || !args[1].asObject(runtime).isArray(runtime)) return false;
  const auto array = args[1].asObject(runtime).asArray(runtime);
  const auto screensArray = args[0].asObject(runtime).asArray(runtime);
  const auto size = array.size(runtime);
  if (size == 0 || size > 400 || screensArray.size(runtime) != size) return false;
  screens.reserve(size);
  tags.reserve(size);
  std::unordered_set<Tag> unique;
  for (size_t i = 0; i < size; ++i) {
    const auto value = array.getValueAtIndex(runtime, i);
    const auto screenValue = screensArray.getValueAtIndex(runtime, i);
    if (!validTag(screenValue) || !validTag(value)) return false;
    const auto tag = static_cast<Tag>(value.getNumber());
    if (!unique.insert(tag).second) return false;
    screens.push_back(static_cast<Tag>(screenValue.getNumber()));
    tags.push_back(tag);
  }
  return true;
}
} // namespace

void installFabricLayoutCapture(jsi::Runtime &runtime, const std::shared_ptr<CallInvoker> &callInvoker) {
  auto binding = UIManagerBinding::getBinding(runtime);
  if (!binding) return;
  auto layouts = std::make_shared<MountedLayouts>(std::move(binding), runtime, callInvoker);
  // Reinstall must also invalidate HostFunctions copied to the UI runtime.
  static std::mutex ownersMutex;
  static std::unordered_map<jsi::Runtime *, std::weak_ptr<MountedLayouts>> owners;
  {
    std::lock_guard lock(ownersMutex);
    for (auto it = owners.begin(); it != owners.end();) {
      if (it->second.expired()) it = owners.erase(it);
      else ++it;
    }
    const auto found = owners.find(&runtime);
    if (found != owners.end()) {
      if (const auto previous = found->second.lock()) previous->invalidate();
    }
    owners[&runtime] = layouts;
  }
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
            std::vector<Tag> screens;
            std::vector<Tag> tags;
            if (!readTags(rt, args, count, screens, tags)) return jsi::Value::null();
            return layouts->capture(rt, screens, tags);
          }));
  runtime.global().setProperty(runtime, "__screenChoreographyRequestFabricLayout",
      jsi::Function::createFromHostFunction(runtime,
          jsi::PropNameID::forAscii(runtime, "prepareNativeCapture"), 2,
          [layouts](jsi::Runtime &rt, const jsi::Value &, const jsi::Value *args, size_t count) -> jsi::Value {
            std::vector<Tag> screens;
            std::vector<Tag> tags;
            if (!readTags(rt, args, count, screens, tags)) return jsi::Value::null();
            return layouts->prepareNativeCapture(rt, screens, tags);
          }));
}
} // namespace screenchoreography
