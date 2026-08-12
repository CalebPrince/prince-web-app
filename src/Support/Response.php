<?php

declare(strict_types=1);

namespace App\Support;

class Response
{
    public static function json(mixed $data, int $status = 200): never
    {
        header('Content-Type: application/json');
        // json_encode() returns false — not an exception — on invalid UTF-8
        // anywhere in $data (e.g. raw error_log content isn't guaranteed
        // valid UTF-8). Without JSON_INVALID_UTF8_SUBSTITUTE that silently
        // produced a 200 OK with an empty body: the frontend's api.js
        // couldn't parse it, returned null, and callers crashed reading a
        // property off it (e.g. "Cannot read properties of null (reading
        // 'sources')" on the error-logs page) with no clue what went wrong.
        $encoded = json_encode($data, JSON_INVALID_UTF8_SUBSTITUTE);
        if ($encoded === false) {
            http_response_code(500);
            echo json_encode(['error' => 'Could not encode response as JSON: ' . json_last_error_msg()]);
            exit;
        }
        http_response_code($status);
        echo $encoded;
        exit;
    }

    public static function error(string $message, int $status = 400): never
    {
        self::json(['error' => $message], $status);
    }
}
