// TempCore Monitor — frontend polling logic
// Uses window.__TAURI__.core.invoke (injected by Tauri at runtime)

const invoke = window.__TAURI__?.core?.invoke;

// ── Helpers ──────────────────────────────────────────────────

function tempColor(c) {
  if (c == null) return 'var(--muted-2)';
  if (c < 60)   return 'var(--safe)';
  if (c < 75)   return 'var(--warm)';
  if (c < 85)   return 'var(--hot)';
  return 'var(--critical)';
}

function usageColor(pct) {
  if (pct < 60) return 'var(--safe)';
  if (pct < 80) return 'var(--warm)';
  return 'var(--hot)';
}

function setBar(id, pct, color) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.width = Math.min(100, Math.max(0, pct)) + '%';
  el.style.background = color;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? '-';
}

function fmtMB(mb) {
  return mb >= 1024
    ? (mb / 1024).toFixed(1) + ' GB'
    : mb.toFixed(0) + ' MB';
}

function fmtMHz(mhz) {
  return mhz >= 1000
    ? (mhz / 1000).toFixed(2) + ' GHz'
    : mhz + ' MHz';
}

// ── CPU ───────────────────────────────────────────────────────

function updateCpu(cpu) {
  setText('cpu-name', cpu.name);
  setText('cpu-usage', cpu.usage_percent.toFixed(1) + '%');
  setText('cpu-clock', fmtMHz(cpu.frequency_mhz));
  setText('cpu-cores', cpu.cores + ' cores / ' + cpu.per_core_usage.length + ' threads');

  setBar('cpu-usage-bar', cpu.usage_percent, usageColor(cpu.usage_percent));

  if (cpu.temperature_c != null) {
    setText('cpu-temp', cpu.temperature_c.toFixed(0) + '°C');
    const maxTemp = 100;
    setBar('cpu-temp-bar', (cpu.temperature_c / maxTemp) * 100, tempColor(cpu.temperature_c));
  } else {
    setText('cpu-temp', 'N/A');
    setBar('cpu-temp-bar', 0, 'var(--muted)');
  }

  buildCoreGrid(cpu.per_core_usage);
}

function buildCoreGrid(cores) {
  const grid = document.getElementById('cores-grid');
  if (!grid) return;

  if (grid.children.length !== cores.length) {
    grid.innerHTML = cores.map((_, i) => `
      <div class="core-col">
        <div class="core-bar-bg">
          <div class="core-bar-fill" id="core-${i}" style="height:0%"></div>
        </div>
        <span class="core-num">${i + 1}</span>
      </div>`).join('');
  }

  cores.forEach((pct, i) => {
    const fill = document.getElementById('core-' + i);
    if (fill) {
      fill.style.height = Math.min(100, Math.max(0, pct)) + '%';
      fill.style.background = usageColor(pct);
      fill.style.opacity = '0.75';
    }
  });
}

// ── GPU ───────────────────────────────────────────────────────

