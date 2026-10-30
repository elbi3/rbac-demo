# RBAC test bench (Vue 3 + Vite + Hono on Cloudflare Workers + D1)

## Setup
    npm i vue hono
    npm i -D vite @vitejs/plugin-vue @cloudflare/vite-plugin wrangler typescript @cloudflare/workers-types
    npm run db:local
    npm run dev                      # http://localhost:5173

## Make an admin (register normally, then promote in the DB)
    npx wrangler d1 execute rbac-demo --local --command "UPDATE users SET role='admin' WHERE username='YOUR_NAME'"

## QA suite
    ADMIN_USER=YOUR_NAME ADMIN_PASS='...' npm run qa

## Deploy
    npx wrangler d1 create rbac-demo      # paste database_id into wrangler.jsonc
    npm run db:remote
    npx wrangler secret put JWT_SECRET    # use a long random value
    npm run deploy
