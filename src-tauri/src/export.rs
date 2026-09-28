use std::fs;
use std::io::{stdout, IsTerminal, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use percent_encoding::percent_decode_str;
use serde::{Deserialize, Serialize};
use tauri::ipc::Request;
use tauri::{AppHandle, Runtime, State};

use crate::packs::check_pack_id;

pub const USAGE: &str = "\
Usage: kanji-trainer --export-flashcards [--data <dir>]

Renders the flashcard PDFs of every pack in <dir>/packs/, plus n5-all with
every pack combined, in English and in every locale the packs ship, without
showing a window. Replaces the kanji-flashcards-*.pdf files in
<dir>/flashcards/{locale}/{pack}/.
<dir> defaults to ./data. Progress goes to stdout (a live bar when it is a
terminal), errors to stderr.

Meant for Linux development: the Windows release build has no console, so it
prints nothing there.";

const PREFIX: &str = "kanji-flashcards-";
const SUFFIX: &str = ".pdf";
const BAR: usize = 20;
/// Clears the terminal line the progress bar is drawn on.
const CLEAR: &str = "\r\x1b[2K";

#[derive(Debug, PartialEq, Eq)]
pub enum Mode {
    App,
    Help,
    Export(PathBuf),
}

pub struct Export {
    pub packs: PathBuf,
    pub out: PathBuf,
    pub started: Instant,
}

#[derive(Serialize)]
pub struct ExportRequest {
    packs: String,
    out: String,
}

#[derive(Deserialize)]
pub struct ExportFile {
    name: String,
    bytes: usize,
    pages: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    locale: String,
    locale_at: usize,
    locales: usize,
    target: String,
    size: usize,
    page: usize,
    pages: usize,
    done: usize,
    total: usize,
}

pub fn parse_args(args: &[String]) -> Result<Mode, String> {
    if args.iter().any(|arg| arg == "--help") {
        return Ok(Mode::Help);
    }
    if !args.iter().any(|arg| arg == "--export-flashcards") {
        return Ok(Mode::App);
    }
    match args.iter().position(|arg| arg == "--data") {
        None => Ok(Mode::Export(PathBuf::from("data"))),
        Some(at) => args
            .get(at + 1)
            .filter(|value| !value.starts_with("--"))
            .map(|value| Mode::Export(PathBuf::from(value)))
            .ok_or_else(|| "--data needs a directory".to_string()),
    }
}

pub fn resolve(data: &Path, cwd: &Path) -> Result<Export, String> {
    let root = cwd.join(data);
    let packs = root.join("packs");
    if !packs.join("index.json").is_file() {
        return Err(format!("{} has no packs/index.json", root.display()));
    }
    Ok(Export {
        packs,
        out: root.join("flashcards"),
        started: Instant::now(),
    })
}

fn clock(seconds: u64) -> String {
    format!("{}:{:02}:{:02}", seconds / 3600, seconds / 60 % 60, seconds % 60)
}

// ponytail: fixed width, about 90 columns; a narrower terminal wraps the bar.
pub fn progress_line(progress: &Progress, elapsed: Duration) -> String {
    let share = if progress.total == 0 {
        1.0
    } else {
        (progress.done as f64 / progress.total as f64).min(1.0)
    };
    let filled = (share * BAR as f64).round() as usize;
    let left = if progress.done == 0 {
        "-:--:--".to_string()
    } else {
        let rest = progress.total.saturating_sub(progress.done) as f64;
        clock((elapsed.as_secs_f64() * rest / progress.done as f64) as u64)
    };
    let size = progress.size;
    format!(
        "{} {}/{}  {} {size}x{size} {}/{}  [{}{}] {:5.1}%  {}/{}  {} ~{} left",
        progress.locale,
        progress.locale_at,
        progress.locales,
        progress.target,
        progress.page,
        progress.pages,
        "█".repeat(filled),
        "░".repeat(BAR - filled),
        share * 100.0,
        progress.done,
        progress.total,
        clock(elapsed.as_secs()),
        left
    )
}

/// Starts a printed line on a fresh terminal line, over the progress bar.
fn clear_bar() {
    if stdout().is_terminal() {
        print!("{CLEAR}");
    }
}

pub fn grid_of(name: &str) -> Option<&str> {
    let stem = name.strip_prefix(PREFIX)?.strip_suffix(SUFFIX)?;
    let shape = "dddd-dd-dd-dxd";
    let fits = stem.len() == shape.len()
        && stem.chars().zip(shape.chars()).all(|(c, want)| match want {
            'd' => c.is_ascii_digit(),
            other => c == other,
        });
    fits.then(|| &stem[stem.len() - 3..])
}

fn is_flashcard_pdf(path: &Path) -> bool {
    path.is_file()
        && path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with(PREFIX) && name.ends_with(SUFFIX))
}

pub fn replace_flashcards(dir: &Path, files: &[(&str, &[u8])]) -> Result<(), String> {
    if let Some((name, _)) = files.iter().find(|(name, _)| grid_of(name).is_none()) {
        return Err(format!("\"{name}\" is not a flashcard file name"));
    }
    fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if is_flashcard_pdf(&path) {
            fs::remove_file(&path).map_err(|error| error.to_string())?;
        }
    }
    for (name, bytes) in files {
        fs::write(dir.join(name), bytes).map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn check_locale(tag: &str) -> Result<(), String> {
    let plain = !tag.is_empty()
        && !tag.starts_with('-')
        && tag.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    if plain {
        Ok(())
    } else {
        Err(format!("\"{tag}\" is not a locale tag"))
    }
}

fn header(request: &Request<'_>, name: &str) -> Result<String, String> {
    let encoded = request
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| format!("the {name} header is missing"))?;
    percent_decode_str(encoded)
        .decode_utf8()
        .map(|value| value.into_owned())
        .map_err(|error| error.to_string())
}

