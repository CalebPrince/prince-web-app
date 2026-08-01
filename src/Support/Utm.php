<?php

declare(strict_types=1);

namespace App\Support;

final class Utm
{
    /**
     * Appends utm_source/utm_medium/utm_campaign to every princecaleb.dev
     * link found in $text, so a reader who clicks through and later
     * converts shows up in lead_attribution — the visitor's browser already
     * captures utm_* from the landing URL (see api.js's captureFirstTouch)
     * and sends it with contact/booking/chat/newsletter submissions; this is
     * the other half, tagging the links so there's something to capture.
     * Applied at send time only — never mutates the stored template/draft.
     * Leaves links that already carry utm_source alone, and leaves anything
     * that isn't a princecaleb.dev link (e.g. the unsubscribe endpoint,
     * external links) untouched.
     */
    public static function tagLinks(string $text, string $campaign, string $medium = 'email', string $source = 'automation'): string
    {
        $campaign = (string) preg_replace('/[^a-z0-9_\-]+/i', '_', $campaign);

        $tagged = preg_replace_callback(
            '#https://princecaleb\.dev/[^\s<>")]*#i',
            static function (array $m) use ($source, $medium, $campaign): string {
                $url = $m[0];
                if (str_contains($url, 'utm_source=')) {
                    return $url;
                }
                $separator = str_contains($url, '?') ? '&' : '?';
                return $url . $separator . 'utm_source=' . rawurlencode($source)
                    . '&utm_medium=' . rawurlencode($medium)
                    . '&utm_campaign=' . rawurlencode($campaign);
            },
            $text
        );

        return $tagged ?? $text;
    }
}
