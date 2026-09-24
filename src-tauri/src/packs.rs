use std::fs::{self, File};
use std::io::{self, ErrorKind, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};

const DATASET: &str = "https://huggingface.co/datasets/arsalan-anwari/kanji-data/resolve/main";
const PROGRESS_STEP: u64 = 256 * 1024;
const SLOWEST_BYTES_PER_SECOND: u64 = 20_000;

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub enum InstallEvent {
    Progress { done: u64, total: u64 },
}

#[derive(Serialize)]
pub struct CatalogReply {
    pub catalog: Value,
    pub fresh: bool,
}

pub struct Archive {
    pub id: String,
    pub sha256: String,
    pub bytes: u64,
    pub entry: Value,
}

impl Archive {
    pub fn path(&self) -> String {
        format!("archives/{}.tar", self.id)
    }
}

fn to_text(error: impl ToString) -> String {
    error.to_string()
}

pub fn check_pack_id(id: &str) -> Result<(), String> {
    let shaped = !id.is_empty() && !id.starts_with('-') && !id.ends_with('-') && !id.contains("--");
    let plain = id
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if shaped && plain {
        Ok(())
    } else {
        Err(format!("\"{id}\" is not a pack id"))
    }
}

fn is_sha256(text: &str) -> bool {
    text.len() == 64
        && text
            .chars()
            .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c))
}

pub fn entry_of<'a>(catalog: &'a Value, id: &str) -> Result<&'a Value, String> {
    check_pack_id(id)?;
    catalog
        .get("packs")
        .and_then(Value::as_array)
        .and_then(|packs| {
            packs
                .iter()
                .find(|pack| pack.get("id").and_then(Value::as_str) == Some(id))
        })
        .ok_or_else(|| format!("the catalog does not list {id}"))
}

pub fn description_file(meta: &Value) -> Result<String, String> {
    let name = meta
        .get("description")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let plain = name
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_' || c == '.');
    let stem = name.strip_suffix(".md").unwrap_or_default();
    if plain && !stem.is_empty() && !stem.contains('.') {
        Ok(name.to_string())
    } else {
        Err("the pack has no description".to_string())
    }
}

pub fn archive_of(catalog: &Value, id: &str) -> Result<Archive, String> {
    let entry = entry_of(catalog, id)?;
    let sha256 = entry
        .get("sha256")
        .and_then(Value::as_str)
        .filter(|hash| is_sha256(hash))
        .ok_or_else(|| format!("the catalog gives {id} no usable hash"))?;
    let bytes = entry
        .get("bytes")
        .and_then(Value::as_u64)
        .ok_or_else(|| format!("the catalog gives {id} no size"))?;
    let archive = Archive {
        id: id.to_string(),
        sha256: sha256.to_string(),
        bytes,
        entry: entry.clone(),
    };
    if entry.get("archive").and_then(Value::as_str) != Some(archive.path().as_str()) {
        return Err(format!("the catalog points {id} somewhere unexpected"));
    }
    Ok(archive)
}

pub fn list_installed(root: &Path) -> Vec<Value> {
    let Ok(entries) = fs::read_dir(root) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter(|entry| !entry.file_name().to_string_lossy().starts_with('.'))
        .filter_map(|entry| fs::read_to_string(entry.path().join("pack.json")).ok())
        .filter_map(|text| serde_json::from_str(&text).ok())
        .collect()
}

pub fn safe_path(path: &Path) -> Result<Option<PathBuf>, String> {
    let mut clean = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => clean.push(part),
            Component::CurDir => {}
            _ => return Err(format!("{} would land outside the pack", path.display())),
        }
    }
    Ok(if clean.as_os_str().is_empty() {
        None
    } else {
        Some(clean)
    })
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn save(
    path: &Path,
    archive: &Archive,
    mut source: impl Read,
    progress: &mut impl FnMut(u64, u64),
) -> Result<String, String> {
    let mut file = File::create(path).map_err(to_text)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 64 * 1024];
    let mut done = 0u64;
    let mut reported = 0u64;
    progress(0, archive.bytes);
    loop {
        let read = match source.read(&mut buffer) {
            Ok(0) => break,
            Ok(read) => read,
            Err(error) if error.kind() == ErrorKind::Interrupted => continue,
            Err(error) => return Err(error.to_string()),
        };
        done += read as u64;
        if done > archive.bytes {
            return Err(format!("{} is larger than the catalog says", archive.id));
        }
        let chunk = &buffer[..read];
        hasher.update(chunk);
        file.write_all(chunk).map_err(to_text)?;
        if done - reported >= PROGRESS_STEP || done == archive.bytes {
            progress(done, archive.bytes);
            reported = done;
        }
    }
    file.sync_all().map_err(to_text)?;
    Ok(hex(&hasher.finalize()))
}

