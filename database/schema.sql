-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1:3306
-- Generation Time: Nov 06, 2026 at 01:10 PM
-- Server version: 11.8.9-MariaDB-log
-- PHP Version: 7.2.34

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `u516460600_academy`
--

-- --------------------------------------------------------

--
-- Table structure for table `academy_audit_log`
--

CREATE TABLE `academy_audit_log` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` char(36) DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `target_path` varchar(700) DEFAULT NULL,
  `metadata_json` longtext DEFAULT NULL,
  `ip_hash` char(64) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `academy_data`
--

CREATE TABLE `academy_data` (
  `path` varchar(700) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `value_json` longtext NOT NULL,
  `value_type` enum('null','boolean','number','string','array','object') NOT NULL,
  `updated_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `academy_password_resets`
--

CREATE TABLE `academy_password_resets` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` char(36) NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` timestamp NOT NULL,
  `used_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `academy_rate_limits`
--

CREATE TABLE `academy_rate_limits` (
  `bucket_key` char(64) NOT NULL,
  `hits` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `window_started_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `academy_sessions`
--

CREATE TABLE `academy_sessions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` char(36) NOT NULL,
  `app_name` varchar(64) NOT NULL DEFAULT '[DEFAULT]',
  `token_hash` char(64) NOT NULL,
  `user_agent_hash` char(64) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `last_seen_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `expires_at` timestamp NOT NULL,
  `revoked_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `academy_users`
--

