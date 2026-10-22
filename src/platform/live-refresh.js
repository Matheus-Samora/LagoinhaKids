// Coalesce background updates without replacing forms or crossing accounts.
export function deferredRefresh({blocked, read, apply, key}) {
  let pending=false, busy=false;
  async function flush() {
    if (!pending || busy || blocked()) return;
    busy=true;
    pending=false;
    const account=key();
    try {
      const data=await read();
      if (key() !== account) return;
      if (blocked()) { pending=true; return; }
      apply(data);
    } catch { pending=true; }
    finally { busy=false; }
  }
  return {flush, request() { pending=true; return flush(); }};
}
