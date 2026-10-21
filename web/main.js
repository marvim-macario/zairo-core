import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

import { vertexShader, fragmentShader } from "./shaders.js";

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
let lastTargetState = "idle"; // Rastreia mudanças no targetState para resetar transição

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
    },
    speaking: {
      sphereColor: new THREE.Color(COLORS.primary),    // #00d9ff - ciano brilhante
      sphereIntensity: 1.5,                            // Intensidade máxima
      ringColor: new THREE.Color(COLORS.primary),       // Ciano brilhante
      ringOpacity: 1.0,                                // Anel totalmente visível
      ringSpeed: 0.06,                                 // Rotação muito rápida
      sphereRotationSpeed: { x: 0.008, y: 0.010 },    // Rotação muito rápida
      energySpeed: 0.8,                                // Energia muito rápida
      bloomStrength: 4.5,                              // Bloom extremo
      pulseSpeed: 4.0                                  // Pulso muito rápido
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
  if (STATE_CONFIG[newState]) {
    if (newState !== targetState) {
      const oldTarget = targetState;
      targetState = newState;
      // Força reset da transição quando muda o targetState
      lastTargetState = oldTarget; // Define para forçar detecção de mudança
      console.log(`🔄 Estado mudando de "${currentState}" para "${newState}" (target: ${targetState}, lastTarget: ${lastTargetState})`);
    }
  } else {
    console.warn(`⚠️ Estado inválido: "${newState}". Estados válidos: idle, active, listening, speaking`);
  }
}

// ============================================
// CONTROLE FINO DE INTENSIDADE (HUD Sci-Fi)
// ============================================

let globalIntensity = 1.0; // Multiplicador global de intensidade (0.0 a 2.0)
let intensityTarget = 1.0;
let intensityTransition = 1.0;

// Função para controlar intensidade global (0.0 a 2.0)
function setIntensity(value) {
  if (value >= 0.0 && value <= 2.0) {
    intensityTarget = value;
    console.log(`Intensidade ajustada para: ${value.toFixed(2)}`);
  } else {
    console.warn('Intensidade deve estar entre 0.0 e 2.0');
  }
}

// Função para ajustar intensidade do bloom especificamente
function setBloomIntensity(value) {
  if (value >= 0.0 && value <= 5.0) {
    bloomPass.strength = value;
    console.log(`Bloom intensity ajustado para: ${value.toFixed(2)}`);
  }
}

// Função para ajustar intensidade do glow da esfera
function setSphereGlowIntensity(value) {
  if (value >= 0.0 && value <= 3.0) {
    currentConfig.sphereIntensity = value;
    sphere.material.uniforms.uIntensity.value = value;
    console.log(`Sphere glow intensity ajustado para: ${value.toFixed(2)}`);
  }
}

// Função para ajustar threshold do bloom (controle fino)
function setBloomThreshold(value) {
  if (value >= 0.0 && value <= 1.0) {
    bloomPass.threshold = value;
    console.log(`Bloom threshold ajustado para: ${value.toFixed(2)}`);
  }
}

// Função para ajustar radius do bloom (controle fino)
function setBloomRadius(value) {
  if (value >= 0.0 && value <= 2.0) {
    bloomPass.radius = value;
    console.log(`Bloom radius ajustado para: ${value.toFixed(2)}`);
  }
}

