use std::fs;
use std::io::{self, Cursor, Read};
use std::path::{Path, PathBuf};

use kanji_trainer_lib::packs::{install, list_installed, remove, Archive};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

fn scratch(name: &str) -> PathBuf {
    let dir =
        std::env::temp_dir().join(format!("kanji-trainer-packs-{}-{name}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    dir
}

fn header(path: &str, size: usize) -> tar::Header {
    let mut header = tar::Header::new_gnu();
    header.set_size(size as u64);
    header.set_mode(0o644);
    header.set_entry_type(tar::EntryType::Regular);
    let name = &mut header.as_gnu_mut().expect("a gnu header").name;
    name[..path.len()].copy_from_slice(path.as_bytes());
    header.set_cksum();
    header
}

fn pack_tar(files: &[(&str, &str)]) -> Vec<u8> {
    let mut builder = tar::Builder::new(Vec::new());
    for (path, body) in files {
        builder
            .append(&header(path, body.len()), body.as_bytes())
            .expect("appended");
    }
    builder.into_inner().expect("finished")
}

fn archive_for(id: &str, theme: &str, bytes: &[u8]) -> Archive {
    let sha256: String = Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    Archive {
        id: id.to_string(),
        sha256: sha256.clone(),
        bytes: bytes.len() as u64,
        entry: json!({ "id": id, "theme": theme, "sha256": sha256, "bytes": bytes.len() }),
    }
}

fn names(root: &Path) -> Vec<String> {
    let mut found: Vec<String> = fs::read_dir(root)
        .map(|entries| {
            entries
                .flatten()
                .map(|entry| entry.file_name().to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default();
    found.sort();
    found
}

struct Aborted<R>(R, usize);

impl<R: Read> Read for Aborted<R> {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        if self.1 == 0 {
            return Err(io::Error::new(
                io::ErrorKind::ConnectionReset,
                "the line dropped",
            ));
        }
        let limit = buffer.len().min(self.1);
        let read = self.0.read(&mut buffer[..limit])?;
        self.1 -= read;
        Ok(read)
    }
}

#[test]
fn installs_a_pack_and_records_its_catalog_entry() {
    let root = scratch("install");
    let bytes = pack_tar(&[
        ("./content.json", "{}"),
        ("./images/a.webp", "picture"),
    ]);
    let archive = archive_for("n5-food", "food", &bytes);
    let mut steps = Vec::new();
    install(&root, &archive, Cursor::new(&bytes), |done, total| {
        steps.push((done, total))
    })
    .expect("installed");

    assert_eq!(names(&root), ["n5-food"]);
    assert_eq!(
        fs::read_to_string(root.join("n5-food/images/a.webp")).expect("file"),
        "picture"
    );
    let listed = list_installed(&root);
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0]["sha256"], Value::String(archive.sha256.clone()));
    assert_eq!(steps.first(), Some(&(0, bytes.len() as u64)));
    assert_eq!(
        steps.last(),
        Some(&(bytes.len() as u64, bytes.len() as u64))
    );
    let _ = fs::remove_dir_all(root);
}

#[test]
fn leaves_nothing_behind_when_the_hash_does_not_match() {
    let root = scratch("hash");
    let bytes = pack_tar(&[("./content.json", "{}")]);
    let mut archive = archive_for("n5-food", "food", &bytes);
    archive.sha256 = "0".repeat(64);
    assert!(install(&root, &archive, Cursor::new(&bytes), |_, _| {}).is_err());
    assert!(names(&root).is_empty());
    let _ = fs::remove_dir_all(root);
}

#[test]
fn leaves_nothing_behind_when_the_download_breaks_off() {
    let root = scratch("aborted");
    let bytes = pack_tar(&[("./content.json", "{}")]);
    let archive = archive_for("n5-food", "food", &bytes);
    let cut = Aborted(Cursor::new(bytes.clone()), 700);
    assert!(install(&root, &archive, cut, |_, _| {}).is_err());
    assert!(names(&root).is_empty());
    let _ = fs::remove_dir_all(root);
}

#[test]
fn refuses_an_archive_that_writes_outside_its_folder() {
    let root = scratch("escape");
    let bytes = pack_tar(&[("../escaped.txt", "gotcha")]);
    let archive = archive_for("n5-food", "food", &bytes);
    assert!(install(&root, &archive, Cursor::new(&bytes), |_, _| {}).is_err());
    assert!(names(&root).is_empty());
    assert!(!root.with_file_name("escaped.txt").exists());
    let _ = fs::remove_dir_all(root);
}

#[test]
fn an_update_replaces_the_pack_and_a_failed_one_keeps_the_old() {
    let root = scratch("update");
    let first = pack_tar(&[("./content.json", "1"), ("./gone.txt", "old")]);
    install(
        &root,
        &archive_for("n5-food", "food", &first),
        Cursor::new(&first),
        |_, _| {},
    )
    .expect("first");

    let broken = pack_tar(&[("./content.json", "2")]);
    let mut bad = archive_for("n5-food", "food", &broken);
    bad.sha256 = "0".repeat(64);
    assert!(install(&root, &bad, Cursor::new(&broken), |_, _| {}).is_err());
    assert_eq!(
        fs::read_to_string(root.join("n5-food/content.json")).expect("kept"),
        "1"
    );

    let second = pack_tar(&[("./content.json", "2")]);
    install(
        &root,
        &archive_for("n5-food", "food", &second),
        Cursor::new(&second),
        |_, _| {},
    )
    .expect("second");
    assert_eq!(
        fs::read_to_string(root.join("n5-food/content.json")).expect("new"),
        "2"
    );
    assert!(!root.join("n5-food/gone.txt").exists());
    assert_eq!(names(&root), ["n5-food"]);
    let _ = fs::remove_dir_all(root);
}

#[test]
fn removes_an_expansion_but_never_a_base_pack() {
    let root = scratch("remove");
    let bytes = pack_tar(&[("./content.json", "{}")]);
    install(
        &root,
        &archive_for("n5-base", "base", &bytes),
        Cursor::new(&bytes),
        |_, _| {},
    )
    .expect("base");
    install(
        &root,
        &archive_for("n5-food", "food", &bytes),
        Cursor::new(&bytes),
        |_, _| {},
    )
    .expect("food");

    assert!(remove(&root, "n5-base").is_err());
    remove(&root, "n5-food").expect("removed");
    assert_eq!(names(&root), ["n5-base"]);
    assert!(remove(&root, "../n5-base").is_err());
    let _ = fs::remove_dir_all(root);
}
