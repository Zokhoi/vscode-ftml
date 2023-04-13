import * as vscode from "vscode";
import fetch from "../cross-fetch?cross";
import { parseHTML } from "linkedom";
import { urljoin, unixNamify, pkgname } from "../utils";

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
  exist?: boolean;
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
 * To connect to the ajax endpoint of a Wikidot site.
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
      'User-Agent': `${pkgname}/0.0.1`,
      Referer: pkgname,
      Cookie: `wikidot_token7=${wikidotToken7}; ${info.session ?? ''}`,
    },
    method: "POST",
    body,
  });
  if (!rawres.ok) throw new WikidotAjaxError(rawres, info.wikiSite);
  let res: Response = await (rawres).json();
  if (res.status != "ok") {
    if (res.message?.includes("Nonsecure access is not enabled")) {
      delete params.wikidot_token7;
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
      'User-Agent': `${pkgname}/0.0.1`,
      Referer: pkgname,
      Cookie: `wikidot_token7=${wikidotToken7}`,
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
    name: (parseHTML(pg).document.querySelector("h1.profile-title") as HTMLElement)?.innerText.replace(/\n/g, '').trim(),
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

async function listPages(wikiSite: string, params: any) {
  return await AjaxModule({ wikiSite }, "list/ListPagesModule", Object.assign({
    category: "*",
    perPage: "20",
    separate: "false",
    module_body: ``
  }, params))
}

/**
 * Namespace for operations related to a single Wikidot page.
 */
namespace Page {
  /**
   * Gets the raw html of a page.
   */
  export async function getHtml(info: {wikiSite: string, wikiPage: string, session?: string, checkExist?: boolean, useOkRange?: boolean}) {
    if (!info.wikiSite.startsWith("http")) { info.wikiSite = `http://${info.wikiSite}.wikidot.com` }
    info.checkExist ??= false;
    info.useOkRange ??= false;
    let res = await fetch(urljoin(info.wikiSite, unixNamify(info.wikiPage), '/norender/true'), {
      headers: {
        'User-Agent': `${pkgname}/0.0.1`,
        Referer: pkgname,
        Cookie: info.session,
      },
    });
    let text = await res.text();
    return (info.checkExist) ? {
      html: text,
      exist: (info.useOkRange ?? false) ? !res.ok : res.status!=404,
    } : {
      html: text,
    }
  }
  
  /**
   * Gets the id of a page, if the page exists, or else undefined.
   * @param wikiSite The Wikidot site.
   * @param wikiPage The Wikidot page name.
   */
  export async function getId(wikiSite: string, wikiPage: string, source?: string) {
    let chpg = parseHTML(source ?? (await getHtml({wikiSite, wikiPage})).html);
    let pageId = Array.from(chpg.document.querySelector("head")!.querySelectorAll("script"))
          .filter((el)=>el.innerHTML.includes("WIKIREQUEST"))[0].innerHTML
          .match(/WIKIREQUEST\.info\.pageId\s*=\s*(\d+)\s*;/)?.[1];
    return pageId;
  }

  /**
   * Checks if the page exist on Wikidot.
   */
  export async function existsPage(info: {wikiSite: string, wikiPage: string, session?: string, useOkRange?: boolean }): Promise<boolean> {
    if (!info.wikiSite.startsWith("http")) { info.wikiSite = `http://${info.wikiSite}.wikidot.com` }
    let res = (await fetch(urljoin(info.wikiSite, unixNamify(info.wikiPage), '/norender/true'), {
      headers: {
        'User-Agent': `${pkgname}/0.0.1`,
        Referer: pkgname,
        Cookie: info.session,
      },
    }))
    return (info.useOkRange ?? false) ? !!res.ok : res.status!==404;
  }
  
  /**
   * Gets the metadata of a page.
   */
  export async function getMetadata(info: {wikiSite: string, wikiPage: string, session?: string, checkExist?: boolean, useOkRange?: boolean}) {
    let meta: PageMetadata = {
      site: info.wikiSite,
      page: unixNamify(info.wikiPage),
    };
    let source = await getHtml(info);
    let chpg = parseHTML(source.html).document;
    let title = chpg.getElementById("page-title")?.innerText.trim();
    if (title) meta.title = title;
    let tags = chpg.querySelector("div.page-tags span")?.getElementsByTagName("a");
    if (tags?.length) {
      meta.tags = [];
      for (let i = 0; i < tags.length; i++) {
        meta.tags.push((tags[i] as HTMLElement).innerText.trim());
      }
    }
    let parent = chpg.getElementById("breadcrumbs")?.getElementsByTagName("a");
    if (parent?.length) meta.parent = parent[parent.length].href.substring(1);
    let spans = chpg.getElementById("page-info")?.getElementsByTagName("span");
    if (spans) Array.from(spans).forEach(v=>v.remove());
    let rev = chpg.getElementById("page-info")?.innerText.match(/\d+/)?.[0];
    if (rev) meta.revision = parseInt(rev);
    else if (source.exist) {
      /* Toolbar is hidden, assume that the page is private */
      /* We cannot get most of the metadata from private page, */
      /* so fetch metadata by listpages */
      let lp = await listPages(meta.site, {
        fullname: meta.page,
        module_body: `[[div_ id="list-title"]]
        %%title%%
        [[/div]]
        [[div_ id="list-parent"]]
        %%parent_fullname%%
        [[/div]]
        [[div_ id="list-tags"]]
        %%_tags%% %%tags%%
        [[/div]]
        [[div_ id="list-rev"]]
        %%revisions%%
        [[/div]]`,
      })
      let listed = parseHTML(lp.body).document;
      let title = listed.getElementById("u-list-title")?.innerText.trim();
      if (title) meta.title = title;
      let parent = listed.getElementById("u-list-parent")?.innerText.trim();
      if (parent) meta.parent = parent;
      let tags = listed.getElementById("u-list-tags")?.innerText.trim();
      if (tags) meta.tags = tags.split(" ");
      let revision = listed.getElementById("u-list-rev")?.innerText.trim();
      if (revision && !isNaN(parseInt(revision))) meta.revision = parseInt(revision);
    }
    if (info.checkExist) meta.exist = source.exist;
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
   * Gets the history revision list of a Wikidot page as from the bottom toolbar.
   * @param params The params passed when calling the revision list ajax.
   */
  export async function getHistory(wikiSite: string, pageOrId: string | number, params?: any): Promise<string> {
    let page_id = await resolveId(wikiSite, pageOrId);
    if (!page_id) throw new WikidotError({ site: wikiSite, page: pageOrId },"Wikidot page does not exist.");
    return (await AjaxModule({wikiSite}, "history/PageRevisionListModule", Object.assign({
      page_id,
      page: "1",
      perpage: "20",
    }, params))).body;
  }

  /**
   * Gets the latest revision number of a Wikidot page as from revision list.
   * @param params The params passed when calling the revision list ajax.
   */
  export async function getLatestRevisionNumber(wikiSite: string, pageOrId: string | number, params?: any): Promise<number> {
    let rev = parseHTML(await getHistory(wikiSite, pageOrId, params)).document;
    return parseInt((rev.querySelector('tr[id|="revision-row"]') as HTMLElement)?.innerText.trim());
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
  listPages,
  login,
  loginPrompt,
  getUserInfo,
  getPreview,
  Page,
}