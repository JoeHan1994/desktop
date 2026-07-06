// 液态玻璃 —— 片元着色器 (Fragment Shader)
// 职责：折射 (Refraction) + 毛玻璃模糊 (Blur/Frosted)
// 读取背后场景的离屏纹理，依据流体法线方向偏移采样，并混合粗糙度做散射模糊。

uniform sampler2D uSceneTexture; // 背后向量星空的离屏纹理
uniform float uRoughness;        // 毛玻璃粗糙度

varying vec2 vUv;
varying vec3 vNormal;

void main() {
  // 依据法线方向对背景纹理做折射偏移
  vec2 refractedUv = vUv + vNormal.xy * 0.05;

  // TODO: 基于 uRoughness 做多级 MIPMAP / 高斯模糊散射
  vec4 color = texture2D(uSceneTexture, refractedUv);

  gl_FragColor = color;
}