function updateGpu(gpu) {
  const body = document.getElementById('gpu-body');
  if (!body) return;

  if (!gpu.available) {
    setText('gpu-name', '');
    body.innerHTML = `
      <div class="no-gpu">
        <div class="no-gpu-icon">◈</div>
        <div class="no-gpu-text">${gpu.name}<br>
          <span style="font-size:0.58rem;color:var(--muted);">Install NVIDIA drivers for GPU stats</span>
        </div>
      </div>`;
    return;
  }

  setText('gpu-name', gpu.name);

  const vramPct = (gpu.vram_used_mb != null && gpu.vram_total_mb)
    ? (gpu.vram_used_mb / gpu.vram_total_mb) * 100
    : 0;

  body.innerHTML = `
    <div class="stat-row">
      <span class="stat-label">Temp</span>
      <div class="bar-wrap"><div class="bar" id="gpu-temp-bar"></div></div>
      <span class="stat-value" id="gpu-temp">-</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">Usage</span>
      <div class="bar-wrap"><div class="bar" id="gpu-usage-bar"></div></div>
      <span class="stat-value" id="gpu-usage">-</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">VRAM</span>
      <div class="bar-wrap"><div class="bar" id="gpu-vram-bar"></div></div>
      <span class="stat-value" id="gpu-vram">-</span>
    </div>
    <div class="gpu-grid">
      <div class="gpu-detail">
        <span class="gpu-detail-label">Core Clock</span>
        <span class="gpu-detail-value" id="gpu-clock">-</span>
      </div>
      <div class="gpu-detail">
        <span class="gpu-detail-label">Mem Clock</span>
        <span class="gpu-detail-value" id="gpu-mem-clock">-</span>
      </div>
      <div class="gpu-detail">
        <span class="gpu-detail-label">Power Draw</span>
        <span class="gpu-detail-value" id="gpu-power">-</span>
      </div>
      <div class="gpu-detail">
        <span class="gpu-detail-label">Fan Speed</span>
        <span class="gpu-detail-value" id="gpu-fan">-</span>
      </div>
    </div>`;

  if (gpu.temperature_c != null) {
    setText('gpu-temp', gpu.temperature_c + '°C');
    setBar('gpu-temp-bar', (gpu.temperature_c / 100) * 100, tempColor(gpu.temperature_c));
  }
  if (gpu.usage_percent != null) {
    setText('gpu-usage', gpu.usage_percent + '%');
    setBar('gpu-usage-bar', gpu.usage_percent, usageColor(gpu.usage_percent));
  }
  if (gpu.vram_used_mb != null && gpu.vram_total_mb != null) {
    setText('gpu-vram', fmtMB(gpu.vram_used_mb) + ' / ' + fmtMB(gpu.vram_total_mb));
    setBar('gpu-vram-bar', vramPct, usageColor(vramPct));
  }
  if (gpu.clock_mhz != null)     setText('gpu-clock',     fmtMHz(gpu.clock_mhz));
  if (gpu.mem_clock_mhz != null) setText('gpu-mem-clock', fmtMHz(gpu.mem_clock_mhz));
  if (gpu.power_draw_w != null)  setText('gpu-power',     gpu.power_draw_w.toFixed(1) + ' W');
  if (gpu.fan_speed_percent != null) setText('gpu-fan',   gpu.fan_speed_percent + '%');
}

// ── RAM ───────────────────────────────────────────────────────

function updateRam(ram) {
  const freeMb = ram.total_mb - ram.used_mb;
  setText('ram-total', fmtMB(ram.total_mb) + ' RAM');
  setText('ram-used',  fmtMB(ram.used_mb));
  setText('ram-free',  fmtMB(freeMb));
  setText('ram-pct',   ram.usage_percent.toFixed(1) + '%');
  setBar('ram-bar', ram.usage_percent, usageColor(ram.usage_percent));
}

// ── Disks ─────────────────────────────────────────────────────

function updateDisks(disks) {
  const list = document.getElementById('disk-list');
  if (!list) return;

  if (!disks || disks.length === 0) {
    list.innerHTML = '<span style="font-family:var(--mono);font-size:0.7rem;color:var(--muted);">No drives detected</span>';
    return;
  }

  list.innerHTML = disks.map(d => `
    <div class="disk-item">
      <div class="disk-header">
        <span class="disk-name">${d.name}</span>
        <span class="disk-sizes">${d.used_gb.toFixed(0)} / ${d.total_gb.toFixed(0)} GB</span>
      </div>
      <div class="disk-bar-wrap">
        <div class="disk-bar" style="width:${d.usage_percent.toFixed(1)}%;
          background:${d.usage_percent > 85 ? 'var(--hot)' : 'var(--accent)'}"></div>
      </div>
    </div>`).join('');
}

// ── Status bar ────────────────────────────────────────────────

function setStatus(ok) {
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  if (!dot || !text) return;
  if (ok) {
    dot.className = 'status-dot';
    text.innerHTML = '<span class="status-dot" id="status-dot"></span>Live';
  } else {
    dot.className = 'status-dot connecting';
    text.innerHTML = '<span class="status-dot connecting" id="status-dot"></span>Reconnecting...';
  }
}

// ── Main polling loop ─────────────────────────────────────────

async function poll() {
  if (!invoke) {
    setStatus(false);
    // Running in browser (dev mode): show placeholder so layout renders
    console.warn('Tauri invoke not available. Run via: npm run tauri dev');
    return;
  }

  try {
    const stats = await invoke('get_all_stats');
    updateCpu(stats.cpu);
    updateGpu(stats.gpu);
    updateRam(stats.ram);
    updateDisks(stats.disks);
    setStatus(true);
  } catch (err) {
    console.error('get_all_stats failed:', err);
    setStatus(false);
  }
}

// First call immediately, then every second
poll();
setInterval(poll, 1000);
