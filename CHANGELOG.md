# Change Log

## 0.2.6: Beta 2 patch 6
- Fixed changes due to ftml upgrade
- Updated ftml version to 1.28.1

## 0.2.5: Beta 2 patch 5
- Prevent URI from being treated as italics
- Updated ftml version to 1.28.0

## 0.2.4: Beta 2 patch 4
- Fixed CSS module arguments

## 0.2.3: Beta 2 patch 3
- Added Wikidot logout command
- Fixed behaviour when dealing with private sites

## ~~0.2.1: Beta 2 patch 1~~ 0.2.2: Beta 2 patch 2
- Fixed error when trying to pull pages with parent page

## 0.2.0: Beta 2

- Added experimental VSCode for web support with limited functionality
- Moved backend html parsing and traversing from cheerio to [linkedom](https://www.npmjs.com/package/linkedom)
- Other minor bug fixes

## 0.1.3: Beta 1 patch 3

- Added auto saving metadata after pushing to Wikidot remote
- Fixed saving in diff editor
- Fixed pages with bottom toolbar disabled taken to be non-existent

## 0.1.2: Beta 1 patch 2

- Removed [[css]] block, see [scpwiki/wikijump#1178](https://github.com/scpwiki/wikijump/pull/1178)
- Fixed cannot fetch remote page when remote site forces using https
- Improved Wikidot account session validity checking process
- Upgraded ftml version to 1.18.1
- Other minor bug fixes

## 0.1.1: Beta 1 patch 1

- Fixed fetch command in context menu not working
- Fixed preview changing to fetched content in diff editor
- Fixed iframe and embed blocks not highlighting html syntax

## 0.1.0: Beta 1

- Added page diffing between local and remote content
- Added config option for account selecting when page fetch or push
- Fixed FTML syntax bug for horizontal rule (4+ dashes) and sperator rule (4+ equals)
- Page name from user input is now sanitized to wikidot unix names
- Upgraded ftml version to 1.16.2

## 0.0.3: Pre-Alpha 3

- Added overwrite safeguarding for Wikidot syncing features
- Fixed Wikidot login persistence between vscode sessions
- Fixed some FTML syntax bugs

## 0.0.2: Pre-Alpha 2

- Added Wikidot syncing features

## 0.0.1: Pre-Alpha 1

- Initial release