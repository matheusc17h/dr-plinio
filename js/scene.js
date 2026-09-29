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

  /* Modo leve: poucos núcleos, pouca memória ou tela de celular.
     O shader é o mesmo — só roda com menos pixels e menos quadros. */
  var LITE = (navigator.hardwareConcurrency || 8) <= 4 ||
             (navigator.deviceMemory || 8) <= 4 ||
             Math.min(screen.width, screen.height) <= 720;

  // O campo é um fbm pesado em tela cheia: cada pixel a mais custa caro
  // e, por ser um desfoque suave, acima de 1.5x a diferença não aparece.
  var MAX_DPR = LITE ? 1 : 1.5;

  // Quadros por segundo: "ativo" enquanto a luz persegue o cursor ou o
  // scroll/abertura mexem na cena; "ocioso" é só a deriva lenta das
  // cáusticas (t * 0.045), que a 30 fps é indistinguível de 60.
  var FPS_ATIVO  = LITE ? 30 : 60;
  var FPS_OCIOSO = LITE ? 24 : 30;

  var renderer, scene, camera, mat, geo, raf = null;
  var mouse = { x: 0.5, y: 0.5 }, target = { x: 0.5, y: 0.5 };
  var canvas, tempo = 0, ultimo = 0, ultimoQuadro = 0, agitoAte = 0;
  var naTela = true, coberto = false, largura = 0, altura = 0, dprAtual = 0;
  var caixa = { left: 0, top: 0, width: 1, height: 1 };

  function podeRodar() { return naTela && !coberto && !document.hidden; }

  function resize() {
    if (!renderer) return;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    var r = canvas.getBoundingClientRect();
    caixa = { left: r.left + window.pageXOffset, top: r.top + window.pageYOffset, width: r.width, height: r.height };
    var dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    // barra de endereço do celular dispara resize sem mudar nada aqui:
    // realocar o buffer à toa custa um quadro preto e memória
    if (w === largura && h === altura && dpr === dprAtual) return;
    largura = w; altura = h; dprAtual = dpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    mat.uniforms.uRes.value.set(w * dpr, h * dpr);
    // redimensionar limpa o canvas; parado, ele ficaria vazio
    if (!raf) renderer.render(scene, camera);
  }

  var resizeAgendado = false;
  function onResize() {
    if (resizeAgendado) return;
    resizeAgendado = true;
    requestAnimationFrame(function () { resizeAgendado = false; resize(); });
  }

  function desenha(agora) {
    var dt = ultimo ? Math.min((agora - ultimo) / 1000, 0.1) : 0;
    ultimo = agora;
    tempo += dt;
    // suavização do cursor — a luz tem inércia, nunca gruda no ponteiro.
    // Corrigida pelo tempo: a 60 fps é exatamente o 0.045 por quadro de
    // antes, e não acelera em telas de 120 Hz.
    var k = 1 - Math.pow(1 - 0.045, dt * 60);
    mouse.x += (target.x - mouse.x) * k;
    mouse.y += (target.y - mouse.y) * k;
    mat.uniforms.uMouse.value.set(mouse.x, mouse.y);
    mat.uniforms.uTime.value = tempo;
    renderer.render(scene, camera);
  }

  function loop(agora) {
    raf = requestAnimationFrame(loop);
    var ativo = agora < agitoAte ||
      Math.abs(target.x - mouse.x) > 0.0005 || Math.abs(target.y - mouse.y) > 0.0005;
    // 0.9: tolera a variação natural do rAF sem pular quadros a 60 Hz
    var intervalo = 900 / (ativo ? FPS_ATIVO : FPS_OCIOSO);
    if (agora - ultimoQuadro < intervalo) return;
    ultimoQuadro = agora;
    desenha(agora);
  }

  function sincroniza() {
    if (podeRodar()) {
      if (!raf) { ultimo = 0; ultimoQuadro = 0; raf = requestAnimationFrame(loop); }
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = null;
    }
  }

  // uniforms mudaram: garante quadros cheios por um instante
  function agita() { agitoAte = performance.now() + 250; }

  function init(el) {
    canvas = el;
    if (!canvas) return false;

    // respeita quem pediu menos movimento
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;

    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas, antialias: false, alpha: false,
        depth: false, stencil: false,         // um plano 2D não precisa de buffers 3D
        powerPreference: 'low-power'
      });
    } catch (e) { return false; }
    if (!renderer || !renderer.getContext()) return false;

    // o plano cobre todos os pixels: limpar antes é uma passada inteira perdida
    renderer.autoClear = false;

    scene = new THREE.Scene();
    camera = new THREE.Camera();

    mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime:   { value: 0 },
        uRes:    { value: new THREE.Vector2(1, 1) },
        uMouse:  { value: new THREE.Vector2(0.5, 0.5) },
        uScroll: { value: 0 },
        uIntro:  { value: 0 }
      }
    });

    geo = new THREE.PlaneBufferGeometry(2, 2);
    scene.add(new THREE.Mesh(geo, mat));

    resize();
    window.addEventListener('resize', onResize);

    // posição do canvas na página: só muda com resize, então é medida
    // lá e não a cada movimento do mouse (evita forçar layout)
    window.addEventListener('pointermove', function (e) {
      target.x = (e.clientX + window.pageXOffset - caixa.left) / caixa.width;
      target.y = 1.0 - (e.clientY + window.pageYOffset - caixa.top) / caixa.height;
    }, { passive: true });

    // pausa fora da tela e em aba oculta — nada de queimar bateria à toa.
    // O loop é cancelado de verdade, não só ignorado a cada quadro.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        naTela = es[0].isIntersecting;
        sincroniza();
      }, { threshold: 0.01 }).observe(canvas);
    }
    // voltar para a aba não dispara o IntersectionObserver
    document.addEventListener('visibilitychange', sincroniza);

    sincroniza();
    return true;
  }

  // Libera GPU se o hero um dia for removido da página.
  function destroy() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', sincroniza);
    if (geo) geo.dispose();
    if (mat) mat.dispose();
    if (renderer) renderer.dispose();
    renderer = scene = camera = mat = geo = null;
  }

  return {
    init: init,
    setScroll: function (v) {
      if (!mat || mat.uniforms.uScroll.value === v) return;
      mat.uniforms.uScroll.value = v; agita();
    },
    setIntro: function (v) {
      if (!mat) return;
      mat.uniforms.uIntro.value = v; agita();
    },
    // No celular o vídeo ocupa o hero inteiro por cima do canvas:
    // enquanto estiver tapado, não há por que desenhar nada.
    setCovered: function (v) {
      if (!mat || coberto === v) return;
      // último quadro com os uniforms atuais — é ele que fica "congelado"
      if (v && raf) desenha(performance.now());
      coberto = v;
      sincroniza();
    },
    resize: resize,
    destroy: destroy,
    lite: LITE
  };
})();
