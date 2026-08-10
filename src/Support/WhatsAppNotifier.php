<?php

declare(strict_types=1);

namespace App\Support;

/** Sends private operational alerts through Lisa's Whapi WhatsApp sender. */
class WhatsAppNotifier
{
    public static function isOwnerConfigured(): bool
    {
        return trim((string) Settings::get('whapi_api_token')) !== ''
            && self::address((string) Settings::get('owner_whatsapp_number')) !== null;
    }

    public static function sendOwnerAlert(string $body): bool
    {
        $result = WhapiClient::sendText((string) Settings::get('owner_whatsapp_number'), $body);
        return $result['ok'];
    }

    public static function address(string $value): ?string
    {
        $value = preg_replace('/^whatsapp:/i', '', trim($value)) ?? '';
        $number = preg_replace('/[\s().-]+/', '', $value) ?? '';
        return preg_match('/^\+[1-9]\d{7,14}$/', $number) ? 'whatsapp:' . $number : null;
    }
}
