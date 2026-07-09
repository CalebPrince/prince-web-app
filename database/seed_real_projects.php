<?php

declare(strict_types=1);

// Adds Prince's real, live projects to the portfolio. Safe to re-run: each
// project and tag is upserted by slug, same pattern as seed.php.

require dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;

$pdo = Database::get();

$projects = [
    [
        'slug' => 'video-watch',
        'title' => 'VideoWatch',
        'summary' => 'AI-powered video monitoring platform that scrapes and tracks videos across multiple sites.',
        'case_study_body' =>
            "VideoWatch started as a personal need to monitor video content across multiple platforms without manually checking each site. The challenge was building a scraper that could handle JavaScript-heavy sites, bypass bot detection, and scale without consuming too much server resources.\n\n" .
            "The solution uses Python FastAPI for the backend, Playwright for headless browser scraping, and yt-dlp for platform-native extraction (YouTube, VK Video). A scheduler runs automatic scans and an SSE-powered live feed shows real-time progress. The app is deployed on Oracle Cloud Always Free tier with GitHub webhook auto-deployment.\n\n" .
            "Key engineering challenges included optimizing CPU usage on a 1 OCPU server, fixing VK Video's duplicate title/thumbnail bug caused by DOM shadowing in the JS extraction, and building a robust deduplication system that handles URL token rotation without breaking links.",
        'category' => 'custom_solution',
        'live_url' => 'https://videowatch.duckdns.org',
        'repo_url' => null,
        'cover_image_path' => '/uploads/videowatch-real.jpg',
        'tags' => ['Python', 'FastAPI', 'Node.js', 'SQLite'],
    ],
    [
        'slug' => 'ledger-command',
        'title' => 'Ledger/Command',
        'summary' => 'AI-powered accounting command center for account officers and their clients with Smart Inbox, Gmail integration and AI suggestions.',
        'case_study_body' =>
            "Ledger/Command was built to solve a real problem for accounting firms — account officers juggling multiple clients across spreadsheets, emails, and WhatsApp. The goal was to centralize everything into one command center with strict data isolation between clients.\n\n" .
            "The architecture enforces role-based access control across three layers: the frontend (view masking), the backend (JWT-scoped SQLite queries), and the automation layer (actor-role whitelist). This means an account officer can never accidentally see another officer's clients — enforced at every layer, not just the UI.\n\n" .
            "AI integration uses Google Gemini for client report narration and reconciliation flagging, but nothing fires automatically — every suggestion waits for human approval. Gmail integration via Composio allows officers to send real emails directly from a client's record, with the full thread saved in-app.",
        'category' => 'custom_solution',
        'live_url' => 'https://ledger-command.duckdns.org',
        'repo_url' => null,
        'cover_image_path' => '/uploads/ledger-command-real.jpg',
        'tags' => ['Python', 'FastAPI', 'Node.js', 'SQLite', 'AI'],
    ],
    [
        'slug' => 'church-media-diagnostic-suite',
        'title' => 'Church Media Diagnostic Suite',
        'summary' => 'Real-time audio analysis tool for live worship and streaming teams.',
        'case_study_body' =>
            "The LCA Accra media team needed a way to monitor audio quality during live Sunday services and online streams without expensive hardware analyzers. The solution needed to work on any laptop in the sound booth with zero installation.\n\n" .
            "Built as a single HTML file using the Web Audio API, the app connects to OBS Studio via VB-Audio Virtual Cable and provides real-time frequency spectrum analysis, LUFS metering, peak detection, and noise floor monitoring. A device selector allows engineers to choose between multiple audio sources including virtual cables.\n\n" .
            "A key discovery during testing was that browsers block microphone access on HTTP — deploying on HTTPS via Let's Encrypt was essential for the Web Audio API to function. The app now runs at lcamedia.duckdns.org and is used by the church media team every Sunday.",
        'category' => 'custom_solution',
        'live_url' => 'https://lcamedia.duckdns.org/church-media/',
        'repo_url' => null,
        'cover_image_path' => '/uploads/church-media-real.jpg',
        'tags' => ['JavaScript', 'Web Audio API', 'HTML5'],
        'is_embeddable' => 1,
    ],
    [
        'slug' => 'church-shape-it',
        'title' => 'Church Shape It',
        'summary' => "10-band parametric EQ inspired by Soundly's Shape It plugin, built for church sound engineers.",
        'case_study_body' =>
            "After deploying the Church Media Diagnostic Suite, the team needed finer control over individual frequency bands during live worship. Inspired by Soundly's Shape It parametric EQ plugin, this tool brings professional 10-band parametric EQ to the browser.\n\n" .
            "Built with the Web Audio API's BiquadFilterNode, the app supports five filter types per band (Low Shelf, High Shelf, Peak, High Pass, Low Pass) with adjustable frequency, gain, and Q values. Church-specific presets were built in — Pastor Mic, Choir, Band Mix, Stream Optimized — allowing quick one-click adjustments during live service transitions.\n\n" .
            "The app connects to OBS via VB-Audio Virtual Cable, making it a zero-latency companion to the live stream workflow. It's deployed alongside the Church Media Diagnostic Suite as part of a growing suite of church audio tools.",
        'category' => 'custom_solution',
        'live_url' => 'https://lcamedia.duckdns.org/church-shapeit/',
        'repo_url' => null,
        'cover_image_path' => '/uploads/church-shapeit-real.jpg',
        'tags' => ['JavaScript', 'Web Audio API', 'HTML5'],
        'is_embeddable' => 1,
    ],
    [
        'slug' => 'lca-accra-church-website',
        'title' => 'LCA Accra Church Website',
        'summary' => 'Full church management platform with sermon library, youth module, member portal and Backblaze B2 media storage.',
        'case_study_body' =>
            "The LCA Accra church website required a complete digital platform to serve a congregation — not just a static site. The platform needed member registration, sermon archiving, a youth module, announcements, and an admin notification system, all within a shared hosting environment.\n\n" .
            "Built on PHP/MySQL with Bootstrap 5 and jQuery, the platform handles authentication with session management, password strength enforcement, honeypot spam protection, and force password change flows. The sermon library originally hosted media on cPanel but migrated ~1.59TB of audio/video to Backblaze B2 object storage with Cloudflare CDN for free egress, reducing hosting costs significantly.\n\n" .
            "The youth module includes a full gallery with mosaic grid layout, lightbox, bulk drag-and-drop uploads, video management, and events. An admin notification bell tracks pending approvals and new registrations in real time.",
        'category' => 'cms',
        'live_url' => 'https://lca-accra.com',
        'repo_url' => null,
        'cover_image_path' => '/uploads/lca-accra-real.jpg',
        'tags' => ['PHP', 'MySQL', 'Bootstrap 5', 'jQuery'],
    ],
    [
        'slug' => 'simply-my-care',
        'title' => 'Simply My Care',
        'summary' => 'Custom PHP website and staff/client portal for a UK home care and supported living provider, replacing a previous WordPress site.',
        'case_study_body' =>
            "Simply My Care needed a website that did more than describe services — it needed to actually run the day-to-day operations of a home care and supported living provider: staff scheduling, client care plans, and secure communication between carers, clients, and admin. The previous WordPress site couldn't support any of that without a maze of plugins, so it was rebuilt from scratch in native PHP.\n\n" .
            "The platform is deliberately framework-free — a good fit for a small, focused application where a full framework's overhead wasn't worth it. Every database query runs through a single Database:: PDO wrapper, authentication and role checks live in one Auth:: class, and every POST form is CSRF-protected. Staff and clients each get a role-scoped portal: staff see their weekly rota, assigned clients, and log completed visits; clients see their upcoming visits, care plan, and care team, with internal messaging connecting everyone without exposing anyone else's records.\n\n" .
            "Email — enquiries, password resets, notifications — runs through PHPMailer over SMTP rather than PHP's unreliable built-in mail() function. The site deploys to IONOS shared hosting via FTP, with a gitignored config.local.php keeping real database credentials out of version control.",
        'category' => 'custom_solution',
        'live_url' => 'https://simplymycare.co.uk',
        'repo_url' => 'https://github.com/CalebPrince/simplymycare',
        'cover_image_path' => '/uploads/simplymycare-real.jpg',
        'tags' => ['PHP', 'MySQL', 'Bootstrap 5', 'PHPMailer'],
    ],
    [
        'slug' => 'benas-hub',
        'title' => 'Benas Hub',
        'summary' => 'E-commerce platform for a distributor of organic household and health products in Tema, Ghana, with Paystack checkout and a full admin dashboard.',
        'case_study_body' =>
            "Benas Hub distributes organic household and health products across Ghana and ships select items abroad. The business needed a proper online storefront — a browsable product catalog with category filtering and search, customer accounts with order history, and a checkout that takes real payments — instead of coordinating every order manually.\n\n" .
            "The platform is built on Python Flask with SQLite, with a vanilla JavaScript and Bootstrap frontend. The shopping cart persists client-side in localStorage so browsing stays fast and stateless, and the checkout flow collects shipping details before handing payment off to Paystack. A comprehensive admin dashboard manages products, categories, orders, customers, shipping rates, and site settings.\n\n" .
            "Payment keys are stored in the database rather than source control, keeping credentials out of the repository. The storefront ships with the full set of legal pages (privacy policy, terms of use, cookie policy, shipping and returns) and a responsive design with mobile hamburger navigation.",
        'category' => 'custom_solution',
        'live_url' => null,
        'repo_url' => 'https://github.com/CalebPrince/benashub',
        'cover_image_path' => '/uploads/benas-hub.jpeg',
        'tags' => ['Python', 'Flask', 'JavaScript', 'Bootstrap 5', 'SQLite', 'Paystack'],
    ],
];

