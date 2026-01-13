import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

import { vertexShader, fragmentShader } from "./shaders.js";

// Tratamento de erros
window.addEventListener('error', (e) => {
  console.error('Erro global:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('Promise rejeitada:', e.reason);
});

// ============================================
// CONFIGURAÇÕES
// ============================================

const COLORS = {
  // Paleta baseada no Dribbble: https://dribbble.com/shots/26577900-AI-Assistant-Sphere
  primary: 0x00d9ff,      // Ciano brilhante para anel e glow
  secondary: 0x78627d,    // Roxo (#78627D) - cor principal da paleta
  accent: 0xd0b345,      // Dourado (#D0B345) - acentos
  dark: 0x252f4b,        // Azul escuro/roxo (#252F4B) - base da esfera
  dark2: 0x1a1f2e,       // Azul muito escuro (variação)
  light: 0xcac8c4,       // Bege claro (#CAC8C4) - highlights sutis
  purple: 0x78627d,      // Roxo principal
  gold: 0xd0b345         // Dourado para acentos
};

// ============================================
// SISTEMA DE ESTADOS DA IA
// ============================================

let currentState = "idle";
let targetState = "idle";

// Configurações visuais para cada estado
const STATE_CONFIG = {
  idle: {
    sphereColor: new THREE.Color(COLORS.dark),      // #252F4B - azul escuro
    sphereIntensity: 0.4,                            // Intensidade baixa
    ringColor: new THREE.Color(COLORS.primary),      // Ciano
    ringOpacity: 0.3,                                // Anel sutil
    ringSpeed: 0.01,                                 // Rotação lenta
    sphereRotationSpeed: { x: 0.001, y: 0.002 },    // Rotação muito lenta
    energySpeed: 0.1,                                // Energia lenta
    bloomStrength: 1.5,                              // Bloom moderado
    pulseSpeed: 0.6                                  // Pulso lento
  },
  active: {
    sphereColor: new THREE.Color(COLORS.purple),     // #78627D - roxo
    sphereIntensity: 0.8,                            // Intensidade alta
    ringColor: new THREE.Color(COLORS.primary),      // Ciano brilhante
    ringOpacity: 0.7,                                // Anel visível
    ringSpeed: 0.02,                                 // Rotação média
    sphereRotationSpeed: { x: 0.003, y: 0.004 },    // Rotação média
    energySpeed: 0.3,                                // Energia média
    bloomStrength: 2.5,                              // Bloom forte
    pulseSpeed: 1.5                                  // Pulso médio
  },
  listening: {
    sphereColor: new THREE.Color(COLORS.gold),       // #D0B345 - dourado
    sphereIntensity: 1.2,                            // Intensidade muito alta
    ringColor: new THREE.Color(COLORS.gold),         // Dourado brilhante
    ringOpacity: 0.9,                                // Anel muito visível
    ringSpeed: 0.04,                                 // Rotação rápida
    sphereRotationSpeed: { x: 0.005, y: 0.006 },    // Rotação rápida
    energySpeed: 0.6,                                // Energia rápida
    bloomStrength: 3.5,                              // Bloom muito forte
    pulseSpeed: 3.0                                  // Pulso rápido
  }
};

// Valores atuais (para transições suaves)
let currentConfig = {
  sphereColor: new THREE.Color(STATE_CONFIG.idle.sphereColor),
  sphereIntensity: STATE_CONFIG.idle.sphereIntensity,
  ringColor: new THREE.Color(STATE_CONFIG.idle.ringColor),
  ringOpacity: STATE_CONFIG.idle.ringOpacity,
  ringSpeed: STATE_CONFIG.idle.ringSpeed,
  sphereRotationSpeed: { ...STATE_CONFIG.idle.sphereRotationSpeed },
  energySpeed: STATE_CONFIG.idle.energySpeed,
  bloomStrength: STATE_CONFIG.idle.bloomStrength,
  pulseSpeed: STATE_CONFIG.idle.pulseSpeed
};

// Função para mudar o estado da IA
function setState(newState) {
  if (newState !== currentState && STATE_CONFIG[newState]) {
    targetState = newState;
    console.log(`Estado mudando de "${currentState}" para "${newState}"`);
  }
}

// Função de easing suave para transições
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Interpolação suave entre valores
function lerp(start, end, t) {
  return start + (end - start) * t;
}

// Interpolação de cores
function lerpColor(color1, color2, t) {
  const result = new THREE.Color();
  result.r = lerp(color1.r, color2.r, t);
  result.g = lerp(color1.g, color2.g, t);
  result.b = lerp(color1.b, color2.b, t);
  return result;
}

// ============================================
// CENA E CÂMERA
// ============================================

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000); // Preto puro

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.z = 5;
camera.position.y = 0;
camera.position.x = 0;
camera.lookAt(0, 0, 0);

