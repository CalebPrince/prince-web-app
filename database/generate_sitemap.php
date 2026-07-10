<?php

declare(strict_types=1);

// Regenerates public/sitemap.xml from the static pages plus every published
// project, and public/feed.xml (RSS 2.0) from the published blog posts.
// Re-run this any time projects or posts are added, removed, or unpublished
// so both stay accurate — they are not generated automatically.

require dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;

const BASE_URL = 'https://princecaleb.dev';

$pdo = Database::get();
$today = date('Y-m-d');

$staticPages = [
    ['loc' => '/', 'priority' => '1.0', 'changefreq' => 'weekly'],
    ['loc' => '/about.html', 'priority' => '0.6', 'changefreq' => 'monthly'],
    ['loc' => '/services.html', 'priority' => '0.6', 'changefreq' => 'monthly'],
    ['loc' => '/projects.html', 'priority' => '0.8', 'changefreq' => 'weekly'],
    ['loc' => '/archive.html', 'priority' => '0.8', 'changefreq' => 'weekly'],
    ['loc' => '/pricing.html', 'priority' => '0.7', 'changefreq' => 'monthly'],
    ['loc' => '/request.html', 'priority' => '0.6', 'changefreq' => 'monthly'],
    ['loc' => '/book.html', 'priority' => '0.6', 'changefreq' => 'monthly'],
    ['loc' => '/testimonials.html', 'priority' => '0.6', 'changefreq' => 'monthly'],
    ['loc' => '/contact.html', 'priority' => '0.5', 'changefreq' => 'yearly'],
    ['loc' => '/privacy.html', 'priority' => '0.2', 'changefreq' => 'yearly'],
    ['loc' => '/cookies.html', 'priority' => '0.2', 'changefreq' => 'yearly'],
    ['loc' => '/terms.html', 'priority' => '0.2', 'changefreq' => 'yearly'],
];

$projects = $pdo->query(
    "SELECT slug, updated_at FROM projects WHERE is_published = 1 ORDER BY sort_order ASC"
)->fetchAll();

$xml = new XMLWriter();
$xml->openMemory();
$xml->setIndent(true);
$xml->startDocument('1.0', 'UTF-8');
$xml->startElement('urlset');
$xml->writeAttribute('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9');

foreach ($staticPages as $page) {
    $xml->startElement('url');
    $xml->writeElement('loc', BASE_URL . $page['loc']);
    $xml->writeElement('lastmod', $today);
    $xml->writeElement('changefreq', $page['changefreq']);
    $xml->writeElement('priority', $page['priority']);
    $xml->endElement();
}

foreach ($projects as $project) {
    $xml->startElement('url');
    $xml->writeElement('loc', BASE_URL . '/project.html?slug=' . urlencode($project['slug']));
    $xml->writeElement('lastmod', substr($project['updated_at'], 0, 10));
    $xml->writeElement('changefreq', 'monthly');
    $xml->writeElement('priority', '0.7');
    $xml->endElement();
}

$posts = $pdo->query(
    "SELECT slug, title, excerpt, category, created_at, updated_at
     FROM blog_posts WHERE is_published = 1 ORDER BY sort_order ASC"
)->fetchAll();

foreach ($posts as $post) {
    $xml->startElement('url');
    $xml->writeElement('loc', BASE_URL . '/archive-post.html?slug=' . urlencode($post['slug']));
    $xml->writeElement('lastmod', substr($post['updated_at'], 0, 10));
    $xml->writeElement('changefreq', 'monthly');
    $xml->writeElement('priority', '0.6');
    $xml->endElement();
}

$xml->endElement();
$xml->endDocument();

file_put_contents(dirname(__DIR__) . '/public/sitemap.xml', $xml->outputMemory());

echo "Wrote public/sitemap.xml with " . (count($staticPages) + count($projects) + count($posts)) . " URLs.\n";

// --- RSS feed (newest 20 posts, by publish date) ---

$feedPosts = $posts;
usort($feedPosts, fn(array $a, array $b) => strcmp($b['created_at'], $a['created_at']));
$feedPosts = array_slice($feedPosts, 0, 20);

$rss = new XMLWriter();
$rss->openMemory();
$rss->setIndent(true);
$rss->startDocument('1.0', 'UTF-8');
$rss->startElement('rss');
$rss->writeAttribute('version', '2.0');
$rss->writeAttribute('xmlns:atom', 'http://www.w3.org/2005/Atom');
$rss->startElement('channel');
$rss->writeElement('title', 'Prince Caleb — Technical Archive');
$rss->writeElement('link', BASE_URL . '/archive.html');
$rss->writeElement('description', 'Articles on web development, freelancing, and building software in Ghana.');
$rss->writeElement('language', 'en');
$rss->writeElement('lastBuildDate', date(DATE_RSS));
$rss->startElement('atom:link');
$rss->writeAttribute('href', BASE_URL . '/feed.xml');
$rss->writeAttribute('rel', 'self');
$rss->writeAttribute('type', 'application/rss+xml');
$rss->endElement();

foreach ($feedPosts as $post) {
    $url = BASE_URL . '/archive-post.html?slug=' . urlencode($post['slug']);
    $rss->startElement('item');
    $rss->writeElement('title', $post['title']);
    $rss->writeElement('link', $url);
    $rss->writeElement('guid', $url);
    $rss->writeElement('description', $post['excerpt']);
    if (!empty($post['category'])) {
        $rss->writeElement('category', $post['category']);
    }
    $rss->writeElement('pubDate', date(DATE_RSS, strtotime($post['created_at'] . ' UTC')));
    $rss->endElement();
}

$rss->endElement();
$rss->endElement();
$rss->endDocument();

file_put_contents(dirname(__DIR__) . '/public/feed.xml', $rss->outputMemory());

echo 'Wrote public/feed.xml with ' . count($feedPosts) . " posts.\n";
