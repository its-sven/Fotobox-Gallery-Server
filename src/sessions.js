import session from 'express-session';

/**
 * Sessions im Arbeitsspeicher mit automatischem Aufräumen abgelaufener Einträge.
 * (Der eingebaute MemoryStore von express-session räumt nie auf.) Neustart = alle abgemeldet.
 */
export class MemorySessionStore extends session.Store {
  constructor() {
    super();
    this.sessions = new Map();
    setInterval(() => this.prune(), 15 * 60_000).unref();
  }

  prune() {
    const now = Date.now();
    for (const [sid, s] of this.sessions) if (s.expires <= now) this.sessions.delete(sid);
  }

  static expiresOf(sess) {
    return sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 24 * 60 * 60 * 1000;
  }

  get(sid, cb) {
    const s = this.sessions.get(sid);
    if (!s || s.expires <= Date.now()) {
      this.sessions.delete(sid);
      return cb(null, null);
    }
    cb(null, JSON.parse(s.data));
  }

  set(sid, sess, cb) {
    this.sessions.set(sid, { data: JSON.stringify(sess), expires: MemorySessionStore.expiresOf(sess) });
    cb?.(null);
  }

  touch(sid, sess, cb) {
    const s = this.sessions.get(sid);
    if (s) s.expires = MemorySessionStore.expiresOf(sess);
    cb?.(null);
  }

  destroy(sid, cb) {
    this.sessions.delete(sid);
    cb?.(null);
  }
}