// ============================================
// RENDERER
// ============================================

// Remove canvas existente se houver
const existingCanvas = document.querySelector('canvas');
if (existingCanvas) {
  existingCanvas.remove();
}

const renderer = new THREE.WebGLRenderer({ 
  antialias: true, 
  alpha: true,
  powerPreference: "high-performance"
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

// ============================================
// POST-PROCESSING COM BLOOM REAL
// ============================================

const renderScene = new RenderPass(scene, camera);
const composer = new EffectComposer(renderer);
composer.addPass(renderScene);

// Configuração do Bloom para efeito realista
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.5,  // strength inicial
  0.4,  // radius inicial
  0.85  // threshold inicial
);

// Parâmetros otimizados para bloom realista - estilo Dribbble
bloomPass.threshold = 0.3;    // Threshold mais baixo para mais bloom
bloomPass.strength = 2.5;     // Intensidade do bloom (muito forte)
bloomPass.radius = 1.0;       // Raio do blur (mais suave e difuso)

composer.addPass(bloomPass);

// OutputPass removido - bloom funciona melhor sem ele
// const outputPass = new OutputPass();
// composer.addPass(outputPass);

// Garante que o composer está configurado corretamente
composer.setSize(window.innerWidth, window.innerHeight);

// ============================================
// ESFERA CENTRAL
// ============================================

const sphereGeometry = new THREE.SphereGeometry(1.2, 128, 128); // Tamanho ajustado
const sphereMaterial = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms: {
    uTime: { value: 0 },
    uColor: { value: currentConfig.sphereColor },
    uIntensity: { value: currentConfig.sphereIntensity },
    uCameraPosition: { value: camera.position },
    uPurple: { value: new THREE.Color(COLORS.purple) }, // #78627D
    uGold: { value: new THREE.Color(COLORS.gold) },      // #D0B345
    uEnergySpeed: { value: currentConfig.energySpeed },
    uPulseSpeed: { value: currentConfig.pulseSpeed }
  },
  transparent: true,
  side: THREE.FrontSide
});

const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
scene.add(sphere);

// ============================================
// ANÉIS ORBITAIS (TorusGeometry)
// ============================================

const rings = [];

// Cria anel orbital principal usando TorusGeometry para visual 3D completo
// TorusGeometry cria um anel com volume (doughnut shape)
const ringGeometry = new THREE.TorusGeometry(
  1.35,  // raio do toro (um pouco menor)
  0.015, // raio do tubo (mais fino - estilo Dribbble)
  32,    // segmentos radiais
  64     // segmentos tubulares
);

const ringMaterial = new THREE.MeshBasicMaterial({
  color: currentConfig.ringColor,
  transparent: true,
  opacity: currentConfig.ringOpacity,
  side: THREE.DoubleSide
});

const mainRing = new THREE.Mesh(ringGeometry, ringMaterial);
// Rotaciona o anel para ficar horizontal (perpendicular ao eixo Y)
mainRing.rotation.x = Math.PI / 2;
rings.push(mainRing);
scene.add(mainRing);

// Partículas removidas conforme solicitado

// ============================================
// ILUMINAÇÃO
// ============================================

const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
scene.add(ambientLight);

const pointLight = new THREE.PointLight(COLORS.primary, 1, 100);
pointLight.position.set(0, 0, 5);
scene.add(pointLight);

// ============================================
// ANIMAÇÃO
// ============================================

const clock = new THREE.Clock();

// Variável para controlar transições
let transitionProgress = 1.0;
const TRANSITION_DURATION = 2.0; // 2 segundos para transição

