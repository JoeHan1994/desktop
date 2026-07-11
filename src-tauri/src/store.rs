//! 应用共享状态与核心数据结构。
//!
//! 所有类型定义已迁移到 crate::domain，此模块保留 pub use 以维持向后兼容。
//! 新代码请直接使用 crate::domain::*。

#[allow(unused_imports)]
pub use crate::domain::model_provider::ModelProvider;
#[allow(unused_imports)]
pub use crate::domain::pipeline::{AppState, AppStateInner, PipelineStats, VectorEntry, VectorPoint};
