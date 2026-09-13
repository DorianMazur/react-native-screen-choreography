<script setup>
import { onUnmounted, ref } from 'vue';
import { withBase } from 'vitepress';
import GalleryPreview from './GalleryPreview.vue';

const copied = ref(false);
const copyFailed = ref(false);
let copyTimer;

async function copyInstall() {
  try {
    await navigator.clipboard.writeText(
      'npm install react-native-screen-choreography'
    );
    copied.value = true;
    copyFailed.value = false;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    copyFailed.value = true;
  }
}

onUnmounted(() => clearTimeout(copyTimer));
</script>

<template>
  <div class="ch-home">
    <section class="ch-hero" aria-labelledby="hero-title">
      <div class="ch-hero-copy">
        <a
          class="ch-eyebrow"
          :href="withBase('/guide/introduction.html#where-it-fits')"
        >
          <span class="ch-status-dot" /> BUILT FOR REACT NATIVE
          <span aria-hidden="true">↗</span>
        </a>
        <h1 id="hero-title">
          Good motion<br />connects<br /><em>everything.</em>
        </h1>
        <p class="ch-hero-description">
          Turn separate screens into one continuous experience. Shared elements,
          reveals, and gestures. All moving together.
        </p>
        <div class="ch-hero-actions">
          <a
            class="ch-button ch-button-primary"
            :href="withBase('/guide/installation.html')"
            >Get started <span aria-hidden="true">↗</span></a
          >
          <a class="ch-text-link" :href="withBase('/examples.html')"
            >Explore examples <span aria-hidden="true">→</span></a
          >
        </div>
        <div class="ch-install">
          <span class="ch-prompt" aria-hidden="true">$</span>
          <code>npm install react-native-screen-choreography</code>
          <button
            :aria-label="
              copied ? 'Install command copied' : 'Copy install command'
            "
            @click="copyInstall"
          >
            <svg
              v-if="!copied"
              viewBox="0 0 20 20"
              width="17"
              height="17"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              aria-hidden="true"
            >
              <rect x="7" y="7" width="9" height="10" rx="2" />
              <path
                d="M12 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"
              />
            </svg>
            <span v-else aria-hidden="true">✓</span>
          </button>
        </div>
        <p class="ch-copy-status" role="status">
          {{
            copied
              ? 'Copied to clipboard.'
              : copyFailed
                ? 'Select the command above to copy it.'
                : ''
          }}
        </p>
      </div>

      <GalleryPreview />
    </section>

    <div class="ch-compatibility">
      <span>ONE CONTINUOUS EXPERIENCE</span>
      <div>
        <span>React Navigation</span><span class="ch-plus">+</span
        ><span>Expo Router</span><span class="ch-divider" /><span
          >iOS & Android</span
        >
      </div>
      <a :href="withBase('/guide/installation.html#compatibility')"
        >Fabric · Reanimated 4 <span aria-hidden="true">↗</span></a
      >
    </div>

    <section class="ch-principles" aria-labelledby="principles-title">
      <div class="ch-section-heading">
        <p class="ch-kicker">THE IDEA IS SIMPLE</p>
        <h2 id="principles-title">
          The screen changes.<br /><span>The connection stays.</span>
        </h2>
        <p>
          A photo becomes a hero. A card opens into a story.<br
            class="ch-desktop-break"
          />
          Keep the context that makes a transition feel natural.
        </p>
      </div>
      <div class="ch-feature-grid">
        <article>
          <span class="ch-feature-number">01 / CONTINUITY</span
          ><svg viewBox="0 0 64 48" aria-hidden="true">
            <rect x="3" y="15" width="22" height="27" rx="5" />
            <rect x="36" y="4" width="25" height="34" rx="5" />
            <path d="M19 13Q34-3 47 3M40 1l8 2-3 7" />
          </svg>
          <h3>One element. Still alive.</h3>
          <p>
            Your content moves between screens as one retained native subtree.
            Its state and React context stay with it.
          </p>
          <a
            :href="
              withBase('/guide/introduction.html#one-element-three-places')
            "
            >Understand the model <span aria-hidden="true">↗</span></a
          >
        </article>
        <article>
          <span class="ch-feature-number">02 / COORDINATION</span
          ><svg viewBox="0 0 64 48" aria-hidden="true">
            <path d="M4 12h56M4 24h56M4 36h56" />
            <rect x="11" y="8" width="20" height="8" rx="4" />
            <rect x="23" y="20" width="25" height="8" rx="4" />
            <rect x="37" y="32" width="20" height="8" rx="4" />
          </svg>
          <h3>Many parts. One rhythm.</h3>
          <p>
            Pair shared elements with local reveals and exits. Define how they
            move together with one progress value.
          </p>
          <a :href="withBase('/guide/transitions.html')"
            >Compose a transition <span aria-hidden="true">↗</span></a
          >
        </article>
        <article>
          <span class="ch-feature-number">03 / CONTROL</span
          ><svg viewBox="0 0 64 48" aria-hidden="true">
            <path d="M5 36C19 36 15 11 33 11s13 25 26 25" />
            <circle cx="32" cy="11" r="5" />
            <path d="m52 30 7 6-8 5" />
          </svg>
          <h3>Forward. Back. Your call.</h3>
          <p>
            Drive a return with gesture progress. Finish it, cancel it, or let
            velocity and a threshold decide.
          </p>
          <a :href="withBase('/guide/interactive-back.html')"
            >Make it interactive <span aria-hidden="true">↗</span></a
          >
        </article>
      </div>
    </section>

    <section class="ch-recipe" aria-labelledby="recipe-title">
      <div class="ch-recipe-copy">
        <p class="ch-kicker">SMALL API. EXPRESSIVE MOTION.</p>
        <h2 id="recipe-title">
          Name the parts.<br /><em>Set them in motion.</em>
        </h2>
        <p>
          A module-scoped recipe connects your shared roles, timing, and
          companion content. The same definition works in both navigation
          integrations.
        </p>
        <a
          class="ch-button ch-button-primary"
          :href="withBase('/guide/quick-start.html')"
          >Build your first transition <span aria-hidden="true">↗</span></a
        ><span class="ch-recipe-footnote"
          >Open source. MIT licensed. Yours to make your own.</span
        >
      </div>
      <div class="ch-code-card">
        <div class="ch-code-title">
          <span><span class="ch-code-dot" /> photo-motion.ts</span
          ><span>TYPESCRIPT</span>
        </div>
        <pre><code><span class="ch-token-purple">import</span> { defineTransition, Springs }
  <span class="ch-token-purple">from</span> <span class="ch-token-green">'react-native-screen-choreography'</span>;

