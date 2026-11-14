// Readiness is confirmed by the rendered home, not merely a successful HTTP response.
function watchStartup({ load, recover, timeoutMs = 30000 }) {
  let timer;
  let recovering = false;
  let disposed = false;
  let generation = 0;
  const clear = () => { clearTimeout(timer); timer = undefined; };
  const fail = async (reason) => {
    if (disposed || recovering) return;
    recovering = true;
    generation += 1;
    clear();
    try { await recover(reason); } finally { recovering = false; }
  };
  const start = () => {
    if (disposed) return;
    clear();
    const current = ++generation;
    timer = setTimeout(() => { void fail("timeout"); }, timeoutMs);
    Promise.resolve().then(load).catch(() => { if (current === generation) void fail("network"); });
  };
  return {
    start, fail,
    ready: () => { generation += 1; clear(); },
    dispose: () => { disposed = true; generation += 1; clear(); },
  };
}
module.exports = { watchStartup };