fn unpack(from: &Path, into: &Path) -> Result<(), String> {
    fs::create_dir_all(into).map_err(to_text)?;
    let mut archive = tar::Archive::new(File::open(from).map_err(to_text)?);
    for entry in archive.entries().map_err(to_text)? {
        let mut entry = entry.map_err(to_text)?;
        let kind = entry.header().entry_type();
        let path = safe_path(&entry.path().map_err(to_text)?)?;
        if kind.is_dir() {
            if let Some(path) = path {
                fs::create_dir_all(into.join(path)).map_err(to_text)?;
            }
            continue;
        }
        if !kind.is_file() {
            return Err("the pack holds something other than files and folders".to_string());
        }
        let target = into.join(path.ok_or("a file in the pack has no name")?);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(to_text)?;
        }
        let mut out = File::create(&target).map_err(to_text)?;
        io::copy(&mut entry, &mut out).map_err(to_text)?;
    }
    Ok(())
}

fn stage(
    download: &Path,
    partial: &Path,
    archive: &Archive,
    source: impl Read,
    progress: &mut impl FnMut(u64, u64),
) -> Result<(), String> {
    let digest = save(download, archive, source, progress)?;
    if digest != archive.sha256 {
        return Err(format!("{} arrived damaged, try again", archive.id));
    }
    unpack(download, partial)?;
    let meta = serde_json::to_string_pretty(&archive.entry).map_err(to_text)?;
    fs::write(partial.join("pack.json"), meta).map_err(to_text)
}

fn swap_in(root: &Path, partial: &Path, id: &str) -> Result<(), String> {
    let target = root.join(id);
    let old = root.join(format!(".old-{id}"));
    let _ = fs::remove_dir_all(&old);
    if target.exists() {
        fs::rename(&target, &old).map_err(to_text)?;
    }
    if let Err(error) = fs::rename(partial, &target) {
        let _ = fs::rename(&old, &target);
        return Err(error.to_string());
    }
    let _ = fs::remove_dir_all(&old);
    Ok(())
}

pub fn install(
    root: &Path,
    archive: &Archive,
    source: impl Read,
    mut progress: impl FnMut(u64, u64),
) -> Result<(), String> {
    fs::create_dir_all(root).map_err(to_text)?;
    let download = root.join(format!(".download-{}.tar", archive.id));
    let partial = root.join(format!(".partial-{}", archive.id));
    let _ = fs::remove_dir_all(&partial);
    let result = stage(&download, &partial, archive, source, &mut progress)
        .and_then(|()| swap_in(root, &partial, &archive.id));
    let _ = fs::remove_file(&download);
    let _ = fs::remove_dir_all(&partial);
    result
}

pub fn remove(root: &Path, id: &str) -> Result<(), String> {
    check_pack_id(id)?;
    let dir = root.join(id);
    let meta: Value = fs::read_to_string(dir.join("pack.json"))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .ok_or_else(|| format!("{id} is not installed"))?;
    if meta.get("theme").and_then(Value::as_str) == Some("base") {
        return Err(format!("{id} is a base pack and stays installed"));
    }
    fs::remove_dir_all(dir).map_err(to_text)
}

pub fn fresh_or_cached(
    cache: &Path,
    fetched: Result<Value, String>,
) -> Result<CatalogReply, String> {
    match fetched {
        Ok(catalog) => {
            let _ = fs::write(cache, catalog.to_string());
            Ok(CatalogReply {
                catalog,
                fresh: true,
            })
        }
        Err(error) => {
            let text = fs::read_to_string(cache).map_err(|_| error)?;
            let catalog = serde_json::from_str(&text).map_err(to_text)?;
            Ok(CatalogReply {
                catalog,
                fresh: false,
            })
        }
    }
}

fn agent(body_seconds: u64) -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_connect(Some(Duration::from_secs(15)))
        .timeout_recv_response(Some(Duration::from_secs(30)))
        .timeout_recv_body(Some(Duration::from_secs(body_seconds)))
        .build()
        .new_agent()
}

fn download_catalog() -> Result<Value, String> {
    let text = agent(60)
        .get(format!("{DATASET}/catalog.json"))
        .call()
        .map_err(to_text)?
        .body_mut()
        .read_to_string()
        .map_err(to_text)?;
    let catalog: Value = serde_json::from_str(&text).map_err(to_text)?;
    if catalog.get("packs").and_then(Value::as_array).is_none() {
        return Err("the catalog has no packs list".to_string());
    }
    Ok(catalog)
}

fn packs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(to_text)?.join("packs"))
}

fn cache_dir(app: &AppHandle, sub: &str) -> Result<PathBuf, String> {
    let dir = app.path().app_cache_dir().map_err(to_text)?.join(sub);
    fs::create_dir_all(&dir).map_err(to_text)?;
    Ok(dir)
}

fn catalog_cache(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(cache_dir(app, "")?.join("catalog.json"))
}

fn cached_catalog(app: &AppHandle) -> Result<Value, String> {
    let text = fs::read_to_string(catalog_cache(app)?)
        .map_err(|_| "the catalog has not been fetched yet".to_string())?;
    serde_json::from_str(&text).map_err(to_text)
}

#[tauri::command]
pub fn list_packs(app: AppHandle) -> Result<Vec<Value>, String> {
    Ok(list_installed(&packs_dir(&app)?))
}