<span class="ch-token-comment">// One definition. A connected experience.</span>
<span class="ch-token-purple">export const</span> photoMotion = <span class="ch-token-yellow">defineTransition</span>({
  motion: { spring: Springs.default },
  shared: {
    hero: {
      kind: <span class="ch-token-green">'bounds'</span>,
      radius: [<span class="ch-token-orange">16</span>, <span class="ch-token-orange">0</span>],
    },
  },
  enter: {
    details: { during: [<span class="ch-token-orange">0.55</span>, <span class="ch-token-orange">0.9</span>], translateY: <span class="ch-token-orange">16</span> },
  },
});</code></pre>
        <div class="ch-code-footer">
          <span>One shared progress value</span
          ><a :href="withBase('/guide/transitions.html')"
            >Explore the API <span aria-hidden="true">↗</span></a
          >
        </div>
      </div>
    </section>

    <section class="ch-next" aria-labelledby="next-title">
      <div>
        <p class="ch-kicker">YOUR NEXT GREAT TRANSITION</p>
        <h2 id="next-title">Start with a single element.</h2>
      </div>
      <a
        class="ch-button ch-button-primary"
        :href="withBase('/guide/installation.html')"
        >Let’s build it <span aria-hidden="true">↗</span></a
      >
    </section>
  </div>
</template>
