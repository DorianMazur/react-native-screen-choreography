package screenchoreography.example.macrobenchmark

import android.content.ComponentName
import android.content.Intent
import android.graphics.Rect
import android.os.Bundle
import android.os.SystemClock
import androidx.benchmark.macro.CompilationMode
import androidx.benchmark.macro.FrameTimingMetric
import androidx.benchmark.macro.junit4.MacrobenchmarkRule
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.StaleObjectException
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

/** Release-like fixture measurements; no timing claim is derived from automation wall time. */
@RunWith(Parameterized::class)
class ChoreographyBenchmarks(private val scenario: String) {
  @get:Rule
  val benchmarkRule = MacrobenchmarkRule()

  private val instrumentation = InstrumentationRegistry.getInstrumentation()
  private val arguments = InstrumentationRegistry.getArguments()
  private val device = UiDevice.getInstance(instrumentation)
  private val reactProfile = arguments.getString("performanceReactProfile", "false").toBoolean()
  private val iterations = arguments.getString("performanceIterations", "20").toInt().also {
    require(it in 1..100) { "performanceIterations must be between 1 and 100" }
  }

  @Test
  fun transitionFrames() {
    benchmarkRule.measureRepeated(
      packageName = APP_ID,
      metrics = listOf(FrameTimingMetric()),
      compilationMode = CompilationMode.None(),
      iterations = iterations,
      setupBlock = {
        // CLEAR_TASK gives each measured journey a fresh Activity and React root.
        // Launch and settling are outside the frame measurement interval.
        startActivityAndWait(launchIntent())
        await("benchmark-ready")
        device.waitForIdle()
      },
    ) {
      roundTrip()
    }
    // Macrobenchmark may stop the app during cleanup. JS/input telemetry is
    // exported by the separate repeated-navigation test, never by this frame test.
  }

  @Test
  fun repeatedNavigationTimingAndInput() {
    val cycles = arguments.getString("performanceTimingCycles", "20").toInt().also {
      require(it in 1..100) { "performanceTimingCycles must be between 1 and 100" }
    }
    device.executeShellCommand("am force-stop $APP_ID")
    instrumentation.context.startActivity(launchIntent())
    await("benchmark-ready")
    repeat(cycles) { roundTrip() }
    exportRun()
  }

  private fun roundTrip() {
    click("View Aurora")
    await("benchmark-detail-settled")
    click("benchmark-detail-probe")
    await("benchmark-detail-probe-ack")
    click("Back to gallery")
    await("benchmark-list-settled")
    click("benchmark-list-probe")
    await("benchmark-list-probe-ack")
  }

  private fun exportRun() {
    val previousFiles = fixtureFiles()
    click("benchmark-end")
    await("benchmark-export-complete")
    val exportedFiles = fixtureFiles() - previousFiles
    check(exportedFiles.size == 1) { "Expected one new fixture export, found $exportedFiles" }
    val filename = exportedFiles.single()
    // executeShellCommand tokenizes arguments; it does not parse shell quotes.
    // The directory is constant and fixtureFiles accepts only safe filenames.
    val contents = device.executeShellCommand("cat $APP_OUTPUT_DIRECTORY/$filename")
    check(JSONObject(contents).getString("scenario") == scenario) { "Fixture export scenario mismatch" }
    // AGP can uninstall both packages at the end of connected tests, deleting
    // their external files. Preserve the report before that cleanup happens.
    writeArtifact("fixture-$filename", contents)
  }

  private fun fixtureFiles(): Set<String> =
    device.executeShellCommand("ls $APP_OUTPUT_DIRECTORY")
      .lineSequence().map { it.trim() }
      .filter { it.matches(Regex("[A-Za-z0-9_.-]+\\.json")) }.toSet()

  private fun launchIntent() = Intent(Intent.ACTION_MAIN).apply {
    component = ComponentName(APP_ID, "$APP_ID.MainActivity")
    addCategory(Intent.CATEGORY_LAUNCHER)
    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
    putExtra("performanceScenario", scenario)
    putExtra("performanceReactProfile", reactProfile)
  }

  private fun await(label: String) {
    assertTrue("Missing fixture marker: $label", device.wait(Until.hasObject(By.desc(label)), TIMEOUT_MS))
  }

  private fun click(label: String) {
    val deadline = SystemClock.uptimeMillis() + TIMEOUT_MS
    var bounds: Rect? = null
    while (bounds == null && SystemClock.uptimeMillis() < deadline) {
      try {
        val target = device.findObject(By.desc(label))
        if (target != null && target.isEnabled) {
          val candidate = Rect(target.visibleBounds)
          if (!candidate.isEmpty) bounds = candidate
        }
      } catch (_: StaleObjectException) {
        // Retry only the read: React can replace accessibility nodes between
        // lookup and bounds retrieval. A tap is never replayed after injection.
      }
      if (bounds == null) SystemClock.sleep(20)
    }
    val targetBounds = checkNotNull(bounds) { "Missing fixture control: $label" }
    // UiAutomator injects an actual device touch; this never invokes JS onPress directly.
    check(device.click(targetBounds.centerX(), targetBounds.centerY())) { "Touch injection failed: $label" }
  }

  private fun writeArtifact(filename: String, contents: String) {
    require(filename.matches(Regex("[A-Za-z0-9_.-]+"))) { "Invalid artifact filename" }
    // AGP supplies an additional-output directory inside this test package's
    // external media directory. Both instrumentation and adb can access it.
    @Suppress("DEPRECATION")
    val mediaRoot = checkNotNull(instrumentation.targetContext.externalMediaDirs.firstOrNull()) {
      "Instrumentation external media directory is unavailable"
    }
    val outputRoot = arguments.getString("additionalTestOutputDir")?.let(::File) ?: mediaRoot
    // A subdirectory also protects these files from AndroidX's initialization,
    // which clears regular files at the root of its output directories.
    val outputDirectory = File(outputRoot, "performance").apply {
      check(isDirectory || mkdirs()) { "Cannot create benchmark artifact directory: $absolutePath" }
    }
    val destination = File(outputDirectory, filename)
    val bytes = contents.toByteArray(Charsets.UTF_8)
    destination.writeBytes(bytes)
    check(destination.length() == bytes.size.toLong()) {
      "Incomplete benchmark artifact: ${destination.absolutePath}, expected ${bytes.size}, wrote ${destination.length()} bytes"
    }
    // Standard instrumentation additional-output contract, also used by
    // AndroidX Benchmark. Avoid depending on its restricted internal Outputs API.
    instrumentation.sendStatus(2, Bundle().apply {
      putString("additionalTestOutputFile_$filename", destination.absolutePath)
    })
  }

  companion object {
    private const val APP_ID = "screenchoreography.example"
    private const val APP_OUTPUT_DIRECTORY = "/sdcard/Android/data/$APP_ID/files/performance"
    private const val TIMEOUT_MS = 15000L

    @JvmStatic
    @Parameterized.Parameters(name = "{0}")
    fun scenarios(): List<Array<String>> = listOf(arrayOf("gallery"))
  }
}
