package screenchoreography.example.macrobenchmark

import android.content.ComponentName
import android.content.Intent
import android.graphics.Rect
import android.os.Bundle
import android.os.SystemClock
import android.view.accessibility.AccessibilityNodeInfo
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.StaleObjectException
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import java.io.ByteArrayOutputStream
import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

/** Release-like fixture measurements; no timing claim is derived from automation wall time. */
@RunWith(Parameterized::class)
class ChoreographyBenchmarks(private val scenario: String) {
  private val instrumentation = InstrumentationRegistry.getInstrumentation()
  private val arguments = InstrumentationRegistry.getArguments()
  private val device = UiDevice.getInstance(instrumentation)
  @Test
  fun repeatedNavigationTimingAndInput() {
    val cycles = arguments.getString("performanceTimingCycles", "20").toInt().also {
      require(it in 1..100) { "performanceTimingCycles must be between 1 and 100" }
    }
    device.executeShellCommand("am force-stop $APP_ID")
    instrumentation.context.startActivity(launchIntent())
    try {
      // Slow local cold boots can opt in without relaxing CI or input checks.
      val startupTimeout = arguments.getString("performanceStartupTimeoutMs", "$TIMEOUT_MS").toLong()
      require(startupTimeout > 0) { "performanceStartupTimeoutMs must be positive" }
      await("benchmark-ready", startupTimeout)
      repeat(cycles) { roundTrip() }
    } catch (failure: Throwable) {
      // Preserve the collector's rejection reason and the actual UI before
      // AGP uninstalls the app. Diagnostic failures must not mask the assertion.
      try {
        val hierarchy = ByteArrayOutputStream()
        device.dumpWindowHierarchy(hierarchy)
        writeArtifact("failure-window.xml", hierarchy.toString("UTF-8"))
        // Export diagnostics through accessibility if the failure is hit
        // testing itself. The measured probes always use real device touches.
        exportRun(diagnostic = true)
      } catch (diagnosticFailure: Throwable) {
        failure.addSuppressed(diagnosticFailure)
      }
      throw failure
    }
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

  private fun exportRun(diagnostic: Boolean = false) {
    val previousFiles = fixtureFiles()
    if (diagnostic) {
      fun activate(node: AccessibilityNodeInfo): Boolean {
        if (node.contentDescription?.toString() == "benchmark-end") {
          return node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        }
        for (index in 0 until node.childCount) {
          val child = node.getChild(index) ?: continue
          if (activate(child)) return true
        }
        return false
      }
      check(instrumentation.uiAutomation.rootInActiveWindow?.let(::activate) == true) {
        "Cannot activate diagnostic export"
      }
    } else {
      click("benchmark-end")
    }
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
  }

  private fun await(label: String, timeoutMs: Long = TIMEOUT_MS) {
    assertTrue("Missing fixture marker: $label", device.wait(Until.hasObject(By.desc(label)), timeoutMs))
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
