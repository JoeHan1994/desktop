//! 向量嵌入模块：通过本地 Python sidecar (HTTP) 获取真实 Ollama embedding。
//!
//! `embed` 调用 sidecar 的 `POST /embed` 接口拿到真实向量（bge-m3，1024 维）。
//! sidecar 地址可用环境变量 `TERRAFORGE_SIDECAR_URL` 覆盖，默认 `http://127.0.0.1:8765`。
//!
//! 由于主流水线运行在 `spawn_blocking` 线程上，这里使用 `reqwest::blocking`
//! 保持 `embed` 为同步函数，避免 async 波及上层调用链。
//!
//! # 哈希
//! `fnv1a` 是项目内唯一的 FNV-1a 实现，供 `pipeline` 模块生成稳定 chunk id 复用。

use once_cell::sync::Lazy;
use serde::Deserialize;

use crate::error::{AppError, Result};

// ── sidecar 配置 ───────────────────────────────────────────────────────────

/// sidecar 基础地址（可用环境变量覆盖）。
fn sidecar_base_url() -> String {
    std::env::var("TERRAFORGE_SIDECAR_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:8765".to_string())
}

/// 复用的阻塞 HTTP 客户端。
static HTTP: Lazy<reqwest::blocking::Client> = Lazy::new(|| {
    reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .expect("构建 HTTP 客户端失败")
});

#[derive(Deserialize)]
struct EmbedResponse {
    vector: Vec<f32>,
}

// ── LCG 随机数生成器（仅供固定种子 3D 投影使用）──────────────────────────

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
/// 零外部依赖，`pub(crate)` 导出供 `pipeline` 模块生成稳定 chunk id 复用。
pub(crate) fn fnv1a(s: &str) -> u64 {
    let mut h: u64 = 14_695_981_039_346_656_037;
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(1_099_511_628_211);
    }
    h
}

// ── 公开 API ─────────────────────────────────────────────────────────────

/// 调用 sidecar 获取文本的真实向量（bge-m3，L2 归一化，1024 维）。
///
/// 同步阻塞请求，适合在 `spawn_blocking` 流水线线程中调用。
pub fn embed(text: &str) -> Result<Vec<f32>> {
    let url = format!("{}/embed", sidecar_base_url());
    let resp = HTTP
        .post(&url)
        .json(&serde_json::json!({ "text": text }))
        .send()?;
    if !resp.status().is_success() {
        return Err(AppError::Other(format!(
            "Sidecar /embed 返回状态 {}",
            resp.status()
        )));
    }
    let parsed: EmbedResponse = resp.json()?;
    Ok(parsed.vector)
}

/// 固定种子随机投影将高维向量降至 3D（Johnson–Lindenstrauss 风格）。
///
/// 投影矩阵由固定种子生成，每次运行结果一致，保证前端星空布局稳定。
/// 维度以向量实际长度为准（bge-m3 为 1024）。
pub fn project_3d(v: &[f32]) -> [f32; 3] {
    const PROJ_SEED: u64 = 0xDEAD_BEEF_CAFE_1234;
    let dim = v.len().max(1);
    let mut lcg = Lcg::new(PROJ_SEED);
    let scale = 1.0 / (dim as f32).sqrt();
    let mut result = [0.0f32; 3];
    // 三个方向依次消费 LCG 序列，形成 dim×3 投影矩阵
    for r in &mut result {
        let mut dot = 0.0f32;
        for &x in v {
            let w = lcg.next_f32() * 2.0 - 1.0;
            dot += x * w;
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
