/**
 * ZAIRO - Interface HUD Futurista
 * Esfera holográfica com estados visuais reativos
 */

// ============================================
// CONFIGURAÇÕES E VARIÁVEIS GLOBAIS
// ============================================

let scene, camera, renderer;
let composer, bloomPass, renderPass, outputPass;
let sphere, sphereMaterial;
let glowSphere, glowMaterial;
let orbitalRings = [];
let particles = [];
let neonParticles = []; // Partículas néon que orbitam a esfera
let neonParticleSystem = null;
let currentState = 'idle';
let animationTime = 0;
let audioContext = null;
let analyser = null;
let audioData = null;

// Cores do tema - inspiradas no design do Dribbble
const COLORS = {
  cyan: 0x00d9ff,      // Ciano brilhante para anel
  darkBlue: 0x0a1a2e,  // Azul escuro para esfera central
  darkBlue2: 0x162447, // Azul escuro alternativo
  blue: 0x0099ff,      // Azul vibrante
  purple: 0x9966ff,    // Roxo suave
  accent: 0x00ffff,    // Ciano brilhante para acentos
  dark: 0x000000
};

// Configurações de estados - ajustadas para design do Dribbble
const STATE_CONFIG = {
  idle: {
    sphereOpacity: 0.95,
    sphereColor: COLORS.darkBlue, // Azul escuro
    ringIntensity: 0.4,
    pulseSpeed: 0.5,
    rotationSpeed: 0.1,
    ringColor: COLORS.cyan,
    text: 'Aguardando...',
    scale: 1.0,
    bloomStrength: 0.5,
    bloomRadius: 0.4
  },
  detecting: {
    sphereOpacity: 0.98,
    sphereColor: COLORS.blue, // Azul vibrante
    ringIntensity: 1.0,
    pulseSpeed: 1.5,
    rotationSpeed: 0.3,
    ringColor: COLORS.cyan,
    text: 'Detectando...',
    scale: 1.0,
    bloomStrength: 1.2,
    bloomRadius: 0.6
  },
  greeting: {
    sphereOpacity: 0.98,
    sphereColor: COLORS.purple, // Roxo
    ringIntensity: 1.2,
    pulseSpeed: 2.5,
    rotationSpeed: 0.5,
    ringColor: COLORS.cyan,
    text: 'Saudando...',
    scale: 1.0,
    bloomStrength: 1.8,
    bloomRadius: 0.8
  }
};

// ============================================
// FUNÇÕES DE EASING CINEMATOGRÁFICAS
// ============================================

