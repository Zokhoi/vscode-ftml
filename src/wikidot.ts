import * as vscode from "vscode";
import fetch from "./cross-fetch.js?cross";
import { load } from "cheerio";
const urljoin = (...parts: string[]) => {
  let begin = parts.shift()?.replace(/\/+$/, '');
  let end = parts.pop()?.replace(/^\/+/, '');
  parts = parts.map(v=>v.replace(/(^\/+)|(\/+$)/, '')).filter(v=>!!v);
  return begin + '/' + parts.join('/') + '/' + end;
}

interface PageMetadata {
  site: string;
  page: string;
  title?: string;
  parent?: string;
  tags?: string[] | string;
}

interface PageData extends PageMetadata {
  source: string;
  comments?: string;
}

interface Response {
  status: string;
  CURRENT_TIMESTAMP: number;
  callbackIndex: string;
  message?: string;
  body?: any;
  jsInclude?: string[];
  cssInclude?: string[];
  [x: string]: unknown;
}

interface Session {
  session_id: string;
  session_expire: string;
  session_expire_date: Date;
  session_auth: string;
}

class WikidotError extends Error {
  site?: string;
  page?: string | number;
  constructor(options: {site?: string, page?: string | number}, message?: string) {
    super(message)
    this.site = options.site;
    this.page = options.page;
  }
}
class WikidotAjaxError extends WikidotError {
  src: Response;
  constructor(rawResponse: Response, site?: string) {
    super({site}, rawResponse.message);
    this.src = rawResponse;
  }
}

async function Ajax(info: {wikiSite: string, session?: string}, params: any): Promise<Response> {
  if (!info.wikiSite.startsWith("http")) { info.wikiSite = `http://${info.wikiSite}.wikidot.com` }
  const wikidotToken7 = Math.random().toString(36).substring(4);
  params = Object.assign({
    wikidot_token7: wikidotToken7,
    callbackIndex: 0,
  }, params);
  let body = new URLSearchParams();
  for (const key in params) { body.append(key, params[key]) }
  let res: Response = await (await fetch(urljoin(info.wikiSite, "ajax-module-connector.php"), {
    headers: {
      'User-Agent': 'vscode-ftml/0.0.1',
      Referer: 'vscode-ftml',
      Cookie: `wikidot_token7=${wikidotToken7}; ${info.session ?? ''}`,
    },
    method: "POST",
    body,
  })).json();
  if (res.status != "ok") throw new WikidotAjaxError(res, info.wikiSite);
  return res;
}

async function AjaxModule(info: {wikiSite: string, session?: string}, moduleName: string, params: any) {
  return await Ajax(info, Object.assign({
    moduleName,
  }, params));
}

async function AjaxAction(info: {wikiSite: string, session?: string}, action: string, params: any) {
  return await Ajax(info, Object.assign({
    moduleName: "empty",
    action,
  }, params));
}

async function login(username: string, password: string): Promise<Session> {
  const wikidotToken7 = Math.random().toString(36).substring(4);
  let params = Object.assign({
    login: username,
    password: password,
    action: 'Login2Action',
    event: 'login',
    wikidot_token7: wikidotToken7,
    callbackIndex: '0'
  });
  let body = new URLSearchParams();
  for (const key in params) { body.append(key, params[key]) }
  let res = await fetch('https://www.wikidot.com/default--flow/login__LoginPopupScreen', {
    headers: {
      'User-Agent': 'vscode-ftml/0.0.1',
      Referer: 'vscode-ftml',
      Cookie: `wikidot_token7=${wikidotToken7}`
    },
    method: "POST",
    body,
  })
  let resbody = await res.text();
  if (resbody.includes("The login and password do not match.")) {
    throw new Error("The login and password do not match.");
  }
  let tmp = res.headers.get('set-cookie').split("WIKIDOT_SESSION_ID=")[1].split("; ")
  let session_id = `WIKIDOT_SESSION_ID=${tmp[0]}`;
  let session_expire = tmp[1].split("=")[1];
  return {
    session_id,
    session_expire,
    session_expire_date: new Date(session_expire),
    session_auth: `${session_id}; wikidot_udsession=1`,
  }
}

async function loginPrompt() {
  let username = await vscode.window.showInputBox({
    title: "Login to wikidot",
    placeHolder: "Your wikidot username",
  })
  if (!username) return;
  let password = await vscode.window.showInputBox({
    title: "Login to wikidot",
    placeHolder: "Your wikidot password",
    password: true,
  })
  if (!password) return;
  login(username, password).catch(e=>{
    vscode.window.showErrorMessage(`Wikidot error: ${e.message}`);
  });
}

