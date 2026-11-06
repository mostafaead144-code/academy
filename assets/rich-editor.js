(()=>{
'use strict';
const instances=new Map();
const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const plainToHtml=(text='')=>esc(text).split(/\n{2,}/).map(p=>'<p>'+p.replace(/\n/g,'<br>')+'</p>').join('');
const legacyToHtml=(text='')=>{
 let s=esc(text).replace(/^###\s+(.+)$/gm,'<h4>$1</h4>').replace(/^##\s+(.+)$/gm,'<h3>$1</h3>').replace(/^#\s+(.+)$/gm,'<h2>$1</h2>').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/^[-•]\s+(.+)$/gm,'<li>$1</li>');
 s=s.replace(/(?:<li>[\s\S]*?<\/li>\s*)+/g,m=>'<ul>'+m+'</ul>');
 return s.split(/\n{2,}/).map(b=>{b=b.trim();if(!b)return'';if(/^<(h\d|ul|ol|blockquote|figure)/.test(b))return b;return'<p>'+b.replace(/\n/g,'<br>')+'</p>'}).join('');
};
const icon={bold:'fa-bold',italic:'fa-italic',underline:'fa-underline',strikeThrough:'fa-strikethrough',justifyRight:'fa-align-right',justifyCenter:'fa-align-center',justifyLeft:'fa-align-left',insertUnorderedList:'fa-list-ul',insertOrderedList:'fa-list-ol',undo:'fa-rotate-left',redo:'fa-rotate-right',removeFormat:'fa-eraser'};
function createButton(cmd,title){
 return '<button type="button" class="rte-btn" data-rte-cmd="'+cmd+'" title="'+title+'" aria-label="'+title+'"><i class="fa-solid '+icon[cmd]+'"></i></button>';
}
class RichLessonEditor{
 constructor(textarea,opts={}){
  this.textarea=textarea;this.opts=opts;this.savedRange=null;
  this.wrap=document.createElement('div');this.wrap.className='rich-lesson-editor';this.wrap.dir='rtl';
  this.wrap.innerHTML=
   '<div class="rte-topline"><div><strong><i class="fa-solid fa-wand-magic-sparkles"></i> محرر الشرح الاحترافي</strong><small>نسّق الشرح وأدرج الصور في المكان المطلوب داخل الدرس</small></div><span class="rte-save-state"><i class="fa-solid fa-circle-check"></i> جاهز</span></div>'+
   '<div class="rte-toolbar" role="toolbar" aria-label="أدوات تنسيق شرح الدرس">'+
    '<div class="rte-tool-group"><select class="rte-format" title="نوع النص" aria-label="نوع النص"><option value="p">نص عادي</option><option value="h2">عنوان رئيسي</option><option value="h3">عنوان فرعي</option><option value="h4">عنوان صغير</option><option value="blockquote">اقتباس / تنبيه</option></select></div>'+
    '<div class="rte-tool-group">'+createButton('bold','عريض')+createButton('italic','مائل')+createButton('underline','تحته خط')+createButton('strikeThrough','يتوسطه خط')+'</div>'+
    '<div class="rte-tool-group">'+createButton('justifyRight','محاذاة يمين')+createButton('justifyCenter','توسيط')+createButton('justifyLeft','محاذاة يسار')+'</div>'+
    '<div class="rte-tool-group">'+createButton('insertUnorderedList','قائمة نقطية')+createButton('insertOrderedList','قائمة مرقمة')+'</div>'+
    '<div class="rte-tool-group rte-color-group"><label title="لون النص"><i class="fa-solid fa-palette"></i><input class="rte-color" type="color" value="#0f172a" aria-label="لون النص"></label><label title="تمييز النص"><i class="fa-solid fa-highlighter"></i><input class="rte-highlight" type="color" value="#fff3a3" aria-label="لون التمييز"></label></div>'+
    '<div class="rte-tool-group"><button type="button" class="rte-btn rte-link" title="إضافة رابط"><i class="fa-solid fa-link"></i></button><button type="button" class="rte-btn rte-image" title="إدراج صورة داخل الشرح"><i class="fa-regular fa-image"></i><span>صورة</span></button><button type="button" class="rte-btn rte-hr" title="فاصل"><i class="fa-solid fa-minus"></i></button></div>'+
    '<div class="rte-tool-group">'+createButton('undo','تراجع')+createButton('redo','إعادة')+createButton('removeFormat','مسح التنسيق')+'</div>'+
   '</div>'+
   '<div class="rte-image-panel hidden"><div class="rte-image-panel-head"><div><strong><i class="fa-regular fa-image"></i> إدراج صورة داخل الشرح</strong><small>ستظهر الصورة في موضع المؤشر الحالي داخل المقال</small></div><button type="button" class="rte-image-close" aria-label="إغلاق"><i class="fa-solid fa-xmark"></i></button></div><div class="rte-image-fields"><label><span>رابط الصورة</span><input class="rte-image-url" type="url" dir="ltr" placeholder="https://example.com/image.jpg"></label><label><span>وصف الصورة</span><input class="rte-image-alt" type="text" maxlength="180" placeholder="مثال: مخطط يوضح أجزاء الجملة"></label><label><span>حجم الصورة</span><select class="rte-image-size"><option value="wide">عريضة</option><option value="medium">متوسطة</option><option value="small">صغيرة</option></select></label></div><div class="rte-image-actions"><button type="button" class="btn btn-soft rte-image-cancel">إلغاء</button><button type="button" class="btn btn-primary rte-image-insert"><i class="fa-solid fa-plus"></i> إدراج في الشرح</button></div><p class="rte-image-error hidden"></p></div>'+
   '<div class="rte-canvas" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="'+esc(opts.placeholder||'ابدأ كتابة شرح الدرس هنا...')+'"></div>'+
   '<div class="rte-status"><span><i class="fa-regular fa-file-lines"></i> <b class="rte-words">0</b> كلمة</span><span><i class="fa-solid fa-text-width"></i> <b class="rte-chars">0</b> حرف</span><span class="rte-tip"><i class="fa-solid fa-lightbulb"></i> يمكنك وضع الصورة بين فقرتين بالضغط على «صورة»</span></div>';
  textarea.classList.add('rte-source');textarea.setAttribute('aria-hidden','true');textarea.tabIndex=-1;
  textarea.insertAdjacentElement('afterend',this.wrap);
  this.canvas=this.wrap.querySelector('.rte-canvas');this.panel=this.wrap.querySelector('.rte-image-panel');
  this.bind();this.setContent(textarea.value,textarea.dataset.contentFormat||'auto');
 }
 bind(){
  this.wrap.querySelectorAll('[data-rte-cmd]').forEach(btn=>{
   btn.addEventListener('mousedown',e=>e.preventDefault());
   btn.addEventListener('click',()=>{this.restoreSelection();document.execCommand(btn.dataset.rteCmd,false,null);this.canvas.focus();this.sync()});
  });
  this.wrap.querySelector('.rte-format').addEventListener('change',e=>{this.restoreSelection();document.execCommand('formatBlock',false,e.target.value);this.canvas.focus();this.sync()});
  this.wrap.querySelector('.rte-color').addEventListener('input',e=>{this.restoreSelection();document.execCommand('foreColor',false,e.target.value);this.canvas.focus();this.sync()});
  this.wrap.querySelector('.rte-highlight').addEventListener('input',e=>{this.restoreSelection();document.execCommand('hiliteColor',false,e.target.value);this.canvas.focus();this.sync()});
  this.wrap.querySelector('.rte-link').addEventListener('mousedown',()=>this.saveSelection());
  this.wrap.querySelector('.rte-link').addEventListener('click',()=>{
   const raw=window.prompt('اكتب رابط الصفحة:','https://');if(!raw)return;const url=window.AcademyUtils?.safeUrl(raw)||'';
   if(!url||url==='#')return this.flash('الرابط غير صالح');
   this.restoreSelection();document.execCommand('createLink',false,url);this.canvas.querySelectorAll('a').forEach(a=>{a.target='_blank';a.rel='noopener noreferrer'});this.sync();
  });
  this.wrap.querySelector('.rte-image').addEventListener('mousedown',()=>this.saveSelection());
  this.wrap.querySelector('.rte-image').addEventListener('click',()=>{this.panel.classList.remove('hidden');this.wrap.querySelector('.rte-image-url').focus()});
  this.wrap.querySelector('.rte-image-close').onclick=this.wrap.querySelector('.rte-image-cancel').onclick=()=>this.panel.classList.add('hidden');
  this.wrap.querySelector('.rte-image-insert').onclick=()=>this.insertImage();
  this.wrap.querySelector('.rte-hr').onclick=()=>{this.restoreSelection();document.execCommand('insertHorizontalRule');this.sync()};
  this.canvas.addEventListener('keyup',()=>this.saveSelection());this.canvas.addEventListener('mouseup',()=>this.saveSelection());
  this.canvas.addEventListener('input',()=>{this.saveSelection();this.sync()});
  this.canvas.addEventListener('paste',e=>{
   e.preventDefault();const html=e.clipboardData?.getData('text/html'),text=e.clipboardData?.getData('text/plain')||'';
   const clean=html&&window.AcademyUtils?.sanitizeRichHtml?window.AcademyUtils.sanitizeRichHtml(html):plainToHtml(text);
   document.execCommand('insertHTML',false,clean);this.sync();
  });
  this.canvas.addEventListener('click',e=>{
   const img=e.target.closest('figure.rte-inline-image');if(!img)return;
   this.canvas.querySelectorAll('.rte-inline-image.selected').forEach(x=>x.classList.remove('selected'));img.classList.add('selected');
  });
  this.canvas.addEventListener('keydown',e=>{
   if((e.key==='Backspace'||e.key==='Delete')&&this.canvas.querySelector('.rte-inline-image.selected')){e.preventDefault();this.canvas.querySelector('.rte-inline-image.selected').remove();this.sync()}
  });
 }
 saveSelection(){const s=window.getSelection();if(s&&s.rangeCount&&this.canvas.contains(s.anchorNode))this.savedRange=s.getRangeAt(0).cloneRange()}
 restoreSelection(){this.canvas.focus();if(!this.savedRange)return;const s=window.getSelection();s.removeAllRanges();s.addRange(this.savedRange)}
 insertImage(){
  const input=this.wrap.querySelector('.rte-image-url'),alt=this.wrap.querySelector('.rte-image-alt'),size=this.wrap.querySelector('.rte-image-size'),err=this.wrap.querySelector('.rte-image-error');
  const raw=input.value.trim(),url=window.AcademyUtils?.safeUrl(raw)||'';
  if(!url||url==='#'){err.textContent='أدخل رابط صورة صحيحًا يبدأ بـ https://';err.classList.remove('hidden');return}
  err.classList.add('hidden');this.restoreSelection();
  const figure='<figure class="rte-inline-image rte-image-'+size.value+'" contenteditable="false"><img src="'+esc(url)+'" alt="'+esc(alt.value.trim())+'" loading="lazy">'+(alt.value.trim()?'<figcaption>'+esc(alt.value.trim())+'</figcaption>':'')+'<button type="button" class="rte-inline-remove" tabindex="-1" aria-label="حذف الصورة">×</button></figure><p><br></p>';
  document.execCommand('insertHTML',false,figure);
  this.canvas.querySelectorAll('.rte-inline-remove').forEach(b=>b.onclick=()=>{b.closest('figure')?.remove();this.sync()});
  input.value='';alt.value='';this.panel.classList.add('hidden');this.sync();this.canvas.focus();
 }
 attachImageButtons(){this.canvas.querySelectorAll('figure.rte-inline-image').forEach(fig=>{fig.setAttribute('contenteditable','false');let b=fig.querySelector('.rte-inline-remove');if(!b){b=document.createElement('button');b.type='button';b.className='rte-inline-remove';b.tabIndex=-1;b.setAttribute('aria-label','حذف الصورة');b.textContent='×';fig.appendChild(b)}b.onclick=()=>{fig.remove();this.sync()}})}
 getHTML(){const clone=this.canvas.cloneNode(true);clone.querySelectorAll('.rte-inline-remove').forEach(x=>x.remove());clone.querySelectorAll('.selected').forEach(x=>x.classList.remove('selected'));return window.AcademyUtils?.sanitizeRichHtml?window.AcademyUtils.sanitizeRichHtml(clone.innerHTML):clone.innerHTML}
 setContent(value='',format='auto'){
  const raw=String(value||''),looksHtml=/<(?:p|h[1-6]|ul|ol|li|blockquote|figure|img|strong|em|div|br|span|a)\b/i.test(raw);
  this.canvas.innerHTML=(format==='html'||(format==='auto'&&looksHtml))?(window.AcademyUtils?.sanitizeRichHtml?window.AcademyUtils.sanitizeRichHtml(raw):raw):legacyToHtml(raw);
  this.attachImageButtons();this.sync();
 }
 clear(){this.canvas.innerHTML='';this.sync()}
 sync(){
  const html=this.getHTML();this.textarea.value=html;this.textarea.dataset.contentFormat='html';
  const text=this.canvas.textContent.replace(/\s+/g,' ').trim();this.wrap.querySelector('.rte-words').textContent=text?text.split(' ').length:0;this.wrap.querySelector('.rte-chars').textContent=text.length;
  this.textarea.dispatchEvent(new Event('input',{bubbles:true}));
 }
 flash(message){const state=this.wrap.querySelector('.rte-save-state');state.innerHTML='<i class="fa-solid fa-triangle-exclamation"></i> '+esc(message);state.classList.add('error');setTimeout(()=>{state.innerHTML='<i class="fa-solid fa-circle-check"></i> جاهز';state.classList.remove('error')},2200)}
}
function init(target,opts={}){
 const textarea=typeof target==='string'?document.getElementById(target):target;if(!textarea)return null;
 if(instances.has(textarea.id))return instances.get(textarea.id);
 const editor=new RichLessonEditor(textarea,opts);instances.set(textarea.id,editor);return editor;
}
window.AcademyRichEditor={init,get:id=>instances.get(id)||null,instances};
})();