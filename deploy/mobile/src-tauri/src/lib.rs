#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "android")]
    {
        android_logger::init_once(
            android_logger::Config::default()
                .with_max_level(log::LevelFilter::Debug)
                .with_tag("RustRedViewer"),
        );
    }

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![discover_backend, get_local_ip])
        .run(tauri::generate_context!())
        .expect("error while running redViewer mobile");
}

#[tauri::command]
fn discover_backend(_app: tauri::AppHandle) -> Result<String, String> {
    use std::io::ErrorKind;
    use std::net::UdpSocket;
    use std::time::{Duration, Instant};

    #[cfg(target_os = "android")]
    log::info!("🔍 discover_backend 被调用");

    const DISCOVERY_PORT: u16 = 12345;
    const DISCOVER_PAYLOAD: &[u8] = br#"{"type":"discover","app":"redViewer"}"#;

    // MulticastLock is already acquired in MainActivity.onCreate()
    // No need to acquire it again here to avoid binder conflicts

    let result = (|| -> Result<String, String> {
        #[cfg(target_os = "android")]
        log::info!("🔌 创建 UDP socket...");

        let socket = UdpSocket::bind("0.0.0.0:0").map_err(|err| {
            #[cfg(target_os = "android")]
            log::error!("❌ bind 失败: {}", err);
            err.to_string()
        })?;

        #[cfg(target_os = "android")]
        log::info!("✅ socket bind 成功");

        socket.set_broadcast(true).map_err(|err| {
            #[cfg(target_os = "android")]
            log::error!("❌ set_broadcast 失败: {}", err);
            err.to_string()
        })?;

        #[cfg(target_os = "android")]
        log::info!("✅ broadcast 已启用");

        socket
            .set_read_timeout(Some(Duration::from_millis(350)))
            .map_err(|err| err.to_string())?;

        #[cfg(target_os = "android")]
        log::info!("📤 发送 UDP 广播到 255.255.255.255:{}", DISCOVERY_PORT);

        socket
            .send_to(DISCOVER_PAYLOAD, ("255.255.255.255", DISCOVERY_PORT))
            .map_err(|err| {
                #[cfg(target_os = "android")]
                log::error!("❌ send_to 失败: {}", err);
                err.to_string()
            })?;

        #[cfg(target_os = "android")]
        log::info!("✅ UDP 广播已发送，等待响应...");

        let deadline = Instant::now() + Duration::from_millis(2200);
        let mut buf = [0_u8; 1024];
        while Instant::now() < deadline {
            match socket.recv_from(&mut buf) {
                Ok((len, addr)) => {
                    let text = String::from_utf8_lossy(&buf[..len]);
                    #[cfg(target_os = "android")]
                    log::info!("📥 收到响应来自 {}: {}", addr, text);

                    if text.contains(r#""type":"announce""#) && text.contains(r#""app":"redViewer""#) {
                        let url = format!("http://{}:{}", addr.ip(), DISCOVERY_PORT);
                        #[cfg(target_os = "android")]
                        log::info!("🎉 发现后端: {}", url);
                        return Ok(url);
                    }
                }
                Err(err) if matches!(err.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {}
                Err(err) => {
                    #[cfg(target_os = "android")]
                    log::error!("❌ recv_from 错误: {}", err);
                    return Err(err.to_string());
                }
            }
        }

        #[cfg(target_os = "android")]
        log::warn!("⏰ 超时：未发现局域网后端");
        Err("未发现局域网后端".into())
    })();

    // MulticastLock will be released in MainActivity.onDestroy()
    // No manual release needed here

    result
}

#[tauri::command]
fn get_local_ip() -> Result<String, String> {
    use std::net::UdpSocket;

    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|err| err.to_string())?;
    socket
        .connect("8.8.8.8:80")
        .map_err(|err| err.to_string())?;
    let addr = socket.local_addr().map_err(|err| err.to_string())?;
    Ok(addr.ip().to_string())
}
