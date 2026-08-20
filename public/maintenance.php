<?php

declare(strict_types=1);

// Thin wrapper so the maintenance page can be served with a real 503 status.
// .htaccess internally rewrites blocked requests here (no redirect involved
// — the browser's URL bar and the request itself never change).
//
// The markup is inline rather than read from maintenance.html because the
// HTML pages are gone: this is the one page that has to render when the Node
// app is unavailable, so it cannot be a Next route. Keep it self-contained —
// no /css or /js includes — so it works even mid-deploy.
http_response_code(503);
header('Retry-After: 3600');
header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>Back shortly | Prince Caleb</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #0b0c0e; color: #f3f4f6; text-align: center; padding: 2rem;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  h1 { font-size: clamp(1.8rem, 5vw, 2.75rem); margin: 0 0 1rem; letter-spacing: -0.02em; }
  p { margin: 0 auto; max-width: 32rem; line-height: 1.6; color: #9aa0a6; }
  .mark {
    display: inline-grid; place-items: center; width: 3rem; height: 3rem;
    margin-bottom: 2rem; border: 1px solid #2a2d34; border-radius: 999px;
    font-weight: 700; color: #4ade80;
  }
</style>
</head>
<body>
  <main>
    <div class="mark">P</div>
    <h1>Back shortly</h1>
    <p>The site is down for scheduled maintenance and will return in a few minutes. Thanks for your patience.</p>
  </main>
</body>
</html>