// Função para obter configuração atual de intensidade
function getIntensityConfig() {
  return {
    global: globalIntensity,
    bloom: bloomPass.strength,
    bloomThreshold: bloomPass.threshold,
    bloomRadius: bloomPass.radius,
    sphereGlow: currentConfig.sphereIntensity,
    state: currentState
  };
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
// ANÉIS ORBITAIS (Removido conforme solicitado)
// ============================================

const rings = [];
// Anel orbital removido

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
// Ouvir e falar precisam reagir na hora, senão a esfera fica atrás da voz
const FAST_TRANSITION_DURATION = 0.35;

// ============================================
// SINCRONIA COM A VOZ
// ============================================
// Nível da voz do Zairo (0 a 1), atualizado a cada quadro por quem toca o áudio.
let voiceLevelTarget = 0;
let voiceLevel = 0;

function setVoiceLevel(value) {
  voiceLevelTarget = Math.min(1, Math.max(0, value));
}

function animate() {
  requestAnimationFrame(animate);
  
  // getDelta() antes de getElapsedTime(): este também consome o delta e deixaria o
  // segundo valor perto de zero, travando as transições de estado
  const deltaTime = clock.getDelta();
  const time = clock.getElapsedTime();
  
  // Detecta quando uma nova transição começa
  // IMPORTANTE: Verifica se targetState mudou desde a última frame
  if (targetState !== lastTargetState) {
    transitionProgress = 0.0; // Reset quando uma nova transição começa
    console.log(`🔄 Transição iniciada: ${currentState} → ${targetState} (lastTarget era: ${lastTargetState})`);
    lastTargetState = targetState; // Atualiza DEPOIS de resetar
  }
  
  // Atualiza transição de estado
  if (targetState !== currentState) {
    const duration = targetState === "speaking" || targetState === "listening"
      ? FAST_TRANSITION_DURATION
      : TRANSITION_DURATION;
    transitionProgress += deltaTime / duration;
    
    if (transitionProgress >= 1.0) {
      transitionProgress = 1.0;
      currentState = targetState;
      console.log(`✅ Estado mudou para "${currentState}"`);
    }
    
    // Interpola suavemente entre estados
    const t = easeInOutCubic(Math.min(transitionProgress, 1.0));
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
    // Quando não há transição, garante que os valores estão corretos
    const stateConfig = STATE_CONFIG[currentState];
    if (currentConfig.sphereIntensity !== stateConfig.sphereIntensity || 
        currentConfig.bloomStrength !== stateConfig.bloomStrength) {
      // Sincroniza valores se necessário
      currentConfig.sphereColor.copy(stateConfig.sphereColor);
      currentConfig.sphereIntensity = stateConfig.sphereIntensity;
      currentConfig.ringColor.copy(stateConfig.ringColor);
      currentConfig.ringOpacity = stateConfig.ringOpacity;
      currentConfig.ringSpeed = stateConfig.ringSpeed;
      currentConfig.sphereRotationSpeed = { ...stateConfig.sphereRotationSpeed };
      currentConfig.energySpeed = stateConfig.energySpeed;
      currentConfig.bloomStrength = stateConfig.bloomStrength;
      currentConfig.pulseSpeed = stateConfig.pulseSpeed;
    }
  }
  
  // Atualiza uniformes
  sphere.material.uniforms.uTime.value = time;
  sphere.material.uniforms.uCameraPosition.value.copy(camera.position);
  sphere.material.uniforms.uColor.value.copy(currentConfig.sphereColor);
  sphere.material.uniforms.uIntensity.value = currentConfig.sphereIntensity;
  sphere.material.uniforms.uEnergySpeed.value = currentConfig.energySpeed;
  sphere.material.uniforms.uPulseSpeed.value = currentConfig.pulseSpeed;
  
  // Atualiza transição de intensidade global
  if (intensityTarget !== globalIntensity) {
    const intensityDelta = (intensityTarget - globalIntensity) * deltaTime * 3.0; // Transição suave
    globalIntensity += intensityDelta;
    if (Math.abs(intensityTarget - globalIntensity) < 0.01) {
      globalIntensity = intensityTarget;
    }
  }
  
  // Ataque rápido e soltura mais lenta, como um medidor de VU
  const voiceSmoothing = voiceLevelTarget > voiceLevel ? 0.5 : 0.15;
  voiceLevel += (voiceLevelTarget - voiceLevel) * voiceSmoothing;

  // Atualiza bloom baseado no estado, na intensidade global e na voz
  bloomPass.strength = currentConfig.bloomStrength * globalIntensity * (1 + voiceLevel * 0.6);
  
  // Logs de debug removidos para evitar spam no console
  
  // Rotação suave da esfera baseada no estado
  sphere.rotation.y += currentConfig.sphereRotationSpeed.y;
  sphere.rotation.x += currentConfig.sphereRotationSpeed.x;
  
  // Anel orbital removido
  
  // Pulso da esfera baseado no estado e intensidade global
  // Enquanto há voz, o volume dela substitui boa parte do pulso automático
  const pulse = Math.sin(time * currentConfig.pulseSpeed) * 0.1 + 0.9;
  const autoPulse = 0.8 + pulse * 0.4;
  const voicePulse = 0.75 + voiceLevel * 0.9;
  const pulseMix = Math.min(1, voiceLevel * 3);
  sphere.material.uniforms.uIntensity.value =
    currentConfig.sphereIntensity * globalIntensity * lerp(autoPulse, voicePulse, pulseMix);
  sphere.scale.setScalar(1 + voiceLevel * 0.08);
  
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

// Exporta funções para uso externo (ex: controle por IA)
window.setState = setState;
window.setVoiceLevel = setVoiceLevel;
window.setIntensity = setIntensity;
window.setBloomIntensity = setBloomIntensity;
window.setSphereGlowIntensity = setSphereGlowIntensity;
window.setBloomThreshold = setBloomThreshold;
window.setBloomRadius = setBloomRadius;
window.getIntensityConfig = getIntensityConfig;

// ============================================
// RECONHECIMENTO FACIAL E SAUDAÇÃO
// ============================================

let faceDetected = false;
let greetingSaid = false;
let videoElement = null;
let faceDetection = null;
let mediaPipeCamera = null;
let mediaPipeFailed = false; // Flag para indicar se MediaPipe falhou

// Nome do usuário (pode ser configurado)
const USER_NAME = "Marcos";

// Flag para desabilitar MediaPipe se houver problemas críticos
let mediaPipeEnabled = true;

// Flag para controlar logs de debug do MediaPipe (desabilitado por padrão)
let mediaPipeDebugLogs = false;

// Cache para evitar logs repetidos do locateFile
const mediaPipeFileCache = new Set();

// ============================================
// FILTRO DE LOGS DO MEDIAPIPE
// ============================================
// Intercepta e filtra logs do MediaPipe para evitar spam no console

// Guarda as funções originais do console
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

// Lista de padrões de mensagens do MediaPipe que devem ser filtradas
const mediaPipeLogPatterns = [
  /MediaPipe/i,
  /face_detection/i,
  /tflite/i,
  /Calculator::Open/i,
  /CalculatorGraph::Run/i,
  /facedetectionshortrangegpu/i,
  /third_party\/mediapipe/i,
  /Failed to read file/i,
  /Aborted/i,
  /Check failed/i,
  /Graph has errors/i,
  /gl_context/i,
  /WebGL/i,
  /solutions_wasm/i,
  /status_util/i,
  /Source Location Trace/i,
  /Check failure stack trace/i,
  /E0000/i,
  /W0000/i,
  /F0000/i,
  /I0000/i,
  /calculator_graph/i,
  /calculator/i,
  /inferencecalculator/i,
  /\.cc:\d+/i,  // Arquivos .cc com linha (ex: status_util.cc:139)
  /\.js:\d+/i,  // Arquivos .js com linha do MediaPipe
  /^\)\s*$/,    // Linhas apenas com ")"
  /^\*\s+\*\s+\*/,  // Linhas com "***"
  /^\s*$/,      // Linhas vazias ou só espaços
  /third_party/i
];

// Função para verificar se uma mensagem é do MediaPipe
function isMediaPipeLog(message) {
  if (typeof message !== 'string') {
    message = String(message);
  }
  return mediaPipeLogPatterns.some(pattern => pattern.test(message));
}

// Sobrescreve console.error para filtrar logs do MediaPipe
console.error = function(...args) {
  const message = args.map(arg => String(arg)).join(' ');
  if (!isMediaPipeLog(message)) {
    originalConsoleError.apply(console, args);
  }
  // MediaPipe logs são silenciosamente ignorados
};

// Sobrescreve console.warn para filtrar logs do MediaPipe
console.warn = function(...args) {
  const message = args.map(arg => String(arg)).join(' ');
  if (!isMediaPipeLog(message)) {
    originalConsoleWarn.apply(console, args);
  }
  // MediaPipe logs são silenciosamente ignorados
};

// Filtra console.log apenas para mensagens do MediaPipe (mantém outras)
console.log = function(...args) {
  const message = args.map(arg => String(arg)).join(' ');
  if (!isMediaPipeLog(message)) {
    originalConsoleLog.apply(console, args);
  }
  // MediaPipe logs são silenciosamente ignorados
};

// Tratamento de erros globais (APÓS definir os filtros)
window.addEventListener('error', (e) => {
  const errorMsg = String(e.error || e.message || '');
  if (!isMediaPipeLog(errorMsg)) {
    originalConsoleError('Erro global:', e.error);
  }
});

window.addEventListener('unhandledrejection', (e) => {
  const reasonMsg = String(e.reason || '');
  if (!isMediaPipeLog(reasonMsg)) {
    originalConsoleError('Promise rejeitada:', e.reason);
  }
});

// Função para inicializar a câmera e detecção facial
async function initFaceDetection() {
  // Se MediaPipe foi desabilitado ou falhou, não tenta inicializar
  if (!mediaPipeEnabled || mediaPipeFailed) {
    console.log('ℹ️ MediaPipe não disponível. Use simulateFaceDetection() para testar.');
    return;
  }

  try {
    // Verifica se MediaPipe está disponível
    if (typeof FaceDetection === 'undefined' || typeof Camera === 'undefined') {
      console.warn('⏳ MediaPipe não carregado. Aguardando...');
      // Aguarda um pouco e tenta novamente (até 5 tentativas)
      let attempts = 0;
      const maxAttempts = 5;
      const checkInterval = setInterval(() => {
        attempts++;
        if (typeof FaceDetection !== 'undefined' && typeof Camera !== 'undefined') {
          clearInterval(checkInterval);
          console.log('✅ MediaPipe carregado! Inicializando...');
          initFaceDetection();
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          console.warn('⚠️ MediaPipe não disponível após várias tentativas.');
          console.log('💡 Use simulateFaceDetection() para testar sem MediaPipe');
          mediaPipeEnabled = false;
        }
      }, 1000);
      return;
    }

    // Cria elemento de vídeo oculto
    videoElement = document.createElement('video');
    videoElement.style.display = 'none';
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.muted = true; // Necessário para autoplay
    document.body.appendChild(videoElement);

    // Inicializa MediaPipe Face Detection
    // IMPORTANTE: O MediaPipe via CDN pode ter problemas ao carregar modelos .tflite
    // devido a limitações do WebAssembly. Se falhar, use simulateFaceDetection()
    faceDetection = new FaceDetection({
      locateFile: (file) => {
        // Base URL do pacote MediaPipe Face Detection no CDN
        const baseUrl = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_detection';
        
        // Extrai o nome do arquivo (último elemento do caminho)
        const fileName = file.split('/').pop();
        
        // Log apenas na primeira vez que cada arquivo é buscado (se debug estiver ativo)
        if (mediaPipeDebugLogs && !mediaPipeFileCache.has(fileName)) {
          mediaPipeFileCache.add(fileName);
          console.log(`🔍 MediaPipe busca: "${fileName}"`);
        }
        
        // Mapeia arquivos do modelo .tflite
        if (fileName.includes('face_detection_short_range.tflite')) {
          return `${baseUrl}/face_detection_short_range.tflite`;
        }
        
        if (fileName.includes('face_detection_full_range.tflite')) {
          return `${baseUrl}/face_detection_full_range.tflite`;
        }
        
        // Mapeia arquivos WASM
        if (fileName.includes('.wasm') || fileName.includes('_wasm') || fileName.includes('wasm_bin')) {
          return `${baseUrl}/${fileName}`;
        }
        
        // Para arquivos .data (binários) ou .binarypb
        if (fileName.endsWith('.data') || fileName.endsWith('.binarypb')) {
          return `${baseUrl}/${fileName}`;
        }
        
        // Para qualquer outro arquivo, tenta o nome direto
        return `${baseUrl}/${fileName}`;
      }
    });

    // Adiciona handler de erro para capturar problemas de carregamento
    // Nota: MediaPipe pode não ter onError em todas as versões
    // Vamos usar try-catch no send() ao invés disso

    faceDetection.setOptions({
      modelSelection: 0, // 0 = short-range, 1 = full-range
      minDetectionConfidence: 0.5
    });

    // Callback quando detecta rosto
    faceDetection.onResults((results) => {
      try {
        if (results && results.detections && results.detections.length > 0) {
          // Rosto detectado
          const detection = results.detections[0];
          const confidence = detection.score;
          
          if (!faceDetected) {
            faceDetected = true;
            // Usa console original para mensagens importantes
            originalConsoleLog(`✅ Rosto detectado! (confiança: ${(confidence * 100).toFixed(1)}%)`);
            handleFaceDetected();
          }
          // Logs periódicos removidos para evitar spam no console
        } else {
          // Rosto não detectado
          if (faceDetected) {
            faceDetected = false;
            // Usa console original para mensagens importantes
            originalConsoleLog('❌ Rosto não detectado. Aguardando...');
            greetingSaid = false; // Permite nova saudação quando rosto retornar
            setState("idle");
          }
        }
      } catch (resultsError) {
        // Se houver erro crítico, desabilita MediaPipe silenciosamente
        if (resultsError.message && resultsError.message.includes('Aborted')) {
          // Usa console original apenas uma vez
          if (mediaPipeEnabled) {
            originalConsoleWarn('⚠️ MediaPipe desabilitado devido a erro. Use simulateFaceDetection() para testar.');
          }
          mediaPipeEnabled = false;
          if (mediaPipeCamera) {
            try {
              mediaPipeCamera.stop();
            } catch (e) {}
          }
        }
      }
    });

    // Inicializa câmera do MediaPipe com tratamento de erro melhorado
    try {
      mediaPipeCamera = new Camera(videoElement, {
        onFrame: async () => {
          try {
            if (faceDetection && videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
              await faceDetection.send({ image: videoElement });
            }
          } catch (frameError) {
            // Ignora erros silenciosamente durante o processamento de frames
            // para evitar spam no console - apenas loga se for erro crítico
            if (frameError.message && frameError.message.includes('Aborted')) {
              // Erro crítico - desabilita MediaPipe silenciosamente
              if (mediaPipeEnabled) {
                mediaPipeEnabled = false;
                console.warn('⚠️ MediaPipe desabilitado devido a erro crítico. Use simulateFaceDetection() para testar.');
              }
            }
            // Todos os outros erros são ignorados silenciosamente
          }
        },
        width: 640,
        height: 480
      });

      // Adiciona tratamento de erro para o start()
      mediaPipeCamera.start().catch((startError) => {
        // Usa console original apenas para erros importantes
        originalConsoleError('❌ Erro ao iniciar câmera:', startError.name);
        if (startError.name === 'NotAllowedError') {
          originalConsoleLog('💡 Permissão de câmera negada.');
        } else if (startError.name === 'NotReadableError') {
          originalConsoleLog('💡 Câmera em uso ou não disponível.');
        }
        originalConsoleLog('💡 Use simulateFaceDetection() para testar sem câmera');
      });
      
      // Detecta erros do MediaPipe após alguns segundos (silenciosamente)
      setTimeout(() => {
        if (!faceDetected && !mediaPipeFailed && mediaPipeEnabled) {
          // Apenas um aviso silencioso - não spam (usa console original)
          originalConsoleWarn('⚠️ MediaPipe pode não estar funcionando. Use simulateFaceDetection() para testar.');
          mediaPipeFailed = true; // Marca como falhou para evitar mais logs
        }
      }, 5000);
      
      // Log inicial apenas uma vez (usa console original)
      if (!mediaPipeFailed) {
        originalConsoleLog('✅ Câmera inicializada.');
      }
      
    } catch (cameraError) {
      // Usa console original para erros importantes
      originalConsoleError('❌ Erro ao configurar câmera.');
      originalConsoleLog('💡 Use simulateFaceDetection() para testar sem câmera');
    }

  } catch (error) {
    // Usa console original para erros importantes (mas não mostra detalhes do erro se for do MediaPipe)
    if (!isMediaPipeLog(String(error))) {
      originalConsoleError('❌ Erro ao inicializar detecção facial:', error);
    }
    originalConsoleLog('💡 Use simulateFaceDetection() para testar sem MediaPipe');
    // Continua funcionando mesmo sem câmera
  }
}

// Função chamada quando detecta rosto pela primeira vez
function handleFaceDetected() {
  if (!greetingSaid) {
    console.log('🎯 Preparando saudação...');
    setState("active"); // Muda para ativo enquanto prepara
    
    // Pequeno delay antes da saudação para transição suave
    setTimeout(() => {
      console.log('🔊 Executando saudação...');
      // O estado "speaking" será ativado automaticamente no onstart da fala
      sayGreeting();
    }, 500);
  } else {
    // Rosto já foi saudado, apenas muda para estado ativo
    console.log('👋 Rosto já foi saudado. Estado ativo.');
    setState("active");
  }
}

// Função para saudação por voz
function sayGreeting() {
  // Ativa feedback visual imediatamente (antes de tentar falar)
  console.log('🔊 Ativando feedback visual durante fala...');
  setState("speaking");
  
  // Flag para garantir que o feedback visual seja mantido
  let feedbackVisualAtivo = true;
  
  if ('speechSynthesis' in window) {
    // Cancela qualquer fala anterior
    speechSynthesis.cancel();
    
    // Aguarda um pouco para garantir que a síntese está pronta
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(`Oi ${USER_NAME}, estou online.`);
      utterance.lang = 'pt-BR';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      
      utterance.onstart = () => {
        console.log('🔊 Saudação iniciada (falando...)');
        // Estado "speaking" já está ativo, mas garante que está
        setState("speaking");
      };
      
      utterance.onend = () => {
        console.log('✅ Saudação concluída');
        greetingSaid = true;
        // Volta para estado "active" após a fala (com pequeno delay para transição suave)
        setTimeout(() => {
          if (faceDetected) {
            setState("active");
          } else {
            setState("idle");
          }
        }, 300);
      };
      
      utterance.onerror = (error) => {
        console.error('❌ Erro na síntese de voz:', error.error);
        console.log('💡 A saudação pode não funcionar se o navegador bloquear síntese de voz');
        console.log('💡 Mas o feedback visual foi mostrado!');
        greetingSaid = true;
        // Mantém o feedback visual por um tempo mesmo com erro, depois volta
        // Tempo suficiente para a transição visual ser visível (3 segundos)
        setTimeout(() => {
          if (faceDetected) {
            setState("active");
          } else {
            setState("idle");
          }
        }, 3000); // Mantém feedback visual por 3 segundos mesmo com erro
      };
      
      try {
        speechSynthesis.speak(utterance);
        console.log(`💬 Saudação: "Oi ${USER_NAME}, estou online."`);
      } catch (speakError) {
        console.error('❌ Erro ao executar síntese de voz:', speakError);
        greetingSaid = true;
        // Mantém feedback visual por um tempo mesmo com erro (3 segundos)
        setTimeout(() => {
          if (faceDetected) {
            setState("active");
          } else {
            setState("idle");
          }
        }, 3000);
      }
    }, 100);
  } else {
    console.warn('⚠️ Web Speech API não suportada neste navegador');
    console.log('💡 O sistema continua funcionando, mas sem síntese de voz');
    console.log('💡 Feedback visual ativado mesmo sem síntese!');
    greetingSaid = true;
    // Mantém feedback visual por um tempo mesmo sem síntese (3 segundos)
    setTimeout(() => {
      if (faceDetected) {
        setState("active");
      } else {
        setState("idle");
      }
    }, 3000);
  }
}

