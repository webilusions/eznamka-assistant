<?php
/**
 * eZnamka automation worker.
 *
 * Spúšťa sa cronom (každú minútu napr.):
 *   * * * * * curl -s "https://dialnica.kozart.sk/api/worker.php?secret=XXX" > /dev/null
 *
 * Logika:
 *   1. Načíta 1 pending task z DB.
 *   2. Atomicky ho prepne na "processing" (aby ho dvaja worker neprocessovali naraz).
 *   3. Otvorí flow na eznamka.sk, vyplní formulár, vyrieši reCAPTCHA cez Capsolver.
 *   4. Zastaví pred platbou, uloží checkout URL a prepne status na "paused_before_payment".
 *   5. Pri chybe uloží error_message a status "failed".
 */

require_once __DIR__ . '/config.php';
global $VIGNETTE_IDS;

header('Content-Type: text/plain; charset=utf-8');
ignore_user_abort(true);
set_time_limit(300); // 5 min max per task

// ---- Auth (jednoduchý shared secret v query) ----
if (($_GET['secret'] ?? '') !== WORKER_SECRET) {
    http_response_code(403);
    exit("forbidden\n");
}

// ============================================================
// Supabase helpers
// ============================================================
function sb_request(string $method, string $path, $body = null, string $query = '', array $extraHeaders = []): array {
    $url = rtrim(SUPABASE_URL, '/') . '/rest/v1' . $path . ($query ? '?' . $query : '');
    $ch = curl_init($url);
    $headers = array_merge([
        'apikey: ' . SUPABASE_API_KEY,
        'Authorization: Bearer ' . SUPABASE_API_KEY,
        'Content-Type: application/json',
        'Prefer: return=representation',
    ], $extraHeaders);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 20,
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    $resp = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['status' => $status, 'body' => $resp, 'json' => json_decode($resp, true)];
}

function log_step(string $taskId, string $step, string $message, string $level = 'info', $metadata = null): void {
    sb_request('POST', '/task_logs', [
        'task_id' => $taskId,
        'step' => $step,
        'message' => $message,
        'level' => $level,
        'metadata' => $metadata,
    ]);
    echo "[$level] $step: $message\n";
}

function update_task(string $taskId, array $patch): void {
    sb_request('PATCH', '/tasks', $patch, 'id=eq.' . urlencode($taskId));
}

// Atomicky claimne 1 pending task (Postgres RETURNING).
function reset_stale_running_tasks(int $maxAgeMinutes = 10): void {
    // Úlohy zaseknuté v stave 'running' dlhšie ako N minút vráť na 'pending'
    $cutoff = gmdate('c', time() - $maxAgeMinutes * 60);
    sb_request(
        'PATCH',
        '/tasks',
        ['status' => 'pending', 'error_message' => 'Auto-reset: predchádzajúci beh neskončil', 'updated_at' => gmdate('c')],
        'status=eq.running&updated_at=lt.' . rawurlencode($cutoff)
    );
}

function claim_next_pending_task(): ?array {
    // PATCH s filtrom status=eq.pending + LIMIT 1 (cez ?limit=1 v PostgREST)
    $r = sb_request(
        'PATCH',
        '/tasks',
        ['status' => 'running', 'updated_at' => gmdate('c')],
        'status=eq.pending&limit=1&order=created_at.asc',
        ['Prefer: return=representation']
    );
    if ($r['status'] >= 400) return null;
    $rows = $r['json'];
    if (!is_array($rows) || empty($rows)) return null;
    return $rows[0];
}

// ============================================================
// HTTP klient pre eznamka (s cookie jar per task)
// ============================================================
class EznamkaClient {
    private string $jar;
    public string $lastBody = '';
    public int $lastStatus = 0;
    public array $lastHeaders = [];
    public string $lastUrl = '';

    public function __construct(string $taskId) {
        $this->jar = COOKIE_DIR . '/' . preg_replace('/[^a-f0-9-]/i', '', $taskId) . '.cookie';
        @file_put_contents($this->jar, '');
    }

