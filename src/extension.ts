import * as vscode from 'vscode';
import { basename } from 'path';
import { readFileSync } from 'fs';
import getWikidotPreview from './wikidot';
import {
  previewInfo,
  makeHtml,
  makeTitle
} from "./components/preview";
import { parseMetadata } from "./components/source";

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

export function activate(context: vscode.ExtensionContext) {
  let _activePreview: string | undefined = undefined;
  let openPreviews = new Set<string>();
  let idToInfo = new Map<string, previewInfo>();
  let idToPreview = new Map<string, vscode.WebviewPanel>();
  let idToTabChangeListener = new Map<string, vscode.Disposable>();
  let lockedPreviews: Set<string> = new Set(context.workspaceState.get('ftml.lockedPreviews') ?? []);
  
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
      makeTitle(
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
    
    panel.webview.html = makeHtml(panelInfo);
    if (!panelInfo.fileName) {
      let activeEditor = vscode.window.activeTextEditor;
      if (activeEditor?.document.languageId == 'ftml') {
        panelInfo.fileName = activeEditor.document.fileName;
        serveBackend(panel,
          activeEditor.document.fileName,
          activeEditor.document.getText(),
          panelInfo.backend);
        panel.title = makeTitle(
          basename(activeEditor.document.fileName),
          panelInfo.backend,
          panelInfo.live,
          locked);
      }
    } else {
      panel.webview.postMessage({ftmlSource: readFileSync(panelInfo.fileName, 'utf-8')});
    }

    if (locked) {
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
      vscode.commands.executeCommand('setContext', 'ftmlPreviewBackend', panelInfo.backend);
    })
    let docChangeDisposable = vscode.workspace.onDidChangeTextDocument(e=>{
      let panelInfo = idToInfo.get(panelId)!;
      if (lockedPreviews.has(panelId)&&panelInfo.fileName!=e.document.fileName) return;
      if (e.document.languageId == 'ftml') {
        if (panelInfo.backend=='ftml' && panelInfo.live) {
          serveBackend(panel,
            e.document.fileName,
            e.document.getText(),
            panelInfo.backend);
        }
      }
    });
    if (!lockedPreviews.has(panelId)) {
      setTabChangeListener(panel, panelId);
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
      if (idToTabChangeListener.has(panelId)) {
        idToTabChangeListener.get(panelId)?.dispose();
        idToTabChangeListener.delete(panelId);
      }
    })
  }

  function setTabChangeListener(panel: vscode.WebviewPanel, panelId: string) {
    let tabChangeDisposable = vscode.window.onDidChangeActiveTextEditor(e=>{
      if (e?.document.languageId == 'ftml') {
        let panelInfo = idToInfo.get(panelId)!;
        panelInfo.fileName = e.document.fileName;
        if (panelInfo.backend=='ftml' && panelInfo.live) {
          serveBackend(panel,
            panelInfo.fileName,
            e.document.getText(),
            panelInfo.backend);
        }
        panel.title = makeTitle(
          basename(panelInfo.fileName),
          panelInfo.backend,
          panelInfo.live,
          lockedPreviews.has(panelId));
      }
    });
    idToTabChangeListener.set(panelId, tabChangeDisposable);
    if (lockedPreviews.has(panelId)) {
      lockedPreviews.delete(panelId);
      context.workspaceState.update('ftml.lockedPreviews', [...lockedPreviews]);
    }
  }

  function unsetTabChangeListener(panel: vscode.WebviewPanel, panelId: string) {
    idToTabChangeListener.get(panelId)?.dispose();
    idToTabChangeListener.delete(panelId);
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
        let panelInfo = idToInfo.get(_activePreview)!;
        if (lockedPreviews.has(_activePreview)) {
          setTabChangeListener(panel, _activePreview);
          panel.title = makeTitle(
            basename(panelInfo.fileName),
            panelInfo.backend,
            panelInfo.live,
            lockedPreviews.has(_activePreview));
        } else {
          unsetTabChangeListener(panel, _activePreview);
          panel.title = makeTitle(
            basename(panelInfo.fileName),
            panelInfo.backend,
            panelInfo.live,
            lockedPreviews.has(_activePreview));
        }
      }
    }),

    vscode.commands.registerCommand('ftml.preview.toggleLive', () => {
      if (_activePreview) {
        let panel = idToPreview.get(_activePreview)!;
        let panelInfo = idToInfo.get(_activePreview)!;
        panelInfo.live = !panelInfo.live;
        panel.webview.postMessage({
          type: "meta.live",
          live: panelInfo.live,
        })
        panel.title = makeTitle(
          basename(panelInfo.fileName),
          panelInfo.backend,
          panelInfo.live,
          lockedPreviews.has(_activePreview));
      }
    }),

    vscode.commands.registerCommand('ftml.preview.toggleBackend', () => {
      if (_activePreview) {
        let panel = idToPreview.get(_activePreview)!;
        let panelInfo = idToInfo.get(_activePreview)!;
        panelInfo.backend = panelInfo.backend == 'ftml' ? 'wikidot' : 'ftml';
        panel.webview.postMessage({
          type: "meta.backend",
          backend: panelInfo.backend,
        })
        panel.title = makeTitle(
          basename(panelInfo.fileName),
          panelInfo.backend,
          panelInfo.live,
          lockedPreviews.has(_activePreview));
        vscode.commands.executeCommand('setContext', 'ftmlPreviewBackend', panelInfo.backend);
        vscode.commands.executeCommand('ftml.preview.refresh');
      }
    }),

    vscode.commands.registerCommand('ftml.preview.refresh', () => {
      if (_activePreview) {
        let panel = idToPreview.get(_activePreview)!;
        let panelInfo = idToInfo.get(_activePreview)!
        let td = vscode.workspace.textDocuments.find(doc=>doc.fileName==panelInfo.fileName);
        if (td) {
          serveBackend(panel,
            td.fileName,
            td.getText(),
            panelInfo.backend);
        }
      }
    }),
  );
}