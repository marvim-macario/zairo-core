import * as THREE from "three";

// ============================================
// ESFERA DE PARTÍCULAS
// ============================================
// Milhares de partículas correm em filamentos torcidos em volta de um núcleo de
// luz. Cada estado tem sua cor; o núcleo muda de animação ao ouvir e ao pensar,
// e só a camada externa de filamentos reage à voz.

// Unidades do shader: raio da esfera = 1. O núcleo usa a escala do mockup
// (raio 0.285), por isso a conversão CORE_SCALE.
const CORE_SCALE = 0.285;
// Tamanho de referência (raio da esfera em pixels) para o qual o tamanho das
// partículas foi ajustado
const REF_RADIUS_PX = 171;

const particleVertex = /* glsl */ `
attribute vec4 aA;   // eixo do filamento (xyz) e raio da camada (w)
attribute vec4 aP;   // fase (x), deslocamento lateral (y), aleatório (z), semente do filamento (w)
uniform float uTime, uSize, uVoice, uRest, uMotion;
uniform vec4 uBands;
varying float vA; varying float vHot;
void main(){
  vec3 ax = normalize(aA.xyz); float seed = aP.w;
  vec3 u = normalize(cross(ax, abs(ax.y) < 0.9 ? vec3(0.,1.,0.) : vec3(1.,0.,0.)));
  vec3 v = cross(ax, u);
  float dirS = fract(seed*3.7) > 0.5 ? 1.0 : -1.0;
  float spd = (0.10 + 0.14*fract(seed*7.13)) * dirS;
  float ang = aP.x*6.2831853 + uMotion*spd;
  float wob = 0.38*sin(ang*2.0 + seed*6.0 + uTime*0.25) + 0.16*sin(ang*5.0 - uTime*0.4 + seed*3.0);
  float lat = aP.y*(0.02 + 0.08*(0.5 + 0.5*sin(ang*3.0 + seed*9.0 + uTime*0.5)));
  vec3 dir = normalize(cos(ang)*u + sin(ang)*v + ax*(wob + lat));
  float r = aA.w + 0.035*sin(ang*4.0 + uTime*0.7 + seed*5.0) + (aP.z - 0.5)*0.025;

  // falando: só a camada externa reage à voz
  float outer = smoothstep(0.78, 0.97, aA.w);
  float wv = 0.5 + 0.5*(sin(ang*3.0 + uTime*2.1)*uBands.x + sin(ang*5.0 - uTime*2.7)*uBands.y
                       + sin(ang*8.0 + uTime*3.3)*uBands.z) / (uBands.x + uBands.y + uBands.z + 0.001);
  float vv = uVoice*outer;
  r += vv*(0.035 + 0.06*wv);

  vec3 p = dir*r;
  float g = uMotion*0.07, cg = cos(g), sg = sin(g);
  p = vec3(cg*p.x + sg*p.z, p.y, -sg*p.x + cg*p.z);
  float tl = 0.32, ct = cos(tl), st = sin(tl);
  p = vec3(p.x, ct*p.y - st*p.z, st*p.y + ct*p.z);

  vec4 mv = modelViewMatrix*vec4(p, 1.0);
  gl_Position = projectionMatrix*mv;
  float s = 2.6/(3.2 - p.z);
  float depth = 0.5 + 0.5*p.z/max(r, 0.001);
  float tw = 0.55 + 0.45*sin(uTime*(2.0 + 3.0*aP.z) + seed*40.0 + aP.x*60.0);
  gl_PointSize = (1.3 + 2.8*aP.z*aP.z)*s*uSize*(1.0 + 0.6*vv);
  vA = 2.6*(0.22 + 0.78*depth)*tw*(mix(0.66, 0.28, uRest) + 1.1*vv);
  vHot = 1.0 - smoothstep(0.35, 0.85, r);
}`;

