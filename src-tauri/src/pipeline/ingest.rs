//! File ingestion stage: read raw file bytes and decode to UTF-8 strings.
//!
//! This stage is pure I/O — it has no knowledge of embedding or statistics.
//! All error paths are soft-skipped (logged to stderr) so one bad file doesn't
//! abort the entire pipeline run.

use std::path::Path;

use crate::text_file::decode_utf8_text_file;

// ── Public types ──────────────────────────────────────────────────────────

/// One successfully read source file.
pub struct FileRecord {
    /// Original absolute path string (used as the vector `source` label).
    pub path: String,
    /// Decoded text content.
    pub content: String,
    /// File size in bytes (for UI display).
    pub size_bytes: u64,
}

// ── Public API ────────────────────────────────────────────────────────────

/// Read all files in `paths`, returning successfully decoded records.
///
/// Files that fail to read or decode are logged to stderr and skipped.
/// Returns `(records, sorted_unique_extensions)`.
pub fn read_files(paths: &[String]) -> (Vec<FileRecord>, Vec<String>) {
    let mut records = Vec::with_capacity(paths.len());
    let mut ext_set: Vec<String> = Vec::new();

    for path_str in paths {
        let path = Path::new(path_str);
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("txt")
            .to_uppercase();

        match read_one(path) {
            Ok(record) => {
                if !ext_set.contains(&ext) {
                    ext_set.push(ext);
                }
                records.push(record);
            }            Err(e) => eprintln!("[pipeline::ingest] skip {path_str}: {e}"),
        }
    }

    ext_set.sort();
    (records, ext_set)
}

// ── Private helpers ───────────────────────────────────────────────────────

fn read_one(path: &Path) -> Result<FileRecord, String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("txt")
        .to_uppercase();
    let _ = ext; // used by the caller for file_types tracking
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let size_bytes = path.metadata().map(|m| m.len()).unwrap_or(bytes.len() as u64);
    let content = decode_utf8_text_file(path, bytes)?;
    Ok(FileRecord {
        path: path.to_string_lossy().into_owned(),
        content,
        size_bytes,
    })
}
