import * as vscode from "vscode";
import ftmlWorker from './ftml.web.worker.js?bundled-worker&dataurl';
import css from './css/wikidot.css';
import cssponyfill from './css/ponyfill.css';
import collapsible from './css/collapsible.css';
import {
  idToInfo,
  idToPreview,
  openPreviews,
  lockedPreviews,
  basename,
} from "../global";
import { serveBackend } from "./source";
import { setListeners } from "./listeners";

/**
 * All the metadata associated with a preview tab.
 */
type previewInfo = {
  id: string,
  fileName: string,
  viewColumn: number,
  content: string,
  styles: string,
  backend: string,
  live: boolean,
}

/**
 * Generates a tab title for the preview.
 * @param fileName Name of source file for the preview.
 * @param backend The backend to be used.
 * @param live The preview being live or not.
 * @param lock The preview being locked to a file or not.
 */
function genTitle(fileName: string, backend: string, live: boolean, lock: boolean) {
  let prefix = backend=="ftml" && live ? `Live ${backend}` : backend;
  prefix = lock ? `[${prefix}]` : prefix;
  return `${prefix} ${fileName}`;
}

/**
 * Generates an HTML body for the preview.
 */
function genHtml(panelInfo: previewInfo) {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wikitext Preview</title>
    <style>
    ${css}
    ${cssponyfill}
    ${collapsible}
    </style>
  </head>
  <body>
  <div id="preview-styles"></div>
  <div id="preview-content">loading...</div>
  <script>
    const vscode = acquireVsCodeApi();
    let state = vscode.getState() || {
      id: "${panelInfo.id}",
      fileName: ${JSON.stringify(panelInfo.fileName)},
      viewColumn: ${panelInfo.viewColumn},
      content: ${JSON.stringify(panelInfo.content)},
      styles: ${JSON.stringify(panelInfo.styles)},
      backend: ${JSON.stringify(panelInfo.backend)},
      live: ${panelInfo.live},
    };
    const ftmlWorker = ${JSON.stringify(ftmlWorker)};
    const previewStyles = document.getElementById('preview-styles');
    const previewContent = document.getElementById('preview-content');
  
    if (state.content) previewContent.innerHTML = state.content;
    if (state.styles) previewStyles.innerHTML = state.styles;
  
    let ftml = new Worker(ftmlWorker, {
      type: 'module',
    });
  
    ftml.addEventListener('message', e => {
      const { html, styles } = e.data;
      previewContent.innerHTML = html;
      previewStyles.innerHTML = styles.map(v=>\`<style>\\n\${v.replace(/\\</g, '&lt;')}\\n</style>\`).join("\\n\\n");
      state.content = html;
      state.styles = previewStyles.innerHTML;
      vscode.setState(state);
    });
  
    window.addEventListener('message', e => {
      const { type, fileName, backend, live, ftmlSource, wdHtml } = e.data;
      switch (type.toLowerCase()) {
        case "meta":
          state.live = live;
          state.backend = backend;
          break;
        case "meta.live":
          state.live = live;
          break;
        case "meta.backend":
          state.backend = backend;
          break;
        case "content":
          switch (backend.toLowerCase()) {
            case "wikidot":
              previewContent.innerHTML = wdHtml;
              state.content = wdHtml;
              break;
            case "ftml":
            default:
              ftml.postMessage(ftmlSource);
              break;
          }
          state.fileName = fileName;
          break;
      }
      vscode.setState(state);
    })
    </script>
  </body>
  </html>`
}

/**
 * Creates a preview panel at the specified column.
 * @param viewColumn Column to create at.
 */
function createPreviewPanel(viewColumn?: number) {
  let backend = `${vscode.workspace.getConfiguration('ftml.preview').get('backend')}`.toLowerCase();
  let panelInfo = {
    id: Math.random().toString(36).substring(4),
    fileName: '',
    viewColumn: viewColumn ?? vscode.ViewColumn.Active,
    content: '',
    styles: '',
    backend: backend == "wikidot" ? "wikidot" : "ftml",
    live: backend == "wikidot" ? false : !!vscode.workspace.getConfiguration('ftml.preview').get('live'),
  }
  while (openPreviews.has(panelInfo.id)) {
    panelInfo.id = Math.random().toString(36).substring(4);
  }

  let locked = !!vscode.workspace.getConfiguration('ftml.preview').get('lock');

  const panel = vscode.window.createWebviewPanel(
    'ftml.preview',
    genTitle(
      basename(panelInfo.fileName),
      panelInfo.backend,
      panelInfo.live,
      locked),
    panelInfo.viewColumn ? panelInfo.viewColumn : vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      enableFindWidget: true,
    }
  );
  openPreviews.add(panelInfo.id);
  idToPreview.set(panelInfo.id, panel);
  idToInfo.set(panelInfo.id, panelInfo);
  
  panel.webview.html = genHtml(panelInfo);
  
  let activeEditor = vscode.window.activeTextEditor;
  if (activeEditor?.document.languageId == 'ftml') {
    panelInfo.fileName = activeEditor.document.fileName;
    serveBackend(panel,
      activeEditor.document.fileName,
      activeEditor.document.getText(),
      panelInfo.backend);
    panel.title = genTitle(
      basename(activeEditor.document.fileName),
      panelInfo.backend,
      panelInfo.live,
      locked);
  }

  if (locked) {
    lockedPreviews.add(panelInfo.id)
  }
  setListeners(panel, panelInfo.id);
}

export {
  previewInfo,
  genTitle,
  genHtml,
  createPreviewPanel,
};