const particleFragment = /* glsl */ `
uniform vec3 uColor, uHot;
varying float vA; varying float vHot;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d); a *= a;
  gl_FragColor = vec4(mix(uColor, uHot, vHot*0.75)*a*vA, 1.0);
}`;

const coreVertex = /* glsl */ `
varying vec2 vPos;
void main(){
  vPos = position.xy;
  gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0);
}`;

// Fundo levemente iluminado + núcleo com brilho em estrela
const coreFragment = /* glsl */ `
uniform float uTime, uScale, uGlow, uSpin;
uniform vec4 uMix;   // repouso, ouvindo, pensando, falando
uniform vec3 uColor;
varying vec2 vPos;
void main(){
  vec2 p = vPos*uScale;
  float r = length(p);
  float idle=uMix.x, listen=uMix.y, think=uMix.z, speak=uMix.w;
  float t = uTime;
  vec3 hot = mix(uColor, vec3(1.0), 0.7), soft = mix(uColor, vec3(1.0), 0.5);

  vec3 bg = uColor*0.09*exp(-r*3.2) + uColor*0.10*exp(-r*r*14.0);

  // repouso: núcleo pequeno e contido
  float rest = 0.38*idle;
  // ouvindo: o núcleo respira e solta ondas de luz que se abrem do centro
  float br = 0.5 + 0.5*sin(t*2.4);
  float lis = listen*(0.75 + 0.35*br);
  float ph = fract(t*0.55);
  float wave = listen*exp(-abs(r - ph*0.16)*160.0)*(1.0 - ph)*0.55;
  // pensando: a estrela gira e três faíscas orbitam o núcleo
  float th = think*(0.82 + 0.18*sin(t*9.0)*sin(t*5.3));
  float cg = cos(uSpin), sg = sin(uSpin);
  vec2 q = vec2(cg*p.x - sg*p.y, sg*p.x + cg*p.y);
  float sparks = 0.0;
  for (int i=0;i<3;i++){
    float a = t*3.0 + float(i)*2.0944;
    for (int j=0;j<5;j++){
      float aj = a - float(j)*0.12;
      vec2 sp = 0.05*vec2(cos(aj), sin(aj)) - p;
      sparks += exp(-dot(sp,sp)*45000.0)*(1.0 - float(j)*0.18);
    }
  }
  sparks *= think;

  float coreI = (rest + lis + th + 0.78*speak)*uGlow;
  float grow = 1.0 + 0.9*br*listen;
  float glow = exp(-r*r*1100.0/grow)*1.3 + exp(-r*r*110.0/grow)*0.38 + exp(-r*12.0)*0.10;
  float flareLen = 0.45*idle + 1.0 - idle;
  float flare = exp(-abs(q.y)*520.0)*exp(-abs(q.x)*8.0/flareLen)*0.7
              + exp(-abs(q.x)*520.0)*exp(-abs(q.y)*11.0/flareLen)*0.4;
  vec3 c = bg + (hot*glow + soft*flare)*coreI + soft*wave + hot*sparks*0.6;
  gl_FragColor = vec4(c, 1.0);
}`;

