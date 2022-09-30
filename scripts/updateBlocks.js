const fs = require('fs');
const path = require('path');

const toml = require('toml');
const yaml = require('js-yaml');
const fetch = require('cross-fetch');

const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
const kebabize = (str) => str.replace(/[A-Z]+(?![a-z])|[A-Z]/g, ($, ofs) => (ofs ? "-" : "") + $.toLowerCase());

const blocktomllink = 'https://raw.githubusercontent.com/scpwiki/wikijump/develop/ftml/conf/blocks.toml';

!(async ()=>{
  let blocks = toml.parse(await (await fetch(blocktomllink)).text());
  let output = {
    blockStandalone: [],
    blockStandaloneMap: [],
    blockStandaloneValue: [],
    blockStandaloneValueMap: [],
    block: [],
    blockMap: [],
    blockValue: [],
    blockValueMap: [],
  }
  for (const block in blocks) {
    if ([
      // not generic blocks, requires special treatment
      'module',
      'include-messy',
      'html',
      'embed',
      // 'css',
      'math',
      'code',
      'ruby-short'
    ].includes(block)) continue;
    let score = blocks[block]['accepts-score'];
    let star = blocks[block]['accepts-star'];
    let aliases = blocks[block].aliases || [];
    let body = blocks[block].body == 'none' ? 'Standalone' : '';
    let head = '';
    switch (blocks[block].head) {
      case 'map':
        head = 'Map';
        break;
      case 'value':
        head = 'Value';
        break;
      case 'value+map':
        head = 'ValueMap';
        break;
      case 'none':
      default:
        break;
    }
    if (!blocks[block]['exclude-name']) aliases.unshift(block);
    if (score) aliases = aliases.map(n=>`${n}_`).concat(aliases);
    let stars = [];
    if (star) stars = aliases.map(n=>`*${n}`);
    output['block'+body+head].push(...aliases, ...stars);
  }
  for (const key in output) {
    output[key] = output[key].map(escapeRegExp).join('|');
  }

  let regexes = {
    blockStandalone: {},
    blockStandaloneMap: {},
    blockStandaloneValue: {},
    blockStandaloneValueMap: {},
    block: {},
    blockMap: {},
    blockValue: {},
    blockValueMap: {},
  }
  for (const key in regexes) {
    regexes[key].body = !key.includes('Standalone');
    regexes[key].disabled = !output[key];
    regexes[key].regex = `(?i)(\\[\\[)\\s*(${output[key]})`
    if (key.endsWith('ValueMap')) {
      regexes[key].regex += '\\s+([^\\s\\]]+)(?:\\s+((?:(?!\\]\\]).)+))?\\s*(\\]\\])';
    } else if (key.endsWith('Value')) {
      regexes[key].regex += '\\s+((?:(?!\\]\\]).)+)\\s*(\\]\\])'
    } else if (key.endsWith('Map')) {
      regexes[key].regex += '(?:\\s+((?:(?!\\]\\]).)+))?\\s*(\\]\\])';
    } else {
      regexes[key].regex += '\\s*(\\]\\])';
    }
    if (regexes[key].body) {
      regexes[key].end = `(?i)((\\[\\[)\\/)\\s*(${output[key]})\\s*(\\]\\])`;
    }
  }
  let tmLangConfigRaw = fs.readFileSync(path.join(process.cwd(), 'syntaxes/ftml.tmLanguage.yaml'), 'utf-8');
  let tmLangConfig = yaml.load(tmLangConfigRaw.replace(/\# \- include/g, "- include"));
  for (const key in regexes) {
    if (!tmLangConfig.repository[kebabize(key)]) {
      tmLangConfig.repository[kebabize(key)] = {};
    }
    if (regexes[key].body) {
      tmLangConfig.repository[kebabize(key)].begin = regexes[key].regex;
      tmLangConfig.repository[kebabize(key)].end = regexes[key].end;
    } else {
      tmLangConfig.repository[kebabize(key)].match = regexes[key].regex;
    }
  }

  let newTmLangConfigRaw = yaml.dump(tmLangConfig);
  for (const key in regexes) {
    if (regexes[key].disabled) {
      newTmLangConfigRaw = newTmLangConfigRaw.replace(`- include: '#${kebabize(key)}'`, `# - include: '#${kebabize(key)}'`)
    }
  }

  fs.writeFileSync(path.join(process.cwd(), 'syntaxes/ftml.tmLanguage.yaml'), newTmLangConfigRaw, 'utf-8');
  process.exit(0);
})();
