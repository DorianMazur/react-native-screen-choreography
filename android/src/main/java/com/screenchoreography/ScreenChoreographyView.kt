package com.screenchoreography

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.View
import android.view.ViewGroupOverlay
import com.facebook.react.views.view.ReactViewGroup

class ScreenChoreographyView(context: Context) : ReactViewGroup(context) {
  var onPresentationReady: ((String, Double) -> Unit)? = null

  private var active = false
  private var presentationSessionId = ""
  private var presentationRequestId = 0
  private var dismissalRequestId = 0
  private var pendingPresentationAck = false
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
    alpha = 0f
    visibility = View.INVISIBLE
    // dispatchDraw needs to run even when the view group has no background.
    setWillNotDraw(false)
  }

  fun setPresentationSessionId(value: String) {
    if (presentationSessionId == value) return
    presentationSessionId = value
    // React can batch an interruption's inactive/active updates. A new
    // session must request its own draw acknowledgement even if active stays true.
    presentationRequestId += 1
    pendingPresentationAck = false
    if (active) schedulePresentationReady()
  }

  fun setActive(value: Boolean) {
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
    schedulePresentationReady()
  }

  override fun dispatchDraw(canvas: Canvas) {
    val bmp = dismissalFrame
    if (bmp != null && !bmp.isRecycled) {
      canvas.drawBitmap(bmp, 0f, 0f, null)
      return
    }
    super.dispatchDraw(canvas)

    if (pendingPresentationAck && active) {
      pendingPresentationAck = false
      val requestId = presentationRequestId
      val sessionId = presentationSessionId
      // Post so the callback runs after this frame's draw traversal has
      // fully completed, not in the middle of it.
      mainHandler.post {
        if (active && requestId == presentationRequestId && windowToken != null) {
          onPresentationReady?.invoke(sessionId, SystemClock.uptimeMillis().toDouble())
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
      schedulePresentationReady()
    }
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    presentationRequestId += 1
    dismissalRequestId += 1
    pendingPresentationAck = false
    clearDismissalFrame()
    mainHandler.removeCallbacksAndMessages(null)
  }

  private fun clearDismissalFrame() {
    val bmp = dismissalFrame ?: return
    dismissalFrame = null
    if (!bmp.isRecycled) {
      bmp.recycle()
    }
  }

  private fun schedulePresentationReady() {
    if (!active || windowToken == null) {
      return
    }

    presentationRequestId += 1
    // Deterministic path: ack from the first dispatchDraw after activation,
    // so the JS handshake observes a frame that actually painted the overlay.
    pendingPresentationAck = true
    invalidate()

    // If drawing is delayed, the provider's 150ms timeout is the safety net.
    // A fixed 32ms timer cannot prove that any native frame was presented.
  }
}
