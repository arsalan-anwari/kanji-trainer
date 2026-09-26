use std::fs;
use std::path::PathBuf;

use kanji_trainer_lib::export::replace_flashcards;

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "kanji-trainer-export-{}-{name}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&dir);
    dir
}

fn names(dir: &PathBuf) -> Vec<String> {
    let mut found: Vec<String> = fs::read_dir(dir)
        .expect("readable")
        .map(|entry| {
            entry
                .expect("an entry")
                .file_name()
                .to_string_lossy()
                .into_owned()
        })
        .collect();
    found.sort();
    found
}

#[test]
fn replaces_old_flashcards_and_leaves_every_other_file_alone() {
    let dir = scratch("replace");
    fs::create_dir_all(&dir).expect("created");
    fs::write(dir.join("kanji-flashcards-2026-09-26-1x1.pdf"), b"old").expect("written");
    fs::write(dir.join("kanji-flashcards-2026-09-26-9x9.pdf"), b"old").expect("written");
    fs::write(dir.join("notes.pdf"), b"keep").expect("written");
    fs::write(dir.join("kanji-flashcards.txt"), b"keep").expect("written");

    replace_flashcards(
        &dir,
        &[
            ("kanji-flashcards-2026-09-27-1x1.pdf", b"one"),
            ("kanji-flashcards-2026-09-27-2x2.pdf", b"two"),
        ],
    )
    .expect("replaced");

    assert_eq!(
        names(&dir),
        [
            "kanji-flashcards-2026-09-27-1x1.pdf",
            "kanji-flashcards-2026-09-27-2x2.pdf",
            "kanji-flashcards.txt",
            "notes.pdf"
        ]
    );
    assert_eq!(
        fs::read(dir.join("kanji-flashcards-2026-09-27-2x2.pdf")).expect("read"),
        b"two"
    );
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn creates_the_target_folder_when_it_is_new() {
    let dir = scratch("fresh").join("n5-new");
    replace_flashcards(&dir, &[("kanji-flashcards-2026-09-27-4x4.pdf", b"four")]).expect("written");
    assert_eq!(names(&dir), ["kanji-flashcards-2026-09-27-4x4.pdf"]);
    let _ = fs::remove_dir_all(dir.parent().expect("a parent"));
}

#[test]
fn touches_nothing_when_a_name_is_not_a_flashcard_file() {
    let dir = scratch("refuse");
    fs::create_dir_all(&dir).expect("created");
    fs::write(dir.join("kanji-flashcards-2026-09-26-1x1.pdf"), b"old").expect("written");

    assert!(replace_flashcards(&dir, &[("../escape.pdf", b"x")]).is_err());
    assert_eq!(names(&dir), ["kanji-flashcards-2026-09-26-1x1.pdf"]);
    let _ = fs::remove_dir_all(&dir);
}
