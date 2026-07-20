//! API interface commands: upload + parse OpenAPI/Swagger JSON, persist to MySQL.
//!
//! 命令层是薄包装层；解析逻辑在 `parse_openapi_document`，数据访问在私有
//! repository 函数中。解析使用现有 `serde_json`，无需额外依赖。

use mysql::prelude::Queryable;
use mysql::{Pool, Row};
use serde_json::Value;

use crate::domain::api_interface::{ApiDocument, ApiDocumentWithEndpoints, ApiEndpoint};
use crate::error::{AppError, Result as AppResult};
use crate::mysql_profiles::{ensure_api_interface_schema, MySqlProfileState};

const HTTP_METHODS: [&str; 8] = [
    "get", "post", "put", "patch", "delete", "options", "head", "trace",
];

// ── Request DTO ───────────────────────────────────────────────────────────

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseApiDocumentRequest {
    pub name: String,
    pub source_file_name: String,
    /// Raw file content (JSON text).
    pub content: String,
    #[serde(default)]
    pub model_provider_id: String,
}

// ── Commands ──────────────────────────────────────────────────────────────

/// 获取所有已保存的 API 文档及其接口列表。
#[tauri::command]
pub fn list_api_documents_with_endpoints(
    mysql: tauri::State<'_, MySqlProfileState>,
) -> Result<Vec<ApiDocumentWithEndpoints>, String> {
    let pool = mysql.require_pool().map_err(|e| e.to_string())?;
    ensure_api_interface_schema(pool).map_err(|e| e.to_string())?;
    list_impl(pool).map_err(Into::into)
}

/// 解析上传的 OpenAPI/Swagger JSON 文档，持久化并返回该文档及其接口列表。
#[tauri::command]
pub fn parse_api_document(
    mysql: tauri::State<'_, MySqlProfileState>,
    request: ParseApiDocumentRequest,
) -> Result<ApiDocumentWithEndpoints, String> {
    let pool = mysql.require_pool().map_err(|e| e.to_string())?;
    ensure_api_interface_schema(pool).map_err(|e| e.to_string())?;

    let id = uuid::Uuid::new_v4().to_string();
    let parsed = parse_openapi_document(
        &id,
        request.name.trim(),
        request.source_file_name.trim(),
        request.model_provider_id.trim(),
        &request.content,
    )
    .map_err(|e| e.to_string())?;

    persist_impl(pool, &parsed).map_err(|e| e.to_string())?;
    // Re-read to include DB-populated timestamps.
    fetch_one(pool, &id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "保存后无法读取 API 文档".to_string())
}

/// 按 `id` 删除一个 API 文档及其全部接口。
#[tauri::command]
pub fn delete_api_document(
    mysql: tauri::State<'_, MySqlProfileState>,
    id: String,
) -> Result<Vec<ApiDocumentWithEndpoints>, String> {
    let pool = mysql.require_pool().map_err(|e| e.to_string())?;
    ensure_api_interface_schema(pool).map_err(|e| e.to_string())?;
    delete_impl(pool, &id).map_err(|e| e.to_string())?;
    list_impl(pool).map_err(Into::into)
}

// ── OpenAPI / Swagger parser ──────────────────────────────────────────────