export function createOrb({ radius = 1.2, particles = 12000, filaments = 24 } = {}) {
  const group = new THREE.Group();

  // filamentos: cada um é uma órbita torcida em volta da esfera
  const fil = [];
  for (let k = 0; k < filaments; k++) {
    const z = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, q = Math.sqrt(1 - z * z);
    fil.push([q * Math.cos(th), z, q * Math.sin(th), 0.42 + 0.58 * Math.sqrt(Math.random()), Math.random()]);
  }
  const aA = new Float32Array(particles * 4);
  const aP = new Float32Array(particles * 4);
  for (let i = 0; i < particles; i++) {
    const f = fil[i % filaments];
    const lateral = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    aA.set([f[0], f[1], f[2], f[3]], i * 4);
    aP.set([f[4] + Math.random() * 0.55, lateral, Math.random(), f[4]], i * 4);
  }
  const geometry = new THREE.BufferGeometry();
  // posição real é calculada no shader; o atributo só define a contagem
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(particles * 3), 3));
  geometry.setAttribute("aA", new THREE.BufferAttribute(aA, 4));
  geometry.setAttribute("aP", new THREE.BufferAttribute(aP, 4));

  const color = new THREE.Color();
  const particleMaterial = new THREE.ShaderMaterial({
    vertexShader: particleVertex,
    fragmentShader: particleFragment,
    uniforms: {
      uTime: { value: 0 },
      uMotion: { value: 0 },
      uSize: { value: 1 },
      uVoice: { value: 0 },
      uRest: { value: 1 },
      uBands: { value: new THREE.Vector4(0.6, 0.4, 0.3, 0.2) },
      uColor: { value: color },
      uHot: { value: new THREE.Color(0.78, 0.9, 1.0) }
    },
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    transparent: true
  });
  const points = new THREE.Points(geometry, particleMaterial);
  points.scale.setScalar(radius);
  points.frustumCulled = false;
  group.add(points);

  // plano grande atrás de tudo: fundo e núcleo (somados à luz das partículas)
  const coreSize = radius * 16;
  const coreMaterial = new THREE.ShaderMaterial({
    vertexShader: coreVertex,
    fragmentShader: coreFragment,
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: CORE_SCALE / radius },
      uGlow: { value: 1 },
      uSpin: { value: 0 },
      uMix: { value: new THREE.Vector4(1, 0, 0, 0) },
      uColor: { value: color }
    },
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    transparent: true
  });
  const core = new THREE.Mesh(new THREE.PlaneGeometry(coreSize, coreSize), coreMaterial);
  core.frustumCulled = false;
  group.add(core);

  // "timbre" da voz: muda a cada pico de nível para os filamentos não ondularem sempre igual
  const bands = [0.6, 0.4, 0.3, 0.2], bandTarget = [0.6, 0.4, 0.3, 0.2];
  let lastVoice = 0, rising = false, time = 0, motion = 0, spin = 0;

  return {
    object: group,
    get color() { return color; },

    // mix: [repouso, ouvindo, pensando, falando], somando 1
    update({ dt, mix, voice, camera, viewportHeight, pixelRatio, restSpeed = 0.55, glow = 1 }) {
      time += dt;
      // a velocidade dos filamentos é acumulada para não saltar quando o estado muda
      motion += dt * (1 - (1 - restSpeed) * mix[0]);

      // a estrela do núcleo gira ao pensar; fora disso volta à posição horizontal
      if (mix[2] > 0.5) spin += dt * 1.4;
      else spin += (Math.round(spin / Math.PI) * Math.PI - spin) * (1 - Math.exp(-dt * 4));

      if (voice > lastVoice + 0.02 && !rising) {
        rising = true;
        for (let i = 0; i < 4; i++) bandTarget[i] = 0.15 + Math.random() * 0.85 * (1 - i * 0.15);
      } else if (voice < lastVoice) rising = false;
      lastVoice = voice;
      for (let i = 0; i < 4; i++) bands[i] += (bandTarget[i] - bands[i]) * (1 - Math.exp(-dt * 8));

      // tamanho das partículas acompanha o tamanho da esfera na tela
      const dist = camera.position.length();
      const radiusPx = radius / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist) * (viewportHeight / 2);
      const pu = particleMaterial.uniforms;
      pu.uTime.value = time;
      pu.uMotion.value = motion;
      pu.uSize.value = (radiusPx / REF_RADIUS_PX) * pixelRatio;
      pu.uVoice.value = voice;
      pu.uRest.value = mix[0];
      pu.uBands.value.set(bands[0], bands[1], bands[2], bands[3]);

      const cu = coreMaterial.uniforms;
      cu.uTime.value = time;
      cu.uGlow.value = glow;
      cu.uSpin.value = spin;
      cu.uMix.value.set(mix[0], mix[1], mix[2], mix[3]);
    }
  };
}
