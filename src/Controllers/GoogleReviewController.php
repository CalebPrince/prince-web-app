<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Response;
use App\Support\Settings;

class GoogleReviewController
{
    /** How many of the newest approved reviews the landing page shows. */
    private const LANDING_LIMIT = 5;

    public static function rating(): void
    {
        if (Settings::get('google_rating_published') === '0') Response::json(['configured' => false]);
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
        // Fail soft: if Google is down or slow, approved reviews still show
        // from the copies saved when they were approved.
        $place = self::fetchPlace(true, true);
        $placements = self::placements();

        // A review only appears where the admin clicked its button for that
        // placement. The testimonials page shows every review approved for it;
        // the landing page shows only the five most recent approved for it.
        $approved = array_values(array_filter(
            self::withSavedCopies($place, $placements),
            static fn(array $review): bool => in_array($placement, $placements[$review['id']] ?? [], true)
        ));
        // publishTime is RFC 3339 UTC, so it sorts correctly as a string.
        usort($approved, static fn(array $a, array $b): int => strcmp($b['publishTime'], $a['publishTime']));

        Response::json($placement === 'landing' ? array_slice($approved, 0, self::LANDING_LIMIT) : $approved);
    }

    public static function adminReviews(): void
    {
        AuthMiddleware::requireAuth();
        $place = self::fetchPlace(true);
        if ($place === null) Response::json(['configured' => false, 'reviews' => [], 'ratingPublished' => Settings::get('google_rating_published') !== '0']);
        $placements = self::placements();
        self::refreshSavedCopies($place, $placements);
        $reviews = array_map(static function (array $review) use ($placements): array {
            $review['placements'] = $placements[$review['id']] ?? [];
            return $review;
        }, self::withSavedCopies($place, $placements));
        Response::json(['configured' => true, 'reviews' => $reviews, 'ratingPublished' => Settings::get('google_rating_published') !== '0']);
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
        $copies = self::savedCopies();
        if ($placements === []) {
            unset($saved[$id], $copies[$id]);
        } else {
            // Save the review's text now: Google's API only returns a handful
            // of reviews, so an approved one can stop being returned later.
            $place = self::fetchPlace(true, true);
            foreach (self::normaliseReviews($place['reviews'] ?? []) as $review) {
                if ($review['id'] === $id) $copies[$id] = $review;
            }
            if (!isset($copies[$id])) {
                Response::error('Google is no longer returning that review, so it cannot be approved.', 422);
            }
            $saved[$id] = $placements;
        }
        Settings::set('google_review_placements', json_encode($saved, JSON_UNESCAPED_SLASHES) ?: '{}');
        Settings::set('google_review_copies', json_encode($copies, JSON_UNESCAPED_SLASHES) ?: '{}');
        Response::json(['status' => 'updated', 'placements' => $placements]);
    }

    private static function placements(): array
    {
        $decoded = json_decode(Settings::get('google_review_placements') ?: '{}', true);
        return is_array($decoded) ? $decoded : [];
    }

    /** Copies of approved reviews, keyed by review id, saved at approval time. */
    private static function savedCopies(): array
    {
        $decoded = json_decode(Settings::get('google_review_copies') ?: '{}', true);
        return is_array($decoded) ? $decoded : [];
    }

    /**
     * Live reviews from Google plus, for every approved review Google no
     * longer returns, the copy saved when it was approved (flagged
     * `archived`), so approved reviews never silently vanish.
     *
     * @return array<int,array<string,mixed>>
     */
    private static function withSavedCopies(?array $place, array $placements): array
    {
        $reviews = self::normaliseReviews($place['reviews'] ?? []);
        $liveIds = array_column($reviews, 'id');
        $copies = self::savedCopies();
        foreach ($placements as $id => $where) {
            if ($where === [] || in_array($id, $liveIds, true) || !isset($copies[$id]) || !is_array($copies[$id])) continue;
            $reviews[] = ['archived' => true] + $copies[$id];
        }
        return $reviews;
    }

    /**
     * Keeps the saved copy of every approved review in step with what Google
     * currently returns (a reviewer can edit their text) and backfills a copy
     * for reviews approved before copies existed. Admin-only, so public page
     * views never write to the database.
     */
    private static function refreshSavedCopies(?array $place, array $placements): void
    {
        $copies = self::savedCopies();
        $changed = false;
        foreach (self::normaliseReviews($place['reviews'] ?? []) as $review) {
            if (($placements[$review['id']] ?? []) === []) continue;
            if (($copies[$review['id']] ?? null) !== $review) {
                $copies[$review['id']] = $review;
                $changed = true;
            }
        }
        if ($changed) Settings::set('google_review_copies', json_encode($copies, JSON_UNESCAPED_SLASHES) ?: '{}');
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

    private static function fetchPlace(bool $includeReviews, bool $failSoft = false): ?array
    {
        $apiKey = Settings::get('google_places_api_key');
        $placeId = Settings::get('google_place_id');
        if (!$apiKey || !$placeId) return null;
        if (!function_exists('curl_init')) {
            if ($failSoft) return null;
            Response::error('Google review service is unavailable.', 503);
        }
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
            if ($failSoft) return null;
            Response::error('Google reviews could not be refreshed.', 502);
        }
        $place = json_decode((string) $body, true);
        if (!is_array($place)) {
            if ($failSoft) return null;
            Response::error('Google returned invalid place data.', 502);
        }
        return $place;
    }
}
