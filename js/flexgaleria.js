/* ═══════════════════════════════════════════════════════════
   flexgaleria.js — galeria em fileira que dobra numa "lente"
   Porte para JS puro (módulo) do FlexCarousel do React Bits, com
   OGL (WebGL2) carregado da CDN só quando a galeria se aproxima da
   tela. Mesmas fórmulas: lente invisível que curva a fileira, mola,
   arrastar com inércia, clique centraliza e abre a foto, entrada
   "rise", legenda com contador em rolo.

   Ajustes para este site: a roda vertical do mouse continua rolando
   a página (só a horizontal/arrastar gira a fileira) e a dispersão de
   cores na curva é bem sutil, para não fugir do grafite + dourado.
   Sem WebGL2 (ou sem JS) fica a grade de fotos do HTML.
   ═══════════════════════════════════════════════════════════ */

var container = document.querySelector('.fc');
var lista = document.querySelector('.galeria__lista');

if (container && lista) {
  var comecou = false;
  var comeca = function () {
    if (comecou) return; comecou = true;
    import('https://cdn.jsdelivr.net/npm/ogl@1.0.11/+esm').then(montar, function () { /* fica a grade */ });
  };
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) { io.disconnect(); comeca(); }
    }, { rootMargin: '400px 0px' });
    io.observe(container);
  } else comeca();
}

