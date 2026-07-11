//! 确定性伪向量嵌入模块。
//!
//! 在不依赖 ONNX / Candle 等 ML 框架的前提下，将文本映射为高维浮点向量。
//! 同一文本始终产生同一向量（可重现），cosine 相似度搜索结构完整可用。
//!
//! 替换真实 Embedding 模型只需重写 `embed` 函数，其余代码无需修改。
//!
//! # 哈希
//! `fnv1a` 是项目内唯一的 FNV-1a 实现，供 `embed` 和 `pipeline` 模块共享，
//! 避免重复定义。

/// 向量维度（对齐 bge-large-zh-v1.5）
pub const DIM: usize = 768;

// ── LCG 随机数生成器（零外部依赖）───────────────────────────────────────

struct Lcg(u64);

impl Lcg {
    fn new(seed: u64) -> Self {
        // 避免 seed=0 导致 LCG 退化
        Self(seed.wrapping_add(1))
    }

    fn next_f32(&mut self) -> f32 {
        // Knuth 乘法同余，周期 2^64
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        // 取高 32 位，映射到 [0, 1)
        ((self.0 >> 33) as f32) / (u32::MAX as f32)
    }
}

// ── FNV-1a 哈希（零外部依赖）────────────────────────────────────────────

/// FNV-1a 64-bit 哈希。
///
/// 零外部依赖，`pub(crate)` 导出供 `pipeline` 模块复用，避免重复定义。
pub(crate) fn fnv1a(s: &str) -> u64 {
    let mut h: u64 = 14_695_981_039_346_656_037;
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(1_099_511_628_211);
    }
    h
}

// ── 公开 API ─────────────────────────────────────────────────────────────

/// 生成 `DIM` 维 L2 归一化伪向量。
///
/// 以文本的 FNV-1a 哈希作为 LCG 种子，保证同文本 → 同向量。
pub fn embed(text: &str) -> Vec<f32> {
    let mut lcg = Lcg::new(fnv1a(text));
    let mut v: Vec<f32> = (0..DIM).map(|_| lcg.next_f32() * 2.0 - 1.0).collect();
    // L2 归一化（使余弦相似度 = 点积）
    let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt().max(1e-8);
    v.iter_mut().for_each(|x| *x /= norm);
    v
}

/// 固定种子随机投影将高维向量降至 3D（Johnson–Lindenstrauss 风格）。
///
/// 投影矩阵由固定种子生成，每次运行结果一致，保证前端星空布局稳定。
pub fn project_3d(v: &[f32]) -> [f32; 3] {
    const PROJ_SEED: u64 = 0xDEAD_BEEF_CAFE_1234;
    let mut lcg = Lcg::new(PROJ_SEED);
    let scale = 1.0 / (DIM as f32).sqrt();
    let mut result = [0.0f32; 3];
    // 三个方向依次消费 LCG 序列，形成 DIM×3 投影矩阵
    for r in &mut result {
        let mut dot = 0.0f32;
        let len = DIM.min(v.len());
        for i in 0..len {
            let w = lcg.next_f32() * 2.0 - 1.0;
            dot += v[i] * w;
        }
        *r = dot * scale * 5.0; // 放大坐标范围以填充星空
    }
    result
}

/// 计算两个（已归一化）向量的余弦相似度（= 点积）。
#[inline]
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}
