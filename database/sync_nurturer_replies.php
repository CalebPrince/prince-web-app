<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\NurturerReplySync;

$result = NurturerReplySync::run();
if (!$result['enabled']) {
    echo "Jason reply sync is off.\n";
    exit;
}
if ($result['error']) {
    fwrite(STDERR, "Jason reply sync: {$result['error']}\n");
    exit(1);
}
echo "Jason checked {$result['checked']} message(s): {$result['matched']} lead reply/replies, "
    . "{$result['replied']} automatic continuation(s), {$result['review']} held for review, "
    . "{$result['stopped']} stopped.\n";
