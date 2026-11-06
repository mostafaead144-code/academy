<?php
/** V97 — Owner-controlled student dashboard presentation. UI visibility is not an authorization policy. */
declare(strict_types=1);

const ACADEMY_V97_ITEMS = [
 'my-subjects','m5-calendar','student-assignments','teachers','my-results',
 'student-progress','v74-student','v69-student','v55-review','v54-study','student-mistakes','m6-hub',
 'm1-challenges','m4-hub','m1-leaderboard','m1-points','m7-certificates','v46-badges',
 'library','student-favorites','m6-search','stages',
 'notifications','student-subscriptions','profile','invite','v51-guardians','account-support',
 'v84-student','v90-student','v87-directory','v89-student','v79-more',
 'home-hero','home-resume','home-quick','home-today','home-teacher','home-footer'
];

function academy_v97_hidden(): array {
    $stored=academy_read_node('v97StudentUi/hidden');
    if(!is_array($stored))return [];
    return array_values(array_intersect(ACADEMY_V97_ITEMS,array_filter($stored,'is_string')));
}

function academy_v97_route(string $route,string $method, PDO $pdo): void {
    if($route==='/v97/student-ui'&&$method==='GET'){
        academy_json(['ok'=>true,'hidden'=>academy_v97_hidden()]);
    }
    if($route==='/v97/admin/student-ui'&&$method==='GET'){
        $user=academy_current_user(true);
        if(!academy_v60_is_owner($user))academy_json(['ok'=>false,'error'=>'forbidden'],403);
        academy_json(['ok'=>true,'hidden'=>academy_v97_hidden(),'available'=>ACADEMY_V97_ITEMS]);
    }
    if($route==='/v97/admin/student-ui'&&$method==='PUT'){
        $user=academy_current_user(true);
        if(!academy_v60_is_owner($user))academy_json(['ok'=>false,'error'=>'forbidden'],403);
        academy_rate_limit('v97:visibility:'.$user['id'],30,60);
        $body=academy_body();$hidden=$body['hidden']??null;
        if(!is_array($hidden)||!array_is_list($hidden)||count($hidden)>count(ACADEMY_V97_ITEMS))academy_json(['ok'=>false,'error'=>'invalid_hidden_list'],422);
        foreach($hidden as $key){
            if(!is_string($key)||!in_array($key,ACADEMY_V97_ITEMS,true))academy_json(['ok'=>false,'error'=>'invalid_visibility_item'],422);
        }
        $hidden=array_values(array_unique($hidden));
        academy_write_node('v97StudentUi/hidden',$hidden,$user['id']);
        academy_audit($user['id'],'v97.student_ui.visibility','v97StudentUi',['hidden'=>$hidden]);
        academy_json(['ok'=>true,'hidden'=>$hidden]);
    }
}
