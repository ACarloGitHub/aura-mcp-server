const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// ---------- elements ----------
const $ = (id) => document.getElementById(id);

const els = {
  version: $("version"),
  installDir: $("install-dir"),
  mcpDot: $("mcp-dot"),
  mcpLabel: $("mcp-label"),
  btnStart: $("btn-start"),
  btnStop: $("btn-stop"),
  nomicDot: $("nomic-dot"),
  nomicPath: $("nomic-path"),
  btnDownload: $("btn-download"),
  llamaDot: $("llama-dot"),
  llamaUrl: $("llama-url"),
  lmstudioPath: $("lmstudio-path"),
  lmstudioJson: $("lmstudio-json"),
  anythingllmPath: $("anythingllm-path"),
  anythingllmJson: $("anythingllm-json"),
  anythingllmNoAutoStartJson: $("anythingllm-noautostart-json"),
  chkQuitOnClose: $("chk-quit-on-close"),
  btnBrowse: $("btn-browse"),
  btnUninstall: $("btn-uninstall"),
  downloadOverlay: $("download-overlay"),
  progressBar: $("progress-bar"),
  progressLabel: $("progress-label"),
  progressError: $("progress-error"),
};

// ---------- helpers ----------
function setDot(el, state) {
  el.classList.remove("green", "yellow", "red");
  if (state === "ok") el.classList.add("green");
  else if (state === "warn") el.classList.add("yellow");
  else if (state === "down") el.classList.add("red");
}

function fmtBytes(n) {
  if (!n || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function hostConfigPath(host) {
  if (host === "lmstudio") {
    return navigator.userAgent.includes("Windows")
      ? "%USERPROFILE%\\.lmstudio\\mcp.json"
      : "~/.lmstudio/mcp.json";
  }
  return "<storage>/plugins/anythingllm_mcp_servers.json";
}

function escapeForJson(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildHostJson({ installPath, distIndexPath, workspaceDir, noAutoStart }) {
  const env = {
    AGENT_WORKSPACE: escapeForJson(workspaceDir),
  };
  const serverEntry = {
    command: "node",
    args: [escapeForJson(distIndexPath)],
    env,
  };
  if (noAutoStart) {
    serverEntry.anythingllm = { autoStart: false };
  }
  return JSON.stringify(
    {
      mcpServers: {
        "auramcp-server": serverEntry,
      },
    },
    null,
    2,
  );
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for non-secure contexts: select + execCommand
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }
}

function flashCopied(span) {
  span.classList.remove("hidden");
  setTimeout(() => span.classList.add("hidden"), 1500);
}

// ---------- status refresh ----------
let lastStatus = null;

async function refreshStatus() {
  try {
    const s = await invoke("get_status");
    lastStatus = s;

    // Server
    setDot(els.mcpDot, s.mcpRunning ? "ok" : "down");
    els.mcpLabel.textContent = s.mcpRunning ? "Running" : "Stopped";
    els.btnStart.disabled = !!s.mcpRunning;
    els.btnStop.disabled = !s.mcpRunning;

    // Nomic
    setDot(els.nomicDot, s.rag.nomicPresent ? "ok" : "down");
    els.nomicPath.textContent = s.rag.nomicPath;
    els.btnDownload.classList.toggle("hidden", !!s.rag.nomicPresent);

    // Llama
    setDot(els.llamaDot, s.rag.llamaReachable ? "ok" : "warn");
    els.llamaUrl.textContent = s.rag.llamaUrl;

    // Quit-on-close preference
    els.chkQuitOnClose.checked = !!s.quitOnClose;

    // Footer
    els.installDir.textContent = `Installed at ${s.installDir}`;
  } catch (e) {
    console.error("refreshStatus", e);
  }
}

async function refreshHostJson() {
  try {
    const p = await invoke("get_install_paths");
    const workspace = p.workspace_source === "env" ? p.workspace_default : p.workspace_default;
    const lmstudio = buildHostJson({
      installPath: p.install_dir,
      distIndexPath: p.dist_index_path,
      workspaceDir: workspace,
    });
    const allm = buildHostJson({
      installPath: p.install_dir,
      distIndexPath: p.dist_index_path,
      workspaceDir: workspace,
    });
    const allmNoAuto = buildHostJson({
      installPath: p.install_dir,
      distIndexPath: p.dist_index_path,
      workspaceDir: workspace,
      noAutoStart: true,
    });
    els.lmstudioJson.textContent = lmstudio;
    els.anythingllmJson.textContent = allm;
    els.anythingllmNoAutoStartJson.textContent = allmNoAuto;
    els.lmstudioPath.textContent = hostConfigPath("lmstudio");
    els.anythingllmPath.textContent = hostConfigPath("anythingllm");
  } catch (e) {
    console.error("refreshHostJson", e);
  }
}

// ---------- download overlay ----------
function showDownloadOverlay() {
  els.downloadOverlay.classList.remove("hidden");
  els.progressBar.style.width = "0%";
  els.progressLabel.textContent = "Starting…";
  els.progressError.classList.add("hidden");
  els.progressError.textContent = "";
  els.mainPanel && (els.mainPanel.style.opacity = "0.4");
}

function hideDownloadOverlay() {
  els.downloadOverlay.classList.add("hidden");
  els.mainPanel && (els.mainPanel.style.opacity = "1");
}

function onProgress(p) {
  const pct = Math.max(0, Math.min(100, p.percent || 0));
  els.progressBar.style.width = `${pct}%`;
  const dl = fmtBytes(p.downloaded);
  const tt = p.total > 0 ? fmtBytes(p.total) : "?";
  els.progressLabel.textContent = `${dl} / ${tt} (${pct}%)`;
}

function onFinished(f) {
  if (f.ok) {
    setTimeout(hideDownloadOverlay, 600);
    refreshStatus();
  } else {
    els.progressError.textContent = f.error || "Download failed";
    els.progressError.classList.remove("hidden");
  }
}

// ---------- tab switching ----------
function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".tab-panel");
  tabs.forEach((t) => {
    t.addEventListener("click", () => {
      const target = t.dataset.tab;
      tabs.forEach((x) => x.classList.toggle("active", x === t));
      panels.forEach((p) => p.classList.toggle("active", p.dataset.tab === target));
    });
  });
}

