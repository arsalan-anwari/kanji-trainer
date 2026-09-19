fn main() {
    let target = std::env::var("TARGET").unwrap_or_default();
    if target == "aarch64-linux-android" || target == "x86_64-linux-android" {
        println!("cargo:rustc-link-arg=-Wl,-z,max-page-size=16384");
        println!("cargo:rustc-link-arg=-Wl,-z,common-page-size=16384");
    }

    tauri_build::build();
}
