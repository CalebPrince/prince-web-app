<?php

declare(strict_types=1);

namespace App;

class Router
{
    /** @var array<int, array{method:string, pattern:string, handler:callable, paramNames:array<int,string>}> */
    private array $routes = [];

    public function get(string $pattern, callable $handler): void
    {
        $this->add('GET', $pattern, $handler);
    }

    public function post(string $pattern, callable $handler): void
    {
        $this->add('POST', $pattern, $handler);
    }

    public function put(string $pattern, callable $handler): void
    {
        $this->add('PUT', $pattern, $handler);
    }

    public function patch(string $pattern, callable $handler): void
    {
        $this->add('PATCH', $pattern, $handler);
    }

    public function delete(string $pattern, callable $handler): void
    {
        $this->add('DELETE', $pattern, $handler);
    }

    private function add(string $method, string $pattern, callable $handler): void
    {
        $paramNames = [];
        $regex = preg_replace_callback('#\{(\w+)\}#', function ($m) use (&$paramNames) {
            $paramNames[] = $m[1];
            return '([^/]+)';
        }, $pattern);

        $this->routes[] = [
            'method' => $method,
            'pattern' => '#^' . $regex . '$#',
            'handler' => $handler,
            'paramNames' => $paramNames,
        ];
    }

    public function dispatch(string $method, string $uri): void
    {
        $path = parse_url($uri, PHP_URL_PATH) ?: '/';

        foreach ($this->routes as $route) {
            if ($route['method'] !== $method) {
                continue;
            }
            if (preg_match($route['pattern'], $path, $matches)) {
                array_shift($matches);
                $params = array_combine($route['paramNames'], $matches) ?: [];
                ($route['handler'])($params);
                return;
            }
        }

        http_response_code(404);

        // API consumers get JSON; a human hitting a broken link gets the
        // branded page. This mirrors the ErrorDocument 404 that Apache
        // serves in production for static-file requests that never reach
        // this router at all.
        if (str_starts_with($path, '/api/')) {
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Not found']);
            return;
        }

        // DOCUMENT_ROOT, not '../public' — production deploys public/'s
        // contents into public_html/, so a literal "public/" folder next to
        // src/ doesn't exist there.
        $docRoot = $_SERVER['DOCUMENT_ROOT'] ?? (dirname(__DIR__) . '/public');
        $notFoundPage = $docRoot . '/404.html';
        if (is_file($notFoundPage)) {
            readfile($notFoundPage);
        } else {
            echo 'Not found';
        }
    }
}
