<?php
// ====== KONFIGURÁCIA ======
// Vyplň tieto hodnoty z Lovable Cloud (Supabase) projektu
// SUPABASE_URL: https://<project-ref>.supabase.co
// SERVICE_ROLE_KEY: tajný service_role kľúč (NIKDY ho nedávaj do frontendu!)

define('SUPABASE_URL', getenv('SUPABASE_URL') ?: 'https://unjppomsdlchtnwwosjx.supabase.co');
define('SUPABASE_SERVICE_ROLE_KEY', getenv('SUPABASE_SERVICE_ROLE_KEY') ?: 'VLOZ_SERVICE_ROLE_KEY_SEM');

define('CORS_ORIGIN', '*');
