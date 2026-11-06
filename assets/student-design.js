(() => {
  'use strict';
  const esc = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const art = {arabic:'arabic',math:'math',science:'science',physics:'science',chemistry:'science',biology:'science',english:'english',social:'world',history:'world',geography:'world',religion:'azhar',quran:'azhar',computer:'computer'};
  let stageImages = {};
  function subjectArt(id, emoji) {
    return art[id] ? '<span class="academy-art art-' + art[id] + '" aria-hidden="true"></span>' : '<span class="academy-emoji" aria-hidden="true">' + esc(emoji || '📚') + '</span>';
  }
  function updateStages(type) {
    document.querySelectorAll('[data-public-education]').forEach(button => {
      const selected = button.dataset.publicEducation === type;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('#stages [data-explore-stage]').forEach(card => {
      card.dataset.exploreType = type;
      card.querySelector('.stage-tag').textContent = type === 'azhar' ? 'تعليم أزهري' : 'تعليم عام';
      const host = card.querySelector('.stage-art');
      const url = stageImages[type === 'azhar' ? 'azhar' : card.dataset.exploreStage];
      host.classList.toggle('has-custom-image', !!url);
      host.style.backgroundImage = url ? 'url("' + url.replace(/"/g, '%22') + '")' : '';
    });
  }
  window.AcademyStudentDesign = {
    subjectArt,
    setStageImages(images) {
      stageImages = {};
      Object.entries(images || {}).forEach(([key, value]) => {
        if (typeof value !== 'string' || !value.trim()) return;
        try { const url = new URL(value, location.href); if (['http:', 'https:'].includes(url.protocol)) stageImages[key] = url.href; } catch {}
      });
      updateStages(document.querySelector('[data-public-education].active')?.dataset.publicEducation || 'public');
    }
  };

  document.querySelectorAll('[data-public-education]').forEach(button => button.addEventListener('click', () => updateStages(button.dataset.publicEducation)));

  // Trap focus in the existing authentication/onboarding dialogs and return it to the trigger.
  const focusable = 'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]';
  document.querySelectorAll('.modal-backdrop').forEach(modal => {
    const panel = modal.querySelector('.modal-panel');
    if (!panel) return;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    const heading = panel.querySelector('.form-heading h3,.onboarding-head h2');
    if (heading) { heading.id ||= modal.id + 'Title'; panel.setAttribute('aria-labelledby', heading.id); }
    let trigger;
    const visibleElements = () => [...panel.querySelectorAll(focusable)].filter(element => element.getClientRects().length);
    new MutationObserver(() => {
      const open = !modal.classList.contains('hidden');
      document.body.classList.toggle('academy-dialog-open', !!document.querySelector('.modal-backdrop:not(.hidden)'));
      if (open) { trigger = document.activeElement; requestAnimationFrame(() => (panel.querySelector('.auth-form:not(.hidden) input') || visibleElements()[0])?.focus()); }
      else if (trigger?.isConnected) trigger.focus();
    }).observe(modal, {attributes:true, attributeFilter:['class']});
    panel.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const elements = visibleElements(), first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
  });

  document.addEventListener('error', event => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.matches('[data-subject-image]')) return;
    const card = image.closest('.student-subject-card-v2');
    image.parentElement.innerHTML = subjectArt(card?.dataset.subject || image.parentElement.dataset.subject, image.dataset.fallback);
    card?.classList.remove('has-image');
  }, true);

  document.addEventListener('DOMContentLoaded', () => {
    const avatar = document.getElementById('learningAvatar');
    if (avatar) {
      avatar.setAttribute('role', 'link'); avatar.setAttribute('tabindex', '0'); avatar.setAttribute('aria-label', 'فتح حسابي');
      avatar.onclick = () => location.href = './profile.html';
      avatar.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); avatar.click(); } });
    }
  });

  // A temporary server/network error never turns a saved session into a guest session.
  window.addEventListener('academy:session-recovery', event => {
    if (event.detail?.appName !== '[DEFAULT]') return;
    let banner = document.getElementById('academySessionRecovery');
    if (event.detail.state !== 'waiting') { banner?.remove(); window.AcademyUI?.hidePageLoading(); return; }
    window.AcademyUI?.hidePageLoading();
    if (banner) return;
    banner = document.createElement('div'); banner.id = 'academySessionRecovery'; banner.className = 'academy-session-recovery'; banner.setAttribute('role', 'status');
    banner.innerHTML = '<span>بنستعيد جلسة دخولك. تحقق من الاتصال؛ بيانات الدخول محفوظة.</span><button type="button" class="btn btn-soft">حاول الآن</button>';
    banner.querySelector('button').onclick = () => window.AcademyBackend?.auth().retrySessionRestore();
    document.body.appendChild(banner);
  });
})();
