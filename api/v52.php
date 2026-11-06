<?php
/** V52: validated public-facing visual configuration, admin-owned, additive academy_data storage. */
declare(strict_types=1);
function academy_v52_defaults(): array {
 return ['preset'=>'v20','defaultMode'=>'light','primaryColor'=>'#315cf4','accentColor'=>'#7055ed','cards'=>'soft','socialPlacement'=>'all','socialAlign'=>'center','socialOrder'=>['whatsapp','facebook','telegram','youtube','tiktok'],'motion'=>true,'revision'=>0];
}
function academy_v52_validate(array $body): array {
 $defaults=academy_v52_defaults();$out=[];
 foreach(['preset'=>['v20','academic','modern','minimal','vivid','rose','night'],'defaultMode'=>['light','dark'],'cards'=>['soft','flat','glass'],'socialPlacement'=>['all','header','footer','sidebar','hidden'],'socialAlign'=>['start','center','end']] as $key=>$options){
  $value=$body[$key]??$defaults[$key];if(!is_string($value)||!in_array($value,$options,true))throw new InvalidArgumentException('v52_invalid_'.$key);$out[$key]=$value;
 }
 foreach(['primaryColor','accentColor'] as $key){$color=$body[$key]??$defaults[$key];if(!is_string($color)||!preg_match('/^#[0-9a-f]{6}$/Di',$color))throw new InvalidArgumentException('v52_invalid_'.$key);$out[$key]=strtolower($color);}
 $order=$body['socialOrder']??$defaults['socialOrder'];$expected=['whatsapp','facebook','telegram','youtube','tiktok'];
 if(!is_array($order)||!array_is_list($order)||count($order)!==5||count(array_filter($order,'is_string'))!==5||count(array_unique($order))!==5||array_diff($order,$expected)||array_diff($expected,$order))throw new InvalidArgumentException('v52_invalid_social_order');
 $out['socialOrder']=$order;
 $motion=$body['motion']??true;if(!is_bool($motion))throw new InvalidArgumentException('v52_invalid_motion');$out['motion']=$motion;
 return $out;
}
function academy_v52_route(string $route,string $method,PDO $pdo): void {
 if(!str_starts_with($route,'/v52/'))return;
 if($route==='/v52/design'&&$method==='GET'){
  $current=academy_read_node('settings/appearanceV52');$safe=is_array($current)?array_intersect_key($current,academy_v52_defaults()):[];
  academy_json(['ok'=>true,'design'=>array_merge(academy_v52_defaults(),$safe)]);
 }
 if($route==='/v52/admin/design'&&$method==='POST'){
  $user=academy_current_user(true);if(($user['primary_role']??'')!=='admin')academy_json(['ok'=>false,'error'=>'forbidden'],403);
  $body=academy_body();try{$clean=academy_v52_validate($body);}catch(InvalidArgumentException $e){academy_json(['ok'=>false,'error'=>$e->getMessage()],422);}
  $expected=filter_var($body['revision']??null,FILTER_VALIDATE_INT);if($expected===false||$expected<0)academy_json(['ok'=>false,'error'=>'v52_revision_required'],422);
  $path='settings/appearanceV52';$locks=academy_acquire_data_locks($pdo,[$path]);
  try{$current=academy_read_node($path);$current=is_array($current)?$current:[];$rev=max(0,(int)($current['revision']??0));
   if($expected!==$rev)academy_json(['ok'=>false,'error'=>'v52_revision_conflict','currentRevision'=>$rev],409);
   $clean['revision']=$rev+1;$clean['updatedAt']=academy_now_ms();$clean['updatedBy']=$user['id'];
   $pdo->beginTransaction();try{academy_delete_node_raw($pdo,$path);academy_insert_value_raw($pdo,$path,$clean,$user['id']);$pdo->commit();}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
  }finally{academy_release_data_locks($pdo,$locks);}
  academy_audit($user['id'],'v52.design.update','settings/appearanceV52',['revision'=>$clean['revision'],'preset'=>$clean['preset'],'defaultMode'=>$clean['defaultMode']]);
  academy_json(['ok'=>true,'design'=>$clean]);
 }
 academy_json(['ok'=>false,'error'=>'not_found'],404);
}
