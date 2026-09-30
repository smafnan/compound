// A stand-in for supabase-js backed by one shared in-memory "server" that
// follows the same rules as the migration's save_state().
const clone = (x) => JSON.parse(JSON.stringify(x))
const jitter = () => new Promise((r) => setTimeout(r, Math.random() * 25))

export function createClient() {
  const srv = globalThis.__server
  return {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }),
      startAutoRefresh: async () => {},
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      mfa: {},
    },
    from() {
      return {
        select(cols) {
          return {
            async maybeSingle() {
              await jitter()
              if (srv.failReads) return { data: null, error: { message: 'Failed to fetch' } }
              if (srv.legacy && cols.includes('version')) {
                return { data: null, error: { code: '42703', message: 'column app_state.version does not exist' } }
              }
              if (!srv.row) return { data: null, error: null }
              const out = { data: clone(srv.row.data), updated_at: srv.row.updated_at }
              if (!srv.legacy) out.version = srv.row.version
              return { data: out, error: null }
            },
          }
        },
        async upsert(rec) {
          await jitter()
          srv.writes++
          srv.row = { data: clone(rec.data), updated_at: rec.updated_at, version: (srv.row?.version ?? 0) + 1 }
          return { error: null }
        },
      }
    },
    async rpc(_name, p) {
      await jitter()
      if (srv.legacy) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.save_state' } }
      const now = new Date(Date.now() + srv.skewMs).toISOString()
      const cur = srv.row ? srv.row.version : null
      if (cur === null) {
        if (p.p_base_version !== 0) return { data: [{ ok: false, version: 0, server_now: now }], error: null }
      } else if (cur !== p.p_base_version) {
        srv.conflicts++
        return { data: [{ ok: false, version: cur, server_now: now }], error: null }
      }
      srv.writes++
      srv.row = { data: clone(p.p_data), updated_at: p.p_updated_at ?? now, version: (cur ?? 0) + 1 }
      return { data: [{ ok: true, version: srv.row.version, server_now: now }], error: null }
    },
    channel() {
      return { on() { return this }, subscribe() { return this } }
    },
    removeChannel() {},
  }
}