#[tauri::command]
pub async fn fetch_catalog(app: AppHandle) -> Result<CatalogReply, String> {
    let cache = catalog_cache(&app)?;
    tauri::async_runtime::spawn_blocking(move || fresh_or_cached(&cache, download_catalog()))
        .await
        .map_err(to_text)?
}

#[tauri::command]
pub async fn install_pack(
    app: AppHandle,
    id: String,
    on_event: Channel<InstallEvent>,
) -> Result<(), String> {
    let archive = archive_of(&cached_catalog(&app)?, &id)?;
    let root = packs_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let response = agent(60 + archive.bytes / SLOWEST_BYTES_PER_SECOND)
            .get(format!("{DATASET}/{}", archive.path()))
            .call()
            .map_err(to_text)?;
        let source = response.into_body().into_reader();
        install(&root, &archive, source, |done, total| {
            let _ = on_event.send(InstallEvent::Progress { done, total });
        })
    })
    .await
    .map_err(to_text)?
}

#[tauri::command]
pub async fn read_description(app: AppHandle, id: String) -> Result<String, String> {
    check_pack_id(&id)?;
    let installed = packs_dir(&app)?.join(&id);
    if let Some(meta) = fs::read_to_string(installed.join("pack.json"))
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
    {
        return fs::read_to_string(installed.join(description_file(&meta)?)).map_err(to_text);
    }
    let catalog = cached_catalog(&app)?;
    let entry = entry_of(&catalog, &id)?;
    let file = description_file(entry)?;
    let sha = archive_of(&catalog, &id)?.sha256;
    let cached = cache_dir(&app, "descriptions")?.join(format!("{id}-{sha}.md"));
    if let Ok(text) = fs::read_to_string(&cached) {
        return Ok(text);
    }
    tauri::async_runtime::spawn_blocking(move || {
        let text = agent(60)
            .get(format!("{DATASET}/packs/{id}/{file}"))
            .call()
            .map_err(to_text)?
            .body_mut()
            .read_to_string()
            .map_err(to_text)?;
        let _ = fs::write(&cached, &text);
        Ok(text)
    })
    .await
    .map_err(to_text)?
}

#[tauri::command]
pub fn delete_pack(app: AppHandle, id: String) -> Result<(), String> {
    remove(&packs_dir(&app)?, &id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn catalog(entry: Value) -> Value {
        json!({ "packs": [entry] })
    }

    fn entry() -> Value {
        json!({ "id": "n5-food", "sha256": "a".repeat(64), "bytes": 10, "archive": "archives/n5-food.tar" })
    }

    #[test]
    fn accepts_a_plain_pack_id_and_nothing_that_could_name_a_path() {
        assert!(check_pack_id("n5-base").is_ok());
        for id in [
            "", "../n5", "n5/base", "N5-base", "-n5", "n5-", "n5--base", "n5.base",
        ] {
            assert!(check_pack_id(id).is_err(), "{id}");
        }
    }

    #[test]
    fn finds_the_archive_the_catalog_lists_for_a_pack() {
        let archive = archive_of(&catalog(entry()), "n5-food").expect("listed");
        assert_eq!(archive.path(), "archives/n5-food.tar");
        assert_eq!(archive.bytes, 10);
    }

    #[test]
    fn refuses_an_entry_pointing_anywhere_but_its_own_archive() {
        let mut far = entry();
        far["archive"] = json!("../../secrets.tar");
        assert!(archive_of(&catalog(far), "n5-food").is_err());
        assert!(archive_of(&catalog(entry()), "n5-travel").is_err());
    }

    #[test]
    fn refuses_an_entry_without_a_usable_hash() {
        let mut odd = entry();
        odd["sha256"] = json!("A".repeat(64));
        assert!(archive_of(&catalog(odd), "n5-food").is_err());
    }

    #[test]
    fn keeps_archive_paths_inside_the_pack() {
        assert_eq!(
            safe_path(Path::new("./images/a.webp")),
            Ok(Some(PathBuf::from("images/a.webp")))
        );
        assert_eq!(safe_path(Path::new("./")), Ok(None));
        assert!(safe_path(Path::new("../evil")).is_err());
        assert!(safe_path(Path::new("images/../../evil")).is_err());
        assert!(safe_path(Path::new("/etc/passwd")).is_err());
    }

    #[test]
    fn reads_a_description_only_as_a_plain_markdown_file_of_the_pack() {
        assert_eq!(
            description_file(&json!({ "description": "description.md" })),
            Ok("description.md".to_string())
        );
        for odd in [
            "",
            ".md",
            "../x.md",
            "a/b.md",
            "notes.txt",
            "a.b.md",
            "# JLPT N5",
        ] {
            assert!(
                description_file(&json!({ "description": odd })).is_err(),
                "{odd}"
            );
        }
        assert!(description_file(&json!({})).is_err());
    }

    #[test]
    fn names_a_hash_in_lowercase_hex() {
        assert_eq!(hex(&[0, 15, 255]), "000fff");
    }
}
