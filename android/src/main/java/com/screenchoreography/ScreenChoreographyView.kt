package com.screenchoreography

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.view.ViewGroupOverlay
import com.facebook.react.R
import com.facebook.react.uimanager.PointerEvents
import com.facebook.react.views.view.ReactViewGroup

class ScreenChoreographyView(context: Context) : ReactViewGroup(context) {
  var onPresentationReady: ((Double, String, String) -> Unit)? = null

  private var active = false
  private var foregroundLayer = false
  private var reactActive = false
  private var prepared = false
  private var attachmentAcknowledged = false
  private var presentationRequested = false
  private var presentationAcknowledged = false
  private var attachmentDeadline = 0L
  private var presentationDeadline = 0L
  private var expectedHostNames: List<String> = emptyList()
  private var sessionId = ""
  private var presentationRequestId = 0
  private var dismissalRequestId = 0
  private var pendingPresentationAck = false
  private var pendingPresentationSessionId = ""
  // Host-only teardown frame; this never captures or reaches a shared element.
  private var dismissalFrame: Bitmap? = null
  private var probingDismissalContent = false
  private var foundDismissalChild = false
  private var usesViewOverlay = false
  private val dismissalProbeCanvas by lazy { Canvas() }
  private val mainHandler = Handler(Looper.getMainLooper())

  init {
    clipChildren = false
    clipToPadding = false
    isClickable = false
    // ViewGroupManager does not apply ReactViewManager's pointerEvents prop.
    // Keep this visual-only host out of RN hit testing, including its children,
    // so the destination can receive input while retained content settles.
    pointerEvents = PointerEvents.NONE
    alpha = 0f
    visibility = View.INVISIBLE
    // dispatchDraw needs to run even when the view group has no background.
    setWillNotDraw(false)
  }

  fun setActive(value: Boolean) {
    reactActive = value
    updateActive(value || prepared)
  }

  fun setForegroundLayer(value: Boolean) {
    foregroundLayer = value
    pointerEvents = if (value) PointerEvents.BOX_NONE else PointerEvents.NONE
    if (value) cancelPresentationReady()
  }

  private fun updateActive(value: Boolean) {
    if (active == value) {
      return
    }

    active = value
    if (!value) {
      presentationRequestId += 1
      pendingPresentationAck = false
      val w = width
      val h = height
      clearDismissalFrame()

      if (w > 0 && h > 0) {
        try {
          if (!hasDismissalContent()) {
            dismissalRequestId += 1
            alpha = 0f
            visibility = View.INVISIBLE
            return
          }
          val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
          val canvas = Canvas(bmp)
          super.dispatchDraw(canvas)
          dismissalFrame = bmp
          alpha = 1f
          visibility = View.VISIBLE
          invalidate()

          val dismissalId = ++dismissalRequestId
          // Queue against actual frame boundaries. Handler.post can run twice
          // before the next draw and release the bridge frame too early.
          postOnAnimation {
            postOnAnimation release@{
              if (active || dismissalId != dismissalRequestId) {
                return@release
              }
              clearDismissalFrame()
              alpha = 0f
              visibility = View.INVISIBLE
              invalidate()
            }
          }
          return
        } catch (_: Throwable) {
          // Fall through to immediate hide on any allocation/draw failure.
        }
      }

      dismissalRequestId += 1
      alpha = 0f
      visibility = View.INVISIBLE
      return
    }

    dismissalRequestId += 1
    clearDismissalFrame()
    alpha = 1f
    visibility = View.VISIBLE
    invalidate()
    acknowledgeAttachmentIfReady()
    schedulePresentationReady()
  }

  fun setSessionId(value: String) {
    if (sessionId == value) {
      return
    }

    cancelPresentationReady()
    sessionId = value
    prepared = false
    attachmentAcknowledged = false
    presentationRequested = false
    presentationAcknowledged = false
    presentationDeadline = 0L
    updateActive(reactActive)
    if (active) {
      schedulePresentationReady()
    }
  }

  fun prepare(expectedSessionId: String) {
    if (expectedSessionId.isEmpty() || expectedSessionId != sessionId) return
    if (!prepared) {
      prepared = true
      attachmentDeadline = SystemClock.uptimeMillis() + 1000L
    }
    updateActive(true)
    acknowledgeAttachmentIfReady()
    if (!attachmentAcknowledged && SystemClock.uptimeMillis() < attachmentDeadline) postInvalidateOnAnimation()
  }

  fun setPresentationRequested(value: Boolean) {
    // React may reapply false animated props; latch until the session changes.
    if (!value || sessionId.isEmpty() || presentationRequested) return
    presentationRequested = true
    presentationDeadline = SystemClock.uptimeMillis() + 1000L
    schedulePresentationReady()
  }

  fun setExpectedHostNames(names: List<String>) {
    expectedHostNames = names
    if (prepared && presentationRequested) schedulePresentationReady()
  }

