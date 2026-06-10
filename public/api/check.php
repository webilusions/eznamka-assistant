<?php
/**
 * Samostatná kontrola platnosti diaľničnej známky.
 *
 * Použitie:
 *   POST /api/check.php
 *   Content-Type: application/json
 *   { "licensePlate": "ZM979CG", "countryCode": "SK", "validityDate": "2026-06-10" }
 *
 *   (validityDate je voliteľný — ak chýba, použije sa dnešok)
 *
 * Odpoveď:
 *   { "conflict": bool, "summary": "...", "reasons": [...], "vignettes": [...], "body_preview": "..." }
 */

require_once __DIR__ . '/config.php';

header('Access-Control-Allow-Origin: ' . CORS_ORIGIN);
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

set_time_limit(180);

$raw = file_get_contents('php://input');
$in = json_decode($raw, true) ?: [];

$plate = trim($in['licensePlate'] ?? '');
$country = trim($in['countryCode'] ?? 'SK');
$date = trim($in['validityDate'] ?? date('Y-m-d'));

if ($plate === '') {
    http_response_code(400);
    echo json_encode(['error' => 'licensePlate je povinný']);
    exit;
}
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
    http_response_code(400);
    echo json_encode(['error' => 'validityDate musí byť YYYY-MM-DD']);
    exit;
}

// ============================================================
// Minimálny HTTP klient (cookie jar v /tmp)
// ============================================================
class CheckClient {
    private string $jar;
    public string $lastBody = '';
    public int $lastStatus = 0;
    public string $lastUrl = '';

    public function __construct() {
        $dir = defined('COOKIE_DIR') ? COOKIE_DIR : sys_get_temp_dir();
        if (!is_dir($dir)) @mkdir($dir, 0777, true);
        $this->jar = $dir . '/check_' . bin2hex(random_bytes(8)) . '.cookie';
        @file_put_contents($this->jar, '');
    }
    public function __destruct() { @unlink($this->jar); }

    private function req(string $method, string $url, ?array $form, array $headers): void {
        $ch = curl_init($url);
        $h = array_merge([
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            'Accept-Language: sk-SK,sk;q=0.9,en;q=0.8',
        ], $headers);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_COOKIEJAR => $this->jar,
            CURLOPT_COOKIEFILE => $this->jar,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 5,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_HTTPHEADER => $h,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            $body = $form !== null ? http_build_query($form) : '';
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
            $h[] = 'Content-Length: ' . strlen($body);
            curl_setopt($ch, CURLOPT_HTTPHEADER, $h);
        }
        $resp = curl_exec($ch);
        $this->lastStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $this->lastUrl = (string)curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
        $this->lastBody = $resp === false ? '' : $resp;
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) throw new RuntimeException("HTTP chyba: $err");
    }
    public function get(string $url, array $h = []): void { $this->req('GET', $url, null, array_merge(['Accept: text/html,*/*'], $h)); }
    public function post(string $url, array $form, array $h = []): void {
        $this->req('POST', $url, $form, array_merge([
            'Content-Type: application/x-www-form-urlencoded',
            'Origin: ' . EZNAMKA_BASE,
        ], $h));
    }
}

// ============================================================
// Capsolver
// ============================================================
function check_solve_recaptcha(string $pageUrl): string {
    $payload = [
        'clientKey' => CAPSOLVER_API_KEY,
        'task' => [
            'type' => 'ReCaptchaV2TaskProxyless',
            'websiteURL' => $pageUrl,
            'websiteKey' => EZNAMKA_SITEKEY,
        ],
    ];
    $ch = curl_init('https://api.capsolver.com/createTask');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($payload), CURLOPT_TIMEOUT => 30,
    ]);
    $r = json_decode(curl_exec($ch), true);
    curl_close($ch);
    if (empty($r['taskId'])) throw new RuntimeException('Capsolver createTask: ' . json_encode($r));
    $taskId = $r['taskId'];
    for ($i = 0; $i < 60; $i++) {
        sleep(2);
        $ch = curl_init('https://api.capsolver.com/getTaskResult');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode(['clientKey' => CAPSOLVER_API_KEY, 'taskId' => $taskId]),
            CURLOPT_TIMEOUT => 30,
        ]);
        $rr = json_decode(curl_exec($ch), true);
        curl_close($ch);
        if (($rr['status'] ?? '') === 'ready') return $rr['solution']['gRecaptchaResponse'];
        if (($rr['status'] ?? '') === 'failed') throw new RuntimeException('Capsolver failed: ' . json_encode($rr));
    }
    throw new RuntimeException('Capsolver timeout');
}

