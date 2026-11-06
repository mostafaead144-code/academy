/* Shared, dependency-free validation for every academy surface. */
(() => {
  'use strict';
  function safeUrl(value, base = location.href) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value.trim(), base);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  }
  function youtubeEmbed(value) {
    const safe = safeUrl(value);
    if (!safe) return '';
    const url = new URL(safe), host = url.hostname.toLowerCase().replace(/^www\./, '');
    let id = '';
    if (host === 'youtu.be') id = url.pathname.split('/')[1];
    else if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)) {
      id = /^\/(?:embed|live|shorts)\//.test(url.pathname) ? url.pathname.split('/')[2] : url.searchParams.get('v');
    }
    return /^[\w-]{11}$/.test(id || '') ? 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0' : '';
  }
  function sanitizeRichHtml(input) {
    const raw = String(input || '');
    if (typeof DOMParser === 'undefined') return raw.replace(/<script[\s\S]*?<\/script>/gi, '');
    const doc = new DOMParser().parseFromString('<div id="academy-rich-root">' + raw + '</div>', 'text/html');
    const root = doc.getElementById('academy-rich-root');
    const allowed = new Set(['P','BR','H2','H3','H4','STRONG','B','EM','I','U','S','UL','OL','LI','BLOCKQUOTE','A','IMG','FIGURE','FIGCAPTION','HR','SPAN','DIV','FONT']);
    const dangerous = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','FORM','INPUT','BUTTON','TEXTAREA','SELECT','OPTION','META','LINK']);
    const cleanStyle = value => String(value || '').split(';').map(part => {
      const [rawKey, ...rest] = part.split(':'), key = rawKey?.trim().toLowerCase(), val = rest.join(':').trim().toLowerCase();
      if (key === 'text-align' && ['right','left','center','justify'].includes(val)) return 'text-align:' + val;
      if ((key === 'color' || key === 'background-color') && (/^#[0-9a-f]{3,8}$/i.test(val) || /^rgb(a)?\([\d\s,.%]+\)$/i.test(val))) return key + ':' + val;
      return '';
    }).filter(Boolean).join(';');
    [...root.querySelectorAll('*')].forEach(el => {
      if (!el.isConnected) return;
      if (dangerous.has(el.tagName)) { el.remove(); return; }
      if (!allowed.has(el.tagName)) { el.replaceWith(...el.childNodes); return; }
      const attrs = [...el.attributes];
      attrs.forEach(a => el.removeAttribute(a.name));
      if (el.tagName === 'A') {
        const href = safeUrl(attrs.find(a => a.name.toLowerCase() === 'href')?.value || '');
        if (href) { el.setAttribute('href', href); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
      } else if (el.tagName === 'IMG') {
        const src = safeUrl(attrs.find(a => a.name.toLowerCase() === 'src')?.value || '');
        if (!src) { el.remove(); return; }
        el.setAttribute('src', src);el.setAttribute('loading', 'lazy');el.setAttribute('alt', (attrs.find(a => a.name.toLowerCase() === 'alt')?.value || '').slice(0,180));
      } else if (el.tagName === 'FIGURE') {
        const cls = (attrs.find(a => a.name.toLowerCase() === 'class')?.value || '').split(/\s+/).filter(x => ['rte-inline-image','rte-image-wide','rte-image-medium','rte-image-small'].includes(x));
        if (cls.length) el.setAttribute('class', cls.join(' '));
      } else if (el.tagName === 'FONT') {
        const color = attrs.find(a => a.name.toLowerCase() === 'color')?.value || '';
        if (/^#[0-9a-f]{3,8}$/i.test(color) || /^[a-z]{3,20}$/i.test(color)) el.setAttribute('color', color);
      }
      const style = cleanStyle(attrs.find(a => a.name.toLowerCase() === 'style')?.value || '');
      if (style) el.setAttribute('style', style);
    });
    return root.innerHTML;
  }
  function validateQuestions(input) {
    if (!Array.isArray(input)) throw new Error('الأسئلة يجب أن تكون قائمة JSON.');
    return input.map((q, i) => {
      const text = q?.text ?? q?.question, opts = q?.opts ?? q?.options;
      const answer = q?.correctAnswer;
      if (typeof text !== 'string' || !text.trim() || !Array.isArray(opts) || opts.length < 2 ||
          opts.some(o => typeof o !== 'string' || !o.trim()) ||
          !['number', 'string'].includes(typeof answer) || String(answer).trim() === '' ||
          !Number.isInteger(Number(answer)) || Number(answer) < 0 || Number(answer) >= opts.length) {
        throw new Error('راجع السؤال رقم ' + (i + 1) + ': النص والاختيارات مطلوبة، ورقم الإجابة يبدأ من 0 ويجب أن يكون ضمن الاختيارات.');
      }
      return {...q, text: text.trim(), opts: opts.map(o => o.trim()), correctAnswer: Number(answer)};
    });
  }
  function matchesStudent(item, profile) {
    return !!item && item.isHidden !== true && item.isActive !== false &&
      (!item.type || item.type === profile.educationType) &&
      (!item.stage || item.stage === profile.stage) &&
      (!item.grade || String(item.grade) === String(profile.grade));
  }
  window.AcademyUtils = {safeUrl, youtubeEmbed, sanitizeRichHtml, validateQuestions, matchesStudent};
})();
