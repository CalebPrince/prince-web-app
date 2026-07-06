<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Response;

/**
 * Admin-only image uploads for project covers and galleries. Files are
 * renamed to a random token (never the original filename) and written
 * straight into public/uploads — no processing, no thumbnails.
 */
class UploadController
{
    private const MAX_BYTES = 5 * 1024 * 1024; // 5MB
    private const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];

    /** POST /api/v1/admin/uploads — multipart form field "file" */
    public static function upload(): void
    {
        AuthMiddleware::requireAuth();

        if (empty($_FILES['file']) || $_FILES['file']['error'] === UPLOAD_ERR_NO_FILE) {
            Response::error('No file was uploaded.', 422);
        }

        $file = $_FILES['file'];
        if ($file['error'] !== UPLOAD_ERR_OK) {
            Response::error('Upload failed — the file may be too large.', 422);
        }
        if ($file['size'] > self::MAX_BYTES) {
            Response::error('Images must be under 5MB.', 422);
        }

        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, self::ALLOWED_EXT, true)) {
            Response::error('Allowed image types: jpg, png, gif, webp, svg.', 422);
        }

        if ($ext === 'svg') {
            $contents = file_get_contents($file['tmp_name']);
            if ($contents === false || !str_contains($contents, '<svg')) {
                Response::error('That file is not a valid SVG image.', 422);
            }
        } elseif (@getimagesize($file['tmp_name']) === false) {
            Response::error('That file is not a valid image.', 422);
        }

        $filename = bin2hex(random_bytes(10)) . '.' . $ext;
        $destination = dirname(__DIR__, 2) . '/public/uploads/' . $filename;

        if (!move_uploaded_file($file['tmp_name'], $destination)) {
            Response::error('Could not save the uploaded file.', 500);
        }

        Response::json(['path' => '/uploads/' . $filename], 201);
    }
}
