import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import ChoreographyHome from './components/ChoreographyHome.vue';
import DemoGallery from './components/DemoGallery.vue';
import './style.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('ChoreographyHome', ChoreographyHome);
    app.component('DemoGallery', DemoGallery);
  },
} satisfies Theme;