    public function request(string $method, string $url, ?array $form = null, array $extraHeaders = [], bool $followRedirects = true): void {
        $ch = curl_init($url);
        $headers = array_merge([
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language: sk-SK,sk;q=0.9,en;q=0.8',
        ], $extraHeaders);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_COOKIEJAR => $this->jar,
            CURLOPT_COOKIEFILE => $this->jar,
            CURLOPT_FOLLOWLOCATION => $followRedirects,
            CURLOPT_MAXREDIRS => 5,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_HEADER => true,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            $body = $form !== null ? http_build_query($form) : '';
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
            // Ensure Content-Length is set even for empty body (server returns 411 otherwise)
            $headers[] = 'Content-Length: ' . strlen($body);
            curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        } elseif ($method !== 'GET') {
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
            if ($form !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($form));
        }
        $raw = curl_exec($ch);
        $hSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $this->lastStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $this->lastUrl = (string)curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
        $rawHeaders = substr($raw, 0, $hSize);
        $this->lastBody = substr($raw, $hSize);
        $this->lastHeaders = [];
        foreach (explode("\r\n", $rawHeaders) as $line) {
            if (strpos($line, ':') !== false) {
                [$k, $v] = explode(':', $line, 2);
                $this->lastHeaders[strtolower(trim($k))] = trim($v);
            }
        }
        if ($err = curl_error($ch)) {
            curl_close($ch);
            throw new RuntimeException("HTTP chyba: $err");
        }
        curl_close($ch);
    }

    public function get(string $url, array $extraHeaders = []): void {
        $this->request('GET', $url, null, $extraHeaders);
    }

    public function post(string $url, array $form, array $extraHeaders = [], bool $followRedirects = true): void {
        $headers = array_merge([
            'Content-Type: application/x-www-form-urlencoded',
            'Origin: ' . EZNAMKA_BASE,
        ], $extraHeaders);
        $this->request('POST', $url, $form, $headers, $followRedirects);
    }

    public function cleanup(): void {
        @unlink($this->jar);
    }
}

// ============================================================
// Capsolver
// ============================================================
function capsolver_solve_recaptcha_v2(string $pageUrl, string $sitekey): string {
    // 1. createTask
    $createPayload = [
        'clientKey' => CAPSOLVER_API_KEY,
        'task' => [
            'type' => 'ReCaptchaV2TaskProxyless',
            'websiteURL' => $pageUrl,
            'websiteKey' => $sitekey,
        ],
    ];
    $ch = curl_init('https://api.capsolver.com/createTask');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($createPayload),
        CURLOPT_TIMEOUT => 30,
    ]);
    $resp = json_decode(curl_exec($ch), true);
    curl_close($ch);
    if (empty($resp['taskId'])) {
        throw new RuntimeException('Capsolver createTask zlyhal: ' . json_encode($resp));
    }
    $taskId = $resp['taskId'];

    // 2. Poll getTaskResult (max ~120s)
    for ($i = 0; $i < 60; $i++) {
        sleep(2);
        $ch = curl_init('https://api.capsolver.com/getTaskResult');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode(['clientKey' => CAPSOLVER_API_KEY, 'taskId' => $taskId]),
            CURLOPT_TIMEOUT => 30,
        ]);
        $r = json_decode(curl_exec($ch), true);
        curl_close($ch);
        if (($r['status'] ?? '') === 'ready') {
            return $r['solution']['gRecaptchaResponse'];
        }
        if (($r['status'] ?? '') === 'failed' || !empty($r['errorId'])) {
            throw new RuntimeException('Capsolver failed: ' . json_encode($r));
        }
    }
    throw new RuntimeException('Capsolver timeout');
}

