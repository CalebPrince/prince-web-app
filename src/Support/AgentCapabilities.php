<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Declares which external integrations are actually configured, so an
 * agent (or the admin looking at Settings -> Integrations) can know that
 * upfront instead of discovering it as a repeated runtime error. Every
 * capability here already degrades gracefully at its call site today
 * (Dossier's *_note fields, LeadDiscovery's early-return "Serper API key
 * is missing" status, MarketingLeadController's 503 when no AI provider is
 * configured) — this class doesn't change that behavior, it just gives
 * those same checks one shared, introspectable source of truth instead of
 * each controller re-deriving "is this configured" on its own.
 */
final class AgentCapabilities
{
    /** @return array<string,array{label:string,available:bool,used_by:string[]}> */
    public static function status(): array
    {
        $has = static fn(string $key): bool => trim((string) Settings::get($key)) !== '';
        $aiProvider = $has('gemini_api_key') || $has('openrouter_api_key') || $has('groq_api_key');

        return [
            'ai_provider' => [
                'label' => 'AI provider (Gemini / OpenRouter / Groq)',
                'available' => $aiProvider,
                'used_by' => ['Beacon', 'Dossier', 'Sage', 'Scout', 'Lisa', 'Chief', 'Marketing lead pitch drafting'],
            ],
            'serper' => [
                'label' => 'Serper (Google search / places)',
                'available' => $has('serper_api_key'),
                'used_by' => ['Lead Discovery', 'Beacon discovery', 'Dossier news search', 'Marketing lead search'],
            ],
            'hunter' => [
                'label' => 'Hunter.io (email enrichment)',
                'available' => $has('hunter_api_key'),
                'used_by' => ['Marketing lead email enrichment'],
            ],
            'elevenlabs' => [
                'label' => 'ElevenLabs (voice)',
                'available' => $has('elevenlabs_api_key') && Settings::get('elevenlabs_tts_enabled') === '1',
                'used_by' => ['Lisa voice', 'Scout voice'],
            ],
            'composio' => [
                'label' => 'Composio (calendar / email / Slack / LinkedIn actions)',
                'available' => $has('composio_api_key'),
                'used_by' => ['Booking automation', 'Social publishing'],
            ],
            'slack' => [
                'label' => 'Slack webhook',
                'available' => $has('slack_webhook_url'),
                'used_by' => ['Lead notifications'],
            ],
        ];
    }
}
