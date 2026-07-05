<?php

declare(strict_types=1);

namespace App\Support;

use PDO;

class Database
{
    private static ?PDO $instance = null;

    public static function get(): PDO
    {
        if (self::$instance === null) {
            require_once dirname(__DIR__, 2) . '/config/config.php';
            $config = appConfig();
            $pdo = new PDO('sqlite:' . $config['db_path']);
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
            $pdo->exec('PRAGMA foreign_keys = ON');
            $pdo->exec('PRAGMA journal_mode = WAL');
            self::$instance = $pdo;
        }
        return self::$instance;
    }
}
