//! API interface (OpenAPI/Swagger) domain models.
//!
//! An uploaded API document produces a set of endpoints. `rename_all =
//! "camelCase"` aligns JSON keys with the TypeScript payload interfaces.

use serde::{Deserialize, Serialize};

/// An uploaded API documentation file and its parse metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiDocument {
    pub id: String,
    pub name: String,
    pub source_file_name: String,
    /// Document format: `"openapi"` | `"swagger"`.
    pub format: String,
    /// API title parsed from the document `info.title`.
    #[serde(default)]
    pub title: String,
    /// API version parsed from the document `info.version`.
    #[serde(default)]
    pub version: String,
    /// Associated Model Provider id (for traceability / future AI assist).
    #[serde(default)]
    pub model_provider_id: String,
    #[serde(default)]
    pub endpoint_count: u32,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

/// A single API endpoint parsed from an [`ApiDocument`].
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiEndpoint {
    pub id: String,
    pub document_id: String,
    /// HTTP method upper-cased: GET / POST / PUT / …
    pub method: String,
    pub path: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub operation_id: String,
    /// Comma-separated tags for compact display.
    #[serde(default)]
    pub tags: String,
    /// Raw JSON of parameters/requestBody (may be empty).
    #[serde(default)]
    pub request_schema_json: String,
    /// Raw JSON of responses (may be empty).
    #[serde(default)]
    pub response_schema_json: String,
}

/// An [`ApiDocument`] bundled with its parsed endpoints (list/return shape).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiDocumentWithEndpoints {
    #[serde(flatten)]
    pub document: ApiDocument,
    pub endpoints: Vec<ApiEndpoint>,
}
