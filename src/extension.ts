import * as vscode from 'vscode';
import { basename } from 'path';
import ftmlWorker from './ftml.web.worker.js?bundled-worker&dataurl';
import { readFileSync } from 'fs';
import css from './css/wikidot.css';
import collapsible from './css/collapsible.css';

type previewInfo = {
  id: string,
  fileUri: string,
  viewColumn: number,
  content: string,
  styles: string
}

function escapeBacktick(value: string | vscode.Uri): string {
  return value.toString().replace(/`/g, '&#96;');
}

export function activate(context: vscode.ExtensionContext) {
  let _activePreview: string | undefined = undefined;
  let openPreviews = new Set<string>();
  let idToInfo = new Map<string, previewInfo>();
  let idToPreview = new Map<string, vscode.WebviewPanel>();
  let previewListeners = new Map<string, vscode.Disposable | undefined>();
  let lockedPreviews: Set<string> = new Set(context.workspaceState.get('ftml.lockedPreviews') ?? []);
  
  function createPreviewPanel(viewColumn?: number) {
    let panelInfo = {
      id: Math.random().toString(36).substring(4),
      fileUri: '',
      viewColumn: viewColumn ?? vscode.ViewColumn.Active,
      content: '',
      styles: ''
    }
    while (openPreviews.has(panelInfo.id)) {
      panelInfo.id = Math.random().toString(36).substring(4);
    }

    const panel = vscode.window.createWebviewPanel(
      'ftml.preview',
      panelInfo.fileUri ? `Preview ${basename(panelInfo.fileUri)}` : 'Wikitext Preview',
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
    
    panel.webview.html = makeHtml(panelInfo);
    if (!panelInfo.fileUri) {
      let activeEditor = vscode.window.activeTextEditor;
      if (activeEditor?.document.languageId == 'ftml') {
        panelInfo.fileUri = activeEditor.document.fileName;
        panel.webview.postMessage({
          fileUri: activeEditor.document.uri,
          ftmlSource: activeEditor.document.getText()
        });
        panel.title = `Preview ${basename(activeEditor.document.fileName)}`;
      }
    } else {
      panel.webview.postMessage({ftmlSource: readFileSync(panelInfo.fileUri, 'utf-8')});
    }

    if (vscode.workspace.getConfiguration('ftml.preview').get('lock')) {
      lockedPreviews.add(panelInfo.id)
    }
    setListeners(panel, panelInfo.id);
  }

  function setListeners(panel: vscode.WebviewPanel, panelId: string) {
    let viewChangeDisposable = panel.onDidChangeViewState(_=>{
      vscode.commands.executeCommand('setContext', 'ftmlPreviewFocus', panel.active);
      if (panel.active) _activePreview = panelId;
      let panelInfo = idToInfo.get(panelId)!;
      panelInfo.viewColumn = panel.viewColumn ?? panelInfo.viewColumn;
      idToInfo.set(panelId, panelInfo);
    })
    let docChangeDisposable = vscode.workspace.onDidChangeTextDocument(e=>{
      if (e.document.languageId == 'ftml') {
        panel.webview.postMessage({
          fileUri: e.document.uri,
          ftmlSource: e.document.getText()
        });
      }
    });
    let tabChangeDisposable: vscode.Disposable | undefined = undefined;
    if (!lockedPreviews.has(panelId)) {
      tabChangeDisposable = setTabChangeListener(panel, panelId);
    }

    panel.onDidDispose(()=>{
      openPreviews.delete(panelId);
      
      if (lockedPreviews.has(panelId)) {
        lockedPreviews.delete(panelId);
        context.workspaceState.update('ftml.lockedPreviews', [...lockedPreviews]);
      }
      context.workspaceState.update(`ftml.previews.${panelId}`, undefined);
      viewChangeDisposable.dispose();
      docChangeDisposable.dispose();
      tabChangeDisposable?.dispose();
    })
  }

  function setTabChangeListener(panel: vscode.WebviewPanel, panelId: string) {
    let tabChangeDisposable = vscode.window.onDidChangeActiveTextEditor(e=>{
      if (e?.document.languageId == 'ftml') {
        let panelInfo = idToInfo.get(panelId)!;
        panelInfo.fileUri = e.document.fileName;
        panel.webview.postMessage({
          fileUri: e.document.uri,
          ftmlSource: e.document.getText()
        });
        panel.title = `Preview ${basename(e.document.fileName)}`;
      }
    });
    previewListeners.set(panelId, tabChangeDisposable);
    if (lockedPreviews.has(panelId)) {
      lockedPreviews.delete(panelId);
      context.workspaceState.update('ftml.lockedPreviews', [...lockedPreviews]);
    }
    return tabChangeDisposable;
  }

  function unsetTabChangeListener(panel: vscode.WebviewPanel, panelId: string) {
    previewListeners.get(panelId)?.dispose();
    previewListeners.set(panelId, undefined);
    if (!lockedPreviews.has(panelId)) {
      lockedPreviews.add(panelId);
      context.workspaceState.update('ftml.lockedPreviews', [...lockedPreviews]);
    }
  }


  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer('ftml.preview', {
      deserializeWebviewPanel(webviewEditor: vscode.WebviewPanel, state: unknown) {
        openPreviews.add(state.id);
        idToPreview.set(state.id, webviewEditor);
        idToInfo.set(state.id, state);
        webviewEditor.webview.html = makeHtml(state);
        setListeners(webviewEditor, state.id);
      }
    }),

    vscode.commands.registerCommand('ftml.preview.open', () => {
      createPreviewPanel();
    }),

    vscode.commands.registerCommand('ftml.preview.openToSide', () => {
      createPreviewPanel(vscode.ViewColumn.Beside);
    }),

    vscode.commands.registerCommand('ftml.preview.toggleLock', () => {
      if (_activePreview) {
        let panel = idToPreview.get(_activePreview)!;
        if (lockedPreviews.has(_activePreview)) {
          setTabChangeListener(panel, _activePreview);
        } else {
          unsetTabChangeListener(panel, _activePreview);
        }
      }
    })
  );
}

function makeHtml(panelInfo: previewInfo) {
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
      fileUri: "${escapeBacktick(panelInfo.fileUri)}",
      viewColumn: ${panelInfo.viewColumn},
      content: \`${escapeBacktick(panelInfo.content)}\`,
      styles: \`${escapeBacktick(panelInfo.styles)}\`
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
      const { fileUri , ftmlSource } = e.data;
      ftml.postMessage(ftmlSource);
      state.fileUri = fileUri;
      vscode.setState(state);
    })
    </script>
  </body>
  </html>`
}
