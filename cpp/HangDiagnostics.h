#pragma once

// Separate from presentation timing: diagnostic logging invalidates benchmark
// comparisons and must never be enabled in ordinary consumer builds.
#if defined(__APPLE__) && SCREEN_CHOREOGRAPHY_TRACE_HANGS
#include <atomic>
#include <chrono>
#include <cstdint>
#include <os/log.h>
#include <pthread.h>
#include <string>

namespace screenchoreography::diagnostics {
inline std::atomic<uint64_t> nextScope{0};
inline std::atomic<uint64_t> boundaryBudget{0};
inline std::atomic<uint64_t> repeatedBudget{0};
inline thread_local unsigned depth = 0;

// Renew budgets throughout the test. Frequent target recaptures must not consume
// presentation/preparation coverage, especially during later round trips.
inline bool admitScope(std::atomic<uint64_t> &budget, uint64_t second, uint32_t limit) {
  const auto epoch = second << 32;
  auto previous = budget.load(std::memory_order_relaxed);
  while (true) {
    const auto count = (previous >> 32) == second ? uint32_t(previous) : 0;
    if (count >= limit) return false;
    if (budget.compare_exchange_weak(previous, epoch | (count + 1), std::memory_order_relaxed)) return true;
  }
}
inline os_log_t logger() {
  static os_log_t value = os_log_create("dev.screenchoreography.hang", "native");
  return value;
}

class Scope {
 public:
  Scope(const char *event, const char *identity, bool repeated = false)
      : event_(event), id_(nextScope.fetch_add(1)), depth_(++depth) {
    const auto second = std::chrono::duration_cast<std::chrono::seconds>(
        std::chrono::steady_clock::now().time_since_epoch()).count();
    admitted_ = admitScope(repeated ? repeatedBudget : boundaryBudget, second, repeated ? 4 : 128);
    if (admitted_) {
      identity_ = identity; // Callbacks can change the original session string.
      pthread_threadid_np(nullptr, &thread_);
    }
    emit("enter");
  }
  ~Scope() { emit("exit"); --depth; }
  Scope(const Scope &) = delete;
  Scope &operator=(const Scope &) = delete;

 private:
  void emit(const char *edge) {
    // Admission is fixed on entry, preserving both edges across a budget reset.
    if (!admitted_) return;
    os_log(logger(), "%{public}s %{public}s scope=%llu thread=%llu depth=%u identity=%{public}s",
        edge, event_, (unsigned long long)id_, (unsigned long long)thread_, depth_, identity_.c_str());
  }
  const char *event_;
  std::string identity_;
  const uint64_t id_;
  const unsigned depth_;
  uint64_t thread_{0};
  bool admitted_{false};
};
} // namespace screenchoreography::diagnostics
#define SC_HANG_SCOPE(event, identity) screenchoreography::diagnostics::Scope scHangScope(event, identity)
#define SC_HANG_REPEATED_SCOPE(event, identity) screenchoreography::diagnostics::Scope scHangScope(event, identity, true)
#else
#define SC_HANG_SCOPE(event, identity) do {} while (false)
#define SC_HANG_REPEATED_SCOPE(event, identity) do {} while (false)
#endif
