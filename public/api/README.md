# eZnamka API + Worker

PHP backend pre Lovable frontend, deployovaný na Websupporte v `/dialnica.kozart.sk/`.

## Štruktúra

- `index.php` — REST API (volá ho React frontend cez `/api/*`)
- `worker.php` — automatizačný worker (cron každú minútu)
- `config.php` — kľúče a konfigurácia
- `.htaccess` — Apache rewrite pre pekné URL

## Nasadenie

1. `npm run build` → uploadni celý `dist/` na hosting do root webu
2. Skontroluj že `public/api/` je dostupné ako `https://dialnica.kozart.sk/api/health` → vráti `{"ok":true}`

## Worker — setup

### 1. Vyplň config.php

- `CAPSOLVER_API_KEY` — z https://dashboard.capsolver.com/
- `WORKER_SECRET` — náhodný reťazec (napr. `openssl rand -hex 32`)
- `$VIGNETTE_IDS` — doplň ID pre 1month, 10day, 1day (otvor eznamka.sk → klikni typ → pozri `vignetteId=` v URL)

### 2. Otestuj manuálne

```
curl "https://dialnica.kozart.sk/api/worker.php?secret=TVOJ_SECRET"
```

Najprv vytvor jednu testovaciu úlohu vo frontende, potom spusti worker. Sleduj výstup + logy úlohy v UI.

### 3. Nastav cron na Websupporte

Websupport admin → Cron → každú minútu:

```
* * * * * curl -s "https://dialnica.kozart.sk/api/worker.php?secret=TVOJ_SECRET" > /dev/null 2>&1
```

Worker spracuje **vždy len 1** pending úlohu za beh (aby sa cron behy neprekrývali).

## Ako to funguje

1. Worker atomicky vezme 1 `pending` úlohu, prepne na `running`.
2. Otvorí session na eznamka.sk, získa `__RequestVerificationToken`.
3. POST `vignetteselected` → otvorí formulár pre daný typ známky.
4. Vytiahne všetky hidden polia z formulára (Price, ValidityStart, ValidityEnd, …).
5. Pošle reCAPTCHA do Capsolveru (~$0.80/1000, čaká 10-30s).
6. POST `/check/` s údajmi + captcha tokenom.
7. Uloží `checkout_url`, status → `paused_before_payment`.
8. Pri chybe: status → `failed`, dôvod v `error_message` a v `task_logs`.

## Limitácie / riziká

- Ak eznamka.sk zmení názvy polí formulára, `/check/` zlyhá → pozri `task_logs` step `parse` a `check` (uložený `body_preview`).
- reCAPTCHA v2 môže občas zlyhať pri prvom pokuse → cron to skúsi znova lebo status zostane `failed` (zmeň manuálne na `pending`).
- Cookies sa ukladajú do `sys_get_temp_dir()/eznamka_cookies/`. Po každom tasku sa vymažú.