function animate() {
  requestAnimationFrame(animate);
  
  const elapsed = clock.getElapsedTime();
  const time = elapsed;
  const deltaTime = clock.getDelta();
  
  // Atualiza transição de estado
  if (targetState !== currentState) {
    transitionProgress += deltaTime / TRANSITION_DURATION;
    
    if (transitionProgress >= 1.0) {
      transitionProgress = 1.0;
      currentState = targetState;
      console.log(`Estado mudou para "${currentState}"`);
    }
    
    // Interpola suavemente entre estados
    const t = easeInOutCubic(transitionProgress);
    const sourceConfig = STATE_CONFIG[currentState];
    const targetConfig = STATE_CONFIG[targetState];
    
    // Interpola todas as propriedades
    currentConfig.sphereColor = lerpColor(sourceConfig.sphereColor, targetConfig.sphereColor, t);
    currentConfig.sphereIntensity = lerp(sourceConfig.sphereIntensity, targetConfig.sphereIntensity, t);
    currentConfig.ringColor = lerpColor(sourceConfig.ringColor, targetConfig.ringColor, t);
    currentConfig.ringOpacity = lerp(sourceConfig.ringOpacity, targetConfig.ringOpacity, t);
    currentConfig.ringSpeed = lerp(sourceConfig.ringSpeed, targetConfig.ringSpeed, t);
    currentConfig.sphereRotationSpeed.x = lerp(sourceConfig.sphereRotationSpeed.x, targetConfig.sphereRotationSpeed.x, t);
    currentConfig.sphereRotationSpeed.y = lerp(sourceConfig.sphereRotationSpeed.y, targetConfig.sphereRotationSpeed.y, t);
    currentConfig.energySpeed = lerp(sourceConfig.energySpeed, targetConfig.energySpeed, t);
    currentConfig.bloomStrength = lerp(sourceConfig.bloomStrength, targetConfig.bloomStrength, t);
    currentConfig.pulseSpeed = lerp(sourceConfig.pulseSpeed, targetConfig.pulseSpeed, t);
  } else {
    transitionProgress = 0.0; // Reset quando não há transição
  }
  
  // Atualiza uniformes
  sphere.material.uniforms.uTime.value = time;
  sphere.material.uniforms.uCameraPosition.value.copy(camera.position);
  sphere.material.uniforms.uColor.value.copy(currentConfig.sphereColor);
  sphere.material.uniforms.uIntensity.value = currentConfig.sphereIntensity;
  sphere.material.uniforms.uEnergySpeed.value = currentConfig.energySpeed;
  sphere.material.uniforms.uPulseSpeed.value = currentConfig.pulseSpeed;
  
  // Atualiza bloom baseado no estado
  bloomPass.strength = currentConfig.bloomStrength;
  
  // Rotação suave da esfera baseada no estado
  sphere.rotation.y += currentConfig.sphereRotationSpeed.y;
  sphere.rotation.x += currentConfig.sphereRotationSpeed.x;
  
  // Rotação do anel orbital baseada no estado
  if (rings.length > 0) {
    rings[0].rotation.z += currentConfig.ringSpeed;
    
    // Atualiza cor e opacidade do anel
    rings[0].material.color.copy(currentConfig.ringColor);
    rings[0].material.opacity = currentConfig.ringOpacity + Math.sin(time * currentConfig.pulseSpeed) * 0.1;
  }
  
  // Pulso da esfera baseado no estado
  const pulse = Math.sin(time * currentConfig.pulseSpeed) * 0.1 + 0.9;
  sphere.material.uniforms.uIntensity.value = currentConfig.sphereIntensity * (0.8 + pulse * 0.4);
  
  // Renderiza com post-processing
  try {
    composer.render();
  } catch (e) {
    // Fallback para renderer direto se composer falhar
    console.warn('Composer error, usando renderer direto:', e);
    renderer.render(scene, camera);
  }
}

// Inicia a animação
animate();

// Exporta setState para uso externo (ex: controle por IA)
window.setState = setState;

// Exemplo de uso (pode ser removido depois):
// setState("idle");    // Estado inicial - esfera azul escura, animação lenta
// setState("active");  // Estado ativo - esfera roxa, animação média
// setState("listening"); // Estado ouvindo - esfera dourada, animação rápida

// ============================================
// RESIZE
// ============================================

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);
});
