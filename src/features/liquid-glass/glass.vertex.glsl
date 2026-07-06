// 液态玻璃 —— 顶点着色器 (Vertex Shader)
// 职责：动态流体 (Fluid Simulation)
// 以 time 为变量，通过 3D 噪声实时干扰网格顶点坐标，制造丝滑的表面波纹。

uniform float uTime;
uniform float uAmplitude; // 波动振幅

varying vec2 vUv;
varying vec3 vNormal;

// --- 3D Simplex Noise (placeholder) ---
// TODO: 引入完整的 Simplex/Perlin 噪声实现
float noise(vec3 p) {
  return sin(p.x) * cos(p.y) * sin(p.z);
}

void main() {
  vUv = uv;
  vNormal = normal;

  vec3 pos = position;
  float wave = noise(vec3(pos.xy * 2.0, uTime * 0.5));
  pos.z += wave * uAmplitude;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
