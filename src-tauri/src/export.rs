use std::fs;
use std::io::{stdout, Write};
use std::path::{Path, PathBuf};

use percent_encoding::percent_decode_str;
use serde::{Deserialize, Serialize};
use tauri::ipc::Request;
use tauri::{AppHandle, Runtime, State};

use crate::packs::check_pack_id;

pub const USAGE: &str = "\
Usage: kanji-trainer --export-flashcards [--data <dir>] [--plan | --only <locale>/<target>]

Renders the flashcard PDFs of every pack in <dir>/packs/, plus n5-all with
every pack combined, in English and in every locale the packs ship, without
showing a window. Replaces the kanji-flashcards-*.pdf files in
<dir>/flashcards/{locale}/{pack}/.
<dir> defaults to ./data.

  --plan    Print every job as {\"locale\", \"target\", \"pages\"} and render nothing.
  --only    Render that one job.

Every rendered page prints {\"size\", \"page\", \"pages\"}: one JSON object per
line on stdout. Errors go to stderr. tools/export/export_flashcards.py drives it one
job per process, since one webview rendering every job outgrows WebKit's
memory limit.

Meant for Linux development: the Windows release build has no console, so it
prints nothing there.";

const PREFIX: &str = "kanji-flashcards-";
const SUFFIX: &str = ".pdf";

#[derive(Debug, PartialEq, Eq)]
pub enum Mode {
    App,
    Help,
    Export(Options),
}

#[derive(Debug, PartialEq, Eq)]
pub struct Options {
    pub data: PathBuf,
    pub only: Option<String>,
    pub plan: bool,
}

pub struct Export {
    pub packs: PathBuf,
    pub out: PathBuf,
    pub only: Option<String>,
    pub plan: bool,
}

#[derive(Serialize)]
pub struct ExportRequest {
    packs: String,
    out: String,
    only: Option<String>,
    plan: bool,
}

#[derive(Deserialize)]
pub struct ExportFile {
    name: String,
    bytes: usize,
}

pub fn parse_args(args: &[String]) -> Result<Mode, String> {
    if args.iter().any(|arg| arg == "--help") {
        return Ok(Mode::Help);
    }
    if !args.iter().any(|arg| arg == "--export-flashcards") {
        return Ok(Mode::App);
    }
    let value = |flag: &str, what: &str| match args.iter().position(|arg| arg == flag) {
        None => Ok(None),
        Some(at) => args
            .get(at + 1)
            .filter(|value| !value.starts_with("--"))
            .map(|value| Some(value.clone()))
            .ok_or_else(|| format!("{flag} needs {what}")),
    };
    Ok(Mode::Export(Options {
        data: PathBuf::from(value("--data", "a directory")?.unwrap_or_else(|| "data".to_string())),
        only: value("--only", "a <locale>/<target> job")?,
        plan: args.iter().any(|arg| arg == "--plan"),
    }))
}

pub fn resolve(options: Options, cwd: &Path) -> Result<Export, String> {
    let root = cwd.join(&options.data);
    let packs = root.join("packs");
    if !packs.join("index.json").is_file() {
        return Err(format!("{} has no packs/index.json", root.display()));
    }
    Ok(Export {
        packs,
        out: root.join("flashcards"),
        only: options.only,
        plan: options.plan,
    })
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
        only: export.only.clone(),
        plan: export.plan,
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
    replace_flashcards(&export.out.join(&locale).join(&target), &files)
}

/// Prints one JSON line for the script driving the export.
#[tauri::command]
pub fn export_emit(
    state: State<'_, Option<Export>>,
    event: serde_json::Value,
) -> Result<(), String> {
    active(&state)?;
    let mut out = stdout().lock();
    writeln!(out, "{event}")
        .and_then(|()| out.flush())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn export_finish<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, Option<Export>>,
    ok: bool,
    message: String,
) -> Result<(), String> {
    active(&state)?;
    if !ok {
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

    fn export(data: &str, only: Option<&str>, plan: bool) -> Result<Mode, String> {
        Ok(Mode::Export(Options {
            data: PathBuf::from(data),
            only: only.map(str::to_string),
            plan,
        }))
    }

    #[test]
    fn exports_from_the_data_folder_unless_told_otherwise() {
        assert_eq!(
            parse_args(&args(&["--export-flashcards"])),
            export("data", None, false)
        );
        assert_eq!(
            parse_args(&args(&["--export-flashcards", "--data", "/tmp/d"])),
            export("/tmp/d", None, false)
        );
    }

    #[test]
    fn plans_or_renders_one_job_when_asked() {
        assert_eq!(
            parse_args(&args(&["--export-flashcards", "--plan"])),
            export("data", None, true)
        );
        assert_eq!(
            parse_args(&args(&["--export-flashcards", "--only", "pt-BR/n5-all"])),
            export("data", Some("pt-BR/n5-all"), false)
        );
    }

    #[test]
    fn refuses_a_flag_without_its_value() {
        assert!(parse_args(&args(&["--export-flashcards", "--data"])).is_err());
        assert!(parse_args(&args(&["--data", "--export-flashcards"])).is_err());
        assert!(parse_args(&args(&["--export-flashcards", "--only", "--plan"])).is_err());
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
        let missing = Options {
            data: PathBuf::from("/nonexistent"),
            only: None,
            plan: false,
        };
        assert!(resolve(missing, Path::new("/")).is_err());
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
