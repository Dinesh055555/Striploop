import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "./api.js";

const LiveContext = createContext({ version: 0, connected: false });

export function LiveProvider({ children }) {
  const [version, setVersion] = useState(0);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let es;
    let poll;
    const start = () => {
      try {
        es = new EventSource("/api/stream");
        es.onopen = () => setConnected(true);
        es.onmessage = (m) => {
          try { const d = JSON.parse(m.data); setVersion(d.version); } catch {}
        };
        es.onerror = () => setConnected(false);
      } catch {}
    };
    start();
    poll = setInterval(async () => {
      try { const h = await api.get("/health"); setVersion((v) => (h.version !== v ? h.version : v)); } catch {}
    }, 15000);
    return () => { es && es.close(); clearInterval(poll); };
  }, []);
  return <LiveContext.Provider value={{ version, connected }}>{children}</LiveContext.Provider>;
}

export const useLive = () => useContext(LiveContext);

// Fetches an API path and refetches whenever the server data changes.
export function useApi(path, { skip = false } = {}) {
  const { version } = useLive();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(!skip);
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (skip || !path) return;
    const my = ++seq.current;
    try {
      const d = await api.get(path);
      if (my === seq.current) { setData(d); setError(null); }
    } catch (e) {
      if (my === seq.current) setError(e);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [path, skip]);
  useEffect(() => { load(); }, [load, version]);
  return { data, error, loading, reload: load };
}
