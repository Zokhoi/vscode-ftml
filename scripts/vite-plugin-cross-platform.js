const esbuild = require('esbuild');

const fileRegex = /\?cross$/;

module.exports = function viteCrossPlatformPlugin(platform) {
  /** @type import("vite").Plugin */
  const plugin = {
    name: 'cross-platform',

    async load(id) {
      if (fileRegex.test(id)) {
        // Selects the specified platform-sepcific version of module
        // Then bundle to esmodule format in preperation of further processing
        const built = await esbuild.build({
          entryPoints: [id],
          bundle: true,
          minify: false,
          plugins: [],
          treeShaking: true,
          outdir: './dist',
          outbase: './src',
          write: false,
          define: {
            'window': 'globalThis',
            'import.meta.url': '""',
          },
          format: 'esm',
          platform
        });

        let code, map;
        built.outputFiles.forEach(file => {
          if (file.path.endsWith('.map')) map = file.text;
          if (file.path.endsWith('.js')) code = file.text;
        });

        return {
          code,
          map: { mappings: '' },
        };
      }
    },
  };

  return plugin;
}