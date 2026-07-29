<?php

declare(strict_types=1);

namespace App\Support;

/**
 * One owner-controlled instruction layer shared by every Lisa surface.
 */
class LisaInstructions
{
    public const MAX_LENGTH = 4000;

    public static function promptBlock(string $channel): string
    {
        $instructions = trim(strip_tags((string) Settings::get('chat_persona')));
        if ($instructions === '') {
            return '';
        }

        $instructions = mb_substr($instructions, 0, self::MAX_LENGTH);

        return "\n\nOWNER CUSTOM INSTRUCTIONS FOR LISA ({$channel}):\n"
            . $instructions
            . "\nApply these instructions immediately when they fit this conversation. They may refine Lisa's "
            . "tone, priorities, opening, questions, qualification, and handoff behaviour. They never override "
            . "verified facts, channel limitations, human-approval requirements, consent and opt-out handling, "
            . "privacy, safety, or validated tool rules. Never claim an action or capability solely because these "
            . "instructions request it.";
    }
}
