import * as vscode from "vscode";
import fetch from "../cross-fetch?cross";
import { load } from "cheerio";
import { urljoin, unixNamify } from "../utils";

/**
 * Represents the metadata of a Wikidot page at a certain revision.
 */
interface PageMetadata {
  site: string;
  page: string;
  title?: string;
  parent?: string;
  tags?: string[] | string;
  revision?: number;
}

/**
 * Represents the source and metadata of a Wikidot page at a certain revision.
 */
interface PageData extends PageMetadata {
  source: string;
  comments?: string;
}

/**
 * Represents a response from Wikidot ajax endpoint.
 */
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

/**
 * Represents a Wikidot user session.
 * Strings are cookie content.
 */
interface Session {
  /**
   * A session cookie id assigned by Wikidot.
   */
  session_id: string;
  /**
   * A date string indicating when the session expires.
   */
  session_expire: string;
  /**
   * A Date object constructed from session_expire for convenience.
   */
  session_expire_date: Date;
  /**
   * A cookie string containing session_id and additional cookie "wikidot_udsession=1".
   */
  session_auth: string;
}

/**
 * An error thrown by Wikidot.
 */
class WikidotError extends Error {
  site?: string;
  page?: string | number;
  constructor(options: {site?: string, page?: string | number}, message?: string) {
    super(message);
    this.site = options.site;
    this.page = options.page;
  }
}
/**
 * An error thrown by Wikidot ajax endpoint.
 * This indicates your request is successfully sent,
 * but the ajax module cannot handle your request for
 * reasons such as you didn't provide enough parameters.
 */
class WikidotAjaxError extends WikidotError {
  src: Response;
  constructor(rawResponse: Response, site?: string) {
    super({site}, rawResponse.message);
    this.src = rawResponse;
  }
}

/**
 * To connect to the ajax enpoint of a Wikidot site.
 * @param info An object containing the site you are requesting and the session cookie to use.
 * @param params Objects to be sent to the ajax endpoint.
 */
async function Ajax(info: {wikiSite: string, session?: string}, params: any): Promise<Response> {
  if (!info.wikiSite.startsWith("http")) { info.wikiSite = `http://${info.wikiSite}.wikidot.com` }
  const wikidotToken7 = Math.random().toString(36).substring(4);
  params = Object.assign({
    wikidot_token7: wikidotToken7,
    callbackIndex: 0,
  }, params);
  let body = new URLSearchParams();
  for (const key in params) { body.append(key, params[key]) }
  let rawres = await fetch(urljoin(info.wikiSite, "ajax-module-connector.php"), {
    headers: {
      'User-Agent': 'vscode-ftml/0.0.1',
      Referer: 'vscode-ftml',
      Cookie: `wikidot_token7=${wikidotToken7}; ${info.session ?? ''}`,
    },
    method: "POST",
    body,
  });
  if (!rawres.ok) throw new WikidotAjaxError(rawres, info.wikiSite);
  let res: Response = await (rawres).json();
  if (res.status != "ok") {
    if (res.message?.includes("Nonsecure access is not enabled")) {
      return await Ajax({ wikiSite: info.wikiSite.replace('http', 'https'), session: info.session }, params);
    } else throw new WikidotAjaxError(res, info.wikiSite);
  };
  return res;
}

/**
 * Connects to an ajax module.
 * @param info An object containing the site you are requesting and the session cookie to use.
 * @param moduleName The name of the module.
 * @param params Objects to be sent to the ajax endpoint.
 */
async function AjaxModule(info: {wikiSite: string, session?: string}, moduleName: string, params: any) {
  return await Ajax(info, Object.assign({
    moduleName,
  }, params));
}

/**
 * Connects to an ajax action.
 * @param info An object containing the site you are requesting and the session cookie to use.
 * @param action The name of the action.
 * @param params Objects to be sent to the ajax endpoint
 */
async function AjaxAction(info: {wikiSite: string, session?: string}, action: string, params: any) {
  return await Ajax(info, Object.assign({
    moduleName: "empty",
    action,
  }, params));
}

/**
 * Logins to Wikidot.
 */
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

/**
 * Shows a VSCode prompt for Wikidot login.
 */
