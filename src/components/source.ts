import * as vscode from 'vscode';
import fm from 'front-matter';
import { PageData, getPreview } from "../wikidot";

function parsePageData(source: string): PageData {
  let meta: PageData = {
    site: `${vscode.workspace.getConfiguration('ftml.preview').get('wikidot')}`,
    page: '',
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
  let meta = parsePageData(source);
  switch (backend.toLowerCase()) {
    case "wikidot":
      getPreview({
        source: meta.source,
        wikiSite: meta.site,
        wikiPage: meta.page,
      }).then(res=>{
        panel.webview.postMessage({
          type: "content",
          backend,
          fileName,
          wdHtml: res,
        });
      }).catch(e=>{
        vscode.window.showErrorMessage(`Wikidot error: ${e.message}\n\nSite: ${e.site}\n\nFile: ${fileName.split("/").pop()}`);
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
  parsePageData,
  serveBackend,
};