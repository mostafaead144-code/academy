(() => {
  'use strict';
  // Filter buttons remain normal buttons; left/right keys are optional shortcuts in RTL.
  document.querySelectorAll('.feature-tabs[role="group"]').forEach(group => {
    group.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const buttons = [...group.querySelectorAll('button')].filter(button => !button.disabled);
      const index = buttons.indexOf(document.activeElement);
      if (index < 0) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
        (index + (event.key === 'ArrowLeft' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
      buttons[next].click();
    });
  });

  // The existing analytics module loads asynchronously; keep its full output inside the disclosure.
  const target = document.getElementById('examReadinessContent');
  if (target) {
    const mount = () => {
      const surface = document.querySelector('main > .growth-surface');
      if (!surface) return false;
      target.appendChild(surface);
      return true;
    };
    if (!mount()) {
      const observer = new MutationObserver(() => { if (mount()) observer.disconnect(); });
      observer.observe(document.querySelector('main'), {childList:true});
    }
  }

  // A missing teacher/admin cover falls back to the same subject artwork used elsewhere.
  document.addEventListener('error', event => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.matches('[data-tools-image]')) return;
    image.parentElement.classList.remove('has-image');
    image.remove();
  }, true);
})();
