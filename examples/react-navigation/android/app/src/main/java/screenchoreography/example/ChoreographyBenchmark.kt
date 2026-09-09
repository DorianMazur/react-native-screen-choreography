package screenchoreography.example

import android.os.Build
import android.os.Process
import android.os.SystemClock
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import java.io.File
import org.json.JSONArray
import org.json.JSONObject

/** Example-only diagnostics. Registered exclusively in the profileable benchmark build. */
class ChoreographyBenchmarkPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    listOf(ChoreographyBenchmarkModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

private class ChoreographyBenchmarkModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName(): String = "ChoreographyBenchmark"

  @ReactMethod
  fun recordSample(json: String) {
    BenchmarkRecorder.recordSample(JSONObject(json))
  }

  @ReactMethod
  fun acknowledgeInput(probe: String) {
    BenchmarkRecorder.acknowledgeInput(probe)
  }

  @ReactMethod
  fun reportFullyDrawn() {
    (reactApplicationContext.currentActivity as? MainActivity)?.let { activity ->
      activity.runOnUiThread { activity.reportBenchmarkFullyDrawn() }
    }
  }

  @ReactMethod
  fun finishRun(json: String, promise: Promise) {
    try {
      val run = JSONObject(json)
      val output = File(checkNotNull(reactApplicationContext.getExternalFilesDir(null)) {
        "App external files directory is unavailable"
      }, "performance")
      check(output.isDirectory || output.mkdirs()) { "Cannot create benchmark output directory" }
      val runId = run.optString("runId", "run").replace(Regex("[^A-Za-z0-9_.-]"), "_").take(100)
      val exportId = "$runId-${Process.myPid()}-${SystemClock.elapsedRealtimeNanos()}"
      val file = File(output, "$exportId.json")
      // JS counters restart on a cold process launch. Namespace the exported
      // record itself as well as its filename so reports cannot double count it.
      run.put("jsRunId", run.optString("runId"))
      run.put("runId", exportId)
      BenchmarkRecorder.appendTo(run)
      file.writeText(run.toString(2))
      BenchmarkRecorder.reset()
      promise.resolve(file.absolutePath)
    } catch (error: Exception) {
      promise.reject("BENCHMARK_EXPORT_FAILED", error)
    }
  }
}

/** Event timestamps and acknowledgement receipt use the same Android uptime clock. */
internal object BenchmarkRecorder {
  private const val MAX_SAMPLES = 20000
  private val touches = mutableListOf<JSONObject>()
  private val acknowledgements = mutableListOf<JSONObject>()
  private val samples = mutableListOf<JSONObject>()
  private var latestTouchUptimeMs: Long? = null
  private var droppedSamples = 0

  @Synchronized
  fun reset() {
    touches.clear()
    acknowledgements.clear()
    samples.clear()
    latestTouchUptimeMs = null
    droppedSamples = 0
  }

  @Synchronized
  fun recordTouch(eventUptimeMs: Long, x: Float, y: Float) {
    latestTouchUptimeMs = eventUptimeMs
    add(touches, JSONObject().apply {
      put("kind", "activity-action-up")
      put("eventUptimeMs", eventUptimeMs)
      put("dispatchUptimeMs", SystemClock.uptimeMillis())
      put("x", x.toDouble())
      put("y", y.toDouble())
    })
  }

  @Synchronized
  fun acknowledgeInput(probe: String) {
    val ackUptimeMs = SystemClock.uptimeMillis()
    val eventUptimeMs = latestTouchUptimeMs
    add(acknowledgements, JSONObject().apply {
      put("probe", probe)
      put("eventUptimeMs", eventUptimeMs ?: JSONObject.NULL)
      put("nativeAckUptimeMs", ackUptimeMs)
      put("touchToNativeAckMs", eventUptimeMs?.let { ackUptimeMs - it } ?: JSONObject.NULL)
      put("meaning", "Injected tap event to native receipt of its JS acknowledgement; includes JS and module queue delay, not earliest possible input readiness")
    })
  }

  @Synchronized
  fun recordSample(sample: JSONObject) {
    sample.put("nativeReceiptUptimeMs", SystemClock.uptimeMillis())
    add(samples, sample)
  }

  @Synchronized
  fun appendTo(run: JSONObject) {
    if (!run.has("samples") && samples.isNotEmpty()) run.put("samples", JSONArray(samples))
    run.put("native", JSONObject().apply {
      put("platform", "android")
      put("clock", "android-uptime-ms")
      put("sdk", Build.VERSION.SDK_INT)
      put("device", "${Build.MANUFACTURER} ${Build.MODEL}")
      put("pid", Process.myPid())
      put("exportedAtUptimeMs", SystemClock.uptimeMillis())
      put("droppedSamples", droppedSamples)
      put("touches", JSONArray(touches))
      put("inputAcknowledgements", JSONArray(acknowledgements))
    })
  }

  private fun add(target: MutableList<JSONObject>, value: JSONObject) {
    if (target.size < MAX_SAMPLES) target.add(value) else droppedSamples += 1
  }
}
