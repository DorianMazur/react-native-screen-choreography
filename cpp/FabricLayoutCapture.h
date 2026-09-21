#pragma once

#include <jsi/jsi.h>
#include <ReactCommon/CallInvoker.h>

namespace screenchoreography {
// Installs a read-only binding owned by this JS runtime. No mount mutations.
void installFabricLayoutCapture(facebook::jsi::Runtime &runtime,
    const std::shared_ptr<facebook::react::CallInvoker> &callInvoker);
}
