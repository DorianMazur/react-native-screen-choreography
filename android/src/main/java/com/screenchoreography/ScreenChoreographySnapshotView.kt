package com.screenchoreography

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.view.SurfaceView
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.views.view.ReactViewGroup
import java.lang.ref.WeakReference
import java.util.WeakHashMap

/** Owns only a bitmap; the outgoing React tree can unmount after capture. */
class ScreenChoreographySnapshotView(context: Context) : ReactViewGroup(context) {
  var onCaptured: ((String, Boolean) -> Unit)? = null

  private var sourceTag = 0
  private var captureId = ""
  private var stretch = false
  private var generation = 0
  private var attempted = false
  private var pendingAck: Pair<Int, String>? = null
  private var snapshot: Bitmap? = null
  private var source: WeakReference<View>? = null
  private var sourceOwner: Any? = null
  private var sourceAlpha = 1f
  private val sourceFrame = RectF()
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)

  init {
    isClickable = false
    isFocusable = false
    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
    setWillNotDraw(false)
  }

  fun setSourceTag(value: Int) {
    if (sourceTag == value) return
    releaseCapture()
    sourceTag = value
  }

  fun setCaptureId(value: String?) {
    val next = value ?: ""
    if (captureId == next) return
    releaseCapture()
    captureId = next
  }

  fun setStretch(value: Boolean) {
    stretch = value
    invalidate()
  }

  // Called after the complete prop transaction, never between sourceTag and ID.
  fun scheduleCapture() {
    if (attempted || sourceTag <= 0 || captureId.isEmpty() || !isAttachedToWindow || width <= 0 || height <= 0) return
    attempted = true
    val requestGeneration = generation
    val requestId = captureId
    post {
      if (requestGeneration != generation || !isAttachedToWindow) return@post
      capture(requestGeneration, requestId)
    }
  }

  private fun capture(requestGeneration: Int, requestId: String) {
    val reactContext = context as? ReactContext
    val target = try {
      reactContext?.let { UIManagerHelper.getUIManagerForReactTag(it, sourceTag)?.resolveView(sourceTag) }
    } catch (_: RuntimeException) {
      null
    }
    if (target == null || target === this || !target.isAttachedToWindow || target.windowToken != windowToken ||
      target.rootView !== rootView || target.width <= 0 || target.height <= 0 || target.visibility != View.VISIBLE ||
      isAncestor(target, this) || isAncestor(this, target) || sourceOwners.containsKey(target) ||
      isSecureWindow(context, target) || hasExternalSurface(target)) {
      emitCaptured(false, requestGeneration, requestId)
      return
    }

    var bitmap: Bitmap? = null
    try {
      bitmap = Bitmap.createBitmap(target.width, target.height, Bitmap.Config.ARGB_8888)
      target.draw(Canvas(bitmap))
    } catch (_: RuntimeException) {
      bitmap?.recycle()
      emitCaptured(false, requestGeneration, requestId)
      return
    } catch (_: OutOfMemoryError) {
      bitmap?.recycle()
      emitCaptured(false, requestGeneration, requestId)
      return
    }
    if (requestGeneration != generation || !target.isAttachedToWindow || target.windowToken != windowToken) {
      bitmap.recycle()
      return
    }
    val targetPosition = IntArray(2)
    val ownPosition = IntArray(2)
    target.getLocationInWindow(targetPosition)
    getLocationInWindow(ownPosition)
    sourceFrame.set(
      (targetPosition[0] - ownPosition[0]).toFloat(),
      (targetPosition[1] - ownPosition[1]).toFloat(),
      (targetPosition[0] - ownPosition[0] + target.width).toFloat(),
      (targetPosition[1] - ownPosition[1] + target.height).toFloat()
    )
    snapshot = bitmap
    source = WeakReference(target)
    sourceAlpha = target.alpha
    sourceOwner = Any().also { sourceOwners[target] = it }
    // Bitmap ownership and hiding change in one UI traversal. Never hide on a
    // failed capture, and acknowledge only after the bitmap has been drawn.
    target.alpha = 0f
    pendingAck = requestGeneration to requestId
    invalidate()
  }

  override fun dispatchDraw(canvas: Canvas) {
    super.dispatchDraw(canvas)
    val bitmap = snapshot ?: return
    if (bitmap.isRecycled) return
    val destination = if (stretch) RectF(0f, 0f, width.toFloat(), height.toFloat()) else sourceFrame
    canvas.drawBitmap(bitmap, null, destination, paint)
    val ack = pendingAck ?: return
    pendingAck = null
    post { emitCaptured(true, ack.first, ack.second) }
  }

  private fun emitCaptured(success: Boolean, requestGeneration: Int, requestId: String) {
    if (requestGeneration == generation && isAttachedToWindow) onCaptured?.invoke(requestId, success)
  }

  fun dispose() {
    releaseCapture()
    onCaptured = null
  }

  private fun releaseCapture() {
    generation += 1
    pendingAck = null
    val target = source?.get()
    if (target != null && sourceOwners[target] === sourceOwner) {
      // A recycled native object can already belong to a different React tag.
      if (target.id == sourceTag) target.alpha = sourceAlpha
      sourceOwners.remove(target)
    }
    source = null
    sourceOwner = null
    // Let HWUI release any recorded draw commands before the bitmap is GC'd.
    // Recycling here could invalidate a bitmap still referenced by a RenderNode.
    snapshot = null
    attempted = false
    invalidate()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    scheduleCapture()
  }

  override fun onDetachedFromWindow() {
    releaseCapture()
    super.onDetachedFromWindow()
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    super.onLayout(changed, left, top, right, bottom)
    scheduleCapture()
  }

  companion object {
    private val sourceOwners = WeakHashMap<View, Any>()

    private fun isAncestor(ancestor: View, view: View): Boolean {
      var parent = view.parent
      while (parent is View) {
        if (parent === ancestor) return true
        parent = parent.parent
      }
      return false
    }

    // Software View.draw cannot faithfully retain separate compositor surfaces.
    // Declining the optimization keeps video/secure surfaces on the safe path.
    private fun hasExternalSurface(view: View): Boolean {
      if (view is SurfaceView || view is TextureView) return true
      if (view is ViewGroup) {
        for (index in 0 until view.childCount) {
          if (hasExternalSurface(view.getChildAt(index))) return true
        }
      }
      return false
    }

    private fun isSecureWindow(context: Context, source: View): Boolean {
      // A dialog can have FLAG_SECURE independently of its hosting Activity.
      val windowFlags = (source.rootView.layoutParams as? WindowManager.LayoutParams)?.flags ?: 0
      if (windowFlags and WindowManager.LayoutParams.FLAG_SECURE != 0) return true
      var current = context
      while (current is ContextWrapper) {
        if (current is Activity) {
          return current.window.attributes.flags and WindowManager.LayoutParams.FLAG_SECURE != 0
        }
        val next = current.baseContext
        if (next === current) break
        current = next
      }
      val activity = (context as? ReactContext)?.currentActivity
      val flags = activity?.window?.attributes?.flags ?: return false
      return flags and WindowManager.LayoutParams.FLAG_SECURE != 0
    }
  }
}
