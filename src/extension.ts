import * as vscode from 'vscode';
import yaml from "js-yaml";
import {
  setContext,
  activePreview,
  idToInfo,
  idToPreview,
  openPreviews,
  setLockedPreviews,
  lockedPreviews,
  initInfo,
  basename,
} from "./global";
import {
  genHtml,
  genTitle,
  createPreviewPanel,
  previewInfo,
} from "./components/preview";
import {
  setListeners,
  setTabChangeListener,
  unsetTabChangeListener,
} from "./components/listeners";
import { parseMetadata, serveBackend } from "./components/source";
import { Page } from './wikidot';
import WikidotAuthProvider from './WikidotAuthProvider';

export function activate(context: vscode.ExtensionContext) {
  setContext(context);
  initInfo();
  setLockedPreviews(context.workspaceState.get('ftml.lockedPreviews'));

  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer('ftml.preview', {
      deserializeWebviewPanel(webviewEditor: vscode.WebviewPanel, state: previewInfo) {
        openPreviews.add(state.id);
        idToPreview.set(state.id, webviewEditor);
        idToInfo.set(state.id, state);
        webviewEditor.webview.html = genHtml(state);
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
      if (activePreview) {
        let panel = idToPreview.get(activePreview)!;
        let panelInfo = idToInfo.get(activePreview)!;
        if (lockedPreviews.has(activePreview)) {
          setTabChangeListener(panel, activePreview);
          panel.title = genTitle(
            basename(panelInfo.fileName),
            panelInfo.backend,
            panelInfo.live,
            lockedPreviews.has(activePreview));
        } else {
          unsetTabChangeListener(panel, activePreview);
          panel.title = genTitle(
            basename(panelInfo.fileName),
            panelInfo.backend,
            panelInfo.live,
            lockedPreviews.has(activePreview));
        }
      }
    }),

    vscode.commands.registerCommand('ftml.preview.toggleLive', () => {
      if (activePreview) {
        let panel = idToPreview.get(activePreview)!;
        let panelInfo = idToInfo.get(activePreview)!;
        panelInfo.live = !panelInfo.live;
        panel.webview.postMessage({
          type: "meta.live",
          live: panelInfo.live,
        })
        panel.title = genTitle(
          basename(panelInfo.fileName),
          panelInfo.backend,
          panelInfo.live,
          lockedPreviews.has(activePreview));
      }
    }),

    vscode.commands.registerCommand('ftml.preview.toggleBackend', () => {
      if (activePreview) {
        let panel = idToPreview.get(activePreview)!;
        let panelInfo = idToInfo.get(activePreview)!;
        panelInfo.backend = panelInfo.backend == 'ftml' ? 'wikidot' : 'ftml';
        panel.webview.postMessage({
          type: "meta.backend",
          backend: panelInfo.backend,
        })
        panel.title = genTitle(
          basename(panelInfo.fileName),
          panelInfo.backend,
          panelInfo.live,
          lockedPreviews.has(activePreview));
        vscode.commands.executeCommand('setContext', 'ftmlPreviewBackend', panelInfo.backend);
        vscode.commands.executeCommand('ftml.preview.refresh');
      }
    }),

    vscode.commands.registerCommand('ftml.preview.refresh', () => {
      if (activePreview) {
        let panel = idToPreview.get(activePreview)!;
        let panelInfo = idToInfo.get(activePreview)!
        let td = vscode.workspace.textDocuments.find(doc=>doc.fileName==panelInfo.fileName);
        if (td) {
          serveBackend(panel,
            td.fileName,
            td.getText(),
            panelInfo.backend);
        }
      }
    }),

    vscode.commands.registerCommand('ftml.remote.wikidot.login', () => {
      WikidotAuthProvider.createSession().catch(e=>{
        if (e instanceof Error) {
          vscode.window.showErrorMessage(e.toString());
        }
      });
    }),

    vscode.commands.registerCommand('ftml.remote.wikidot.fetch', () => {
      let activeEditor = vscode.window.activeTextEditor;
      if (activeEditor?.document.languageId == "ftml") {
        vscode.authentication.getSession('wikidot', [], {
          clearSessionPreference: true,
          createIfNone: true,
        }).then(async sess=>{
          let data = parseMetadata(activeEditor!.document.getText());
          if (!data.page) data.page = basename(activeEditor!.document.fileName).split('.')[0];
          data = await Page.getMetadata({
            wikiSite: data.site,
            wikiPage:data.page,
            session: sess.accessToken});
          let source = await Page.getSource(data.site, data.page);
          activeEditor!.edit(builder=>{
            builder.delete(activeEditor!.document.lineAt(activeEditor!.document.lineCount-1).rangeIncludingLineBreak
                .union(new vscode.Range(0,0,activeEditor!.document.lineCount-1,0)))
            builder.insert(new vscode.Position(0,0), `---\n${yaml.dump(data)}---\n${source}`);
              
          })
        }).catch(e=>{
          if (e instanceof Error) {
            vscode.window.showErrorMessage(e.toString());
          }
        });
      }
    }),

    vscode.commands.registerCommand('ftml.remote.wikidot.push', () => {
      let activeEditor = vscode.window.activeTextEditor;
      if (activeEditor?.document.languageId == "ftml") {
        vscode.authentication.getSession('wikidot', [], {
          clearSessionPreference: true,
          createIfNone: true
        }).then(async sess=>{
          let data = parseMetadata(activeEditor!.document.getText())
          Page.edit({
            wikiSite: data.site,
            wikiPage: data.page,
            session: sess.accessToken, }, data).then(()=>{
              vscode.window.showInformationMessage(`Page successfully pushed to ${data.page} on ${data.site}.`)
            }).catch(async e=>{
              if (e.src.status == "not_ok") {
                // Wikidot now dies when new page is created with tags in its options
                // Redo edit with seperate processing of page creation and tags
                let tags = data.tags;
                delete data.tags;
                await new Promise(res=>setTimeout(res, 3000));
                Page.edit({
                  wikiSite: data.site,
                  wikiPage: data.page,
                  session: sess.accessToken, }, data);
                await new Promise(res=>setTimeout(res, 3000));
                Page.edit({
                  wikiSite: data.site,
                  wikiPage: data.page,
                  session: sess.accessToken, }, {
                  ...data,
                  tags
                }).then(()=>{
                  vscode.window.showInformationMessage(`Page successfully pushed to ${data.page} on ${data.site}.`)
                });
              } else {
                vscode.window.showErrorMessage(`${e.src.status}: ${e.message}`);
              }
            });
        }).catch(e=>{
          if (e instanceof Error) {
            vscode.window.showErrorMessage(e.toString());
          }
        });
      }
    }),

    vscode.authentication.registerAuthenticationProvider(
      'wikidot',
      'Wikidot',
      WikidotAuthProvider,
      { supportsMultipleAccounts: true }),
  );
}