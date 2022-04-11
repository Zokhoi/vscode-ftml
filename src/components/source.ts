import * as vscode from 'vscode';
import fm from 'front-matter';
import { basename } from 'path';
import getWikidotPreview from '../wikidot';

type pageMetadata = {
  site: string,
  name: string,
  title?: string,
  parent?: string,
  tags?: string[] | string,
  comments?: string,
  source: string,
}

function parseMetadata(source: string): pageMetadata {
  let meta: pageMetadata = {
    site: `${vscode.workspace.getConfiguration('ftml.preview').get('wikidot')}`,
    name: '',
    source: '',
  }
  if (fm.test(source)) {
    let fmparsed = fm(source);
    Object.assign(meta, fmparsed.attributes);
    meta.source = fmparsed.body;
  } else meta.source = source;
  return meta;
}

function serveBackend(panel: vscode.WebviewPanel, fileName: string, source: string, backend: string) {
  let meta = parseMetadata(source);
  switch (backend.toLowerCase()) {
    case "wikidot":
      getWikidotPreview({
        source: meta.source,
        wikiSite: meta.site,
        pageName: meta.name,
      }).then(res=>{
        panel.webview.postMessage({
          type: "content",
          backend,
          fileName,
          wdHtml: res,
        });
      }).catch(e=>{
        vscode.window.showErrorMessage(`${e.message}\n\nSite: ${e.site}\n\nFile: ${basename(fileName)}`);
      })
      break;
    case "ftml":
    default:
      panel.webview.postMessage({
        type: "content",
        backend,
        fileName,
        ftmlSource: meta.source,
      });
      break;
  }
}

export {
  pageMetadata,
  parseMetadata,
  serveBackend,
};