<?php

declare(strict_types=1);

// Thin wrapper so the maintenance page can be served with a real 503 status.
// .htaccess internally rewrites blocked requests here (no redirect involved
// — the browser's URL bar and the request itself never change), and this
// file just sets the status code before outputting the same static markup.
http_response_code(503);
header('Retry-After: 3600');
readfile(__DIR__ . '/maintenance.html');