const Easing = {
  // Ease out exponencial - suave e natural
  easeOutExpo: (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  
  // Ease in-out cúbico - transição suave
  easeInOutCubic: (t) => t < 0.5 
    ? 4 * t * t * t 
    : 1 - Math.pow(-2 * t + 2, 3) / 2,
  
  // Ease out back - efeito de "bounce" sutil
  easeOutBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  
  // Ease in-out quart - muito suave
  easeInOutQuart: (t) => t < 0.5
    ? 8 * t * t * t * t
    : 1 - Math.pow(-2 * t + 2, 4) / 2,
  
  // Ease out circ - movimento circular suave
  easeOutCirc: (t) => Math.sqrt(1 - Math.pow(t - 1, 2))
};

// ============================================
// POST-PROCESSING COM BLOOM
// ============================================

function setupPostProcessing() {
  // Verifica se os scripts de post-processing foram carregados
  if (typeof THREE.EffectComposer === 'undefined') {
    console.warn('Post-processing não disponível, usando renderer padrão');
    return;
  }
  
  // Cria o composer para post-processing
  composer = new THREE.EffectComposer(renderer);
  
  // Render pass - renderiza a cena
  renderPass = new THREE.RenderPass(scene, camera);
  composer.addPass(renderPass);
  
  // Bloom pass - efeito de brilho
  const resolution = new THREE.Vector2(window.innerWidth, window.innerHeight);
  bloomPass = new THREE.UnrealBloomPass(resolution, 1.5, 0.4, 0.85);
  bloomPass.threshold = 0.4;
  bloomPass.strength = STATE_CONFIG.idle.bloomStrength;
  bloomPass.radius = STATE_CONFIG.idle.bloomRadius;
  composer.addPass(bloomPass);
  
  // Output pass - ajusta o tom final
  if (typeof THREE.OutputPass !== 'undefined') {
    outputPass = new THREE.OutputPass();
    composer.addPass(outputPass);
  }
}

// ============================================
// INICIALIZAÇÃO DO THREE.JS
// ============================================

function initThreeJS() {
  try {
    // Verifica se Three.js está disponível
    if (typeof THREE === 'undefined') {
      throw new Error('Three.js não foi carregado!');
    }

    // Cria a cena
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    // Configura a câmera
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    camera.position.z = 5;

    // Configura o renderer
    const canvas = document.getElementById('hud-canvas');
    if (!canvas) {
      throw new Error('Canvas não encontrado!');
    }

    renderer = new THREE.WebGLRenderer({ 
      canvas: canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    // Configura post-processing com bloom
    setupPostProcessing();

    // Cria a esfera holográfica
    createHolographicSphere();

    // Cria os anéis orbitais
    createOrbitalRings();
    
    // Inicializa escala inicial
    sphere.scale.set(1.0, 1.0, 1.0);

    // Inicia o loop de animação
    animate();

    // Ajusta ao redimensionar a janela
    window.addEventListener('resize', onWindowResize);
  } catch (error) {
    console.error('Erro ao inicializar Three.js:', error);
    throw error;
  }
}

// ============================================
// CRIAÇÃO DA ESFERA HOLOGRÁFICA
// ============================================

function createHolographicSphere() {
  // Esfera central sólida e opaca - estilo Dribbble
  const geometry = new THREE.SphereGeometry(1.2, 64, 64);
  
  // Material sólido azul escuro com textura sutil
  const vertexShader = `
    varying vec3 vNormal;
    varying vec3 vPosition;
    
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float time;
    uniform float sphereOpacity;
    uniform float pulseSpeed;
    uniform vec3 sphereColor;
    
    varying vec3 vNormal;
    varying vec3 vPosition;
    
    // Função de noise para textura sutil
    float noise(vec3 p) {
      return fract(sin(dot(p, vec3(12.9898, 78.233, 54.53))) * 43758.5453);
    }
    
    void main() {
      // Cor baseada no estado (passada como uniform)
      vec3 baseColor = sphereColor;
      
      // Textura sutil com noise
      float n = noise(vPosition * 3.0 + time * 0.1);
      baseColor += vec3(n * 0.02);
      
      // Pulso muito sutil
      float pulse = sin(time * pulseSpeed * 0.3) * 0.02 + 1.0;
      baseColor *= pulse;
      
      // Adiciona brilho nas bordas para bloom
      float edgeGlow = pow(1.0 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
      baseColor += baseColor * edgeGlow * 0.3;
      
      // Esfera quase opaca
      float alpha = sphereOpacity;
      
      gl_FragColor = vec4(baseColor, alpha);
    }
  `;

  sphereMaterial = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      sphereOpacity: { value: STATE_CONFIG.idle.sphereOpacity },
      pulseSpeed: { value: STATE_CONFIG.idle.pulseSpeed },
      sphereColor: { value: new THREE.Color(STATE_CONFIG.idle.sphereColor) }
    },
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    transparent: true,
    side: THREE.FrontSide
  });

  sphere = new THREE.Mesh(geometry, sphereMaterial);
  scene.add(sphere);

  // Esfera de glow externo para efeito mais realista
  const glowGeometry = new THREE.SphereGeometry(1.15, 64, 64);
  
  const glowVertexShader = `
    uniform vec3 camPos;
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vWorldPosition;
    varying vec3 vViewDir;
    
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = position;
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      vViewDir = normalize(camPos - worldPosition.xyz);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  
  const glowFragmentShader = `
    uniform float time;
    uniform float glowIntensity;
    uniform vec3 color;
    uniform float pulseSpeed;
    
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vWorldPosition;
    varying vec3 vViewDir;
    
    void main() {
      float fresnel = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 2.8);
      
      float pulse = sin(time * pulseSpeed * 0.75) * 0.25 + 0.75;
      
      vec3 glowColor = color * 0.55;
      float alpha = fresnel * glowIntensity * pulse * 0.35;
      alpha = smoothstep(0.1, 0.6, alpha);
      
      gl_FragColor = vec4(glowColor, alpha);
    }
  `;
  
  glowMaterial = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      glowIntensity: { value: STATE_CONFIG.idle.outerGlowIntensity },
      color: { value: new THREE.Color(STATE_CONFIG.idle.color) },
      pulseSpeed: { value: STATE_CONFIG.idle.pulseSpeed },
      camPos: { value: camera.position }
    },
    vertexShader: glowVertexShader,
    fragmentShader: glowFragmentShader,
    transparent: true,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  
  // Não precisa de glow externo - esfera é sólida
  glowSphere = null;
}

// ============================================
// CRIAÇÃO DOS ANÉIS ORBITAIS
// ============================================

function createOrbitalRings() {
  // Cria um único anel orbital proeminente - estilo Dribbble
  const ringGeometry = new THREE.RingGeometry(1.35, 1.45, 128);
  
  const ringVertexShader = `
    varying vec3 vNormal;
    varying vec3 vPosition;
    
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  
  const ringFragmentShader = `
    uniform float time;
    uniform float ringIntensity;
    uniform vec3 ringColor;
    uniform float pulseSpeed;
    
    varying vec3 vNormal;
    varying vec3 vPosition;
    
    void main() {
      // Anel brilhante em teal/ciano
      vec3 color = ringColor;
      
      // Pulso animado
      float pulse = sin(time * pulseSpeed) * 0.3 + 0.7;
      
      // Intensidade baseada no estado
      float alpha = ringIntensity * pulse;
      
      gl_FragColor = vec4(color, alpha);
    }
  `;
  
  const ringMaterial = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      ringIntensity: { value: STATE_CONFIG.idle.ringIntensity },
      ringColor: { value: new THREE.Color(COLORS.cyan) },
      pulseSpeed: { value: STATE_CONFIG.idle.pulseSpeed }
    },
    vertexShader: ringVertexShader,
    fragmentShader: ringFragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
  
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = Math.PI / 2;
  
  ring.userData = {
    baseSpeed: 0.2,
    offset: 0,
    currentSpeed: 0.2,
    material: ringMaterial
  };
  
  orbitalRings.push(ring);
  scene.add(ring);
}

