package com.screenchoreography

import android.content.Context
import android.graphics.Canvas
import android.os.Handler
import android.os.Looper
import android.os.Message
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
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
  // Deactivation can precede the commit that returns retained content, so the
  // live container keeps drawing until its hosts are empty (bounded by frames).
  private var dismissing = false
  private val mainHandler = Handler(Looper.getMainLooper())
  private val contentReadiness = ViewTreeObserver.OnPreDrawListener {
    if (active && prepared) {
      // Readiness gates only startup. A renderer may intentionally fade a pair
      // out after presentation without hiding the other pairs in the host.
      val ready = presentationAcknowledged || transitionHostsAreReady(true)
      alpha = if (ready) 1f else 0f
      if (!ready && SystemClock.uptimeMillis() < attachmentDeadline) postInvalidateOnAnimation()
    }
    true
  }

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
      val dismissalId = ++dismissalRequestId
      if (width <= 0 || height <= 0 || !holdsTransferredContent()) {
        finishDismissal()
        return
      }
      // A snapshot would keep painting content that has already moved, so draw
      // the live hosts until the returning commit empties them.
      dismissing = true
      alpha = 1f
      visibility = View.VISIBLE
      invalidate()
      // Queue against actual frame boundaries. Handler.post can run twice
      // before the next draw and release the bridge frame too early.
      postOnAnimation {
        postOnAnimation release@{
          if (active || dismissalId != dismissalRequestId) return@release
          finishDismissal()
        }
      }
      return
    }

    dismissalRequestId += 1
    dismissing = false
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
    val replayPresentation = presentationAcknowledged
    val replayAttachment = attachmentAcknowledged
    if (!prepared) {
      prepared = true
      attachmentDeadline = SystemClock.uptimeMillis() + 1000L
    }
    updateActive(true)
    acknowledgeAttachmentIfReady()
    if (replayPresentation && active && isAttachedToWindow && windowToken != null &&
      transitionHostsAreReady(true)) {
      onPresentationReady?.invoke(SystemClock.uptimeMillis().toDouble(), sessionId, "presented")
    } else if (replayAttachment && active && isAttachedToWindow && windowToken != null &&
      SystemClock.uptimeMillis() < attachmentDeadline && transitionHostsAreReady(false)) {
      onPresentationReady?.invoke(SystemClock.uptimeMillis().toDouble(), sessionId, "attached")
    }
    if (!attachmentAcknowledged && SystemClock.uptimeMillis() < attachmentDeadline) postInvalidateOnAnimation()
  }

  fun prepareFromReact() {
    if (reactActive && !foregroundLayer && expectedHostNames.isNotEmpty()) prepare(sessionId)
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
    setPresentationRequested(true)
  }

  fun cancelPresentationReady() {
    // A recycled view must reject acknowledgments queued for its previous owner.
    presentationRequestId += 1
    pendingPresentationAck = false
    pendingPresentationSessionId = ""
    mainHandler.removeCallbacksAndMessages(null)
  }

  override fun dispatchDraw(canvas: Canvas) {
    if (dismissing) {
      // Content returned in this traversal draws at its destination instead.
      if (!holdsTransferredContent()) {
        val dismissalId = dismissalRequestId
        post { if (!active && dismissalId == dismissalRequestId) finishDismissal() }
        return
      }
      super.dispatchDraw(canvas)
      postInvalidateOnAnimation()
      return
    }
    // Content and receiving hosts arrive in one Fabric transaction. Never paint
    // a partially populated renderer if an attachment is still pending.
    if (prepared && active && !presentationAcknowledged && !transitionHostsAreReady(true)) {
      if (SystemClock.uptimeMillis() < attachmentDeadline) postInvalidateOnAnimation()
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
      // Run after this draw traversal, but bypass the synchronization barrier
      // installed by invalidate() for the next frame. A normal Handler.post
      // unnecessarily waits for that next traversal before acknowledging this one.
      val acknowledgement = Message.obtain(mainHandler, Runnable {
        if (active && requestId == presentationRequestId && presentedSessionId == sessionId && windowToken != null) {
          if (!transitionHostsAreReady(true)) {
            if (SystemClock.uptimeMillis() < presentationDeadline) {
              pendingPresentationAck = true
              postInvalidateOnAnimation()
            }
            return@Runnable
          }
          presentationAcknowledged = true
          onPresentationReady?.invoke(SystemClock.uptimeMillis().toDouble(), presentedSessionId, "presented")
        }
      })
      acknowledgement.isAsynchronous = true
      acknowledgement.sendToTarget()
    }
  }

  private fun finishDismissal() {
    dismissing = false
    alpha = 0f
    visibility = View.INVISIBLE
    invalidate()
  }

  private fun holdsTransferredContent(): Boolean {
    fun visit(view: View): Boolean {
      val name = view.getTag(R.id.view_tag_native_id) as? String
      if (name != null && name.endsWith(":content")) return true
      if (view is ViewGroup) {
        for (index in 0 until view.childCount) if (visit(view.getChildAt(index))) return true
      }
      return false
    }
    for (index in 0 until childCount) if (visit(getChildAt(index))) return true
    return false
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    viewTreeObserver.addOnPreDrawListener(contentReadiness)
    if (active) {
      acknowledgeAttachmentIfReady()
      schedulePresentationReady()
    }
  }

  override fun onDetachedFromWindow() {
    if (viewTreeObserver.isAlive) viewTreeObserver.removeOnPreDrawListener(contentReadiness)
    super.onDetachedFromWindow()
    cancelPresentationReady()
    attachmentAcknowledged = false
    dismissalRequestId += 1
    dismissing = false
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

    // If drawing is delayed, the provider's one-second timeout is the safety net.
  }

  private fun transitionHostsAreReady(requireContent: Boolean): Boolean {
    if (expectedHostNames.isEmpty()) return false
    val remaining = expectedHostNames.toMutableSet()
    fun visit(view: View) {
      val name = view.getTag(R.id.view_tag_native_id) as? String
      val host = view.parent as? ViewGroup
      // The marker is a child of the public PortalHost, never transferred content.
      // Renderer alpha is app motion, not readiness: backward sessions start where
      // renderers may be fully faded, and our own alpha is the reveal gate.
      if (name != null && remaining.contains(name) && host != null && host.isAttachedToWindow &&
        host.windowToken == windowToken && host.width > 0 && host.height > 0 &&
        (!requireContent || hostContainsContent(host, name))) {
        remaining.remove(name)
      }
      if (remaining.isNotEmpty() && view is ViewGroup) {
        for (index in 0 until view.childCount) visit(view.getChildAt(index))
      }
    }
    visit(this)
    return remaining.isEmpty()
  }

  private fun hostContainsContent(host: ViewGroup, hostName: String): Boolean {
    // Retained content may have no native views of its own; its portal always
    // carries a marker named after the receiving host.
    val contentId = "$hostName:content"
    for (index in 0 until host.childCount) {
      if (host.getChildAt(index).getTag(R.id.view_tag_native_id) == contentId) return true
    }
    return false
  }
}
