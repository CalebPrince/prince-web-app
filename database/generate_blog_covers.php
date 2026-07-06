<?php

declare(strict_types=1);

// Generates one unique SVG cover illustration per blog post into
// public/uploads/blog-covers/{slug}.svg. Layout is chosen by category,
// color/label by industry, so every post gets a distinct file. Re-run
// this after editing database/blog_posts_data.php to regenerate covers.

require __DIR__ . '/blog_posts_data.php';

$outDir = dirname(__DIR__) . '/public/uploads/blog-covers';
if (!is_dir($outDir)) {
    mkdir($outDir, 0755, true);
}

function shapeAutomation(string $accent, string $accentDark): string
{
    return <<<SVG
<circle cx="150" cy="130" r="60" fill="none" stroke="{$accent}" stroke-width="14" opacity="0.18"/>
<circle cx="150" cy="130" r="60" fill="none" stroke="{$accent}" stroke-width="14" stroke-dasharray="18 14" opacity="0.35"/>
<circle cx="470" cy="290" r="42" fill="none" stroke="{$accentDark}" stroke-width="10" opacity="0.22"/>
<path d="M 210 150 L 330 150" stroke="{$accentDark}" stroke-width="4" stroke-dasharray="6 8" opacity="0.5"/>
<path d="M 330 150 L 320 142 M 330 150 L 320 158" stroke="{$accentDark}" stroke-width="4" opacity="0.5" fill="none"/>
<path d="M 380 190 L 420 250" stroke="{$accentDark}" stroke-width="4" stroke-dasharray="6 8" opacity="0.5"/>
<rect x="340" y="160" width="70" height="46" rx="8" fill="{$accent}" opacity="0.9"/>
<rect x="185" y="105" width="70" height="46" rx="8" fill="white" stroke="{$accentDark}" stroke-width="3" opacity="0.95"/>
SVG;
}

function shapeDashboard(string $accent, string $accentDark): string
{
    return <<<SVG
<rect x="140" y="230" width="34" height="90" rx="4" fill="{$accent}" opacity="0.85"/>
<rect x="188" y="180" width="34" height="140" rx="4" fill="{$accentDark}" opacity="0.9"/>
<rect x="236" y="140" width="34" height="180" rx="4" fill="{$accent}" opacity="0.7"/>
<rect x="284" y="200" width="34" height="120" rx="4" fill="{$accentDark}" opacity="0.6"/>
<path d="M 140 130 L 200 100 L 250 120 L 320 70" stroke="{$accentDark}" stroke-width="5" fill="none" opacity="0.55"/>
<circle cx="320" cy="70" r="7" fill="{$accentDark}" opacity="0.8"/>
<circle cx="420" cy="150" r="55" fill="none" stroke="{$accent}" stroke-width="12" opacity="0.2"/>
SVG;
}

function shapeCms(string $accent, string $accentDark): string
{
    return <<<SVG
<rect x="130" y="90" width="340" height="220" rx="14" fill="white" stroke="{$accentDark}" stroke-width="4" opacity="0.95"/>
<rect x="130" y="90" width="340" height="34" rx="14" fill="{$accent}" opacity="0.85"/>
<circle cx="150" cy="107" r="5" fill="white"/>
<circle cx="168" cy="107" r="5" fill="white"/>
<circle cx="186" cy="107" r="5" fill="white"/>
<rect x="152" y="150" width="130" height="14" rx="4" fill="{$accent}" opacity="0.7"/>
<rect x="152" y="176" width="220" height="10" rx="4" fill="{$accentDark}" opacity="0.3"/>
<rect x="152" y="196" width="180" height="10" rx="4" fill="{$accentDark}" opacity="0.3"/>
<rect x="152" y="224" width="90" height="60" rx="8" fill="{$accentDark}" opacity="0.18"/>
<rect x="256" y="224" width="90" height="60" rx="8" fill="{$accent}" opacity="0.25"/>
<rect x="360" y="224" width="90" height="60" rx="8" fill="{$accentDark}" opacity="0.18"/>
SVG;
}

