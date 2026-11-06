(() => {
  'use strict';
  const body = document.body;
  const $ = id => document.getElementById(id);
  let studentProfile = null;
  const guidance = {
    primary: {default:'ابدأ بخطوة واحدة: اختر مادّتك، ثم درسًا، وبعده جرّب التدريب.',simulations:'اقرأ السؤال بهدوء. يمكنك التنقّل بين الأسئلة قبل إنهاء المحاكاة.', 'smart-review':'راجع سؤالًا في كل مرة، واقرأ الإجابة الصحيحة لتتذكّرها.',planner:'اختر مهمة صغيرة لليوم، وضع علامة عند الانتهاء منها.'},
    prep: {default:'تابع آخر درس، ثم راجع أخطاءك وحدّد المهمة التالية.',simulations:'اختبر استعدادك، ثم استخدم النتيجة لتحديد المواد التي تحتاج مراجعة.'},
    sec: {default:'نظّم وقتك بين الشرح والتدريب والمراجعة، وتابع تقدّمك في كل مادة.',simulations:'تدرّب بوقت محدد، وراجع أداءك بعد كل محاولة.'}
  };
  function applyStudentProfile() {
    if (!studentProfile || body.dataset.academyRole !== 'student') return;
    body.dataset.studentStage = studentProfile.stage || '';
    body.dataset.educationType = studentProfile.educationType || 'public';
    const host = document.querySelector('.feature-hero-copy,.feature-hero-card>div:first-child,.smart-review-hero>div,.mastery-hero>div,.pro-head>div');
    if (!host || !guidance[studentProfile.stage]) return;
    let guide = $('academyStageGuide');
    if (!guide) { guide = document.createElement('p'); guide.id = 'academyStageGuide'; guide.className = 'suite-stage-guide'; host.appendChild(guide); }
    guide.textContent = guidance[studentProfile.stage][body.dataset.academyPage] || guidance[studentProfile.stage].default;
  }
  window.AcademySuite = {setStudentProfile(profile) { studentProfile = profile; applyStudentProfile(); }};

  function setupNavigation(nav, attribute, primaryKeys) {
    if (!nav || nav.dataset.suiteReady) return;
    nav.dataset.suiteReady = '1';
    const buttons = [...nav.querySelectorAll('button[' + attribute + ']')];
    if (!buttons.length) return;
    nav.removeAttribute('role');
    const primary = document.createElement('div'); primary.className = 'suite-primary-tabs';
    const menu = document.createElement('div'); menu.className = 'suite-sections-menu'; menu.hidden = true;
    menu.id = attribute === 'data-admin-tab' ? 'academyAdminSections' : 'academyTeacherSections';
    const more = document.createElement('button'); more.type = 'button'; more.className = 'suite-sections-toggle';
    more.setAttribute('aria-expanded', 'false'); more.setAttribute('aria-controls', menu.id);
    const label = document.createElement('span'); label.textContent = 'جميع الأقسام';
    more.append(label); const icon = document.createElement('i'); icon.className = 'fa-solid fa-chevron-down'; icon.setAttribute('aria-hidden','true'); more.append(icon);
    nav.querySelectorAll('.admin-nav-label').forEach(el => el.remove());
    buttons.forEach(button => {
      const key = button.getAttribute(attribute);
      button.type = 'button'; button.removeAttribute('role'); button.removeAttribute('aria-selected');
      button.tabIndex = 0; button.setAttribute('aria-pressed', String(button.classList.contains('active')));
      (primaryKeys.includes(key) ? primary : menu).appendChild(button);
    });
    nav.append(primary, more, menu);
    function close(restore) { menu.hidden = true; more.setAttribute('aria-expanded','false'); if (restore) more.focus(); }
    function sync() {
      const selected = menu.querySelector('button.active');
      more.classList.toggle('active', !!selected);
      label.textContent = selected ? selected.textContent.trim().replace(/\s+/g,' ') : 'جميع الأقسام';
      buttons.forEach(button => { const value = String(button.classList.contains('active')); if (button.getAttribute('aria-pressed') !== value) button.setAttribute('aria-pressed', value); });
    }
    more.onclick = () => { const open = menu.hidden; menu.hidden = !open; more.setAttribute('aria-expanded', String(open)); if (open) menu.querySelector('button')?.focus(); };
    menu.addEventListener('click', event => { if (event.target.closest('button[' + attribute + ']')) { sync(); close(true); } });
    primary.addEventListener('click', () => { sync(); close(false); });
    nav.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !menu.hidden) { event.preventDefault(); close(true); }
    });
    document.addEventListener('click', event => { if (!nav.contains(event.target)) close(false); });
    new MutationObserver(sync).observe(nav, {subtree:true,attributes:true,attributeFilter:['class']});
    sync();
  }
  function prepareDialogs() {
    document.querySelectorAll('.admin-modal-backdrop,.teacher-modal-backdrop').forEach(overlay => {
      const panel = overlay.querySelector('.admin-modal,.teacher-modal'); if (!panel) return;
      panel.setAttribute('role','dialog'); panel.setAttribute('aria-modal','true');
      const heading = panel.querySelector('h2,h3');
      if (heading) { heading.id ||= (overlay.id || 'academyDialog') + 'Heading'; panel.setAttribute('aria-labelledby',heading.id); }
      const controls = () => [...panel.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(el => el.getClientRects().length);
      let trigger;
      new MutationObserver(() => {
        if (!overlay.classList.contains('hidden')) { trigger = document.activeElement; requestAnimationFrame(() => controls()[0]?.focus()); }
        else if (trigger?.isConnected) trigger.focus();
      }).observe(overlay,{attributes:true,attributeFilter:['class']});
      panel.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const items = controls(), first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      });
    });
  }
  document.addEventListener('DOMContentLoaded', () => {
    const main = document.querySelector('main');
    if (main) {
      main.id ||= 'academyMainContent'; main.setAttribute('tabindex','-1');
      let skip = document.querySelector('.suite-skip-link,.ui-skip-link');
      if (!skip) { skip = document.createElement('a'); skip.textContent = 'انتقل إلى المحتوى'; body.prepend(skip); }
      skip.classList.add('suite-skip-link'); skip.href = '#' + main.id;
    }
    setupNavigation(document.querySelector('.admin-nav'),'data-admin-tab',['overview','curriculum','lessons','quizzes','students','teachers']);
    setupNavigation(document.querySelector('.teacher-nav'),'data-teacher-tab',['home','content','submit','quizzes','assignments']);
    document.querySelectorAll('.admin-sidebar-footer a,.admin-sidebar-footer button').forEach(el => { const label = el.textContent.trim().replace(/\s+/g,' '); el.title ||= label; el.setAttribute('aria-label', label); });
    ['reviewAvatar','masteryAvatar','subscriptionAvatar'].forEach(id => {
      const avatar = $(id); if (!avatar) return;
      avatar.setAttribute('role','link'); avatar.tabIndex = 0; avatar.setAttribute('aria-label','فتح حسابي');
      avatar.onclick = () => location.href = './profile.html';
      avatar.addEventListener('keydown',event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); avatar.click(); } });
    });
    ['toast','status','resetMessage','reviewFeedback'].forEach(id => { const el = $(id); if (el) { el.setAttribute('role','status'); el.setAttribute('aria-live','polite'); } });
    prepareDialogs(); applyStudentProfile();
  });
})();
