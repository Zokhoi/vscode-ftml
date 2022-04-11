import got from "got";
import { join } from "path";

interface WikidotResponse {
  status: string;
  CURRENT_TIMESTAMP: number;
  callbackIndex: string;
  message?: string;
  body?: any;
  jsInclude?: string[];
  cssInclude?: string[];
}
class WikidotError extends Error {
  raw: WikidotResponse;
  site: string;
  constructor(rawResponse: WikidotResponse, site: string) {
    super(rawResponse.message);
    this.raw = rawResponse;
    this.site = site;
  }
}

async function getWikidotPreview({source, pageName, wikiSite}: {
  source: string;
  pageName?: string;
  wikiSite: string;
}) {
  if (!wikiSite.startsWith("http")) { wikiSite = `http://${wikiSite}.wikidot.com` }
  const wikidotToken7 = Math.random().toString(36).substring(4);
  let res: WikidotResponse = await got.post(join(wikiSite, "ajax-module-connector.php"), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
      Referer: 'vscode-ftml',
      Cookie: `wikidot_token7=${wikidotToken7};`,
    },
    form: {
      wikidot_token7: wikidotToken7, 
      callbackIndex: 0,
      moduleName: "edit/PagePreviewModule",
      mode: "page",
      page_unix_name: pageName ?? "",
      source: source
    }
  }).json()
  if (res.status != "ok") throw new WikidotError(res, wikiSite);
  return res.body;
}

export default getWikidotPreview;
export {
  WikidotResponse,
  WikidotError,
  getWikidotPreview,
}