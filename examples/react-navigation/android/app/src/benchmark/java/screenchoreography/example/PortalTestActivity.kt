package screenchoreography.example

import android.app.Activity
import android.os.Bundle
import android.widget.FrameLayout

/** An attached window for native portal contract tests, without a React render. */
class PortalTestActivity : Activity() {
  lateinit var root: FrameLayout

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    root = FrameLayout(this)
    setContentView(root)
  }
}
