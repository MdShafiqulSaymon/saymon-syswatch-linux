// ─────────────────────────────────────────────────────
//  src/metrics.js
//  Reads system metrics directly from /proc — no deps.
//  Linux command equivalents shown for learning mode.
// ─────────────────────────────────────────────────────
'use strict';

const fs = require('fs');

// ── CPU ───────────────────────────────────────────
// Equivalent: cat /proc/stat
// Then compute: (total-idle)/total * 100
let _prevCpu = null;

function _readCpuTicks() {
  const line = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0];
  // cpu  user nice system idle iowait irq softirq steal guest guest_nice
  const vals = line.replace(/^cpu\s+/, '').split(/\s+/).map(Number);
  const idle  = vals[3] + vals[4];           // idle + iowait
  const total = vals.reduce((a, b) => a + b, 0);
  return { idle, total, vals };
}

async function getCpuPercent() {
  const a = _readCpuTicks();
  await new Promise(r => setTimeout(r, 400));
  const b = _readCpuTicks();
  const dTotal = b.total - a.total;
  const dIdle  = b.idle  - a.idle;
  if (dTotal === 0) return 0;
  return +((dTotal - dIdle) / dTotal * 100).toFixed(1);
}

function getCpuInfo() {
  // /proc/cpuinfo — count cores, get model name
  try {
    const info = fs.readFileSync('/proc/cpuinfo', 'utf8');
    const cores = (info.match(/^processor/gm) || []).length;
    const model = info.match(/model name\s*:\s*(.+)/)?.[1]?.trim() || 'Unknown';
    return { cores, model };
  } catch { return { cores: 1, model: 'Unknown' }; }
}

// ── MEMORY ────────────────────────────────────────
// Equivalent: cat /proc/meminfo
function getMemory() {
  const raw = fs.readFileSync('/proc/meminfo', 'utf8');
  const get = key => +(raw.match(new RegExp(key + ':\\s+(\\d+)'))?.[1] || 0);
  const total     = get('MemTotal');
  const available = get('MemAvailable');
  const free      = get('MemFree');
  const cached    = get('Cached');
  const buffers   = get('Buffers');
  const used      = total - available;
  return {
    totalKb: total,
    usedKb: used,
    availableKb: available,
    freeKb: free,
    cachedKb: cached,
    buffersKb: buffers,
    totalMb: +(total / 1024).toFixed(0),
    usedMb:  +(used  / 1024).toFixed(0),
    pct: +((used / total) * 100).toFixed(1),
  };
}

// ── LOAD AVERAGE ──────────────────────────────────
// Equivalent: cat /proc/loadavg
function getLoadAvg() {
  const [m1, m5, m15, procs] = fs.readFileSync('/proc/loadavg', 'utf8').split(' ');
  const [running, total] = (procs || '0/0').split('/');
  return {
    m1: +m1, m5: +m5, m15: +m15,
    runningProcs: +running,
    totalProcs: +total,
  };
}

// ── UPTIME ────────────────────────────────────────
// Equivalent: cat /proc/uptime
function getUptime() {
  const secs = +fs.readFileSync('/proc/uptime', 'utf8').split(' ')[0];
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return { seconds: secs, days: d, hours: h, minutes: m,
           pretty: d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m` : `${m}m` };
}

// ── DISK ──────────────────────────────────────────
// Equivalent: df -h  /  or  cat /proc/mounts + statvfs
function getDiskUsage() {
  try {
    const { execSync } = require('child_process');
    const out = execSync("df -P / 2>/dev/null | tail -1", { encoding: 'utf8' });
    const parts = out.trim().split(/\s+/);
    const total = +parts[1], used = +parts[2], avail = +parts[3];
    return {
      totalKb: total, usedKb: used, availableKb: avail,
      totalGb: +(total / 1024 / 1024).toFixed(1),
      usedGb:  +(used  / 1024 / 1024).toFixed(1),
      pct: +parts[4].replace('%', ''),
      mount: parts[5],
    };
  } catch { return { totalGb: 0, usedGb: 0, pct: 0 }; }
}

// ── DISK I/O ──────────────────────────────────────
// Equivalent: cat /proc/diskstats
let _prevDisk = null;
function getDiskIO() {
  try {
    const lines = fs.readFileSync('/proc/diskstats', 'utf8').split('\n');
    // find first real disk (sda / vda / nvme0n1)
    const line = lines.find(l => /\s(s[dv]a|nvme0n1|xvda)\s/.test(l));
    if (!line) return { readKBs: 0, writeKBs: 0 };
    const p = line.trim().split(/\s+/);
    const reads  = +p[5] * 512;  // sectors read * 512 bytes
    const writes = +p[9] * 512;
    const now = Date.now();
    let readKBs = 0, writeKBs = 0;
    if (_prevDisk) {
      const dt = (now - _prevDisk.ts) / 1000;
      readKBs  = +((reads  - _prevDisk.reads)  / dt / 1024).toFixed(1);
      writeKBs = +((writes - _prevDisk.writes) / dt / 1024).toFixed(1);
    }
    _prevDisk = { reads, writes, ts: now };
    return { readKBs, writeKBs };
  } catch { return { readKBs: 0, writeKBs: 0 }; }
}

// ── NETWORK ───────────────────────────────────────
// Equivalent: cat /proc/net/dev
let _prevNet = null;
function getNetworkIO() {
  try {
    const lines = fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2);
    let rxBytes = 0, txBytes = 0;
    for (const line of lines) {
      const p = line.trim().split(/\s+/);
      if (!p[0] || p[0].startsWith('lo')) continue; // skip loopback
      rxBytes += +p[1];
      txBytes += +p[9];
    }
    const now = Date.now();
    let rxKBs = 0, txKBs = 0;
    if (_prevNet) {
      const dt = (now - _prevNet.ts) / 1000;
      rxKBs = +((rxBytes - _prevNet.rx) / dt / 1024).toFixed(1);
      txKBs = +((txBytes - _prevNet.tx) / dt / 1024).toFixed(1);
    }
    _prevNet = { rx: rxBytes, tx: txBytes, ts: now };
    return { rxKBs, txKBs };
  } catch { return { rxKBs: 0, txKBs: 0 }; }
}

// ── HOSTNAME ──────────────────────────────────────
function getHostname() {
  try { return fs.readFileSync('/etc/hostname', 'utf8').trim(); }
  catch { return require('os').hostname(); }
}

// ── KERNEL ────────────────────────────────────────
// Equivalent: uname -r
function getKernelVersion() {
  try {
    const { execSync } = require('child_process');
    return execSync('uname -r', { encoding: 'utf8' }).trim();
  } catch { return 'unknown'; }
}

// ── ALL METRICS SNAPSHOT ──────────────────────────
async function getSnapshot() {
  const [cpu, cpuInfo, mem, load, uptime, disk, diskIO, net] = await Promise.all([
    getCpuPercent(),
    Promise.resolve(getCpuInfo()),
    Promise.resolve(getMemory()),
    Promise.resolve(getLoadAvg()),
    Promise.resolve(getUptime()),
    Promise.resolve(getDiskUsage()),
    Promise.resolve(getDiskIO()),
    Promise.resolve(getNetworkIO()),
  ]);
  return { cpu, cpuInfo, mem, load, uptime, disk, diskIO, net,
           hostname: getHostname(), kernel: getKernelVersion(),
           ts: Date.now() };
}

module.exports = { getCpuPercent, getCpuInfo, getMemory, getLoadAvg,
                   getUptime, getDiskUsage, getDiskIO, getNetworkIO,
                   getHostname, getKernelVersion, getSnapshot };
