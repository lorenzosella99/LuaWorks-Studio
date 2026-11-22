pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("falha ao iniciar o AI Workbench");
}
