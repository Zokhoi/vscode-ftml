import ftmlWorker from './ftml.web.worker.js?bundled-worker&dataurl';
import css from './css/wikidot.css';
import collapsible from './css/collapsible.css';

export type previewInfo = {
  id: string,
  fileName: string,
  viewColumn: number,
  content: string,
  styles: string,
  backend: string,
  live: boolean,
}

export function makeTitle(fileName: string, backend: string, live: boolean, lock: boolean) {
  let prefix = live ? `Live ${backend}` : backend;
  prefix = lock ? `[${prefix}]` : prefix;
  return `${prefix} ${fileName}`;
}

export function makeHtml(panelInfo: previewInfo) {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wikitext Preview</title>
    <style>
    ${css}
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
      previewStyles.innerHTML = '';
      for (let i = 0; i < styles.length; i++) {
        previewStyles.innerHTML += \`\\n\\n<style>\\n\${styles[i].replace(/\\</g, '&lt;')}\\n</style>\`;
      }
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