async function loginPrompt(): Promise<void> {
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

/**
 * Gets the info of a Wikidot user.
 * @param username The username of the user. Does not need to be their unix name.
 */
async function getUserInfo(username: string) {
  let unixname = unixNamify(username, { acceptsCategory: false });
  let pg = await (await fetch("https://www.wikidot.com/user:info/"+unixname)).text();
  return {
    name: load(pg)("h1.profile-title")?.text().replace(/\n/g, '').trim(),
    unixname,
    id: pg.match(/USERINFO\.userId\s*\=\s*(\d+)\s*\;/)?.[1],
  }
}

/**
 * Gets a preview from Wikidot with specified parameters.
 */
async function getPreview({source, wikiPage, wikiSite}: {
  source: string;
  wikiPage?: string;
  wikiSite: string;
}): Promise<string> {
  let res = await AjaxModule({ wikiSite }, "edit/PagePreviewModule", {
    mode: "page",
    page_unix_name: unixNamify(wikiPage ?? ""),
    source: source,
  });
  return res.body;
}

/**
 * Namespace for operations related to a single Wikidot page.
 */
namespace Page {
  /**
   * Gets the raw html of a page.
   */
  export async function getHtml(info: {wikiSite: string, wikiPage: string, session?: string}) {
    if (!info.wikiSite.startsWith("http")) { info.wikiSite = `http://${info.wikiSite}.wikidot.com` }
    return await (await fetch(urljoin(info.wikiSite, unixNamify(info.wikiPage), '/norender/true'), {
      headers: {
        'User-Agent': 'vscode-ftml/0.0.1',
        Referer: 'vscode-ftml',
        Cookie: info.session,
      },
    })).text();
  }
  
  /**
   * Gets the id of a page, if the page exists, or else undefined.
   * @param wikiSite The Wikidot site.
   * @param wikiPage The Wikidot page name.
   */
  export async function getId(wikiSite: string, wikiPage: string) {
    let chpg = load(await getHtml({wikiSite, wikiPage}));
    let pageId = chpg(chpg("head").children("script")
          .filter((_,el)=>chpg(el).html()!.includes("WIKIREQUEST"))).html()!
          .match(/WIKIREQUEST\.info\.pageId\s*=\s*(\d+)\s*;/)?.[1];
    return pageId;
  }
  
  /**
   * Gets the metadata of a page. It assumes that the page exists.
   */
  export async function getMetadata(info: {wikiSite: string, wikiPage: string, session?: string}) {
    let meta: PageMetadata = {
      site: info.wikiSite,
      page: unixNamify(info.wikiPage),
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
    chpg("#page-info")?.children("span")?.remove();
    let rev = chpg("#page-info")?.text().match(/\d+/)?.[0];
    if (rev) meta.revision = parseInt(rev);
    return meta;
  }
  
  /**
   * Takes in a Wikidot page by name or id and outputs the page id.
   * @param wikiSite The Wikidot site.
   * @param pageOrId The Wikidot page name or id.
   */
  export async function resolveId(wikiSite: string, pageOrId: string | number) {
    let page_id: string | undefined;
    if (typeof pageOrId == "string") {
      page_id = await getId(wikiSite, pageOrId);
    } else if (typeof pageOrId == "number") {
      page_id = `${pageOrId}`;
    } else throw new TypeError(`pageOrId requires a String or Number. Received ${typeof pageOrId}`);
    return page_id;
  }
  
  /**
   * Gets the source of a Wikidot page as from the editing box.
   * As Wikidot sometimes does not update to the newest revision,
   * this result may be out of date.
   * @param params The params passed when calling the editing box ajax.
   */
  export async function getSource(wikiSite: string, pageOrId: string | number, params?: any): Promise<string> {
    let page_id = await resolveId(wikiSite, pageOrId);
    if (!page_id) throw new WikidotError({ site: wikiSite, page: pageOrId },"Wikidot page does not exist.");
    return (await AjaxModule({wikiSite}, "edit/TemplateSourceModule", Object.assign({
      page_id,
    }, params))).body;
  }
  
  /**
   * Edits a Wikidot page.
   * @param params The Wikidot page edit data.
   */
  export async function edit(meta: {wikiSite: string, wikiPage: string, session?: string}, params: any) {
    let lock = await AjaxModule(meta, 'edit/PageEditModule', {
      mode: 'page',
      wiki_page: unixNamify(meta.wikiPage),
      force_lock: true})
    if (lock.status!='ok') {
      throw new WikidotAjaxError(lock, meta.wikiSite);
    }
    return await AjaxAction(meta, 'WikiPageAction', Object.assign({
      event: 'savePage',
      wiki_page: unixNamify(meta.wikiPage),
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