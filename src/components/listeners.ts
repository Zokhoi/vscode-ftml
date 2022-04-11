import * as vscode from 'vscode';
import { basename } from 'path';
import {
  ctx,
  idToInfo,
  idToTabChangeListener,
  openPreviews,
  lockedPreviews,
  setActivePreview
} from "../global";
import { serveBackend } from "./source";
import { genTitle } from "./preview";

function setListeners(panel: vscode.WebviewPanel, panelId: string) {
  let viewChangeDisposable = panel.onDidChangeViewState(_=>{
    vscode.commands.executeCommand('setContext', 'ftmlPreviewFocus', panel.active);
    if (panel.active) setActivePreview(panelId);
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
      ctx.workspaceState.update('ftml.lockedPreviews', [...lockedPreviews]);
    }
    ctx.workspaceState.update(`ftml.previews.${panelId}`, undefined);
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
      panel.title = genTitle(
        basename(panelInfo.fileName),
        panelInfo.backend,
        panelInfo.live,
        lockedPreviews.has(panelId));
    }
  });
  idToTabChangeListener.set(panelId, tabChangeDisposable);
  if (lockedPreviews.has(panelId)) {
    lockedPreviews.delete(panelId);
    ctx.workspaceState.update('ftml.lockedPreviews', [...lockedPreviews]);
  }
}

function unsetTabChangeListener(panel: vscode.WebviewPanel, panelId: string) {
  idToTabChangeListener.get(panelId)?.dispose();
  idToTabChangeListener.delete(panelId);
  if (!lockedPreviews.has(panelId)) {
    lockedPreviews.add(panelId);
    ctx.workspaceState.update('ftml.lockedPreviews', [...lockedPreviews]);
  }
}

export {
  setListeners,
  setTabChangeListener,
  unsetTabChangeListener,
};