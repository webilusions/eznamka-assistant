<?php
require_once __DIR__ . '/config.php';

// ====== CORS ======
header('Access-Control-Allow-Origin: ' . CORS_ORIGIN);
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ====== Helpers ======
function json_response($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function json_error($message, $status = 400) {
    json_response(['error' => $message], $status);
}

function supabase_request($method, $path, $body = null, $query = '') {
    $url = rtrim(SUPABASE_URL, '/') . '/rest/v1' . $path . ($query ? '?' . $query : '');
    $ch = curl_init($url);
    $headers = [
        'apikey: ' . SUPABASE_API_KEY,
        'Authorization: Bearer ' . SUPABASE_API_KEY,
        'Content-Type: application/json',
        'Prefer: return=representation',
    ];
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 15,
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }
    $response = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($err) {
        json_error('Supabase connection failed: ' . $err, 502);
    }
    return ['status' => $status, 'body' => $response];
}

function get_input() {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

// ====== Router ======
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = preg_replace('#^/api#', '', $path);
$path = rtrim($path, '/');
$method = $_SERVER['REQUEST_METHOD'];

// /health
if ($path === '/health' && $method === 'GET') {
    json_response(['ok' => true]);
}

// /check — samostatná kontrola platnosti diaľničnej známky
if ($path === '/check' && $method === 'POST') {
    require __DIR__ . '/check.php';
    exit;
}

// /tasks
if ($path === '/tasks' && $method === 'GET') {
    $r = supabase_request('GET', '/tasks', null, 'select=*&order=created_at.desc');
    http_response_code($r['status']);
    echo $r['body'];
    exit;
}

if ($path === '/tasks' && $method === 'POST') {
    $in = get_input();
    $required = ['licensePlate', 'countryCode', 'vignetteType', 'validityDate', 'email'];
    foreach ($required as $k) {
        if (empty($in[$k])) json_error("Chýba pole: $k");
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $in['validityDate'])) {
        json_error('Neplatný formát validityDate (YYYY-MM-DD)');
    }
    if (!filter_var($in['email'], FILTER_VALIDATE_EMAIL)) {
        json_error('Neplatný email');
    }
    $payload = [
        'license_plate' => $in['licensePlate'],
        'country_code' => $in['countryCode'],
        'vignette_type' => $in['vignetteType'],
        'validity_date' => $in['validityDate'],
        'email' => $in['email'],
        'status' => 'pending',
    ];
    $r = supabase_request('POST', '/tasks', $payload);
    $data = json_decode($r['body'], true);
    if ($r['status'] >= 400) {
        json_error($data['message'] ?? 'Chyba pri vytváraní úlohy', $r['status']);
    }
    json_response(is_array($data) && isset($data[0]) ? $data[0] : $data);
}

// /tasks/{id}
if (preg_match('#^/tasks/([a-f0-9-]+)$#i', $path, $m)) {
    $id = $m[1];
    if ($method === 'GET') {
        $r = supabase_request('GET', '/tasks', null, 'select=*&id=eq.' . urlencode($id));
        $data = json_decode($r['body'], true);
        if (empty($data)) json_error('Úloha nenájdená', 404);
        json_response($data[0]);
    }
    if ($method === 'DELETE') {
        $r = supabase_request('DELETE', '/tasks', null, 'id=eq.' . urlencode($id));
        if ($r['status'] >= 400) json_error('Mazanie zlyhalo', $r['status']);
        json_response(['success' => true]);
    }
}

// /tasks/{id}/logs
if (preg_match('#^/tasks/([a-f0-9-]+)/logs$#i', $path, $m) && $method === 'GET') {
    $r = supabase_request('GET', '/task_logs', null,
        'select=*&task_id=eq.' . urlencode($m[1]) . '&order=created_at.asc');
    http_response_code($r['status']);
    echo $r['body'];
    exit;
}

// /tasks/{id}/screenshots
if (preg_match('#^/tasks/([a-f0-9-]+)/screenshots$#i', $path, $m) && $method === 'GET') {
    $r = supabase_request('GET', '/task_screenshots', null,
        'select=*&task_id=eq.' . urlencode($m[1]) . '&order=created_at.asc');
    http_response_code($r['status']);
    echo $r['body'];
    exit;
}

// /tasks/{id}/run  — manuálne spustenie automatizácie pre konkrétnu úlohu
if (preg_match('#^/tasks/([a-f0-9-]+)/run$#i', $path, $m) && $method === 'POST') {
    $id = $m[1];
    // Over existenciu
    $r = supabase_request('GET', '/tasks', null, 'select=id&id=eq.' . urlencode($id));
    $data = json_decode($r['body'], true);
    if (empty($data)) json_error('Úloha nenájdená', 404);

    // Zostav absolútnu URL workera (rovnaký host)
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $workerUrl = $scheme . '://' . $_SERVER['HTTP_HOST'] . '/api/worker.php'
        . '?secret=' . urlencode(WORKER_SECRET)
        . '&task_id=' . urlencode($id);

    // Fire-and-forget: krátky timeout, worker beží ďalej na pozadí (ignore_user_abort)
    $ch = curl_init($workerUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 2,
        CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_NOSIGNAL => 1,
    ]);
    curl_exec($ch);
    curl_close($ch);

    json_response(['success' => true, 'message' => 'Spúšťam automatizáciu na pozadí']);
}

json_error('Endpoint nenájdený: ' . $method . ' ' . $path, 404);
