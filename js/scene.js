/* ═══════════════════════════════════════════════════════════
   scene.js — Three.js
   Campo de luz do hero: a refração da luz através do esmalte.
   Um único plano fullscreen com shader de cáusticas douradas.
   Reage ao mouse (foco de luz) e ao scroll (intensidade).
   Proposital, não decorativo: é a "luminosidade" do título.
   ═══════════════════════════════════════════════════════════ */

window.HeroScene = (function () {
  'use strict';

  var VERT = [
    'varying vec2 vUv;',
    'void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform float uTime;',
    'uniform vec2  uRes;',
    'uniform vec2  uMouse;',    // 0..1, suavizado
    'uniform float uScroll;',   // 0..1 progresso do hero
    'uniform float uIntro;',    // 0..1 revelacao da abertura

    'vec2 hash(vec2 p){',
    '  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));',
    '  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);',
    '}',

    'float noise(vec2 p){',
    '  vec2 i = floor(p), f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(dot(hash(i + vec2(0.0,0.0)), f - vec2(0.0,0.0)),',
    '                 dot(hash(i + vec2(1.0,0.0)), f - vec2(1.0,0.0)), u.x),',
    '             mix(dot(hash(i + vec2(0.0,1.0)), f - vec2(0.0,1.0)),',
    '                 dot(hash(i + vec2(1.0,1.0)), f - vec2(1.0,1.0)), u.x), u.y);',
    '}',

    'float fbm(vec2 p){',
    '  float v = 0.0, a = 0.5;',
    '  for(int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.02; a *= 0.5; }',
    '  return v;',
    '}',

    'void main(){',
    '  vec2 uv = vUv;',
    '  vec2 st = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);',
    '  float t = uTime * 0.045;',

    // domínio deformado: as bandas de luz que atravessam o esmalte
    '  vec2 q = vec2(fbm(st * 1.6 + t), fbm(st * 1.6 + vec2(3.2, 1.7) - t));',
    '  vec2 r = vec2(fbm(st * 2.1 + 3.0 * q + vec2(1.7, 9.2) + t * 1.4),',
    '                fbm(st * 2.1 + 3.0 * q + vec2(8.3, 2.8) - t * 1.1));',
    '  float f = fbm(st * 1.9 + 2.4 * r);',

    // cáusticas: cristas finas de luz
    '  float caustic = pow(abs(sin(f * 7.0 + t * 3.0)), 6.0);',

    // foco de luz seguindo o cursor
    '  vec2 m = (uMouse - 0.5) * vec2(uRes.x / uRes.y, 1.0);',
    '  float d = length(st - m);',
    '  float lamp = exp(-d * d * 3.4);',

    // vinheta para manter o centro respirando e as bordas fechadas
    '  float vig = smoothstep(1.05, 0.05, length(st));',

    '  vec3 ink    = vec3(0.078, 0.078, 0.102);',
    '  vec3 gold   = vec3(0.788, 0.663, 0.416);',
    '  vec3 pearl  = vec3(0.937, 0.890, 0.800);',

    '  float body = smoothstep(-0.35, 0.65, f);',
    '  vec3 col = ink;',
    '  col = mix(col, gold * 0.30, body * 0.20 * vig);',
    '  col = mix(col, pearl, caustic * 0.16 * vig * (0.30 + lamp));',
    '  col += gold * lamp * 0.085;',

    // grão fino, evita banding
    '  col += (fract(sin(dot(uv * uRes, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.022;',

    // scroll: a luz recua conforme a seção sai de cena
    '  col = mix(col, ink, uScroll * 0.85);',
    // abertura: o campo nasce do escuro
    '  col = mix(ink, col, uIntro);',

    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var renderer, scene, camera, mat, raf = null, running = false;
  var mouse = { x: 0.5, y: 0.5 }, target = { x: 0.5, y: 0.5 };
  var canvas, clock;

  function resize() {
    if (!renderer) return;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    mat.uniforms.uRes.value.set(w * dpr, h * dpr);
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (!running) return;
    // suavização do cursor — a luz tem inércia, nunca gruda no ponteiro
    mouse.x += (target.x - mouse.x) * 0.045;
    mouse.y += (target.y - mouse.y) * 0.045;
    mat.uniforms.uMouse.value.set(mouse.x, mouse.y);
    mat.uniforms.uTime.value = clock.getElapsedTime();
    renderer.render(scene, camera);
  }

  function init(el) {
    canvas = el;
    if (!canvas) return false;

    // respeita quem pediu menos movimento
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;

    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas, antialias: false, alpha: false, powerPreference: 'low-power'
      });
    } catch (e) { return false; }
    if (!renderer || !renderer.getContext()) return false;

    scene = new THREE.Scene();
    camera = new THREE.Camera();
    clock = new THREE.Clock();

    mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime:   { value: 0 },
        uRes:    { value: new THREE.Vector2(1, 1) },
        uMouse:  { value: new THREE.Vector2(0.5, 0.5) },
        uScroll: { value: 0 },
        uIntro:  { value: 0 }
      }
    });

    scene.add(new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), mat));

    resize();
    window.addEventListener('resize', resize);

    window.addEventListener('pointermove', function (e) {
      var r = canvas.getBoundingClientRect();
      target.x = (e.clientX - r.left) / r.width;
      target.y = 1.0 - (e.clientY - r.top) / r.height;
    }, { passive: true });

    // pausa fora da tela e em aba oculta — nada de queimar bateria à toa
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        running = es[0].isIntersecting && !document.hidden;
      }, { threshold: 0.01 }).observe(canvas);
    } else { running = true; }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) running = false;
    });

    running = true;
    loop();
    return true;
  }

  return {
    init: init,
    setScroll: function (v) { if (mat) mat.uniforms.uScroll.value = v; },
    setIntro:  function (v) { if (mat) mat.uniforms.uIntro.value = v; },
    resize: resize
  };
})();
