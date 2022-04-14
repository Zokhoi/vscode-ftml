const { resolve, join } = require('path');
import commonjsExternals from 'vite-plugin-commonjs-externals';
const bundledWorker = require(resolve(__dirname, './vite-plugin-bundled-worker'));
const crossPlatform = require(resolve(__dirname, './vite-plugin-cross-platform'));
/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
module.exports = {
  mode: process.env.MODE,
  base: './',
  root: join(process.cwd(), './src'),
  server: {
    port: 1212,
    fs: {
      strict: false,
      allow: ['./'],
    },
  },
  plugins: [
    commonjsExternals({ externals: require('./external-packages').default }),
    bundledWorker(),
    crossPlatform("browser"),
  ],
  build: {
    target: 'es2020',
    polyfillDynamicImport: false,
    minify: process.env.MODE === 'development' ? false : 'terser',
    base: '',
    outDir: join(process.cwd(), 'dist'),
    assetsDir: '.',
    rollupOptions: {
      external: require('./external-packages').default,
    },
    lib: {
      entry: resolve(__dirname, '../src/extension'),
      formats: ['cjs'],
      fileName: ()=>'extension.browser.js',
    },
    emptyOutDir: true,
    sourcemap: true,
  },
};
