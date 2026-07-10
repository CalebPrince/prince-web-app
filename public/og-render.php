<?php

declare(strict_types=1);

/**
 * Server-side Open Graph / Twitter meta injector for the two dynamic content
 * pages (project.html, archive-post.html). Social crawlers don't run the
 * client-side JS that swaps these tags, so a shared blog-post or project link
 * would otherwise always preview with the default site image. Apache rewrites
 * those .html requests here (see .htaccess); this reads the real static HTML
 * template, rewrites the head meta for the requested slug, and outputs it.
 *
 * Deliberately fail-open: if anything goes wrong (bad slug, missing row, DB
 * error), the original template is served unchanged — the page's own JS then
 * hydrates it exactly as before. This handler only ever improves the crawler
 * preview; it can never break the page.
 */

$page = $_GET['_page'] ?? '';
$templateFile = match ($page) {
    'project' => __DIR__ . '/project.html',
    'archive' => __DIR__ . '/archive-post.html',
    default => null,
};

// Unknown page or missing template: nothing we can safely do.
if ($templateFile === null || !is_file($templateFile)) {
    http_response_code(404);
    exit;
}

$html = file_get_contents($templateFile);
$slug = (string) ($_GET['slug'] ?? '');

header('Content-Type: text/html; charset=UTF-8');

// No slug → generic page (e.g. project.html with no query). Serve as-is.
if ($slug === '' || !preg_match('/^[a-z0-9\-]+$/', $slug)) {
    echo $html;
    return;
}

/** Absolute base URL — canonical https host in production, request host otherwise. */
function ogBaseUrl(): string
{
    $host = $_SERVER['HTTP_HOST'] ?? 'princecaleb.dev';
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'
        || $host === 'princecaleb.dev' || str_ends_with($host, '.princecaleb.dev');
    return ($https ? 'https' : 'http') . '://' . $host;
}

function setMetaById(string $html, string $id, string $value): string
{
    $value = htmlspecialchars($value, ENT_QUOTES);
    return preg_replace_callback(
        '/(<meta\b[^>]*\bid="' . preg_quote($id, '/') . '"[^>]*\bcontent=")[^"]*(")/i',
        fn($m) => $m[1] . $value . $m[2],
        $html,
        1
    ) ?? $html;
}

function setMetaByProperty(string $html, string $property, string $value): string
{
    $value = htmlspecialchars($value, ENT_QUOTES);
    return preg_replace_callback(
        '/(<meta\b[^>]*\bproperty="' . preg_quote($property, '/') . '"[^>]*\bcontent=")[^"]*(")/i',
        fn($m) => $m[1] . $value . $m[2],
        $html,
        1
    ) ?? $html;
}

function setTitleById(string $html, string $id, string $value): string
{
    $value = htmlspecialchars($value, ENT_QUOTES);
    return preg_replace_callback(
        '/(<title\b[^>]*\bid="' . preg_quote($id, '/') . '"[^>]*>).*?(<\/title>)/is',
        fn($m) => $m[1] . $value . $m[2],
        $html,
        1
    ) ?? $html;
}

function setLinkHrefById(string $html, string $id, string $value): string
{
    $value = htmlspecialchars($value, ENT_QUOTES);
    return preg_replace_callback(
        '/(<link\b[^>]*\bid="' . preg_quote($id, '/') . '"[^>]*\bhref=")[^"]*(")/i',
        fn($m) => $m[1] . $value . $m[2],
        $html,
        1
    ) ?? $html;
}

try {
    require dirname(__DIR__) . '/src/autoload.php';
    $pdo = App\Support\Database::get();
    $base = ogBaseUrl();
    $defaultImage = $base . '/uploads/og-image.png';

    if ($page === 'archive') {
        $stmt = $pdo->prepare(
            'SELECT slug, title, excerpt, category, created_at, updated_at
             FROM blog_posts WHERE slug = ? AND is_published = 1'
        );
        $stmt->execute([$slug]);
        $post = $stmt->fetch();
        if (!$post) {
            echo $html; // unknown/unpublished slug — let the page's own 404 handling run
            return;
        }

        $title = $post['title'];
        $desc = $post['excerpt'];
        $url = $base . '/archive-post.html?slug=' . rawurlencode($slug);

        // Per-post PNG card (generate_blog_og_images.py); default if absent.
        $cardPath = '/uploads/og/blog/' . $slug . '.png';
        $image = is_file(__DIR__ . $cardPath) ? $base . $cardPath : $defaultImage;

        $html = setTitleById($html, 'page-title', $title . ' — Prince Caleb');
        $html = setMetaById($html, 'page-description', $desc);
        $html = setLinkHrefById($html, 'page-canonical', $url);
        $html = setMetaById($html, 'og-title', $title);
        $html = setMetaById($html, 'og-description', $desc);
        $html = setMetaById($html, 'og-url', $url);
        $html = setMetaById($html, 'og-image', $image);
        $html = setMetaById($html, 'twitter-title', $title);
        $html = setMetaById($html, 'twitter-description', $desc);
        $html = setMetaById($html, 'twitter-image', $image);
        $html = setMetaById($html, 'article-published', $post['created_at']);
        $html = setMetaById($html, 'article-modified', $post['updated_at']);
        $html = setMetaById($html, 'article-section', (string) $post['category']);
        // Card is a fixed 1200x630 PNG, so the template's dimensions stay correct.
        echo $html;
        return;
    }

    // page === 'project'
    $stmt = $pdo->prepare(
        'SELECT slug, title, summary, cover_image_path, updated_at
         FROM projects WHERE slug = ? AND is_published = 1'
    );
    $stmt->execute([$slug]);
    $project = $stmt->fetch();
    if (!$project) {
        echo $html;
        return;
    }

    $title = $project['title'];
    $desc = $project['summary'];
    $url = $base . '/project.html?slug=' . rawurlencode($slug);

    // Use the project's own cover only if it's a raster image a crawler can
    // render (not an SVG placeholder). Set the real dimensions so platforms
    // don't crop against the template's default 1200x630.
    $image = $defaultImage;
    $cover = (string) ($project['cover_image_path'] ?? '');
    $ext = strtolower(pathinfo($cover, PATHINFO_EXTENSION));
    if (in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif'], true)
        && str_starts_with($cover, '/')
        && is_file(__DIR__ . $cover)) {
        $image = $base . $cover;
        $dims = @getimagesize(__DIR__ . $cover);
        if ($dims) {
            $html = setMetaByProperty($html, 'og:image:width', (string) $dims[0]);
            $html = setMetaByProperty($html, 'og:image:height', (string) $dims[1]);
        }
    }

    $html = setTitleById($html, 'page-title', $title . ' — Prince Caleb');
    $html = setMetaById($html, 'page-description', $desc);
    $html = setLinkHrefById($html, 'page-canonical', $url);
    $html = setMetaById($html, 'og-title', $title);
    $html = setMetaById($html, 'og-description', $desc);
    $html = setMetaById($html, 'og-url', $url);
    $html = setMetaById($html, 'og-image', $image);
    $html = setMetaById($html, 'twitter-title', $title);
    $html = setMetaById($html, 'twitter-description', $desc);
    $html = setMetaById($html, 'twitter-image', $image);
    echo $html;
} catch (\Throwable $e) {
    // Fail open: serve the untouched template so the page still works.
    error_log('og-render failed: ' . $e->getMessage());
    echo $html;
}
