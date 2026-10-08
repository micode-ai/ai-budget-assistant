const { parentPort } = require('worker_threads');
parentPort.postMessage({ ok: true, result: { kind: 'receipt', subject: 'from-worker' } });
