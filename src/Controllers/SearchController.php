<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Database;
use App\Support\Response;

/** Simple site-wide search across published projects and blog posts. */
class SearchController
{
    /** GET /api/v1/admin/search?q=... — CRM-wide admin lookup. */
    public static function adminSearch(): void
    {
        AuthMiddleware::requireAuth();
        $query = trim((string) ($_GET['q'] ?? ''));
        if (mb_strlen($query) < 2) Response::json(['results' => []]);
        $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $query) . '%';
        $pdo = Database::get(); $results = [];
        $run = static function (string $sql, array $params, string $type, string $href, callable $map) use ($pdo, &$results): void {
            $stmt = $pdo->prepare($sql); $stmt->execute($params);
            foreach ($stmt->fetchAll() as $row) $results[] = array_merge(['type'=>$type, 'href'=>$href], $map($row));
        };
        $run("SELECT id,name,email,message,created_at FROM inquiries WHERE name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR message LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT 8", [$like,$like,$like], 'Inquiry', '/admin/inquiries.html', fn($r)=>['title'=>$r['name'],'detail'=>$r['email'].' · '.mb_substr($r['message'],0,100),'date'=>$r['created_at']]);
        $run("SELECT id,name,email,phone,created_at FROM clients WHERE name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT 8", [$like,$like,$like], 'Client', '/admin/clients.html', fn($r)=>['title'=>$r['name'],'detail'=>$r['email'].($r['phone']?' · '.$r['phone']:''),'date'=>$r['created_at']]);
        $run("SELECT id,client_name,client_email,topic,created_at FROM appointments WHERE client_name LIKE ? ESCAPE '\\' OR client_email LIKE ? ESCAPE '\\' OR topic LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT 8", [$like,$like,$like], 'Booking', '/admin/appointments.html', fn($r)=>['title'=>$r['client_name'],'detail'=>$r['client_email'].' · '.($r['topic']?:'Discovery call'),'date'=>$r['created_at']]);
        $run("SELECT id,client_name,client_email,title,created_at FROM proposals WHERE client_name LIKE ? ESCAPE '\\' OR client_email LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT 8", [$like,$like,$like], 'Proposal', '/admin/proposals.html', fn($r)=>['title'=>$r['title'],'detail'=>$r['client_name'].' · '.$r['client_email'],'date'=>$r['created_at']]);
        $run("SELECT id,business_name,contact_email,website_url,created_at FROM marketing_leads WHERE business_name LIKE ? ESCAPE '\\' OR contact_email LIKE ? ESCAPE '\\' OR website_url LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT 8", [$like,$like,$like], 'Marketing lead', '/admin/marketing-leads.html', fn($r)=>['title'=>$r['business_name'],'detail'=>$r['contact_email']?:($r['website_url']?:'No contact detail'),'date'=>$r['created_at']]);
        usort($results, static fn($a,$b)=>strcmp($b['date'],$a['date']));
        Response::json(['results'=>array_slice($results,0,25)]);
    }

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
                    'url' => '/archive-post.html?slug=' . urlencode($b['slug']),
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
