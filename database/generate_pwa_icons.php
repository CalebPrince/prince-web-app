<?php

declare(strict_types=1);

// Generates the PWA app icons (192/512/32px) as hand-encoded PNGs — no GD or
// Imagick required (neither is available on this dev machine, and we'd
// rather not add a build dependency for three small icons). Draws a flat
// brand-purple square with a blocky white "P" monogram, comfortably inside
// the maskable-icon safe zone (icon content within the center ~80%).

function makePng(int $size, string $bgHex, string $fgHex): string
{
    [$bgR, $bgG, $bgB] = sscanf($bgHex, '#%02x%02x%02x');
    [$fgR, $fgG, $fgB] = sscanf($fgHex, '#%02x%02x%02x');

    // "P" monogram defined on a 100x100 design grid, scaled to $size.
    $scale = fn (float $v) => (int) round($v / 100 * $size);
    $stem = ['x1' => $scale(32), 'x2' => $scale(44), 'y1' => $scale(22), 'y2' => $scale(78)];
    $loopTop = ['x1' => $scale(32), 'x2' => $scale(68), 'y1' => $scale(22), 'y2' => $scale(34)];
    $loopRight = ['x1' => $scale(56), 'x2' => $scale(68), 'y1' => $scale(22), 'y2' => $scale(56)];
    $loopBottom = ['x1' => $scale(32), 'x2' => $scale(68), 'y1' => $scale(44), 'y2' => $scale(56)];

    $inRect = function (int $x, int $y, array $r): bool {
        return $x >= $r['x1'] && $x < $r['x2'] && $y >= $r['y1'] && $y < $r['y2'];
    };

    $raw = '';
    for ($y = 0; $y < $size; $y++) {
        $raw .= "\x00"; // filter type: none
        for ($x = 0; $x < $size; $x++) {
            $isForeground = $inRect($x, $y, $stem) || $inRect($x, $y, $loopTop)
                || $inRect($x, $y, $loopRight) || $inRect($x, $y, $loopBottom);
            if ($isForeground) {
                $raw .= chr($fgR) . chr($fgG) . chr($fgB);
            } else {
                $raw .= chr($bgR) . chr($bgG) . chr($bgB);
            }
        }
    }

    $chunk = function (string $type, string $data): string {
        return pack('N', strlen($data)) . $type . $data . pack('N', crc32($type . $data));
    };

    $signature = "\x89PNG\r\n\x1a\n";
    $ihdr = $chunk('IHDR', pack('NNCCCCC', $size, $size, 8, 2, 0, 0, 0));
    $idat = $chunk('IDAT', gzcompress($raw, 9));
    $iend = $chunk('IEND', '');

    return $signature . $ihdr . $idat . $iend;
}

$outDir = dirname(__DIR__) . '/public/icons';
if (!is_dir($outDir)) {
    mkdir($outDir, 0755, true);
}

$accent = '#4f46e5';
$white = '#ffffff';

foreach ([32, 192, 512] as $size) {
    file_put_contents("{$outDir}/icon-{$size}.png", makePng($size, $accent, $white));
}

echo "Wrote icon-32.png, icon-192.png, icon-512.png to public/icons/\n";