// ============================================================
// Hlavná logika pre 1 task
// ============================================================
function process_task(array $task): void {
    global $VIGNETTE_IDS;
    $id = $task['id'];
    $type = $task['vignette_type'];
    $vignetteId = $VIGNETTE_IDS[$type] ?? 0;
    if (!$vignetteId) {
        update_task($id, ['status' => 'failed', 'error_message' => "Neznámy typ známky: $type — doplň ID do config.php"]);
        log_step($id, 'init', "Neznámy typ známky: $type", 'error');
        return;
    }

    $client = new EznamkaClient($id);
    try {
        log_step($id, 'init', "Spúšťam automatizáciu pre $type, EČV {$task['license_plate']}");

        // --- 0. KONTROLA PLATNOSTI pred kúpou
        try {
            $check = check_validity($client, $id, $task);
            log_step($id, 'validity-check', $check['summary'], $check['conflict'] ? 'warning' : 'info', $check);
            if ($check['conflict']) {
                update_task($id, [
                    'status' => 'failed',
                    'error_message' => 'Kontrola platnosti: ' . $check['summary'],
                    'updated_at' => gmdate('c'),
                ]);
                return;
            }
        } catch (Throwable $e) {
            // Kontrolu nezablokujeme kúpu ak zlyhá — len zaloguj
            log_step($id, 'validity-check', 'Kontrola platnosti zlyhala (pokračujem v kúpe): ' . $e->getMessage(), 'warning');
        }

        // --- 1. GET /selfcare/purchase aby sme dostali __RequestVerificationToken + cookies
        $client->get(EZNAMKA_BASE . '/selfcare/purchase');
        if ($client->lastStatus !== 200) {
            throw new RuntimeException("GET /selfcare/purchase vrátil {$client->lastStatus}");
        }
        if (!preg_match('/name="__RequestVerificationToken"[^>]+value="([^"]+)"/', $client->lastBody, $m)) {
            throw new RuntimeException('__RequestVerificationToken sa nenašiel na /selfcare/purchase');
        }
        $rvt = $m[1];
        log_step($id, 'session', 'Session + RVT získané');

        // --- 2. POST vignetteselected (empty body, vignetteId is in query string per HAR)
        $client->post(
            EZNAMKA_BASE . '/selfcare/purchase/singlepurchase/vignetteselected/?vignetteId=' . $vignetteId,
            [],
            ['Referer: ' . EZNAMKA_BASE . '/selfcare/purchase']
        );
        if ($client->lastStatus !== 200) {
            throw new RuntimeException("vignetteselected vrátil {$client->lastStatus}");
        }
        log_step($id, 'select', "Typ známky zvolený, effective_url={$client->lastUrl}, body_len=" . strlen($client->lastBody));

        // Ak vignetteselected vrátil len redirect/potvrdzovaciu stránku bez polí, dotiahni reálny formulár
        $formHtml = $client->lastBody;
        $formUrl = $client->lastUrl ?: (EZNAMKA_BASE . '/selfcare/purchase/singlepurchase/vignetteselected/?vignetteId=' . $vignetteId);

        $needsExtraGet = (substr_count($formHtml, '<input') < 5);
        if ($needsExtraGet) {
            // Skús GET na samotnú purchase stránku (po vignetteselected by mala zobraziť formulár)
            $client->get(EZNAMKA_BASE . '/selfcare/purchase/singlepurchase/', ['Referer: ' . $formUrl]);
            log_step($id, 'form', "GET form page, status={$client->lastStatus}, url={$client->lastUrl}, body_len=" . strlen($client->lastBody));
            if ($client->lastStatus === 200 && substr_count($client->lastBody, '<input') >= 5) {
                $formHtml = $client->lastBody;
                $formUrl = $client->lastUrl;
            }
        }

        // Vytiahni VŠETKY input polia (hidden + text + email + …) a select defaulty
        $hidden = [];
        if (preg_match_all('/<input\b[^>]*>/i', $formHtml, $inputs)) {
            foreach ($inputs[0] as $tag) {
                if (!preg_match('/\bname\s*=\s*"([^"]+)"/i', $tag, $nm)) continue;
                $type = '';
                if (preg_match('/\btype\s*=\s*"([^"]+)"/i', $tag, $tm)) $type = strtolower($tm[1]);
                if (in_array($type, ['submit', 'button', 'image', 'file'], true)) continue;
                $val = '';
                if (preg_match('/\bvalue\s*=\s*"([^"]*)"/i', $tag, $vm)) $val = $vm[1];
                $hidden[$nm[1]] = html_entity_decode($val, ENT_QUOTES);
            }
        }
        // Selecty: zober prvý <option ... selected> alebo prvý option
        if (preg_match_all('/<select\b[^>]*\bname\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/select>/i', $formHtml, $sels, PREG_SET_ORDER)) {
            foreach ($sels as $s) {
                $name = $s[1]; $inner = $s[2]; $val = '';
                if (preg_match('/<option[^>]*\bselected\b[^>]*\bvalue\s*=\s*"([^"]*)"/i', $inner, $om)) $val = $om[1];
                elseif (preg_match('/<option[^>]*\bvalue\s*=\s*"([^"]*)"/i', $inner, $om)) $val = $om[1];
                if (!isset($hidden[$name])) $hidden[$name] = html_entity_decode($val, ENT_QUOTES);
            }
        }
        if (isset($hidden['__RequestVerificationToken'])) {
            $rvt = $hidden['__RequestVerificationToken'];
        } else {
            $hidden['__RequestVerificationToken'] = $rvt;
        }
        log_step($id, 'parse', 'Parsované polia formulára', 'info', [
            'fields' => array_keys($hidden),
            'form_url' => $formUrl,
            'body_preview' => substr(strip_tags($formHtml), 0, 800),
        ]);

        // --- 3. Rieš reCAPTCHA cez Capsolver
        log_step($id, 'captcha', 'Posielam reCAPTCHA do Capsolver…');
        $captchaToken = capsolver_solve_recaptcha_v2(
            EZNAMKA_BASE . '/selfcare/purchase',
            EZNAMKA_SITEKEY
        );
        log_step($id, 'captcha', 'reCAPTCHA vyriešená');

        // --- 4. POST /selfcare/purchase/singlepurchase/check/
        $validFrom = date('d.m.Y', strtotime($task['validity_date']));
        $form = array_merge($hidden, [
            'Vignette.LicensePlateNumber'      => $task['license_plate'],
            'Vignette.RegistrationNumberAgain' => $task['license_plate'],
            'Vignette.VehicleCountryCode'      => $task['country_code'],
            'Vignette.ValidFrom'               => $validFrom,
            'Vignette.Email'                   => $task['email'],
            'Vignette.EmailAgain'              => $task['email'],
            'g-recaptcha-response'             => $captchaToken,
            'gdpr-checkbox'                    => 'true',
            'gtacop-checkbox'                  => 'true',
        ]);

        $client->post(
            EZNAMKA_BASE . '/selfcare/purchase/singlepurchase/check/',
            $form,
            [
                'Referer: ' . $formUrl,
                'X-Requested-With: XMLHttpRequest',
                'Accept: application/json, text/javascript, */*; q=0.01',
                'RequestVerificationToken: ' . $rvt,
                '__RequestVerificationToken: ' . $rvt,
            ]
        );
        log_step($id, 'check', "POST /check/ status={$client->lastStatus}", 'info', ['body_preview' => substr($client->lastBody, 0, 500)]);
        if ($client->lastStatus !== 200) {
            throw new RuntimeException("POST /check/ vrátil {$client->lastStatus}: " . substr($client->lastBody, 0, 300));
        }

        $checkResp = json_decode($client->lastBody, true);
        if (!is_array($checkResp)) {
            throw new RuntimeException('POST /check/ nevrátil JSON: ' . substr($client->lastBody, 0, 300));
        }
        if (!empty($checkResp['Errors']) || !empty($checkResp['errors'])) {
            throw new RuntimeException('Validation errors: ' . json_encode($checkResp));
        }

        // Checkout URL — môže byť v redirectUrl / RedirectUrl / Url / nextUrl
        $checkoutUrl = $checkResp['RedirectUrl'] ?? $checkResp['redirectUrl']
            ?? $checkResp['Url'] ?? $checkResp['url'] ?? null;
        if (!$checkoutUrl) {
            // Možno treba ešte GET na potvrdzovaciu stránku — zatiaľ ulož celý response na ladenie
            update_task($id, [
                'status' => 'paused_before_payment',
                'eznamka_checkout_url' => null,
                'updated_at' => gmdate('c'),
            ]);
            log_step($id, 'done', 'Formulár prešiel, ale checkout URL chýba v response — pozri body_preview vyššie', 'warning', $checkResp);
            return;
        }
        if (strpos($checkoutUrl, 'http') !== 0) {
            $checkoutUrl = EZNAMKA_BASE . '/' . ltrim($checkoutUrl, '/');
        }

        update_task($id, [
            'status' => 'paused_before_payment',
            'eznamka_checkout_url' => $checkoutUrl,
            'updated_at' => gmdate('c'),
        ]);
        log_step($id, 'done', 'Úloha pripravená, čaká na manuálnu platbu', 'info', ['checkout_url' => $checkoutUrl]);

    } catch (Throwable $e) {
        update_task($id, [
            'status' => 'failed',
            'error_message' => $e->getMessage(),
            'updated_at' => gmdate('c'),
        ]);
        log_step($id, 'error', $e->getMessage(), 'error', ['trace' => $e->getTraceAsString()]);
    } finally {
        $client->cleanup();
    }
}

// ============================================================
// MAIN
// ============================================================
$forcedTaskId = $_GET['task_id'] ?? null;

if ($forcedTaskId) {
    // Manuálne spustenie konkrétnej úlohy (z UI cez /tasks/{id}/run)
    $r = sb_request('GET', '/tasks', null, 'select=*&id=eq.' . urlencode($forcedTaskId));
    $rows = $r['json'];
    if (!is_array($rows) || empty($rows)) {
        echo "task not found\n";
        exit;
    }
    $task = $rows[0];
    // Prepni na running (bez ohľadu na predchádzajúci stav)
    update_task($task['id'], ['status' => 'running', 'error_message' => null, 'updated_at' => gmdate('c')]);
    $task['status'] = 'running';
    echo "running task {$task['id']} (manual)\n";
    process_task($task);
    echo "done\n";
    exit;
}

reset_stale_running_tasks(10);
$task = claim_next_pending_task();
if (!$task) {
    echo "no pending tasks\n";
    exit;
}
echo "running task {$task['id']}\n";
process_task($task);
echo "done\n";

