/* ═══════════════════════════════════════════════════════════
   galeria.js — carrossel circular da galeria de casos
   Porte para JS puro do CircularCarousel (React Bits), só o
   formato "cylinder": cartões curvos num anel 3D que gira devagar,
   entrada "rise", arrastar com inércia e parada no cartão, foco no
   clique, inclinação leve seguindo o mouse, profundidade apagando
   os cartões de trás na cor do fundo e legenda com contador.

   O HTML traz a lista de fotos (<ul class="galeria__lista">): sem JS
   ela aparece como grade; com JS vira o anel e a lista é escondida.
   Movimento reduzido: sem entrada, sem giro sozinho e sem inclinação.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var root = document.querySelector('.cc');
  var lista = document.querySelector('.galeria__lista');
  if (!root || !lista) return;

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var itens = [].map.call(lista.querySelectorAll('li'), function (li) {
    var img = li.querySelector('img');
    return {
      src: img.currentSrc || img.src, alt: img.alt,
      title: li.getAttribute('data-titulo') || '', subtitle: li.getAttribute('data-sub') || ''
    };
  });
  var count = itens.length;
  if (count < 3) return;

  // ── opções (as mesmas do componente) ──
  var MOBILE = window.matchMedia('(max-width: 720px)').matches;
  var O = {
    cardW: MOBILE ? 170 : 230, aspect: 0.8, gap: MOBILE ? 18 : 25,
    tilt: -5, perspective: 2500, curve: 1, spread: 1,
    speed: 12, momentum: 0.6, snap: true, pauseOnHover: true,
    parallax: REDUCED ? 0 : 0.3, stretch: REDUCED ? 0 : 0.5,
    depthFade: 0.62, innerShade: 0.6, captions: true,
    intro: REDUCED ? 'none' : 'rise', autoplay: REDUCED ? 'off' : 'drift'
  };
  var TILES = 8, OVERLAP = 2.5, DRAG_THRESHOLD = 5, SPRING = 118, SETTLE_SPEED = 9,
      CAPTION_SPACE = 76, INTRO_LENGTH = { rise: 1400, none: 0 }, TO_RAD = Math.PI / 180;

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function wrap(d) { return ((((d + 180) % 360) + 360) % 360) - 180; }
  function easeOutQuint(t) { return 1 - Math.pow(1 - t, 5); }
  function rotX(p, d) { var r = d * TO_RAD, c = Math.cos(r), s = Math.sin(r); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; }
  function rotY(p, d) { var r = d * TO_RAD, c = Math.cos(r), s = Math.sin(r); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; }

  var cardW = O.cardW, cardH = cardW / O.aspect, along = cardW, step = 360 / count;
  var radius = (function () {
    var n = Math.max(count, 3), pitch = (along + O.gap) * O.spread;
    var chord = pitch / (2 * Math.sin(Math.PI / n)), arc = (n * pitch) / (2 * Math.PI);
    return Math.max(chord + (arc - chord) * O.curve, along * 0.6);
  })();

  // faixas verticais que curvam cada cartão para seguir o anel
  var tiles = (function () {
    var total = O.curve > 0.001 ? TILES : 1, len = along / total, bend = O.curve > 0.001 ? radius / O.curve : 0, out = [];
    for (var i = 0; i < total; i++) {
      var start = i * len - (i > 0 ? OVERLAP / 2 : 0);
      var end = (i + 1) * len + (i < total - 1 ? OVERLAP / 2 : 0);
      var center = (start + end) / 2 - along / 2;
      var alpha = bend ? center / bend : 0;
      var shift = bend ? bend * Math.sin(alpha) : center;
      var depth = -(bend ? bend * (1 - Math.cos(alpha)) : 0);
      var turn = alpha * 180 / Math.PI;
      out.push({ index: i, total: total, start: start, end: end, size: end - start,
        move: 'translate3d(' + shift + 'px,0px,' + depth + 'px) rotateY(' + turn + 'deg)' });
    }
    return out;
  })();

  // ── DOM ──
  root.style.setProperty('--cc-inner', (1 - O.innerShade).toFixed(3));
  root.setAttribute('role', 'region');
  root.setAttribute('aria-roledescription', 'carrossel');
  root.setAttribute('aria-label', 'Galeria de casos: arraste ou use as setas do teclado');
  root.tabIndex = 0;
  root.setAttribute('data-draggable', '');

  function el(tag, cls, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }
  var view = el('div', 'cc__view', root), stage = el('div', 'cc__stage', view),
      camera = el('div', 'cc__camera', stage), ring = el('div', 'cc__ring', camera);

  function tile(card, item, t, back) {
    var strip = back ? t.total - 1 - t.index : t.index, first = strip === 0, last = strip === t.total - 1;
    var r = 'var(--cc-radius)';
    var div = el('div', 'cc__tile', card);
    div.setAttribute('aria-hidden', 'true');
    div.style.cssText = 'left:' + (-t.size / 2) + 'px;top:' + (-cardH / 2) + 'px;width:' + t.size + 'px;height:' + cardH +
      'px;transform:' + t.move + (back ? ' rotateY(180deg)' : '');
    var frame = el('div', 'cc__frame', div);
    frame.style.height = cardH + 'px';
    frame.style.borderRadius = (first ? r : 0) + ' ' + (last ? r : 0) + ' ' + (last ? r : 0) + ' ' + (first ? r : 0);
    var img = el('img', 'cc__photo', frame);
    img.src = item.src; img.alt = ''; img.draggable = false; img.decoding = 'async';
    var offset = back ? along - t.end : t.start;
    img.style.cssText = 'left:' + (-offset) + 'px;top:0;width:' + cardW + 'px;height:' + cardH + 'px';
    if (back) el('div', 'cc__inner', frame);
    el('div', 'cc__shade', frame);
  }
  var cards = itens.map(function (item, i) {
    var card = el('div', 'cc__card', ring);
    card.setAttribute('data-cc-index', i);
    card.setAttribute('role', 'group');
    card.setAttribute('aria-roledescription', 'slide');
    card.setAttribute('aria-label', (item.alt || item.title) + ', ' + (i + 1) + ' de ' + count);
    tiles.forEach(function (t) { tile(card, item, t, false); });
    tiles.forEach(function (t) { tile(card, item, t, true); });
    return card;
  });

  // legenda: título, subtítulo e contador com dígitos em rolo
  var cap = el('div', 'cc__caption', root); cap.setAttribute('aria-hidden', 'true');
  var capTitle = el('span', 'cc__title', cap);
  var capCount = el('span', 'cc__count', cap);
  var digits = el('span', 'cc__digits', capCount), reels = [];
  for (var d = 0; d < 2; d++) {
    var dg = el('span', 'cc__digit', digits), reel = el('span', 'cc__reel', dg);
    for (var k = 0; k < 10; k++) el('span', '', reel).textContent = k;
    reels.push(reel);
  }
  el('span', 'cc__slash', capCount).textContent = '/';
  el('span', '', capCount).textContent = String(count).padStart(2, '0');
  var live = el('div', 'cc__live', root); live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true');

  function legenda(i) {
    var it = itens[i];
    capTitle.innerHTML = '';
    var t = el('span', 'cc__title-in', capTitle); t.textContent = it.title || it.alt;
    if (it.subtitle) el('span', 'cc__subtitle', t).textContent = it.subtitle;
    String(i + 1).padStart(2, '0').split('').forEach(function (ch, n) { reels[n].style.transform = 'translateY(' + (-Number(ch) * 10) + '%)'; });
    live.textContent = (it.title || it.alt) + ', ' + (i + 1) + ' de ' + count;
  }

  // ── estado e física ──
  var S = { angle: 0, velocity: 0, target: null, dir: -1, press: null, drag: false, hover: false,
            pointer: { inside: false, x: 0, y: 0 }, yaw: 0, pitch: 0, intro: null, introDone: false,
            holdUntil: 0, suppressClick: false, wheelTimer: 0, fit: 1, shift: 0, drop: 0, last: 0 };
  var ready = false, active = -1, raf = 0, visible = true;
  function nearest(a) { return Math.round(a / step) * step; }

  function measure() {
    var rect = root.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var room = O.captions ? CAPTION_SPACE : 0, width = rect.width * 0.94, height = (rect.height - room) * 0.92, P = O.perspective;
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    var corners = [[-cardW / 2, -cardH / 2], [cardW / 2, -cardH / 2], [-cardW / 2, cardH / 2], [cardW / 2, cardH / 2]];
    for (var a = -180; a <= 180; a += 7.5) {
      for (var c = 0; c < 4; c++) {
        var p = rotX(rotY([corners[c][0], corners[c][1], radius], a), O.tilt);
        p = [p[0], p[1], p[2] - radius];
        if (p[2] >= P * 0.95) continue;
        var kk = P / (P - p[2]);
        minX = Math.min(minX, p[0] * kk); maxX = Math.max(maxX, p[0] * kk);
        minY = Math.min(minY, p[1] * kk); maxY = Math.max(maxY, p[1] * kk);
      }
    }
    var fit = Math.min(1, width / Math.max(maxX - minX, 1), height / Math.max(maxY - minY, 1));
    S.fit = fit;
    S.shift = -((minY + maxY) / 2) * fit - room / 2;
    S.drop = (rect.height / fit) * 0.55 + cardH;
    stage.style.perspective = P + 'px';
    stage.style.transform = 'translate3d(0,' + S.shift + 'px,0) scale(' + fit + ')';
  }

  function introCard(elapsed, landing) {
    if (!S.intro) return 0;
    var reach = Math.abs(wrap(landing + S.angle)), delay = (reach / 180) * 480;
    return (1 - easeOutQuint(clamp((elapsed - delay) / 900, 0, 1))) * S.drop;
  }

  function advance(dt, now) {
    if (!S.introDone && ready) {
      if (!S.intro) { if (O.intro === 'none') S.introDone = true; else S.intro = { start: now }; }
      if (S.intro && now - S.intro.start >= INTRO_LENGTH[O.intro]) { S.intro = null; S.introDone = true; }
    }
    var paused = (O.pauseOnHover && S.hover) || S.drag || now < S.holdUntil;
    var cruise = O.autoplay === 'drift' && !paused && !S.intro ? O.speed * S.dir : 0;
    var busy = Boolean(S.intro) || S.drag;
    if (S.drag || S.intro) {
      if (!S.drag) S.velocity = 0;
    } else if (S.target !== null) {
      var rem = dt, damping = 2 * Math.sqrt(SPRING);
      while (rem > 0) {
        var h = Math.min(rem, 1 / 240), acc = SPRING * (S.target - S.angle) - damping * S.velocity;
        S.velocity += acc * h; S.angle += S.velocity * h; rem -= h;
      }
      if (Math.abs(S.target - S.angle) < 0.004 && Math.abs(S.velocity) < 0.03) { S.angle = S.target; S.velocity = 0; S.target = null; }
      busy = true;
    } else {
      var tau = 0.18 + O.momentum * 1.5;
      S.velocity += (cruise - S.velocity) * (1 - Math.exp(-dt / tau));
      S.angle += S.velocity * dt;
      if (cruise === 0 && O.snap && Math.abs(S.velocity) < SETTLE_SPEED) S.target = nearest(S.angle);
      busy = busy || cruise !== 0 || Math.abs(S.velocity) > 0.01 || S.target !== null;
    }
    if (now < S.holdUntil) busy = true;
    var ease = 1 - Math.exp(-dt / 0.35);
    var aimYaw = S.pointer.inside ? S.pointer.x * O.parallax * 9 : 0;
    var aimPitch = S.pointer.inside ? -S.pointer.y * O.parallax * 6 : 0;
    S.yaw += (aimYaw - S.yaw) * ease; S.pitch += (aimPitch - S.pitch) * ease;
    if (Math.abs(aimYaw - S.yaw) > 0.01 || Math.abs(aimPitch - S.pitch) > 0.01) busy = true;
    return busy;
  }

  function render(now) {
    var elapsed = S.intro ? now - S.intro.start : 0;
    var swell = 1 + O.stretch * 0.12 * Math.min(1, Math.abs(S.velocity) / 420);
    var R = radius * swell;
    camera.style.transform = 'translate3d(0,0,' + (-R) + 'px) rotateX(' + (O.tilt + S.pitch) + 'deg) rotateY(' + S.yaw + 'deg)';
    ring.style.transform = 'rotateY(' + S.angle + 'deg)';
    for (var i = 0; i < count; i++) {
      var base = i * step, lift = introCard(elapsed, base);
      cards[i].style.transform = 'rotateY(' + base + 'deg) translateZ(' + R + 'px)' + (lift ? ' translateY(' + lift + 'px)' : '');
      var facing = Math.cos(wrap(base + S.angle) * TO_RAD);
      cards[i].style.setProperty('--cc-depth', (O.depthFade * Math.pow((1 - facing) / 2, 1.25)).toFixed(3));
    }
    var idx = ((Math.round(-S.angle / step) % count) + count) % count || 0;
    if (idx !== active) { active = idx; legenda(idx); }
  }

  function frame(now) {
    raf = 0;
    var dt = S.last ? Math.min((now - S.last) / 1000, 0.05) : 1 / 60;
    S.last = now;
    var busy = advance(dt, now);
    render(now);
    if (busy && visible && !document.hidden) raf = requestAnimationFrame(frame);
    else S.last = 0;
  }
  function wake() { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame); }

  // ── eventos ──
  function focusIndex(i) {
    var target = -i * step;
    target += 360 * Math.round((S.angle - target) / 360);
    S.target = target; S.holdUntil = performance.now() + 2800; wake();
  }
  function stepBy(delta) {
    var base = S.target !== null ? S.target : nearest(S.angle);
    S.target = base - delta * step; S.holdUntil = performance.now() + 2800; wake();
  }
  function updatePointer(e) {
    var r = root.getBoundingClientRect();
    S.pointer.x = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
    S.pointer.y = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
  }
  root.addEventListener('pointerdown', function (e) {
    S.suppressClick = false;
    if (e.button !== 0) return;
    S.press = { id: e.pointerId, x: e.clientX, y: e.clientY, angle: S.angle, moved: false, origin: 0,
                samples: [{ time: performance.now(), angle: S.angle }] };
  });
  root.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'mouse') { S.pointer.inside = true; updatePointer(e); }
    var p = S.press;
    if (!p || p.id !== e.pointerId) { wake(); return; }
    var delta = e.clientX - p.x, cross = e.clientY - p.y;
    if (!p.moved) {
      if (Math.abs(delta) < DRAG_THRESHOLD) return;
      // no toque, gesto mais vertical que horizontal é rolagem da página
      if (Math.abs(cross) > Math.abs(delta) * 1.2 && e.pointerType !== 'mouse') { S.press = null; return; }
      p.moved = true; p.origin = delta; S.drag = true; S.target = null; S.velocity = 0;
      root.setAttribute('data-dragging', '');
      try { root.setPointerCapture(e.pointerId); } catch (err) { /* sem captura */ }
    }
    var perPixel = 180 / (Math.PI * radius * S.fit);
    S.angle = p.angle + (delta - p.origin) * perPixel;
    var now = performance.now();
    p.samples.push({ time: now, angle: S.angle });
    while (p.samples.length > 2 && now - p.samples[0].time > 110) p.samples.shift();
    wake();
  });
  function release(e) {
    var p = S.press;
    if (!p || p.id !== e.pointerId) return;
    S.press = null;
    if (!p.moved) return;
    S.drag = false; root.removeAttribute('data-dragging'); S.suppressClick = true;
    var a = p.samples[0], b = p.samples[p.samples.length - 1], span = (b.time - a.time) / 1000;
    var vel = span > 0.008 ? clamp((b.angle - a.angle) / span, -1400, 1400) : 0;
    S.velocity = vel;
    if (Math.abs(vel) > 60) S.dir = Math.sign(vel);
    var coasting = O.autoplay === 'drift' && !(O.pauseOnHover && S.hover && e.pointerType === 'mouse');
    if (O.snap && !coasting) {
      var tau = 0.18 + O.momentum * 1.5;
      S.target = Math.round((S.angle + vel * tau * 0.55) / step) * step;
    }
    wake();
  }
  root.addEventListener('pointerup', release);
  root.addEventListener('pointercancel', release);
  root.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') { S.hover = true; wake(); } });
  root.addEventListener('pointerleave', function (e) {
    if (e.pointerType === 'mouse') { S.hover = false; S.pointer.inside = false; }
    wake();
  });
  root.addEventListener('click', function (e) {
    if (S.suppressClick) { S.suppressClick = false; return; }
    var card = e.target.closest && e.target.closest('[data-cc-index]');
    if (card) focusIndex(Number(card.getAttribute('data-cc-index')));
  });
  root.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') stepBy(1);
    else if (e.key === 'ArrowLeft') stepBy(-1);
    else if (e.key === 'Home') focusIndex(0);
    else if (e.key === 'End') focusIndex(count - 1);
    else return;
    e.preventDefault();
  });
  root.addEventListener('wheel', function (e) {
    var delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0;
    if (!delta) return;              // rolagem vertical continua sendo da página
    e.preventDefault();
    var perPixel = 180 / (Math.PI * radius * S.fit);
    S.target = null; S.angle -= delta * perPixel; S.velocity = -delta * perPixel * 30;
    S.holdUntil = performance.now() + 1600;
    clearTimeout(S.wheelTimer);
    S.wheelTimer = setTimeout(function () { if (O.snap) S.target = nearest(S.angle + S.velocity * 0.12); wake(); }, 140);
    wake();
  }, { passive: false });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; S.last = 0; } else wake();
  });
  if ('ResizeObserver' in window) new ResizeObserver(function () { measure(); wake(); }).observe(root);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (visible) wake(); else { cancelAnimationFrame(raf); raf = 0; S.last = 0; }
    }).observe(root);
  }

  // ── liga: a lista some, o anel entra quando as fotos carregaram ──
  root.classList.add('is-on');
  lista.hidden = true;
  measure();
  render(performance.now());
  legenda(0);

  // só começa a carregar e entrar quando a galeria se aproxima da tela
  var comecou = false;
  function comeca() {
    if (comecou) return; comecou = true;
    var timeout = new Promise(function (r) { setTimeout(r, 2400); });
    var cargas = itens.map(function (it) {
      return new Promise(function (r) {
        var im = new Image(); im.decoding = 'async';
        im.onload = function () { im.decode ? im.decode().then(r, r) : r(); };
        im.onerror = r; im.src = it.src;
      });
    });
    Promise.race([Promise.all(cargas), timeout]).then(function () {
      ready = true; root.setAttribute('data-ready', ''); S.introDone = false; S.intro = null; wake();
    });
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); comeca(); } }, { rootMargin: '300px 0px' });
    io.observe(root);
  } else comeca();
})();
