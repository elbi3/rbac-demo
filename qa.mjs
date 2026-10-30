// Run the dev server first, then: node qa.mjs   (set ADMIN_USER / ADMIN_PASS to include admin tests)
const BASE = process.env.BASE_URL || 'http://localhost:5173'
let pass = 0, fail = 0
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${ok ? '' : extra}`) }
async function req(method, path, body, cookie) {
  const res = await fetch(BASE + path, { method, redirect: 'manual',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined })
  const text = await res.text(); let json = {}; try { json = JSON.parse(text) } catch {}
  return { status: res.status, json, cookie: (res.headers.get('set-cookie') || '').split(';')[0] }
}
const u = 'qa_' + Date.now(), pw = 'CorrectHorse9!'

check('Register new user -> 201', (await req('POST', '/api/register', { username: u, password: pw })).status === 201)
const bad = await req('POST', '/api/login', { username: u, password: 'wrong-password' })
const ghost = await req('POST', '/api/login', { username: 'nobody_here', password: 'wrong-password' })
check('Wrong password -> 401', bad.status === 401)
check('Unknown user gives identical error (no enumeration)', ghost.status === 401 && ghost.json.error === bad.json.error)
const login = await req('POST', '/api/login', { username: u, password: pw })
check('Login -> 200 + token cookie', login.status === 200 && login.cookie.startsWith('token='))
check('Login response has no password hash', !JSON.stringify(login.json).includes('hash'))
check('User can read /api/me -> 200', (await req('GET', '/api/me', null, login.cookie)).status === 200)
check('User blocked from admin -> 403', (await req('GET', '/api/admin/users', null, login.cookie)).status === 403)
check('Logged out /api/me -> 401', (await req('GET', '/api/me')).status === 401)
check('Logged out admin -> 401', (await req('GET', '/api/admin/users')).status === 401)
check('Forged token -> 401', (await req('GET', '/api/me', null, 'token=aaa.bbb.ccc')).status === 401)
check('Cannot self-register as admin', await (async () => {
  const n = u + 'x'; await req('POST', '/api/register', { username: n, password: pw, role: 'admin' })
  const l = await req('POST', '/api/login', { username: n, password: pw })
  return (await req('GET', '/api/admin/users', null, l.cookie)).status === 403 })())
check('Empty credentials -> 400', (await req('POST', '/api/register', { username: '', password: '' })).status === 400)
check('SQL-like input -> no 500', (await req('POST', '/api/login', { username: "' OR 1=1 --", password: "' OR '1'='1" })).status < 500)
check('Malformed JSON -> no 500', (await fetch(BASE + '/api/login', { method: 'POST', body: '{nope' })).status < 500)

if (process.env.ADMIN_USER) {
  const a = await req('POST', '/api/login', { username: process.env.ADMIN_USER, password: process.env.ADMIN_PASS })
  check('Admin can read /api/me', (await req('GET', '/api/me', null, a.cookie)).status === 200)
  check('Admin can read /api/admin/users', (await req('GET', '/api/admin/users', null, a.cookie)).status === 200)
} else console.log('SKIP  admin tests (set ADMIN_USER / ADMIN_PASS)')
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0)
