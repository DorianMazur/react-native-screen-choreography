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
  private var dismissalBitmap: Bitmap? = null
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
      val w = width
      val h = height
      clearDismissalBitmap()

      if (w > 0 && h > 0) {
        try {
          val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
          val canvas = Canvas(bmp)
          super.dispatchDraw(canvas)
          dismissalBitmap = bmp
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
              clearDismissalBitmap()
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
    clearDismissalBitmap()
    alpha = 1f
    visibility = View.VISIBLE
    invalidate()
    schedulePresentationReady()
  }

  override fun dispatchDraw(canvas: Canvas) {
    val bmp = dismissalBitmap
    if (bmp != null && !bmp.isRecycled) {
      canvas.drawBitmap(bmp, 0f, 0f, null)
      return
    }
    super.dispatchDraw(canvas)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (active) {
      schedulePresentationReady()
    }
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    clearDismissalBitmap()
    mainHandler.removeCallbacksAndMessages(null)
  }

  private fun clearDismissalBitmap() {
    val bmp = dismissalBitmap ?: return
    dismissalBitmap = null
    if (!bmp.isRecycled) {
      bmp.recycle()
    }
  }

  private fun schedulePresentationReady() {
    if (!active || windowToken == null) {
      return
    }

    val requestId = ++presentationRequestId
    post {
      if (!active || requestId != presentationRequestId || windowToken == null) {
        return@post
      }

      onPresentationReady?.invoke(SystemClock.uptimeMillis().toDouble())
    }
  }
}
