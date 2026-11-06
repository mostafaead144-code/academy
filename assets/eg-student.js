/* Egtaz Academy — student dashboard (eg-student.js)
   Replaces the home screen of the student portal. Read-only: it only calls
   the existing GET endpoints and never writes learning records. */
(() => {
  'use strict';
  const prev = window.EgtazV79 || {};
  const S = { uid: '', name: '', overview: null, roadmap: null, calendar: null, points: null, pending: false, last: 0, nonce: 0, failed: [] };

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SUBJECTS = {
    arabic: 'اللغة العربية', english: 'اللغة الإنجليزية', math: 'الرياضيات', science: 'العلوم', religion: 'التربية الدينية',
    quran: 'القرآن الكريم', social: 'الدراسات الاجتماعية', computer: 'الحاسب الآلي', physics: 'الفيزياء', chemistry: 'الكيمياء',
    biology: 'الأحياء', history: 'التاريخ', geography: 'الجغرافيا', french: 'اللغة الفرنسية', philosophy: 'الفلسفة والمنطق',
    psychology: 'علم النفس', geology: 'الجيولوجيا', fiqh: 'الفقه', hadith: 'الحديث', tafsir: 'التفسير', tawheed: 'التوحيد',
  };
  const STAGES = { primary: 'الابتدائي', prep: 'الإعدادي', sec: 'الثانوي' };
  const ORD = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس'];
  const subjectName = (k) => SUBJECTS[k] || k || 'مادة';
  const GLYPH = { arabic: 'ع', english: 'En', math: '∑', science: '⚗', religion: '☪', quran: '۞', social: '🌍', computer: '</>', physics: 'Φ', chemistry: 'H₂O', biology: '🧬', history: '🏛', geography: '🧭', french: 'Fr', philosophy: '?', psychology: 'Ψ', geology: '⛰' };
  const glyph = (k) => GLYPH[k] || subjectName(k).split(' ').pop().slice(0, 1);
  const TONES = ['indigo', 'emerald', 'amber', 'sky', 'rose', 'violet'];
  const toneOf = (key) => TONES[[...String(key)].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length];

  const P = {
    book: '<path d="M12 7a8 8 0 0 0-9-2v14a8 8 0 0 1 9 2 8 8 0 0 1 9-2V5a8 8 0 0 0-9 2zM12 7v14"/>',
    play: '<path d="M8 5.5v13l10.5-6.5L8 5.5Z" fill="currentColor" stroke="none"/>',
    video: '<rect x="3" y="5" width="13" height="14" rx="3"/><path d="m16 10 5-3v10l-5-3"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    chart: '<path d="M4 20h16M7 16v-5M12 16V7M17 16v-8"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    trophy: '<path d="M8 4.5h8v4a4 4 0 0 1-8 0zM8 6.5H5.5a2.5 2.5 0 0 0 2.6 3.4M16 6.5h2.5a2.5 2.5 0 0 1-2.6 3.4M12 12.5V16M8.5 19.5h7M9.5 16h5v3.5h-5z"/>',
    users: '<path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20a6.5 6.5 0 0 1 13 0M17 11a3 3 0 1 0 0-6M17.5 14.5A5 5 0 0 1 21.5 20"/>',
    arrow: '<path d="M14.5 6 8.5 12l6 6"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    library: '<path d="M5 4h3v16H5zM10 4h3v16h-3zM15.5 4.5l3-.7 3.2 15.5-3 .7z"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>',
    flame: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.4-5.4 3.8-7.6.5 1.7 1.4 2.8 2.6 3.3-.3-3 .8-5.6 3.1-7.5.2 3.1 1.6 4.9 2.9 6.6 1.1 1.4 1.6 2.8 1.6 4.6 0 3.9-3 6.8-7.5 6.8Z"/>',
  };
  const ic = (k, cls = '') => `<svg class="egd-ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[k] || ''}</svg>`;
  const go = (view, label, cls = 'egd-btn', icon = 'arrow') => `<button type="button" class="${cls}" data-action="route" data-view="${esc(view)}">${label}${icon ? ic(icon) : ''}</button>`;

  function token() {
    const app = window.AcademyBackend?.apps?.find((a) => a.name === '[DEFAULT]');
    const a = app?.auth();
    if (!a?.currentUser || a.currentUser.uid !== S.uid || !a._token()) throw Error('session');
    return a._token();
  }
  const req = (path) => window.AcademyBackend.request(path, { token: token() });
  const toDate = (v) => {
    if (!v) return null;
    const d = typeof v === 'number' ? new Date(v) : /\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/.test(String(v)) ? new Date(String(v).replace(' ', 'T') + 'Z') : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const when = (d) => (d ? d.toLocaleString('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }) : 'لم يتحدد الموعد');
  const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'صباح الخير' : h < 18 ? 'نهارك سعيد' : 'مساء الخير'; };
  const today = () => new Date().toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' });

  // ---------- derived data ----------
  const lessons = () => S.roadmap?.catalog?.items || [];
  const student = () => S.overview?.student || {};
  const done = (x) => x?.progress === 'completed';
  function subjects() {
    const map = new Map();
    for (const l of lessons()) {
      const k = l.subject || 'other';
      if (!map.has(k)) map.set(k, { key: k, total: 0, done: 0, next: null });
      const s = map.get(k);
      s.total++;
      if (done(l)) s.done++;
      else if (!s.next) s.next = l;
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }
  function nextLesson() {
    const all = lessons();
    return all.find((x) => x.lastVisited && !done(x)) || all.find((x) => x.lastVisited) || all.find((x) => !done(x)) || null;
  }
  const subjAttrs = (k) => { const st = student(); return `data-action="subject" data-subject="${esc(k)}" data-type="${esc(st.educationType || 'public')}" data-stage="${esc(st.stage || '')}" data-grade="${esc(st.grade || '')}"`; };
  const pendingTasks = () => (S.overview?.assignments?.items || []).filter((x) => x && ['pending', 'overdue'].includes(x.status));
  function upcomingSessions() {
    const now = Date.now();
    return (S.calendar?.sessions || []).filter((x) => x.status === 'published' && toDate(x.endsAt)?.getTime() > now - 20 * 60000)
      .sort((a, b) => toDate(a.startsAt) - toDate(b.startsAt));
  }

  // ---------- views ----------
  function header() {
    const st = student();
    const grade = Number(st.grade || 0);
    const scope = st.stage ? `الصف ${ORD[grade - 1] || grade} ${STAGES[st.stage] || ''}${st.educationType === 'azhar' ? ' · أزهري' : ''}` : '';
    return `<header class="egd-head">
      <div>
        <p class="egd-date">${esc(today())}</p>
        <h1>${greeting()}، ${esc((st.name || S.name || 'يا بطل').split(' ')[0])} <span aria-hidden="true">👋</span></h1>
        <p class="egd-sub">${scope ? `<span class="egd-tag">${esc(scope)}</span>` : ''}يلا نكمّل اللي بدأناه، كل يوم خطوة بتفرق.</p>
      </div>
      <div class="egd-head-actions">
        <button type="button" class="egd-icon-btn" data-egd="refresh" aria-label="تحديث البيانات" title="تحديث البيانات">${ic('refresh', S.pending ? 'egd-spin' : '')}</button>
        ${go('my-subjects', 'كل موادي', 'egd-btn egd-btn-primary', 'book')}
      </div>
    </header>`;
  }

  function stats() {
    const all = lessons();
    const completed = all.filter(done).length;
    const avg = S.overview?.quizzes?.average;
    const tasks = pendingTasks().length;
    const pts = Number(S.points?.points || 0);
    const items = [
      ['star', 'amber', 'نقاطي', pts, 'من التحديات والاختبارات', 'm1-points'],
      ['target', 'emerald', 'متوسط الاختبارات', avg == null ? '—' : `${Math.round(avg)}%`, S.overview?.quizzes?.count ? `${S.overview.quizzes.count} اختبار` : 'لسه ماحلّيتش اختبارات', 'my-results'],
      ['check', 'indigo', 'دروس خلّصتها', `${completed}<small> / ${all.length}</small>`, all.length ? `${Math.round((completed / all.length) * 100)}% من دروس صفك` : 'مفيش دروس منشورة لسه', 'student-progress'],
      ['list', 'rose', 'واجبات مطلوبة', tasks, tasks ? 'محتاجة تتسلّم' : 'مفيش واجبات متأخرة', 'student-assignments'],
    ];
    return `<section class="egd-stats" aria-label="ملخص سريع">${items.map(([i, t, l, v, s, view]) => `<button type="button" class="egd-stat" data-action="route" data-view="${view}"><span class="egd-badge egd-${t}">${ic(i)}</span><span class="egd-stat-body"><span class="egd-stat-label">${l}</span><strong>${v}</strong><small>${s}</small></span></button>`).join('')}</section>`;
  }

  function resume() {
    const l = nextLesson();
    const subs = subjects();
    if (!S.roadmap && S.pending) return `<section class="egd-resume egd-skeleton" aria-busy="true"><div></div></section>`;
    if (!l) {
      return `<section class="egd-resume egd-resume-empty"><div class="egd-resume-copy"><span class="egd-eyebrow">${ic('book')} ابدأ رحلتك</span><h2>${lessons().length ? 'خلّصت كل الدروس المتاحة! 🎉' : 'الدروس هتنزل قريب'}</h2><p>${lessons().length ? 'راجع اللي ذاكرته واختبر نفسك عشان تثبّت المعلومة.' : 'المعلمين بيجهزوا دروس صفك. أول ما تتنشر هتلاقيها هنا على طول.'}</p>${go(lessons().length ? 'my-results' : 'my-subjects', lessons().length ? 'اختبر نفسك' : 'تصفح المواد', 'egd-btn egd-btn-light')}</div></section>`;
    }
    const s = subs.find((x) => x.key === l.subject) || { total: 1, done: 0 };
    const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
    const R = 34, C = 2 * Math.PI * R;
    return `<section class="egd-resume">
      <div class="egd-resume-copy">
        <span class="egd-eyebrow">${ic('play')} ${l.lastVisited ? 'كمّل من حيث وقفت' : 'الدرس اللي عليه الدور'}</span>
        <h2>${esc(l.title || 'درس جديد')}</h2>
        <p class="egd-resume-meta"><span>${esc(subjectName(l.subject))}</span><span>الوحدة ${esc(l.unit || 1)}</span></p>
        <div class="egd-resume-actions">
          <button type="button" class="egd-btn egd-btn-light" data-action="direct-lesson" data-id="${esc(l.id)}">${l.lastVisited ? 'كمّل الدرس' : 'ابدأ الدرس'}${ic('arrow')}</button>
          <button type="button" class="egd-btn egd-btn-glass" ${subjAttrs(l.subject)}>كل دروس المادة</button>
        </div>
      </div>
      <div class="egd-ring" role="img" aria-label="تقدمك في المادة ${pct}%">
        <svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="${R}" class="egd-ring-bg"/><circle cx="40" cy="40" r="${R}" class="egd-ring-fg" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct / 100)}"/></svg>
        <div><strong>${pct}%</strong><small>${esc(subjectName(l.subject))}</small></div>
      </div>
    </section>`;
  }

  function subjectsPanel() {
    const subs = subjects();
    const body = subs.length
      ? subs.map((s) => {
        const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
        return `<button type="button" class="egd-subject" ${subjAttrs(s.key)}>
          <span class="egd-subject-icon egd-${toneOf(s.key)}">${esc(glyph(s.key))}</span>
          <span class="egd-subject-body"><strong>${esc(subjectName(s.key))}</strong><small>${s.done} من ${s.total} درس${s.next ? ` · التالي: ${esc(s.next.title)}` : ''}</small><span class="egd-bar"><i class="egd-${toneOf(s.key)}" style="width:${pct}%"></i></span></span>
          <span class="egd-subject-pct">${pct}%</span>
        </button>`;
      }).join('')
      : `<div class="egd-empty">${ic('book')}<strong>${S.pending ? 'بنجهّز موادك...' : 'مفيش دروس منشورة لصفك لسه'}</strong><small>أول ما المعلمين ينشروا دروس هتظهر هنا مع تقدمك في كل مادة.</small></div>`;
    return `<section class="egd-panel"><div class="egd-panel-head"><h3>موادك</h3>${go('my-subjects', 'عرض الكل', 'egd-link')}</div><div class="egd-subjects">${body}</div></section>`;
  }

  function agenda() {
    const rows = [];
    for (const x of upcomingSessions().slice(0, 2)) rows.push(['video', 'sky', x.title || 'حصة مباشرة', `${subjectName(x.subject)} · ${when(toDate(x.startsAt))}`, 'm5-calendar']);
    for (const x of pendingTasks().slice(0, 3)) rows.push(['list', x.status === 'overdue' ? 'rose' : 'amber', x.title || 'واجب', `${x.status === 'overdue' ? 'متأخر' : 'مطلوب'}${x.dueAt ? ' · آخر موعد ' + when(toDate(x.dueAt)) : ''}`, 'student-assignments']);
    const q = S.overview?.quizzes?.latest?.[0];
    if (q) rows.push(['chart', 'emerald', q.title || 'آخر اختبار', `النتيجة ${esc(q.percentage)}%`, 'my-results']);
    const body = rows.length
      ? rows.map(([i, t, a, b, v]) => `<button type="button" class="egd-agenda-row" data-action="route" data-view="${v}"><span class="egd-badge egd-${t}">${ic(i)}</span><span><strong>${esc(a)}</strong><small>${esc(b)}</small></span>${ic('arrow', 'egd-chev')}</button>`).join('')
      : `<div class="egd-empty">${ic('clock')}<strong>جدولك فاضي النهارده</strong><small>مفيش حصص أو واجبات قريبة. وقت ممتاز تذاكر درس جديد.</small></div>`;
    return `<section class="egd-panel"><div class="egd-panel-head"><h3>جاي في جدولك</h3>${go('m5-calendar', 'الجدول', 'egd-link')}</div><div class="egd-agenda">${body}</div></section>`;
  }

  function shortcuts() {
    const items = [['trophy', 'amber', 'التحديات', 'm1-challenges'], ['star', 'violet', 'لوحة الشرف', 'm1-leaderboard'], ['target', 'emerald', 'مراجعاتي', 'v55-review'], ['library', 'sky', 'المكتبة', 'library'], ['users', 'indigo', 'اطلب معلم', 'v84-student'], ['list', 'rose', 'كل الأدوات', 'v79-more']];
    return `<section class="egd-shortcuts" aria-label="اختصارات">${items.map(([i, t, l, v]) => `<button type="button" class="egd-shortcut" data-action="route" data-view="${v}"><span class="egd-badge egd-${t}">${ic(i)}</span><span>${l}</span></button>`).join('')}</section>`;
  }

  function render() {
    const root = document.getElementById('egd-root');
    if (!root) return;
    root.innerHTML = `<div class="egd" dir="rtl">
      ${header()}
      ${S.failed.length && !S.pending ? `<div class="egd-alert" role="status">بعض البيانات ماتحمّلتش. <button type="button" data-egd="refresh">حاول تاني</button></div>` : ''}
      ${resume()}
      ${stats()}
      <div class="egd-grid">${subjectsPanel()}${agenda()}</div>
      ${shortcuts()}
    </div>`;
  }

  async function load() {
    if (S.pending) return;
    const uid = S.uid, n = ++S.nonce;
    S.pending = true; S.failed = []; render();
    const jobs = [['overview', 'v69/learning/overview'], ['roadmap', 'v74/learning/roadmap'], ['calendar', 'm5/calendar'], ['points', 'm1/points']];
    try {
      const res = await Promise.allSettled(jobs.map(([, p]) => req(p)));
      if (n !== S.nonce || uid !== S.uid) return;
      res.forEach((r, i) => { const k = jobs[i][0]; if (r.status === 'fulfilled') S[k] = r.value; else { S[k] = null; S.failed.push(k); } });
      S.last = Date.now();
    } catch (e) {
      if (n === S.nonce) { S.failed.push('auth'); S.last = Date.now(); }
    } finally {
      if (n === S.nonce) { S.pending = false; render(); }
    }
  }

  document.addEventListener('click', (e) => {
    if (!document.getElementById('egd-root')) return;
    if (e.target.closest('[data-egd="refresh"]')) { e.preventDefault(); S.last = 0; void load(); }
  }, true);

  window.EgtazV79 = {
    ...prev,
    screen: () => '<div id="egd-root" class="egd-root"></div>',
    mount: (uid, name) => {
      if (!document.getElementById('egd-root') || !uid) return;
      if (S.uid !== uid) { S.uid = uid; S.name = name || ''; S.overview = S.roadmap = S.calendar = S.points = null; S.failed = []; S.last = 0; S.nonce++; S.pending = false; }
      render();
      if (!S.pending && Date.now() - S.last > 90000) void load();
    },
  };
})();
