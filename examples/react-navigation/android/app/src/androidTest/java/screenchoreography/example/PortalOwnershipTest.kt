package screenchoreography.example

import android.view.View
import android.widget.FrameLayout
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.teleport.host.PortalHostView
import com.teleport.portal.PortalView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Exercise Android parent ownership, which the JavaScript portal mocks cannot model. */
@RunWith(AndroidJUnit4::class)
class PortalOwnershipTest {
  @Test
  fun returnsTransitioningPayloadFromAttachedHost() = withPortal { portal, host, payload ->
    host.startViewTransition(payload)

    portal.setHostName(null)

    assertSame(portal, payload.parent)
    assertEquals(1, portal.childCount)
    assertEquals(0, host.childCount)
    assertTrue(payload.isAttachedToWindow)
    // A late navigation callback must not detach the new owner's child.
    host.endViewTransition(payload)
    assertSame(portal, payload.parent)
    assertTrue(payload.isAttachedToWindow)
  }

  @Test
  fun releasesDescendantTransitionsBeforeMovingPayload() = withPortal { portal, _, payload ->
    val child = View(payload.context)
    payload.addView(child)
    payload.startViewTransition(child)

    portal.setHostName(null)
    payload.removeView(child)
    val replacement = FrameLayout(payload.context)
    payload.addView(replacement)
    replacement.addView(child)

    payload.endViewTransition(child)
    assertSame(replacement, child.parent)
    assertTrue(child.isAttachedToWindow)
  }

  @Test
  fun returnsPayloadWhenDestinationIsRemovedBeforeRetargeting() = withPortal { portal, host, payload ->
    host.startViewTransition(payload)
    (host.parent as FrameLayout).removeView(host)
    host.cleanup(host.id)

    portal.setHostName(null)
    host.endViewTransition(payload)

    assertSame(portal, payload.parent)
    assertEquals(1, portal.childCount)
    assertEquals(0, host.childCount)
    assertTrue(payload.isAttachedToWindow)
  }

  private fun withPortal(block: (PortalView, PortalHostView, FrameLayout) -> Unit) {
    ActivityScenario.launch(PortalTestActivity::class.java).use { scenario ->
      scenario.onActivity { activity ->
        val portal = PortalView(activity) {}
        val host = PortalHostView(activity).apply { id = View.generateViewId() }
        val payload = FrameLayout(activity)
        activity.root.addView(portal)
        activity.root.addView(host)
        portal.addView(payload, 0)
        host.setName("ownership-test")
        portal.setHostName("ownership-test")
        try {
          assertSame(host, payload.parent)
          assertTrue(payload.isAttachedToWindow)
          block(portal, host, payload)
        } finally {
          // Drop the subscription first, including when a regression leaves a
          // stale parent, so a failed case cannot poison the following case.
          portal.cleanup()
          host.setName(null)
        }
      }
    }
  }
}
