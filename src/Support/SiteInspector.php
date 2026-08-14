<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Fetches a page's HTML/headers and pattern-matches known platform/framework/
 * analytics fingerprints out of them. Extracted from DossierController (the
 * original, single caller) so GrowthAuditor can reuse the exact same
 * fingerprint table instead of maintaining a second copy of it.
 */
class SiteInspector
{
    /**
     * @return array{html:string,headers:array<string,string>,status:int,final_url:string,response_time_ms:int}|null
     */
    public static function fetch(string $url): ?array
    {
        if (!function_exists('curl_init')) {
            return null;
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HEADER => true,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; PrinceCalebSiteInspector/1.0; +https://princecaleb.dev)',
        ]);
        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $finalUrl = (string) curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
        $responseTimeMs = (int) round(((float) curl_getinfo($ch, CURLINFO_TOTAL_TIME)) * 1000);

        if ($response === false || $status === 0) {
            return null;
        }

        $rawHeaders = substr((string) $response, 0, $headerSize);
        $html = substr((string) $response, $headerSize);

        $headers = [];
        foreach (preg_split('/\r?\n/', $rawHeaders) ?: [] as $line) {
            if (str_contains($line, ':')) {
                [$name, $value] = explode(':', $line, 2);
                // Last write wins across redirects — the final hop's headers
                // are the ones that describe what actually served the page.
                $headers[strtolower(trim($name))] = trim($value);
            }
        }

        return [
            'html' => $html,
            'headers' => $headers,
            'status' => $status,
            'final_url' => $finalUrl !== '' ? $finalUrl : $url,
            'response_time_ms' => $responseTimeMs,
        ];
    }

    /**
     * Pattern-matches known platform/framework/analytics fingerprints out of
     * real page HTML and response headers. Each hit records the concrete
     * evidence it matched on, so the result is defensible ("we saw X"), never
     * a guess. A signal is reported at most once even if several of its
     * needles match.
     *
     * @param array<string,string> $headers Lower-cased response header map.
     * @return array<int,array{signal:string,category:string,evidence:string}>
     */
    public static function detectTechStack(string $html, array $headers): array
    {
        // needle => [signal, category, human evidence phrase]. Needles are
        // matched case-insensitively against the raw HTML.
        $htmlSignatures = [
            'wp-content'            => ['WordPress', 'CMS', 'wp-content asset paths in the page'],
            'wp-includes'          => ['WordPress', 'CMS', 'wp-includes asset paths in the page'],
            'cdn.shopify.com'      => ['Shopify', 'E-commerce', 'Shopify CDN assets'],
            'shopify.theme'        => ['Shopify', 'E-commerce', 'a Shopify theme object'],
            'static.wixstatic.com' => ['Wix', 'Website builder', 'Wix static assets'],
            'squarespace.com'      => ['Squarespace', 'Website builder', 'Squarespace assets'],
            'static1.squarespace'  => ['Squarespace', 'Website builder', 'Squarespace assets'],
            'data-wf-page'         => ['Webflow', 'Website builder', 'a Webflow page attribute'],
            '.webflow.io'          => ['Webflow', 'Website builder', 'a Webflow domain reference'],
            'cdn.weebly.com'       => ['Weebly', 'Website builder', 'Weebly CDN assets'],
            'drupal.settings'      => ['Drupal', 'CMS', 'Drupal settings script'],
            '/sites/default/files' => ['Drupal', 'CMS', 'Drupal file paths'],
            '/media/jui/'          => ['Joomla', 'CMS', 'Joomla media paths'],
            '__next_data__'        => ['Next.js', 'Framework', 'a Next.js data payload'],
            '/_next/static'        => ['Next.js', 'Framework', 'Next.js static assets'],
            'data-reactroot'       => ['React', 'Framework', 'a React root attribute'],
            'ng-version'           => ['Angular', 'Framework', 'an Angular version attribute'],
            'data-v-app'           => ['Vue.js', 'Framework', 'a Vue app mount point'],
            'jquery'               => ['jQuery', 'Library', 'a jQuery script reference'],
            'bootstrap'            => ['Bootstrap', 'Library', 'Bootstrap CSS/JS references'],
            'googletagmanager.com' => ['Google Tag Manager', 'Analytics', 'a Google Tag Manager container'],
            'google-analytics.com' => ['Google Analytics', 'Analytics', 'a Google Analytics tag'],
            'gtag('                => ['Google Analytics', 'Analytics', 'a gtag() analytics call'],
            'connect.facebook.net' => ['Meta Pixel', 'Analytics', 'a Meta/Facebook Pixel script'],
            'hotjar'               => ['Hotjar', 'Analytics', 'a Hotjar tracking script'],
            'hubspot'              => ['HubSpot', 'Marketing', 'a HubSpot script'],
            'mailchimp'            => ['Mailchimp', 'Marketing', 'a Mailchimp embed'],
            'elementor'            => ['Elementor', 'CMS', 'the Elementor page builder (WordPress)'],
            'wix.com'              => ['Wix', 'Website builder', 'a Wix reference'],
        ];

        // Meta generator is the most authoritative CMS signal when present,
        // so pull it out explicitly rather than relying on asset-path guesses.
        $found = [];
        $addSignal = static function (string $signal, string $category, string $evidence) use (&$found): void {
            if (!isset($found[$signal])) {
                $found[$signal] = ['signal' => $signal, 'category' => $category, 'evidence' => $evidence];
            }
        };

        if (preg_match('/<meta[^>]+name=["\']generator["\'][^>]+content=["\']([^"\']+)["\']/i', $html, $m)) {
            $addSignal('Generator: ' . trim($m[1]), 'CMS', 'the page\'s own <meta generator> tag');
        }

        $haystack = strtolower($html);
        foreach ($htmlSignatures as $needle => [$signal, $category, $evidence]) {
            if (str_contains($haystack, $needle)) {
                $addSignal($signal, $category, $evidence);
            }
        }

        // Response headers give away hosting/server tech the HTML doesn't.
        if (!empty($headers['x-powered-by'])) {
            $addSignal($headers['x-powered-by'], 'Server', 'the X-Powered-By response header');
        }
        if (!empty($headers['server'])) {
            $server = $headers['server'];
            if (stripos($server, 'cloudflare') !== false) {
                $addSignal('Cloudflare', 'Hosting/CDN', 'the Server response header');
            } elseif (preg_match('/^(nginx|apache|microsoft-iis|litespeed)/i', $server, $sm)) {
                $addSignal(ucfirst(strtolower($sm[1] === 'microsoft-iis' ? 'Microsoft IIS' : $sm[1])), 'Server', 'the Server response header');
            }
        }
        if (!empty($headers['x-generator'])) {
            $addSignal($headers['x-generator'], 'CMS', 'the X-Generator response header');
        }
        if (!empty($headers['x-shopify-stage']) || !empty($headers['x-shopid'])) {
            $addSignal('Shopify', 'E-commerce', 'a Shopify response header');
        }

        return array_values($found);
    }
}
