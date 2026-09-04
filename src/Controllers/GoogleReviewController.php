<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Support\Response;
use App\Support\Settings;

class GoogleReviewController
{
    /** GET /api/v1/google-rating — live public totals, with credentials kept server-side. */
    public static function rating(): void
    {
        $apiKey = Settings::get('google_places_api_key');
        $placeId = Settings::get('google_place_id');

        if (!$apiKey || !$placeId) {
            Response::json(['configured' => false]);
        }

        if (!function_exists('curl_init')) {
            Response::error('Google rating service is unavailable.', 503);
        }

        $url = 'https://places.googleapis.com/v1/places/' . rawurlencode($placeId);
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 8,
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
                'X-Goog-Api-Key: ' . $apiKey,
                'X-Goog-FieldMask: rating,userRatingCount,googleMapsUri',
            ],
        ]);

        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($body === false || $error !== '' || $status < 200 || $status >= 300) {
            Response::error('Google rating could not be refreshed.', 502);
        }

        $place = json_decode((string) $body, true);
        if (!is_array($place) || !isset($place['rating'], $place['userRatingCount'])) {
            Response::error('Google returned incomplete rating data.', 502);
        }

        Response::json([
            'configured' => true,
            'rating' => (float) $place['rating'],
            'reviewCount' => (int) $place['userRatingCount'],
            'googleMapsUri' => isset($place['googleMapsUri']) ? (string) $place['googleMapsUri'] : null,
        ]);
    }
}
