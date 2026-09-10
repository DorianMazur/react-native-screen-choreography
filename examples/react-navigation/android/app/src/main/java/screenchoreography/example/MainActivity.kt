package screenchoreography.example

import android.os.Bundle
import android.view.MotionEvent
import android.view.ViewTreeObserver
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {
  private var benchmarkFullyDrawnPending = false
  private var benchmarkFullyDrawnReported = false
  private val benchmarkFullyDrawnCallbacks = mutableListOf<() -> Unit>()

  fun reportBenchmarkFullyDrawn(onReported: () -> Unit) {
    if (benchmarkFullyDrawnReported) {
      onReported()
      return
    }
    benchmarkFullyDrawnCallbacks.add(onReported)
    if (benchmarkFullyDrawnPending) return
    benchmarkFullyDrawnPending = true
    val decor = window.decorView
    val observer = decor.viewTreeObserver
    val listener = object : ViewTreeObserver.OnDrawListener {
      override fun onDraw() {
        if (!benchmarkFullyDrawnReported) {
          benchmarkFullyDrawnReported = true
          // Emit inside an actual UI draw, before its RenderThread frame ends.
          // An acknowledgement posted after the last frame has no following
          // frame for StartupTimingMetric to associate with fully-drawn time.
          reportFullyDrawn()
        }
        // Android prohibits removing an OnDrawListener during draw dispatch.
        decor.post {
          if (observer.isAlive) observer.removeOnDrawListener(this)
          val callbacks = benchmarkFullyDrawnCallbacks.toList()
          benchmarkFullyDrawnCallbacks.clear()
          callbacks.forEach { it() }
        }
      }
    }
    observer.addOnDrawListener(listener)
    decor.postInvalidateOnAnimation()
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    if (BuildConfig.PERFORMANCE_BENCHMARK) BenchmarkRecorder.reset()
    super.onCreate(savedInstanceState)
  }

  override fun dispatchTouchEvent(event: MotionEvent): Boolean {
    if (BuildConfig.PERFORMANCE_BENCHMARK && event.actionMasked == MotionEvent.ACTION_UP) {
      BenchmarkRecorder.recordTouch(event.eventTime, event.x, event.y)
    }
    return super.dispatchTouchEvent(event)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "ScreenChoreographyExample"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      object : DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled) {
        override fun getLaunchOptions(): Bundle? {
          if (!BuildConfig.PERFORMANCE_BENCHMARK) return null
          val scenario = intent.getStringExtra("performanceScenario")
          if (scenario != "gallery") return null
          return Bundle().apply {
            putString("performanceScenario", scenario)
            putBoolean("performanceReactProfile", intent.getBooleanExtra("performanceReactProfile", false))
          }
        }
      }
}
