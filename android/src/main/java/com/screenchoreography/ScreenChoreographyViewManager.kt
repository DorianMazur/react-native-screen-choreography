package com.screenchoreography

import com.facebook.react.bridge.Arguments
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
    view.onPresentationReady = { timestamp ->
      val eventDispatcher = UIManagerHelper.getEventDispatcherForReactTag(context, view.id)
      val surfaceId = UIManagerHelper.getSurfaceId(context)
      eventDispatcher?.dispatchEvent(PresentationReadyEvent(surfaceId, view.id, timestamp))
    }
    return view
  }

  @ReactProp(name = "active", defaultBoolean = false)
  override fun setActive(view: ScreenChoreographyView?, active: Boolean) {
    view?.setActive(active)
  }

  override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any>? {
    return mapOf(
      "onPresentationReady" to mapOf("registrationName" to "onPresentationReady")
    )
  }

  private class PresentationReadyEvent(
    surfaceId: Int,
    viewId: Int,
    private val timestamp: Double
  ) : Event<PresentationReadyEvent>(surfaceId, viewId) {
    override fun getEventName() = "onPresentationReady"

    override fun getEventData(): WritableMap = Arguments.createMap().apply {
      putDouble("timestamp", timestamp)
    }
  }

  companion object {
    const val NAME = "ScreenChoreographyView"
  }
}
