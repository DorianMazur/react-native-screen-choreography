package com.screenchoreography

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.uimanager.ViewManager

class ScreenChoreographyViewPackage : BaseReactPackage() {
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return listOf(ScreenChoreographyViewManager(), ScreenChoreographySnapshotViewManager())
  }

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == ScreenChoreographyPreparationModule.NAME) ScreenChoreographyPreparationModule(reactContext) else null

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf(ScreenChoreographyPreparationModule.NAME to ReactModuleInfo(
      ScreenChoreographyPreparationModule.NAME,
      ScreenChoreographyPreparationModule::class.java.name,
      false,
      false,
      false,
      true,
    ))
  }
}
