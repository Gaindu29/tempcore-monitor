use std::sync::Mutex;
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};

mod sensors;
use sensors::AllStats;

struct AppState {
    system: Mutex<System>,
}

#[tauri::command]
fn get_all_stats(state: tauri::State<AppState>) -> AllStats {
    let mut sys = state.system.lock().unwrap();

    // Refresh CPU and memory. Disk and GPU are refreshed inside their
    // respective read functions since they manage their own state.
    sys.refresh_cpu_all();
    sys.refresh_memory_specifics(MemoryRefreshKind::everything());

    AllStats {
        cpu: sensors::read_cpu(&sys),
        gpu: sensors::read_gpu(),
        ram: sensors::read_ram(&sys),
        disks: sensors::read_disks(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Create and do an initial full refresh so the first
    // call to get_all_stats() has delta data for CPU usage.
    let mut system = System::new_with_specifics(
        RefreshKind::new()
            .with_cpu(CpuRefreshKind::everything())
            .with_memory(MemoryRefreshKind::everything()),
    );
    system.refresh_specifics(
        RefreshKind::new()
            .with_cpu(CpuRefreshKind::everything())
            .with_memory(MemoryRefreshKind::everything()),
    );

    tauri::Builder::default()
        .manage(AppState {
            system: Mutex::new(system),
        })
        .invoke_handler(tauri::generate_handler![get_all_stats])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