CREATE TABLE `academy_users` (
  `id` char(36) NOT NULL,
  `email` varchar(190) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `display_name` varchar(190) NOT NULL DEFAULT '',
  `primary_role` enum('student','teacher','parent','admin') NOT NULL DEFAULT 'student',
  `status` enum('active','pending','suspended','disabled') NOT NULL DEFAULT 'active',
  `email_verified` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `last_login_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `m1_challenges`
--

CREATE TABLE `m1_challenges` (
  `id` char(36) NOT NULL,
  `creator_id` char(36) NOT NULL,
  `creator_role` enum('admin','teacher') NOT NULL,
  `title` varchar(180) NOT NULL,
  `description` text DEFAULT NULL,
  `education_type` enum('public','azhar') NOT NULL,
  `stage` enum('primary','prep','sec') NOT NULL,
  `grade` tinyint(3) UNSIGNED NOT NULL,
  `subject` varchar(80) NOT NULL,
  `questions_json` longtext NOT NULL,
  `duration_minutes` smallint(5) UNSIGNED NOT NULL DEFAULT 20,
  `starts_at` datetime NOT NULL,
  `ends_at` datetime NOT NULL,
  `max_points` smallint(5) UNSIGNED NOT NULL DEFAULT 100,
  `status` enum('pending','published','rejected','closed') NOT NULL DEFAULT 'pending',
  `is_training` tinyint(1) NOT NULL DEFAULT 1,
  `reviewed_by` char(36) DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `m1_challenge_attempts`
--

CREATE TABLE `m1_challenge_attempts` (
  `id` char(36) NOT NULL,
  `challenge_id` char(36) NOT NULL,
  `student_id` char(36) NOT NULL,
  `answers_json` longtext NOT NULL,
  `correct_count` smallint(5) UNSIGNED NOT NULL,
  `question_count` smallint(5) UNSIGNED NOT NULL,
  `percentage` tinyint(3) UNSIGNED NOT NULL,
  `points_awarded` smallint(5) UNSIGNED NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `m1_challenge_sessions`
--

CREATE TABLE `m1_challenge_sessions` (
  `challenge_id` char(36) NOT NULL,
  `student_id` char(36) NOT NULL,
  `opened_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `m1_points_ledger`
--

CREATE TABLE `m1_points_ledger` (
  `id` char(36) NOT NULL,
  `student_id` char(36) NOT NULL,
  `source_type` varchar(50) NOT NULL,
  `source_id` char(36) NOT NULL,
  `education_type` enum('public','azhar') NOT NULL,
  `stage` enum('primary','prep','sec') NOT NULL,
  `grade` tinyint(3) UNSIGNED NOT NULL,
  `subject` varchar(80) NOT NULL,
  `points` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `m1_virtual_students`
--

CREATE TABLE `m1_virtual_students` (
  `id` char(36) NOT NULL,
  `display_name` varchar(100) NOT NULL,
  `avatar_url` varchar(500) DEFAULT NULL,
  `education_type` enum('public','azhar') NOT NULL DEFAULT 'public',
  `stage` enum('primary','prep','sec') NOT NULL DEFAULT 'primary',
  `grade` tinyint(3) UNSIGNED NOT NULL DEFAULT 1,
  `skill_level` enum('beginner','intermediate','advanced') NOT NULL DEFAULT 'intermediate',
  `simulated_points` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` char(36) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `m2_questions`
--

CREATE TABLE `m2_questions` (
  `id` char(36) NOT NULL,
  `author_id` char(36) NOT NULL,
  `author_role` enum('admin','teacher') NOT NULL,
  `education_type` enum('public','azhar') NOT NULL,
  `stage` enum('primary','prep','sec') NOT NULL,
  `grade` tinyint(3) UNSIGNED NOT NULL,
  `subject` varchar(80) NOT NULL,
  `unit_number` smallint(5) UNSIGNED NOT NULL DEFAULT 1,
  `lesson_id` varchar(80) NOT NULL DEFAULT '',
  `skill` varchar(140) NOT NULL DEFAULT '',
  `difficulty` tinyint(3) UNSIGNED NOT NULL DEFAULT 2,
  `question_text` varchar(600) NOT NULL,
  `options_json` longtext NOT NULL,
  `correct_index` tinyint(3) UNSIGNED NOT NULL,
  `explanation` text DEFAULT NULL,
  `fingerprint` char(64) NOT NULL,
  `status` enum('pending','approved','rejected','archived') NOT NULL DEFAULT 'pending',
  `reviewed_by` char(36) DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `m4_seasons`
--

CREATE TABLE `m4_seasons` (
  `id` char(36) NOT NULL,
  `title` varchar(160) NOT NULL,
  `description` varchar(1000) NOT NULL DEFAULT '',
  `education_type` enum('public','azhar') NOT NULL,
  `stage` enum('primary','prep','sec') NOT NULL,
  `grade` tinyint(3) UNSIGNED NOT NULL,
  `starts_at` datetime NOT NULL,
  `ends_at` datetime NOT NULL,
  `status` enum('draft','published','closed') NOT NULL DEFAULT 'draft',
  `creator_id` char(36) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `m4_solo_enrollments`
--

CREATE TABLE `m4_solo_enrollments` (
  `tournament_id` char(36) NOT NULL,
  `student_id` char(36) NOT NULL,
  `enrolled_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `m4_teams`
--

CREATE TABLE `m4_teams` (
  `id` char(36) NOT NULL,
  `tournament_id` char(36) NOT NULL,
  `title` varchar(100) NOT NULL,
  `join_code_hash` char(64) NOT NULL,
  `captain_id` char(36) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `m4_team_members`
--

CREATE TABLE `m4_team_members` (
  `tournament_id` char(36) NOT NULL,
  `student_id` char(36) NOT NULL,
  `team_id` char(36) NOT NULL,
  `joined_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `m4_tournaments`
--

CREATE TABLE `m4_tournaments` (
  `id` char(36) NOT NULL,
  `season_id` char(36) DEFAULT NULL,
  `title` varchar(160) NOT NULL,
  `description` varchar(1000) NOT NULL DEFAULT '',
  `education_type` enum('public','azhar') NOT NULL,
  `stage` enum('primary','prep','sec') NOT NULL,
  `grade` tinyint(3) UNSIGNED NOT NULL,
  `subject` varchar(80) NOT NULL,
  `mode` enum('solo','team') NOT NULL DEFAULT 'solo',
  `is_training` tinyint(1) NOT NULL DEFAULT 1,
  `status` enum('pending','published','rejected','closed') NOT NULL DEFAULT 'pending',
  `starts_at` datetime NOT NULL,
  `ends_at` datetime NOT NULL,
  `max_team_size` tinyint(3) UNSIGNED NOT NULL DEFAULT 5,
  `creator_id` char(36) NOT NULL,
  `creator_role` enum('admin','teacher') NOT NULL,
  `reviewed_by` char(36) DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `m4_tournament_rounds`
--

CREATE TABLE `m4_tournament_rounds` (
  `id` char(36) NOT NULL,
  `tournament_id` char(36) NOT NULL,
  `challenge_id` char(36) NOT NULL,
  `round_no` smallint(5) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `m5_attendance`
--

CREATE TABLE `m5_attendance` (
  `session_id` char(36) NOT NULL,
  `student_id` char(36) NOT NULL,
  `first_joined_at` datetime DEFAULT NULL,
  `last_joined_at` datetime DEFAULT NULL,
  `join_count` smallint(5) UNSIGNED NOT NULL DEFAULT 0,
  `attendance_status` enum('unmarked','present','absent','excused') NOT NULL DEFAULT 'unmarked',
  `marked_by` char(36) DEFAULT NULL,
  `marked_at` datetime DEFAULT NULL,
  `teacher_note` varchar(300) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `m5_sessions`
--

CREATE TABLE `m5_sessions` (
  `id` char(36) NOT NULL,
  `title` varchar(160) NOT NULL,
  `description` varchar(1000) NOT NULL DEFAULT '',
  `education_type` enum('public','azhar') NOT NULL,
  `stage` enum('primary','prep','sec') NOT NULL,
  `grade` tinyint(3) UNSIGNED NOT NULL,
  `subject` varchar(80) NOT NULL,
  `teacher_id` char(36) NOT NULL,
  `creator_id` char(36) NOT NULL,
  `meeting_url` varchar(700) NOT NULL,
  `provider` varchar(30) NOT NULL DEFAULT 'external',
  `starts_at` datetime NOT NULL,
  `ends_at` datetime NOT NULL,
  `status` enum('pending','published','rejected','cancelled') NOT NULL DEFAULT 'pending',
  `reviewed_by` char(36) DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `m7_certificates`
--

CREATE TABLE `m7_certificates` (
  `id` char(36) NOT NULL,
  `public_code` char(24) NOT NULL,
  `source_type` enum('challenge','tournament') NOT NULL,
  `source_id` char(36) NOT NULL,
  `student_id` char(36) NOT NULL,
  `recipient_name` varchar(160) NOT NULL,
  `public_name` varchar(90) NOT NULL,
  `source_title` varchar(180) NOT NULL,
  `award_kind` enum('rank','completion') NOT NULL,
  `award_rank` tinyint(3) UNSIGNED DEFAULT NULL,
  `points_snapshot` int(11) NOT NULL DEFAULT 0,
  `education_type` enum('public','azhar') NOT NULL,
  `stage` enum('primary','prep','sec') NOT NULL,
  `grade` tinyint(3) UNSIGNED NOT NULL,
  `status` enum('valid','revoked') NOT NULL DEFAULT 'valid',
  `issued_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `issued_by` char(36) NOT NULL,
  `revoked_by` char(36) DEFAULT NULL,
  `revoked_at` timestamp NULL DEFAULT NULL,
  `revocation_reason` varchar(200) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `m7_certificate_settings`
--

CREATE TABLE `m7_certificate_settings` (
  `id` tinyint(3) UNSIGNED NOT NULL,
  `settings_json` longtext NOT NULL,
  `updated_by` char(36) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `v48_attempt_results`
--

CREATE TABLE `v48_attempt_results` (
  `id` char(36) NOT NULL,
  `challenge_id` char(36) NOT NULL,
  `student_id` char(36) NOT NULL,
  `attempt_no` tinyint(3) UNSIGNED NOT NULL,
  `answers_json` longtext NOT NULL,
  `correct_count` smallint(5) UNSIGNED NOT NULL,
  `question_count` smallint(5) UNSIGNED NOT NULL,
  `percentage` tinyint(3) UNSIGNED NOT NULL,
  `points_awarded` smallint(5) UNSIGNED NOT NULL,
  `submitted_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `v48_attempt_sessions`
--

CREATE TABLE `v48_attempt_sessions` (
  `challenge_id` char(36) NOT NULL,
  `student_id` char(36) NOT NULL,
  `attempt_no` tinyint(3) UNSIGNED NOT NULL,
  `opened_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `v48_challenge_rules`
--

CREATE TABLE `v48_challenge_rules` (
  `challenge_id` char(36) NOT NULL,
  `max_attempts` tinyint(3) UNSIGNED NOT NULL DEFAULT 1,
  `reveal_policy` enum('instant','after_end','manual') NOT NULL DEFAULT 'instant',
  `score_policy` enum('best','first','last') NOT NULL DEFAULT 'best',
  `shuffle_questions` tinyint(1) NOT NULL DEFAULT 0,
  `shuffle_options` tinyint(1) NOT NULL DEFAULT 0,
  `results_released_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `v48_season_rules`
--

CREATE TABLE `v48_season_rules` (
  `season_id` char(36) NOT NULL,
  `reveal_policy` enum('instant','after_end','manual') NOT NULL DEFAULT 'after_end',
  `results_released_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `v481_member_ready`
--

CREATE TABLE `v481_member_ready` (
  `tournament_id` char(36) NOT NULL,
  `student_id` char(36) NOT NULL,
  `ready_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `v481_model_assignments`
--

CREATE TABLE `v481_model_assignments` (
  `tournament_id` char(36) NOT NULL,
  `student_id` char(36) NOT NULL,
  `model_key` enum('A','B','C') NOT NULL,
  `assigned_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `v481_team_status`
--

CREATE TABLE `v481_team_status` (
  `team_id` char(36) NOT NULL,
  `started_at` datetime DEFAULT NULL,
  `started_by` char(36) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `v481_tournament_prize_runs`
--

CREATE TABLE `v481_tournament_prize_runs` (
  `tournament_id` char(36) NOT NULL,
  `awarded_at` datetime NOT NULL,
  `awarded_by` char(36) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `v481_tournament_rules`
--

CREATE TABLE `v481_tournament_rules` (
  `tournament_id` char(36) NOT NULL,
  `model_count` tinyint(3) UNSIGNED NOT NULL DEFAULT 1,
  `score_mode` enum('average','sum','top_n') NOT NULL DEFAULT 'average',
  `top_n` tinyint(3) UNSIGNED NOT NULL DEFAULT 2,
  `require_ready` tinyint(1) NOT NULL DEFAULT 0,
  `min_ready` tinyint(3) UNSIGNED NOT NULL DEFAULT 2,
  `first_points` smallint(5) UNSIGNED NOT NULL DEFAULT 0,
  `second_points` smallint(5) UNSIGNED NOT NULL DEFAULT 0,
  `third_points` smallint(5) UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `v482_round_models`
--

CREATE TABLE `v482_round_models` (
  `tournament_id` char(36) NOT NULL,
  `challenge_id` char(36) NOT NULL,
  `model_key` enum('A','B','C') NOT NULL,
  `questions_json` longtext NOT NULL,
  `question_count` smallint(5) UNSIGNED NOT NULL,
  `created_by` char(36) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `v482_team_certificate_details`
--

CREATE TABLE `v482_team_certificate_details` (
  `certificate_id` char(36) NOT NULL,
  `team_id` char(36) NOT NULL,
  `team_name_snapshot` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `academy_audit_log`
--
ALTER TABLE `academy_audit_log`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_academy_audit_user` (`user_id`),
  ADD KEY `idx_academy_audit_action` (`action`),
  ADD KEY `idx_academy_audit_created` (`created_at`);

--
-- Indexes for table `academy_data`
--
ALTER TABLE `academy_data`
  ADD PRIMARY KEY (`path`),
  ADD KEY `idx_academy_data_updated` (`updated_at`),
  ADD KEY `idx_academy_data_user` (`updated_by`);

--
-- Indexes for table `academy_password_resets`
--
ALTER TABLE `academy_password_resets`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_academy_password_reset_token` (`token_hash`),
  ADD KEY `idx_academy_password_reset_user` (`user_id`);

--
-- Indexes for table `academy_rate_limits`
--
ALTER TABLE `academy_rate_limits`
  ADD PRIMARY KEY (`bucket_key`);

--
-- Indexes for table `academy_sessions`
--
ALTER TABLE `academy_sessions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_academy_sessions_token` (`token_hash`),
  ADD KEY `idx_academy_sessions_user_app` (`user_id`,`app_name`),
  ADD KEY `idx_academy_sessions_expiry` (`expires_at`);

--
-- Indexes for table `academy_users`
--
ALTER TABLE `academy_users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_academy_users_email` (`email`),
  ADD KEY `idx_academy_users_role_status` (`primary_role`,`status`);

--
-- Indexes for table `m1_challenges`
--
ALTER TABLE `m1_challenges`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_m1_challenges_scope` (`education_type`,`stage`,`grade`,`subject`,`status`),
  ADD KEY `idx_m1_challenges_creator` (`creator_id`,`status`),
  ADD KEY `idx_m1_challenges_period` (`starts_at`,`ends_at`);

--
-- Indexes for table `m1_challenge_attempts`
--
ALTER TABLE `m1_challenge_attempts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_m1_single_attempt` (`challenge_id`,`student_id`),
  ADD KEY `idx_m1_student_attempts` (`student_id`,`created_at`);

--
-- Indexes for table `m1_challenge_sessions`
--
ALTER TABLE `m1_challenge_sessions`
  ADD PRIMARY KEY (`challenge_id`,`student_id`);

--
-- Indexes for table `m1_points_ledger`
--
ALTER TABLE `m1_points_ledger`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_m1_points_once` (`student_id`,`source_type`,`source_id`),
  ADD KEY `idx_m1_points_scope` (`education_type`,`stage`,`grade`,`subject`,`created_at`),
  ADD KEY `idx_m1_points_student` (`student_id`);

--
-- Indexes for table `m1_virtual_students`
--
ALTER TABLE `m1_virtual_students`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_m1_virtual_scope` (`education_type`,`stage`,`grade`,`is_active`);

--
-- Indexes for table `m2_questions`
--
ALTER TABLE `m2_questions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_m2_scope_fingerprint` (`education_type`,`stage`,`grade`,`subject`,`fingerprint`),
  ADD KEY `idx_m2_status_subject` (`status`,`education_type`,`stage`,`grade`,`subject`),
  ADD KEY `idx_m2_author_status` (`author_id`,`status`),
  ADD KEY `idx_m2_created` (`created_at`);

--
-- Indexes for table `m4_seasons`
--
ALTER TABLE `m4_seasons`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_m4_season_scope` (`education_type`,`stage`,`grade`,`status`,`starts_at`);

--
-- Indexes for table `m4_solo_enrollments`
--
ALTER TABLE `m4_solo_enrollments`
  ADD PRIMARY KEY (`tournament_id`,`student_id`);

--
-- Indexes for table `m4_teams`
--
ALTER TABLE `m4_teams`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_m4_team_name` (`tournament_id`,`title`),
  ADD KEY `idx_m4_team_tournament` (`tournament_id`);

--
-- Indexes for table `m4_team_members`
--
ALTER TABLE `m4_team_members`
  ADD PRIMARY KEY (`tournament_id`,`student_id`),
  ADD KEY `idx_m4_member_team` (`team_id`);

--
-- Indexes for table `m4_tournaments`
--
ALTER TABLE `m4_tournaments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_m4_tournament_scope` (`education_type`,`stage`,`grade`,`status`),
  ADD KEY `idx_m4_tournament_season` (`season_id`),
  ADD KEY `idx_m4_tournament_creator` (`creator_id`,`status`);

--
-- Indexes for table `m4_tournament_rounds`
--
ALTER TABLE `m4_tournament_rounds`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_m4_round_position` (`tournament_id`,`round_no`),
  ADD UNIQUE KEY `uq_m4_round_challenge` (`tournament_id`,`challenge_id`),
  ADD KEY `fk_m4_round_challenge` (`challenge_id`);

--
-- Indexes for table `m5_attendance`
--
ALTER TABLE `m5_attendance`
  ADD PRIMARY KEY (`session_id`,`student_id`),
  ADD KEY `idx_m5_student` (`student_id`,`attendance_status`);

--
-- Indexes for table `m5_sessions`
--
ALTER TABLE `m5_sessions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_m5_scope` (`education_type`,`stage`,`grade`,`status`,`starts_at`),
  ADD KEY `idx_m5_teacher` (`teacher_id`,`starts_at`),
  ADD KEY `idx_m5_start` (`starts_at`);

--
-- Indexes for table `m7_certificates`
--
ALTER TABLE `m7_certificates`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_m7_public_code` (`public_code`),
  ADD UNIQUE KEY `uq_m7_source_recipient` (`source_type`,`source_id`,`student_id`),
  ADD KEY `idx_m7_student` (`student_id`,`issued_at`),
  ADD KEY `idx_m7_source` (`source_type`,`source_id`),
  ADD KEY `idx_m7_status` (`status`);

--
-- Indexes for table `m7_certificate_settings`
--
ALTER TABLE `m7_certificate_settings`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `v48_attempt_results`
--
ALTER TABLE `v48_attempt_results`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_v48_student_attempt` (`challenge_id`,`student_id`,`attempt_no`),
  ADD KEY `idx_v48_results_score` (`challenge_id`,`percentage`,`submitted_at`);

--
-- Indexes for table `v48_attempt_sessions`
--
ALTER TABLE `v48_attempt_sessions`
  ADD PRIMARY KEY (`challenge_id`,`student_id`,`attempt_no`);

--
-- Indexes for table `v48_challenge_rules`
--
ALTER TABLE `v48_challenge_rules`
  ADD PRIMARY KEY (`challenge_id`);

--
-- Indexes for table `v48_season_rules`
--
ALTER TABLE `v48_season_rules`
  ADD PRIMARY KEY (`season_id`);

--
-- Indexes for table `v481_member_ready`
--
ALTER TABLE `v481_member_ready`
  ADD PRIMARY KEY (`tournament_id`,`student_id`);

--
-- Indexes for table `v481_model_assignments`
--
ALTER TABLE `v481_model_assignments`
  ADD PRIMARY KEY (`tournament_id`,`student_id`);

--
-- Indexes for table `v481_team_status`
--
ALTER TABLE `v481_team_status`
  ADD PRIMARY KEY (`team_id`);

--
-- Indexes for table `v481_tournament_prize_runs`
--
ALTER TABLE `v481_tournament_prize_runs`
  ADD PRIMARY KEY (`tournament_id`);

--
-- Indexes for table `v481_tournament_rules`
--
ALTER TABLE `v481_tournament_rules`
  ADD PRIMARY KEY (`tournament_id`);

--
-- Indexes for table `v482_round_models`
--
ALTER TABLE `v482_round_models`
  ADD PRIMARY KEY (`tournament_id`,`challenge_id`,`model_key`),
  ADD KEY `fk_v482_model_challenge` (`challenge_id`);

--
-- Indexes for table `v482_team_certificate_details`
--
ALTER TABLE `v482_team_certificate_details`
  ADD PRIMARY KEY (`certificate_id`),
  ADD KEY `idx_v482_team_cert_team` (`team_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `academy_audit_log`
--
ALTER TABLE `academy_audit_log`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `academy_password_resets`
--
ALTER TABLE `academy_password_resets`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `academy_sessions`
--
ALTER TABLE `academy_sessions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `academy_password_resets`
--
ALTER TABLE `academy_password_resets`
  ADD CONSTRAINT `fk_academy_password_reset_user` FOREIGN KEY (`user_id`) REFERENCES `academy_users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `academy_sessions`
--
ALTER TABLE `academy_sessions`
  ADD CONSTRAINT `fk_academy_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `academy_users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `m1_challenge_attempts`
--
ALTER TABLE `m1_challenge_attempts`
  ADD CONSTRAINT `fk_m1_attempt_challenge` FOREIGN KEY (`challenge_id`) REFERENCES `m1_challenges` (`id`);

--
-- Constraints for table `m1_challenge_sessions`
--
ALTER TABLE `m1_challenge_sessions`
  ADD CONSTRAINT `fk_m1_session_challenge` FOREIGN KEY (`challenge_id`) REFERENCES `m1_challenges` (`id`);

--
-- Constraints for table `m4_solo_enrollments`
--
ALTER TABLE `m4_solo_enrollments`
  ADD CONSTRAINT `fk_m4_enroll_tournament` FOREIGN KEY (`tournament_id`) REFERENCES `m4_tournaments` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `m4_teams`
--
ALTER TABLE `m4_teams`
  ADD CONSTRAINT `fk_m4_team_tournament` FOREIGN KEY (`tournament_id`) REFERENCES `m4_tournaments` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `m4_team_members`
--
ALTER TABLE `m4_team_members`
  ADD CONSTRAINT `fk_m4_member_team` FOREIGN KEY (`team_id`) REFERENCES `m4_teams` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_m4_member_tournament` FOREIGN KEY (`tournament_id`) REFERENCES `m4_tournaments` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `m4_tournaments`
--
ALTER TABLE `m4_tournaments`
  ADD CONSTRAINT `fk_m4_tournament_season` FOREIGN KEY (`season_id`) REFERENCES `m4_seasons` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `m4_tournament_rounds`
--
ALTER TABLE `m4_tournament_rounds`
  ADD CONSTRAINT `fk_m4_round_challenge` FOREIGN KEY (`challenge_id`) REFERENCES `m1_challenges` (`id`),
  ADD CONSTRAINT `fk_m4_round_tournament` FOREIGN KEY (`tournament_id`) REFERENCES `m4_tournaments` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `m5_attendance`
--
ALTER TABLE `m5_attendance`
  ADD CONSTRAINT `fk_m5_attendance_session` FOREIGN KEY (`session_id`) REFERENCES `m5_sessions` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `v48_attempt_results`
--
ALTER TABLE `v48_attempt_results`
  ADD CONSTRAINT `fk_v48_results_challenge` FOREIGN KEY (`challenge_id`) REFERENCES `m1_challenges` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `v48_attempt_sessions`
--
ALTER TABLE `v48_attempt_sessions`
  ADD CONSTRAINT `fk_v48_sessions_challenge` FOREIGN KEY (`challenge_id`) REFERENCES `m1_challenges` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `v48_challenge_rules`
--
ALTER TABLE `v48_challenge_rules`
  ADD CONSTRAINT `fk_v48_challenge_rules` FOREIGN KEY (`challenge_id`) REFERENCES `m1_challenges` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `v48_season_rules`
--
ALTER TABLE `v48_season_rules`
  ADD CONSTRAINT `fk_v48_season_rules` FOREIGN KEY (`season_id`) REFERENCES `m4_seasons` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `v481_member_ready`
--
ALTER TABLE `v481_member_ready`
  ADD CONSTRAINT `v481_member_ready_ibfk_1` FOREIGN KEY (`tournament_id`,`student_id`) REFERENCES `m4_team_members` (`tournament_id`, `student_id`) ON DELETE CASCADE;

--
-- Constraints for table `v481_model_assignments`
--
ALTER TABLE `v481_model_assignments`
  ADD CONSTRAINT `v481_model_assignments_ibfk_1` FOREIGN KEY (`tournament_id`,`student_id`) REFERENCES `m4_team_members` (`tournament_id`, `student_id`) ON DELETE CASCADE;

--
-- Constraints for table `v481_team_status`
--
ALTER TABLE `v481_team_status`
  ADD CONSTRAINT `v481_team_status_ibfk_1` FOREIGN KEY (`team_id`) REFERENCES `m4_teams` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `v481_tournament_prize_runs`
--
ALTER TABLE `v481_tournament_prize_runs`
  ADD CONSTRAINT `v481_tournament_prize_runs_ibfk_1` FOREIGN KEY (`tournament_id`) REFERENCES `m4_tournaments` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `v481_tournament_rules`
--
ALTER TABLE `v481_tournament_rules`
  ADD CONSTRAINT `v481_tournament_rules_ibfk_1` FOREIGN KEY (`tournament_id`) REFERENCES `m4_tournaments` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `v482_round_models`
--
ALTER TABLE `v482_round_models`
  ADD CONSTRAINT `fk_v482_model_challenge` FOREIGN KEY (`challenge_id`) REFERENCES `m1_challenges` (`id`),
  ADD CONSTRAINT `fk_v482_model_tournament` FOREIGN KEY (`tournament_id`) REFERENCES `m4_tournaments` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `v482_team_certificate_details`
--
ALTER TABLE `v482_team_certificate_details`
  ADD CONSTRAINT `fk_v482_team_cert_id` FOREIGN KEY (`certificate_id`) REFERENCES `m7_certificates` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
