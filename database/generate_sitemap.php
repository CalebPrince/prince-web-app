<?php

declare(strict_types=1);

// Regenerates public/sitemap.xml from the static pages plus every published
// project. Re-run this any time projects are added, removed, or unpublished
// so the sitemap stays accurate — it is not generated automatically.

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
    ['loc' => '/blog.html', 'priority' => '0.8', 'changefreq' => 'weekly'],
    ['loc' => '/pricing.html', 'priority' => '0.7', 'changefreq' => 'monthly'],
    ['loc' => '/request.html', 'priority' => '0.6', 'changefreq' => 'monthly'],
    ['loc' => '/contact.html', 'priority' => '0.5', 'changefreq' => 'yearly'],
    ['loc' => '/privacy.html', 'priority' => '0.2', 'changefreq' => 'yearly'],
    ['loc' => '/cookies.html', 'priority' => '0.2', 'changefreq' => 'yearly'],
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
    "SELECT slug, updated_at FROM blog_posts WHERE is_published = 1 ORDER BY sort_order ASC"
)->fetchAll();

foreach ($posts as $post) {
    $xml->startElement('url');
    $xml->writeElement('loc', BASE_URL . '/blog-post.html?slug=' . urlencode($post['slug']));
    $xml->writeElement('lastmod', substr($post['updated_at'], 0, 10));
    $xml->writeElement('changefreq', 'monthly');
    $xml->writeElement('priority', '0.6');
    $xml->endElement();
}

$xml->endElement();
$xml->endDocument();

file_put_contents(dirname(__DIR__) . '/public/sitemap.xml', $xml->outputMemory());

echo "Wrote public/sitemap.xml with " . (count($staticPages) + count($projects) + count($posts)) . " URLs.\n";