// ============================================================
// Hlavná logika
// ============================================================
try {
    $client = new CheckClient();

    $checkUrl = EZNAMKA_BASE . '/selfcare/modification/select/select-vignettes/?operation=Check';
    $client->get($checkUrl);
    if ($client->lastStatus !== 200) {
        throw new RuntimeException("GET kontrola vrátil {$client->lastStatus}");
    }
    $html = $client->lastBody;
    $rvt = '';
    if (preg_match('/name="__RequestVerificationToken"[^>]+value="([^"]+)"/', $html, $m)) $rvt = $m[1];

    $captcha = check_solve_recaptcha($checkUrl);

    $form = [
        'VignetteNumberRequired' => 'False',
        'Operation' => 'Check',
        'LicensePlateNumber' => $plate,
        'VehicleCountryCode' => $country,
        'g-recaptcha-response' => $captcha,
    ];
    if ($rvt !== '') $form['__RequestVerificationToken'] = $rvt;

    $headers = [
        'Referer: ' . $checkUrl,
        'X-Requested-With: XMLHttpRequest',
        'Accept: text/html, */*; q=0.01',
    ];
    if ($rvt !== '') {
        $headers[] = 'RequestVerificationToken: ' . $rvt;
        $headers[] = '__RequestVerificationToken: ' . $rvt;
    }

    $client->post(EZNAMKA_BASE . '/selfcare/modification/select/get-vignettes/', $form, $headers);
    if ($client->lastStatus !== 200) {
        throw new RuntimeException("POST get-vignettes vrátil {$client->lastStatus}");
    }
    $body = $client->lastBody;

    // Odpoveď je JSON { validationFailed, view: "<html>" } — vytiahni view
    $html = $body;
    $decoded = json_decode($body, true);
    if (is_array($decoded) && isset($decoded['view'])) {
        $html = $decoded['view'];
    }
    // Normalizácia
    $text = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = preg_replace('/\s+/u', ' ', $text);

    $targetTs = strtotime($date);
    $vignettes = [];
    $conflict = false;
    $reasons = [];

    // 1) Klasický rozsah dátumov "1.1.2025 - 31.12.2025"
    if (preg_match_all('/(\d{1,2}\.\s?\d{1,2}\.\s?\d{4})\s*(?:-|do|–|—)\s*(\d{1,2}\.\s?\d{1,2}\.\s?\d{4})/u', $text, $mm, PREG_SET_ORDER)) {
        foreach ($mm as $row) {
            $from = strtotime(str_replace(' ', '', $row[1]));
            $to   = strtotime(str_replace(' ', '', $row[2]));
            $vignettes[] = ['type' => 'Známka', 'validFrom' => $row[1], 'validTo' => $row[2], 'isValid' => ($from && $to && time() >= $from && time() <= $to)];
            if ($from && $to && $targetTs >= $from && $targetTs <= $to) {
                $conflict = true;
                $reasons[] = "Platná známka {$row[1]} – {$row[2]} pokrýva {$date}";
            }
        }
    }

    // 2) Ročné známky typu "365-dňová 2025" alebo "Ročná 2025"
    if (preg_match_all('/(365[-\s]?dňová|Ročná|ročná)\s+(\d{4})/u', $text, $ym, PREG_SET_ORDER)) {
        foreach ($ym as $row) {
            $year = (int)$row[2];
            $from = strtotime("$year-01-01");
            $to   = strtotime("$year-12-31");
            // Slovenské ročné známky platia od 1.1. do 31.1. nasledujúceho roka
            $toExt = strtotime(($year + 1) . "-01-31");
            $vignettes[] = [
                'type' => trim($row[0]),
                'validFrom' => date('d.m.Y', $from),
                'validTo' => date('d.m.Y', $toExt),
                'isValid' => (time() >= $from && time() <= $toExt),
            ];
            if ($targetTs >= $from && $targetTs <= $toExt) {
                $conflict = true;
                $reasons[] = "Ročná známka {$year} pokrýva {$date}";
            }
        }
    }

    $noVignette = (bool)preg_match('/nebol[ai]? (nájden|evidovan)|neevidujem|neexistuj|žiadn[aeé]\s+(diaľničn|známk)/iu', $text);
    $hasVignettesText = (bool)preg_match('/sú evidované|evidované nasledujúce|nasledujúce diaľničné známky/iu', $text);

    $summary = $conflict
        ? implode('; ', $reasons)
        : ($noVignette
            ? 'Žiadna platná známka pre toto vozidlo'
            : ($hasVignettesText && empty($vignettes)
                ? 'Vozidlo má evidované známky, ale nepokrývajú cieľový dátum'
                : (empty($vignettes) ? 'Žiadna platná známka pre toto vozidlo' : 'Pre cieľový dátum nie je konflikt')));

    echo json_encode([
        'conflict' => $conflict,
        'summary' => $summary,
        'reasons' => $reasons,
        'vignettes' => $vignettes,
        'license_plate' => $plate,
        'country_code' => $country,
        'validity_date' => $date,
        'body_preview' => substr(strip_tags($body), 0, 1500),
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
