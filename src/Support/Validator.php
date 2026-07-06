<?php

declare(strict_types=1);

namespace App\Support;

class Validator
{
    /** @return array<int,string> list of error messages, empty if valid */
    public static function validateInquiry(array $data): array
    {
        $errors = [];

        $name = trim((string) ($data['name'] ?? ''));
        if ($name === '' || mb_strlen($name) > 255) {
            $errors[] = 'Name is required and must be under 255 characters.';
        }

        $email = trim((string) ($data['email'] ?? ''));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors[] = 'A valid email address is required.';
        }

        $message = trim((string) ($data['message'] ?? ''));
        if ($message === '' || mb_strlen($message) > 5000) {
            $errors[] = 'Message is required and must be under 5000 characters.';
        }

        return $errors;
    }

    /** @return array<int,string> */
    public static function validateProject(array $data): array
    {
        $errors = [];

        if (trim((string) ($data['title'] ?? '')) === '') {
            $errors[] = 'Title is required.';
        }
        if (trim((string) ($data['slug'] ?? '')) === '') {
            $errors[] = 'Slug is required.';
        } elseif (!preg_match('/^[a-z0-9\-]+$/', $data['slug'])) {
            $errors[] = 'Slug must contain only lowercase letters, numbers, and hyphens.';
        }
        if (trim((string) ($data['summary'] ?? '')) === '') {
            $errors[] = 'Summary is required.';
        }
        if (!in_array($data['category'] ?? '', ['custom_solution', 'cms', 'mobile'], true)) {
            $errors[] = 'Category must be one of: custom_solution, cms, mobile.';
        }
        if (trim((string) ($data['cover_image_path'] ?? '')) === '') {
            $errors[] = 'Cover image path is required.';
        }

        return $errors;
    }

    /** @return array<int,string> */
    public static function validateBlogPost(array $data): array
    {
        $errors = [];

        if (trim((string) ($data['title'] ?? '')) === '') {
            $errors[] = 'Title is required.';
        }
        if (trim((string) ($data['slug'] ?? '')) === '') {
            $errors[] = 'Slug is required.';
        } elseif (!preg_match('/^[a-z0-9\-]+$/', $data['slug'])) {
            $errors[] = 'Slug must contain only lowercase letters, numbers, and hyphens.';
        }
        if (trim((string) ($data['excerpt'] ?? '')) === '') {
            $errors[] = 'Excerpt is required.';
        }
        if (trim((string) ($data['body'] ?? '')) === '') {
            $errors[] = 'Body is required.';
        }
        if (trim((string) ($data['cover_image_path'] ?? '')) === '') {
            $errors[] = 'Cover image path is required.';
        }

        return $errors;
    }
}
