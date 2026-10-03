package com.screenchoreography

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.uimanager.events.Event
import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.viewmanagers.ScreenChoreographyViewManagerInterface
import com.facebook.react.viewmanagers.ScreenChoreographyViewManagerDelegate

@ReactModule(name = ScreenChoreographyViewManager.NAME)
class ScreenChoreographyViewManager : ViewGroupManager<ScreenChoreographyView>(),
  ScreenChoreographyViewManagerInterface<ScreenChoreographyView> {
  private val mDelegate: ViewManagerDelegate<ScreenChoreographyView>

  init {
    mDelegate = ScreenChoreographyViewManagerDelegate(this)
  }

  override fun getDelegate(): ViewManagerDelegate<ScreenChoreographyView>? {
    return mDelegate
  }

  override fun getName(): String {
    return NAME
  }

  public override fun createViewInstance(context: ThemedReactContext): ScreenChoreographyView {
    val view = ScreenChoreographyView(context)
    view.onPresentationReady = { timestamp, sessionId, stage ->
      val eventDispatcher = UIManagerHelper.getEventDispatcherForReactTag(context, view.id)
      val surfaceId = UIManagerHelper.getSurfaceId(context)
      eventDispatcher?.dispatchEvent(PresentationReadyEvent(surfaceId, view.id, timestamp, sessionId, stage,
        view.preparedAtMs, view.attachedAtMs, view.contentReadyAtMs, view.presentedAtMs))
    }
    return view
  }

  @ReactProp(name = "active", defaultBoolean = false)
  override fun setActive(view: ScreenChoreographyView?, active: Boolean) {
    view?.setActive(active)
  }

  @ReactProp(name = "foreground", defaultBoolean = false)
  override fun setForeground(view: ScreenChoreographyView?, foreground: Boolean) {
    view?.setForegroundLayer(foreground)
  }

  @ReactProp(name = "sessionId")
  override fun setSessionId(view: ScreenChoreographyView?, sessionId: String?) {
    view?.setSessionId(sessionId ?: "")
  }

  @ReactProp(name = "presentationRequested", defaultBoolean = false)
  override fun setPresentationRequested(view: ScreenChoreographyView?, value: Boolean) {
    view?.setPresentationRequested(value)
  }

  @ReactProp(name = "expectedHostNames")
  override fun setExpectedHostNames(view: ScreenChoreographyView?, names: ReadableArray?) {
    val values = mutableListOf<String>()
    if (names != null && names.size() <= 400) {
      for (index in 0 until names.size()) {
        val name = names.getString(index)
        if (name.isNullOrEmpty() || values.contains(name)) {
          values.clear()
          break
        }
        values.add(name)
      }
    }
    view?.setExpectedHostNames(values)
  }

  override fun prepare(view: ScreenChoreographyView?, sessionId: String?) {
    view?.prepare(sessionId ?: "")
  }

  override fun onDropViewInstance(view: ScreenChoreographyView) {
    view.cancelPresentationReady()
    super.onDropViewInstance(view)
  }

  override fun onAfterUpdateTransaction(view: ScreenChoreographyView) {
    super.onAfterUpdateTransaction(view)
    view.prepareFromReact()
  }

  override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any>? {
    return mapOf(
      "onPresentationReady" to mapOf("registrationName" to "onPresentationReady")
    )
  }

  private class PresentationReadyEvent(
    surfaceId: Int,
    viewId: Int,
    private val timestamp: Double,
    private val sessionId: String,
    private val stage: String,
    private val preparedAtMs: Double,
    private val attachedAtMs: Double,
    private val contentReadyAtMs: Double,
    private val presentedAtMs: Double
  ) : Event<PresentationReadyEvent>(surfaceId, viewId) {
    override fun getEventName() = "onPresentationReady"

    override fun getEventData(): WritableMap = Arguments.createMap().apply {
      putDouble("timestamp", timestamp)
      putString("sessionId", sessionId)
      putString("stage", stage)
      putDouble("preparedAtMs", preparedAtMs)
      putDouble("attachedAtMs", attachedAtMs)
      putDouble("contentReadyAtMs", contentReadyAtMs)
      putDouble("presentedAtMs", presentedAtMs)
    }
  }

  companion object {
    const val NAME = "ScreenChoreographyView"
  }
}
