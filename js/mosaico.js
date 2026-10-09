/* ═══════════════════════════════════════════════════════════
   mosaico.js — ondas atravessando um mosaico de ladrilhos (hero)
   Canvas 2D: uma grade de quadradinhos; duas ondas em direções
   diferentes passam por ela e, na crista, cada ladrilho cresce e
   ganha dourado. Repouso em grafite quase invisível, crista em
   dourado/champanhe; quase apagado atrás do texto (esquerda) e mais
   vivo atrás da mídia (direita).

   Só a partir de 768px (no celular o vídeo cobre o hero). Pausa fora
   da tela e com a aba oculta; com movimento reduzido, um quadro parado.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var canvas = document.querySelector('.hero__mosaico');
  if (!canvas) return;
  var MQ = window.matchMedia('(min-width: 768px)');
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // no celular nem começa; só se a tela crescer até 768px
  if (MQ.matches) iniciar();
  else if (MQ.addEventListener) {
    MQ.addEventListener('change', function espera() {
      if (!MQ.matches) return;
      MQ.removeEventListener('change', espera);
      iniciar();
    });
  }

  function iniciar() {
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var CELULA = 28, VAO = 3;                       // ladrilho e espaço entre eles (px CSS)
    var W = 0, H = 0, cols = 0, rows = 0, dpr = 1, fase = [];

    // variação fixa por ladrilho: o mosaico não pulsa todo igual
    function hash(i, j) { var x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return x - Math.floor(x); }

    function mede() {
      var r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(W / CELULA) + 1; rows = Math.ceil(H / CELULA) + 1;
      fase = [];
      for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) fase.push(hash(i, j) * 6.283);
    }

    function smooth(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

    function desenha(t) {
      ctx.clearRect(0, 0, W, H);
      var lado = CELULA - VAO;
      for (var j = 0; j < rows; j++) {
        var y = j * CELULA;
        // apagado logo abaixo da nav e some de vez no pé: o hero termina no mesmo
        // grafite liso em que o Propósito começa, sem emenda entre as seções
        var vert = smooth(0, H * 0.22, y) * (1 - smooth(H * 0.6, H * 0.96, y));
        for (var i = 0; i < cols; i++) {
          var x = i * CELULA;
          var k = j * cols + i;
          // duas ondas cruzando o mosaico + a defasagem de cada ladrilho
          var w = Math.sin((x * 0.8 + y * 0.45) / 95 - t * 0.85) +
                  0.65 * Math.sin((-x * 0.35 + y) / 130 - t * 0.55 + 1.7) +
                  0.25 * Math.sin(t * 1.3 + fase[k]);
          var crista = Math.pow(Math.max(0, (w + 1.9) / 3.8), 5);
          // máscara: quase nada atrás do texto, mais vivo à direita
          var m = (0.08 + 0.92 * smooth(W * 0.34, W * 0.86, x)) * vert;
          if (m < 0.02) continue;
          var s = lado * (0.42 + 0.58 * crista);       // ladrilho cresce na crista
          var o = (lado - s) / 2;
          // repouso: claro quase transparente; crista: dourado → champanhe
          var a = (0.03 + 0.26 * crista) * m;
          var g = Math.round(169 + 32 * crista), b = Math.round(106 + 48 * crista);
          ctx.fillStyle = crista > 0.12
            ? 'rgba(' + Math.round(201 + 23 * crista) + ',' + g + ',' + b + ',' + a.toFixed(3) + ')'
            : 'rgba(245,244,241,' + (0.03 * m).toFixed(3) + ')';
          ctx.fillRect(x + o, y + o, s, s);
        }
      }
    }

    var raf = null, inicio = performance.now(), naTela = true;
    function quadro(agora) {
      raf = null;
      desenha(REDUCED ? 4 : (agora - inicio) / 1000);
      if (!REDUCED) agenda();
    }
    function ativo() { return MQ.matches && naTela && !document.hidden; }
    function agenda() { if (raf === null && ativo()) raf = requestAnimationFrame(quadro); }
    function para() { if (raf !== null) { cancelAnimationFrame(raf); raf = null; } }
    function sync() { if (ativo()) agenda(); else para(); }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { naTela = es[0].isIntersecting; sync(); }).observe(canvas);
    }
    document.addEventListener('visibilitychange', sync);
    if (MQ.addEventListener) MQ.addEventListener('change', sync);
    var tm = 0;
    window.addEventListener('resize', function () {
      clearTimeout(tm);
      tm = setTimeout(function () { mede(); if (REDUCED) quadro(performance.now()); }, 120);
    });

    mede();
    quadro(performance.now());
  }
})();
