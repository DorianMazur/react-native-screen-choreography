package com.screenchoreography

import android.content.Context
import android.os.SystemClock
import android.view.View
import com.facebook.react.views.view.ReactViewGroup

class ScreenChoreographyView(context: Context) : ReactViewGroup(context) {
  var onPresentationReady: ((Double) -> Unit)? = null

  private var active = false
  private var presentationRequestId = 0

  init {
    clipChildren = false
    clipToPadding = false
    isClickable = false
    alpha = 0f
    visibility = View.INVISIBLE
  }

  fun setActive(value: Boolean) {
    if (active == value) {
      return
    }

    active = value
    if (!value) {
      presentationRequestId += 1
      alpha = 0f
      visibility = View.INVISIBLE
      return
    }

    alpha = 1f
    visibility = View.VISIBLE
    schedulePresentationReady()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (active) {
      schedulePresentationReady()
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