  private fun acknowledgeAttachmentIfReady() {
    if (!prepared || attachmentAcknowledged || !active || !isAttachedToWindow || windowToken == null ||
      SystemClock.uptimeMillis() >= attachmentDeadline || !transitionHostsAreReady(false)) return
    attachmentAcknowledged = true
    onPresentationReady?.invoke(SystemClock.uptimeMillis().toDouble(), sessionId, "attached")
  }

  fun cancelPresentationReady() {
    // A recycled view must reject acknowledgments queued for its previous owner.
    presentationRequestId += 1
    pendingPresentationAck = false
    pendingPresentationSessionId = ""
    mainHandler.removeCallbacksAndMessages(null)
  }

  override fun dispatchDraw(canvas: Canvas) {
    val bmp = dismissalFrame
    if (bmp != null && !bmp.isRecycled) {
      canvas.drawBitmap(bmp, 0f, 0f, null)
      return
    }
    super.dispatchDraw(canvas)

    if (prepared && !attachmentAcknowledged) {
      acknowledgeAttachmentIfReady()
      if (!attachmentAcknowledged && SystemClock.uptimeMillis() < attachmentDeadline) postInvalidateOnAnimation()
    }

    if (pendingPresentationAck && active) {
      if (SystemClock.uptimeMillis() >= presentationDeadline) {
        pendingPresentationAck = false
        return
      }
      if (!transitionHostsAreReady(true)) {
        if (SystemClock.uptimeMillis() < presentationDeadline) postInvalidateOnAnimation()
        else pendingPresentationAck = false
        return
      }
      pendingPresentationAck = false
      val requestId = presentationRequestId
      val presentedSessionId = pendingPresentationSessionId
      // Post so the callback runs after this frame's draw traversal has
      // fully completed, not in the middle of it.
      mainHandler.post {
        if (active && requestId == presentationRequestId && presentedSessionId == sessionId && windowToken != null) {
          if (!transitionHostsAreReady(true)) {
            if (SystemClock.uptimeMillis() < presentationDeadline) {
              pendingPresentationAck = true
              postInvalidateOnAnimation()
            }
            return@post
          }
          presentationAcknowledged = true
          onPresentationReady?.invoke(SystemClock.uptimeMillis().toDouble(), presentedSessionId, "presented")
        }
      }
    }
  }

  override fun drawChild(canvas: Canvas, child: View, drawingTime: Long): Boolean {
    if (probingDismissalContent) {
      foundDismissalChild = true
      return false
    }
    return super.drawChild(canvas, child, drawingTime)
  }

  override fun getOverlay(): ViewGroupOverlay {
    usesViewOverlay = true
    return super.getOverlay()
  }

  private fun hasDismissalContent(): Boolean {
    if (childCount > 0 || background != null || foreground != null || layoutAnimation != null || usesViewOverlay) {
      return true
    }
    foundDismissalChild = false
    probingDismissalContent = true
    try {
      super.dispatchDraw(dismissalProbeCanvas)
    } finally {
      probingDismissalContent = false
    }
    return foundDismissalChild
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (active) {
      acknowledgeAttachmentIfReady()
      schedulePresentationReady()
    }
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    cancelPresentationReady()
    attachmentAcknowledged = false
    dismissalRequestId += 1
    clearDismissalFrame()
  }

  private fun clearDismissalFrame() {
    val bmp = dismissalFrame ?: return
    dismissalFrame = null
    if (!bmp.isRecycled) {
      bmp.recycle()
    }
  }

  private fun schedulePresentationReady() {
    if (!prepared || foregroundLayer || !active || windowToken == null || presentationAcknowledged ||
      !presentationRequested || SystemClock.uptimeMillis() >= presentationDeadline) {
      return
    }

    presentationRequestId += 1
    pendingPresentationSessionId = sessionId
    // Deterministic path: ack from the first dispatchDraw after activation,
    // so the JS handshake observes a frame that actually painted the overlay.
    pendingPresentationAck = true
    invalidate()

    // If drawing is delayed, the provider's 150ms timeout is the safety net.
    // A fixed 32ms timer cannot prove that any native frame was presented.
  }

  private fun transitionHostsAreReady(requireLiveChildren: Boolean): Boolean {
    if (expectedHostNames.isEmpty()) return false
    val remaining = expectedHostNames.toMutableSet()
    fun visit(view: View, visible: Boolean) {
      val isVisible = visible && view.visibility == View.VISIBLE && view.alpha > 0f
      val name = view.getTag(R.id.react_test_id) as? String
      if (name != null && remaining.contains(name) && (!requireLiveChildren || isVisible) && view is ViewGroup &&
        view.isAttachedToWindow && view.windowToken == windowToken && view.width > 0 && view.height > 0) {
        if (!requireLiveChildren) {
          remaining.remove(name)
        } else {
          for (index in 0 until view.childCount) {
            val child = view.getChildAt(index)
            if (child.isAttachedToWindow && child.windowToken == windowToken && child.width > 0 && child.height > 0) {
              remaining.remove(name)
              break
            }
          }
        }
      }
      if (remaining.isNotEmpty() && view is ViewGroup) {
        for (index in 0 until view.childCount) visit(view.getChildAt(index), isVisible)
      }
    }
    visit(this, true)
    return remaining.isEmpty()
  }
}
