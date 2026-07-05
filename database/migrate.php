<?php

declare(strict_types=1);

require dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;

$pdo = Database::get();
$schema = file_get_contents(__DIR__ . '/schema.sql');
$pdo->exec($schema);

echo "Schema applied.\n";
