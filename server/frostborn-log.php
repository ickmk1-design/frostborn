<?php
// Upload to: https://cytbilisim.com/frostborn-log
// (rename file or configure .htaccess/nginx to route /frostborn-log to this script)
// Errors are appended to frostborn-errors.jsonl in the same directory.

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit;
}

$body = file_get_contents('php://input');
if (!$body) {
    http_response_code(400);
    exit;
}

$logFile = __DIR__ . '/frostborn-errors.jsonl';
file_put_contents($logFile, $body . "\n", FILE_APPEND | LOCK_EX);

http_response_code(200);
echo 'ok';
