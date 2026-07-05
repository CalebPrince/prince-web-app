<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Runtime settings editable from the admin panel, stored in the settings
 * table. Falls back to the .env-backed appConfig() value when a key has not
 * been set via the admin UI, so existing .env deployments keep working.
 */
class Settings
{
    /** @var array<string, ?string> */
    private static array $cache = [];

    public static function get(string $name): ?string
    {
        if (array_key_exists($name, self::$cache)) {
            return self::$cache[$name];
        }

        $stmt = Database::get()->prepare('SELECT value FROM settings WHERE name = ?');
        $stmt->execute([$name]);
        $row = $stmt->fetch();
        $value = $row !== false && $row['value'] !== '' ? $row['value'] : null;

        if ($value === null) {
            require_once dirname(__DIR__, 2) . '/config/config.php';
            $value = appConfig()[$name] ?? null;
        }

        return self::$cache[$name] = $value;
    }

    public static function set(string $name, string $value): void
    {
        $pdo = Database::get();
        if ($value === '') {
            $pdo->prepare('DELETE FROM settings WHERE name = ?')->execute([$name]);
        } else {
            $pdo->prepare(
                'INSERT INTO settings (name, value) VALUES (?, ?)
                 ON CONFLICT(name) DO UPDATE SET value = excluded.value'
            )->execute([$name, $value]);
        }
        unset(self::$cache[$name]);
    }
}
