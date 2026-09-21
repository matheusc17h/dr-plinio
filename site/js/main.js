/* ═══════════════════════════════════════════════════════════
   main.js — GSAP + ScrollTrigger + Draggable
   Dr. Plínio Mota · Odontologia Estética
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var CFG = window.CLINICA || {};
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MOBILE_Q = window.matchMedia('(max-width: 720px)');
  var FINE = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  gsap.registerPlugin(ScrollTrigger, Draggable);
  gsap.config({ nullTargetWarn: false });

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ───────────────────────────────────────────────
     1. WHATSAPP — todos os CTAs em um lugar só
     ─────────────────────────────────────────────── */
  function initWhatsapp() {
    var num = (CFG.whatsapp || '').replace(/\D/g, '');
    var placeholder = !num || /^55110{9}$/.test(num);

    if (placeholder) {
      console.warn('[config] Defina o WhatsApp real em js/config.js → CLINICA.whatsapp');
    }

    $$('.js-wa').forEach(function (el) {
      var msg = el.getAttribute('data-wa-msg') || 'Olá! Vim pelo site.';
      var href = 'https://wa.me/' + num + '?text=' + encodeURIComponent(msg);
      el.setAttribute('href', href);
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener');
      if (placeholder) el.setAttribute('data-wa-placeholder', 'true');
    });

    var fp = $('#footPhone');
    if (fp) {
      if (CFG.telefoneExibido) {
        fp.textContent = CFG.telefoneExibido;
      } else {
        var br = fp.previousElementSibling;
        if (br && br.tagName === 'BR') br.remove();
        fp.remove();
      }
    }
    var yr = $('#yr'); if (yr) yr.textContent = new Date().getFullYear();
  }

  /* ───────────────────────────────────────────────
     2. PLAYLIST DO HERO
        Os clipes tocam em sequência e repetem, com
        crossfade entre dois <video> empilhados.
        Os cortes (ini/fim) são aplicados na reprodução,
        então não dependem de reexportar os arquivos.
     ─────────────────────────────────────────────── */
  function initHeroPlaylist() {
    var frame  = $('#heroFrame');
    var slots  = $$('.frame__video', frame);
    var steps  = $('#heroSteps');
    var lista  = (CFG.heroPlaylist || []).slice();
    if (!frame || slots.length < 2 || !lista.length) return;

    var FADE = Math.max(0, CFG.heroFade == null ? 0.9 : CFG.heroFade);

    // Conexão lenta ou economia de dados: fica só no primeiro clipe.
    var con = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    var economia = con && (con.saveData || /^([23]g|slow-2g)$/.test(con.effectiveType || ''));
    if (CFG.heroRespeitaDadosMoveis !== false && economia) lista = lista.slice(0, 1);

    // Sem movimento: poster estático, nenhum byte de vídeo baixado.
    if (REDUCED) { slots.forEach(function (v) { v.removeAttribute('preload'); }); return; }

    // traços de progresso
    var barras = [];
    if (steps) {
      steps.innerHTML = '';
      lista.forEach(function () {
        var i = document.createElement('i');
        steps.appendChild(i); barras.push(i);
      });
      if (lista.length < 2) steps.style.display = 'none';
    }

    var idx = 0;            // clipe em cena
    var ativo = 0;          // slot em cena
    var trocando = false;
    var barraTween = null;

    function clipe(i) { return lista[i % lista.length]; }

    // Posiciona o clipe no ponto de entrada e só resolve quando
    // o seek realmente aconteceu — senão o play começa do zero.
    function posiciona(v, t) {
      return new Promise(function (resolve) {
        if (Math.abs(v.currentTime - t) < 0.05) return resolve(v);
        var done = function () { clearTimeout(tm); v.removeEventListener('seeked', done); resolve(v); };
        var tm = setTimeout(done, 1200);
        v.addEventListener('seeked', done);
        try { v.currentTime = t; } catch (e) { done(); }
      });
    }

    // Carrega um clipe num slot e resolve quando dá para tocar.
    function carrega(slot, c) {
      var v = slots[slot];
      if (v.dataset.src === c.src && v.readyState >= 2) return posiciona(v, c.ini);

      return new Promise(function (resolve, reject) {
        var ok = function () { cleanup(); resolve(posiciona(v, c.ini)); };
        var no = function () { cleanup(); reject(new Error('falhou: ' + c.src)); };
        function cleanup() {
          v.removeEventListener('loadeddata', ok);
          v.removeEventListener('error', no);
        }
        v.addEventListener('loadeddata', ok);
        v.addEventListener('error', no);
        v.dataset.src = c.src;
        v.preload = 'auto';
        v.src = c.src;
        v.load();
      });
    }

    // Deixa o próximo clipe pronto no slot que saiu de cena.
    // Só depois do crossfade: um load() durante a transição
    // apagaria o vídeo que ainda está aparecendo.
    function preparaProximo() {
      if (lista.length < 2) return;
      var prox = clipe(idx + 1);
      var outro = slots[1 - ativo];
      if (outro.dataset.src === prox.src) return;
      outro.preload = 'auto';
      outro.dataset.src = prox.src;
      outro.src = prox.src;
      outro.load();
    }

    function animaBarra(i, dur) {
      if (!barras.length) return;
      if (barraTween) barraTween.kill();
      barras.forEach(function (b, n) { b.style.setProperty('--p', n < i ? 1 : 0); });
      barraTween = gsap.fromTo(barras[i], { '--p': 0 }, { '--p': 1, duration: dur, ease: 'none' });
    }

    // Toca o clipe `i` no slot oculto e faz o crossfade.
    function vai(i, primeiro) {
      var c = clipe(i);
      var destino = primeiro ? ativo : 1 - ativo;

      return carrega(destino, c).then(function (v) {
        var p = v.play();
        if (p && p.catch) p.catch(function () {});

        var saindo = slots[ativo];

        ativo = destino;
        idx = i % lista.length;
        trocando = false;
        animaBarra(idx, Math.max(0.1, c.fim - c.ini));

        // overwrite: um fade novo sempre cancela o anterior no
        // mesmo elemento, senão os dois brigam pela opacidade.
        gsap.to(v, { opacity: 1, duration: FADE, ease: 'power2.inOut', overwrite: 'auto' });

        if (primeiro) {
          frame.classList.add('is-playing');
          gsap.delayedCall(FADE, preparaProximo);
        } else {
          gsap.to(saindo, {
            opacity: 0, duration: FADE, ease: 'power2.inOut', overwrite: 'auto',
            onComplete: function () { saindo.pause(); preparaProximo(); }
          });
        }
      });
    }

    // Vigia o tempo do slot em cena e dispara a troca.
    slots.forEach(function (v, n) {
      v.addEventListener('timeupdate', function () {
        if (n !== ativo || trocando) return;
        var c = clipe(idx);
        var fim = Math.min(c.fim, v.duration || c.fim);
        if (v.currentTime >= fim - FADE) {
          trocando = true;
          vai(idx + 1, false).catch(function (e) {
            console.warn('[hero] ' + e.message + ' — pulando');
            trocando = false;
            if (lista.length > 1) vai(idx + 2, false).catch(function () {});
          });
        }
      });
    });

    vai(0, true).catch(function (e) {
      console.warn('[hero] ' + e.message + ' — fica o poster.');
    });

    // Não gasta CPU com o hero fora da tela.
    var naTela = true;
    function sincroniza() {
      var v = slots[ativo];
      if (naTela && !document.hidden) {
        var p = v.play(); if (p && p.catch) p.catch(function () {});
      } else {
        v.pause();
      }
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        naTela = es[0].isIntersecting;
        sincroniza();
      }, { threshold: 0.05 }).observe(frame);
    }
    // Voltar para a aba não dispara o IntersectionObserver:
    // sem isto o vídeo ficaria congelado ao retomar.
    document.addEventListener('visibilitychange', sincroniza);
  }

  /* ───────────────────────────────────────────────
     3. CURSOR
     ─────────────────────────────────────────────── */
  function initCursor() {
    if (!FINE || REDUCED) return;
    var c = $('#cursor'); if (!c) return;
    var dot = $('.cursor__dot', c), ring = $('.cursor__ring', c);

    var dx = gsap.quickTo(dot, 'x', { duration: 0.14, ease: 'power3' });
    var dy = gsap.quickTo(dot, 'y', { duration: 0.14, ease: 'power3' });
    var rx = gsap.quickTo(ring, 'x', { duration: 0.55, ease: 'power3' });
    var ry = gsap.quickTo(ring, 'y', { duration: 0.55, ease: 'power3' });

    window.addEventListener('pointermove', function (e) {
      dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY);
    }, { passive: true });

    $$('a, button, .ba, .cards__viewport').forEach(function (el) {
      el.addEventListener('pointerenter', function () {
        gsap.to(ring, { scale: 1.7, opacity: 0.5, duration: 0.4, ease: 'power3' });
      });
      el.addEventListener('pointerleave', function () {
        gsap.to(ring, { scale: 1, opacity: 1, duration: 0.4, ease: 'power3' });
      });
    });
  }

  /* ───────────────────────────────────────────────
     4. BOTÕES MAGNÉTICOS
     ─────────────────────────────────────────────── */
  function initMagnetic() {
    if (!FINE || REDUCED) return;
    $$('.js-magnetic').forEach(function (el) {
      var xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1, 0.45)' });
      var yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1, 0.45)' });
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * 0.34);
        yTo((e.clientY - (r.top + r.height / 2)) * 0.5);
      });
      el.addEventListener('pointerleave', function () { xTo(0); yTo(0); });
    });
  }

  /* ───────────────────────────────────────────────
     5. NAV + MENU MOBILE
     ─────────────────────────────────────────────── */
  function initNav() {
    var nav = $('#nav'), burger = $('#burger'), menu = $('#menu');

    ScrollTrigger.create({
      start: 'top -80',
      onUpdate: function (self) { nav.classList.toggle('is-stuck', self.scroll() > 80); },
      onRefresh: function (self) { nav.classList.toggle('is-stuck', self.scroll() > 80); }
    });

    if (!burger || !menu) return;
    var open = false;
    var tl = gsap.timeline({ paused: true })
      .to(menu, { clipPath: 'inset(0 0 0% 0)', duration: 0.8, ease: 'power4.inOut' })
      .from($$('.menu__links a', menu), { yPercent: 110, opacity: 0, stagger: 0.06, duration: 0.6, ease: 'power3.out' }, '-=0.4')
      .from($('.menu__foot', menu), { opacity: 0, y: 20, duration: 0.5 }, '-=0.35');

    function toggle(state) {
      open = (state === undefined) ? !open : state;
      burger.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-hidden', String(!open));
      menu.classList.toggle('is-open', open);
      document.body.classList.toggle('is-locked', open);
      open ? tl.play() : tl.reverse();
    }

    burger.addEventListener('click', function () { toggle(); });
    $$('.menu a', menu).forEach(function (a) { a.addEventListener('click', function () { toggle(false); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) toggle(false); });
  }

  /* ───────────────────────────────────────────────
     6. ABERTURA + ENTRADA DO HERO
        Uma única sequência: monograma → cortina →
        vídeo → título linha a linha.
     ─────────────────────────────────────────────── */
  function initIntro(hasGL) {
    var loader = $('#loader');
    var heroLines = $$('.hero__title .l > span');
    var heroRs    = $$('.hero .r > span');
    var frame     = $('#heroFrame');
    var badge     = $('#heroBadge');

    // estado inicial (imediato, evita flash)
    gsap.set(heroLines, { yPercent: 118 });
    gsap.set(heroRs, { yPercent: 105, opacity: 0 });
    gsap.set(frame, { clipPath: 'inset(100% 0% 0% 0%)' });
    gsap.set(badge, { scale: 0, opacity: 0 });
    gsap.set('#waFloat', { scale: 0 });

    if (REDUCED) {
      gsap.set([heroLines, heroRs], { clearProps: 'all' });
      gsap.set(frame, { clipPath: 'inset(0% 0% 0% 0%)' });
      gsap.set([badge, '#waFloat'], { scale: 1, opacity: 1 });
      if (loader) loader.classList.add('is-done');
      return;
    }

    var ring = $('.mono__ring'), pP = $('.mono__p'), pM = $('.mono__m');
    [pP, pM].forEach(function (p) {
      if (!p) return;
      var len = p.getTotalLength();
      gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
    });

    var tl = gsap.timeline({ delay: 0.15 });

    // a marca se desenha
    tl.from(ring, { scale: 0.4, opacity: 0, duration: 0.9, ease: 'power3.out', transformOrigin: '50% 50%' })
      .to([pP, pM], { strokeDashoffset: 0, duration: 0.9, ease: 'power2.inOut', stagger: 0.12 }, '-=0.6')
      .to('.loader__bar i', { scaleX: 1, duration: 0.9, ease: 'power2.inOut' }, '-=0.8')
      .to('.loader__mark', { opacity: 0, scale: 0.94, duration: 0.5, ease: 'power2.in' }, '+=0.1')
      .to('.loader__bar', { opacity: 0, duration: 0.3 }, '<')

      // a cortina abre
      .to('.loader__curtain--l', { xPercent: -101, duration: 1.05, ease: 'power4.inOut' }, '-=0.15')
      .to('.loader__curtain--r', { xPercent: 101, duration: 1.05, ease: 'power4.inOut' }, '<')
      .add(function () { if (loader) loader.classList.add('is-done'); })

      // o campo de luz nasce
      .to({ v: 0 }, {
        v: 1, duration: 1.4, ease: 'power2.out',
        onUpdate: function () { if (hasGL) window.HeroScene.setIntro(this.targets()[0].v); }
      }, '-=0.9')

      // o vídeo sobe
      .to(frame, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.25, ease: 'power4.inOut' }, '-=1.15')
      .from(frame, { scale: 1.12, duration: 1.6, ease: 'power3.out' }, '<')

      // o título, linha a linha
      .to(heroLines, { yPercent: 0, duration: 1.15, ease: 'power4.out', stagger: 0.09 }, '-=1.0')
      .to(heroRs, { yPercent: 0, opacity: 1, duration: 0.9, ease: 'power3.out', stagger: 0.1 }, '-=0.75')
      .to(badge, { scale: 1, opacity: 1, duration: 0.8, ease: 'back.out(1.7)' }, '-=0.6')
      .to('#waFloat', { scale: 1, duration: 0.7, ease: 'back.out(1.8)' }, '-=0.4');

    return tl;
  }

  /* ───────────────────────────────────────────────
     7. REVELAÇÕES NO SCROLL
     ─────────────────────────────────────────────── */
  function initReveals() {
    if (REDUCED) return;

    // títulos em máscara de linha (fora do hero)
    $$('.h2').forEach(function (h) {
      var lines = $$('.l > span', h);
      gsap.set(lines, { yPercent: 118 });
      ScrollTrigger.create({
        trigger: h, start: 'top 85%', once: true,
        onEnter: function () {
          gsap.to(lines, { yPercent: 0, duration: 1.15, ease: 'power4.out', stagger: 0.08 });
        }
      });
    });

    // blocos genéricos
    $$('.rv').forEach(function (el) {
      if (el.classList.contains('h2')) return;
      var inner = el.children.length === 1 && el.firstElementChild.tagName === 'SPAN'
        ? el.firstElementChild : el;
      gsap.set(inner, { y: 34, opacity: 0 });
      ScrollTrigger.create({
        trigger: el, start: 'top 88%', once: true,
        onEnter: function () {
          gsap.to(inner, { y: 0, opacity: 1, duration: 1, ease: 'power3.out' });
        }
      });
    });

    // etapas em cascata
    ScrollTrigger.create({
      trigger: '.steps', start: 'top 80%', once: true,
      onEnter: function () {
        gsap.fromTo('.step', { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 1, ease: 'power3.out', stagger: 0.12 });
      }
    });

    // galeria
    ScrollTrigger.create({
      trigger: '.gal', start: 'top 85%', once: true,
      onEnter: function () {
        gsap.fromTo('.gal__it', { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 1.05, ease: 'power3.out', stagger: 0.09 });
      }
    });

    // cards entrando
    ScrollTrigger.create({
      trigger: '.cards__viewport', start: 'top 82%', once: true,
      onEnter: function () {
        gsap.fromTo('.card', { y: 70, opacity: 0 }, { y: 0, opacity: 1, duration: 1.05, ease: 'power3.out', stagger: 0.09 });
      }
    });
  }

  /* ───────────────────────────────────────────────
     8. PARALLAX + HERO NO SCROLL
     ─────────────────────────────────────────────── */
  function initParallax(hasGL) {
    if (REDUCED) return;

    $$('[data-speed]').forEach(function (img) {
      var s = parseFloat(img.getAttribute('data-speed')) || 1;
      gsap.fromTo(img,
        { yPercent: (1 - s) * 22 },
        {
          yPercent: (s - 1) * 22, ease: 'none',
          scrollTrigger: { trigger: img.closest('section') || img, start: 'top bottom', end: 'bottom top', scrub: 1 }
        });
    });

    // o hero cede lugar: vídeo recua, texto sobe, luz apaga
    gsap.timeline({
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 }
    })
      .to('.hero__copy', { yPercent: -18, opacity: 0.25, ease: 'none' }, 0)
      .to('#heroFrameWrap', { yPercent: 9, scale: 0.94, ease: 'none' }, 0);

    if (hasGL) {
      ScrollTrigger.create({
        trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true,
        onUpdate: function (self) { window.HeroScene.setScroll(self.progress); }
      });
    }

    // marquee: rola sozinho e acelera conforme o scroll
    var track = $('#marqueeTrack');
    if (track) {
      var half = track.scrollWidth / 2;
      var loop = gsap.to(track, { x: -half, duration: 26, ease: 'none', repeat: -1 });
      ScrollTrigger.create({
        trigger: '.marquee', start: 'top bottom', end: 'bottom top',
        onUpdate: function (self) {
          gsap.to(loop, { timeScale: 1 + Math.abs(self.getVelocity()) / 2200, duration: 0.3, overwrite: true });
        }
      });
    }
  }

  /* ───────────────────────────────────────────────
     9. CONTADORES
     ─────────────────────────────────────────────── */
  function initCounters() {
    $$('.stats dt').forEach(function (dt) {
      var end = parseFloat(dt.getAttribute('data-count')) || 0;
      var suf = dt.getAttribute('data-suffix') || '';
      if (REDUCED) { dt.textContent = end + suf; return; }
      var o = { v: 0 };
      ScrollTrigger.create({
        trigger: dt, start: 'top 90%', once: true,
        onEnter: function () {
          gsap.to(o, {
            v: end, duration: 1.8, ease: 'power2.out',
            onUpdate: function () { dt.textContent = Math.round(o.v) + suf; }
          });
        }
      });
    });
  }

  /* ───────────────────────────────────────────────
     10. ANTES & DEPOIS
     ─────────────────────────────────────────────── */
  function initBeforeAfter() {
    var ba = $('#ba'), clip = $('#baClip'), handle = $('#baHandle');
    if (!ba || !clip || !handle) return;

    var pct = 50;

    function apply(p, animate) {
      pct = Math.max(0, Math.min(100, p));
      handle.setAttribute('aria-valuenow', Math.round(pct));
      var o = { clipPath: 'inset(0 ' + (100 - pct) + '% 0 0)' };
      if (animate) {
        gsap.to(clip, Object.assign(o, { duration: 0.5, ease: 'power3.out' }));
        gsap.to(handle, { left: pct + '%', duration: 0.5, ease: 'power3.out' });
      } else {
        gsap.set(clip, o);
        gsap.set(handle, { left: pct + '%' });
      }
    }

    function fromX(clientX) {
      var r = ba.getBoundingClientRect();
      apply(((clientX - r.left) / r.width) * 100, false);
    }

    var dragging = false;
    ba.addEventListener('pointerdown', function (e) {
      dragging = true; ba.setPointerCapture(e.pointerId); fromX(e.clientX);
    });
    ba.addEventListener('pointermove', function (e) { if (dragging) fromX(e.clientX); });
    ['pointerup', 'pointercancel'].forEach(function (ev) {
      ba.addEventListener(ev, function () { dragging = false; });
    });

    // no desktop, passar o mouse já revela — sem precisar clicar
    if (FINE) {
      ba.addEventListener('pointermove', function (e) { if (!dragging) fromX(e.clientX); });
      ba.addEventListener('pointerleave', function () { if (!dragging) apply(50, true); });
    }

    handle.addEventListener('keydown', function (e) {
      var step = e.shiftKey ? 10 : 4;
      if (e.key === 'ArrowLeft') { apply(pct - step, true); e.preventDefault(); }
      if (e.key === 'ArrowRight') { apply(pct + step, true); e.preventDefault(); }
    });

    apply(50, false);

    // entrada: varre de ponta a ponta uma vez, mostrando o que faz
    if (!REDUCED) {
      ScrollTrigger.create({
        trigger: ba, start: 'top 72%', once: true,
        onEnter: function () {
          gsap.timeline()
            .to({ v: 50 }, {
              v: 92, duration: 1.1, ease: 'power2.inOut',
              onUpdate: function () { apply(this.targets()[0].v, false); }
            })
            .to({ v: 92 }, {
              v: 18, duration: 1.3, ease: 'power2.inOut',
              onUpdate: function () { apply(this.targets()[0].v, false); }
            })
            .to({ v: 18 }, {
              v: 50, duration: 0.9, ease: 'power3.out',
              onUpdate: function () { apply(this.targets()[0].v, false); }
            });
        }
      });
    }
  }

  /* ───────────────────────────────────────────────
     11. CARDS — arraste horizontal
     ─────────────────────────────────────────────── */
  function initCards() {
    var vp = $('#cardsViewport'), track = $('#cardsTrack');
    if (!vp || !track) return;

    var drag = null;

    function build() {
      if (drag) { drag.kill(); drag = null; }
      var overflow = track.scrollWidth - vp.clientWidth;
      if (overflow <= 0) { gsap.set(track, { x: 0 }); return; }

      drag = Draggable.create(track, {
        type: 'x',
        bounds: { minX: -overflow, maxX: 0 },
        edgeResistance: 0.75,
        dragClickables: true,
        cursor: 'grab',
        activeCursor: 'grabbing'
      })[0];
    }

    build();
    ScrollTrigger.addEventListener('refreshInit', build);

    // roda do mouse na horizontal
    vp.addEventListener('wheel', function (e) {
      if (!drag) return;
      var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0;
      if (!d) return;
      e.preventDefault();
      var x = gsap.getProperty(track, 'x') - d;
      gsap.to(track, { x: gsap.utils.clamp(drag.minX, drag.maxX, x), duration: 0.4, ease: 'power3.out' });
    }, { passive: false });
  }

  /* ───────────────────────────────────────────────
     12. TILT NAS IMAGENS
     ─────────────────────────────────────────────── */
  function initTilt() {
    if (!FINE || REDUCED) return;
    $$('.tilt').forEach(function (el) {
      var rx = gsap.quickTo(el, 'rotationX', { duration: 0.7, ease: 'power3' });
      var ry = gsap.quickTo(el, 'rotationY', { duration: 0.7, ease: 'power3' });
      gsap.set(el, { transformPerspective: 900, transformOrigin: '50% 50%' });
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        ry(((e.clientX - (r.left + r.width / 2)) / r.width) * 11);
        rx(-((e.clientY - (r.top + r.height / 2)) / r.height) * 11);
      });
      el.addEventListener('pointerleave', function () { rx(0); ry(0); });
    });
  }

  /* ───────────────────────────────────────────────
     13. ÂNCORAS SUAVES
     ─────────────────────────────────────────────── */
  function initAnchors() {
    $$('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = a.getAttribute('href');
        if (id === '#' || id.length < 2) return;
        var t = document.querySelector(id);
        if (!t) return;
        e.preventDefault();
        var top = t.getBoundingClientRect().top + window.pageYOffset - ($('#nav').offsetHeight - 8);
        window.scrollTo({ top: top, behavior: REDUCED ? 'auto' : 'smooth' });
      });
    });
  }

  /* ───────────────────────────────────────────────
     BOOT
     ─────────────────────────────────────────────── */
  function boot() {
    var hasGL = false;
    try { hasGL = window.HeroScene && window.HeroScene.init($('#gl')); } catch (e) { hasGL = false; }
    if (!hasGL) {
      // sem WebGL o hero continua elegante, só sem o campo de luz
      var c = $('#gl');
      if (c) c.style.background = 'radial-gradient(120% 90% at 65% 35%, #241f1a 0%, #14141A 62%)';
    }

    initWhatsapp();
    initHeroPlaylist();
    initCursor();
    initMagnetic();
    initNav();
    initIntro(hasGL);
    initReveals();
    initParallax(hasGL);
    initCounters();
    initBeforeAfter();
    initCards();
    initTilt();
    initAnchors();

    window.addEventListener('load', function () { ScrollTrigger.refresh(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
