<script setup>
import { ref } from 'vue';
import { withBase } from 'vitepress';
import aurora from '../../../../examples/shared/assets/photos/aurora.jpg';
import dunes from '../../../../examples/shared/assets/photos/dunes.jpg';
import coast from '../../../../examples/shared/assets/photos/coast.jpg';
import midnight from '../../../../examples/shared/assets/photos/midnight.jpg';
import forest from '../../../../examples/shared/assets/photos/forest.jpg';
import rooftops from '../../../../examples/shared/assets/photos/rooftops.jpg';

const expanded = ref(false);
// Keep these labels and the Aurora detail in sync with examples/shared/gallery/data.ts.
// Import its images directly; the native module itself depends on React Native.
const photos = [
  { title: 'Aurora', location: 'Tromsø, Norway', image: aurora },
  { title: 'Dunes', location: 'Erg Chebbi, Morocco', image: dunes },
  { title: 'Coast', location: 'Big Sur, California', image: coast },
  { title: 'Midnight', location: 'Reykjavík, Iceland', image: midnight },
  { title: 'Forest', location: 'Olympic NP, USA', image: forest },
  { title: 'Rooftops', location: 'Tokyo, Japan', image: rooftops },
];
</script>

<template>
  <div class="ch-preview">
    <div
      class="ch-motion-stage gallery-stage"
      :class="{ 'is-expanded': expanded }"
      aria-hidden="true"
    >
      <div class="ch-stage-grid" />
      <div class="ch-orbit">
        <svg viewBox="0 0 520 440">
          <path
            d="M120 210C235 40 275 335 375 174"
            fill="none"
            stroke="currentColor"
            stroke-width="1.3"
            stroke-dasharray="4 7"
          />
        </svg>
      </div>
      <svg class="gallery-symbols" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <symbol id="gallery-preview-camera" viewBox="0 0 24 24">
            <path
              d="m8 5 1.5-2h5L16 5h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
            />
            <circle cx="12" cy="13" r="4" />
          </symbol>
        </defs>
      </svg>
      <div class="gallery-screen gallery-source">
        <div class="gallery-nav"><span>←</span> Gallery</div>
        <div class="gallery-heading">
          <div class="gallery-eyebrow">THE FIELD JOURNAL</div>
          <h3>Field notes</h3>
          <div class="gallery-summary">
            <span>Places worth keeping</span><span>6 PHOTOS</span>
          </div>
        </div>
        <div class="gallery-grid">
          <div
            v-for="(photo, index) in photos"
            :key="photo.title"
            class="gallery-tile"
            :class="{ 'gallery-owner-slot': index === 0 }"
          >
            <template v-if="index !== 0">
              <img :src="photo.image" alt="" width="200" height="278" />
              <svg class="gallery-camera">
                <use href="#gallery-preview-camera" />
              </svg>
              <div class="gallery-caption">
                <strong>{{ photo.title }}</strong
                ><span>{{ photo.location }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>

      <div class="gallery-screen gallery-target">
        <div class="gallery-nav"><span>←</span> Field notes</div>
        <div class="gallery-target-slot" />
        <div class="gallery-details">
          <section>
            <h4>Notes</h4>
            <p>
              Long exposure across a still fjord. The sky burned green for
              nearly an hour while the mountains stayed pitch black behind it.
            </p>
          </section>
          <section>
            <h4>Exposure</h4>
            <div class="gallery-exposure">
              <div><span>ISO</span><strong>1600</strong></div>
              <div><span>SHUTTER</span><strong>8s</strong></div>
              <div><span>APERTURE</span><strong>f/2.8</strong></div>
            </div>
          </section>
          <div class="gallery-actions">
            <span class="gallery-view-photo">↗ &nbsp; View photo</span
            ><svg viewBox="0 0 24 24" class="gallery-share">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <path d="m9 10 6-4M9 14l6 4" />
            </svg>
          </div>
        </div>
      </div>

      <!-- One photo, camera, title, and location move together between endpoints. -->
      <div class="ch-traveling-card gallery-hero">
        <img
          :src="aurora"
          alt=""
          width="800"
          height="800"
          fetchpriority="high"
        />
        <svg class="gallery-camera"><use href="#gallery-preview-camera" /></svg>
        <div class="gallery-caption">
          <strong>Aurora</strong><span>Tromsø, Norway</span>
        </div>
      </div>
    </div>
    <div class="ch-preview-controls">
      <button
        class="ch-play-button"
        :aria-pressed="expanded"
        @click="expanded = !expanded"
      >
        <span class="ch-play-icon" aria-hidden="true">{{
          expanded ? '↶' : '▶'
        }}</span
        >{{ expanded ? 'Back to gallery' : 'Play Gallery transition' }}
      </button>
      <div class="ch-progress-readout" aria-hidden="true">
        <span>0</span>
        <div class="ch-progress-track"><div :class="{ full: expanded }" /></div>
        <span>1</span>
      </div>
    </div>
    <p class="ch-preview-note">
      Browser recreation of the Gallery example.
      <a :href="withBase('/examples.html#gallery')"
        >Watch the native recording ↗</a
      >
    </p>
    <span class="ch-sr-only" role="status">{{
      expanded
        ? 'Aurora is expanded on the photo detail screen with its notes and exposure settings.'
        : 'Aurora is in the Field notes gallery grid.'
    }}</span>
  </div>
</template>

<style scoped>
/* Miniature app styling follows examples/shared/theme.ts. It stays dark in both
   documentation themes, just like the native Gallery recording. */
.gallery-stage {
  aspect-ratio: 1.08;
  --gallery-bg: #101211;
  --gallery-border: #2c312e;
  --gallery-text: #f4f6f2;
  --gallery-secondary: #a2ada5;
  --gallery-ease: cubic-bezier(0.22, 1, 0.36, 1);
  /* Geometry is relative to the whole stage, keeping the shared hero aligned
     with the grid's first tile and the target's square at every viewport size. */
  --gallery-source-x: 4.2%;
  --gallery-source-y: 10.5%;
  --gallery-source-w: 35%;
  --gallery-source-h: 80%;
  --gallery-owner-x: 6.475%;
  --gallery-owner-y: 35.3%;
  --gallery-owner-w: 14.675cqw;
  --gallery-target-x: 53.5%;
  --gallery-target-y: 4.6%;
  --gallery-target-w: 40cqw;
  --gallery-target-h: 90%;
  --gallery-receiver-y: 19.9%;
}
.gallery-symbols {
  position: absolute;
  width: 0;
  height: 0;
}
.gallery-screen {
  position: absolute;
  overflow: hidden;
  border-radius: 2.8cqw;
  background: var(--gallery-bg);
  color: var(--gallery-text);
  box-shadow:
    0 0 0 1px #303831,
    0 8px 22px #10121112;
  font-family: 'Avenir Next', var(--vp-font-family-base);
  line-height: 1.4;
}
.gallery-source {
  left: var(--gallery-source-x);
  top: var(--gallery-source-y);
  width: var(--gallery-source-w);
  height: var(--gallery-source-h);
}
.gallery-target {
  left: var(--gallery-target-x);
  top: var(--gallery-target-y);
  width: var(--gallery-target-w);
  height: var(--gallery-target-h);
}
.gallery-nav {
  position: absolute;
  top: 8%;
  left: 6.5%;
  right: 6.5%;
  display: flex;
  align-items: center;
  gap: 1.5cqw;
  font-size: 2cqw;
  font-weight: 600;
  line-height: 1.4;
}
.gallery-nav > span {
  font-size: 2.8cqw;
  font-weight: 400;
}
.gallery-heading {
  position: absolute;
  top: 16%;
  left: 6.5%;
  right: 6.5%;
  padding-bottom: 1.6cqw;
  border-bottom: 1px solid var(--gallery-border);
}
.gallery-eyebrow {
  font-size: 0.95cqw;
  font-weight: 600;
  line-height: 1.3;
  color: var(--gallery-secondary);
}
.gallery-heading h3 {
  font-size: 3cqw;
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: -0.05cqw;
  margin: 0.65cqw 0 0.75cqw;
}
.gallery-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5cqw;
  font-size: 1.05cqw;
  line-height: 1.4;
  color: var(--gallery-secondary);
  white-space: nowrap;
}
.gallery-summary > span:last-child {
  font-size: 0.9cqw;
  color: #e6b9ab;
  font-family: var(--vp-font-family-mono);
}
.gallery-grid {
  position: absolute;
  top: 31%;
  left: 6.5%;
  right: 6.5%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.1cqw;
}
.gallery-tile {
  position: relative;
  aspect-ratio: 0.72;
  border-radius: 0.75cqw;
  overflow: hidden;
  background: #191c1a;
}
.gallery-tile img,
.gallery-hero img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}
.gallery-tile:not(.gallery-owner-slot)::after,
.gallery-hero::after {
  content: '';
  position: absolute;
  inset: 45% 0 0;
  background: linear-gradient(transparent, #000a);
  pointer-events: none;
}
.gallery-owner-slot {
  outline: 1px dashed var(--gallery-border);
  outline-offset: -1px;
}
.gallery-camera,
.gallery-share {
  fill: none;
  stroke: var(--gallery-text);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.gallery-camera {
  position: absolute;
  top: 0.85cqw;
  right: 0.85cqw;
  width: 1.6cqw;
  height: 1.6cqw;
  z-index: 1;
}
.gallery-caption {
  position: absolute;
  left: 1cqw;
  right: 0.6cqw;
  bottom: 0.9cqw;
  display: flex;
  flex-direction: column;
  gap: 0.1cqw;
  line-height: 1.4;
  z-index: 1;
  color: var(--gallery-text);
}
.gallery-caption strong {
  font-size: 1.6cqw;
  font-weight: 600;
  white-space: nowrap;
}
.gallery-caption > span {
  font-size: 0.95cqw;
  white-space: nowrap;
}
.gallery-target-slot {
  position: absolute;
  top: 17%;
  width: 100%;
  aspect-ratio: 1;
  background: #191c1a;
}
.gallery-hero {
  position: absolute;
  left: var(--gallery-owner-x);
  top: var(--gallery-owner-y);
  width: var(--gallery-owner-w);
  height: calc(var(--gallery-owner-w) / 0.72);
  border-radius: 0.75cqw;
  overflow: hidden;
  font-family: 'Avenir Next', var(--vp-font-family-base);
  line-height: 1.4;
  transition:
    left 850ms var(--gallery-ease),
    top 850ms var(--gallery-ease),
    width 850ms var(--gallery-ease),
    height 850ms var(--gallery-ease),
    border-radius 850ms var(--gallery-ease);
}
.gallery-hero .gallery-caption {
  transition:
    left 850ms var(--gallery-ease),
    bottom 850ms var(--gallery-ease),
    gap 850ms var(--gallery-ease);
}
.gallery-hero .gallery-caption strong,
.gallery-hero .gallery-caption > span {
  transition: font-size 850ms var(--gallery-ease);
}
.gallery-hero .gallery-camera {
  transition:
    top 850ms var(--gallery-ease),
    right 850ms var(--gallery-ease),
    width 850ms var(--gallery-ease),
    height 850ms var(--gallery-ease);
}
.is-expanded .gallery-hero {
  left: var(--gallery-target-x);
  top: var(--gallery-receiver-y);
  width: var(--gallery-target-w);
  height: var(--gallery-target-w);
  border-radius: 0;
}
.is-expanded .gallery-hero .gallery-caption {
  left: 2.5cqw;
  bottom: 2.3cqw;
  gap: 0.35cqw;
}
.is-expanded .gallery-hero .gallery-caption strong {
  font-size: 3.4cqw;
}
.is-expanded .gallery-hero .gallery-caption > span {
  font-size: 1.6cqw;
}
.is-expanded .gallery-hero .gallery-camera {
  top: 1.85cqw;
  right: 1.85cqw;
  width: 2.3cqw;
  height: 2.3cqw;
}
.gallery-details {
  position: absolute;
  top: calc(17% + var(--gallery-target-w));
  left: 7%;
  right: 7%;
}
.gallery-target .gallery-nav,
.gallery-details {
  opacity: 0.18;
  transition: opacity 500ms 180ms;
}
.is-expanded .gallery-target .gallery-nav,
.is-expanded .gallery-details {
  opacity: 1;
}
.gallery-details section {
  padding: 0.85cqw 0;
  border-bottom: 1px solid var(--gallery-border);
}
.gallery-details h4 {
  margin: 0 0 0.55cqw;
  font-size: 1.65cqw;
  line-height: 1.3;
  font-weight: 600;
}
.gallery-details p {
  color: var(--gallery-secondary);
  font-size: 1.3cqw;
  line-height: 1.5;
}
.gallery-exposure {
  display: flex;
  justify-content: space-between;
  padding-top: 0.5cqw;
}
.gallery-exposure > div {
  display: flex;
  flex-direction: column;
  gap: 0.25cqw;
}
.gallery-exposure span {
  font-size: 0.95cqw;
  color: var(--gallery-secondary);
}
.gallery-exposure strong {
  font-size: 1.65cqw;
  font-family: var(--vp-font-family-mono);
  font-weight: 600;
  line-height: 1.4;
}
.gallery-actions {
  display: flex;
  align-items: center;
  gap: 1.5cqw;
  padding-top: 1cqw;
}
.gallery-view-photo {
  flex: 1;
  display: block;
  border-radius: 0.75cqw;
  background: #d4f77d;
  color: #17220e;
  font-weight: 600;
  text-align: center;
  font-size: 1.5cqw;
  line-height: 1.5;
  padding: 1cqw 0;
}
.gallery-share {
  width: 2.5cqw;
  height: 2.5cqw;
  flex-shrink: 0;
}
</style>
