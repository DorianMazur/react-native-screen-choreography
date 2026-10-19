#pragma once

// Separate from presentation timing: diagnostic logging invalidates benchmark
// comparisons and must never be enabled in ordinary consumer builds.
#if defined(__APPLE__) && SCREEN_CHOREOGRAPHY_TRACE_HANGS
#include <atomic>
#include <cstdint>
#include <os/log.h>
#include <pthread.h>
#include <string>

namespace screenchoreography::diagnostics {
inline std::atomic<uint64_t> nextScope{0};
inline thread_local unsigned depth = 0;
inline os_log_t logger() {
  static os_log_t value = os_log_create("dev.screenchoreography.hang", "native");
  return value;
}

class Scope {
 public:
  Scope(const char *event, const char *identity)
      : event_(event), identity_(identity), id_(nextScope.fetch_add(1)), depth_(++depth) {
    pthread_threadid_np(nullptr, &thread_);
    emit("enter");
  }
  ~Scope() { emit("exit"); --depth; }
  Scope(const Scope &) = delete;
  Scope &operator=(const Scope &) = delete;

 private:
  void emit(const char *edge) {
    // Bound output per app launch. Preserve both edges for admitted scopes.
    if (id_ >= 4096) return;
    os_log(logger(), "%{public}s %{public}s scope=%llu thread=%llu depth=%u identity=%{public}s",
        edge, event_, (unsigned long long)id_, (unsigned long long)thread_, depth_, identity_.c_str());
  }
  const char *event_;
  const std::string identity_; // Callbacks can change the original session string.
  const uint64_t id_;
  const unsigned depth_;
  uint64_t thread_{0};
};
} // namespace screenchoreography::diagnostics
#define SC_HANG_SCOPE(event, identity) screenchoreography::diagnostics::Scope scHangScope(event, identity)
#else
#define SC_HANG_SCOPE(event, identity) do {} while (false)
#endif
