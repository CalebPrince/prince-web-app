<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Response;
use App\Support\Settings;

class GoogleReviewController
{
    public static function rating(): void
    {
        $place = self::fetchPlace(false);
        if ($place === null) Response::json(['configured' => false]);
        Response::json([
            'configured' => true,
            'rating' => isset($place['rating']) ? (float) $place['rating'] : 0.0,
            'reviewCount' => isset($place['userRatingCount']) ? (int) $place['userRatingCount'] : 0,
            'googleMapsUri' => isset($place['googleMapsUri']) ? (string) $place['googleMapsUri'] : null,
        ]);
    }

    public static function publicReviews(): void
    {
        $placement = trim((string) ($_GET['placement'] ?? 'testimonials'));
        if (!in_array($placement, ['landing', 'testimonials'], true)) {
            Response::error('Invalid Google review placement.', 422);
        }
        $place = self::fetchPlace(true);
        if ($place === null) Response::json([]);
        $placements = self::placements();
        Response::json(array_values(array_filter(
            self::normaliseReviews($place['reviews'] ?? []),
            static fn(array $review): bool => in_array($placement, $placements[$review['id']] ?? [], true)
        )));
    }

    public static function adminReviews(): void
    {
        AuthMiddleware::requireAuth();
        $place = self::fetchPlace(true);
        if ($place === null) Response::json(['configured' => false, 'reviews' => []]);
        $placements = self::placements();
        $reviews = array_map(static function (array $review) use ($placements): array {
            $review['placements'] = $placements[$review['id']] ?? [];
            return $review;
        }, self::normaliseReviews($place['reviews'] ?? []));
        Response::json(['configured' => true, 'reviews' => $reviews]);
    }

    public static function updatePlacements(): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $id = trim((string) ($data['id'] ?? ''));
        $placements = array_values(array_unique(array_filter(
            is_array($data['placements'] ?? null) ? $data['placements'] : [],
            static fn(mixed $value): bool => in_array($value, ['landing', 'testimonials'], true)
        )));
        if ($id === '' || strlen($id) > 128) Response::error('A valid Google review ID is required.', 422);
        $saved = self::placements();
        if ($placements === []) unset($saved[$id]); else $saved[$id] = $placements;
        Settings::set('google_review_placements', json_encode($saved, JSON_UNESCAPED_SLASHES) ?: '{}');
        Response::json(['status' => 'updated', 'placements' => $placements]);
    }

    private static function placements(): array
    {
        $decoded = json_decode(Settings::get('google_review_placements') ?: '{}', true);
        return is_array($decoded) ? $decoded : [];
    }

    private static function normaliseReviews(mixed $rows): array
    {
        if (!is_array($rows)) return [];
        $out = [];
        foreach ($rows as $review) {
            if (!is_array($review)) continue;
            $text = trim((string) ($review['text']['text'] ?? ''));
            $author = is_array($review['authorAttribution'] ?? null) ? $review['authorAttribution'] : [];
            $sourceUrl = (string) ($review['googleMapsUri'] ?? '');
            $fingerprint = $sourceUrl !== '' ? $sourceUrl : implode('|', [
                (string) ($author['displayName'] ?? ''), (string) ($review['publishTime'] ?? ''), $text,
            ]);
            $out[] = [
                'id' => substr(hash('sha256', $fingerprint), 0, 24),
                'authorName' => (string) ($author['displayName'] ?? 'Google reviewer'),
                'authorUri' => (string) ($author['uri'] ?? ''),
                'authorPhotoUri' => (string) ($author['photoUri'] ?? ''),
                'rating' => (int) ($review['rating'] ?? 0),
                'text' => $text,
                'relativeTime' => (string) ($review['relativePublishTimeDescription'] ?? ''),
                'publishTime' => (string) ($review['publishTime'] ?? ''),
                'googleMapsUri' => $sourceUrl,
            ];
        }
        return $out;
    }

    private static function fetchPlace(bool $includeReviews): ?array
    {
        $apiKey = Settings::get('google_places_api_key');
        $placeId = Settings::get('google_place_id');
        if (!$apiKey || !$placeId) return null;
        if (!function_exists('curl_init')) Response::error('Google review service is unavailable.', 503);
        $fields = 'rating,userRatingCount,googleMapsUri' . ($includeReviews ? ',reviews' : '');
        $ch = curl_init('https://places.googleapis.com/v1/places/' . rawurlencode($placeId));
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 8,
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
                'X-Goog-Api-Key: ' . $apiKey,
                'X-Goog-FieldMask: ' . $fields,
            ],
        ]);
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        if ($body === false || $error !== '' || $status < 200 || $status >= 300) {
            Response::error('Google reviews could not be refreshed.', 502);
        }
        $place = json_decode((string) $body, true);
        if (!is_array($place)) Response::error('Google returned invalid place data.', 502);
        return $place;
    }
}
