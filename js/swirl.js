/* ═══════════════════════════════════════════════════════════
   swirl.js — metal líquido em espiral no fundo do hero
   WebGL puro (sem Three.js): um único triângulo em tela cheia e
   um shader com ruído deformado girando devagar. Paleta do site:
   grafite do fundo com reflexos dourado e champanhe, mais forte à
   direita (atrás da mídia) e quase apagado atrás do texto.

   Só a partir de 768px (no celular o vídeo cobre o hero inteiro).
   Desenha em meia resolução (o metal é macio, não precisa de mais),
   pausa fora da tela e com a aba oculta, e com movimento reduzido
   pinta um único quadro parado.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var canvas = document.querySelector('.hero__swirl');
  if (!canvas) return;
  var MQ = window.matchMedia('(min-width: 768px)');
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // no celular nem cria o contexto WebGL; só se a tela crescer até 768px
  if (MQ.matches) iniciar();
  else if (MQ.addEventListener) {
    MQ.addEventListener('change', function espera() {
      if (!MQ.matches) return;
      MQ.removeEventListener('change', espera);
      iniciar();
    });
  }

  function iniciar() {

  var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

  var FRAG = [
    'precision mediump float;',
    'uniform vec2 uRes;',
    'uniform float uTime;',
    // tokens do site: --ink, --graphite, --gold, --gold-soft
    'const vec3 INK  = vec3(.078,.078,.102);',
    'const vec3 GRAF = vec3(.239,.239,.271);',
    'const vec3 GOLD = vec3(.788,.663,.416);',
    'const vec3 CHAMP= vec3(.878,.788,.604);',
    'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
    '  return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}',
    'float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);',
    '  for(int i=0;i<3;i++){v+=a*n(p);p=m*p;a*=.5;}return v;}',
    'void main(){',
    '  vec2 uv=(gl_FragCoord.xy-.5*uRes)/uRes.y;',
    '  float t=uTime*.045;',
    // centro do redemoinho à direita, atrás da mídia
    '  vec2 c=uv-vec2(.42,.02);',
    '  float r=length(c);',
    // espiral: gira mais perto do centro
    '  float ang=4.2*exp(-r*1.3)+t*.6;',
    '  float s=sin(ang),co=cos(ang);',
    '  vec2 w=mat2(co,-s,s,co)*c*1.1;',
    // deformação em duas camadas: o "líquido"
    '  vec2 q=vec2(fbm(w+t),fbm(w+vec2(5.2,1.3)-t));',
    '  float f=fbm(w+1.1*q+vec2(t*.7,-t*.4));',
    // metal líquido: faixas lisas que seguem a espiral; brilho nas cristas
    '  float fase=f*3.2+r*1.4-t*1.2+q.x*1.5;',
    '  float lis=.5+.5*cos(6.2831*fase);',
    '  vec3 col=INK+(GRAF-INK)*pow(lis,1.5)*.6;',
    '  col+=GOLD*pow(lis,6.)*.3;',
    '  col+=CHAMP*pow(lis,40.)*.32;',
    // máscara: quase nada à esquerda (texto), vinheta nas bordas
    '  float lado=smoothstep(-.55,.35,uv.x);',
    '  float vin=smoothstep(1.25,.25,length(uv*vec2(.8,1.)));',
    '  float k=lado*vin;',
    '  gl_FragColor=vec4(mix(INK,col,k*.9),1.);',
    '}'
  ].join('\n');

  var gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, powerPreference: 'low-power' });
  if (!gl) return;

  function shader(tipo, src) {
    var s = gl.createShader(tipo);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('[swirl]', gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  var vs = shader(gl.VERTEX_SHADER, VERT), fs = shader(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;
  var prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  // um triângulo que cobre a tela inteira
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  var uRes = gl.getUniformLocation(prog, 'uRes'), uTime = gl.getUniformLocation(prog, 'uTime');

  var ESCALA = 0.5;                 // meia resolução: macio e barato
  function mede() {
    var w = Math.max(1, Math.round(canvas.clientWidth * ESCALA));
    var hh = Math.max(1, Math.round(canvas.clientHeight * ESCALA));
    if (canvas.width !== w || canvas.height !== hh) {
      canvas.width = w; canvas.height = hh;
      gl.viewport(0, 0, w, hh);
      gl.uniform2f(uRes, w, hh);
    }
  }

  var raf = null, inicio = performance.now(), naTela = true;
  function quadro(agora) {
    raf = null;
    mede();
    gl.uniform1f(uTime, REDUCED ? 12 : (agora - inicio) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
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
  window.addEventListener('resize', function () { if (REDUCED && MQ.matches) agenda(); });
  if (MQ.addEventListener) MQ.addEventListener('change', sync);

  // primeiro quadro na hora: o canvas opaco nasceria preto puro,
  // mais escuro que o --ink do resto do hero
  if (MQ.matches) quadro(performance.now()); else agenda();
  }
})();