fn active<'a>(state: &'a State<'_, Option<Export>>) -> Result<&'a Export, String> {
    state
        .inner()
        .as_ref()
        .ok_or_else(|| "the app was not started with --export-flashcards".to_string())
}

#[tauri::command]
pub fn export_request(state: State<'_, Option<Export>>) -> Option<ExportRequest> {
    state.inner().as_ref().map(|export| ExportRequest {
        packs: export.packs.to_string_lossy().into_owned(),
        out: export.out.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn export_write(state: State<'_, Option<Export>>, request: Request<'_>) -> Result<(), String> {
    let export = active(&state)?;
    let locale = header(&request, "locale")?;
    check_locale(&locale)?;
    let target = header(&request, "target")?;
    check_pack_id(&target)?;
    let manifest: Vec<ExportFile> =
        serde_json::from_str(&header(&request, "files")?).map_err(|error| error.to_string())?;
    let tauri::ipc::InvokeBody::Raw(body) = request.body() else {
        return Err("the flashcards must be sent as raw bytes".to_string());
    };
    if manifest.iter().map(|file| file.bytes).sum::<usize>() != body.len() {
        return Err("the flashcard sizes do not add up to the bytes sent".to_string());
    }
    let mut files = Vec::with_capacity(manifest.len());
    let mut start = 0;
    for file in &manifest {
        files.push((file.name.as_str(), &body[start..start + file.bytes]));
        start += file.bytes;
    }
    replace_flashcards(&export.out.join(&locale).join(&target), &files)?;
    clear_bar();
    for file in &manifest {
        let grid = grid_of(&file.name).unwrap_or_default();
        println!("{locale} {target} {grid}: {} pages", file.pages);
    }
    Ok(())
}

#[tauri::command]
pub fn export_progress(state: State<'_, Option<Export>>, progress: Progress) -> Result<(), String> {
    let export = active(&state)?;
    let mut out = stdout();
    if out.is_terminal() {
        print!("{CLEAR}{}", progress_line(&progress, export.started.elapsed()));
        out.flush().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn export_finish<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, Option<Export>>,
    ok: bool,
    message: String,
) -> Result<(), String> {
    let export = active(&state)?;
    clear_bar();
    if ok {
        println!("done in {}", clock(export.started.elapsed().as_secs()));
    } else {
        eprintln!("{message}");
    }
    app.exit(if ok { 0 } else { 1 });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|arg| arg.to_string()).collect()
    }

    #[test]
    fn starts_the_app_as_usual_without_the_flag() {
        assert_eq!(parse_args(&args(&[])), Ok(Mode::App));
        assert_eq!(parse_args(&args(&["--data", "x"])), Ok(Mode::App));
    }

    #[test]
    fn exports_from_the_data_folder_unless_told_otherwise() {
        assert_eq!(
            parse_args(&args(&["--export-flashcards"])),
            Ok(Mode::Export(PathBuf::from("data")))
        );
        assert_eq!(
            parse_args(&args(&["--export-flashcards", "--data", "/tmp/d"])),
            Ok(Mode::Export(PathBuf::from("/tmp/d")))
        );
    }

    #[test]
    fn refuses_a_data_flag_without_a_directory() {
        assert!(parse_args(&args(&["--export-flashcards", "--data"])).is_err());
        assert!(parse_args(&args(&["--data", "--export-flashcards"])).is_err());
    }

    #[test]
    fn answers_help_before_anything_else() {
        assert_eq!(
            parse_args(&args(&["--export-flashcards", "--help"])),
            Ok(Mode::Help)
        );
    }

    #[test]
    fn refuses_a_data_folder_without_a_pack_index() {
        let missing = Path::new("/nonexistent");
        assert!(resolve(missing, Path::new("/")).is_err());
    }

    #[test]
    fn draws_the_bar_with_the_time_left() {
        let progress = Progress {
            locale: "pt-BR".to_string(),
            locale_at: 6,
            locales: 17,
            target: "n5-base".to_string(),
            size: 3,
            page: 12,
            pages: 48,
            done: 250,
            total: 1000,
        };
        assert_eq!(
            progress_line(&progress, Duration::from_secs(90)),
            "pt-BR 6/17  n5-base 3x3 12/48  [█████░░░░░░░░░░░░░░░]  25.0%  250/1000  0:01:30 ~0:04:30 left"
        );
    }

    #[test]
    fn accepts_only_plain_locale_tags() {
        for tag in ["en", "pt-BR", "zh-TW"] {
            assert_eq!(check_locale(tag), Ok(()), "{tag}");
        }
        for tag in ["", "-en", "..", "en/../x", "pt_BR"] {
            assert!(check_locale(tag).is_err(), "{tag}");
        }
    }

    #[test]
    fn accepts_only_dated_grid_file_names() {
        assert_eq!(grid_of("kanji-flashcards-2026-09-26-3x3.pdf"), Some("3x3"));
        for name in [
            "kanji-flashcards-2026-09-26-3x3.pdf.bak",
            "kanji-flashcards-2026-9-26-3x3.pdf",
            "kanji-flashcards-2026-09-26-10x10.pdf",
            "../kanji-flashcards-2026-09-26-3x3.pdf",
            "kanji-flashcards-2026-09-26-3x3/.pdf",
            "notes.pdf",
        ] {
            assert_eq!(grid_of(name), None, "{name}");
        }
    }
}
