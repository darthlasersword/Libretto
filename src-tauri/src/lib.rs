use std::{io::{BufRead, BufReader}, process::{Child, Command, Stdio}, sync::Mutex};
use tauri::Manager;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

struct Backend(Mutex<Option<Child>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, _, _| {
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
      }
    }))
    .manage(Backend(Mutex::new(None)))
    .setup(|app| {
      #[cfg(debug_assertions)]
      let url = "http://127.0.0.1:4173".parse()?;
      #[cfg(not(debug_assertions))]
      let url = {
        let data = app.path().app_local_data_dir()?;
        std::fs::create_dir_all(&data)?;
        let exe = data.join("rune-server.exe");
        let bytes = include_bytes!("../binaries/rune-server.exe");
        if std::fs::read(&exe).map(|v| v != bytes.as_slice()).unwrap_or(true) {
          std::fs::write(&exe, bytes)?;
        }
        let mut command = Command::new(exe);
        command.env("RUNE_DATA_FILE", data.join("data/scripts.json"))
          .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        let mut child = command.spawn()?;
        let stdout = child.stdout.take().ok_or("Missing server stdout")?;
        *app.state::<Backend>().0.lock().unwrap() = Some(child);
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
          let mut line = String::new();
          let result = BufReader::new(stdout).read_line(&mut line).map(|_| line);
          let _ = tx.send(result);
        });
        let address = rx.recv_timeout(std::time::Duration::from_secs(30))??;
        address.trim().parse()?
      };
      tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::External(url))
        .initialization_script(if cfg!(target_os = "windows") {
          "window.__RUNE_WINDOWS_DESKTOP__ = true;"
        } else { "" })
        .icon(tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))?)?
        .title("Rune").inner_size(1100.0, 760.0).build()?;
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("Unable to start Rune");
  app.run(|handle, event| {
    if matches!(event, tauri::RunEvent::Exit) {
      if let Some(mut child) = handle.state::<Backend>().0.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
      }
    }
  });
}