/// Parse an OpenAPI 3.x or Swagger 2.0 JSON document into endpoints.
fn parse_openapi_document(
    id: &str,
    name: &str,
    source_file_name: &str,
    model_provider_id: &str,
    content: &str,
) -> AppResult<ApiDocumentWithEndpoints> {
    let root: Value = serde_json::from_str(content)
        .map_err(|e| AppError::Validation(format!("JSON 解析失败：{e}")))?;

    let format = if root.get("openapi").is_some() {
        "openapi"
    } else if root.get("swagger").is_some() {
        "swagger"
    } else {
        return Err(AppError::Validation(
            "无法识别文档：缺少 openapi 或 swagger 版本字段".to_string(),
        ));
    };

    let info = root.get("info");
    let title = info
        .and_then(|i| i.get("title"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let version = info
        .and_then(|i| i.get("version"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    let paths = root
        .get("paths")
        .and_then(Value::as_object)
        .ok_or_else(|| AppError::Validation("文档缺少 paths 字段".to_string()))?;

    let mut endpoints: Vec<ApiEndpoint> = Vec::new();
    for (path, path_item) in paths {
        let Some(path_obj) = path_item.as_object() else {
            continue;
        };
        // Path-level shared parameters (applies to all methods).
        let shared_params = path_obj.get("parameters").cloned();

        for method in HTTP_METHODS {
            let Some(op) = path_obj.get(method) else {
                continue;
            };
            if !op.is_object() {
                continue;
            }

            let summary = op
                .get("summary")
                .or_else(|| op.get("description"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let operation_id = op
                .get("operationId")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let tags = op
                .get("tags")
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .filter_map(Value::as_str)
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_default();

            // Combine op-level parameters + requestBody + path-level parameters.
            let mut request_parts = serde_json::Map::new();
            if let Some(params) = op.get("parameters") {
                request_parts.insert("parameters".to_string(), params.clone());
            } else if let Some(params) = &shared_params {
                request_parts.insert("parameters".to_string(), params.clone());
            }
            if let Some(body) = op.get("requestBody") {
                request_parts.insert("requestBody".to_string(), body.clone());
            }
            let request_schema_json = if request_parts.is_empty() {
                String::new()
            } else {
                serde_json::to_string(&Value::Object(request_parts)).unwrap_or_default()
            };

            let response_schema_json = op
                .get("responses")
                .map(|r| serde_json::to_string(r).unwrap_or_default())
                .unwrap_or_default();

            endpoints.push(ApiEndpoint {
                id: uuid::Uuid::new_v4().to_string(),
                document_id: id.to_string(),
                method: method.to_uppercase(),
                path: path.clone(),
                summary,
                operation_id,
                tags,
                request_schema_json,
                response_schema_json,
            });
        }
    }

    if endpoints.is_empty() {
        return Err(AppError::Validation(
            "未从文档中解析出任何接口".to_string(),
        ));
    }

    let resolved_name = if name.is_empty() {
        if !title.is_empty() {
            title.clone()
        } else if !source_file_name.is_empty() {
            source_file_name.to_string()
        } else {
            "API 文档".to_string()
        }
    } else {
        name.to_string()
    };

    let document = ApiDocument {
        id: id.to_string(),
        name: resolved_name,
        source_file_name: source_file_name.to_string(),
        format: format.to_string(),
        title,
        version,
        model_provider_id: model_provider_id.to_string(),
        endpoint_count: endpoints.len() as u32,
        created_at: String::new(),
        updated_at: String::new(),
    };

    Ok(ApiDocumentWithEndpoints { document, endpoints })
}

// ── Repository functions ──────────────────────────────────────────────────

fn persist_impl(pool: &Pool, parsed: &ApiDocumentWithEndpoints) -> AppResult<()> {
    let mut conn = pool.get_conn()?;
    let doc = &parsed.document;

    conn.exec_drop(
        r#"INSERT INTO api_documents
               (id, name, source_file_name, format, title, version, model_provider_id, endpoint_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
               name = VALUES(name), source_file_name = VALUES(source_file_name),
               format = VALUES(format), title = VALUES(title), version = VALUES(version),
               model_provider_id = VALUES(model_provider_id),
               endpoint_count = VALUES(endpoint_count)"#,
        (
            &doc.id,
            &doc.name,
            &doc.source_file_name,
            &doc.format,
            &doc.title,
            &doc.version,
            &doc.model_provider_id,
            doc.endpoint_count,
        ),
    )?;

    // Replace endpoints wholesale for idempotent re-parse.
    conn.exec_drop("DELETE FROM api_endpoints WHERE document_id = ?", (&doc.id,))?;

    for (idx, ep) in parsed.endpoints.iter().enumerate() {
        conn.exec_drop(
            r#"INSERT INTO api_endpoints
                   (id, document_id, method, path, summary, operation_id, tags,
                    request_schema_json, response_schema_json, sort_order)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
            (
                &ep.id,
                &ep.document_id,
                &ep.method,
                &ep.path,
                &ep.summary,
                &ep.operation_id,
                &ep.tags,
                if ep.request_schema_json.is_empty() {
                    None
                } else {
                    Some(&ep.request_schema_json)
                },
                if ep.response_schema_json.is_empty() {
                    None
                } else {
                    Some(&ep.response_schema_json)
                },
                idx as u32,
            ),
        )?;
    }
    Ok(())
}

fn list_impl(pool: &Pool) -> AppResult<Vec<ApiDocumentWithEndpoints>> {
    let mut conn = pool.get_conn()?;
    let doc_rows: Vec<Row> = conn.query(
        r#"SELECT id, name, source_file_name, format, title, version, model_provider_id,
                  endpoint_count,
                  COALESCE(DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s'), '') AS created_at,
                  COALESCE(DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%s'), '') AS updated_at
           FROM api_documents
           ORDER BY created_at DESC, updated_at DESC"#,
    )?;

    let mut result = Vec::with_capacity(doc_rows.len());
    for row in doc_rows {
        let document = row_to_document(row)?;
        let endpoints = fetch_endpoints(&mut conn, &document.id)?;
        result.push(ApiDocumentWithEndpoints { document, endpoints });
    }
    Ok(result)
}

fn fetch_one(pool: &Pool, id: &str) -> AppResult<Option<ApiDocumentWithEndpoints>> {
    let mut conn = pool.get_conn()?;
    let row: Option<Row> = conn.exec_first(
        r#"SELECT id, name, source_file_name, format, title, version, model_provider_id,
                  endpoint_count,
                  COALESCE(DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s'), '') AS created_at,
                  COALESCE(DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%s'), '') AS updated_at
           FROM api_documents WHERE id = ?"#,
        (id,),
    )?;
    let Some(row) = row else {
        return Ok(None);
    };
    let document = row_to_document(row)?;
    let endpoints = fetch_endpoints(&mut conn, &document.id)?;
    Ok(Some(ApiDocumentWithEndpoints { document, endpoints }))
}

fn fetch_endpoints(conn: &mut mysql::PooledConn, document_id: &str) -> AppResult<Vec<ApiEndpoint>> {
    let rows: Vec<Row> = conn.exec(
        r#"SELECT id, document_id, method, path, summary, operation_id, tags,
                  COALESCE(request_schema_json, '')  AS request_schema_json,
                  COALESCE(response_schema_json, '') AS response_schema_json
           FROM api_endpoints
           WHERE document_id = ?
           ORDER BY sort_order"#,
        (document_id,),
    )?;
    rows.into_iter()
        .map(|row| {
            let (
                id,
                document_id,
                method,
                path,
                summary,
                operation_id,
                tags,
                request_schema_json,
                response_schema_json,
            ): (
                String, String, String, String, String, String, String, String, String,
            ) = mysql::from_row_opt(row)?;
            Ok(ApiEndpoint {
                id,
                document_id,
                method,
                path,
                summary,
                operation_id,
                tags,
                request_schema_json,
                response_schema_json,
            })
        })
        .collect()
}

fn row_to_document(row: Row) -> AppResult<ApiDocument> {
    let (
        id,
        name,
        source_file_name,
        format,
        title,
        version,
        model_provider_id,
        endpoint_count,
        created_at,
        updated_at,
    ): (
        String, String, String, String, String, String, String, u32, String, String,
    ) = mysql::from_row_opt(row)?;
    Ok(ApiDocument {
        id,
        name,
        source_file_name,
        format,
        title,
        version,
        model_provider_id,
        endpoint_count,
        created_at,
        updated_at,
    })
}

fn delete_impl(pool: &Pool, id: &str) -> AppResult<()> {
    let mut conn = pool.get_conn()?;
    conn.exec_drop("DELETE FROM api_endpoints WHERE document_id = ?", (id,))?;
    conn.exec_drop("DELETE FROM api_documents WHERE id = ?", (id,))?;
    Ok(())
}
