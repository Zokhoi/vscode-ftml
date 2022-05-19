import * as vscode from 'vscode';
import {
  ctx,
  idToInfo,
  idToTabChangeListener,
  openPreviews,
  lockedPreviews,
  setActivePreview,
  basename,
} from "../global";
import { serveBackend } from "./source";
import { genTitle } from "./preview";


/**
 * Returns a function, that, as long as it continues to be invoked, will not
 * be triggered. The function will be called once only every N milliseconds.
 * If `immediate` is passed, trigger the function on the
 * leading edge, instead of the trailing.
 */
function debounce(func: (...args: any[])=>any, wait: number, immediate?: boolean): (...args: any[])=>any {
	let timeout: NodeJS.Timeout | null;
  let currentArgs: any[];
	return function(...args) {
		let context = this;
		let later = function() {
			timeout = null;
			if (!immediate) return func.apply(context, currentArgs);
		};
		let callNow = immediate && !timeout;
		if (!timeout) timeout = setTimeout(later, wait);
    currentArgs = args;
		if (callNow) return func.apply(context, currentArgs);
	};
};

const serveBackendDebounced = debounce(serveBackend, 250);

/**
 * Sets all the source change listeners for a preview panel.
 * @param panel The preview panel.
 * @param panelId The preview panel id. This is an id we assign.
 */
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
    if (lockedPreviews.has(panelId) && panelInfo.fileName!=e.document.fileName) return;
    if (e.document.languageId == 'ftml') {
      if (panelInfo.backend=='ftml' && panelInfo.live) {
        serveBackendDebounced(panel,
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

/**
 * Sets only the tab change listener for a preview panel.
 * @param panel The preview panel.
 * @param panelId The preview panel id. This is an id we assign.
 */
function setTabChangeListener(panel: vscode.WebviewPanel, panelId: string) {
  let tabChangeDisposable = vscode.window.onDidChangeActiveTextEditor(e=>{
    if (e?.document.languageId == 'ftml') {
      let panelInfo = idToInfo.get(panelId)!;
      panelInfo.fileName = e.document.fileName;
      if (panelInfo.backend=='ftml' && panelInfo.live) {
        serveBackendDebounced(panel,
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

/**
 * Unsets only the tab change listener for a preview panel.
 * @param panel The preview panel.
 * @param panelId The preview panel id. This is an id we assign.
 */
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