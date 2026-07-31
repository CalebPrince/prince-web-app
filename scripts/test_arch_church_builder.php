<?php

declare(strict_types=1);

require dirname(__DIR__) . '/src/autoload.php';

use App\Agents\ArchSiteBuilder;

$dir = sys_get_temp_dir() . '/arch-church-builder-' . bin2hex(random_bytes(4));
mkdir($dir, 0755, true);

$brief = [
    'business_name' => "God's Grace Assembly UK",
    'business_type' => 'church',
    'audience' => 'congregation',
    'primary_goal' => 'watch live services and archived sermons',
    'personality' => 'calm and trustworthy',
    'style' => 'modern',
    'theme' => 'light',
    'primary_color' => 'navy blue',
    'pages' => ['Home', 'About', 'Sermons', 'Hook Up', 'Contact'],
    'features' => ['contact form', 'WhatsApp button'],
    'email' => 'private-client@example.com',
];
$content = [
    'seo_title' => "God's Grace Assembly UK",
    'seo_description' => 'Live worship and sermons.',
    'seo_keywords' => 'church, worship, sermons',
    'hero_title' => 'Faith wherever you are',
    'hero_subtitle' => 'Join worship live or revisit a message.',
    'hero_cta' => 'Watch live',
    'about_heading' => 'A church family',
    'about_body' => 'Welcome to our congregation.',
    'services' => [],
    'cta_heading' => 'Connect with us',
    'footer_tagline' => 'Faith and community',
];

try {
    ArchSiteBuilder::writeStaticSite($dir, 'church-test', $brief, $content);
    $html = (string) file_get_contents($dir . '/index.html');
    $expectations = [
        'church design profile' => 'niche-church',
        'navy palette' => '--brand:#0b1f4d',
        'livestream section' => 'id="live"',
        'sermon archive' => 'id="sermons"',
        'self-contained visual mockup' => 'class="site-mockup"',
        'live navigation' => 'href="#live"',
        'sermon navigation' => 'href="#sermons"',
    ];
    foreach ($expectations as $label => $needle) {
        if (!str_contains($html, $needle)) {
            throw new RuntimeException("Missing {$label}: {$needle}");
        }
    }
    if (str_contains($html, 'private-client@example.com')) {
        throw new RuntimeException('The private project email was exposed in public HTML.');
    }
    echo "Arch church builder regression passed.\n";
} finally {
    foreach (['index.html', 'contact.php', '.htaccess'] as $file) {
        if (is_file($dir . '/' . $file)) {
            unlink($dir . '/' . $file);
        }
    }
    if (is_dir($dir)) {
        rmdir($dir);
    }
}
