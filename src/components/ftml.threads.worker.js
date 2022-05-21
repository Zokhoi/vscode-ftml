const { parentPort } = require('worker_threads');
const ftml = require('@vscode-ftml/ftml-wasm');

ftml.init();
// ftml.init(fs.readFileSync(wasmPath));

!(async () => {
  if (!ftml.ready) await ftml.loading;

  parentPort.on('message', (value) => {
    const { ftmlSource } = value;
  
    const { html, styles } = ftml.renderHTML(ftmlSource);
  
    // sending message back to main thread
    parentPort.postMessage({ html, styles });
  });
})();