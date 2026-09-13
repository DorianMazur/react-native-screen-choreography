<script setup>
import gallery from '../../../Gallery_demo_new.gif';
import wallet from '../../../Wallet_demo_new.gif';
import setup from '../../../Wallet_Setup_demo.gif';

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
    id: 'wallet',
    name: 'Wallet',
    label: 'All the details, together.',
    src: wallet,
    path: 'wallet',
    description:
      'Multiple shared roles move together as companion sections reveal on the detail screen.',
  },
  {
    id: 'setup',
    name: 'Wallet setup',
    label: 'A panel with somewhere to go.',
    src: setup,
    path: 'wallet-setup',
    description:
      'A shared panel keeps its content alive while expanding into the next step.',
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
