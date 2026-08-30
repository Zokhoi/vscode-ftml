import { parse } from "@wdprlib/parser";
import { renderToHtml } from "@wdprlib/render";

onmessage = async (e) => {
  const wdprSource = e.data;

  const { ast } = parse(wdprSource);

  const html = renderToHtml(ast, {
    settings: {
      allowHtmlBlocks: true,
      allowStyleElements: true,
    }
  });

  // sending message back to main thread
  postMessage({ html });
}