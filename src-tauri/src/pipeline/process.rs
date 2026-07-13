//! Text processing stage: cleaning and chunking.
//!
//! Pure functions — no I/O, no state. Each function is independently testable.

use super::ingest::FileRecord;

// ── Public types ──────────────────────────────────────────────────────────

/// One text chunk ready for embedding.
pub struct Chunk {
    pub text: String,
    /// Source file path (used as vector payload label).
    pub source: String,
    /// Zero-based index of this chunk within its source file.
    pub chunk_index: usize,
}

// ── Public API ────────────────────────────────────────────────────────────

/// Process all ingested file records into embedding-ready chunks.
///
/// Returns `(chunks, total_chars_before_cleaning, total_chars_after_cleaning)`.
pub fn process(records: &[FileRecord]) -> (Vec<Chunk>, u64, u64) {
    let mut chunks = Vec::new();
    let mut chars_before: u64 = 0;
    let mut chars_after: u64 = 0;

    for record in records {
        chars_before += record.content.chars().count() as u64;
        let cleaned = clean_text(&record.content);
        chars_after += cleaned.chars().count() as u64;

        for (i, text) in chunk_text(&cleaned, 500, 0.15).into_iter().enumerate() {
            chunks.push(Chunk {
                text,
                source: record.path.clone(),
                chunk_index: i,
            });
        }
    }

    (chunks, chars_before, chars_after)
}

/// Remove HTML tags and control characters, then collapse consecutive whitespace.
pub fn clean_text(s: &str) -> String {
    // Pass 1: strip HTML tags and control characters.
    let mut raw = String::with_capacity(s.len());
    let mut in_tag = false;
    for ch in s.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if in_tag => {}
            _ if ch.is_control() && ch != '\n' && ch != '\t' => {}
            _ => raw.push(ch),
        }
    }

    // Pass 2: collapse runs of spaces/tabs into a single space.
    let mut out = String::with_capacity(raw.len());
    let mut prev_ws = false;
    for ch in raw.chars() {
        if ch == ' ' || ch == '\t' {
            if !prev_ws {
                out.push(' ');
            }
            prev_ws = true;
        } else {
            prev_ws = false;
            out.push(ch);
        }
    }
    out.trim().to_string()
}

/// Split `text` into fixed-size chunks with a percentage overlap.
///
/// - `chunk_size`: maximum characters per chunk.
/// - `overlap_ratio`: fraction of `chunk_size` shared with the next chunk
///   (e.g. `0.15` = 15 % overlap).
pub fn chunk_text(text: &str, chunk_size: usize, overlap_ratio: f32) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    let total = chars.len();
    if total == 0 || chunk_size == 0 {
        return vec![];
    }
    if total <= chunk_size {
        return vec![chars.iter().collect()];
    }
    let step = ((chunk_size as f32) * (1.0 - overlap_ratio)) as usize;
    let step = step.max(1);
    let mut result = Vec::new();
    let mut start = 0;
    while start < total {
        let end = (start + chunk_size).min(total);
        result.push(chars[start..end].iter().collect());
        if end == total {
            break;
        }
        start += step;
    }
    result
}

/// Return today's date as `"YYYY-MM-DD"` without external crate dependencies.
pub fn today_date_str() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let mut days = secs / 86400;
    let mut year = 1970u32;
    loop {
        let dy = if is_leap(year) { 366 } else { 365 };
        if days < dy {
            break;
        }
        days -= dy;
        year += 1;
    }
    let month_days: [u64; 12] = [
        31,
        if is_leap(year) { 29 } else { 28 },
        31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
    ];
    let mut month = 1u32;
    for &md in &month_days {
        if days < md {
            break;
        }
        days -= md;
        month += 1;
    }
    format!("{year:04}-{month:02}-{:02}", days + 1)
}

fn is_leap(y: u32) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}
