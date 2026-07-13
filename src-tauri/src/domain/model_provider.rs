//! Model Provider domain model.

use serde::{Deserialize, Serialize};

/// A user-configured LLM provider (Ollama, OpenAI-compatible, etc.).
///
/// `rename_all = "camelCase"` aligns JSON keys with the TypeScript `ModelProvider` interface.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProvider {
    pub id: String,
    pub name: String,
    /// Provider kind: `"ollama"` | `"openai"` | ...
    pub provider: String,
    pub api_base_url: String,
    pub model: String,
    pub api_key: String,
}
