import * as vscode from 'vscode';
import ftmlWorker from './ftml.web.worker.js?bundled-worker&dataurl';
import css from './css/wikidot.css';
import collapsible from './css/Collapsible.css';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('ftmlPreview.start', () => {
      const panel = vscode.window.createWebviewPanel(
        'ftmlPreview',
        'Wikitext Preview',
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
        }
      );

      panel.webview.html = baseHtml;
      let activeEditor = vscode.window.activeTextEditor;
      if (activeEditor?.document.languageId == 'ftml') {
        panel.webview.postMessage({ftmlSource: activeEditor.document.getText()});
      }

      vscode.workspace.onDidChangeTextDocument(e=>{
        if (e.document.languageId == 'ftml') {
          panel.webview.postMessage({ftmlSource: e.document.getText()});
        }
      });

      vscode.window.onDidChangeActiveTextEditor(e=>{
        if (e?.document.languageId == 'ftml') {
          panel.webview.postMessage({ftmlSource: e.document.getText()});
        }
      });
    })
  );
}

const baseHtml = `<!DOCTYPE html>
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
  const ftmlWorker = ${JSON.stringify(ftmlWorker)};
  const previewStyles = document.getElementById('preview-styles');
  const previewContent = document.getElementById('preview-content');

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
  });

  window.addEventListener('message', e => {
    const { ftmlSource } = e.data;
    ftml.postMessage(ftmlSource);
  })
  </script>
</body>
</html>`