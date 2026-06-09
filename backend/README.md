# Dialnica Backend

Samostatný Node.js/Express backend pre SPA frontend.

## Inštalácia

```bash
cd backend
npm install
cp .env.example .env
# vyplň SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY
```

## Spustenie

```bash
npm start
# beží na http://localhost:3001
```

## Nasadenie na dialnica.kozart.sk

Potrebuješ hosting s podporou Node.js (Websupport má len PHP/Apache — tam toto nepôjde).
Alternatívy:
- VPS (DigitalOcean, Hetzner, ...)
- Railway, Render, Fly.io (zadarmo / lacno)
- Vlastný server s `pm2` / systemd

Po nasadení nastav Apache reverse proxy alebo subdoménu tak, aby
`https://dialnica.kozart.sk/api/*` smerovalo na tento Node server (port 3001).

## Endpointy

- `GET  /api/health`
- `GET  /api/tasks`
- `POST /api/tasks`
- `GET  /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `GET  /api/tasks/:taskId/logs`
- `GET  /api/tasks/:taskId/screenshots`