// ============================================
// PARTÍCULAS NÉON QUE ORBITAM A ESFERA
// ============================================

function createNeonParticles() {
  const particleCount = 30;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);
  
  const color = new THREE.Color(COLORS.cyan);
  
  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    
    // Posições em órbita ao redor da esfera
    const radius = 1.8 + Math.random() * 0.3;
    const theta = (Math.random() * Math.PI * 2);
    const phi = (Math.random() * Math.PI);
    
    positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i3 + 2] = radius * Math.cos(phi);
    
    // Cores néon variadas
    const hue = (i / particleCount) * 0.3; // Varia entre ciano e azul
    color.setHSL(0.5 + hue, 1.0, 0.6);
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;
    
    sizes[i] = Math.random() * 0.1 + 0.05;
    
    neonParticles.push({
      radius: radius,
      theta: theta,
      phi: phi,
      speed: 0.01 + Math.random() * 0.02,
      baseSize: sizes[i]
    });
  }
  
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      audioReaction: { value: 1.0 }
    },
    vertexShader: `
      attribute float size;
      attribute vec3 color;
      varying vec3 vColor;
      uniform float time;
      uniform float audioReaction;
      
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (300.0 / -mvPosition.z) * audioReaction;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      uniform float time;
      
      void main() {
        float dist = distance(gl_PointCoord, vec2(0.5));
        float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
        gl_FragColor = vec4(vColor, alpha * 0.8);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    vertexColors: true
  });
  
  neonParticleSystem = new THREE.Points(geometry, material);
  scene.add(neonParticleSystem);
}

// ============================================
// ANÁLISE DE ÁUDIO (SIMULADA)
// ============================================

function initAudioAnalysis() {
  try {
    // Tenta criar contexto de áudio real
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    audioData = new Uint8Array(analyser.frequencyBinCount);
    
    // Tenta obter microfone (opcional)
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        console.log('Áudio conectado para análise');
      })
      .catch(err => {
        console.log('Microfone não disponível, usando simulação de áudio');
        // Usa simulação se não houver microfone
      });
  } catch (e) {
    console.log('Áudio não suportado, usando simulação');
  }
}

function getAudioReaction() {
  if (analyser && audioData) {
    analyser.getByteFrequencyData(audioData);
    // Média das frequências baixas (bass)
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += audioData[i];
    }
    return 1.0 + (sum / 10 / 255) * 2.0; // Multiplica tamanho das partículas
  }
  // Simulação baseada no tempo
  return 1.0 + Math.sin(animationTime * 2) * 0.5;
}

// ============================================
// SISTEMA DE PARTÍCULAS
// ============================================

function initParticles() {
  const canvas = document.getElementById('particles-canvas');
  const ctx = canvas.getContext('2d');
  
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  // Cria partículas mais sutis e refinadas
  for (let i = 0; i < 40; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: Math.random() * 1.0 + 0.3,
      baseSpeed: Math.random() * 0.3 + 0.1,
      speed: Math.random() * 0.3 + 0.1,
      opacity: Math.random() * 0.2 + 0.1,
      baseOpacity: Math.random() * 0.2 + 0.1,
      drift: (Math.random() - 0.5) * 0.2, // Deriva horizontal mais sutil
      pulsePhase: Math.random() * Math.PI * 2,
      pulseSpeed: Math.random() * 0.015 + 0.008
    });
  }

  function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const time = Date.now() * 0.001;
    
    particles.forEach(particle => {
      // Movimento orgânico com deriva e variação de velocidade
      particle.speed = particle.baseSpeed + Math.sin(time * 2 + particle.pulsePhase) * 0.05;
      particle.y -= particle.speed;
      particle.x += particle.drift * Math.sin(time + particle.pulsePhase);
      
      // Pulso de opacidade orgânico - mais sutil
      particle.opacity = particle.baseOpacity + Math.sin(time * particle.pulseSpeed + particle.pulsePhase) * 0.05;
      particle.opacity = Math.max(0.05, Math.min(0.3, particle.opacity));
      
      // Reseta se sair da tela
      if (particle.y < -10) {
        particle.y = canvas.height + 10;
        particle.x = Math.random() * canvas.width;
      }
      
      // Mantém partícula na tela horizontalmente
      if (particle.x < -10) particle.x = canvas.width + 10;
      if (particle.x > canvas.width + 10) particle.x = -10;
      
      // Desenha partícula com glow mais sutil
      const gradient = ctx.createRadialGradient(
        particle.x, particle.y, 0,
        particle.x, particle.y, particle.radius * 3
      );
      gradient.addColorStop(0, `rgba(0, 217, 255, ${particle.opacity})`);
      gradient.addColorStop(0.4, `rgba(0, 217, 255, ${particle.opacity * 0.4})`);
      gradient.addColorStop(1, `rgba(0, 217, 255, 0)`);
      
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius * 3, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
    });
    
    requestAnimationFrame(animateParticles);
  }

  animateParticles();

  // Ajusta ao redimensionar
  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });
}

// ============================================
// LINHAS DECORATIVAS DA HUD
// ============================================

function createHudLines() {
  const container = document.getElementById('hud-lines');
  
  // Cria algumas linhas de varredura
  for (let i = 0; i < 3; i++) {
    const line = document.createElement('div');
    line.className = 'hud-line';
    line.style.width = '100%';
    line.style.top = `${i * 33}%`;
    line.style.animationDelay = `${i * 1}s`;
    container.appendChild(line);
  }
}

// ============================================
// CONTROLE DE ESTADOS
// ============================================

function setState(newState) {
  if (!STATE_CONFIG[newState]) {
    console.warn(`Estado inválido: ${newState}`);
    return;
  }

  currentState = newState;
  const config = STATE_CONFIG[newState];
  const statusText = document.getElementById('status-text');

  // Atualiza texto de status
  if (statusText) {
    statusText.textContent = config.text;
  }

  // Anima transição de cor e intensidade
  animateStateTransition(config);
}

function animateStateTransition(config) {
  // Valores iniciais
  const startOpacity = sphereMaterial.uniforms.sphereOpacity.value;
  const startColor = sphereMaterial.uniforms.sphereColor.value.clone();
  const targetColor = new THREE.Color(config.sphereColor);
  const startRingIntensity = orbitalRings[0].userData.material.uniforms.ringIntensity.value;
  const startPulse = sphereMaterial.uniforms.pulseSpeed.value;
  const startRingPulse = orbitalRings[0].userData.material.uniforms.pulseSpeed.value;
  const startBloomStrength = bloomPass ? bloomPass.strength : 0.5;
  const startBloomRadius = bloomPass ? bloomPass.radius : 0.4;
  
  const targetOpacity = config.sphereOpacity;
  const targetRingIntensity = config.ringIntensity;
  const targetPulse = config.pulseSpeed;
  const targetBloomStrength = config.bloomStrength;
  const targetBloomRadius = config.bloomRadius;

  let progress = 0;
  const duration = 1500;
  const startTime = Date.now();

  function updateTransition() {
    const elapsed = Date.now() - startTime;
    progress = Math.min(elapsed / duration, 1);
    
    // Easing cinematográfico
    const easeProgress = Easing.easeOutExpo(progress);

    // Interpola opacidade da esfera
    sphereMaterial.uniforms.sphereOpacity.value = 
      startOpacity + (targetOpacity - startOpacity) * easeProgress;
    
    // Interpola cor da esfera
    sphereMaterial.uniforms.sphereColor.value.lerp(targetColor, easeProgress);
    
    // Interpola intensidade do anel
    orbitalRings[0].userData.material.uniforms.ringIntensity.value = 
      startRingIntensity + (targetRingIntensity - startRingIntensity) * easeProgress;
    
    // Interpola velocidade de pulso
    sphereMaterial.uniforms.pulseSpeed.value = 
      startPulse + (targetPulse - startPulse) * easeProgress;
    orbitalRings[0].userData.material.uniforms.pulseSpeed.value = 
      startRingPulse + (targetPulse - startRingPulse) * easeProgress;
    
    // Interpola bloom
    if (bloomPass) {
      bloomPass.strength = startBloomStrength + (targetBloomStrength - startBloomStrength) * easeProgress;
      bloomPass.radius = startBloomRadius + (targetBloomRadius - startBloomRadius) * easeProgress;
    }

    if (progress < 1) {
      requestAnimationFrame(updateTransition);
    } else {
      // Garante valores finais exatos
      sphereMaterial.uniforms.sphereOpacity.value = targetOpacity;
      sphereMaterial.uniforms.sphereColor.value.copy(targetColor);
      orbitalRings[0].userData.material.uniforms.ringIntensity.value = targetRingIntensity;
      sphereMaterial.uniforms.pulseSpeed.value = targetPulse;
      orbitalRings[0].userData.material.uniforms.pulseSpeed.value = targetPulse;
      if (bloomPass) {
        bloomPass.strength = targetBloomStrength;
        bloomPass.radius = targetBloomRadius;
      }
    }
  }

  updateTransition();
}

// ============================================
// LOOP DE ANIMAÇÃO
// ============================================

function animate() {
  requestAnimationFrame(animate);

  animationTime += 0.016; // ~60fps
  const time = animationTime;

  // Rotaciona a esfera com movimento sutil
  if (sphere) {
    const stateConfig = STATE_CONFIG[currentState];
    
    // Rotação muito sutil - esfera quase estática
    sphere.rotation.x += 0.001 * stateConfig.rotationSpeed;
    sphere.rotation.y += 0.0015 * stateConfig.rotationSpeed;
    
    // Atualiza uniforme de tempo para o shader
    sphereMaterial.uniforms.time.value = time;
  }

  // Rotaciona o anel orbital
  orbitalRings.forEach((ring) => {
    const stateConfig = STATE_CONFIG[currentState];
    
    // Velocidade baseada no estado
    ring.userData.currentSpeed += (ring.userData.baseSpeed * stateConfig.rotationSpeed - ring.userData.currentSpeed) * 0.05;
    
    // Rotação no eixo Z (anel horizontal)
    ring.rotation.z += 0.01 * ring.userData.currentSpeed;
    
    // Atualiza uniformes do shader
    ring.userData.material.uniforms.time.value = time;
  });

  // Anima partículas néon
  if (neonParticleSystem) {
    const stateConfig = STATE_CONFIG[currentState];
    const positions = neonParticleSystem.geometry.attributes.position;
    const sizes = neonParticleSystem.geometry.attributes.size;
    const audioReaction = getAudioReaction();
    
    neonParticles.forEach((particle, i) => {
      const i3 = i * 3;
      
      // Atualiza órbita
      particle.theta += particle.speed * stateConfig.rotationSpeed;
      particle.phi += particle.speed * 0.3 * stateConfig.rotationSpeed;
      
      // Reação ao áudio
      const audioScale = audioReaction;
      const radius = particle.radius * (1.0 + (audioScale - 1.0) * 0.2);
      
      positions.array[i3] = radius * Math.sin(particle.phi) * Math.cos(particle.theta);
      positions.array[i3 + 1] = radius * Math.sin(particle.phi) * Math.sin(particle.theta);
      positions.array[i3 + 2] = radius * Math.cos(particle.phi);
      
      // Tamanho reage ao áudio
      sizes.array[i] = particle.baseSize * audioScale;
    });
    
    positions.needsUpdate = true;
    sizes.needsUpdate = true;
    neonParticleSystem.material.uniforms.time.value = time;
    neonParticleSystem.material.uniforms.audioReaction.value = audioReaction;
  }

  // Renderiza com post-processing ou renderer padrão
  if (composer) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
}

// ============================================
// EVENTOS E UTILITÁRIOS
// ============================================

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  
  // Atualiza post-processing
  if (composer) {
    composer.setSize(window.innerWidth, window.innerHeight);
    bloomPass.setSize(window.innerWidth, window.innerHeight);
  }
}

// ============================================
// INICIALIZAÇÃO
// ============================================

function init() {
  // Aguarda o carregamento do Three.js
  if (typeof THREE === 'undefined') {
    console.error('Three.js não foi carregado! Verifique se o script foi carregado corretamente.');
    const errorDiv = document.getElementById('error');
    if (errorDiv) {
      errorDiv.textContent = 'Erro: Three.js não foi carregado. Verifique sua conexão com a internet.';
      errorDiv.style.display = 'block';
    }
    return;
  }

  try {
    // Inicializa componentes
    initThreeJS();
    initParticles();
    createHudLines();
    createNeonParticles();
    initAudioAnalysis();

    // Define estado inicial
    setState('greeting');
    // setState('idle');
    // setState('detecting');

    console.log('ZAIRO HUD inicializado com sucesso!');
    console.log('Use setState("idle"), setState("detecting") ou setState("greeting") para mudar estados');
  } catch (error) {
    console.error('Erro ao inicializar HUD:', error);
    const errorDiv = document.getElementById('error');
    if (errorDiv) {
      errorDiv.textContent = `Erro: ${error.message}`;
      errorDiv.style.display = 'block';
    }
  }
}

// Inicializa quando a página carregar
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Expõe setState globalmente para uso externo
window.setState = setState;

