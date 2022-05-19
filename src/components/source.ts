import * as vscode from 'vscode';
import fm from 'front-matter';
import { PageData, getPreview } from "../wikidot/interface";
import { unixNamify } from '../utils';

/**
 * Parses an FTML file to obtain its page data.
 * @param source Source of the FTML file.
 */
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
  meta.page = unixNamify(meta.page);
  return meta;
}

/**
 * Posts a packet of preview data to backend to refresh the preview once.
 * @param panel The preview panel.
 * @param fileName Name of source file for the preview.
 * @param source Source of the FTML file.
 * @param backend The backend to be used.
 */
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