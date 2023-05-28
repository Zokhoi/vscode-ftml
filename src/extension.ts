import * as vscode from 'vscode';
import * as yaml from "js-yaml";
import { diffLines } from "diff";
import {
  setContext,
  activePreview,
  idToInfo,
  idToPreview,
  openPreviews,
  setLockedPreviews,
  lockedPreviews,
  WdRevUriToSourceEditor,
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
import { parsePageData, serveBackend } from "./components/source";
import * as wikidot from './wikidot/interface';
import WikidotAuthProvider from './wikidot/WikidotAuthProvider';
import { toWikidotRevUri, WikidotRevContentProvider } from './wikidot/WikidotRevContentProvider';

export function activate(context: vscode.ExtensionContext) {
  setContext(context);
  initInfo();
  setLockedPreviews(context.workspaceState.get('ftml.lockedPreviews'));
  let WdAuthProvider = new WikidotAuthProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer('ftml.preview', {
      async deserializeWebviewPanel(webviewEditor: vscode.WebviewPanel, state: previewInfo) {
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
      WdAuthProvider.createSession().catch(e=>{
        if (e instanceof Error) {
          vscode.window.showErrorMessage(e.toString());
        }
      });
    }),

    vscode.commands.registerCommand('ftml.remote.wikidot.logout', () => {
      vscode.authentication.getSession('wikidot', [], {
        clearSessionPreference: true,
        createIfNone: true,
      }).then(sess=>{
        if (sess) {
          WdAuthProvider.removeSession(sess.id).catch(e=>{
            if (e instanceof Error) {
              vscode.window.showErrorMessage(e.toString());
            }
          });
        }
      })
      
    }),

    vscode.commands.registerCommand('ftml.remote.wikidot.switchAccount', () => {
      vscode.authentication.getSession('wikidot', [], {
        clearSessionPreference: true,
        createIfNone: true,
      })
    }),

    vscode.commands.registerCommand('ftml.remote.wikidot.fetch', (_ctxWindow?: vscode.Uri, _ctxWindowGroup?: any, fetchedData?: wikidot.PageMetadata) => {
      let activeEditor = vscode.window.activeTextEditor;
      if (activeEditor?.document.languageId == "ftml") {
        let accountSelect: boolean = !!vscode.workspace.getConfiguration('ftml.remote.sync').get('accountSelect');
        vscode.authentication.getSession('wikidot', [], {
          clearSessionPreference: accountSelect,
          createIfNone: true,
        }).then(sess=>{
          let data = parsePageData(activeEditor!.document.getText());
          if (!data.page) data.page = basename(activeEditor!.document.fileName).split('.')[0];
          vscode.window.withProgress({
            cancellable: false,
            location: vscode.ProgressLocation.Notification
          }, async (prog)=>{
            prog.report({message: `Fetching page ${data.page} from ${data.site}...`});
            let fetched = fetchedData ?? await wikidot.Page.getMetadata({
              wikiSite: data.site,
              wikiPage: data.page,
              session: sess.accessToken,
              checkExist: true })
            if (!fetched.exist) {
              vscode.window.showInformationMessage(`The remote page ${data.page} does not exist on site ${data.site}.`);
              return;
            };
            if (data.revision === undefined || fetched.revision === undefined || fetched.revision !== undefined && (data.revision < fetched.revision)) {
              let answer = await vscode.window.showWarningMessage(`The remote page ${data.page} has a revision newer than the local copy. Please choose an action.`, "Open diff editor", "Overwrite content", "Cancel");
              switch (answer) {
                case "Open diff editor":
                  WdRevUriToSourceEditor.set(toWikidotRevUri(data.site, data.page).toString(), activeEditor!);
                  await vscode.commands.executeCommand(
                    "vscode.diff",
                    activeEditor!.document.uri,
                    toWikidotRevUri(data.site, data.page),
                    `${basename(activeEditor!.document.fileName)} ← ${data.page}`);
                  break;
                case "Overwrite content":
                  delete fetched.exist;
                  let source = await wikidot.Page.getSource(data.site, data.page);
                  for (const key in data) {
                    if (key!="source" && !Object.prototype.hasOwnProperty.call(fetched, key)) { fetched[key] = data[key]; }
                  }
                  await activeEditor!.edit(builder=>{
                    builder.delete(activeEditor!.document.lineAt(activeEditor!.document.lineCount-1).rangeIncludingLineBreak
                        .union(new vscode.Range(0,0,activeEditor!.document.lineCount-1,0)))
                    builder.insert(new vscode.Position(0,0), `---\n${yaml.dump(fetched)}---\n${source}`);
                  })
                  break;
                case "Cancel":
                default:
                  break;
              }
              return;
            } else if (data.revision !== undefined && fetched.revision !== undefined && data.revision >= fetched.revision) {
              vscode.window.showInformationMessage(`Your local copy of ${data.page} is already at the latest version.`);
              return;
            };
            
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
        let accountSelect: boolean = !!vscode.workspace.getConfiguration('ftml.remote.sync').get('accountSelect');
        vscode.authentication.getSession('wikidot', [], {
          clearSessionPreference: accountSelect,
          createIfNone: true
        }).then(async sess=>{
          let data = parsePageData(activeEditor!.document.getText());
          vscode.window.withProgress({
            cancellable: false,
            location: vscode.ProgressLocation.Notification
          }, async (prog)=>{
            prog.report({message: `Pushing to page ${data.page} on ${data.site}...`});
            try {
              let fetched = await wikidot.Page.getMetadata({
                wikiSite: data.site,
                wikiPage: data.page,
                session: sess.accessToken,
                checkExist: true })
              if (fetched.revision !== undefined && (data.revision === undefined || data.revision < fetched.revision)) {
                let answer = await vscode.window.showWarningMessage(`The remote page ${data.page} has a revision newer than the local copy. Please choose an action.`, "Fetch remote page", "Overwrite remote page", "Cancel");
                switch (answer) {
                  case "Cancel":
                    return;
                  case "Fetch remote page":
                    return vscode.commands.executeCommand('ftml.remote.wikidot.fetch', activeEditor!.document.uri, undefined, fetched);
                  case "Overwrite remote page":
                  default:
                    break;
                }
              }
              await wikidot.Page.edit({
                wikiSite: data.site,
                wikiPage: data.page,
                session: sess.accessToken, }, {
                  ...data,
                  parentPage: data.parent,
                })
            } catch (e) {
              if (e.src?.status == "not_ok") {
                // Wikidot now dies when new page is created with tags in its options
                // Redo edit with seperate processing of page creation and tags
                let tags = data.tags;
                delete data.tags;
                await new Promise(res=>setTimeout(res, 3000));
                await wikidot.Page.edit({
                  wikiSite: data.site,
                  wikiPage: data.page,
                  session: sess.accessToken, }, {
                    ...data,
                    parentPage: data.parent,
                  });
                await new Promise(res=>setTimeout(res, 3000));
                await wikidot.Page.edit({
                  wikiSite: data.site,
                  wikiPage: data.page,
                  session: sess.accessToken, }, {
                  ...data,
                  parentPage: data.parent,
                  tags
                })
              } else {
                if (typeof e.src?.status == 'number') {
                  if (e.src.status != 500) {
                    vscode.window.showErrorMessage(`Error code ${e.src.status}`)
                  }
                } else vscode.window.showErrorMessage(`${e.src?.status}: ${e.message}`);
                return;
              }
            }
            await new Promise(res=>setTimeout(res, 3000));
            let fetched = await wikidot.Page.getMetadata({
              wikiSite: data.site,
              wikiPage: data.page,
              session: sess.accessToken});
            for (const key in data) {
              if (key!="source" && !Object.prototype.hasOwnProperty.call(fetched, key)) { fetched[key] = data[key]; }
            }
            await activeEditor!.edit(builder=>{
              builder.delete(activeEditor!.document.lineAt(activeEditor!.document.lineCount-1).rangeIncludingLineBreak
                  .union(new vscode.Range(0,0,activeEditor!.document.lineCount-1,0)))
              builder.insert(new vscode.Position(0,0), `---\n${yaml.dump(fetched)}---\n${data.source}`);
            })
            if (!activeEditor!.document.isUntitled) await activeEditor!.document.save();
          })
        }).catch(e=>{
          if (e instanceof Error) {
            vscode.window.showErrorMessage(e.toString());
          }
        });
      }
    }),

    vscode.commands.registerCommand('ftml.diff.merge.selected', async () => {
      let rhsEditor = vscode.window.activeTextEditor;
      if (!rhsEditor) return;
      if (!WdRevUriToSourceEditor.get(rhsEditor.document.uri.toString())) return;
      let lhsEditor = vscode.window.visibleTextEditors.find(e=>e.document.uri.toString() === WdRevUriToSourceEditor.get(rhsEditor!.document.uri.toString())!.document.uri.toString())!
      let countNew = 0, countOld = 0;
      let changes = diffLines(lhsEditor.document.getText().replace(/\r\n/g, "\n"), rhsEditor.document.getText().replace(/\r\n/g, "\n")).map(v=>{
        v.atNewLine = countNew;
        v.atOldLine = countOld;
        if (v.added) {
          countNew += v.count!;
        } else if (v.removed) {
          countOld += v.count!;
        } else {
          countNew += v.count!;
          countOld += v.count!;
        }
        return v;
      });
      await lhsEditor.edit(builder=>{
        try {
          for (let i = 0; i < rhsEditor!.selections.length; i++) {
            let startline = rhsEditor!.document.lineAt(rhsEditor!.selections[i].start);
            let endline = rhsEditor!.document.lineAt(rhsEditor!.selections[i].end);
            let startchange = changes.findIndex(v=>(v.added || !v.added && !v.removed) && v.atNewLine+v.count!>startline.lineNumber)!;
            let endchange = changes.findIndex(v=>(v.added || !v.added && !v.removed) && v.atNewLine+v.count!>endline.lineNumber)!;
            if (changes.filter((_, i)=> i>=startchange && i<=endchange).every(v=>!v.added && !v.removed)) continue;
            if (startchange>0 && changes[startchange-1].removed) --startchange;
            let insertOnly = changes.filter((_, i)=> i>=startchange && i<=endchange).every(v=>v.added);
            let startlinenum = changes[startchange].atOldLine;
            let endlinenum = insertOnly ? changes[endchange].atOldLine : changes[endchange].atOldLine-1;
            if (!changes[startchange].added && !changes[startchange].removed) {
              startlinenum += startline.lineNumber-changes[startchange].atNewLine;
            }
            if (!changes[endchange].added && !changes[endchange].removed) {
              endlinenum += endline.lineNumber-changes[endchange].atNewLine+1;
            }
            let remove = lhsEditor.document.lineAt(startlinenum).range.union( lhsEditor.document.lineAt(endlinenum).range );
            if (insertOnly) {
              builder.insert(remove.start, rhsEditor!.document.getText(startline.range.union(endline.rangeIncludingLineBreak)));
            } else {
              builder.replace(remove, rhsEditor!.document.getText(startline.range.union(endline.range)));
            }
          }
        } catch (e) {
          vscode.window.showErrorMessage(e.message);
        }
      })
    }),

    vscode.commands.registerCommand('ftml.diff.merge.all', async () => {
      let rhsEditor = vscode.window.activeTextEditor;
      if (!rhsEditor) return;
      if (!WdRevUriToSourceEditor.get(rhsEditor.document.uri.toString())) return;
      let lhsEditor = vscode.window.visibleTextEditors.find(
        e=>e.document.uri.toString() === WdRevUriToSourceEditor.get(rhsEditor!.document.uri.toString())!.document.uri.toString())!
      await lhsEditor.edit(builder=>{
        builder.delete(lhsEditor.document.lineAt(lhsEditor.document.lineCount-1).rangeIncludingLineBreak
            .union(new vscode.Range(0,0,lhsEditor.document.lineCount-1,0)))
        builder.insert(new vscode.Position(0,0), rhsEditor!.document.getText());
      })
    }),

    vscode.commands.registerCommand('ftml.diff.save', async () => {
      let savingEditor = vscode.window.activeTextEditor;
      if (!savingEditor) return;
      if (WdRevUriToSourceEditor.get(savingEditor.document.uri.toString())) {
        savingEditor = vscode.window.visibleTextEditors.find(
          e=>e.document.uri.toString() === WdRevUriToSourceEditor.get(savingEditor!.document.uri.toString())!.document.uri.toString())!
      }
      await savingEditor.document.save();
    }),

    vscode.authentication.registerAuthenticationProvider(
      'wikidot',
      'Wikidot',
      WdAuthProvider,
      { supportsMultipleAccounts: true }),
    
    vscode.workspace.registerTextDocumentContentProvider("wikidot-rev", new WikidotRevContentProvider()),

    vscode.workspace.onDidCloseTextDocument(e =>{
      if (e.uri.scheme == "wikidot-rev" && WdRevUriToSourceEditor.has(e.uri.toString())) {
        WdRevUriToSourceEditor.delete(e.uri.toString());
      }
    }),
  );
}