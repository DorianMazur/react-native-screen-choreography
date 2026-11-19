package com.screenchoreography

import android.graphics.Canvas
import android.view.View
import android.view.ViewTreeObserver
import android.widget.HorizontalScrollView
import android.widget.ScrollView
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.uimanager.PointerEvents
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.ScreenChoreographyScrollTrackManagerDelegate
import com.facebook.react.viewmanagers.ScreenChoreographyScrollTrackManagerInterface
import com.facebook.react.views.scroll.ReactScrollView
import com.facebook.react.views.view.ReactViewGroup
import java.lang.ref.WeakReference

private data class ScrollAnchor(val tag: Int, val x: Double, val y: Double,
  val xx: Double, val xy: Double, val yx: Double, val yy: Double) {
  var view: WeakReference<View>? = null
}

class ScreenChoreographyScrollTrack(context: ThemedReactContext) : ReactViewGroup(context) {
  init {
    pointerEvents = PointerEvents.NONE
    clipChildren = false
    clipToPadding = false
  }

  private var anchors = emptyList<ScrollAnchor>()
  private var following = false
  private var observer: ViewTreeObserver? = null
  private val beforeDraw = ViewTreeObserver.OnPreDrawListener {
    // The list can advance its fling during draw, after pre-draw listeners.
    // Record the overlay after the list has drawn this frame.
    invalidate()
    true
  }

  fun setAnchors(values: ReadableArray?) {
    val density = resources.displayMetrics.density
    anchors = (0 until (values?.size() ?: 0)).mapNotNull { index ->
      val a = values?.getMap(index) ?: return@mapNotNull null
      ScrollAnchor(a.getInt("tag"), a.getDouble("x") * density, a.getDouble("y") * density,
        a.getDouble("xx"), a.getDouble("xy"), a.getDouble("yx"), a.getDouble("yy"))
    }
    updateObserver()
  }

  fun setFollowing(value: Boolean) {
    following = value
    updateObserver()
  }

  private fun updateObserver() {
    if (following && isAttachedToWindow && anchors.isNotEmpty()) {
      if (observer == null) {
        observer = viewTreeObserver
        observer?.addOnPreDrawListener(beforeDraw)
      }
    } else {
      removeObserver()
    }
    invalidate()
  }

  override fun dispatchDraw(canvas: Canvas) {
    if (!following || anchors.isEmpty()) {
      super.dispatchDraw(canvas)
      return
    }
    var dx = 0.0
    var dy = 0.0
    for (anchor in anchors) {
      var view = anchor.view?.get()
      if (view == null || view.id != anchor.tag || view.windowToken != windowToken) {
        view = rootView.findViewById<View>(anchor.tag)
        if (view !is ScrollView && view !is HorizontalScrollView) continue
        anchor.view = WeakReference(view)
      }
      val x = view.scrollX - anchor.x
      val scrollAway = (view as? ReactScrollView)?.reactScrollViewScrollState?.scrollAwayPaddingTop ?: 0
      val y = view.scrollY - scrollAway - anchor.y
      dx += anchor.xx * x + anchor.yx * y
      dy += anchor.xy * x + anchor.yy * y
    }
    val save = canvas.save()
    canvas.translate(-dx.toFloat(), -dy.toFloat())
    super.dispatchDraw(canvas)
    canvas.restoreToCount(save)
  }

  private fun removeObserver() {
    observer?.takeIf { it.isAlive }?.removeOnPreDrawListener(beforeDraw)
    observer = null
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    updateObserver()
  }

  override fun onDetachedFromWindow() {
    removeObserver()
    super.onDetachedFromWindow()
  }
}

class ScreenChoreographyScrollTrackManager : ViewGroupManager<ScreenChoreographyScrollTrack>(),
  ScreenChoreographyScrollTrackManagerInterface<ScreenChoreographyScrollTrack> {
  private val delegate = ScreenChoreographyScrollTrackManagerDelegate(this)
  override fun getDelegate(): ViewManagerDelegate<ScreenChoreographyScrollTrack> = delegate
  override fun getName() = "ScreenChoreographyScrollTrack"
  public override fun createViewInstance(context: ThemedReactContext) = ScreenChoreographyScrollTrack(context)

  @ReactProp(name = "anchors")
  override fun setAnchors(view: ScreenChoreographyScrollTrack, anchors: ReadableArray?) = view.setAnchors(anchors)

  @ReactProp(name = "following")
  override fun setFollowing(view: ScreenChoreographyScrollTrack, following: Boolean) = view.setFollowing(following)
}
