const esbuild = require('esbuild');
const { resolve } = require('path');

const fileRegex = /\?bundled-worker(&.+)?$/;

const resolveInternal = (keypair) => {
  return {
    name: 'resolveInternal',
    setup(build) {
      for (const key in keypair) {
        build.onResolve({ filter: new RegExp(key) }, () => {
          return { path: resolve(keypair[key]) };
        });
      }
    },
  };
};

module.exports = function viteWorkerPlugin(cjs = false) {
  /** @type import("vite").Plugin */
  const plugin = {
    name: 'bundle-workers',

    async load(id) {
      if (fileRegex.test(id)) {
        const args = (id.match(fileRegex)[1] || "").split('&');
        const codemode = args.includes('dataurl') ? "dataurl" : "normal";
        // build the worker under IIFE so that it has no exports, no imports
        // should be 100% web-worker compatible
        const built = await esbuild.build({
          entryPoints: [id],
          bundle: true,
          minifySyntax: true,
          minifyIdentifiers: false,
          minifyWhitespace: true,
          // minify: false,
          plugins: [
            resolveInternal({
              // 'ftml-wasm/vendor/ftml': resolve(
              //   __dirname,
              //   '../package-wj/client/modules/ftml-wasm/vendor/ftml',
              // ),
              // 'ftml-wasm': resolve(
              //   __dirname,
              //   '../package-wj/client/modules/ftml-wasm/src/index.ts',
              // ),
              // 'threads-worker-module/src/worker-lib': resolve(
              //   __dirname,
              //   '../package-wj/client/modules/threads-worker-module/src/worker-lib',
              // ),
            })
          ],
          treeShaking: true,
          outdir: './dist',
          outbase: './src',
          write: false,
          define: {
            'window': 'globalThis',
            'import.meta.url': '""',
          },
          ...(cjs
            ? {
                format: 'cjs',
                platform: 'node',
                external: ['worker_threads'],
              }
            : {
                format: 'iife',
                platform: 'browser',
              }),
        });

        let code, map;
        built.outputFiles.forEach(file => {
          if (file.path.endsWith('.map')) map = file.text;
          if (file.path.endsWith('.js')) code = file.text;
        });

        switch (codemode) {
          case 'dataurl':
            code = `data:application/javascript;base64,${Buffer.from(code).toString('base64')}`;
          case 'normal':
          default:
            code = `export default ${JSON.stringify(code)};`;
            break;
        }

        return {
          code,
          map: { mappings: '' },
        };
      }
    },
  };

  return plugin;
};
