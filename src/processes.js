// ─────────────────────────────────────────────────────
//  src/processes.js
//  Reads /proc/<PID>/* directly — no external tools.
//  Equivalent: ps aux --sort=-%cpu
// ─────────────────────────────────────────────────────
'use strict';

const fs   = require('fs');
const path = require('path');

// ── uid → username cache ──────────────────────────
const _userCache = {};
function uidToUser(uid) {
  if (_userCache[uid]) return _userCache[uid];
  try {
    const passwd = fs.readFileSync('/etc/passwd', 'utf8');
    const line   = passwd.split('\n').find(l => l.split(':')[2] === String(uid));
    const name   = line ? line.split(':')[0] : String(uid);
    _userCache[uid] = name;
    return name;
  } catch { return String(uid); }
}

// ── per-process CPU ticks ─────────────────────────
// /proc/<pid>/stat — field 14 utime, field 15 stime
let _prevProcs = {};
function _readProcStat(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    // comm field can contain spaces and parens, find last ) to parse safely
    const rest = stat.slice(stat.lastIndexOf(')') + 2).trim().split(' ');
    const utime = +rest[11];  // field 14 (0-indexed from after comm)
    const stime = +rest[12];  // field 15
    return { ticks: utime + stime };
  } catch { return null; }
}

// ── system total CPU ticks ────────────────────────
function _totalCpuTicks() {
  const line = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0];
  return line.replace(/^cpu\s+/, '').split(/\s+/).map(Number)
             .reduce((a, b) => a + b, 0);
}

// ── get all processes ─────────────────────────────
function getProcesses() {
  const pids = fs.readdirSync('/proc').filter(d => /^\d+$/.test(d));
  const totalCpu = _totalCpuTicks();
  const procs    = [];

  for (const pid of pids) {
    try {
      // Name from /proc/pid/comm
      const comm = fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim();

      // Status for user, memory, state
      const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
      const get = (k) => status.match(new RegExp(k + ':\\s+(.+)'))?.[1]?.trim();

      const uid   = +get('Uid')?.split(/\s+/)[0] || 0;
      const vmRss = +(get('VmRSS')?.replace(/\s*kB/, '') || 0); // kb
      const state = get('State')?.[0] || '?';
      const ppid  = +get('PPid') || 0;
      const threads = +get('Threads') || 1;

      // CPU % via comparing ticks
      const cur   = _readProcStat(pid);
      const prev  = _prevProcs[pid];
      let cpuPct  = 0;
      if (cur && prev && totalCpu > prev.totalCpu) {
        cpuPct = +((cur.ticks - prev.ticks) / (totalCpu - prev.totalCpu) * 100).toFixed(1);
      }
      _prevProcs[pid] = { ticks: cur?.ticks || 0, totalCpu };

      // Cmdline (full command)
      let cmdline = '';
      try {
        cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8')
                    .replace(/\0/g, ' ').trim();
      } catch {}

      // VmSize from status
      const vmSize = +(get('VmSize')?.replace(/\s*kB/, '') || 0);

      procs.push({
        pid: +pid, ppid, name: comm, cmdline: cmdline || comm,
        user: uidToUser(uid), uid,
        state,
        cpu: Math.max(0, cpuPct),
        memKb: vmRss, memMb: +(vmRss / 1024).toFixed(1),
        vszKb: vmSize, vszMb: +(vmSize / 1024).toFixed(0),
        threads,
      });
    } catch {
      // process may have died mid-read — skip silently
    }
  }

  // Clean up stale entries
  const pidSet = new Set(pids);
  for (const k of Object.keys(_prevProcs)) {
    if (!pidSet.has(k)) delete _prevProcs[k];
  }

  return procs.sort((a, b) => b.cpu - a.cpu);
}

// ── kill a process ────────────────────────────────
// Equivalent: kill -<signal> <pid>
function killProcess(pid, signal = 15) {
  const allowed = [9, 15, 1, 2, 3];
  if (!allowed.includes(+signal)) throw new Error('Signal not allowed');
  if (+pid <= 1) throw new Error('Cannot kill PID 1');
  try {
    process.kill(+pid, +signal);
    return { ok: true, message: `Sent signal ${signal} to PID ${pid}` };
  } catch (e) {
    throw new Error(`kill failed: ${e.message}`);
  }
}

module.exports = { getProcesses, killProcess };
