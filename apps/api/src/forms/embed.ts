/**
 * Browser script served at /forms/embed.js. Shops include it once per page:
 *
 *   <script>window.PlunkForms = {key: 'pk_...', locale: 'lt', subscribed: false, customer: false};</script>
 *   <script src="https://api.example.com/forms/embed.js" async></script>
 *
 * INLINE and PAGE forms render into `<div data-plunk-form="<form id>"></div>`. POPUP, SLIDE_IN
 * and BAR forms are overlays: at most one is shown per page, when its display rules match.
 * Everything renders inside a shadow root so shop styles do not leak in, and every text is set
 * through textContent, never as HTML.
 *
 * Kept dependency-free ES5-style JavaScript. Must not contain backticks or dollar-brace.
 */
export const EMBED_SCRIPT = String.raw`(function () {
  'use strict';
  if (window.__plunkFormsLoaded) return;
  window.__plunkFormsLoaded = true;

  var script = document.currentScript;
  var cfg = window.PlunkForms || {};
  var api = script && script.src ? new URL(script.src).origin : '';
  var key = cfg.key || (script && script.getAttribute('data-key'));
  var pageLang = (document.documentElement.lang || '').split(/[-_]/);
  var language = /^[a-z]{2}$/i.test(pageLang[0]) ? pageLang[0].toLowerCase() : undefined;
  var region = /^[a-z]{2}$/i.test(pageLang[1] || '') ? '-' + pageLang[1].toUpperCase() : '';
  var htmlLocale = language && language + region;
  var locale = cfg.locale || (script && script.getAttribute('data-locale')) || htmlLocale;
  if (!key || !api) return;

  var DAY = 86400000;
  var INVALID_EMAIL = {
    lt: 'Įveskite teisingą el. pašto adresą.',
    lv: 'Ievadiet derīgu e-pasta adresi.',
    et: 'Sisestage kehtiv e-posti aadress.',
    pl: 'Podaj poprawny adres e-mail.',
    de: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.',
    en: 'Enter a valid email address.',
  };
  function get(store, name) { try { return window[store].getItem('plunk_' + name); } catch (e) { return null; } }
  function set(store, name, value) { try { window[store].setItem('plunk_' + name, String(value)); } catch (e) {} }

  var pageviews = Number(get('sessionStorage', 'pv') || 0) + 1;
  set('sessionStorage', 'pv', pageviews);
  var isMobile = window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
  var turnstile = null;
  var overlayShown = false;

  function post(path, body) {
    return fetch(api + path, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
      keepalive: true,
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) throw new Error((data && data.message) || 'Error');
        return data;
      });
    });
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function wildcard(pattern, value) {
    if (pattern.indexOf('*') === -1) return value.indexOf(pattern) !== -1;
    var escaped = pattern.split('*').map(function (part) { return part.replace(/[.+?^{}()|[\]\\$]/g, '\\$&'); });
    return new RegExp('^' + escaped.join('.*') + '$').test(value);
  }

  function eligible(form) {
    var rules = form.rules;
    var path = location.pathname + location.search;
    if (rules.urlInclude.length && !rules.urlInclude.some(function (p) { return wildcard(p, path); })) return false;
    if (rules.urlExclude.some(function (p) { return wildcard(p, path); })) return false;
    if (rules.hideForSubscribers && (cfg.subscribed || get('localStorage', 'subscribed'))) return false;
    if (rules.hideForCustomers && cfg.customer) return false;
    if (form.type === 'INLINE' || form.type === 'PAGE') return true;
    if (pageviews < rules.minPageviews) return false;
    if (isMobile && rules.mobile === 'hide') return false;
    if (recent('dismissed_', form)) return rules.teaser && !recent('teaser_dismissed_', form) ? 'teaser' : false;
    return true;
  }

  function recent(prefix, form) {
    var at = Number(get('localStorage', prefix + form.id) || 0);
    return at > 0 && Date.now() - at < form.rules.dismissDays * DAY;
  }

  var teaserHost = null;
  function showTeaser(form) {
    if (teaserHost || get('localStorage', 'subscribed') || recent('teaser_dismissed_', form)) return;
    var style = form.style || {};
    teaserHost = el('div');
    var root = teaserHost.attachShadow({mode: 'open'});
    root.appendChild(el('style', null, CSS));
    var wrap = el('div', 'pf pf-teaser');
    wrap.style.setProperty('--pf-accent', style.accent || '#1c1c1c');
    var open = el('button', 'pf-teaser-open', form.content.teaserText || form.content.title);
    open.type = 'button';
    open.onclick = function () {
      hideTeaser();
      showOverlay(form, true);
    };
    var dismiss = el('button', 'pf-teaser-close', '\u00d7');
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'Close');
    dismiss.onclick = function () {
      set('localStorage', 'teaser_dismissed_' + form.id, Date.now());
      hideTeaser();
    };
    wrap.appendChild(open);
    wrap.appendChild(dismiss);
    root.appendChild(wrap);
    document.body.appendChild(teaserHost);
  }
  function hideTeaser() {
    if (teaserHost) teaserHost.remove();
    teaserHost = null;
  }

  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box;font-family:inherit}',
    '.pf{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--pf-text);background:var(--pf-bg);line-height:1.5;-webkit-font-smoothing:antialiased}',
    '.pf-card{position:relative;padding:32px;max-width:440px;width:100%}',
    '.pf-inline .pf-card,.pf-page .pf-card{max-width:560px;margin:0 auto;padding:24px 0;background:transparent}',
    '.pf-page .pf-card{padding:48px 0}',
    '.pf-image{display:block;width:100%;height:160px;object-fit:cover;margin:-32px -32px 24px;width:calc(100% + 64px)}',
    '.pf-title{margin:0 0 8px;font-size:22px;font-weight:500;letter-spacing:-0.01em}',
    '.pf-body{margin:0 0 20px;font-size:15px;opacity:.8}',
    '.pf-row{display:flex;gap:8px;flex-wrap:wrap}',
    '.pf-input{flex:1 1 200px;min-width:0;height:46px;padding:0 14px;font-size:15px;color:inherit;background:transparent;border:1px solid rgba(127,127,127,.4);border-radius:2px;outline:none;transition:border-color .2s}',
    '.pf-input:focus{border-color:var(--pf-accent)}',
    '.pf-button{height:46px;padding:0 22px;font-size:14px;font-weight:500;letter-spacing:.04em;text-transform:uppercase;color:#fff;background:var(--pf-accent);border:0;border-radius:2px;cursor:pointer;transition:opacity .2s}',
    '.pf-button:hover{opacity:.88}.pf-button:disabled{opacity:.5;cursor:default}',
    '.pf-consent{margin:12px 0 0;font-size:12px;opacity:.65}',
    '.pf-error{margin:10px 0 0;font-size:13px;color:#b42318}',
    '.pf-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}',
    '.pf-close{position:absolute;top:10px;right:10px;width:32px;height:32px;font-size:20px;line-height:1;color:inherit;background:transparent;border:0;cursor:pointer;opacity:.55}',
    '.pf-close:hover{opacity:1}',
    '.pf-options{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 20px;padding:0;border:0}',
    '.pf-option{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;font-size:14px;border:1px solid rgba(127,127,127,.4);border-radius:999px;cursor:pointer;transition:border-color .2s,background .2s}',
    '.pf-option:has(input:checked){border-color:var(--pf-accent);background:rgba(127,127,127,.08)}',
    '.pf-option input{accent-color:var(--pf-accent);margin:0}',
    '.pf-legend{margin:0 0 12px;font-size:15px;font-weight:500}',
    '.pf-turnstile{margin-top:12px}',
    '.pf-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(17,17,17,.45);animation:pf-fade .25s ease}',
    '.pf-overlay .pf-card{box-shadow:0 24px 64px rgba(0,0,0,.18);animation:pf-rise .3s ease}',
    '.pf-slide{position:fixed;z-index:2147483000;bottom:16px;right:16px;max-width:calc(100% - 32px);box-shadow:0 16px 48px rgba(0,0,0,.16);animation:pf-rise .3s ease}',
    '.pf-slide.pf-left{right:auto;left:16px}',
    '.pf-slide .pf-card{padding:28px}',
    '.pf-bar{position:fixed;z-index:2147483000;left:0;right:0;bottom:0;box-shadow:0 -4px 24px rgba(0,0,0,.08)}',
    '.pf-bar.pf-top{top:0;bottom:auto}',
    '.pf-bar .pf-card{max-width:1100px;margin:0 auto;padding:12px 56px 12px 16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}',
    '.pf-bar .pf-title{margin:0;font-size:15px;flex:1 1 240px}',
    '.pf-bar .pf-row{flex:1 1 360px}.pf-bar .pf-input,.pf-bar .pf-button{height:40px}',
    '.pf-bar .pf-consent{flex-basis:100%;margin:0}',
    '.pf-bar .pf-close{top:50%;transform:translateY(-50%)}',
    '.pf-teaser{position:fixed;z-index:2147482999;bottom:16px;left:16px;display:flex;align-items:center;max-width:calc(100% - 32px);color:#fff;background:var(--pf-accent);border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.18);animation:pf-rise .3s ease}',
    '.pf-teaser button{color:inherit;background:transparent;border:0;cursor:pointer;font:inherit}',
    '.pf-teaser-open{height:44px;padding:0 8px 0 18px;font-size:14px;font-weight:500;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.pf-teaser-close{width:36px;height:44px;font-size:18px;opacity:.7}.pf-teaser-close:hover{opacity:1}',
    '@media (max-width:640px){.pf-teaser{bottom:12px;left:12px}.pf-teaser-open{height:40px;font-size:13px}.pf-teaser-close{height:40px}}',
    '@keyframes pf-fade{from{opacity:0}}@keyframes pf-rise{from{opacity:0;transform:translateY(12px)}}',
    '@media (prefers-reduced-motion:reduce){.pf-overlay,.pf-overlay .pf-card,.pf-slide,.pf-teaser{animation:none}}',
  ].join('');

  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    return new Promise(function (resolve, reject) {
      var tag = document.createElement('script');
      tag.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      tag.async = true;
      tag.onload = function () { resolve(window.turnstile); };
      tag.onerror = reject;
      document.head.appendChild(tag);
    });
  }

  function render(form, mount, variant, onClose) {
    var c = form.content;
    var style = form.style || {};
    var host = el('div');
    var root = host.attachShadow({mode: 'open'});
    root.appendChild(el('style', null, CSS));

    var wrap = el('div', 'pf pf-' + variant);
    wrap.style.setProperty('--pf-accent', style.accent || '#1c1c1c');
    wrap.style.setProperty('--pf-bg', style.background || '#ffffff');
    wrap.style.setProperty('--pf-text', style.text || '#1c1c1c');
    if (variant === 'slide' && style.position === 'bottom-left') wrap.className += ' pf-left';
    if (variant === 'bar' && style.position === 'top') wrap.className += ' pf-top';

    var card = el('div', 'pf-card');
    card.style.background = variant === 'inline' || variant === 'page' ? 'transparent' : 'var(--pf-bg)';
    var titleId = 'pf-title-' + form.id;
    if (variant === 'overlay') {
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      card.setAttribute('aria-labelledby', titleId);
    }

    function close() {
      set('localStorage', 'dismissed_' + form.id, Date.now());
      host.remove();
      document.removeEventListener('keydown', onKey);
      if (onClose) onClose();
    }
    function onKey(event) { if (event.key === 'Escape') close(); }
    if (variant !== 'inline' && variant !== 'page') {
      var closeButton = el('button', 'pf-close', '\u00d7');
      closeButton.type = 'button';
      closeButton.setAttribute('aria-label', 'Close');
      closeButton.onclick = close;
      card.appendChild(closeButton);
      document.addEventListener('keydown', onKey);
    }

    if (style.imageUrl && variant !== 'bar') {
      var image = el('img', 'pf-image');
      image.src = style.imageUrl;
      image.alt = '';
      image.loading = 'lazy';
      card.appendChild(image);
    }

    var title = el(variant === 'page' ? 'h1' : 'h2', 'pf-title', variant === 'bar' ? c.barText || c.title : c.title);
    title.id = titleId;
    card.appendChild(title);
    if (c.body && variant !== 'bar') card.appendChild(el('p', 'pf-body', c.body));

    var formEl = el('form');
    formEl.noValidate = true;
    var row = el('div', 'pf-row');
    var email = el('input', 'pf-input');
    email.type = 'email';
    email.name = 'email';
    email.required = true;
    email.autocomplete = 'email';
    email.placeholder = c.emailPlaceholder || 'El. paštas';
    email.setAttribute('aria-label', c.emailPlaceholder || 'Email');
    var honeypot = el('input', 'pf-hp');
    honeypot.name = 'website';
    honeypot.tabIndex = -1;
    honeypot.autocomplete = 'off';
    honeypot.setAttribute('aria-hidden', 'true');
    var button = el('button', 'pf-button', c.button);
    button.type = 'submit';
    row.appendChild(email);
    row.appendChild(button);
    formEl.appendChild(row);
    formEl.appendChild(honeypot);
    var widget = null;
    var widgetBox = null;
    if (turnstile) {
      widgetBox = el('div', 'pf-turnstile');
      formEl.appendChild(widgetBox);
    }
    if (c.consentText) formEl.appendChild(el('p', 'pf-consent', c.consentText));
    var error = el('p', 'pf-error');
    error.setAttribute('role', 'alert');
    error.hidden = true;
    formEl.appendChild(error);
    card.appendChild(formEl);

    // Lets the host page react to a signup (e.g. a shop linking earlier browsing to the email).
    function announce(address) {
      try {
        document.dispatchEvent(new CustomEvent('plunk:form-submitted', {detail: {formId: form.id, email: address}}));
      } catch (e) {}
    }

    function done() {
      set('localStorage', 'subscribed', 1);
      formEl.remove();
      title.textContent = c.successTitle || c.title;
      var bodyNode = card.querySelector('.pf-body');
      if (bodyNode) bodyNode.remove();
      if (c.successBody) card.appendChild(el('p', 'pf-body', c.successBody));
      if (variant === 'bar') setTimeout(function () { host.remove(); }, 4000);
    }

    function step2(token) {
      formEl.remove();
      title.textContent = c.step2Title || c.successTitle || c.title;
      var bodyNode = card.querySelector('.pf-body');
      if (bodyNode) bodyNode.remove();
      var second = el('form');
      form.fields.forEach(function (field) {
        var set_ = el('fieldset', 'pf-options');
        set_.appendChild(el('legend', 'pf-legend', field.label));
        field.options.forEach(function (option) {
          var label = el('label', 'pf-option');
          var box = el('input');
          box.type = 'checkbox';
          box.name = field.key;
          box.value = option.value;
          label.appendChild(box);
          label.appendChild(document.createTextNode(option.label));
          set_.appendChild(label);
        });
        second.appendChild(set_);
      });
      var save = el('button', 'pf-button', c.step2Button || c.button);
      save.type = 'submit';
      second.appendChild(save);
      var stepError = el('p', 'pf-error');
      stepError.setAttribute('role', 'alert');
      stepError.hidden = true;
      second.appendChild(stepError);
      second.onsubmit = function (event) {
        event.preventDefault();
        var fields = {};
        form.fields.forEach(function (field) {
          fields[field.key] = Array.prototype.map.call(
            second.querySelectorAll('input[name="' + field.key + '"]:checked'),
            function (box) { return box.value; },
          );
        });
        save.disabled = true;
        stepError.hidden = true;
        post('/forms/public/' + form.id + '/fields', {key: key, token: token, fields: fields})
          .then(function () { second.remove(); done(); })
          .catch(function (err) {
            save.disabled = false;
            stepError.textContent = err.message;
            stepError.hidden = false;
          });
      };
      card.appendChild(second);
    }

    formEl.onsubmit = function (event) {
      event.preventDefault();
      error.hidden = true;
      var value = email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        error.textContent = INVALID_EMAIL[(locale || 'en').split('-')[0]] || INVALID_EMAIL.en;
        error.hidden = false;
        email.focus();
        return;
      }
      var token = widget !== null && window.turnstile ? window.turnstile.getResponse(widget) : undefined;
      button.disabled = true;
      post('/forms/public/' + form.id + '/submit', {
        key: key,
        email: value,
        locale: locale,
        url: location.href.slice(0, 2048),
        website: honeypot.value || undefined,
        turnstileToken: token || undefined,
      }).then(function (result) {
        if (!honeypot.value) announce(value);
        if (result.step2Token && form.fields.length) step2(result.step2Token);
        else done();
      }).catch(function (err) {
        button.disabled = false;
        error.textContent = err.message;
        error.hidden = false;
        if (widget !== null && window.turnstile) window.turnstile.reset(widget);
      });
    };

    wrap.appendChild(card);
    root.appendChild(wrap);
    mount.appendChild(host);

    if (widgetBox) {
      loadTurnstile().then(function (ts) {
        widget = ts.render(widgetBox, {sitekey: turnstile.siteKey, action: turnstile.action, appearance: 'interaction-only'});
      }).catch(function () {});
    }
    if (variant === 'overlay') {
      wrap.addEventListener('click', function (event) { if (event.target === wrap) close(); });
      setTimeout(function () { email.focus(); }, 50);
    }
    post('/forms/public/' + form.id + '/view', {key: key}).catch(function () {});
  }

  function variantFor(form) {
    if (form.type === 'BAR') return 'bar';
    if (form.type === 'SLIDE_IN') return 'slide';
    if (form.type === 'POPUP') return isMobile && form.rules.mobile !== 'same' ? 'slide' : 'overlay';
    return form.type === 'PAGE' ? 'page' : 'inline';
  }

  function showOverlay(form, again) {
    if (overlayShown && !again) return;
    overlayShown = true;
    render(form, document.body, variantFor(form), function () {
      if (form.rules.teaser) showTeaser(form);
    });
  }

  function arm(form) {
    var rules = form.rules;
    var trigger = rules.trigger;
    if (trigger === 'exit' && isMobile) trigger = 'scroll';
    if (trigger === 'immediate') return showOverlay(form);
    if (trigger === 'delay') return setTimeout(function () { showOverlay(form); }, rules.delaySeconds * 1000);
    if (trigger === 'scroll') {
      var onScroll = function () {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        if (max <= 0 || (window.scrollY / max) * 100 >= rules.scrollPercent) {
          window.removeEventListener('scroll', onScroll);
          showOverlay(form);
        }
      };
      window.addEventListener('scroll', onScroll, {passive: true});
      return;
    }
    var onLeave = function (event) {
      if (event.clientY <= 0 && !event.relatedTarget) {
        document.removeEventListener('mouseout', onLeave);
        showOverlay(form);
      }
    };
    document.addEventListener('mouseout', onLeave);
  }

  var forms = [];
  function start(config) {
    forms = config.forms || [];
    turnstile = config.turnstile;
    forms.forEach(function (form) {
      var state = eligible(form);
      if (!state) return;
      if (state === 'teaser') return showTeaser(form);
      if (form.type === 'INLINE' || form.type === 'PAGE') {
        var mounts = document.querySelectorAll('[data-plunk-form="' + form.id + '"]');
        Array.prototype.forEach.call(mounts, function (mount) {
          if (!mount.getAttribute('data-plunk-rendered')) {
            mount.setAttribute('data-plunk-rendered', '1');
            render(form, mount, variantFor(form));
          }
        });
      } else {
        arm(form);
      }
    });
  }

  window.PlunkForms = cfg;
  cfg.open = function (id) {
    var form = forms.filter(function (candidate) { return candidate.id === id; })[0];
    if (form) render(form, document.body, variantFor(form) === 'inline' ? 'overlay' : variantFor(form));
  };

  fetch(api + '/forms/public/config?key=' + encodeURIComponent(key) + (locale ? '&locale=' + encodeURIComponent(locale) : ''))
    .then(function (response) { return response.ok ? response.json() : {forms: []}; })
    .then(function (config) {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { start(config); });
      else start(config);
    })
    .catch(function () {});
})();
`;
