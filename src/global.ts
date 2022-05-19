import * as vscode from 'vscode';
import { previewInfo } from "./components/preview";

/**
 * Set the extension context for internal tracking purposes.
 */
function setContext(context: vscode.ExtensionContext) {
  ctx = context;
}

/**
 * Set the currently active preview to the specified one, for internal tracking purposes.
 */
function setActivePreview(previewId: string) {
  activePreview = previewId;
}

/**
 * Inits internal trackers.
 */
function initInfo() {
  openPreviews = new Set<string>();
  idToInfo = new Map<string, previewInfo>();
  idToPreview = new Map<string, vscode.WebviewPanel>();
  idToTabChangeListener = new Map<string, vscode.Disposable>();
  WdRevUriToSourceEditor = new Map<string, vscode.TextEditor>();
  lockedPreviews = new Set();
}

/**
 * Sets some preview panels to be locked, from recovered past session data.
 * @param previewIds The preview panel ids. These are ids we assign.
 */
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
let WdRevUriToSourceEditor: Map<string, vscode.TextEditor>;
let lockedPreviews: Set<string>;

const NOOP = () => {};
const basename = (path: string) => path.split(/[\/\\]/).pop()!;

export {
  ctx,
  setContext,
  initInfo,
  activePreview,
  setActivePreview,
  lockedPreviews,
  setLockedPreviews,
  openPreviews,
  idToInfo,
  idToPreview,
  idToTabChangeListener,
  WdRevUriToSourceEditor,
  NOOP,
  basename,
};