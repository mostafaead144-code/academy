<?php
declare(strict_types=1);
/** EGTAZ V88: read-only admin financial overview of V84/V85 booking records.
 * Not a bank statement, invoice, payment gateway or full accounting general ledger.
 */
function academy_v88_positive(mixed $v): int {
    return is_numeric($v) ? max(0, (int)$v) : 0;
}
function academy_v88_booking_row(array $r, ?array $plan): array {
    $id = (string)($r['id'] ?? '');
    $status = (string)($r['status'] ?? '');
    $price = academy_v88_positive($r['pricePiasters'] ?? 0);
    $due = min($price, academy_v88_positive($r['teacherDuePiasters'] ?? 0));
    $confirmed = in_array($status, ['paid', 'fulfilled', 'settled'], true);
    $result = [
        'id' => $id,
        'status' => $status,
        'studentName' => (string)($r['studentName'] ?? ''),
        'teacherId' => (string)($r['teacherId'] ?? ''),
        'teacherName' => (string)($r['teacherName'] ?? ''),
        'subject' => (string)($r['subject'] ?? ''),
        'type' => (string)($r['type'] ?? ''),
        'grade' => (string)($r['grade'] ?? ''),
        'createdAt' => academy_v88_positive($r['createdAt'] ?? 0),
        'paymentConfirmedAt' => academy_v88_positive($r['paymentConfirmedAt'] ?? 0),
        'updatedAt' => academy_v88_positive($r['updatedAt'] ?? 0),
        'grossPiasters' => $confirmed ? $price : 0,
        'refundedPiasters' => 0,
        'netCollectedPiasters' => $confirmed ? $price : 0,
        'commissionRealizedPiasters' => 0,
        'teacherEarnedPiasters' => 0,
        'paidOutPiasters' => 0,
        'teacherAvailablePiasters' => 0,
        'teacherOverpaymentPiasters' => 0,
        'unfulfilledLiabilityPiasters' => $confirmed ? $price : 0,
        'legacyWithoutLedger' => $plan === null,
        'sessionsTotal' => 0,
        'sessionsCompleted' => 0,
    ];
    if (!$confirmed) return $result; // Quotes are not cash received.
    if ($plan !== null) {
        $s = academy_v85_sums($r, $plan);
        foreach (['refundedPiasters','netCollectedPiasters','commissionRealizedPiasters',
                  'teacherEarnedPiasters','paidOutPiasters','teacherAvailablePiasters',
                  'teacherOverpaymentPiasters','unfulfilledLiabilityPiasters'] as $key) {
            $result[$key] = academy_v88_positive($s[$key] ?? 0);
        }
        $result['sessionsTotal'] = academy_v88_positive($s['totalSessions'] ?? 0);
        $result['sessionsCompleted'] = academy_v88_positive($s['completedSessions'] ?? 0);
    } elseif (in_array($status, ['fulfilled','settled'], true)) {
        $result['teacherEarnedPiasters'] = $due;
        $result['commissionRealizedPiasters'] = $price - $due;
        $result['teacherAvailablePiasters'] = $status === 'fulfilled' ? $due : 0;
        $result['paidOutPiasters'] = $status === 'settled' ? $due : 0;
        $result['unfulfilledLiabilityPiasters'] = 0;
    }
    return $result;
}
function academy_v88_totals(array $rows): array {
    $keys = ['grossPiasters','refundedPiasters','netCollectedPiasters',
        'commissionRealizedPiasters','teacherEarnedPiasters','paidOutPiasters',
        'teacherAvailablePiasters','teacherOverpaymentPiasters','unfulfilledLiabilityPiasters'];
    $totals = array_fill_keys($keys, 0);
    $totals['bookings'] = count($rows);
    $totals['confirmedBookings'] = 0;
    $totals['legacyWithoutLedger'] = 0;
    foreach ($rows as $r) {
        foreach ($keys as $key) $totals[$key] += academy_v88_positive($r[$key] ?? 0);
        if (($r['grossPiasters'] ?? 0) > 0) $totals['confirmedBookings']++;
        if (($r['legacyWithoutLedger'] ?? false) && ($r['grossPiasters'] ?? 0) > 0) $totals['legacyWithoutLedger']++;
    }
    $totals['cashHeldPiasters'] = max(0, $totals['netCollectedPiasters'] - $totals['paidOutPiasters']);
    return $totals;
}
function academy_v88_page(PDO $pdo, int $offset, int $limit): array {
    academy_v84_check($offset >= 0 && $offset <= 100000 && $limit >= 1 && $limit <= 80, 'invalid_page', 422);
    // Indexed node paths: fetch one bounded page of bookings, not all academy_data.
    $q = $pdo->prepare("SELECT path FROM academy_data WHERE path LIKE 'v84Requests/%/updatedAt' ORDER BY updated_at DESC, path DESC LIMIT ? OFFSET ?");
    $q->bindValue(1, $limit + 1, PDO::PARAM_INT);
    $q->bindValue(2, $offset, PDO::PARAM_INT);
    $q->execute();
    $paths = $q->fetchAll(PDO::FETCH_COLUMN);
    $more = count($paths) > $limit;
    $paths = array_slice($paths, 0, $limit);
    $rows = [];
    $skipped = 0;
    foreach ($paths as $path) {
        if (!preg_match('~^v84Requests/([a-f0-9]{24})/updatedAt$~D', (string)$path, $m)) { $skipped++; continue; }
        $r = academy_read_node('v84Requests/'.$m[1]);
        if (!is_array($r) || ($r['id'] ?? null) !== $m[1]) { $skipped++; continue; }
        $p = academy_read_node('v85Plans/'.$m[1]);
        try { $rows[] = academy_v88_booking_row($r, is_array($p) ? $p : null); }
        catch (Throwable $e) { $skipped++; error_log('V88 financial record skipped: '. $m[1]); }
    }
    return ['items' => $rows, 'offset' => $offset,
        'nextOffset' => $offset + count($paths), 'hasMore' => $more,
        'scanned' => count($paths), 'skipped' => $skipped,
        'totals' => academy_v88_totals($rows), 'generatedAt' => academy_now_ms(),
        'scope' => 'page_only', 'source' => 'verified_manual_booking_records'];
}
function academy_v88_route(string $route, string $method, PDO $pdo): void {
    if (!str_starts_with($route, '/v88/')) return;
    try {
        $u = academy_v84_role();
        academy_v84_check(($u['primary_role'] ?? '') === 'admin', 'forbidden', 403);
        academy_rate_limit('v88-read-'.(string)$u['id'], 90, 3600);
        if ($method === 'GET' && $route === '/v88/admin/report') {
            $offset = filter_var($_GET['offset'] ?? '0', FILTER_VALIDATE_INT);
            $limit = filter_var($_GET['limit'] ?? '60', FILTER_VALIDATE_INT);
            academy_v84_check($offset !== false && $limit !== false, 'invalid_page', 422);
            academy_json(['ok' => true, 'report' => academy_v88_page($pdo, $offset, $limit)]);
        }
        academy_v84_check(false, 'not_found', 404);
    } catch (AcademyV84Error $e) { academy_json(['ok' => false, 'error' => $e->getMessage()], $e->httpStatus); }
}
