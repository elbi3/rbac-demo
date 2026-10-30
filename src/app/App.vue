<script setup lang="ts">
import { ref } from 'vue'
const username = ref('');
const password = ref('');
const user = ref<{ username: string; role: string } | null>(null);
const log = ref<{ call: string; status: number; body: string }[]>([]);

async function call(method: string, path: string, body?: object) {
  const res = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  log.value.unshift({ call: `${method} ${path}`, status: res.status, body: JSON.stringify(data) })
  return { res, data }
}
const register = () => call('POST', '/api/register', { username: username.value, password: password.value })
async function login() {
  const { res, data } = await call('POST', '/api/login', { username: username.value, password: password.value })
  user.value = res.ok ? data.user : null
}
async function logout() { await call('POST', '/api/logout'); user.value = null }
</script>

<template>
  <main>
    <h1>RBAC test bench</h1>
    <p class="status">{{ user ? `Signed in as ${user.username} (${user.role})` : 'Signed out' }}</p>

    <section>
      <h2>Account</h2>
      <label>Username <input v-model="username" autocomplete="username" /></label>
      <label>Password <input v-model="password" type="password" autocomplete="current-password" /></label>
      <div class="row">
        <button @click="register">Register</button>
        <button @click="login">Log in</button>
        <button @click="logout">Log out</button>
      </div>
    </section>

    <section>
      <h2>Call an endpoint</h2>
      <p class="hint">Buttons are always enabled on purpose: the server, not the UI, decides access.</p>
      <div class="row">
        <button @click="call('GET', '/api/public')">Public</button>
        <button @click="call('GET', '/api/me')">My profile</button>
        <button @click="call('GET', '/api/admin/users')">Admin: user list</button>
      </div>
    </section>

    <section>
      <h2>Responses</h2>
      <p v-if="!log.length" class="hint">Nothing yet. Register, log in, then call an endpoint.</p>
      <ul>
        <li v-for="(l, i) in log" :key="i" :class="l.status < 300 ? 'ok' : 'bad'">
          <b>{{ l.status }}</b> {{ l.call }}<code>{{ l.body }}</code>
        </li>
      </ul>
    </section>
  </main>
</template>

<style>
:root { color-scheme: light dark; --bg: #f7f7f5; --fg: #1d2421; --line: #c9cdc8; --ok: #1d7a46; --bad: #b3261e; }
@media (prefers-color-scheme: dark) { :root { --bg: #151a18; --fg: #e8ebe9; --line: #38413d; --ok: #5ccf8f; --bad: #ff8a80; } }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
main { max-width: 44rem; margin: 0 auto; padding: 2rem 1rem; }
h1 { font-size: 1.6rem; margin: 0; } h2 { font-size: 1.05rem; margin: 0 0 .5rem; }
section { border-top: 1px solid var(--line); padding: 1.25rem 0; }
.status, .hint { color: color-mix(in srgb, var(--fg) 65%, transparent); margin: .25rem 0 0; }
label { display: block; margin-bottom: .5rem; } input { width: 100%; box-sizing: border-box; padding: .5rem; font: inherit; color: inherit; background: transparent; border: 1px solid var(--line); }
.row { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .5rem; }
button { padding: .5rem .9rem; font: inherit; color: inherit; background: transparent; border: 1px solid var(--fg); cursor: pointer; }
button:hover { background: var(--fg); color: var(--bg); } :focus-visible { outline: 3px solid var(--ok); outline-offset: 2px; }
ul { list-style: none; padding: 0; margin: 0; } li { padding: .5rem 0; border-bottom: 1px solid var(--line); word-break: break-all; }
li.ok b { color: var(--ok); } li.bad b { color: var(--bad); } code { display: block; font-size: .85rem; opacity: .8; }
</style>