function shapeMobile(string $accent, string $accentDark): string
{
    return <<<SVG
<rect x="230" y="60" width="150" height="290" rx="26" fill="white" stroke="{$accentDark}" stroke-width="5" opacity="0.95"/>
<rect x="246" y="90" width="118" height="196" rx="6" fill="{$accent}" opacity="0.15"/>
<rect x="256" y="104" width="98" height="14" rx="4" fill="{$accent}" opacity="0.8"/>
<rect x="256" y="130" width="70" height="10" rx="4" fill="{$accentDark}" opacity="0.4"/>
<rect x="256" y="160" width="98" height="40" rx="8" fill="{$accentDark}" opacity="0.25"/>
<rect x="256" y="210" width="98" height="40" rx="8" fill="{$accent}" opacity="0.35"/>
<circle cx="305" cy="322" r="12" fill="none" stroke="{$accentDark}" stroke-width="3" opacity="0.6"/>
<circle cx="120" cy="300" r="46" fill="none" stroke="{$accent}" stroke-width="10" opacity="0.2"/>
<circle cx="470" cy="110" r="34" fill="none" stroke="{$accentDark}" stroke-width="8" opacity="0.2"/>
SVG;
}

function shapeAi(string $accent, string $accentDark): string
{
    return <<<SVG
<rect x="140" y="110" width="230" height="120" rx="24" fill="{$accent}" opacity="0.9"/>
<path d="M 210 230 L 190 268 L 250 230 Z" fill="{$accent}" opacity="0.9"/>
<circle cx="205" cy="168" r="9" fill="white"/>
<circle cx="255" cy="168" r="9" fill="white"/>
<circle cx="305" cy="168" r="9" fill="white"/>
<rect x="330" y="70" width="150" height="80" rx="18" fill="white" stroke="{$accentDark}" stroke-width="4" opacity="0.95"/>
<path d="M 400 150 L 385 178 L 430 150 Z" fill="white" stroke="{$accentDark}" stroke-width="4"/>
<rect x="352" y="96" width="106" height="9" rx="4" fill="{$accentDark}" opacity="0.4"/>
<rect x="352" y="114" width="70" height="9" rx="4" fill="{$accentDark}" opacity="0.4"/>
<circle cx="120" cy="300" r="40" fill="none" stroke="{$accentDark}" stroke-width="8" opacity="0.18"/>
SVG;
}

$shapeFns = [
    'automation' => 'shapeAutomation',
    'dashboards' => 'shapeDashboard',
    'cms' => 'shapeCms',
    'mobile' => 'shapeMobile',
    'ai' => 'shapeAi',
];

$count = 0;
foreach (BLOG_POSTS as $post) {
    $industry = INDUSTRY_META[$post['industry_key']];
    $accent = $industry['accent'];
    $accentDark = $industry['accent_dark'];
    $shapeFn = $shapeFns[$post['category_key']];
    $shape = $shapeFn($accent, $accentDark);
    $label = htmlspecialchars($industry['label'], ENT_QUOTES);
    $catLabel = htmlspecialchars(CATEGORY_META[$post['category_key']], ENT_QUOTES);
    $labelWidth = 34 + strlen($industry['label']) * 9;

    $svg = <<<SVG
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{$accent}" stop-opacity="0.10"/>
      <stop offset="1" stop-color="#ffffff"/>
    </linearGradient>
  </defs>
  <rect width="600" height="400" fill="url(#bg)"/>
  {$shape}
  <rect x="24" y="336" width="{$labelWidth}" height="34" rx="17" fill="{$accentDark}" opacity="0.92"/>
  <text x="41" y="358" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="white">{$label}</text>
  <text x="24" y="46" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="{$accentDark}" opacity="0.55" letter-spacing="1">{$catLabel}</text>
</svg>
SVG;

    file_put_contents("{$outDir}/{$post['slug']}.svg", $svg);
    $count++;
}

echo "Wrote {$count} cover images to public/uploads/blog-covers/\n";