// ---------- copy buttons ----------
function setupCopyButtons() {
  document.querySelectorAll("button[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const targetId = btn.dataset.copy;
      const target = document.getElementById(targetId);
      const span = btn.nextElementSibling;
      const ok = await copyToClipboard(target.textContent || "");
      if (ok && span && span.id && span.id.endsWith("-copied")) {
        flashCopied(span);
      }
    });
  });
}

// ---------- start/stop/download ----------
function setupButtons() {
  els.btnStart.addEventListener("click", async () => {
    els.btnStart.disabled = true;
    try {
      await invoke("start_server");
    } catch (e) {
      alert(`Could not start server: ${e}`);
    }
    refreshStatus();
  });

  els.btnStop.addEventListener("click", async () => {
    els.btnStop.disabled = true;
    try {
      await invoke("stop_server");
    } catch (e) {
      alert(`Could not stop server: ${e}`);
    }
    refreshStatus();
  });

  els.btnDownload.addEventListener("click", async () => {
    showDownloadOverlay();
    try {
      await invoke("download_nomic");
    } catch (e) {
      els.progressError.textContent = String(e);
      els.progressError.classList.remove("hidden");
    }
  });

  els.btnBrowse.addEventListener("click", async () => {
    try {
      await invoke("open_server_folder");
    } catch (e) {
      alert(`Could not open folder: ${e}`);
    }
  });

  els.chkQuitOnClose.addEventListener("change", async () => {
    try {
      await invoke("set_quit_on_close", { quit: els.chkQuitOnClose.checked });
    } catch (e) {
      console.error("set_quit_on_close", e);
    }
  });

  els.btnUninstall.addEventListener("click", async () => {
    if (
      !confirm(
        "Uninstall AuraMCP?\n\nOn Windows the bundled uninstaller will start; it asks whether to remove your local data too.\n\nOn macOS / Linux this will open the standard system uninstall flow.",
      )
    ) {
      return;
    }
    els.btnUninstall.disabled = true;
    try {
      await invoke("uninstall_app");
      // On Windows the launcher exits by itself after spawning the
      // uninstaller, so we never reach this line in practice. The
      // catch below is for macOS / Linux where the backend returns an
      // error explaining the user must do it manually.
    } catch (e) {
      alert(
        `Self-uninstall is not available on this platform.\n\n${e}\n\nSee the "Uninstall" section of documentation/setup.md for the manual steps.`,
      );
      els.btnUninstall.disabled = false;
    }
  });
}

// ---------- events ----------
async function setupEvents() {
  await listen("nomic-progress", (ev) => onProgress(ev.payload));
  await listen("nomic-finished", (ev) => onFinished(ev.payload));
  await listen("server-status", (ev) => {
    if (ev.payload && typeof ev.payload.running === "boolean") {
      refreshStatus();
    }
  });
}

// ---------- version label ----------
const tauriInternals = window.__TAURI__;
if (tauriInternals && tauriInternals.app) {
  tauriInternals.app
    .getVersion()
    .then((v) => {
      els.version.textContent = `v${v}`;
    })
    .catch(() => {
      els.version.textContent = "v?";
    });
}

// ---------- init ----------
(async () => {
  setupTabs();
  setupCopyButtons();
  setupButtons();
  await setupEvents();
  await refreshHostJson();
  await refreshStatus();
  setInterval(refreshStatus, 5000);
})();