<script setup>
import gallery from '../../../Gallery_demo_new.gif';
import trips from '../../../Trips.gif';
import wallet from '../../../Wallet_demo_new.gif';

const demos = [
  {
    id: 'gallery',
    name: 'Gallery',
    label: 'A photo becomes the hero.',
    src: gallery,
    path: 'gallery',
    description:
      'One retained photo, with image, gradient, icon, and text following the same frame.',
  },
  {
    id: 'trips',
    name: 'Trips',
    label: 'A trip opens into a scene.',
    src: trips,
    path: 'trips',
    description:
      'A retained photo scene expands from its card into the trip detail screen.',
  },
  {
    id: 'wallet',
    name: 'Wallet',
    label: 'All the details, together.',
    src: wallet,
    path: 'wallet',
    description:
      'Multiple shared roles move together as companion sections reveal on the detail screen.',
  },
];
</script>

<template>
  <div class="ch-demo-gallery">
    <article v-for="demo in demos" :key="demo.id" class="ch-demo-card">
      <div class="ch-recording">
        <img
          :src="demo.src"
          :alt="`${demo.name} native app recording, showing forward and return shared element transitions`"
        />
      </div>
      <h2 :id="demo.id">{{ demo.name }}</h2>
      <p class="ch-demo-label">{{ demo.label }}</p>
      <p>{{ demo.description }}</p>
      <a
        :href="`https://github.com/DorianMazur/react-native-screen-choreography/tree/main/examples/shared/${demo.path}`"
        >Explore the source <span aria-hidden="true">↗</span></a
      >
    </article>
  </div>
</template>
