package com.screenchoreography

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.uimanager.events.Event
import com.facebook.react.viewmanagers.ScreenChoreographySnapshotViewManagerDelegate
import com.facebook.react.viewmanagers.ScreenChoreographySnapshotViewManagerInterface

@ReactModule(name = ScreenChoreographySnapshotViewManager.NAME)
class ScreenChoreographySnapshotViewManager : ViewGroupManager<ScreenChoreographySnapshotView>(),
  ScreenChoreographySnapshotViewManagerInterface<ScreenChoreographySnapshotView> {
  private val managerDelegate = ScreenChoreographySnapshotViewManagerDelegate(this)

  override fun getDelegate(): ViewManagerDelegate<ScreenChoreographySnapshotView> = managerDelegate

  override fun getName(): String = NAME

  override fun createViewInstance(context: ThemedReactContext): ScreenChoreographySnapshotView {
    val view = ScreenChoreographySnapshotView(context)
    view.onCaptured = { captureId, success ->
      UIManagerHelper.getEventDispatcherForReactTag(context, view.id)?.dispatchEvent(
        CapturedEvent(UIManagerHelper.getSurfaceId(context), view.id, captureId, success)
      )
    }
    return view
  }

  @ReactProp(name = "sourceTag", defaultInt = 0)
  override fun setSourceTag(view: ScreenChoreographySnapshotView?, sourceTag: Int) {
    view?.setSourceTag(sourceTag)
  }

  @ReactProp(name = "captureId")
  override fun setCaptureId(view: ScreenChoreographySnapshotView?, captureId: String?) {
    view?.setCaptureId(captureId)
  }

  @ReactProp(name = "stretch", defaultBoolean = false)
  override fun setStretch(view: ScreenChoreographySnapshotView?, stretch: Boolean) {
    view?.setStretch(stretch)
  }

  override fun onAfterUpdateTransaction(view: ScreenChoreographySnapshotView) {
    super.onAfterUpdateTransaction(view)
    view.scheduleCapture()
  }

  override fun onDropViewInstance(view: ScreenChoreographySnapshotView) {
    view.dispose()
    super.onDropViewInstance(view)
  }

  override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> = mapOf(
    "onCaptured" to mapOf("registrationName" to "onCaptured")
  )

  private class CapturedEvent(
    surfaceId: Int,
    viewId: Int,
    private val captureId: String,
    private val success: Boolean
  ) : Event<CapturedEvent>(surfaceId, viewId) {
    override fun getEventName() = "onCaptured"
    override fun getEventData(): WritableMap = Arguments.createMap().apply {
      putString("captureId", captureId)
      putBoolean("success", success)
    }
  }

  companion object {
    const val NAME = "ScreenChoreographySnapshotView"
  }
}
