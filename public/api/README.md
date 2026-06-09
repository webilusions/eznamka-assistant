# PHP API pre Websupport

## Inštalácia
1. Po builde sa súbory skopírujú do `dist/api/`.
2. Nahraj `dist/` (vrátane `api/`) na Websupport.
3. **Otvor `api/config.php` a vlož svoj `SUPABASE_SERVICE_ROLE_KEY`**
   (nájdeš ho v Lovable → Cloud → Backend → API keys → service_role).
4. Over: `https://dialnica.kozart.sk/api/health` → `{"ok":true}`

## Endpointy
- `GET    /api/health`
- `GET    /api/tasks`
- `POST   /api/tasks`
- `GET    /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `GET    /api/tasks/:id/logs`
- `GET    /api/tasks/:id/screenshots`

## Požiadavky hostingu
- PHP 7.4+
- `mod_rewrite` zapnutý
- `curl` rozšírenie (Websupport má štandardne)
