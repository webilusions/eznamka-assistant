# Dialnica Backend (Node + Playwright)

Bot pre eznamka.sk — vyplní formulár, vyrieši reCAPTCHA cez Capsolver
a vráti URL na platobnú bránu (platbu už dokončí používateľ).

## Inštalácia na DigitalOcean dropletu

**Predpoklady:** Ubuntu 22.04, min. 2 GB RAM.

```bash
# Node + npm
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# pm2 pre process management
sudo npm install -g pm2

# Aplikácia
cd /var/www
sudo git clone <tvoj-repo> dialnica
cd dialnica/backend
npm install
# playwright sa nainštaluje cez postinstall;
# ak chýbajú systémové libs:
sudo npx playwright install-deps chromium

# .env
cp .env.example .env
nano .env   # vyplň SUPABASE_URL, SUPABASE_ANON_KEY, CAPSOLVER_API_KEY

# Spustenie
pm2 start server.js --name dialnica
pm2 save && pm2 startup
```

## Nginx reverse proxy

`/etc/nginx/sites-available/dialnica.kozart.sk`:

```nginx
server {
    server_name dialnica.kozart.sk;

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;   # Playwright môže bežať dlho
    }

    location / {
        root /var/www/dialnica/dist;   # SPA build
        try_files $uri /index.html;
    }
}
```

Potom `sudo certbot --nginx -d dialnica.kozart.sk`.

## Supabase Storage bucket

Vytvor verejný bucket **`task-screenshots`** v Supabase (Storage → New bucket → Public).
Bez neho upload screenshotov spadne.

## Endpointy

- `GET  /api/health`
- `GET  /api/tasks`
- `POST /api/tasks`
- `GET  /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `GET  /api/tasks/:id/logs`
- `GET  /api/tasks/:id/screenshots`
- `POST /api/tasks/:id/run` — **spustí Playwright bot na pozadí**

## Capsolver

1. Registrácia: https://dashboard.capsolver.com/
2. Dobi kredit (~5 €)
3. API key → do `.env` ako `CAPSOLVER_API_KEY`
4. Cena: ~$1 / 1000 reCAPTCHA v2

## Ako to funguje

1. Frontend zavolá `POST /api/tasks/:id/run`
2. Backend hneď vráti 200 a flow beží na pozadí (status `processing`)
3. Playwright otvorí eznamka.sk, vyberie typ známky, vyplní formulár
4. Capsolver vyrieši reCAPTCHA, token sa vstrekne do `g-recaptcha-response`
5. Klik na "Potvrdiť" → redirect na platobnú bránu
6. URL sa uloží do `tasks.payment_url`, status = `awaiting_payment`
7. Frontend redirectne usera na túto URL na zaplatenie
