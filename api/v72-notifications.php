<?php
declare(strict_types=1);
/** EGTAZ V72 — signed-in, role-scoped in-app activity inbox; no schema migration.
 * Alerts are derived from approved/owned records at read time. No background delivery.
 */
function academy_v72_event(string $kind,string $id,string $state,int $at,string $title,string $body,string $view,string $category): array {
    $key=hash('sha256',$kind.'|'.$id.'|'.$state.'|'.$at);
    return ['key'=>$key,'category'=>$category,'title'=>mb_substr($title,0,160),'body'=>mb_substr($body,0,300),
      'view'=>$view,'createdAt'=>$at,'kind'=>$kind];
}
function academy_v72_recent(int $date,int $days=45): bool {
    return $date>0&&$date>=academy_now_ms()-$days*86400000&&$date<=academy_now_ms()+86400000;
}
function academy_v72_assignment_target(array $a,array $profile,string $sid): bool {
    if(!academy_scope_matches($a,$profile))return false;
    $mode=(string)($a['targetMode']??'stage');
    if($mode==='group')return academy_v534_assignment_group_allowed($a,$profile,$sid);
    if($mode==='students')return is_array($a['targetStudentIds']??null)&&in_array($sid,$a['targetStudentIds'],true);
    return in_array($mode,['stage','all',''],true);
}
function academy_v72_bulletins(string $role): array {
    $root=academy_read_node('v72Bulletins');$events=[];$now=academy_now_ms();
    if(!is_array($root))return [];
    $scanned=0;
    foreach($root as $id=>$r){
        if(++$scanned>1500)break;
        if(!is_array($r)||!preg_match('/^[a-f0-9]{24}$/D',(string)$id)||($r['status']??'active')!=='active')continue;
        if(($r['role']??'')!==$role&&($r['role']??'')!=='all')continue;
        $created=(int)($r['createdAt']??0);$until=(int)($r['expiresAt']??0);
        if(!academy_v72_recent($created,30)||$until<$now)continue;
        $events[]=academy_v72_event('bulletin',(string)$id,'live',$created,
           (string)($r['title']??'إعلان الأكاديمية'),(string)($r['message']??''),'v72-center','announcement');
    }
    return $events;
}
function academy_v72_activity(PDO $pdo,string $uid,string $role): array {
    $events=academy_v72_bulletins($role);$now=academy_now_ms();
    if($role==='student'){
        $p=academy_read_node('studentProfilesV3/'.$uid);
        if(is_array($p)){
            $all=academy_read_node('assignments');$candidates=[];$seen=0;
            if(is_array($all))foreach($all as $id=>$a){
                if(++$seen>12000)break;
                if(!is_array($a)||!is_string($id)||!preg_match('/^[a-zA-Z0-9_-]{6,100}$/D',$id))continue;
                if(($a['status']??'')!=='published'||!empty($a['isHidden']))continue;
                $created=(int)($a['createdAt']??0);$updated=(int)($a['updatedAt']??0);
                if(!academy_v72_recent($created)&&!academy_v72_recent($updated))continue;
                $a['id']=$id;$candidates[$id]=$a;
            }
            uasort($candidates,static fn($a,$b)=>(int)($b['createdAt']??0)<=>(int)($a['createdAt']??0));
            foreach(array_slice($candidates,0,70,true) as $id=>$a){
                if(!academy_v72_assignment_target($a,$p,$uid))continue;
                $title=mb_substr((string)($a['title']??'واجب'),0,110);$created=(int)($a['createdAt']??0);
                if(academy_v72_recent($created))$events[]=academy_v72_event('assignment',$id,'published',$created,
                    'واجب متاح: '.$title,'افتح صفحة الواجبات لمعرفة موعد التسليم.','student-assignments','assignment');
                $sub=academy_read_node('assignmentSubmissions/'.$id.'/'.$uid);
                if(is_array($sub)&&($sub['status']??'')==='graded'&&is_numeric($sub['score']??null)){
                    $time=(int)($sub['gradedAt']??$sub['updatedAt']??$sub['submittedAt']??0);
                    if(academy_v72_recent($time))$events[]=academy_v72_event('graded',$id,'graded',$time,
                        'تم تصحيح واجبك: '.$title,'درجتك متاحة الآن في صفحة الواجبات.','v69-student','grade');
                }
            }
            $index=academy_read_node('studentFollowupParentIndexV68/'.$uid);
            if(is_array($index)){arsort($index,SORT_NUMERIC);$j=0;
                foreach(array_keys($index) as $nid){
                    if(++$j>35)break;
                    if(!preg_match('/^[a-f0-9]{24}$/D',(string)$nid))continue;
                    $note=academy_read_node('studentFollowupsV68/'.$nid);
                    if(!is_array($note)||($note['studentId']??'')!==$uid||($note['status']??'')!=='approved'||($note['visibility']??'')!=='parent')continue;
                    $time=(int)($note['reviewedAt']??0);if(!academy_v72_recent($time))continue;
                    $events[]=academy_v72_event('followup',(string)$nid,'approved',$time,
                        'تقرير تعليمي معتمد','لديك تقرير متابعة جديد معتمد من الأكاديمية.','v69-student','followup');
                }
            }
        }
    }elseif($role==='parent'){
        $links=academy_read_node('parentLinksV4/'.$uid);
        if(is_array($links)){
            $i=0;
            foreach($links as $sid=>$link){
                if(++$i>25)break;
                if(!is_array($link)||($link['studentId']??'')!==$sid||!preg_match('/^[0-9a-f-]{36}$/D',(string)$sid))continue;
                if(!academy_v68_is_linked_parent($uid,(string)$sid))continue;
                $index=academy_read_node('studentFollowupParentIndexV68/'.$sid);
                if(!is_array($index))continue;
                arsort($index,SORT_NUMERIC);$j=0;
                foreach(array_keys($index) as $nid){
                    if(++$j>35)break;
                    if(!preg_match('/^[a-f0-9]{24}$/D',(string)$nid))continue;
                    $note=academy_read_node('studentFollowupsV68/'.$nid);
                    if(!is_array($note)||($note['studentId']??'')!==$sid||($note['status']??'')!=='approved'||($note['visibility']??'')!=='parent')continue;
                    $time=(int)($note['reviewedAt']??0);
                    if(!academy_v72_recent($time))continue;
                    $events[]=academy_v72_event('followup',(string)$nid,'approved',$time,
                        'تقرير جديد من '.(string)($note['teacherName']??'المعلم'),
                        'تم اعتماد تقرير تعليمي لأحد أبنائك، ويمكنك قراءته في لوحة المتابعة.','v68-parent','followup');
                }
            }
        }
    }elseif($role==='teacher'){
        if(!academy_teacher_is_active_profile($uid))academy_json(['ok'=>false,'error'=>'teacher_unavailable'],403);
        $all=academy_read_node('assignments');$seen=0;
        if(is_array($all))foreach($all as $id=>$a){
            if(++$seen>10000)break;
            if(!is_array($a)||($a['teacherId']??'')!==$uid||!in_array(($a['status']??''),['published','rejected'],true))continue;
            $time=(int)($a['updatedAt']??$a['createdAt']??0);if(!academy_v72_recent($time))continue;
            $status=(string)$a['status'];
            $events[]=academy_v72_event('assignment-review',(string)$id,$status,$time,
                $status==='published'?'تم اعتماد واجب':'تم رفض واجب',
                (string)($a['title']??'واجب').' — راجع مركز الواجبات للتفاصيل.','v67-assignments','approval');
        }
        // Reviewed follow-ups: indexed by teacher and student; bounded for predictable cost.
        $notes=academy_read_node('studentFollowupTeacherIndexV68/'.$uid);$scan=0;
        if(is_array($notes))foreach($notes as $sid=>$idx){
            if(!is_array($idx))continue;
            foreach($idx as $nid=>$t){
                if(++$scan>500)break 2;
                if(!preg_match('/^[a-f0-9]{24}$/D',(string)$nid))continue;
                $note=academy_read_node('studentFollowupsV68/'.$nid);
                if(!is_array($note)||($note['teacherId']??'')!==$uid||!in_array(($note['status']??''),['approved','rejected','revoked'],true))continue;
                $time=(int)($note['reviewedAt']??0);if(!academy_v72_recent($time))continue;
                $status=(string)$note['status'];
                $events[]=academy_v72_event('note-review',(string)$nid,$status,$time,
                    $status==='approved'?'تم اعتماد تقرير المتابعة':'تغيرت حالة تقرير المتابعة',
                    'راجع تقارير متابعة طلابك لمعرفة الحالة.','v68-teacher','approval');
            }
        }
    }elseif($role==='admin'){
        $all=academy_read_node('assignments');$scan=0;
        if(is_array($all))foreach($all as $id=>$a){
            if(++$scan>12000)break;
            if(!is_array($a)||($a['status']??'')!=='pending')continue;
            $time=(int)($a['createdAt']??0);if(!academy_v72_recent($time))continue;
            $events[]=academy_v72_event('assignment-review',(string)$id,'pending',$time,
                'واجب ينتظر المراجعة',(string)($a['title']??'واجب').' — افتح مراجعات الواجبات.','assignment-review','approval');
        }
        // Limit to recent pending notes; only the admin may retrieve this queue.
        $st=$pdo->query("SELECT path FROM academy_data WHERE path LIKE 'studentFollowupsV68/%/status' AND value_json='\"pending\"' ORDER BY updated_at DESC LIMIT 80");
        foreach($st->fetchAll(PDO::FETCH_COLUMN) as $path){
            if(!preg_match('~^studentFollowupsV68/([a-f0-9]{24})/status$~D',(string)$path,$m))continue;
            $n=academy_read_node('studentFollowupsV68/'.$m[1]);
            if(!is_array($n)||($n['status']??'')!=='pending')continue;
            $time=(int)($n['createdAt']??0);if(!academy_v72_recent($time))continue;
            $events[]=academy_v72_event('note-review',$m[1],'pending',$time,
                'تقرير معلم ينتظر الاعتماد','راجع تقرير متابعة الطالب قبل إتاحته لولي الأمر.','v68-admin','approval');
        }
    }
    $unique=[];
    foreach($events as $event)$unique[$event['key']]=$event;
    $rows=array_values($unique);usort($rows,static fn($a,$b)=>$b['createdAt']<=>$a['createdAt']);
    return array_slice($rows,0,50);
}
function academy_v72_route(string $route,string $method,PDO $pdo): void {
    if(!str_starts_with($route,'/v72/'))return;
    $u=academy_current_user(true);$uid=(string)$u['id'];$role=(string)$u['primary_role'];
    if(!in_array($role,['admin','teacher','student','parent'],true))academy_json(['ok'=>false,'error'=>'forbidden'],403);
    if($role==='parent'&&academy_v60_staff_record($uid)!==null)academy_json(['ok'=>false,'error'=>'forbidden'],403);
    if($role==='student'&&academy_v50_force_reset_required($uid))academy_json(['ok'=>false,'error'=>'password_change_required'],403);
    academy_rate_limit('v72-'.$uid,180,3600);
    if($route==='/v72/inbox'&&$method==='GET'){
        $events=academy_v72_activity($pdo,$uid,$role);
        $reads=academy_read_node('v72Read/'.$uid);if(!is_array($reads))$reads=[];
        foreach($events as &$event)$event['read']=isset($reads[$event['key']]);unset($event);
        academy_json(['ok'=>true,'items'=>$events,'unread'=>count(array_filter($events,static fn($x)=>!$x['read'])),
            'role'=>$role,'generatedAt'=>academy_now_ms(),
            'note'=>'مركز داخل المنصة؛ الأحداث مستخرجة عند الفتح من أحدث السجلات المسموح بها. لا يرسل بريدًا أو واتساب أو تنبيهات فورية. يعرض آخر 50 حدثًا مؤهلًا فقط.']);
    }
    if($route==='/v72/read'&&$method==='POST'){
        $b=academy_body();$keys=$b['keys']??[];
        if(!is_array($keys)||count($keys)<1||count($keys)>50)academy_json(['ok'=>false,'error'=>'invalid_keys'],422);
        $valid=[];foreach($keys as $key){if(!is_string($key)||!preg_match('/^[a-f0-9]{64}$/D',$key))academy_json(['ok'=>false,'error'=>'invalid_key'],422);$valid[$key]=true;}
        $visible=academy_v72_activity($pdo,$uid,$role);$allowed=array_fill_keys(array_column($visible,'key'),true);
        foreach(array_keys($valid) as $key)if(!isset($allowed[$key]))academy_json(['ok'=>false,'error'=>'notice_unavailable'],403);
        $now=academy_now_ms();$paths=[];foreach(array_keys($valid) as $key)$paths[]='v72Read/'.$uid.'/'.$key;
        $locks=academy_acquire_data_locks($pdo,$paths);
        try{$pdo->beginTransaction();try{
            foreach($paths as $p){academy_delete_node_raw($pdo,$p);academy_insert_value_raw($pdo,$p,$now,$uid);}
            $pdo->commit();
        }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}}finally{academy_release_data_locks($pdo,$locks);}
        academy_json(['ok'=>true,'marked'=>count($valid)]);
    }
    if($route==='/v72/admin/bulletins'&&$method==='GET'){
        if($role!=='admin')academy_json(['ok'=>false,'error'=>'forbidden'],403);
        $all=academy_read_node('v72Bulletins');$rows=[];
        if(is_array($all))foreach($all as $id=>$r){
            if(!is_array($r)||!preg_match('/^[a-f0-9]{24}$/D',(string)$id))continue;
            if(!academy_v72_recent((int)($r['createdAt']??0),30))continue;
            $rows[]=['id'=>(string)$id,'title'=>mb_substr((string)($r['title']??''),0,120),
               'role'=>(string)($r['role']??''),'status'=>(string)($r['status']??'active'),
               'createdAt'=>(int)($r['createdAt']??0)];
        }
        usort($rows,static fn($a,$b)=>$b['createdAt']<=>$a['createdAt']);
        academy_json(['ok'=>true,'items'=>array_slice($rows,0,20)]);
    }
    if($route==='/v72/admin/revoke'&&$method==='POST'){
        if($role!=='admin')academy_json(['ok'=>false,'error'=>'forbidden'],403);
        academy_rate_limit('v72-revoke-'.$uid,20,3600);
        $b=academy_body();$id=(string)($b['id']??'');
        if(!preg_match('/^[a-f0-9]{24}$/D',$id))academy_json(['ok'=>false,'error'=>'invalid_bulletin_id'],422);
        $record=academy_read_node('v72Bulletins/'.$id);
        if(!is_array($record))academy_json(['ok'=>false,'error'=>'bulletin_not_found'],404);
        if(($record['status']??'active')!=='active')academy_json(['ok'=>false,'error'=>'already_revoked'],409);
        $record['status']='revoked';$record['revokedAt']=academy_now_ms();$record['revokedBy']=$uid;
        academy_write_node('v72Bulletins/'.$id,$record,$uid);
        academy_audit($uid,'v72.bulletin.revoke',$id);
        academy_json(['ok'=>true,'status'=>'revoked']);
    }
    if($route==='/v72/admin/bulletin'&&$method==='POST'){
        if($role!=='admin')academy_json(['ok'=>false,'error'=>'forbidden'],403);
        academy_rate_limit('v72-bulletin-'.$uid,8,3600);$b=academy_body();
        $target=(string)($b['role']??'');$title=trim((string)($b['title']??''));$message=trim((string)($b['message']??''));
        if(!in_array($target,['all','student','teacher','parent'],true)||mb_strlen($title)<5||mb_strlen($title)>120||mb_strlen($message)<10||mb_strlen($message)>1000)
            academy_json(['ok'=>false,'error'=>'invalid_bulletin'],422);
        $id=bin2hex(random_bytes(12));$now=academy_now_ms();
        academy_write_node('v72Bulletins/'.$id,['title'=>$title,'message'=>$message,'role'=>$target,'createdBy'=>$uid,
            'createdAt'=>$now,'expiresAt'=>$now+30*86400000,'status'=>'active'],$uid);
        academy_audit($uid,'v72.bulletin.create',$id,['audience'=>$target]);
        academy_json(['ok'=>true,'id'=>$id,'expiresAt'=>$now+30*86400000],201);
    }
    academy_json(['ok'=>false,'error'=>'route_not_found'],404);
}
