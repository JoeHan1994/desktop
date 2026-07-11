//! Vectorisation stage: convert text chunks to embedding vectors.
//!
//! Pure functions — no I/O, no state. Swap `embed::embed` for a real ML model
//! without touching any other module.

use super::process::Chunk;
use crate::domain::pipeline::VectorEntry;
use crate::embed;

// ── Public API ────────────────────────────────────────────────────────────

/// Embed a single chunk and return a `VectorEntry` without a 3-D projection.
///
/// Call `embed::project_3d(&entry.embedding)` separately after all entries
/// are embedded (so the projection matrix seed remains consistent).
pub fn embed_chunk(chunk: &Chunk, created_date: &str) -> VectorEntry {
    let embedding = embed::embed(&chunk.text);
    let id = chunk_id(&chunk.source, chunk.chunk_index);
    VectorEntry {
        id,
        text: chunk.text.clone(),
        source: chunk.source.clone(),
        created: created_date.to_string(),
        embedding,
        position: [0.0; 3],
        _chunk_index: chunk.chunk_index,
    }
}

// ── Private helpers ───────────────────────────────────────────────────────

/// Stable deterministic ID derived from source path + chunk index.
fn chunk_id(source: &str, chunk_index: usize) -> String {
    let hash = embed::fnv1a(&format!("{source}:{chunk_index}"));
    format!("{hash:016x}")
}
