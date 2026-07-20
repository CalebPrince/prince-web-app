<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Records marketing/automation domain events (proposal accepted, content
 * published, testimonial approved, social post approved, stale lead, …) to the
 * integration_events table. That log is what GET /api/v1/integrations/events
 * serves, so any external consumer can pull events using the integration API
 * key — no outbound push and no third-party service required.
 */
class IntegrationEvent
{
    public static function log(string $event, array $data): void
    {
        Database::get()->prepare(
            'INSERT INTO integration_events (event, data, push_delivered) VALUES (?, ?, 0)'
        )->execute([$event, json_encode($data)]);
    }
}
