import { Hono } from 'hono'
import { sign, verify } from 'hono/jwt'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'

type User = { 
  id: number; 
  username: string; 
  role: 'user' | 'admin' 
}

type Env = { 
  Bindings: { 
    DB: D1Database; 
    JWT_SECRET: string 
  }; 
  Variables: { user: User } 
}

const app = new Hono<Env>();
const enc = new TextEncoder();
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// PBKDF2-SHA256 + random salt. 100k is the max iteration count Workers allows.
async function pbkdf2(pw: string, salt: Uint8Array<ArrayBuffer>) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 }, key, 256))
}
async function hashPassword(pw: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `${b64(salt)}$${b64(await pbkdf2(pw, salt))}`
}
async function verifyPassword(pw: string, stored: string) {
  const [s, h] = stored.split('$')
  const got = await pbkdf2(pw, unb64(s))
  const want = unb64(h)
  return got.length === want.length && (crypto.subtle as any).timingSafeEqual(got, want) //added any since timingSafeEqual is a Cloudflare Workers extention and not part of the Web Crypto API
}

const validCreds = (b: any) =>
  b && typeof b.username === 'string' && typeof b.password === 'string' &&
  /^[A-Za-z0-9_]{3,32}$/.test(b.username) && b.password.length >= 8 && b.password.length <= 128

async function issueCookie(c: any, id: number) {
  const token = await sign({ sub: String(id), exp: Math.floor(Date.now() / 1000) + 3600 }, c.env.JWT_SECRET, 'HS256')
  setCookie(c, 'token', token, { httpOnly: true, sameSite: 'Strict', path: '/', maxAge: 3600, secure: new URL(c.req.url).protocol === 'https:' })
}

// ---- Route guards (server-side) ----
const requireAuth = createMiddleware<Env>(async (c, next) => {
  const token = getCookie(c, 'token')
  if (!token) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const p = await verify(token, c.env.JWT_SECRET, 'HS256') // checks signature + exp
    // Role is re-read from the DB each request, never trusted from the token.
    const u = await c.env.DB.prepare('SELECT id, username, role FROM users WHERE id = ?').bind(Number(p.sub)).first<User>()
    if (!u) return c.json({ error: 'Unauthorized' }, 401)
    c.set('user', u)
  } catch {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
})
const requireAdmin = createMiddleware<Env>(async (c, next) => {
  if (c.get('user').role !== 'admin') return c.json({ error: 'Forbidden' }, 403)
  await next()
})

// ---- Public ----
app.get('/api/public', (c) => c.json({ message: 'Public: anyone can see this.' }))

app.post('/api/register', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!validCreds(body)) return c.json({ error: 'Username must be 3-32 letters/numbers/underscores; password 8-128 characters.' }, 400)
  try {
    // Role is NEVER read from the request body (prevents mass-assignment privilege escalation).
    await c.env.DB.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')")
      .bind(body.username, await hashPassword(body.password)).run()
  } catch {
    return c.json({ error: 'Could not create account with those details.' }, 409)
  }
  return c.json({ message: 'Registered. You can now log in.' }, 201)
})

app.post('/api/login', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!validCreds(body)) return c.json({ error: 'Invalid username or password' }, 401)
  const row = await c.env.DB.prepare('SELECT id, username, role, password_hash FROM users WHERE username = ?').bind(body.username).first<User & { password_hash: string }>()
  // Same work + same message whether or not the user exists (limits enumeration).
  const ok = row ? await verifyPassword(body.password, row.password_hash) : (await pbkdf2(body.password, new Uint8Array(16)), false)
  if (!row || !ok) return c.json({ error: 'Invalid username or password' }, 401)
  await issueCookie(c, row.id)
  return c.json({ user: { id: row.id, username: row.username, role: row.role } }) // hash stripped
})

app.post('/api/logout', (c) => {
  deleteCookie(c, 'token', { path: '/' })
  return c.json({ message: 'Logged out.' })
})

// ---- Protected: any authenticated user ----
app.get('/api/me', requireAuth, (c) => c.json({ user: c.get('user') }))

// ---- Restricted: admin only ----
app.get('/api/admin/users', requireAuth, requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, username, role, created_at FROM users ORDER BY id').all()
  return c.json({ users: results })
})

app.onError((_e, c) => c.json({ error: 'Server error' }, 500))
export default app
