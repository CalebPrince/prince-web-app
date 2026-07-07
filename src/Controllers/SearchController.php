<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Support\Database;
use App\Support\Response;

/** Simple site-wide search across published projects and blog posts. */
class SearchController
{
    /** GET /api/v1/search?q=... — public */
    public static function search(): void
    {
        $query = trim((string) ($_GET['q'] ?? ''));
        $words = array_filter(
            preg_split('/\W+/', strtolower($query)) ?: [],
            fn($w) => strlen($w) > 1
        );
        if (!$words) {
            Response::json(['results' => []]);
        }

        $score = function (string $haystack) use ($words): int {
            $haystack = strtolower($haystack);
            $n = 0;
            foreach ($words as $w) {
                if (str_contains($haystack, $w)) {
                    $n++;
                }
            }
            return $n;
        };

        $pdo = Database::get();
        $results = [];

        $projects = $pdo->query(
            "SELECT title, slug, summary, case_study_body, cover_image_path
             FROM projects WHERE is_published = 1"
        )->fetchAll();
        foreach ($projects as $p) {
            $s = $score($p['title'] . ' ' . $p['summary'] . ' ' . ($p['case_study_body'] ?? ''));
            if ($s > 0) {
                $results[] = [
                    'score' => $s,
                    'type' => 'project',
                    'title' => $p['title'],
                    'url' => '/project.html?slug=' . urlencode($p['slug']),
                    'snippet' => $p['summary'],
                    'image' => $p['cover_image_path'],
                ];
            }
        }

        $posts = $pdo->query(
            "SELECT title, slug, excerpt, cover_image_path
             FROM blog_posts WHERE is_published = 1"
        )->fetchAll();
        foreach ($posts as $b) {
            $s = $score($b['title'] . ' ' . $b['excerpt']);
            if ($s > 0) {
                $results[] = [
                    'score' => $s,
                    'type' => 'blog_post',
                    'title' => $b['title'],
                    'url' => '/blog-post.html?slug=' . urlencode($b['slug']),
                    'snippet' => $b['excerpt'],
                    'image' => $b['cover_image_path'],
                ];
            }
        }

        usort($results, fn($a, $b) => $b['score'] <=> $a['score']);
        $top = array_slice($results, 0, 20);
        foreach ($top as &$r) {
            unset($r['score']);
        }

        Response::json(['results' => $top]);
    }
}
