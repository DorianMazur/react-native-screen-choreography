package com.screenchoreography

import com.facebook.proguard.annotations.DoNotStrip
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.turbomodule.core.interfaces.BindingsInstallerHolder
import com.facebook.react.turbomodule.core.interfaces.TurboModuleWithJSIBindings

/** Installs read-only access to completed Fabric mounts in the JS runtime. */
@ReactModule(name = ScreenChoreographyPreparationModule.NAME)
class ScreenChoreographyPreparationModule(context: ReactApplicationContext) :
  NativeChoreographyPreparationSpec(context), TurboModuleWithJSIBindings {
  @DoNotStrip
  external override fun getBindingsInstaller(): BindingsInstallerHolder

  override fun install(): Boolean = true

  companion object {
    const val NAME = "ScreenChoreographyPreparation"
    init { System.loadLibrary("screenchoreography") }
  }
}