function montar(OGL) {
  var Renderer = OGL.Renderer, Program = OGL.Program, Mesh = OGL.Mesh, Triangle = OGL.Triangle,
      Plane = OGL.Plane, Texture = OGL.Texture, RenderTarget = OGL.RenderTarget;

  var itens = [].map.call(lista.querySelectorAll('li'), function (li) {
    var img = li.querySelector('img');
    return { src: img.currentSrc || img.src, alt: img.alt, title: li.getAttribute('data-titulo') || '', subtitle: li.getAttribute('data-sub') || '' };
  });
  if (!itens.length) return;

  // ── opções (preset "liquid" do componente, ajustado à identidade) ──
  var S = {
    intro: 'rise', cardHeight: 0.52, gap: 14, radius: 10, fit: 'natural',
    lensWidth: 0.74, lensHeight: 1.18, tilt: 62, roundness: 1, bend: 0.34, reach: 0.38, curl: 'twist',
    dispersion: 0.12, liquid: 0, followCursor: false,
    squeeze: 0.2, focusOnClick: true, autoplay: false, interval: 4, captureWheel: false
  };

  var FIT_ASPECT = { portrait: 0.75, square: 1, landscape: 4 / 3 };
  var TAPS = 12, PIXEL_BUDGET = 4.5e6;
  var INTRO_DURATION = { rise: 2.1, bloom: 1.6, spin: 2.2, deal: 1.5, fade: 0.35 };
  function wrap(v, size) { return ((((v + size / 2) % size) + size) % size) - size / 2; }
  function clamp01(v) { return Math.min(Math.max(v, 0), 1); }
  function easeOut(v) { return 1 - Math.pow(1 - clamp01(v), 3); }
  function easeOutQuint(v) { return 1 - Math.pow(1 - clamp01(v), 5); }
  function easeInOut(v) { var t = clamp01(v); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  var cardVertex = '#version 300 es\n' +
    'in vec3 position;in vec2 uv;uniform vec4 uRect;uniform vec2 uResolution;out vec2 vUv;out vec2 vLocal;\n' +
    'void main(){vUv=uv;vLocal=vec2(position.x,-position.y)*uRect.zw;vec2 px=uRect.xy+vLocal;' +
    'gl_Position=vec4(px.x/uResolution.x*2.0-1.0,1.0-px.y/uResolution.y*2.0,0.0,1.0);}';

  var cardFragment = '#version 300 es\nprecision highp float;\n' +
    'uniform sampler2D tMap;uniform vec2 uSize;uniform vec2 uImage;uniform float uRadius;uniform float uAlpha;' +
    'uniform float uReady;uniform float uShift;uniform float uDpr;uniform vec3 uPlaceholder;in vec2 vUv;in vec2 vLocal;out vec4 fragColor;\n' +
    'float roundedBox(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.0))+min(max(q.x,q.y),0.0)-r;}\n' +
    'void main(){float sd=roundedBox(vLocal,uSize*0.5,min(uRadius,min(uSize.x,uSize.y)*0.5));' +
    'float mask=clamp(0.5-sd*uDpr,0.0,1.0);vec2 local=vLocal/uSize+0.5;float cardAspect=uSize.x/uSize.y;' +
    'float imageAspect=uImage.x/max(uImage.y,1.0);vec2 scale=imageAspect>cardAspect?vec2(cardAspect/imageAspect,1.0):vec2(1.0,imageAspect/cardAspect);' +
    'scale/=1.08;vec2 uv=vec2(local.x,1.0-local.y);uv=(uv-0.5)*scale+0.5;uv.x+=uShift*(1.0-scale.x)*0.5;' +
    'vec3 image=texture(tMap,uv).rgb;vec3 color=mix(uPlaceholder,image,uReady);float alpha=mask*uAlpha;fragColor=vec4(color*alpha,alpha);}';

  var lensVertex = '#version 300 es\nin vec2 position;void main(){gl_Position=vec4(position,0.0,1.0);}';

  var lensFragment = '#version 300 es\nprecision highp float;\n' +
    'uniform sampler2D tScene;uniform vec2 uResolution;uniform float uDpr;uniform vec2 uCenter;uniform vec2 uHalf;uniform float uAngle;' +
    'uniform float uExponent;uniform float uInner;uniform float uOuter;uniform float uFlow;uniform float uCurl;uniform float uDispersion;' +
    'uniform float uStrength;uniform float uSceneAlpha;out vec4 fragColor;\n' +
    'void main(){vec2 frag=gl_FragCoord.xy/uDpr;vec2 uv=frag/uResolution;vec2 rel=frag-vec2(uCenter.x,uResolution.y-uCenter.y);' +
    'float ca=cos(uAngle);float sa=sin(uAngle);vec2 local=vec2(ca*rel.x+sa*rel.y,-sa*rel.x+ca*rel.y);' +
    'vec2 k=max(abs(local)/uHalf,vec2(1e-5));float nd=pow(pow(k.x,uExponent)+pow(k.y,uExponent),1.0/uExponent);' +
    'vec2 grad=pow(k,vec2(uExponent-1.0))*sign(local)/uHalf*pow(nd,1.0-uExponent);float glen=max(length(grad),1e-6);' +
    'float edge=(nd-1.0)/glen;vec2 outward=grad/glen;vec2 normal=vec2(ca*outward.x-sa*outward.y,sa*outward.x+ca*outward.y);' +
    'vec2 along=vec2(-normal.y,normal.x);float t=clamp((edge+uInner)/(uInner+uOuter),0.0,1.0);' +
    'float ramp=t*t*t*(t*(t*6.0-15.0)+10.0);float slope=16.0*t*t*(1.0-t)*(1.0-t);float reachX=rel.x/(uResolution.x*0.5);' +
    'float side=smoothstep(0.02,0.3,abs(reachX))*(uCurl==0.0?sign(reachX):uCurl);float lift=ramp*side*uFlow*uStrength;' +
    'vec2 swirl=along*along.y*side*slope*uFlow*uStrength*0.35;vec2 drift=vec2(0.0,-lift)-swirl;vec2 shifted=uv+drift/uResolution;' +
    'vec2 texels=uResolution*uDpr;vec2 gx=dFdx(shifted);vec2 gy=dFdy(shifted);' +
    'gx*=min(1.0,3.0/max(length(gx*texels),1e-4));gy*=min(1.0,3.0/max(length(gy*texels),1e-4));' +
    'vec4 color=textureGrad(tScene,shifted,gx,gy);vec2 spread=vec2(0.0,side*slope*uFlow*uStrength)/uResolution*uDispersion;' +
    'float spreadPx=length(spread*texels);' +
    'if(color.a>0.002&&spreadPx>0.25){vec3 base=color.rgb/color.a;vec3 sumColor=vec3(0.0);vec3 sumWeight=vec3(0.0);' +
    'for(int i=0;i<' + TAPS + ';i++){float s=(float(i)+0.5)/float(' + TAPS + ');vec4 c=textureGrad(tScene,shifted+spread*(s-0.5),gx,gy);' +
    'vec3 w=max(1.0-abs(vec3(s)-vec3(0.15,0.5,0.85))*2.6,0.0)*c.a;sumColor+=c.rgb*(w/max(c.a,0.002));sumWeight+=w;}' +
    'vec3 split=mix(base,sumColor/max(sumWeight,vec3(1e-4)),clamp(sumWeight*2.0,0.0,1.0));' +
    'color.rgb=mix(color.rgb,clamp(split,0.0,1.0)*color.a,smoothstep(0.25,1.5,spreadPx));}' +
    'fragColor=color*uSceneAlpha;}';

  var renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio || 1, 2), alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
  var gl = renderer.gl;
  if (!renderer.isWebgl2) { var lc = gl.getExtension('WEBGL_lose_context'); if (lc) lc.loseContext(); return; }

  // ── a partir daqui a fileira substitui a grade ──
  container.classList.add('is-on');
  container.setAttribute('role', 'region');
  container.setAttribute('aria-roledescription', 'carrossel');
  container.setAttribute('aria-label', 'Galeria de casos: arraste para os lados, setas do teclado para navegar, Enter abre a foto');
  container.tabIndex = 0;
  lista.hidden = true;

  gl.clearColor(0, 0, 0, 0);
  var canvas = gl.canvas;
  canvas.style.display = 'block'; canvas.style.width = '100%'; canvas.style.height = '100%';
  canvas.setAttribute('aria-hidden', 'true');
  container.prepend(canvas);

  // legenda (título acima do contador, embaixo da fileira) e região viva
  function el(tag, cls, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }
  container.style.setProperty('--fc-half', (Math.min(Math.max(S.cardHeight, 0.05), 1) * 50) + '%');
  var cap = el('div', 'fc__caption', container); cap.setAttribute('aria-hidden', 'true'); cap.hidden = true;
  var capTitle = el('span', 'fc__title-wrap', cap);
  var capCount = el('span', 'fc__count', cap);
  var digits = el('span', 'fc__digits', capCount), reels = [];
  for (var d = 0; d < 2; d++) {
    var dg = el('span', 'fc__digit', digits), reel = el('span', 'fc__reel', dg);
    for (var nn = 0; nn < 10; nn++) el('span', '', reel).textContent = nn;
    reels.push(reel);
  }
  el('span', 'fc__slash', capCount).textContent = '/';
  el('span', '', capCount).textContent = String(itens.length).padStart(2, '0');
  var live = el('div', 'fc__live', container); live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true');

  function setActive(i) {
    var it = itens[i] || itens[0];
    capTitle.innerHTML = '';
    var t = el('span', 'fc__title', capTitle); t.textContent = it.title || it.alt;
    if (it.subtitle) el('span', 'fc__subtitle', t).textContent = it.subtitle;
    String(i + 1).padStart(2, '0').split('').forEach(function (ch, k) { reels[k].style.transform = 'translateY(' + (-Number(ch) * 10) + '%)'; });
    live.textContent = (it.title || it.alt) + ', ' + (i + 1) + ' de ' + itens.length;
  }
  function setRevealed() { cap.hidden = false; }
  function setFocusOpen(open) { if (open) capCount.setAttribute('data-hidden', ''); else capCount.removeAttribute('data-hidden'); }

  // ── WebGL: cartões numa textura, depois a lente curva tudo ──
  var cardProgram = new Program(gl, {
    vertex: cardVertex, fragment: cardFragment, transparent: true, depthTest: false, depthWrite: false,
    uniforms: {
      tMap: { value: new Texture(gl) }, uRect: { value: [0, 0, 1, 1] }, uResolution: { value: [1, 1] },
      uSize: { value: [1, 1] }, uImage: { value: [1, 1] }, uRadius: { value: 16 }, uAlpha: { value: 1 },
      uReady: { value: 0 }, uShift: { value: 0 }, uDpr: { value: 1 }, uPlaceholder: { value: [0.11, 0.11, 0.14] }
    }
  });
  cardProgram.setBlendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  var cardMesh = new Mesh(gl, { geometry: new Plane(gl), program: cardProgram });
  var target = new RenderTarget(gl, { width: 2, height: 2, depth: false, minFilter: gl.LINEAR_MIPMAP_LINEAR, magFilter: gl.LINEAR });
  var lensUniforms = {
    tScene: { value: target.texture }, uResolution: { value: [1, 1] }, uDpr: { value: 1 }, uCenter: { value: [0, 0] },
    uHalf: { value: [1, 1] }, uAngle: { value: 0 }, uExponent: { value: 2 }, uInner: { value: 60 }, uOuter: { value: 80 },
    uFlow: { value: 0 }, uCurl: { value: 0 }, uDispersion: { value: 0 }, uStrength: { value: 0 }, uSceneAlpha: { value: 0 }
  };
  var lensMesh = new Mesh(gl, {
    geometry: new Triangle(gl),
    program: new Program(gl, { vertex: lensVertex, fragment: lensFragment, uniforms: lensUniforms, depthTest: false, depthWrite: false })
  });

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var anisotropy = renderer.getExtension('EXT_texture_filter_anisotropic') ? 8 : 0;

  var slots = [], width = 1, height = 1, pos = 0, vel = 0, goal = 0, mode = 'spring', wheelAt = 0, raf = 0,
      last = performance.now(), visible = true, dirty = true, activeIndex = -1, interactedAt = -Infinity,
      autoplayAt = performance.now(), hasFocus = false, deform = 0, deformVel = 0, layout = null, resnap = false,
      hover = '', lift = 1, energy = 0, lastPos = 0, instances = [];
  var lens = { x: 0, y: 0, vx: 0, vy: 0, ready: false };
  var pointer = { x: 0, y: 0, over: false, down: false, id: -1, startX: 0, startY: 0, startPos: 0, dragging: false, touch: false, samples: [] };
  var introState = { kind: 'none', t: 0, running: false, done: false, readyAt: 0 };
  var focus = { index: -1, pending: -1, t: 0, v: 0, target: 0 };

  function loadSlot(item, index) {
    var texture = new Texture(gl, { generateMipmaps: true, minFilter: gl.LINEAR_MIPMAP_LINEAR, magFilter: gl.LINEAR, anisotropy: anisotropy });
    var slot = { item: item, index: index, texture: texture, aspect: 0.8, loaded: false, failed: false, ready: 0, color: [0.11, 0.11, 0.14], image: [1, 1] };
    var image = new Image();
    image.decoding = 'async';
    image.onload = function () {
      texture.image = image; texture.update();
      slot.image = [image.naturalWidth || 1, image.naturalHeight || 1];
      slot.aspect = slot.image[0] / slot.image[1];
      try {   // cor média da foto: aparece enquanto a textura entra
        var probe = document.createElement('canvas'); probe.width = 8; probe.height = 8;
        var ctx = probe.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, 0, 0, 8, 8);
        var data = ctx.getImageData(0, 0, 8, 8).data, avg = [0, 0, 0];
        for (var i = 0; i < data.length; i += 4) { avg[0] += data[i]; avg[1] += data[i + 1]; avg[2] += data[i + 2]; }
        slot.color = avg.map(function (v) { return v / 64 / 255; });
      } catch (e) { /* mantém o grafite */ }
      slot.loaded = true; dirty = true; start();
    };
    image.onerror = function () { slot.failed = true; dirty = true; start(); };
    image.src = item.src;
    return slot;
  }

  function setItems(next) {
    slots = next.map(loadSlot);
    activeIndex = -1; layout = null; resnap = true;
    focus.target = 0; focus.t = 0; focus.v = 0; focus.pending = -1;
    setFocusOpen(false);
    introState.readyAt = performance.now();
    dirty = true; start();
  }

  function metrics() {
    var cardH = Math.max(24, S.cardHeight * height), fixed = FIT_ASPECT[S.fit];
    var widths = slots.map(function (slot) { return (fixed || slot.aspect) * cardH; });
    var centers = [], cursor = 0;
    for (var i = 0; i < widths.length; i++) { centers.push(cursor + widths[i] / 2); cursor += widths[i] + S.gap; }
    return { cardH: cardH, widths: widths, centers: centers, gap: S.gap, loop: Math.max(cursor, 1) };
  }
  function nearest(m, at) {
    var best = 0, bestDist = Infinity;
    for (var i = 0; i < m.centers.length; i++) {
      var dist = Math.abs(wrap(m.centers[i] - at, m.loop));
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    return best;
  }
  function snapPoint(m, at) { var i = nearest(m, at); return at + wrap(m.centers[i] - at, m.loop); }
  function remap(from, to, at) {
    var i = nearest(from, at), offset = wrap(at - from.centers[i], from.loop);
    var cycles = Math.round((at - offset - from.centers[i]) / from.loop);
    return cycles * to.loop + to.centers[i] + offset * (to.widths[i] / from.widths[i]);
  }
  function step(m, delta) {
    var at = snapPoint(m, goal), index = nearest(m, at), n = m.centers.length;
    for (var k = 0; k < Math.abs(delta); k++) {
      var next = (index + (delta > 0 ? 1 : n - 1)) % n;
      at += delta > 0 ? m.widths[index] / 2 + m.gap + m.widths[next] / 2 : -(m.widths[next] / 2 + m.gap + m.widths[index] / 2);
      index = next;
    }
    goal = at; mode = 'spring'; dirty = true; start();
  }
  function goTo(m, index) {
    var i = ((index % m.centers.length) + m.centers.length) % m.centers.length;
    goal = goal + wrap(m.centers[i] - goal, m.loop); mode = 'spring'; dirty = true; start();
  }
  function openFocus(index) { focus.index = index; focus.pending = -1; focus.target = 1; setFocusOpen(true); dirty = true; start(); }
  function closeFocus() {
    focus.pending = -1;
    if (focus.target === 0) return false;
    focus.target = 0; setFocusOpen(false); dirty = true; start();
    return true;
  }
  function skipIntro() { if (introState.running) introState.t = 1; }

  function introEffects() {
    var t = introState.running ? introState.t : introState.done ? 1 : 0;
    var e = { sceneAlpha: 1, strength: 1, card: null };
    if (!introState.done && !introState.running) { e.sceneAlpha = 0; e.strength = 0; return e; }
    if (t >= 1) return e;
    var kind = introState.kind;
    if (kind === 'rise') {
      e.strength = easeInOut((t - 0.3) / 0.65);
      e.card = function (rel) {
        var delay = Math.min(Math.abs(rel) / (width * 0.6), 1) * 0.34, local = clamp01((t - delay) / 0.6);
        return { alpha: clamp01(local * 4), x: 0, y: (1 - easeOutQuint(local)) * height * 0.62, scale: 0.5 + 0.5 * easeInOut((local - 0.18) / 0.82) };
      };
    } else {
      e.sceneAlpha = easeOut(t); e.strength = easeOut(t);
    }
    return e;
  }
  function beginIntro() {
    var kind = reducedMotion && S.intro !== 'none' ? 'fade' : S.intro;
    introState.kind = INTRO_DURATION[kind] ? kind : 'none';
    introState.running = introState.kind !== 'none';
    introState.done = !introState.running;
    introState.t = 0;
    if (introState.done) setRevealed();
  }

  function resize() {
    width = Math.max(1, container.clientWidth); height = Math.max(1, container.clientHeight);
    renderer.dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(PIXEL_BUDGET / (width * height)));
    renderer.setSize(width, height);
    target.setSize(Math.max(2, Math.round(width * renderer.dpr)), Math.max(2, Math.round(height * renderer.dpr)));
    lensUniforms.tScene.value = target.texture;
    dirty = true; start();
  }

  function frame(now) {
    raf = 0;
    var dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    if (!slots.length) { if (visible) raf = requestAnimationFrame(frame); return; }
    var m = metrics(), n = slots.length, animating = false;

    if (resnap) { goal = snapPoint(m, goal); pos = goal; vel = 0; resnap = false; }
    else if (layout && layout.loop !== m.loop) {
      pos = remap(layout, m, pos); goal = remap(layout, m, goal);
      pointer.startPos = pos + (pointer.x - pointer.startX); animating = true;
    }
    layout = m;

    if (!introState.running && !introState.done) {
      var allSettled = slots.every(function (slot) { return slot.loaded || slot.failed; });
      if (allSettled || now - introState.readyAt > 3500) { goal = snapPoint(m, goal); pos = goal; beginIntro(); }
    }
    if (introState.running) {
      introState.t = Math.min(1, introState.t + dt / (INTRO_DURATION[introState.kind] || 1));
      if (introState.t >= 1) { introState.running = false; introState.done = true; setRevealed(); }
      animating = true;
    }

    if (mode === 'wheel' && now - wheelAt > 150) { goal = snapPoint(m, goal); mode = 'spring'; }
    if (!pointer.dragging) {
      var stiffness = mode === 'wheel' ? 80 : 55, damping = 2 * Math.sqrt(stiffness);
      var steps = Math.ceil(dt / (1 / 240)), h = dt / steps;
      for (var i = 0; i < steps; i++) { var acc = stiffness * (goal - pos) - damping * vel; vel += acc * h; pos += vel * h; }
      if (Math.abs(goal - pos) < 0.05 && Math.abs(vel) < 0.5) { pos = goal; vel = 0; } else animating = true;
    } else animating = true;

    if (Math.abs(pos) > m.loop * 8) {
      var shift = Math.round(pos / m.loop) * m.loop;
      pos -= shift; goal -= shift; pointer.startPos -= shift;
    }

    var current = nearest(m, pos);
    if (current !== activeIndex) { activeIndex = current; setActive(current); }

    if (focus.pending >= 0 && mode === 'spring' && Math.abs(goal - pos) < 1.5 && Math.abs(vel) < 30) {
      if (current === focus.pending) openFocus(current); else focus.pending = -1;
    }

    var travel = Math.abs(pos - lastPos) / dt;
    lastPos = pos;
    var energyTarget = reducedMotion ? 0 : Math.min(travel / 2600, 1);
    energy += (energyTarget - energy) * (1 - Math.exp(-dt / (energyTarget > energy ? 0.07 : 0.35)));
    if (energy > 0.001) animating = true;
    var liquidAmount = reducedMotion ? 0 : S.liquid;
    var push = Math.max(-1, Math.min(1, vel / 2200));
    deformVel += (120 * (push - deform) - 2 * Math.sqrt(120) * 0.32 * deformVel) * dt;
    deform += deformVel * dt;
    if (Math.abs(deform) > 0.0005 || Math.abs(deformVel) > 0.005) animating = true;

    focus.v += (64 * (focus.target - focus.t) - 2 * Math.sqrt(64) * focus.v) * dt;
    focus.t += focus.v * dt;
    if (Math.abs(focus.target - focus.t) < 0.0005 && Math.abs(focus.v) < 0.001) { focus.t = focus.target; focus.v = 0; } else animating = true;
    var focusAmount = clamp01(focus.t), focusEase = easeInOut(focusAmount);
    var focusW = focus.index >= 0 && focus.index < n ? m.widths[focus.index] : m.cardH;
    var focusScale = Math.max(1, Math.min(1.3, (height * 0.84) / m.cardH, (width * 0.92) / focusW));
    var nextLift = 1 + (focusScale - 1) * focusEase;
    if (Math.abs(nextLift - lift) > 0.0005) { lift = nextLift; container.style.setProperty('--fc-lift', lift.toFixed(4)); }

    var effects = introEffects();
    var homeX = width / 2, homeY = height / 2;
    if (!lens.ready) { lens.x = homeX; lens.y = homeY; lens.ready = true; }
    var lensK = 110, lensC = 2 * Math.sqrt(lensK) * 0.8;
    lens.vx += (lensK * (homeX - lens.x) - lensC * lens.vx) * dt;
    lens.vy += (lensK * (homeY - lens.y) - lensC * lens.vy) * dt;
    lens.x += lens.vx * dt; lens.y += lens.vy * dt;
    if (Math.abs(homeX - lens.x) + Math.abs(homeY - lens.y) > 0.2 || Math.abs(lens.vx) + Math.abs(lens.vy) > 0.5) animating = true;

    var cardH = m.cardH;
    var halfW = (S.lensWidth * width) / 2, halfH = (S.lensHeight * width) / 2;
    var squash = Math.abs(deform) * liquidAmount;
    halfW *= 1 + squash * 0.16; halfH *= 1 - squash * 0.08;
    var lensX = lens.x - deform * 14 * liquidAmount;

    for (var si = 0; si < n; si++) {
      var slot = slots[si];
      if (slot.loaded && slot.ready < 1) { slot.ready = Math.min(1, slot.ready + dt / 0.45); animating = true; }
    }

    var waiting = !introState.done;
    if (dirty || animating || pointer.dragging) {
      dirty = false; instances = [];
      var dpr = renderer.dpr;
      cardProgram.uniforms.uResolution.value = [width, height];
      cardProgram.uniforms.uDpr.value = dpr;
      cardProgram.uniforms.uRadius.value = S.radius;
      var shrink = 1 - clamp01(S.squeeze) * energy, draws = [];
      for (var ci = 0; ci < n; ci++) {
        var w = m.widths[ci], baseRel = wrap(m.centers[ci] - pos, m.loop);
        for (var k = -3; k <= 3; k++) {
          var rel = baseRel + k * m.loop;
          if (Math.abs(rel) - w / 2 > width + 40) continue;
          var fx = effects.card ? effects.card(rel) : null;
          var x = homeX + rel + (fx ? fx.x : 0), scale = shrink * (fx ? fx.scale : 1), alpha = fx ? fx.alpha : 1;
          if (focusAmount > 0) {
            if (ci === focus.index && Math.abs(rel) < w) scale *= 1 + (focusScale - 1) * focusEase;
            else {
              var order = Math.min(Math.abs(rel) / width, 1) * 0.25, part = easeInOut(focusAmount * 1.25 - order);
              x += Math.sign(rel) * part * width * 0.7; alpha *= 1 - part;
            }
          }
          var cw = w * scale;
          if (alpha <= 0.001 || x + cw / 2 < -40 || x - cw / 2 > width + 40) continue;
          draws.push({ i: ci, rel: rel, x: x, y: homeY + (fx ? fx.y : 0), cw: cw, ch: cardH * scale, alpha: alpha });
        }
      }
      draws.sort(function (a, b) { return Math.abs(b.rel) - Math.abs(a.rel); });
      var first = true;
      draws.forEach(function (draw) {
        var sl = slots[draw.i];
        cardProgram.uniforms.tMap.value = sl.texture;
        cardProgram.uniforms.uRect.value = [draw.x, draw.y, draw.cw + 2, draw.ch + 2];
        cardProgram.uniforms.uSize.value = [draw.cw, draw.ch];
        cardProgram.uniforms.uImage.value = sl.image;
        cardProgram.uniforms.uAlpha.value = draw.alpha;
        cardProgram.uniforms.uReady.value = sl.ready;
        cardProgram.uniforms.uShift.value = reducedMotion ? 0 : Math.max(-1, Math.min(1, draw.rel / (width * 0.75)));
        cardProgram.uniforms.uPlaceholder.value = sl.color;
        renderer.render({ scene: cardMesh, target: target, clear: first });
        first = false;
        instances.push({ index: draw.i, x0: draw.x - draw.cw / 2, x1: draw.x + draw.cw / 2, y0: draw.y - draw.ch / 2, y1: draw.y + draw.ch / 2 });
      });
      if (first) { renderer.bindFramebuffer(target); gl.viewport(0, 0, target.width, target.height); gl.clear(gl.COLOR_BUFFER_BIT); }
      renderer.bindFramebuffer();
      target.texture.bind();
      gl.generateMipmap(gl.TEXTURE_2D);

      lensUniforms.uResolution.value = [width, height];
      lensUniforms.uDpr.value = dpr;
      lensUniforms.uCenter.value = [lensX, lens.y];
      lensUniforms.uHalf.value = [Math.max(halfW, 1), Math.max(halfH, 1)];
      lensUniforms.uAngle.value = (S.tilt * Math.PI) / 180;
      lensUniforms.uExponent.value = 2 + Math.pow(1 - clamp01(S.roundness), 1.5) * 10;
      var spanW = Math.max(halfW, 1), spanH = Math.max(halfH, 1), inner = Math.max(4, S.reach * (spanW + spanH) * 0.5);
      lensUniforms.uInner.value = inner;
      lensUniforms.uOuter.value = inner * 1.6;
      lensUniforms.uFlow.value = S.bend * (spanW + spanH) * 0.45;
      lensUniforms.uCurl.value = S.curl === 'rise' ? 1 : S.curl === 'fall' ? -1 : 0;
      lensUniforms.uDispersion.value = S.dispersion * 0.12 * (1 + Math.abs(deform) * liquidAmount * 1.2);
      lensUniforms.uStrength.value = effects.strength * (1 - focusEase);
      lensUniforms.uSceneAlpha.value = effects.sceneAlpha;
      renderer.render({ scene: lensMesh });
    }

    var nextHover = '';
    if (pointer.over && !pointer.dragging && introState.done && S.focusOnClick) {
      var hit = instances.find(function (inst) { return pointer.x >= inst.x0 && pointer.x <= inst.x1 && pointer.y >= inst.y0 && pointer.y <= inst.y1; });
      if (focus.target > 0) nextHover = 'close'; else if (hit) nextHover = 'open';
    }
    if (nextHover !== hover) {
      hover = nextHover;
      if (hover) container.setAttribute('data-hover', hover); else container.removeAttribute('data-hover');
    }

    if (visible && !document.hidden && (animating || waiting || dirty || pointer.down)) raf = requestAnimationFrame(frame);
  }

  function start() {
    if (raf || !visible || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function localPoint(e) { var r = container.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

  container.addEventListener('pointerdown', function (e) {
    if (e.button !== undefined && e.button > 0) return;
    skipIntro();
    var p = localPoint(e);
    pointer.down = true; pointer.id = e.pointerId; pointer.touch = e.pointerType === 'touch';
    pointer.startX = p[0]; pointer.startY = p[1]; pointer.x = p[0]; pointer.y = p[1];
    pointer.startPos = pos; pointer.dragging = false; pointer.samples = [{ x: p[0], t: performance.now() }];
    interactedAt = performance.now();
    if (Math.abs(vel) > 40) { goal = pos; vel = 0; }
    dirty = true; start();
  });
  container.addEventListener('pointermove', function (e) {
    var p = localPoint(e);
    pointer.x = p[0]; pointer.y = p[1]; pointer.over = true;
    if (pointer.down && e.pointerId === pointer.id) {
      var dx = p[0] - pointer.startX, dy = p[1] - pointer.startY, slop = pointer.touch ? 10 : 5;
      if (!pointer.dragging) {
        // no toque, gesto mais vertical que horizontal é rolagem da página
        if (pointer.touch && Math.abs(dy) > slop && Math.abs(dy) > Math.abs(dx)) { pointer.down = false; return; }
        if (Math.abs(dx) > slop) {
          pointer.dragging = true; pointer.startX = p[0]; pointer.startPos = pos;
          closeFocus();
          try { container.setPointerCapture(e.pointerId); } catch (err) { /* sem captura */ }
          container.setAttribute('data-dragging', '');
        }
      }
      if (pointer.dragging) {
        pos = pointer.startPos - (p[0] - pointer.startX); goal = pos; vel = 0;
        var now = performance.now();
        pointer.samples.push({ x: p[0], t: now });
        while (pointer.samples.length > 2 && now - pointer.samples[0].t > 100) pointer.samples.shift();
      }
    }
    dirty = true; start();
  });
  container.addEventListener('pointerup', function (e) {
    if (!pointer.down || e.pointerId !== pointer.id) return;
    pointer.down = false;
    container.removeAttribute('data-dragging');
    var m = metrics();
    interactedAt = performance.now();
    if (pointer.dragging) {
      pointer.dragging = false;
      var now = performance.now(), f = pointer.samples[0], l = pointer.samples[pointer.samples.length - 1], velocity = 0;
      if (f && l && l.t > f.t && now - l.t < 70) velocity = -((l.x - f.x) / (l.t - f.t)) * 1000;
      vel = velocity;
      var landing = snapPoint(m, pos + velocity * 0.32);
      goal = landing;
      if (Math.abs(velocity) > 400 && Math.abs(landing - pos) < 1) step(m, velocity > 0 ? 1 : -1);
      mode = 'spring'; start();
      return;
    }
    if (closeFocus()) return;
    var p = localPoint(e);
    var hit = instances.find(function (inst) { return p[0] >= inst.x0 && p[0] <= inst.x1 && p[1] >= inst.y0 && p[1] <= inst.y1; });
    if (!hit) return;
    if (hit.index === activeIndex && Math.abs(goal - pos) < 2) { if (S.focusOnClick) openFocus(hit.index); }
    else {
      goal = snapPoint(m, pos + ((hit.x0 + hit.x1) / 2 - width / 2));
      mode = 'spring';
      if (S.focusOnClick) focus.pending = hit.index;
      start();
    }
  });
  container.addEventListener('pointerleave', function () { pointer.over = false; dirty = true; start(); });
  container.addEventListener('pointercancel', function () {
    pointer.down = false; pointer.dragging = false; container.removeAttribute('data-dragging');
    goal = snapPoint(metrics(), pos); mode = 'spring'; start();
  });
  container.addEventListener('wheel', function (e) {
    if (e.ctrlKey) return;
    var dx = e.deltaX, dy = e.deltaY;
    if (e.shiftKey && Math.abs(dx) < Math.abs(dy)) { dx = dy; dy = 0; }
    var unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1;
    var horizontal = Math.abs(dx) > Math.abs(dy);
    if (!horizontal && !S.captureWheel) return;          // roda vertical: a página rola
    e.preventDefault();
    skipIntro(); interactedAt = performance.now();
    if (closeFocus()) return;
    goal += Math.max(-120, Math.min(120, (horizontal ? dx : dy) * unit)) * 1.25;
    mode = 'wheel'; wheelAt = performance.now(); start();
  }, { passive: false });
  container.addEventListener('keydown', function (e) {
    var m = metrics();
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); skipIntro(); closeFocus(); interactedAt = performance.now(); step(m, 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); skipIntro(); closeFocus(); interactedAt = performance.now(); step(m, -1); }
    else if (e.key === 'Home') { e.preventDefault(); closeFocus(); goTo(m, 0); }
    else if (e.key === 'End') { e.preventDefault(); closeFocus(); goTo(m, slots.length - 1); }
    else if (e.key === 'Escape') { if (closeFocus()) e.preventDefault(); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (closeFocus() || activeIndex < 0) return;
      if (S.focusOnClick) openFocus(activeIndex);
    }
  });
  container.addEventListener('focus', function () { hasFocus = true; });
  container.addEventListener('blur', function () { hasFocus = false; });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) start(); });

  new ResizeObserver(resize).observe(container);
  new IntersectionObserver(function (es) { visible = es[0].isIntersecting; start(); }).observe(container);

  resize();
  setItems(itens);
  setActive(0);
}
