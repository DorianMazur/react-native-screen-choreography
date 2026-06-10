package com.screenchoreography

import android.graphics.Bitmap
import android.graphics.Canvas
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.common.UIManagerType
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import java.util.concurrent.Executors

/**
 * TurboModule that captures per-element bitmap snapshots for the
 * choreography overlay. Snapshots are written as PNG files into a dedicated
 * cache subdirectory and released explicitly by the JS coordinator when a
 * transition session ends.
 */
class ScreenChoreographySnapshotModule(reactContext: ReactApplicationContext) :
  NativeScreenChoreographySnapshotSpec(reactContext) {

  private val ioExecutor = Executors.newSingleThreadExecutor()

  override fun getName(): String = NAME

  override fun captureView(reactTag: Double, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      val bitmap: Bitmap
      val widthDp: Double
      val heightDp: Double
      try {
        val uiManager =
          UIManagerHelper.getUIManager(reactApplicationContext, UIManagerType.FABRIC)
        val view = uiManager?.resolveView(reactTag.toInt())
        if (view == null || view.width <= 0 || view.height <= 0) {
          promise.reject(
            "snapshot_unavailable",
            "View not found, detached, or has zero size"
          )
          return@runOnUiThread
        }

        // Drawing the subtree directly (instead of a window-level PixelCopy)
        // ignores ancestor alpha, so hidden pending-target elements still
        // produce a faithful bitmap.
        bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
        view.draw(Canvas(bitmap))

        val density = view.resources.displayMetrics.density
        widthDp = view.width / density.toDouble()
        heightDp = view.height / density.toDouble()
      } catch (error: Throwable) {
        promise.reject("snapshot_failed", error)
        return@runOnUiThread
      }

      // Encode and write off the UI thread; only the capture must be on it.
      ioExecutor.execute {
        try {
          val directory = snapshotDirectory()
          directory.mkdirs()
          val file = File(directory, "${UUID.randomUUID()}.png")
          FileOutputStream(file).use { stream ->
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
          }
          promise.resolve(
            Arguments.createMap().apply {
              putString("uri", Uri.fromFile(file).toString())
              putDouble("width", widthDp)
              putDouble("height", heightDp)
            }
          )
        } catch (error: Throwable) {
          promise.reject("snapshot_failed", error)
        } finally {
          bitmap.recycle()
        }
      }
    }
  }

  override fun releaseSnapshot(uri: String) {
    ioExecutor.execute {
      try {
        val path = Uri.parse(uri).path ?: return@execute
        val file = File(path)
        // Only delete files inside our own snapshot directory.
        val directoryPath = snapshotDirectory().canonicalPath + File.separator
        if (file.canonicalPath.startsWith(directoryPath)) {
          file.delete()
        }
      } catch (_: Throwable) {
        // Best-effort cleanup; the OS reclaims the cache directory eventually.
      }
    }
  }

  override fun invalidate() {
    super.invalidate()
    ioExecutor.shutdown()
  }

  private fun snapshotDirectory(): File =
    File(reactApplicationContext.cacheDir, SNAPSHOT_DIRECTORY)

  companion object {
    const val NAME = "ScreenChoreographySnapshot"
    private const val SNAPSHOT_DIRECTORY = "screen-choreography-snapshots"
  }
}
