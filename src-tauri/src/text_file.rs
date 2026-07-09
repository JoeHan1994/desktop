use std::path::Path;

pub const UNSUPPORTED_TEXT_FILE_MESSAGE: &str =
    "无法打开：仅支持文本文件，当前文件可能是可执行文件或二进制文件";

const BLOCKED_EXTENSIONS: &[&str] = &[
    "exe", "dll", "msi", "sys", "com", "scr", "bin", "dat", "so", "dylib", "lib", "a", "obj", "o",
    "class", "jar", "war", "ear", "zip", "rar", "7z", "gz", "tgz", "bz2", "xz", "png", "jpg",
    "jpeg", "gif", "webp", "ico", "bmp", "tif", "tiff", "mp4", "mkv", "avi", "mov", "wmv", "mp3",
    "wav", "flac", "aac", "ogg", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "db",
    "sqlite", "sqlite3", "mdb", "accdb", "ttf", "otf", "woff", "woff2",
];

pub fn ensure_supported_text_path(path: &str) -> Result<(), String> {
    if let Some(ext) = Path::new(path).extension().and_then(|value| value.to_str()) {
        if BLOCKED_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()) {
            return Err(UNSUPPORTED_TEXT_FILE_MESSAGE.to_string());
        }
    }
    Ok(())
}

pub fn ensure_text_bytes(path: &str, bytes: &[u8]) -> Result<(), String> {
    ensure_supported_text_path(path)?;
    if looks_binary(bytes) {
        return Err(UNSUPPORTED_TEXT_FILE_MESSAGE.to_string());
    }
    Ok(())
}

pub fn decode_lossy_text_file(path: &str, bytes: Vec<u8>) -> Result<String, String> {
    ensure_text_bytes(path, &bytes)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

pub fn decode_utf8_text_file(path: &Path, bytes: Vec<u8>) -> Result<String, String> {
    let path_str = path.to_string_lossy();
    ensure_text_bytes(&path_str, &bytes)?;
    String::from_utf8(bytes)
        .map_err(|_| "无法打开：仅支持 UTF-8 文本文件，当前文件编码不受支持".to_string())
}

fn looks_binary(bytes: &[u8]) -> bool {
    if bytes.is_empty() {
        return false;
    }

    if has_binary_magic(bytes) || bytes.contains(&0) {
        return true;
    }

    let sample_len = bytes.len().min(8192);
    let sample = &bytes[..sample_len];
    let suspicious_controls = sample
        .iter()
        .filter(|byte| matches!(**byte, 0x00..=0x08 | 0x0E..=0x1F | 0x7F))
        .count();

    suspicious_controls * 100 > sample_len * 5
}

fn has_binary_magic(bytes: &[u8]) -> bool {
    bytes.starts_with(b"MZ")
        || bytes.starts_with(b"\x7FELF")
        || bytes.starts_with(b"PK\x03\x04")
        || bytes.starts_with(b"PK\x05\x06")
        || bytes.starts_with(b"PK\x07\x08")
        || bytes.starts_with(b"\x89PNG\r\n\x1A\n")
        || bytes.starts_with(b"\xFF\xD8\xFF")
        || bytes.starts_with(b"GIF87a")
        || bytes.starts_with(b"GIF89a")
        || bytes.starts_with(b"%PDF-")
        || bytes.starts_with(b"\xCA\xFE\xBA\xBE")
        || bytes.starts_with(b"\xFE\xED\xFA\xCE")
        || bytes.starts_with(b"\xFE\xED\xFA\xCF")
        || bytes.starts_with(b"\xCF\xFA\xED\xFE")
        || bytes.starts_with(b"\xCE\xFA\xED\xFE")
}
