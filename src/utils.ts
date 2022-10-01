/**
 * Joins different parts of a url.
 * @returns string
 */
const urljoin = (...parts: string[]) => {
  let begin = parts.shift()?.replace(/\/+$/, '');
  let end = parts.pop()?.replace(/^\/+/, '');
  parts = parts.map(v=>v.replace(/(^\/+)|(\/+$)/, '')).filter(v=>!!v);
  return parts.length ? begin + '/' + parts.join('/') + '/' + end : begin + '/' + end;
}

/**
 * Turns a string into Wikidot-standard unix names.
 * @param name The string to be unix-namified.
 * @param options
 * @returns string
 */
const unixNamify = (
  name: string,
  options?: {
    /**
     * Accepts category or not. Default true.
     */
    acceptsCategory?: boolean,
    /**
     * If accepting category, what sequence of characters to replace colon.
     * Default /~+/g.
     */
    colonReplacer?: string | RegExp
  }): string => {
  let acceptsCategory: boolean = options?.acceptsCategory ?? true;
  let colonReplacer: string | RegExp = options?.colonReplacer ?? /~+/g;
  let output = name.trim().toLowerCase();
  if (acceptsCategory) {
    output = output.replace(new RegExp(colonReplacer), ":")
      .replace(/[^\:\w]+/g, "-")
      .split(":")
      .map(el => el.split("_")
          .map((v,i)=>v.replace(/^\-|\-$/g, "")||(i==0?"_":""))
          .filter(v=>!!v)
          .join(""))
      .filter(v=>!!v&&v!="_")
      .join(":");
  } else {
    output = output.replace(/[^a-z]+/g, "-").replace(/^\-+|\-+$/g, "");
  }
  return output;
}

/**
 * Name of the extension.
 */
const pkgname = "vscode-ftml";
/**
 * Version of the extension.
 */
const pkgver = "0.1.2";

export {
  urljoin,
  unixNamify,
  pkgname,
  pkgver,
}