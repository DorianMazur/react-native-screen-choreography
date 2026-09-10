package com.screenchoreography

import android.graphics.RectF
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.Choreographer
import android.view.View
import android.view.ViewTreeObserver
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.UIManagerHelper
import java.lang.ref.WeakReference
import kotlin.math.abs

/** Read-only mounted-layout barrier. This never captures, hides, or moves a view. */
@ReactModule(name = ScreenChoreographyPreparationModule.NAME)
class ScreenChoreographyPreparationModule(
  private val context: ReactApplicationContext,
) : NativeChoreographyPreparationSpec(context) {
  private val mainHandler = Handler(Looper.getMainLooper())
  private val requests = mutableMapOf<String, LayoutRequest>()
  @Volatile private var invalidated = false

  override fun awaitLayout(
    requestId: String,
    screenTag: Double,
    viewTags: ReadableArray,
    timeoutMs: Double,
    promise: Promise,
  ) {
    val startedAt = SystemClock.uptimeMillis()
    val rootTag = validTag(screenTag)
    val tags = try {
      (0 until viewTags.size()).map { validTag(viewTags.getDouble(it)) }
    } catch (_: RuntimeException) {
      listOf(null)
    }
    mainHandler.post {
      requests[requestId]?.finish(false)
      if (invalidated || requestId.isEmpty() || rootTag == null || tags.any { it == null } ||
        !timeoutMs.isFinite() || timeoutMs <= 0) {
        resolve(promise, false, 0, startedAt)
        return@post
      }
      val request = LayoutRequest(
        requestId, rootTag, tags.filterNotNull().distinct(),
        startedAt, timeoutMs.coerceAtMost(500.0).toLong().coerceAtLeast(1), promise,
      )
      requests[requestId] = request
      request.start()
    }
  }

  override fun cancel(requestId: String) {
    mainHandler.post { requests[requestId]?.finish(false) }
  }

  override fun invalidate() {
    invalidated = true
    mainHandler.post { requests.values.toList().forEach { it.finish(false) } }
    super.invalidate()
  }

  private fun resolveView(tag: Int): View? = try {
    UIManagerHelper.getUIManagerForReactTag(context, tag)?.resolveView(tag)
  } catch (_: RuntimeException) {
    null
  }

  private inner class LayoutRequest(
    val id: String,
    private val rootTag: Int,
    private val tags: List<Int>,
    private val startedAt: Long,
    timeoutMs: Long,
    private val promise: Promise,
  ) : Choreographer.FrameCallback, ViewTreeObserver.OnPreDrawListener, View.OnAttachStateChangeListener {
    private val deadline = startedAt + timeoutMs
    private val choreographer = Choreographer.getInstance()
    private val epsilon = context.resources.displayMetrics.density * 0.5f
    private val pinnedViews = mutableMapOf<Int, WeakReference<View>>()
    private var root: WeakReference<View>? = null
    private var observerHost: WeakReference<View>? = null
    private var observer: ViewTreeObserver? = null
    private var previous: List<RectF>? = null
    private var sampleCount = 0
    private var stableCount = 0
    private var frameTimeNanos = 0L
    private var lastSampleFrame = -1L
    private var frameScheduled = false
    private var done = false
    private val timeout = Runnable { finish(false) }

    fun start() {
      if (SystemClock.uptimeMillis() >= deadline) {
        finish(false)
        return
      }
      mainHandler.postDelayed(timeout, deadline - SystemClock.uptimeMillis())
      scheduleFrame()
    }

    private fun scheduleFrame() {
      if (!done && !frameScheduled) {
        frameScheduled = true
        choreographer.postFrameCallback(this)
      }
    }

    override fun doFrame(frameTimeNanos: Long) {
      frameScheduled = false
      if (done) return
      if (invalidated || SystemClock.uptimeMillis() >= deadline) {
        finish(false)
        return
      }
      this.frameTimeNanos = frameTimeNanos
      val currentRoot = resolveView(rootTag)
      if (root != null && (currentRoot !== root?.get() || currentRoot?.isAttachedToWindow != true)) {
        finish(false)
        return
      }
      if (currentRoot != null && currentRoot.id == rootTag && currentRoot.isAttachedToWindow && currentRoot.windowToken != null) {
        if (root == null) {
          root = WeakReference(currentRoot)
          currentRoot.addOnAttachStateChangeListener(this)
          val host = currentRoot.rootView
          observerHost = WeakReference(host)
          observer = host.viewTreeObserver.also { it.addOnPreDrawListener(this) }
        }
        val host = observerHost?.get()
        if (host == null || currentRoot.rootView !== host || observer?.isAlive != true) {
          finish(false)
          return
        }
        // Already in the animation phase: invalidate now so this frame can traverse.
        // Posting another animation callback would defer an idle window by one frame.
        // Pre-draw observes the whole window, including opacity-zero target subtrees.
        host.invalidate()
      }
      scheduleFrame()
    }

    override fun onPreDraw(): Boolean {
      if (done || frameTimeNanos == 0L || lastSampleFrame == frameTimeNanos) return true
      if (invalidated || SystemClock.uptimeMillis() >= deadline) {
        finish(false)
        return true
      }
      lastSampleFrame = frameTimeNanos
      sampleCount += 1
      val currentRoot = root?.get()
      if (currentRoot == null || currentRoot.id != rootTag || resolveView(rootTag) !== currentRoot || !currentRoot.isAttachedToWindow ||
        currentRoot.windowToken == null || currentRoot.rootView !== observerHost?.get()) {
        finish(false)
        return true
      }
      val views = mutableListOf(currentRoot)
      for (tag in tags) {
        val view = resolveView(tag)
        val pinned = pinnedViews[tag]
        if (pinned != null && (view !== pinned.get() || view?.isAttachedToWindow != true)) {
          finish(false)
          return true
        }
        if (view == null || view.id != tag || !view.isAttachedToWindow ||
          view.windowToken != currentRoot.windowToken || view.rootView !== currentRoot.rootView ||
          !isDescendant(view, currentRoot)) {
          if (pinned != null) {
            finish(false)
            return true
          }
          previous = null
          stableCount = 0
          return true
        }
        if (pinned == null) pinnedViews[tag] = WeakReference(view)
        views.add(view)
      }
      if (views.any { it.width <= 0 || it.height <= 0 || hasPendingLayout(it) }) {
        previous = null
        stableCount = 0
        return true
      }
      val geometry = views.map(::windowRect)
      if (geometry.any { !it.left.isFinite() || !it.top.isFinite() || !it.right.isFinite() || !it.bottom.isFinite() || it.width() <= 0 || it.height() <= 0 }) {
        previous = null
        stableCount = 0
        return true
      }
      val old = previous
      stableCount = if (old != null && old.size == geometry.size && geometry.indices.all { close(old[it], geometry[it], epsilon) }) stableCount + 1 else 1
      previous = geometry
      if (stableCount >= 2) finish(true)
      return true
    }

    override fun onViewAttachedToWindow(view: View) = Unit

    override fun onViewDetachedFromWindow(view: View) {
      finish(false)
    }

    fun finish(ready: Boolean) {
      if (done) return
      done = true
      mainHandler.removeCallbacks(timeout)
      if (frameScheduled) choreographer.removeFrameCallback(this)
      frameScheduled = false
      observer?.takeIf { it.isAlive }?.removeOnPreDrawListener(this)
      observer = null
      root?.get()?.removeOnAttachStateChangeListener(this)
      root = null
      observerHost = null
      pinnedViews.clear()
      previous = null
      if (requests[id] === this) requests.remove(id)
      resolve(promise, ready, sampleCount, startedAt)
    }
  }

  companion object {
    const val NAME = "ScreenChoreographyPreparation"

    private fun validTag(value: Double): Int? =
      if (value.isFinite() && value > 0 && value <= Int.MAX_VALUE && value == value.toInt().toDouble()) value.toInt() else null

    private fun resolve(promise: Promise, ready: Boolean, samples: Int, startedAt: Long) {
      promise.resolve(Arguments.createMap().apply {
        putBoolean("ready", ready)
        putDouble("sampleCount", samples.toDouble())
        putDouble("elapsedMs", (SystemClock.uptimeMillis() - startedAt).toDouble())
      })
    }

    private fun isDescendant(view: View, root: View): Boolean {
      var current: View? = view
      while (current != null) {
        if (current === root) return true
        current = current.parent as? View
      }
      return false
    }

    private fun hasPendingLayout(view: View): Boolean {
      var current: View? = view
      while (current != null) {
        if (current.isLayoutRequested) return true
        current = current.parent as? View
      }
      return false
    }

    /** Only used for convergence, never returned as the public measurement contract. */
    private fun windowRect(view: View): RectF {
      val rect = RectF(0f, 0f, view.width.toFloat(), view.height.toFloat())
      var current = view
      while (true) {
        current.matrix.mapRect(rect)
        val parent = current.parent as? View
        if (parent == null) {
          val origin = floatArrayOf(0f, 0f)
          current.matrix.mapPoints(origin)
          val location = IntArray(2)
          current.getLocationInWindow(location)
          rect.offset(location[0] - origin[0], location[1] - origin[1])
          return rect
        }
        rect.offset((current.left - parent.scrollX).toFloat(), (current.top - parent.scrollY).toFloat())
        current = parent
      }
    }

    private fun close(first: RectF, second: RectF, epsilon: Float): Boolean =
      abs(first.left - second.left) <= epsilon && abs(first.top - second.top) <= epsilon &&
        abs(first.width() - second.width()) <= epsilon && abs(first.height() - second.height()) <= epsilon
  }
}
