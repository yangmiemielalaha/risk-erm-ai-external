(function () {
  'use strict';

  var script = document.currentScript;
  var scriptUrl = script && script.src ? script.src : new URL('/home-link.js', window.location.origin).href;

  function addHomeLink() {
    if (window.self !== window.top) return;
    if (document.querySelector('[data-global-home-link]')) return;

    var homeUrl = new URL('./', scriptUrl).href;
    var link = document.createElement('a');
    link.href = homeUrl;
    link.className = 'global-home-link';
    link.setAttribute('data-global-home-link', '');
    link.setAttribute('aria-label', '回到主页');
    link.title = '回到主页';
    link.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.8 12 3l9 7.8v9.7a.5.5 0 0 1-.5.5H15v-6H9v6H3.5a.5.5 0 0 1-.5-.5v-9.7Z"/><path d="m1.8 11.4 10.2-8.8 10.2 8.8"/></svg>';

    var style = document.createElement('style');
    style.textContent = [
      '.global-home-link{position:fixed;right:18px;bottom:18px;z-index:2147483646;',
      'display:grid;place-items:center;width:44px;height:44px;border-radius:13px;',
      'color:#fff;background:linear-gradient(135deg,#168eea,#7667f5);',
      'border:1px solid rgba(255,255,255,.3);box-shadow:0 10px 28px rgba(8,31,69,.32);',
      'text-decoration:none;transition:transform .18s ease,box-shadow .18s ease,filter .18s ease}',
      '.global-home-link:hover{transform:translateY(-2px);filter:brightness(1.08);box-shadow:0 14px 34px rgba(8,31,69,.42)}',
      '.global-home-link:focus-visible{outline:3px solid rgba(56,189,248,.5);outline-offset:3px}',
      '.global-home-link svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}',
      '@media (max-width:700px){.global-home-link{right:12px;bottom:12px;width:40px;height:40px;border-radius:12px}}'
    ].join('');

    document.head.appendChild(style);
    document.body.appendChild(link);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addHomeLink);
  else addHomeLink();
})();
