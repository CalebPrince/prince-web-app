<?php

declare(strict_types=1);

// CLI escape hatch for a locked-out admin — there is deliberately no
// public forgot-password flow (single-admin app; a reset email is a bigger
// attack surface than an SSH session). Run from the app root on the server:
//
//   php database/reset_admin_password.php <email> <new-password> [--disable-2fa]
//
// Bumps token_version so every outstanding session/refresh token dies
// immediately. --disable-2fa also clears the TOTP secret + backup codes,
// for when the authenticator device and the backup codes are both gone.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;

$args = array_slice($argv, 1);
$disable2fa = in_array('--disable-2fa', $args, true);
$args = array_values(array_filter($args, fn (string $a) => $a !== '--disable-2fa'));

$email = $args[0] ?? null;
$password = $args[1] ?? null;

if ($email === null || $password === null) {
    fwrite(STDERR, "Usage: php database/reset_admin_password.php <email> <new-password> [--disable-2fa]\n");
    exit(1);
}
if (strlen($password) < 10) {
    fwrite(STDERR, "Password must be at least 10 characters.\n");
    exit(1);
}

$pdo = Database::get();

$stmt = $pdo->prepare('SELECT id, totp_enabled FROM users WHERE email = ?');
$stmt->execute([$email]);
$user = $stmt->fetch();

if (!$user) {
    fwrite(STDERR, "No admin user with email $email. Existing admin accounts:\n");
    foreach ($pdo->query('SELECT email FROM users ORDER BY id') as $row) {
        fwrite(STDERR, '  ' . $row['email'] . "\n");
    }
    exit(1);
}

if ($disable2fa) {
    $stmt = $pdo->prepare(
        'UPDATE users SET password_hash = ?, token_version = token_version + 1,
         totp_enabled = 0, totp_secret = NULL, totp_backup_codes = NULL WHERE id = ?'
    );
    $stmt->execute([password_hash($password, PASSWORD_DEFAULT), $user['id']]);
    echo "Password reset for $email. 2FA disabled — re-enable it from Admin -> Settings.\n";
} else {
    $stmt = $pdo->prepare(
        'UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?'
    );
    $stmt->execute([password_hash($password, PASSWORD_DEFAULT), $user['id']]);
    echo "Password reset for $email." . ((int) $user['totp_enabled'] === 1
        ? " 2FA is still enabled (add --disable-2fa if the device is lost).\n"
        : "\n");
}

echo "All existing sessions have been invalidated.\n";