// Função para simular detecção de rosto (útil para testes)
function simulateFaceDetection() {
  console.log('🧪 Simulando detecção de rosto...');
  if (!faceDetected) {
    faceDetected = true;
    handleFaceDetected();
  } else {
    console.log('✅ Rosto já detectado');
  }
}

// Função para resetar detecção (útil para testes)
function resetFaceDetection() {
  console.log('🔄 Resetando detecção facial...');
  faceDetected = false;
  greetingSaid = false;
  setState("idle");
}

// Exporta funções de teste
window.simulateFaceDetection = simulateFaceDetection;
window.resetFaceDetection = resetFaceDetection;

// Inicializa detecção facial quando a página carregar
// Aguarda o carregamento completo da página
window.addEventListener('load', () => {
  setTimeout(() => {
    initFaceDetection();
  }, 500);
  
  // Mostra instruções de teste no console
  setTimeout(() => {
    console.log('');
    console.log('═══════════════════════════════════════');
    console.log('🎮 FUNÇÕES DE TESTE DISPONÍVEIS:');
    console.log('═══════════════════════════════════════');
    console.log('setState("idle")      - Estado inicial');
    console.log('setState("active")    - Estado ativo');
    console.log('setState("listening") - Estado ouvindo');
    console.log('setState("speaking")   - Estado falando (feedback visual)');
    console.log('simulateFaceDetection() - Simula detecção de rosto');
    console.log('resetFaceDetection()    - Reseta detecção');
    console.log('═══════════════════════════════════════');
  }, 2000);
});

// Exemplo de uso (pode ser removido depois):
// setState("idle");    // Estado inicial - esfera azul escura, animação lenta
// setState("active");  // Estado ativo - esfera roxa, animação média
// setState("listening"); // Estado ouvindo - esfera dourada, animação rápida
// setIntensity(1.5);   // Aumenta intensidade global para 150%
// setBloomIntensity(3.0); // Ajusta bloom especificamente
// setSphereGlowIntensity(1.2); // Ajusta glow da esfera
// setBloomThreshold(0.2); // Ajusta threshold do bloom (mais sensível)
// setBloomRadius(1.5); // Ajusta raio do bloom (mais difuso)

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
