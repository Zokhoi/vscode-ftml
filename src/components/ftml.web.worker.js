import { init, ready, loading, renderHTML } from "@vscode-ftml/ftml-wasm";

init();

onmessage = async (e) => {
  if (!ready) await loading;
  const ftmlSource = e.data;

  const { html } = renderHTML(ftmlSource);

  // sending message back to main thread
  postMessage({ html });
}