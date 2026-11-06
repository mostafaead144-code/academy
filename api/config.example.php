<?php
declare(strict_types=1);

/*
 * Copy this file to config.local.php on Hostinger and fill in the values.
 * config.local.php is ignored by Git and must NEVER be committed.
 */
return [
    'db' => [
        'host' => 'localhost',
        'name' => 'uXXXXXXXX_academy',
        'user' => 'uXXXXXXXX_academy',
        'pass' => 'CHANGE_ME',
        'charset' => 'utf8mb4',
    ],
    'app' => [
        'base_url' => 'https://academy.egtaz.online',
        'environment' => 'production',
        'session_days' => 30,
        'cors_origins' => [
            'https://academy.egtaz.online',
        ],
        // Generate a long random value (64+ chars) before production.
        'app_secret' => 'CHANGE_TO_A_LONG_RANDOM_SECRET',
    ],
];
