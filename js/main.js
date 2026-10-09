/* ═══════════════════════════════════════════════════════════
   main.js — GSAP + ScrollTrigger + ScrollSmoother + Draggable
   Dr. Plínio Mota · Odontologia Estética
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var CFG = window.CLINICA || {};
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MOBILE_Q = window.matchMedia('(max-width: 720px)');
  // a partir daqui o hero usa a composição editorial (vídeo 4:5 + detalhe)
  var COMPOSICAO_Q = window.matchMedia('(min-width: 768px)');
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

    function comeca() {
      vai(0, true).catch(function (e) {
        console.warn('[hero] ' + e.message + ' — fica o poster.');
      });
    }
    // a partir de 768px o poster é o LCP: o vídeo só baixa depois do load
    if (COMPOSICAO_Q.matches && document.readyState !== 'complete') {
      window.addEventListener('load', comeca, { once: true });
    } else comeca();

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
  var heroCover = { gl: false, revelado: false, progresso: 0, intro: 0 };

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

    // só aparece no primeiro movimento do mouse, já na posição dele (sem
    // voar do canto da tela), e some quando o mouse sai da janela
    var ligado = false;
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      if (!ligado) {
        gsap.set([dot, ring], { x: e.clientX, y: e.clientY });
        c.classList.add('is-on'); ligado = true;
      }
      dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY);
    }, { passive: true });
    document.addEventListener('pointerout', function (e) {
      if (!e.relatedTarget) { c.classList.remove('is-on'); ligado = false; }
    });
    window.addEventListener('blur', function () { c.classList.remove('is-on'); ligado = false; });

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
    // o painel desce com transform (sem clip-path: ver o CSS de .menu, bug do iOS).
    // visibility liga no começo da abertura e desliga no fim do fechamento.
    // y:0 zera o translateY(-100%) do CSS (estado sem JS); senão o GSAP soma os dois
    gsap.set(menu, { y: 0, yPercent: -100 });
    var tl = gsap.timeline({ paused: true })
      .set(menu, { visibility: 'visible' })
      .to(menu, { yPercent: 0, duration: 0.8, ease: 'power4.inOut' })
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
  function initIntro() {
    var loader = $('#loader');
    var heroLines = $$('.hero__title .l > span');
    var heroRs    = $$('.hero .r > span');
    var frame     = $('#heroFrame');

    // estado inicial (imediato, evita flash)
    gsap.set(heroLines, { yPercent: 118 });
    gsap.set(heroRs, { yPercent: 105, opacity: 0 });
    gsap.set(frame, { clipPath: 'inset(100% 0% 0% 0%)' });
    gsap.set('#waFloat', { scale: 0 });
    var composicao = COMPOSICAO_Q.matches;
    var detalhe = $('.hero__detalhe'), credito = $('.hero__credito');

    if (REDUCED) {
      var heroEl = $('.hero'); if (heroEl) heroEl.classList.add('neon-on');
      gsap.set([heroLines, heroRs], { clearProps: 'all' });
      gsap.set(frame, { clipPath: 'inset(0% 0% 0% 0%)' });
      gsap.set('#waFloat', { scale: 1, opacity: 1 });
      if (loader) loader.classList.add('is-done');
      return;
    }
    if (composicao) gsap.set([detalhe, credito], { y: 26, autoAlpha: 0 });

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
        onUpdate: function () {
          heroCover.intro = this.targets()[0].v;
          if (heroCover.gl) window.HeroScene.setIntro(heroCover.intro);
        }
      }, '-=0.9')
      .addLabel('midia', '-=1.15')
      // tubo de neon do hero (>=768px) acende e a luz revela texto e mídia
      .add(function () { var h = $('.hero'); if (h) h.classList.add('neon-on'); }, 'midia-=0.35');

    if (composicao) {
      // >=768px: a principal abre de baixo para cima; o detalhe entra 0,3s depois
      tl.to(frame, {
        clipPath: 'inset(0% 0% 0% 0%)', duration: 1.2, ease: 'power3.out',
        onComplete: function () { heroCover.revelado = true; syncHeroCover(); }
      }, 'midia')
        .to(detalhe, { y: 0, autoAlpha: 1, duration: 0.9, ease: 'power3.out' }, 'midia+=0.3')
        .to(credito, { y: 0, autoAlpha: 1, duration: 0.9, ease: 'power3.out' }, 'midia+=0.5');
    } else {
      // celular: o vídeo em tela cheia sobe (como sempre foi)
      tl.to(frame, {
        clipPath: 'inset(0% 0% 0% 0%)', duration: 1.25, ease: 'power4.inOut',
        onComplete: function () { heroCover.revelado = true; syncHeroCover(); }
      }, 'midia')
        .from(frame, { scale: 1.12, duration: 1.6, ease: 'power3.out' }, '<');
    }

    // o título, linha a linha
    tl
      .to(heroLines, { yPercent: 0, duration: 1.15, ease: 'power4.out', stagger: 0.09 }, '-=1.0')
      .to(heroRs, { yPercent: 0, opacity: 1, duration: 0.9, ease: 'power3.out', stagger: 0.1 }, '-=0.75')
      .to('#waFloat', { scale: 1, duration: 0.7, ease: 'back.out(1.8)' }, '-=0.5');

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

  /* ───────────────────────────────────────────────
     MANIFESTO — as palavras da frase acendem em sequência com o
     scroll (scrub). Só opacity por palavra: barato até no iPhone.
     Lado a lado (>=1081px, mouse): a seção fica presa só o tempo da
     frase completar (+70% da tela). Celular/tablet: sem pin (evita
     o pulo do iOS), o scrub acompanha a frase passando na tela.
     autoSplit refaz o split no resize/troca de fonte e recria a
     animação no mesmo progresso; aria:'auto' deixa a frase original
     no aria-label e esconde os pedaços do leitor de tela.
     Movimento reduzido ou sem SplitText: frase já revelada (CSS).
     ─────────────────────────────────────────────── */
  function initManifesto() {
    var frase = $('.manifesto__frase');
    if (!frase || REDUCED || !window.SplitText) return;
    var sec = frase.closest('.manifesto');
    var prende = window.matchMedia('(min-width: 1081px)').matches && ScrollTrigger.isTouch !== 1;

    SplitText.create(frase, {
      type: 'words', aria: 'auto', autoSplit: true,
      onSplit: function (self) {
        return gsap.fromTo(self.words, { opacity: 0.18 }, {
          opacity: 1, duration: 0.3, ease: 'none', stagger: 0.12,
          scrollTrigger: prende
            ? {
                trigger: sec, start: 'top top', end: '+=70%', scrub: smoother ? true : 0.6,
                pin: true, anticipatePin: smoother ? 0 : 1, invalidateOnRefresh: true,
                refreshPriority: 1     // primeiro pin da página: mede antes dos de baixo
              }
            : { trigger: frase, start: 'top 82%', end: 'bottom 42%', scrub: 0.6 }
        });
      }
    });
  }

  /* ───────────────────────────────────────────────
     SOBRE — uma coisa de cada vez, sem atropelar:
     foto do doutor → rótulo → título (letras) →
     1º parágrafo → 2º parágrafo (linhas subindo pela máscara) →
     destaques (o 300 conta aqui) → botão.
     Lado a lado (>=1081px): a foto vem da esquerda e o texto segue
     na mesma timeline. Empilhado: a foto vem da esquerda e o texto
     tem a própria timeline quando chega na tela.
     ─────────────────────────────────────────────── */
  function initSobre() {
    var sec = $('.sobre');
    if (!sec || REDUCED) return;
    var media = $('.sobre__media', sec), copy = $('.sobre__copy', sec);
    var dr = $('.par', sec);
    var eyebrow = $('.eyebrow > span', sec), h = $('.h2', sec);
    var paras = $$('.prose p', sec), stats = $('.stats', sec), btn = $('.btn', copy);
    var num = $('.stats [data-count]', sec);
    var SPLIT = !!window.SplitText;

    var letras = SPLIT && h.hasAttribute('data-letters') ? initLetras(h, true) : null;
    var tituloLinhas = $$('.l > span', h);
    if (!letras) gsap.set(tituloLinhas, { yPercent: 118 });

    // parágrafos em linhas com máscara; sem SplitText, cada um sobe inteiro
    var splits = [];
    var linhas = paras.map(function (p) {
      if (!SPLIT) return [p];
      var sp = new SplitText(p, { type: 'lines', mask: 'lines' });
      splits.push(sp);
      return sp.lines;
    });
    linhas.forEach(function (ls) { gsap.set(ls, SPLIT ? { yPercent: 105 } : { y: 30, opacity: 0 }); });

    gsap.set(eyebrow, { yPercent: 105 });
    gsap.set([stats, btn], { y: 34, opacity: 0 });

    // acrescenta o texto à timeline, na ordem, a partir de `at`
    function texto(tl, at) {
      tl.to(eyebrow, { yPercent: 0, duration: 0.9, ease: 'power4.out' }, at);
      if (letras) tl.add(letras.play(), at + 0.25);
      else tl.to(tituloLinhas, { yPercent: 0, duration: 1.15, ease: 'power4.out', stagger: 0.08 }, at + 0.25);
      // 1º parágrafo quando o título já acendeu quase todo; o 2º depois do 1º
      var t = at + 1.45;
      linhas.forEach(function (ls) {
        tl.to(ls, SPLIT
          ? { yPercent: 0, duration: 0.9, ease: 'power3.out', stagger: 0.09 }
          : { y: 0, opacity: 1, duration: 0.9, ease: 'power3.out' }, t);
        t += 0.9 + (ls.length - 1) * 0.09 - 0.35;
      });
      // devolve o texto inteiro depois (resize, leitores de tela)
      tl.call(function () { splits.forEach(function (sp) { sp.revert(); }); }, null, t + 0.4);
      tl.to(stats, { y: 0, opacity: 1, duration: 0.9, ease: 'power3.out' }, t);
      if (num && num._conta) tl.call(num._conta, null, t + 0.15);
      tl.to(btn, { y: 0, opacity: 1, duration: 0.9, ease: 'power3.out', clearProps: 'transform,opacity' }, t + 0.45);
    }

    var lado = window.matchMedia('(min-width: 1081px)').matches;
    gsap.set(dr, { x: -90, autoAlpha: 0 });
    var fotos = gsap.timeline({ paused: true })
      .to(dr, { x: 0, autoAlpha: 1, duration: 1.2, ease: 'power3.out', clearProps: 'transform,opacity,visibility' }, 0);

    if (lado) {
      texto(fotos, 0.6);
      ScrollTrigger.create({ trigger: media, start: 'top 72%', once: true, onEnter: function () { fotos.play(); } });
    } else {
      var tl = gsap.timeline({ paused: true });
      texto(tl, 0);
      ScrollTrigger.create({ trigger: media, start: 'top 80%', once: true, onEnter: function () { fotos.play(); } });
      ScrollTrigger.create({ trigger: copy, start: 'top 85%', once: true, onEnter: function () { tl.play(); } });
    }
  }

  /* Random letter reveal: o título é quebrado em letras (SplitText),
     todas começam invisíveis e acendem em ordem aleatória
     quando o título entra na tela — "trabalho" pode mostrar r, a, l, o
     primeiro. Toca uma vez, no próprio tempo, sem seguir o scroll.
     Quebrar por palavra também mantém cada palavra inteira na linha;
     o <em> dourado é preservado e o SplitText põe aria-label no título. */
  // manual: devolve a animação pausada, para entrar numa timeline (ver initSobre)
  function initLetras(h, manual) {
    var split = new SplitText($$('.l > span', h), { type: 'words,chars', tag: 'span' });
    gsap.set(split.chars, { opacity: 0 });
    // amount: o título inteiro acende em ~1,4s, seja qual for o nº de letras
    var acende = { opacity: 1, duration: 0.5, ease: 'power1.out', stagger: { amount: 1.4, from: 'random' } };
    if (manual) return gsap.to(split.chars, Object.assign({ paused: true }, acende));
    ScrollTrigger.create({
      trigger: h, start: 'top 82%', once: true,
      onEnter: function () { gsap.to(split.chars, acende); }
    });
  }

  function initReveals() {
    if (REDUCED) return;

    // títulos em máscara de linha (fora do hero)
    $$('.h2').forEach(function (h) {
      if (h.closest('.sobre')) return;            // a seção Sobre tem a própria ordem (initSobre)
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

    // blocos: cada tipo entra de um jeito, para não virar o mesmo fade em tudo.
    // Rótulo sobe pela máscara como as linhas do título; foto e mapa abrem
    // de baixo para cima como a cortina da abertura; o resto sobe com fade.
    $$('.rv').forEach(function (el) {
      if (el.classList.contains('h2') || el.closest('.sobre')) return;
      var inner = el.children.length === 1 && el.firstElementChild.tagName === 'SPAN'
        ? el.firstElementChild : el;
      var de, para;
      if (el.classList.contains('eyebrow')) {
        de = { yPercent: 105 };
        para = { yPercent: 0, duration: 0.9, ease: 'power4.out' };
      } else if (el.tagName === 'FIGURE' || el.classList.contains('local__map')) {
        de = { clipPath: 'inset(100% 0 0 0)' };
        para = { clipPath: 'inset(0% 0 0 0)', duration: 1.3, ease: 'power4.inOut', clearProps: 'clipPath' };
      } else {
        de = { y: 34, opacity: 0 };
        para = { y: 0, opacity: 1, duration: 1, ease: 'power3.out' };
      }
      gsap.set(inner, de);
      ScrollTrigger.create({
        trigger: el, start: 'top 88%', once: true,
        onEnter: function () { gsap.to(inner, para); }
      });
    });

    // etapas: Diagnóstico → Clareamento → Acabamento, uma de cada vez.
    // Toca uma vez ao chegar na seção, no próprio tempo (não segue o
    // scroll, então não "desfaz" ao subir); os números ficam fixos.
    var steps = $$('.step');
    if (steps.length) {
      gsap.set(steps, { y: 50, opacity: 0 });
      ScrollTrigger.create({
        trigger: '.steps', start: 'top 80%', once: true,
        onEnter: function () {
          // stagger maior que meia duração: a próxima entra quando a anterior já assentou
          gsap.to(steps, { y: 0, opacity: 1, duration: 0.9, ease: 'power3.out', stagger: 0.55 });
        }
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

    // cards entrando; no fim o CSS assume (.is-ready) e o card ativo sobe
    ScrollTrigger.create({
      trigger: '.cards__viewport', start: 'top 82%', once: true,
      onEnter: function () {
        gsap.fromTo('.card', { y: 70, opacity: 0 }, {
          y: 0, opacity: 1, duration: 1.05, ease: 'power3.out', stagger: 0.09,
          onComplete: function () {
            $('.cards').classList.add('is-ready');
            gsap.set('.card', { clearProps: 'transform,opacity' });
          }
        });
      }
    });
  }

  /* ───────────────────────────────────────────────
     8. PARALLAX + HERO NO SCROLL
     ─────────────────────────────────────────────── */
  function initParallax() {
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
      .to('.hero__copy', { yPercent: -18, opacity: 0.25, ease: 'none' }, 0);
    if (COMPOSICAO_Q.matches) {
      // >=768px: parallax sutil; o detalhe sobe ~36px a mais que a principal
      gsap.timeline({ scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 } })
        .to('#heroFrameWrap', { y: 40, ease: 'none' }, 0)
        .to('.hero__detalhe', { y: -36, ease: 'none' }, 0);
    } else {
      gsap.to('#heroFrameWrap', {
        yPercent: 9, scale: 0.94, ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 }
      });
    }

    // o campo de luz chega depois (só no computador, ver ligaGL): o
    // progresso fica guardado e é repassado quando ele estiver pronto
    ScrollTrigger.create({
      trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true,
      onUpdate: function (self) {
        heroCover.progresso = self.progress;
        if (heroCover.gl) window.HeroScene.setScroll(self.progress);
        syncHeroCover();
      }
    });
  }

  /* ───────────────────────────────────────────────
     9. CONTADORES
     ─────────────────────────────────────────────── */
  function initCounters() {
    // o valor final vem escrito no HTML: sem JS, com GSAP fora do ar ou
    // com movimento reduzido, o numero aparece do mesmo jeito. A animacao
    // e enfeite, nunca o unico caminho ate o conteudo.
    if (REDUCED || !window.gsap || !window.ScrollTrigger) return;

    // o contador anima só o número (o "+ de" fica fixo ao lado, em outro span)
    $$('.stats [data-count]').forEach(function (dt) {
      var end = parseFloat(dt.getAttribute('data-count'));
      if (!isFinite(end)) return;
      var suf = dt.getAttribute('data-suffix') || '';
      var o = { v: 0 };
      function conta() {
        dt.textContent = '0' + suf;              // zera so na hora de animar
        gsap.to(o, {
          v: end, duration: 1.8, ease: 'power2.out',
          onUpdate: function () { dt.textContent = Math.round(o.v) + suf; },
          onComplete: function () { dt.textContent = end + suf; }
        });
      }
      // na seção Sobre o número conta quando os destaques entram (initSobre)
      if (dt.closest('.sobre')) { dt._conta = conta; return; }
      ScrollTrigger.create({ trigger: dt, start: 'top 90%', once: true, onEnter: conta });
    });
  }

  /* ───────────────────────────────────────────────
     10. ANTES & DEPOIS
     ─────────────────────────────────────────────── */
  // um comparador por .ba (o principal e o caso de facetas de resina)
  function initBeforeAfter() {
    $$('.ba').forEach(initComparador);
    initCasos();
  }

  // Casos da galeria: o par lado a lado vira comparador (mesmo design do
  // principal) no botão ou no clique no par; "Ver lado a lado" desfaz.
  function initCasos() {
    $$('.gcaso').forEach(function (caso) {
      var par = $('.gcaso__par', caso), ba = $('.ba', caso);
      var abre = $('.gcaso__abre', caso), volta = $('.gcaso__volta', caso);
      if (!par || !ba || !abre || !volta) return;

      // as fotos do comparador começam a carregar quando o par recebe o
      // mouse/toque, e a troca espera o decode: nunca aparece quadro vazio
      var fotos = $$('.ba__img', ba);
      function precarrega() { fotos.forEach(function (img) { img.loading = 'eager'; }); }
      function prontas() {
        precarrega();
        return Promise.all(fotos.map(function (img) {
          return img.decode ? img.decode().catch(function () {}) : null;
        }));
      }
      par.addEventListener('pointerenter', precarrega);
      par.addEventListener('touchstart', precarrega, { passive: true });
      abre.addEventListener('focus', precarrega);

      var ocupado = false;
      function troca(aberto) {
        if (ocupado) return;
        ocupado = true;
        if (aberto) { prontas().then(function () { troca2(true); }); return; }
        troca2(false);
      }

      // Troca sem pulo: o bloco do caso fica com a altura travada, o conteúdo
      // troca por fade cruzado e a altura anima até a nova. A página não rola
      // sozinha; o topo do caso fica parado e só o que vem abaixo desliza.
      function troca2(aberto) {
        var sai = aberto ? [par, abre] : [ba, volta], entra = aberto ? [ba, volta] : [par, abre];
        var t = REDUCED ? 0 : 1;
        abre.setAttribute('aria-expanded', aberto ? 'true' : 'false');
        gsap.set(caso, { height: caso.offsetHeight, overflow: 'hidden' });
        gsap.to(sai, {
          autoAlpha: 0, duration: 0.2 * t, ease: 'power1.out',
          onComplete: function () {
            sai.forEach(function (el) { el.hidden = true; });
            gsap.set(sai, { clearProps: 'opacity,visibility' });
            gsap.set(entra, { autoAlpha: 0 });
            entra.forEach(function (el) { el.hidden = false; });
            var altura = caso.scrollHeight;
            if (aberto && ba._varre) gsap.delayedCall(0.3 * t, ba._varre);
            gsap.timeline({
              onComplete: function () {
                gsap.set(caso, { clearProps: 'height,overflow' });
                ScrollTrigger.refresh();
                (aberto ? $('.ba__handle', ba) : abre).focus({ preventScroll: true });
                ocupado = false;
              }
            })
              .to(caso, { height: altura, duration: 0.55 * t, ease: 'power3.inOut' }, 0)
              .to(entra, { autoAlpha: 1, duration: 0.45 * t, ease: 'power1.out', clearProps: 'opacity,visibility' }, 0.1 * t);
          }
        });
      }

      par.addEventListener('click', function () { troca(true); });
      abre.addEventListener('click', function () { troca(true); });
      volta.addEventListener('click', function () { troca(false); });
    });
  }

  function initComparador(ba) {
    var clip = $('.ba__clip', ba), handle = $('.ba__handle', ba), rail = $('.ba__rail', ba);
    if (!clip || !handle || !rail) return;
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

    // varre de ponta a ponta uma vez, mostrando o que faz
    function varre() {
      if (REDUCED) return;
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
    ba._varre = varre;

    // entrada pelo scroll; os comparadores dos casos varrem ao abrir (initCasos)
    if (!ba.closest('.gcaso')) {
      ScrollTrigger.create({ trigger: ba, start: 'top 72%', once: true, onEnter: varre });
    }
  }

  /* ───────────────────────────────────────────────
     11. CARDS — carrossel no estilo Instagram: setas e
     bolinhas trocam o card em destaque, que fica centralizado,
     levantado e um pouco maior. Também troca com arraste
     (dedo ou mouse), teclado e clique num card vizinho.
     ─────────────────────────────────────────────── */
  function initCards() {
    var vp = $('#cardsViewport'), track = $('#cardsTrack');
    if (!vp || !track) return;

    var sec = vp.closest('.cards');
    var cards = $$('.card', track);
    var prev = $('#cardsPrev'), next = $('#cardsNext'), dotsBox = $('#cardsDots');
    var atual = 0;

    // sem animação de entrada (movimento reduzido) o CSS já assume
    if (REDUCED) sec.classList.add('is-ready');

    var dots = cards.map(function (card, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', 'Diferencial ' + (i + 1) + ' de ' + cards.length);
      b.addEventListener('click', function () { ir(i); });
      dotsBox.appendChild(b);
      return b;
    });

    // desloca a fileira para o centro do card ativo cair no centro da tela
    function posicao() {
      var c = cards[atual];
      return vp.clientWidth / 2 - (c.offsetLeft + c.offsetWidth / 2);
    }

    function ir(i, instantaneo) {
      atual = gsap.utils.clamp(0, cards.length - 1, i);
      cards.forEach(function (c, k) {
        c.classList.toggle('is-active', k === atual);
        c.setAttribute('aria-hidden', k === atual ? 'false' : 'true');
      });
      dots.forEach(function (d, k) { d.setAttribute('aria-current', k === atual ? 'true' : 'false'); });
      prev.disabled = atual === 0;
      next.disabled = atual === cards.length - 1;
      gsap.to(track, { x: posicao(), duration: instantaneo || REDUCED ? 0 : 0.8, ease: 'power3.out', overwrite: true });
    }

    prev.addEventListener('click', function () { ir(atual - 1); });
    next.addEventListener('click', function () { ir(atual + 1); });
    cards.forEach(function (c, k) {
      c.addEventListener('click', function () { if (k !== atual) ir(k); });
    });

    sec.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); ir(atual - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); ir(atual + 1); }
    });

    // arraste: passou de 50px para um lado, troca de card
    var x0 = null, arrastou = false;
    vp.addEventListener('pointerdown', function (e) { x0 = e.clientX; arrastou = false; });
    vp.addEventListener('pointerup', function (e) {
      if (x0 === null) return;
      var d = e.clientX - x0;
      x0 = null;
      if (Math.abs(d) < 50) return;
      arrastou = true;
      ir(atual + (d < 0 ? 1 : -1));
    });
    vp.addEventListener('pointercancel', function () { x0 = null; });
    // o clique que fecha um arraste não deve selecionar o card embaixo do dedo
    vp.addEventListener('click', function (e) {
      if (arrastou) { e.stopPropagation(); arrastou = false; }
    }, true);

    // roda do trackpad na horizontal
    var travado = false;
    vp.addEventListener('wheel', function (e) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 20) return;
      e.preventDefault();
      if (travado) return;
      travado = true;
      ir(atual + (e.deltaX > 0 ? 1 : -1));
      setTimeout(function () { travado = false; }, 600);
    }, { passive: false });

    ir(0, true);
    window.addEventListener('resize', function () { ir(atual, true); });
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
     BRILHO DE BORDA — porte do BorderGlow (React Bits) para JS puro.
     Mesmas contas do componente: quão perto da borda o cursor está
     (0–100) e o ângulo dele a partir do centro; o CSS (.bglow) faz o
     resto. Cores da marca: brilho champanhe e borda em dourado,
     champanhe e bronze. Só com mouse (no toque não há "perto da borda").
     ─────────────────────────────────────────────── */
  function initBordaBrilho() {
    if (!FINE) return;
    var BRILHO = { h: 40, s: 55, l: 74 };        // champanhe da logo, em HSL
    var INTENSIDADE = 1;
    var CORES = ['#C9A96A', '#E0C99A', '#8C6F3E'];  // --gold, --gold-soft, bronze
    var POS = ['80% 55%', '69% 34%', '8% 6%', '41% 38%', '86% 85%', '82% 18%', '51% 4%'];
    var MAPA = [0, 1, 2, 0, 1, 2, 1];
    var NOMES = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];

    function vars(el, fundo) {
      var base = BRILHO.h + 'deg ' + BRILHO.s + '% ' + BRILHO.l + '%';
      [[ '', 100 ], [ '-60', 60 ], [ '-50', 50 ], [ '-40', 40 ], [ '-30', 30 ], [ '-20', 20 ], [ '-10', 10 ]]
        .forEach(function (o) {
          el.style.setProperty('--glow-color' + o[0], 'hsl(' + base + ' / ' + Math.min(o[1] * INTENSIDADE, 100) + '%)');
        });
      NOMES.forEach(function (n, i) {
        el.style.setProperty('--gradient-' + n, 'radial-gradient(at ' + POS[i] + ', ' + CORES[MAPA[i]] + ' 0px, transparent 50%)');
      });
      el.style.setProperty('--gradient-base', 'linear-gradient(' + CORES[0] + ' 0 100%)');
      el.style.setProperty('--card-bg', fundo);
    }

    function proximidade(r, x, y) {
      var cx = r.width / 2, cy = r.height / 2, dx = x - cx, dy = y - cy;
      var kx = dx !== 0 ? cx / Math.abs(dx) : Infinity;
      var ky = dy !== 0 ? cy / Math.abs(dy) : Infinity;
      return Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);
    }
    function angulo(r, x, y) {
      var dx = x - r.width / 2, dy = y - r.height / 2;
      if (dx === 0 && dy === 0) return 0;
      var g = Math.atan2(dy, dx) * 180 / Math.PI + 90;
      return g < 0 ? g + 360 : g;
    }

    // fundo de cada card: a borda colorida cobre o miolo com esta cor
    [['.step', '#14141A'], ['.card', '#14141A'], ['.depo__card', '#1C1C23']].forEach(function (par) {
      $$(par[0]).forEach(function (el) {
        el.classList.add('bglow');
        vars(el, par[1]);
        var luz = document.createElement('span');
        luz.className = 'bglow__luz';
        luz.setAttribute('aria-hidden', 'true');
        el.appendChild(luz);
        el.addEventListener('pointermove', function (e) {
          var r = el.getBoundingClientRect();
          var x = e.clientX - r.left, y = e.clientY - r.top;
          el.style.setProperty('--edge-proximity', (proximidade(r, x, y) * 100).toFixed(3));
          el.style.setProperty('--cursor-angle', angulo(r, x, y).toFixed(3) + 'deg');
        });
      });
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
     RODAPÉ — uma sequência só, quando o rodapé aparece:
     a marca sobe, a frase entra pela direita e as três
     colunas aparecem uma de cada vez. Cada parte começa
     antes da anterior terminar (~2s no total).
     ─────────────────────────────────────────────── */
  function initRodape() {
    if (REDUCED) return;
    var logo = $('.foot__logo'), frase = $('.foot__claim'), cols = $$('.foot__grid > div');
    if (!logo || !frase || !cols.length) return;

    gsap.set(logo, { y: 50, autoAlpha: 0 });
    gsap.set(frase, { x: 90, autoAlpha: 0 });
    gsap.set(cols, { y: 28, autoAlpha: 0 });

    ScrollTrigger.create({
      trigger: '.foot', start: 'top 82%', once: true,
      onEnter: function () {
        gsap.timeline({ defaults: { ease: 'power3.out' } })
          .to(logo, { y: 0, autoAlpha: 1, duration: 0.9 })
          .to(frase, { x: 0, autoAlpha: 1, duration: 1 }, '-=0.55')
          .to(cols, { y: 0, autoAlpha: 1, duration: 0.7, stagger: 0.22 }, '-=0.45');
      }
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
    // Campo de luz: three.js e scene.js só são baixados no computador
    // (script no <head>) e podem chegar antes ou depois daqui.
    var canvasGL = $('#gl');
    function semGL() {
      // celular, sem WebGL ou CDN fora: o hero continua elegante, só sem o campo de luz
      if (canvasGL) canvasGL.style.background = 'radial-gradient(120% 90% at 65% 35%, #241f1a 0%, #14141A 62%)';
    }
    function ligaGL() {
      var ok = false;
      try { ok = window.HeroScene && window.HeroScene.init(canvasGL); } catch (e) { ok = false; }
      if (!ok) return semGL();
      heroCover.gl = true;
      // a altura do hero pode mudar sem resize da janela (fontes carregando)
      ScrollTrigger.addEventListener('refresh', window.HeroScene.resize);
      window.HeroScene.setScroll(heroCover.progresso);
      syncHeroCover();
      // chegou depois da abertura: a luz nasce no próprio tempo
      if (heroCover.intro >= 1) {
        gsap.fromTo({ v: 0 }, { v: 0 }, {
          v: 1, duration: 1.4, ease: 'power2.out',
          onUpdate: function () { window.HeroScene.setIntro(this.targets()[0].v); }
        });
      } else window.HeroScene.setIntro(heroCover.intro);
    }
    if (window.HeroScene) ligaGL();
    else if (document.querySelector('script[src$="js/scene.js"]')) {
      document.addEventListener('heroscene:pronto', ligaGL, { once: true });
    } else semGL();

    initWhatsapp();
    initHeroPlaylist();
    initCursor();
    initMagnetic();
    initNav();
    initIntro();
    initManifesto();
    initDepoimentos();
    initCards();
    initReveals();
    initParallax();
    initCounters();
    initSobre();
    initBeforeAfter();
    initTilt();
    initBordaBrilho();
    initFaq();
    initRodape();
    initAnchors();

    window.addEventListener('load', function () { ScrollTrigger.refresh(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
