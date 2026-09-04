import { defineConfig } from 'vite';

// MOSAIC is a fully static, client-side app. `base` is overridden on CI for
// GitHub Pages project sites (see .github/workflows/deploy.yml, which passes
// --base=/<repo>/). Locally and on custom hosting the default root base is used.
export default defineConfig({
  base: '/',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900, // three.js is a large but intentional single dep
  },
});
