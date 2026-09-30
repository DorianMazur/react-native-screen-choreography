#pragma once

#include <jsi/jsi.h>
#include <ReactCommon/CallInvoker.h>

namespace screenchoreography {
// Request readers: read() consumes geometry, read(true) validates identity,
// read(false) cancels. Readers must not access the originating JS runtime.
void installFabricLayoutCapture(facebook::jsi::Runtime &runtime,
    const std::shared_ptr<facebook::react::CallInvoker> &callInvoker);
}
