use serde::Serialize;
use sysinfo::{Components, Disks, System};

// ── Data types sent to the frontend ─────────────────────────

#[derive(Serialize, Clone, Debug)]
pub struct CpuStats {
    pub name: String,
    pub cores: usize,
    pub usage_percent: f32,
    pub per_core_usage: Vec<f32>,
    pub frequency_mhz: u64,
    pub temperature_c: Option<f32>,
}

#[derive(Serialize, Clone, Debug)]
pub struct GpuStats {
    pub available: bool,
    pub name: String,
    pub temperature_c: Option<u32>,
    pub usage_percent: Option<u32>,
    pub clock_mhz: Option<u32>,
    pub mem_clock_mhz: Option<u32>,
    pub vram_used_mb: Option<u64>,
    pub vram_total_mb: Option<u64>,
    pub power_draw_w: Option<f64>,
    pub fan_speed_percent: Option<u32>,
}

#[derive(Serialize, Clone, Debug)]
pub struct RamStats {
    pub total_mb: u64,
    pub used_mb: u64,
    pub usage_percent: f32,
}

#[derive(Serialize, Clone, Debug)]
pub struct DiskInfo {
    pub name: String,
    pub total_gb: f64,
    pub used_gb: f64,
    pub usage_percent: f32,
}

#[derive(Serialize, Clone, Debug)]
pub struct AllStats {
    pub cpu: CpuStats,
    pub gpu: GpuStats,
    pub ram: RamStats,
    pub disks: Vec<DiskInfo>,
}

// ── CPU ─────────────────────────────────────────────────────

pub fn read_cpu(sys: &System) -> CpuStats {
    let cpus = sys.cpus();

    let name = cpus
        .first()
        .map(|c| c.brand().trim().to_string())
        .unwrap_or_else(|| "Unknown CPU".to_string());

    let usage_percent = sys.global_cpu_usage();

    let per_core_usage: Vec<f32> = cpus.iter().map(|c| c.cpu_usage()).collect();

    let frequency_mhz = cpus.first().map(|c| c.frequency()).unwrap_or(0);

    let cores = sys.physical_core_count().unwrap_or(cpus.len());

    // Try to find CPU temperature from thermal components.
    // On Windows this reads from MSAcpi_ThermalZoneTemperature via WMI.
    // Returns None on systems where the sensor isn't exposed.
    let components = Components::new_with_refreshed_list();
    let temperature_c = components
        .iter()
        .find(|c| {
            let label = c.label().to_lowercase();
            label.contains("cpu")
                || label.contains("package")
                || label.contains("tctl")
                || label.contains("core")
        })
        .map(|c| c.temperature());

    CpuStats {
        name,
        cores,
        usage_percent,
        per_core_usage,
        frequency_mhz,
        temperature_c,
    }
}

// ── RAM ─────────────────────────────────────────────────────

pub fn read_ram(sys: &System) -> RamStats {
    let total_mb = sys.total_memory() / 1_048_576;
    let used_mb = sys.used_memory() / 1_048_576;
    let usage_percent = if total_mb > 0 {
        (used_mb as f32 / total_mb as f32) * 100.0
    } else {
        0.0
    };

    RamStats {
        total_mb,
        used_mb,
        usage_percent,
    }
}

// ── Disks ────────────────────────────────────────────────────

pub fn read_disks() -> Vec<DiskInfo> {
    let disks = Disks::new_with_refreshed_list();
    disks
        .iter()
        .filter(|d| d.total_space() > 0)
        .map(|d| {
            let total_gb = d.total_space() as f64 / 1_073_741_824.0;
            let used_gb =
                (d.total_space().saturating_sub(d.available_space())) as f64 / 1_073_741_824.0;
            let usage_percent = if total_gb > 0.0 {
                (used_gb / total_gb * 100.0) as f32
            } else {
                0.0
            };
            DiskInfo {
                name: d.name().to_string_lossy().into_owned(),
                total_gb,
                used_gb,
                usage_percent,
            }
        })
        .collect()
}

// ── GPU (NVIDIA via NVML) ────────────────────────────────────

#[cfg(target_os = "windows")]
pub fn read_gpu() -> GpuStats {
    use nvml_wrapper::{
        enum_wrappers::device::{Clock, TemperatureSensor},
        Nvml,
    };

    let unavailable = |reason: &str| GpuStats {
        available: false,
        name: reason.to_string(),
        temperature_c: None,
        usage_percent: None,
        clock_mhz: None,
        mem_clock_mhz: None,
        vram_used_mb: None,
        vram_total_mb: None,
        power_draw_w: None,
        fan_speed_percent: None,
    };

    let nvml = match Nvml::init() {
        Ok(n) => n,
        // NVML not present = no NVIDIA driver installed
        Err(_) => return unavailable("No NVIDIA GPU / driver not found"),
    };

    let device = match nvml.device_by_index(0) {
        Ok(d) => d,
        Err(_) => return unavailable("NVIDIA GPU not accessible"),
    };

    let name = device.name().unwrap_or_else(|_| "NVIDIA GPU".to_string());
    let temperature_c = device.temperature(TemperatureSensor::Gpu).ok();
    let usage_percent = device.utilization_rates().ok().map(|u| u.gpu);
    let clock_mhz = device.clock_info(Clock::Graphics).ok();
    let mem_clock_mhz = device.clock_info(Clock::Memory).ok();
    let mem = device.memory_info().ok();
    let vram_used_mb = mem.as_ref().map(|m| m.used / 1_048_576);
    let vram_total_mb = mem.as_ref().map(|m| m.total / 1_048_576);
    // power_usage() returns milliwatts
    let power_draw_w = device.power_usage().ok().map(|mw| mw as f64 / 1000.0);
    let fan_speed_percent = device.fan_speed(0).ok();

    GpuStats {
        available: true,
        name,
        temperature_c,
        usage_percent,
        clock_mhz,
        mem_clock_mhz,
        vram_used_mb,
        vram_total_mb,
        power_draw_w,
        fan_speed_percent,
    }
}

// Stub for non-Windows (Mac dev environment)
#[cfg(not(target_os = "windows"))]
pub fn read_gpu() -> GpuStats {
    GpuStats {
        available: false,
        name: "GPU monitoring: Windows only".to_string(),
        temperature_c: None,
        usage_percent: None,
        clock_mhz: None,
        mem_clock_mhz: None,
        vram_used_mb: None,
        vram_total_mb: None,
        power_draw_w: None,
        fan_speed_percent: None,
    }
}
