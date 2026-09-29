/* ═══════════════════════════════════════════════════════════
   main.js — GSAP + ScrollTrigger + ScrollSmoother + Draggable
   Dr. Plínio Mota · Odontologia Estética
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var CFG = window.CLINICA || {};
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MOBILE_Q = window.matchMedia('(max-width: 720px)');
  var FINE = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  gsap.registerPlugin(ScrollTrigger, Draggable);
  if (window.ScrollSmoother) gsap.registerPlugin(ScrollSmoother);
  if (window.SplitText) gsap.registerPlugin(SplitText);
  var smoother = null;
  gsap.config({ nullTargetWarn: false });
  // a barra de endereço do celular aparece/some a cada rolagem; recalcular
  // todos os triggers (e o pin dos depoimentos) nisso causa engasgo
  ScrollTrigger.config({ ignoreMobileResize: true });

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
        // o HTML ja traz o numero (funciona sem JS); aqui so garantimos
        // que ele continue igual ao config, que e a fonte da verdade
        fp.textContent = CFG.telefoneExibido;
        if (num) fp.setAttribute('href', 'tel:+' + num);
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
     2b. CAMPO DE LUZ TAPADO
         No mobile a moldura do vídeo é full-bleed e opaca
         (tem fundo próprio): depois que ela sobe na abertura,
         o canvas por baixo não aparece — até o scroll encolher
         a moldura e revelar as bordas. Só nesse intervalo
         vale a pena desenhar.
     ─────────────────────────────────────────────── */
  var heroCover = { gl: false, revelado: false, progresso: 0 };

  function syncHeroCover() {
    if (!heroCover.gl) return;
    window.HeroScene.setCovered(
      MOBILE_Q.matches && heroCover.revelado && heroCover.progresso < 0.001
    );
  }
  if (MOBILE_Q.addEventListener) MOBILE_Q.addEventListener('change', syncHeroCover);
  else if (MOBILE_Q.addListener) MOBILE_Q.addListener(syncHeroCover);

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
      // com o smoother o overflow do body não trava a rolagem
      if (smoother) smoother.paused(open);
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
      .to(frame, {
        clipPath: 'inset(0% 0% 0% 0%)', duration: 1.25, ease: 'power4.inOut',
        onComplete: function () { heroCover.revelado = true; syncHeroCover(); }
      }, '-=1.15')
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
  /* ───────────────────────────────────────────────
     DEPOIMENTOS — seção presa na tela; cada card entra por
     um lado, fica tempo suficiente para ser lido e sai
     subindo enquanto o próximo chega pelo lado oposto.
     Criado antes dos outros triggers: o pin empurra a página
     e quem vem depois precisa medir já com esse espaço.
     ─────────────────────────────────────────────── */
  function initDepoimentos() {
    var sec = $('#depoimentos');
    if (!sec || REDUCED) return;
    var cards = $$('.depo__card', sec);
    var num = $('#depoNum'), bar = $('#depoBar'), atual = 1;
    sec.classList.add('is-live');

    gsap.set(cards, { xPercent: -50, yPercent: -50, autoAlpha: 0 });

    var tl = gsap.timeline({
      defaults: { ease: 'power2.out', force3D: true },
      scrollTrigger: {
        trigger: sec, start: 'top top',
        end: function () { return '+=' + window.innerHeight * cards.length * 0.5; },
        pin: true, scrub: smoother ? true : 0.6, anticipatePin: smoother ? 0 : 1, invalidateOnRefresh: true,
        onUpdate: function (self) {
          var i = Math.min(cards.length, Math.floor(self.progress * cards.length) + 1);
          // só mexe no texto quando o número muda: reescrever a cada
          // quadro de scroll invalida o layout à toa
          if (i !== atual) { atual = i; num.textContent = (i < 10 ? '0' : '') + i; }
          gsap.set(bar, { scaleX: self.progress });
        }
      }
    });

    cards.forEach(function (card, i) {
      var lado = i % 2 === 0 ? -1 : 1;           // esquerda, direita, esquerda...
      var rot = parseFloat(getComputedStyle(card).getPropertyValue('--r')) || 0;
      var at = i * 2.1;                           // o próximo chega enquanto o anterior sai

      tl.fromTo(card,
        { x: lado * 140, y: 50, rotation: rot + lado * 6, autoAlpha: 0 },
        { x: 0, y: 0, rotation: rot, autoAlpha: 1, duration: 1 }, at);

      // o último card fica na tela até a seção soltar
      if (i < cards.length - 1) {
        tl.to(card, { y: -70, x: lado * -30, autoAlpha: 0, duration: 0.9, ease: 'power1.in' }, at + 1.7);
      }
    });
    tl.to({}, { duration: 0.3 });                 // respiro final antes de liberar o scroll
  }

  /* Random letter reveal: o título é quebrado em letras (SplitText),
     todas começam invisíveis e acendem em ordem aleatória
     quando o título entra na tela — "trabalho" pode mostrar r, a, l, o
     primeiro. Toca uma vez, no próprio tempo, sem seguir o scroll.
     Quebrar por palavra também mantém cada palavra inteira na linha;
     o <em> dourado é preservado e o SplitText põe aria-label no título. */
  function initLetras(h) {
    var split = new SplitText($$('.l > span', h), { type: 'words,chars', tag: 'span' });
    gsap.set(split.chars, { opacity: 0 });
    ScrollTrigger.create({
      trigger: h, start: 'top 82%', once: true,
      onEnter: function () {
        // amount: o título inteiro acende em ~1,4s, seja qual for o nº de letras
        gsap.to(split.chars, { opacity: 1, duration: 0.5, ease: 'power1.out', stagger: { amount: 1.4, from: 'random' } });
      }
    });
  }

  function initReveals() {
    if (REDUCED) return;

    // títulos em máscara de linha (fora do hero)
    $$('.h2').forEach(function (h) {
      if (h.hasAttribute('data-letters') && window.SplitText) return initLetras(h);
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

    // etapas 01 → 02 → 03, uma de cada vez, guiadas pelo scroll:
    // a próxima só começa quando a anterior terminou de entrar
    var steps = $$('.step');
    if (steps.length) {
      gsap.set(steps, { y: 60, opacity: 0 });
      var tlSteps = gsap.timeline({
        scrollTrigger: {
          trigger: '.steps', start: 'top 82%', end: 'bottom 60%',
          scrub: smoother ? true : 0.6
        }
      });
      steps.forEach(function (st, i) {
        tlSteps.to(st, { y: 0, opacity: 1, duration: 1, ease: 'power2.out' }, i);
      });
    }

    // galeria
    ScrollTrigger.create({
      trigger: '.gal', start: 'top 85%', once: true,
      onEnter: function () {
        gsap.fromTo('.gal__it', { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 1.05, ease: 'power3.out', stagger: 0.09 });
      }
    });

    // dúvidas: uma pergunta de cada vez, com pausa entre elas —
    // o "+" gira para o lugar logo depois da pergunta chegar,
    // e o convite do WhatsApp só entra quando a lista terminou
    var faqIts = $$('.faq__it'), faqIcos = $$('.faq__ico'), faqCta = $('.faq__cta');
    gsap.set(faqIts, { x: 60, opacity: 0 });
    gsap.set(faqIcos, { scale: 0, rotation: -90 });
    gsap.set(faqCta, { y: 30, opacity: 0 });
    ScrollTrigger.create({
      trigger: '.faq__list', start: 'top 78%', once: true,
      onEnter: function () {
        var tl = gsap.timeline();
        faqIts.forEach(function (it, i) {
          var t = i * 0.32;
          tl.to(it, { x: 0, opacity: 1, duration: 0.9, ease: 'power3.out' }, t)
            .to(faqIcos[i], { scale: 1, rotation: 0, duration: 0.7, ease: 'back.out(2)', clearProps: 'transform' }, t + 0.3);
        });
        tl.to(faqCta, { y: 0, opacity: 1, duration: 0.9, ease: 'power3.out' }, '-=0.3');
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
        onUpdate: function (self) {
          window.HeroScene.setScroll(self.progress);
          heroCover.progresso = self.progress;
          syncHeroCover();
        }
      });
    }

    // marquee: rola sozinho e acelera conforme o scroll.
    // Fora da tela fica pausado — é um loop sem emenda, então
    // retomar de onde parou é visualmente idêntico.
    var track = $('#marqueeTrack');
    if (track) {
      var half = track.scrollWidth / 2;
      var loop = gsap.to(track, { x: -half, duration: 26, ease: 'none', repeat: -1, paused: true });
      ScrollTrigger.create({
        trigger: '.marquee', start: 'top bottom', end: 'bottom top',
        onToggle: function (self) { self.isActive ? loop.play() : loop.pause(); },
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
    // o valor final vem escrito no HTML: sem JS, com GSAP fora do ar ou
    // com movimento reduzido, o numero aparece do mesmo jeito. A animacao
    // e enfeite, nunca o unico caminho ate o conteudo.
    if (REDUCED || !window.gsap || !window.ScrollTrigger) return;

    $$('.stats dt').forEach(function (dt) {
      var end = parseFloat(dt.getAttribute('data-count'));
      if (!isFinite(end)) return;
      var suf = dt.getAttribute('data-suffix') || '';
      var o = { v: 0 };
      ScrollTrigger.create({
        trigger: dt, start: 'top 90%', once: true,
        onEnter: function () {
          dt.textContent = '0' + suf;            // zera so na hora de animar
          gsap.to(o, {
            v: end, duration: 1.8, ease: 'power2.out',
            onUpdate: function () { dt.textContent = Math.round(o.v) + suf; },
            onComplete: function () { dt.textContent = end + suf; }
          });
        }
      });
    });
  }

  /* ───────────────────────────────────────────────
     10. ANTES & DEPOIS
     ─────────────────────────────────────────────── */
  function initBeforeAfter() {
    var ba = $('#ba'), clip = $('#baClip'), handle = $('#baHandle'), rail = $('#baRail');
    if (!ba || !clip || !handle || !rail) return;
    var clipImg = $('.ba__img', clip);

    var pct = 50;

    // Recorte só com transform: a "janela" (clip, overflow:hidden) anda
    // para a esquerda e a foto dentro dela anda o mesmo tanto para a
    // direita, então a imagem fica parada e só a borda do recorte se move.
    // O trilho leva a alça junto. Nada de left/clip-path → sem layout nem
    // repaint a cada movimento. (x:0 zera o translate que o CSS usa como
    // estado inicial sem JS, para não somar com o xPercent.)
    function alvos(p) {
      return [
        [clip,    { xPercent: p - 100, x: 0 }],
        [clipImg, { xPercent: 100 - p, x: 0 }],
        [rail,    { xPercent: p - 50,  x: 0 }]
      ];
    }

    function apply(p, animate) {
      pct = Math.max(0, Math.min(100, p));
      handle.setAttribute('aria-valuenow', Math.round(pct));
      alvos(pct).forEach(function (a) {
        if (animate) gsap.to(a[0], Object.assign(a[1], { duration: 0.5, ease: 'power3.out' }));
        else gsap.set(a[0], a[1]);
      });
    }

    // a caixa do comparador só é medida ao começar a interação,
    // nunca a cada movimento do ponteiro
    var caixa = null;
    function mede() {
      var r = ba.getBoundingClientRect();
      caixa = { left: r.left + window.pageXOffset, width: r.width };
    }
    window.addEventListener('resize', function () { caixa = null; });

    function fromX(clientX) {
      if (!caixa) mede();
      apply(((clientX + window.pageXOffset - caixa.left) / caixa.width) * 100, false);
    }

    var dragging = false;
    ba.addEventListener('pointerenter', mede);
    ba.addEventListener('pointerdown', function (e) {
      mede();
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
     11. CARDS — scroll horizontal: a seção fica presa e a
     rolagem vertical leva a fileira para o lado. Criado logo
     depois dos depoimentos pelo mesmo motivo: o pin empurra
     a página e os triggers seguintes medem com esse espaço.
     Com movimento reduzido, volta ao arraste.
     ─────────────────────────────────────────────── */
  function initCards() {
    var vp = $('#cardsViewport'), track = $('#cardsTrack');
    if (!vp || !track) return;

    var sec = vp.closest('.cards');

    // As fotos dos cards são lazy, mas as que ficam além da borda
    // direita estão recortadas pelo overflow da seção e o navegador
    // só as baixaria no meio do movimento. Libera todas antes de a
    // seção chegar à tela.
    ScrollTrigger.create({
      trigger: sec, start: 'top bottom+=600', once: true,
      onEnter: function () { $$('img[loading="lazy"]', track).forEach(function (i) { i.loading = 'eager'; }); }
    });

    // quanto a fileira precisa andar para o último card encostar
    // na margem direita (a mesma respiração lateral da página)
    function distancia() {
      var cs = getComputedStyle(vp);
      var util = vp.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return Math.max(0, track.scrollWidth - util);
    }

    if (!REDUCED) {
      // .is-h vira a seção num palco de uma tela: título em cima,
      // fileira no meio, contador embaixo — nada das vizinhas aparece
      sec.classList.add('is-h');
      var cards = $$('.card', track);
      var num = $('#cardsNum'), bar = $('#cardsBar'), atual = 1;

      var move = gsap.to(track, {
        x: function () { return -distancia(); },
        ease: 'none',
        scrollTrigger: {
          trigger: sec, start: 'top top',
          end: function () { return '+=' + distancia(); },
          pin: true, scrub: smoother ? true : 0.6, anticipatePin: smoother ? 0 : 1, invalidateOnRefresh: true,
          onUpdate: function (self) {
            var i = Math.round(self.progress * (cards.length - 1)) + 1;
            if (i !== atual) { atual = i; num.textContent = (i < 10 ? '0' : '') + i; }
            gsap.set(bar, { scaleX: self.progress });
          }
        }
      });

      // parallax dentro de cada card: a foto anda um pouco menos que a
      // moldura enquanto ela atravessa a tela
      cards.forEach(function (card) {
        var img = $('img', card);
        if (!img) return;
        gsap.set(img, { scale: 1.16 });
        gsap.fromTo(img, { xPercent: -6 }, {
          xPercent: 6, ease: 'none',
          scrollTrigger: {
            trigger: card, containerAnimation: move,
            start: 'left right', end: 'right left', scrub: true
          }
        });
      });
      return;
    }

    var drag = null;

    function build() {
      if (drag) { drag.kill(); drag = null; }
      var overflow = distancia();
      // todos os cards cabem: sem arraste, sem aviso de "arraste"
      sec.classList.toggle('is-static', overflow <= 0);
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
     13. DÚVIDAS (acordeão)
     ─────────────────────────────────────────────── */
  function initFaq() {
    var list = $('#faqList');
    if (!list) return;
    var items = $$('.faq__it', list);

    function setOpen(it, open) {
      var btn = $('.faq__q', it);
      it.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      // o painel fechado sai da árvore de acessibilidade junto com a animação
      $('.faq__a', it).setAttribute('aria-hidden', open ? 'false' : 'true');
    }

    // Os triggers abaixo da lista precisam ser remedidos, mas só depois
    // que a altura terminou de animar (.55s no CSS): medir no clique
    // pegaria a altura antiga, e refresh é caro para rodar à toa.
    var refreshTm = null;
    function refreshDepois() {
      if (!window.ScrollTrigger) return;
      clearTimeout(refreshTm);
      refreshTm = setTimeout(function () { ScrollTrigger.refresh(); }, 600);
    }

    items.forEach(function (it) {
      setOpen(it, false);
      $('.faq__q', it).addEventListener('click', function () {
        var willOpen = !it.classList.contains('is-open');
        // um por vez: duas respostas abertas viram parede de texto
        items.forEach(function (o) { if (o !== it) setOpen(o, false); });
        setOpen(it, willOpen);
        refreshDepois();
      });
    });

    // teclado: setas percorrem as perguntas
    list.addEventListener('keydown', function (e) {
      var k = e.key;
      if (k !== 'ArrowDown' && k !== 'ArrowUp' && k !== 'Home' && k !== 'End') return;
      var btns = $$('.faq__q', list);
      var i = btns.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      var n = k === 'ArrowDown' ? i + 1 : k === 'ArrowUp' ? i - 1 : k === 'Home' ? 0 : btns.length - 1;
      btns[(n + btns.length) % btns.length].focus();
    });
  }

  /* ───────────────────────────────────────────────
     14. ÂNCORAS SUAVES
     ─────────────────────────────────────────────── */
  function initAnchors() {
    $$('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = a.getAttribute('href');
        if (id === '#' || id.length < 2) return;
        var t = document.querySelector(id);
        if (!t) return;
        e.preventDefault();
        var folga = $('#nav').offsetHeight - 8;
        if (smoother) { smoother.scrollTo(t, true, 'top ' + folga + 'px'); return; }
        var top = t.getBoundingClientRect().top + window.pageYOffset - folga;
        window.scrollTo({ top: top, behavior: REDUCED ? 'auto' : 'smooth' });
      });
    });
  }

  /* ───────────────────────────────────────────────
     BOOT
     ─────────────────────────────────────────────── */
  /* ───────────────────────────────────────────────
     SCROLL SMOOTHER — rolagem com inércia. Precisa nascer
     antes de qualquer ScrollTrigger. No toque fica a rolagem
     nativa (smoothTouch desligado): o dedo já tem inércia e
     atraso ali parece travamento.
     ─────────────────────────────────────────────── */
  function initSmoother() {
    // Só toque (celular/tablet): nem cria. Mesmo com smoothTouch
    // desligado ele segue transformando o conteúdo, e as seções presas
    // (depoimentos, diferenciais) tremem contra a rolagem nativa.
    if (REDUCED || ScrollTrigger.isTouch === 1 || !window.ScrollSmoother || !$('#smooth-wrapper')) return;
    smoother = ScrollSmoother.create({
      wrapper: '#smooth-wrapper', content: '#smooth-content',
      smooth: 1.1, smoothTouch: false, effects: false
    });
    document.documentElement.classList.add('has-smoother');

    // position:sticky não funciona dentro do conteúdo transformado:
    // no desktop o título das dúvidas passa a ser preso pelo ScrollTrigger
    gsap.matchMedia().add('(min-width: 1081px)', function () {
      var head = $('.faq__head'), list = $('#faqList');
      if (!head || !list) return;
      var topo = function () { return $('#nav').offsetHeight + 32; };
      ScrollTrigger.create({
        trigger: head, start: function () { return 'top ' + topo(); },
        endTrigger: list, end: function () { return 'bottom ' + (topo() + head.offsetHeight); },
        pin: true, pinSpacing: false, invalidateOnRefresh: true
      });
    });
  }

  function boot() {
    initSmoother();
    var hasGL = false;
    try { hasGL = window.HeroScene && window.HeroScene.init($('#gl')); } catch (e) { hasGL = false; }
    heroCover.gl = hasGL;
    // a altura do hero pode mudar sem resize da janela (fontes carregando)
    if (hasGL) ScrollTrigger.addEventListener('refresh', window.HeroScene.resize);
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
    initDepoimentos();
    initCards();
    initReveals();
    initParallax(hasGL);
    initCounters();
    initBeforeAfter();
    initTilt();
    initFaq();
    initAnchors();

    window.addEventListener('load', function () { ScrollTrigger.refresh(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
