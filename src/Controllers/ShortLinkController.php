<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Support\ShortLink;

class ShortLinkController
{
    /** GET /s/{code} — public redirect */
    public static function redirect(array $params): void
    {
        $target = ShortLink::resolve($params['code'] ?? '');
        if ($target === null) {
            http_response_code(404);
            // DOCUMENT_ROOT, not '../../public' — production deploys public/'s
            // contents into public_html/, so a literal "public/" folder next to
            // src/ doesn't exist there.
            $docRoot = $_SERVER['DOCUMENT_ROOT'] ?? (dirname(__DIR__, 2) . '/public');
            $notFoundPage = $docRoot . '/404.html';
            if (is_file($notFoundPage)) {
                readfile($notFoundPage);
            } else {
                echo 'Not found';
            }
            return;
        }

        header('Location: ' . $target, true, 302);
    }
}
