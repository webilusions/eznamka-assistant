<?php
// ====== KONFIGURÁCIA ======
// Verejný publishable (anon) kľúč — môže byť v kóde.
define('SUPABASE_URL', 'https://unjppomsdlchtnwwosjx.supabase.co');
define('SUPABASE_API_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuanBwb21zZGxjaHRud3dvc2p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5NzI0MzIsImV4cCI6MjA5NjU0ODQzMn0.Vhr6IPKFp2tEHDJMuZbC7HtDMg9XA_bBx9p4DNSUwK0');

define('CORS_ORIGIN', '*');

// ====== WORKER KONFIGURÁCIA ======
// Capsolver API key — získaj na https://dashboard.capsolver.com/
define('CAPSOLVER_API_KEY', 'PUT_YOUR_CAPSOLVER_KEY_HERE');

// Secret pre cron — pridaj do URL ako ?secret=... aby cudzí nespustili worker
define('WORKER_SECRET', 'change-me-to-random-string-123456');

// eznamka.sk reCAPTCHA site key + URL
define('EZNAMKA_BASE', 'https://eznamka.sk');
define('EZNAMKA_SITEKEY', '6LfHAjkUAAAAADameCOtUdnICQbHOiH4Xqt1lMAw');

// Mapovanie typov známok na vignetteId na eznamka.sk
// Z DevTools si pozri URL na /selfcare/purchase/singlepurchase/vignetteselected/?vignetteId=XXXX
// pre každý typ a doplň sem. Známe: 1year=1060
$VIGNETTE_IDS = [
    '1year'  => 1060,  // Ročná
    '1month' => 0,     // TODO: doplniť (mesačná)
    '10day'  => 0,     // TODO: doplniť (10-dňová)
    '1day'   => 0,     // TODO: doplniť (jednodňová)
];

// Cesta k súboru kde sa ukladajú cookies pre eznamka session (musí byť zapisovateľná)
define('COOKIE_DIR', sys_get_temp_dir() . '/eznamka_cookies');
if (!is_dir(COOKIE_DIR)) @mkdir(COOKIE_DIR, 0700, true);
