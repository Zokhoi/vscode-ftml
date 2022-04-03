# vscode-ftml

A VSCode extension for support of FTML, the markup language of SCP Foundation.

This extension supports only a subset of [Wikidot text](https://www.wikidot.com/doc-wiki-syntax:start) (Wikitext), refered to as [FTML](https://github.com/scpwiki/wikijump/tree/develop/ftml) (Foundation Text Markup Language).

## Features

* Syntax highlighting
* Wikitext preview
  * configurable backend: FTML or Wikidot
    * FTML has live preview and refresh-on-command mode
    * Wikidot backend has refresh-on-command mode only
  * Locking preview to document

## Development

This repository uses pnpm for package managing.

Install development dependencies and use
```bash
pnpm run compile
```
for compiling.

## References

* [FTML Blocks documentation](https://github.com/scpwiki/wikijump/blob/develop/ftml/docs/Blocks.md)