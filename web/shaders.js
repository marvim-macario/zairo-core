export const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldPosition;
  
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fragmentShader = `
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uPurple;
  uniform vec3 uGold;
  uniform float uIntensity;
  uniform vec3 uCameraPosition;
  uniform float uEnergySpeed;
  uniform float uPulseSpeed;
  
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldPosition;
  
  // Perlin Noise 3D - implementação orgânica
  vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
  }
  
  vec4 mod289(vec4 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
  }
  
  vec4 permute(vec4 x) {
    return mod289(((x*34.0)+1.0)*x);
  }
  
  vec4 taylorInvSqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
  }
  
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
  
  // Função de noise simples (fallback)
  float noise(vec3 p) {
    return snoise(p);
  }
  
  // FBM (Fractal Brownian Motion) para noise mais orgânico
  float fbm(vec3 p, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    
    for (int i = 0; i < 4; i++) {
      if (i >= octaves) break;
      value += amplitude * snoise(p * frequency);
      frequency *= 2.0;
      amplitude *= 0.5;
    }
    
    return value;
  }
  
  void main() {
    // Calcula direção da câmera
    vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
    
    // Fresnel effect para bordas brilhantes - mais suave
    float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 3.0);
    
    // ENERGIA VIVA - Noise orgânico pulsante (controlado por estado)
    // Múltiplas camadas de noise para efeito de energia fluindo
    float energyFlow1 = fbm(vPosition * 2.5 + vec3(uTime * uEnergySpeed * 0.3, uTime * uEnergySpeed * 0.2, uTime * uEnergySpeed * 0.25), 4);
    float energyFlow2 = fbm(vPosition * 4.0 + vec3(uTime * uEnergySpeed * 0.4, uTime * uEnergySpeed * 0.3, uTime * uEnergySpeed * 0.35), 3);
    float energyFlow3 = fbm(vPosition * 6.0 + vec3(uTime * uEnergySpeed * 0.5, uTime * uEnergySpeed * 0.4, uTime * uEnergySpeed * 0.45), 2);
    
    // Combina as camadas para criar padrões complexos de energia
    float energyPattern = (energyFlow1 * 0.5 + energyFlow2 * 0.3 + energyFlow3 * 0.2);
    energyPattern = energyPattern * 0.5 + 0.5; // Normaliza
    
    // Pulso de energia viva - respiração orgânica (controlado por estado)
    float breathing = sin(uTime * uPulseSpeed * 0.4) * 0.5 + 0.5; // 0 a 1
    float energyPulse = sin(uTime * uPulseSpeed + energyPattern * 10.0) * 0.3 + 0.7;
    float livingEnergy = energyPattern * energyPulse * breathing;
    
    // Base color: azul escuro (#252F4B) com variação de energia
    vec3 baseColor = uColor * (0.5 + livingEnergy * 0.3);
    
    // Energia roxa fluindo - padrões orgânicos (controlado por estado)
    float purpleEnergy = fbm(vPosition * 2.0 + vec3(uTime * uEnergySpeed * 0.25, uTime * uEnergySpeed * 0.15, uTime * uEnergySpeed * 0.2), 3);
    purpleEnergy = purpleEnergy * 0.5 + 0.5;
    purpleEnergy *= (0.6 + sin(uTime * uPulseSpeed * 0.6 + purpleEnergy * 8.0) * 0.4);
    baseColor = mix(baseColor, uPurple * 0.9, purpleEnergy * 0.7);
    
    // Ondas de energia - efeito de corrente (controlado por estado)
    float energyWaves = sin(dot(vPosition, vec3(1.0, 1.0, 1.0)) * 3.0 + uTime * uEnergySpeed * 2.0) * 0.5 + 0.5;
    energyWaves *= fbm(vPosition * 1.5 + uTime * 0.1, 2);
    baseColor += vec3(0.1, 0.15, 0.2) * energyWaves * livingEnergy;
    
    // DISPERSÃO CROMÁTICA (Chromatic Aberration) - estilo Dribbble
    // Efeito de refração com cores separadas
    float chromaticOffset = fresnel * 0.02;
    
    // ENERGIA VIVA nas bordas - glow pulsante (controlado por estado)
    float energyGlow = fresnel * (1.0 + sin(uTime * uPulseSpeed + fresnel * 5.0) * 0.3);
    
    // Ciano nas bordas (dispersão azul) - energia pulsante
    vec3 cyanRefraction = vec3(0.0, 0.9, 1.0) * energyGlow * uIntensity * 3.5;
    cyanRefraction *= (0.8 + livingEnergy * 0.4); // Varia com energia viva
    
    // Dourado (#D0B345) - faíscas de energia
    float goldEnergy = fbm(vPosition * 2.0 + vec3(uTime * 0.3, uTime * 0.25, uTime * 0.28), 3);
    goldEnergy = goldEnergy * 0.5 + 0.5;
    float goldFresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 2.0);
    float goldPulse = sin(uTime * 4.0 + goldEnergy * 12.0) * 0.5 + 0.5;
    vec3 goldRefraction = uGold * goldFresnel * uIntensity * 1.8 * goldPulse * (0.6 + goldEnergy * 0.4);
    
    // Roxo (#78627D) - ondas de energia
    float purpleWave = sin(dot(vPosition, vec3(0.5, 1.0, 0.7)) * 4.0 + uTime * 2.5) * 0.5 + 0.5;
    vec3 purpleRefraction = uPurple * fresnel * uIntensity * 1.5 * (0.7 + purpleWave * 0.5);
    
    // Bege claro (#CAC8C4) para highlights sutis
    vec3 lightHighlight = vec3(0.792, 0.784, 0.769) * fresnel * 0.3;
    
    // Combina todas as refrações
    baseColor += cyanRefraction + goldRefraction + purpleRefraction + lightHighlight;
    
    // Aumenta brilho nas bordas para bloom intenso - energia viva
    float energyBrightness = 2.5 + livingEnergy * 0.8;
    baseColor = mix(baseColor, baseColor * energyBrightness, fresnel * 0.85);
    
    // Alpha pulsante - respiração de energia (controlado por estado)
    float alphaPulse = 0.75 + fresnel * 0.2;
    alphaPulse += sin(uTime * uPulseSpeed * 0.5 + energyPattern * 8.0) * 0.05; // Pulso sutil
    float alpha = alphaPulse;
    
    gl_FragColor = vec4(baseColor, alpha);
  }
`;
