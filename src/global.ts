import * as vscode from 'vscode';
import { previewInfo } from "./components/preview";

function setContext(context: vscode.ExtensionContext) {
  ctx = context;
}
function setActivePreview(previewId: string) {
  activePreview = previewId;
}
function initInfo() {
  openPreviews = new Set<string>();
  idToInfo = new Map<string, previewInfo>();
  idToPreview = new Map<string, vscode.WebviewPanel>();
  idToTabChangeListener = new Map<string, vscode.Disposable>();
  lockedPreviews = new Set();
}
function setLockedPreviews(previewIds: string[] | undefined) {
  if (previewIds) {
    for (let i = 0; i < previewIds.length; i++) {
      lockedPreviews.add(previewIds[i]);
    }
  }
}

let ctx: vscode.ExtensionContext;
let activePreview: string;
let openPreviews: Set<string>;
let idToInfo: Map<string, previewInfo>;
let idToPreview: Map<string, vscode.WebviewPanel>;
let idToTabChangeListener: Map<string, vscode.Disposable>;
let lockedPreviews: Set<string>;

export {
  initInfo,
  ctx,
  setContext,
  activePreview,
  setActivePreview,
  lockedPreviews,
  setLockedPreviews,
  openPreviews,
  idToInfo,
  idToPreview,
  idToTabChangeListener,
};