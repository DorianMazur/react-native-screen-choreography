package com.screenchoreography

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager

class ScreenChoreographyViewPackage : BaseReactPackage() {
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return listOf(ScreenChoreographyViewManager())
  }

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    when (name) {
      ScreenChoreographySnapshotModule.NAME -> ScreenChoreographySnapshotModule(reactContext)
      else -> null
    }

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf(
      ScreenChoreographySnapshotModule.NAME to ReactModuleInfo(
        ScreenChoreographySnapshotModule.NAME,
        ScreenChoreographySnapshotModule::class.java.name,
        false,
        false,
        false,
        true
      )
    )
  }
}
