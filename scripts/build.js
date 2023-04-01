#!/usr/bin/node
console.time('Bundling time');
const {build} = require('vite');
const {join} = require('path');

/** @type 'production' | 'development' | 'test' */
const mode = process.env.MODE || 'production';

const configs = [
  join(process.cwd(), 'scripts/config.vite.js'),
  join(process.cwd(), 'scripts/config.browser.vite.js'),
];


/**
 * Run `vite build` for config file
 * @param {string} configFile
 * @return {Promise<RollupOutput | RollupOutput[]>}
 */
const buildByConfig = (configFile) => build({configFile, mode});



Promise.all(configs.map(buildByConfig))
  .then(() => console.timeEnd('Bundling time'))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
