# FTML/Wikidot Workshop for VSCode

[![version](https://img.shields.io/vscode-marketplace/v/zokhoi.vscode-ftml.svg?style=flat-square&label=vscode%20marketplace)](https://marketplace.visualstudio.com/items?itemName=zokhoi.vscode-ftml)

A VSCode extension for support of FTML, the markup language of SCP Foundation.

This extension supports only a subset of [Wikidot text](https://www.wikidot.com/doc-wiki-syntax:start) (Wikitext), refered to as [FTML](https://github.com/scpwiki/wikijump/tree/develop/ftml) (Foundation Text Markup Language).

## Features

* Syntax highlighting
  * applicable to file extensions `.ftml`, `.wd`, `.wikidot`, `.wj`, `.wikijump`
* Wikitext Live preview

![vscode-ftml-live-preview](./docs/vscode-ftml-live-preview.gif)

* Retreiving Wikidot page wikitext source and metadata
* Diffing between local and remote content

![vscode-ftml-fetch](./docs/vscode-ftml-fetch.gif)

* Pushing local wikitext files to Wikidot

![vscode-ftml-push](./docs/vscode-ftml-push.gif)

## Development

This repository uses pnpm for package management.

Install development dependencies and use
```bash
pnpm run compile
```
for compiling.

## References

* [FTML Blocks documentation](https://github.com/scpwiki/wikijump/blob/develop/ftml/docs/Blocks.md)
* [FTML file specficiation](https://gist.github.com/Zokhoi/06dbc890a4f2fab3eadcd7d2ed0d8698)