function upsertTag(\PDO $pdo, string $name): int
{
    $slug = strtolower(preg_replace('/[^a-z0-9]+/', '-', strtolower($name)));
    $slug = trim($slug, '-');

    $stmt = $pdo->prepare('SELECT id FROM tags WHERE slug = ?');
    $stmt->execute([$slug]);
    $row = $stmt->fetch();
    if ($row) {
        return (int) $row['id'];
    }

    $pdo->prepare('INSERT INTO tags (name, slug) VALUES (?, ?)')->execute([$name, $slug]);
    return (int) $pdo->lastInsertId();
}

$nextSortOrder = (int) $pdo->query('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM projects')->fetchColumn();

foreach ($projects as $project) {
    $stmt = $pdo->prepare('SELECT id FROM projects WHERE slug = ?');
    $stmt->execute([$project['slug']]);
    $existing = $stmt->fetch();

    if ($existing) {
        $stmt = $pdo->prepare(
            "UPDATE projects SET title=?, summary=?, case_study_body=?, category=?, live_url=?, repo_url=?,
             cover_image_path=?, is_embeddable=?, is_published=1, updated_at=datetime('now') WHERE id=?"
        );
        $stmt->execute([
            $project['title'],
            $project['summary'],
            $project['case_study_body'],
            $project['category'],
            $project['live_url'],
            $project['repo_url'],
            $project['cover_image_path'],
            $project['is_embeddable'] ?? 0,
            $existing['id'],
        ]);
        $projectId = (int) $existing['id'];
        echo "Updated: {$project['title']}\n";
    } else {
        $stmt = $pdo->prepare(
            'INSERT INTO projects (slug, title, summary, case_study_body, category, live_url, repo_url, cover_image_path, is_embeddable, is_published, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)'
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
            $project['is_embeddable'] ?? 0,
            $nextSortOrder++,
        ]);
        $projectId = (int) $pdo->lastInsertId();
        echo "Created: {$project['title']}\n";
    }

    $pdo->prepare('DELETE FROM project_tags WHERE project_id = ?')->execute([$projectId]);
    foreach ($project['tags'] as $tagName) {
        $tagId = upsertTag($pdo, $tagName);
        $pdo->prepare('INSERT OR IGNORE INTO project_tags (project_id, tag_id) VALUES (?, ?)')
            ->execute([$projectId, $tagId]);
    }
}

echo "Real projects seeded.\n";
