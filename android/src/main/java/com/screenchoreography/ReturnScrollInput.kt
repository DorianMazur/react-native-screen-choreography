package com.screenchoreography

import android.graphics.Matrix
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.HorizontalScrollView
import android.widget.ScrollView
import com.facebook.react.uimanager.RootViewUtil
import com.facebook.react.uimanager.PointerEvents
import com.facebook.react.uimanager.TouchTargetHelper
import com.facebook.react.uimanager.util.ReactFindViewUtil
import com.facebook.react.views.view.ReactViewGroup

/** Native-stack can cover the list until the pop commits. Deliver its original
 * pointer stream from DOWN through UP, including when the overlay stops drawing. */
internal class ReturnScrollInput(private val host: ViewGroup) {
  private var target: ReactViewGroup? = null
  private var targetId = View.NO_ID
  private var lastEvent: MotionEvent? = null
  val hasGesture get() = target != null

  fun dispatch(event: MotionEvent, inputTarget: String?): Boolean {
    val down = event.actionMasked == MotionEvent.ACTION_DOWN
    if (down) cancel()
    val screen = if (down) {
      if (inputTarget.isNullOrEmpty()) return false
      val root = RootViewUtil.getRootView(host) as? View ?: return false
      val candidate = ReactFindViewUtil.findView(root, inputTarget) as? ReactViewGroup ?: return false
      if (candidate.pointerEvents == PointerEvents.NONE) return false
      candidate
    } else target ?: return false

    if (!down && (!screen.isAttachedToWindow || screen.id != targetId)) {
      clear()
      return false
    }

    val local = MotionEvent.obtain(event)
    try {
      val toScreen = Matrix()
      val fromHost = Matrix()
      localToRoot(screen, toScreen)
      if (!toScreen.invert(toScreen)) return false
      localToRoot(host, fromHost)
      toScreen.preConcat(fromHost)
      local.transform(toScreen)
      if (down && !hitsScrollView(screen, local)) return false
      val handled = screen.dispatchTouchEvent(local)
      if (down && !handled) return false
      if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) {
        clear()
      } else {
        target = screen
        targetId = screen.id
        lastEvent?.recycle()
        lastEvent = MotionEvent.obtain(local)
      }
      return true
    } finally {
      local.recycle()
    }
  }

  private fun hitsScrollView(screen: ViewGroup, event: MotionEvent): Boolean {
    if (event.x < 0 || event.y < 0 || event.x >= screen.width || event.y >= screen.height) return false
    val tag = IntArray(1)
    TouchTargetHelper.findTargetTagForTouch(event.x, event.y, screen, tag)
    var hit = screen.findViewById<View>(tag[0])
    while (hit != null && hit !== screen) {
      if (hit is ScrollView || hit is HorizontalScrollView) return true
      hit = hit.parent as? View
    }
    return false
  }

  // Also works on Android 24–28, before View.transformMatrixToGlobal was public.
  private fun localToRoot(view: View, matrix: Matrix) {
    val parent = view.parent as? View ?: return
    localToRoot(parent, matrix)
    matrix.preTranslate((view.left - parent.scrollX).toFloat(), (view.top - parent.scrollY).toFloat())
    if (!view.matrix.isIdentity) matrix.preConcat(view.matrix)
  }

  fun cancel() {
    val screen = target
    lastEvent?.let { event ->
      if (screen?.id == targetId && screen.isAttachedToWindow) {
        event.action = MotionEvent.ACTION_CANCEL
        screen.dispatchTouchEvent(event)
      }
    }
    clear()
  }

  private fun clear() {
    target = null
    targetId = View.NO_ID
    lastEvent?.recycle()
    lastEvent = null
  }
}
