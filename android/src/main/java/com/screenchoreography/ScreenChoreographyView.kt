package com.screenchoreography

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.View
import com.facebook.react.views.view.ReactViewGroup

class ScreenChoreographyView(context: Context) : ReactViewGroup(context) {
  var onPresentationReady: ((Double) -> Unit)? = null

  private var active = false
  private var presentationRequestId = 0
  private var dismissalRequestId = 0
  private var pendingPresentationAck = false
  // Host-only teardown frame; this never captures or reaches a shared element.
  private var dismissalFrame: Bitmap? = null
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
          val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
          val canvas = Canvas(bmp)
          super.dispatchDraw(canvas)
          dismissalFrame = bmp
          alpha = 1f
          visibility = View.VISIBLE
          invalidate()

          val dismissalId = ++dismissalRequestId
          // Two main-thread hops ≈ two frames: enough for Reanimated to commit.
          mainHandler.post {
            mainHandler.post {
              if (active || dismissalId != dismissalRequestId) {
                return@post
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
      // Post so the callback runs after this frame's draw traversal has
      // fully completed, not in the middle of it.
      mainHandler.post {
        if (active && requestId == presentationRequestId && windowToken != null) {
          onPresentationReady?.invoke(SystemClock.uptimeMillis().toDouble())
        }
      }
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (active) {
      schedulePresentationReady()
    }
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
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

    val requestId = ++presentationRequestId
    // Deterministic path: ack from the first dispatchDraw after activation,
    // so the JS handshake observes a frame that actually painted the overlay.
    pendingPresentationAck = true
    invalidate()

    // Fallback for the rare case where no draw pass runs (e.g. an already
    // valid hardware layer): two frames is enough for any pending commit.
    mainHandler.postDelayed({
      if (active && requestId == presentationRequestId && pendingPresentationAck && windowToken != null) {
        pendingPresentationAck = false
        onPresentationReady?.invoke(SystemClock.uptimeMillis().toDouble())
      }
    }, 32)
  }
}
