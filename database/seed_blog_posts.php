<?php

declare(strict_types=1);

// Seeds the 50 hand-written blog posts defined in blog_posts_data.php.
// Safe to re-run: each post is upserted by slug. Run generate_blog_covers.php
// first so the referenced /uploads/blog-covers/{slug}.svg files exist.

require __DIR__ . '/blog_posts_data.php';
require dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;

$pdo = Database::get();

$sortOrder = 1;
foreach (BLOG_POSTS as $post) {
    $category = CATEGORY_META[$post['category_key']];
    $coverImagePath = "/uploads/blog-covers/{$post['slug']}.svg";

    $stmt = $pdo->prepare('SELECT id FROM blog_posts WHERE slug = ?');
    $stmt->execute([$post['slug']]);
    $existing = $stmt->fetch();

    if ($existing) {
        $stmt = $pdo->prepare(
            "UPDATE blog_posts SET title=?, excerpt=?, body=?, category=?, cover_image_path=?,
             is_published=1, sort_order=?, updated_at=datetime('now') WHERE id=?"
        );
        $stmt->execute([
            $post['title'],
            $post['excerpt'],
            $post['body'],
            $category,
            $coverImagePath,
            $sortOrder,
            $existing['id'],
        ]);
        echo "Updated: {$post['title']}\n";
    } else {
        $stmt = $pdo->prepare(
            'INSERT INTO blog_posts (slug, title, excerpt, body, category, cover_image_path, is_published, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, 1, ?)'
        );
        $stmt->execute([
            $post['slug'],
            $post['title'],
            $post['excerpt'],
            $post['body'],
            $category,
            $coverImagePath,
            $sortOrder,
        ]);
        echo "Created: {$post['title']}\n";
    }

    $sortOrder++;
}

echo "Done. Seeded " . count(BLOG_POSTS) . " blog posts.\n";
