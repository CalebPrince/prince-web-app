<?php

declare(strict_types=1);

require dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;

$pdo = Database::get();

$adminEmail = $argv[1] ?? 'admin@princecaleb.dev';
$adminPassword = $argv[2] ?? 'change-me-now-123';

$existing = $pdo->prepare('SELECT id FROM users WHERE email = ?');
$existing->execute([$adminEmail]);
if (!$existing->fetch()) {
    $stmt = $pdo->prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');
    $stmt->execute([$adminEmail, password_hash($adminPassword, PASSWORD_DEFAULT)]);
    echo "Admin user created: $adminEmail / $adminPassword\n";
} else {
    echo "Admin user already exists: $adminEmail\n";
}

$tags = ['PHP', 'Python', 'React', 'Mobile', 'WordPress', 'API'];
$tagIds = [];
foreach ($tags as $name) {
    $slug = strtolower(str_replace(' ', '-', $name));
    $stmt = $pdo->prepare('SELECT id FROM tags WHERE slug = ?');
    $stmt->execute([$slug]);
    $row = $stmt->fetch();
    if ($row) {
        $tagIds[$name] = $row['id'];
        continue;
    }
    $stmt = $pdo->prepare('INSERT INTO tags (name, slug) VALUES (?, ?)');
    $stmt->execute([$name, $slug]);
    $tagIds[$name] = (int) $pdo->lastInsertId();
}

$projects = [
    [
        'slug' => 'fintech-ledger-dashboard',
        'title' => 'Fintech Ledger Dashboard',
        'summary' => 'A real-time accounting dashboard built from scratch with a custom REST API and role-based access control.',
        'case_study_body' =>
            "The client — a small accounting firm — was running client bookkeeping across a patchwork of spreadsheets, email threads, and a legacy desktop tool that only one person in the office knew how to operate. Nothing synced, nothing was auditable, and onboarding a new account officer took weeks.\n\n" .
            "I designed and built a custom ledger platform from scratch: a PHP/MySQL REST API with row-level access control so an account officer only ever sees their own assigned clients, and clients only ever see their own records — enforced at the query level, not just hidden in the UI.\n\n" .
            "Key engineering decisions:\n" .
            "— JWT auth with a token-version kill switch, so revoking access is instant instead of waiting for tokens to expire.\n" .
            "— A reconciliation engine that flags unmatched transactions automatically, with every AI-assisted suggestion requiring explicit human approval before anything is written to the ledger.\n" .
            "— A full audit trail: every read, write, and denied access attempt is logged with who/what/when, satisfying the firm's compliance requirements without them having to think about it.\n\n" .
            "Result: onboarding a new account officer went from weeks to under a day, and the firm passed its first external audit with the platform's audit log as primary evidence — no manual reconstruction needed.",
        'category' => 'custom_solution',
        'live_url' => 'https://example.com',
        'repo_url' => null,
        'cover_image_path' => '/uploads/placeholder-1.svg',
        'tags' => ['PHP', 'API'],
    ],
    [
        'slug' => 'headless-wordpress-storefront',
        'title' => 'Headless WordPress Storefront',
        'summary' => 'Decoupled WordPress backend powering a fast, custom-rendered storefront frontend.',
        'case_study_body' =>
            "The client's existing WordPress/WooCommerce storefront was functional but slow — Lighthouse scores in the 40s, a bloated page builder plugin stack, and a checkout flow that lost customers on mobile.\n\n" .
            "Rather than rebuild the whole business on a new platform (and lose years of SEO equity and editorial workflow the marketing team already knew), I decoupled the frontend from WordPress: WordPress stayed as the content/product source of truth via a small custom REST layer, while the actual storefront became a hand-built, static-first frontend with client-side hydration.\n\n" .
            "Key engineering decisions:\n" .
            "— Custom post types and fields mapped cleanly to a lightweight product API, so the marketing team's existing editorial workflow didn't change at all.\n" .
            "— Critical CSS inlined, everything else deferred; images served as WebP via CDN with explicit dimensions to eliminate layout shift.\n" .
            "— Checkout kept deliberately simple — no heavy cart-state framework, just vanilla JS talking to a couple of focused endpoints.\n\n" .
            "Result: Lighthouse performance score went from the low 40s to the high 90s, and mobile checkout completion rate improved measurably in the first month post-launch.",
        'category' => 'cms',
        'live_url' => null,
        'repo_url' => null,
        'cover_image_path' => '/uploads/placeholder-2.svg',
        'tags' => ['WordPress', 'React'],
    ],
    [
        'slug' => 'cross-platform-booking-app',
        'title' => 'Cross-Platform Booking App',
        'summary' => 'A native-feel mobile booking experience shared across iOS and Android from a single codebase.',
        'case_study_body' =>
            "A wellness studio needed a booking app that felt native on both iOS and Android but couldn't justify maintaining two separate native codebases with a small team.\n\n" .
            "I built a single React Native codebase with careful attention to platform conventions — iOS and Android navigation patterns, haptics, and system fonts — so it never feels like a compromise on either platform.\n\n" .
            "Key engineering decisions:\n" .
            "— Offline-first data layer: bookings made with a poor connection queue locally and sync automatically, so the app never feels broken in a spotty-signal studio basement.\n" .
            "— Push notifications and deep links for booking reminders and rebooking flows, wired to real calendar availability rather than a static schedule.\n" .
            "— A shared design system between the booking app and the studio's existing brand site, so the two never feel like different products.\n\n" .
            "Result: shipped to both app stores from one codebase in a fraction of the time a dual-native build would have taken, with booking completion rates on mobile matching desktop web for the first time.",
        'category' => 'mobile',
        'live_url' => null,
        'repo_url' => null,
        'cover_image_path' => '/uploads/placeholder-3.svg',
        'tags' => ['Mobile', 'React'],
    ],
];

foreach ($projects as $index => $project) {
    $stmt = $pdo->prepare('SELECT id FROM projects WHERE slug = ?');
    $stmt->execute([$project['slug']]);
    $existingProject = $stmt->fetch();

    if ($existingProject) {
        $stmt = $pdo->prepare(
            "UPDATE projects SET title=?, summary=?, case_study_body=?, category=?, live_url=?, repo_url=?,
             cover_image_path=?, sort_order=?, updated_at=datetime('now') WHERE id=?"
        );
        $stmt->execute([
            $project['title'],
            $project['summary'],
            $project['case_study_body'],
            $project['category'],
            $project['live_url'],
            $project['repo_url'],
            $project['cover_image_path'],
            $index,
            $existingProject['id'],
        ]);
        $projectId = (int) $existingProject['id'];
    } else {
        $stmt = $pdo->prepare(
            'INSERT INTO projects (slug, title, summary, case_study_body, category, live_url, repo_url, cover_image_path, is_published, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)'
        );
        $stmt->execute([
            $project['slug'],
            $project['title'],
            $project['summary'],
            $project['case_study_body'],
            $project['category'],
            $project['live_url'],
            $project['repo_url'],
            $project['cover_image_path'],
            $index,
        ]);
        $projectId = (int) $pdo->lastInsertId();
    }

    $pdo->prepare('DELETE FROM project_tags WHERE project_id = ?')->execute([$projectId]);
    foreach ($project['tags'] as $tagName) {
        $stmt = $pdo->prepare('INSERT INTO project_tags (project_id, tag_id) VALUES (?, ?)');
        $stmt->execute([$projectId, $tagIds[$tagName]]);
    }
}

echo "Seed data ready.\n";
