package com.screenchoreography

import android.graphics.Color
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.ScreenChoreographyViewManagerInterface
import com.facebook.react.viewmanagers.ScreenChoreographyViewManagerDelegate

@ReactModule(name = ScreenChoreographyViewManager.NAME)
class ScreenChoreographyViewManager : SimpleViewManager<ScreenChoreographyView>(),
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
    return ScreenChoreographyView(context)
  }

  @ReactProp(name = "color")
  override fun setColor(view: ScreenChoreographyView?, color: Int?) {
    view?.setBackgroundColor(color ?: Color.TRANSPARENT)
  }

  companion object {
    const val NAME = "ScreenChoreographyView"
  }
}