async function getUserInfo(username: string) {
  let unixname = username.trim().replace(/[^\w]+/g, '-').replace(/^\-+/, '').replace(/\-+$/, '');
  let pg = await (await fetch("https://www.wikidot.com/user:info/"+unixname)).text();
  return {
    name: load(pg)("h1.profile-title")?.text().replace(/\n/g, '').trim(),
    unixname,
    id: pg.match(/USERINFO\.userId\s*\=\s*(\d+)\s*\;/)?.[1],
  }
}
  
async function getPreview({source, wikiPage, wikiSite}: {
  source: string;
  wikiPage?: string;
  wikiSite: string;
}): Promise<string> {
  let res = await AjaxModule({ wikiSite }, "edit/PagePreviewModule", {
    mode: "page",
    page_unix_name: wikiPage ?? "",
    source: source,
  });
  return res.body;
}

namespace Page {
  export async function getHtml(info: {wikiSite: string, wikiPage: string, session?: string}) {
    if (!info.wikiSite.startsWith("http")) { info.wikiSite = `http://${info.wikiSite}.wikidot.com` }
    info.wikiPage = `${info.wikiPage}/norender/true`;
    return await (await fetch(urljoin(info.wikiSite, info.wikiPage), {
      headers: {
        'User-Agent': 'vscode-ftml/0.0.1',
        Referer: 'vscode-ftml',
        Cookie: info.session,
      },
    })).text();
  }
  
  export async function getId(wikiSite: string, wikiPage: string) {
    let chpg = load(await getHtml({wikiSite, wikiPage}));
    let pageId = chpg(chpg("head").children("script")
          .filter((_,el)=>chpg(el).html()!.includes("WIKIREQUEST"))).html()!
          .match(/WIKIREQUEST\.info\.pageId\s*=\s*(\d+)\s*;/)?.[1];
    return pageId;
  }
  
  export async function getMetadata(info: {wikiSite: string, wikiPage: string, session?: string}) {
    let meta: PageMetadata = {
      site: info.wikiSite,
      page: info.wikiPage,
    };
    let chpg = load(await getHtml(info));
    let title = chpg("#page-title")?.text().trim();
    if (title) meta.title = title;
    let tags = chpg("div.page-tags span").children("a");
    if (tags.length) {
      meta.tags = [];
      for (let i = 0; i < tags.length; i++) {
        meta.tags.push(chpg(tags[i]).text().trim());
      }
    }
    let parent = chpg("#breadcrumbs")?.children("a").last().attr("href");
    if (parent) meta.parent = parent.substring(1);
    return meta;
  }
    
  export async function resolveId(wikiSite: string, pageOrId: string | number) {
    let page_id;
    if (typeof pageOrId == "string") {
      page_id = await getId(wikiSite, pageOrId);
    } else if (typeof pageOrId == "number") {
      page_id = pageOrId;
    } else throw new TypeError(`pageOrId requires a String or Number. Received ${typeof pageOrId}`);
    return page_id;
  }
  
  export async function getSource(wikiSite: string, pageOrId: string | number, params?: any): Promise<string> {
    let page_id = await resolveId(wikiSite, pageOrId);
    if (!page_id) throw new WikidotError({ site: wikiSite, page: pageOrId },"Wikidot page does not exist.");
    return (await AjaxModule({wikiSite}, "edit/TemplateSourceModule", Object.assign({
      page_id,
    }, params))).body;
  }
  
  export async function edit(meta: {wikiSite: string, wikiPage: string, session?: string}, params: any) {
    let lock = await AjaxModule(meta, 'edit/PageEditModule', {
      mode: 'page',
      wiki_page: meta.wikiPage,
      force_lock: true})
    if (lock.status!='ok') {
      throw new WikidotAjaxError(lock, meta.wikiSite);
    }
    return await AjaxAction(meta, 'WikiPageAction', Object.assign({
      event: 'savePage',
      wiki_page: meta.wikiPage,
      lock_id: lock.lock_id,
      lock_secret: lock.lock_secret,
      revision_id: lock.page_revision_id ?? null,
    }, params))
  }
}

export {
  Response,
  Session,
  WikidotError,
  WikidotAjaxError,
  PageMetadata,
  PageData,
  Ajax,
  AjaxModule,
  AjaxAction,
  login,
  loginPrompt,
  getUserInfo,
  getPreview,
  Page,
}