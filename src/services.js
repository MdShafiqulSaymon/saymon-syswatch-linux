// ─────────────────────────────────────────────────────
//  src/services.js
//  Wraps systemctl commands via child_process.
//  Equivalent terminal commands shown in comments.
// ─────────────────────────────────────────────────────
'use strict';

const { exec, execSync } = require('child_process');
const { promisify }      = require('util');
const execP              = promisify(exec);

// ── list all service units ─────────────────────────
// Equivalent: systemctl list-units --type=service --all --output=json
async function listServices() {
  try {
    const { stdout } = await execP(
      'systemctl list-units --type=service --all --output=json --no-pager 2>/dev/null'
    );
    const units = JSON.parse(stdout);
    // enrich each unit with memory + PID from systemctl show
    const enriched = await Promise.all(
      units.slice(0, 40).map(async u => { // limit to 40 to avoid slowness
        try {
          const info = await getServiceInfo(u.unit);
          return { ...u, ...info };
        } catch { return u; }
      })
    );
    return enriched;
  } catch (e) {
    throw new Error('systemctl not available: ' + e.message);
  }
}

// ── get PID + memory for one service ──────────────
// Equivalent: systemctl show nginx.service --property=MainPID,MemoryCurrent,ActiveState
async function getServiceInfo(name) {
  const props = 'MainPID,MemoryCurrent,ActiveState,SubState,ExecMainStartTimestamp';
  const { stdout } = await execP(
    `systemctl show "${name}" --property=${props} --no-pager 2>/dev/null`
  );
  const obj = {};
  stdout.trim().split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    obj[k] = v.join('=');
  });
  return {
    pid:       obj.MainPID === '0' ? null : +obj.MainPID,
    memBytes:  obj.MemoryCurrent === '[not set]' ? 0 : +obj.MemoryCurrent || 0,
    memMb:     obj.MemoryCurrent === '[not set]' ? '—'
               : +(+obj.MemoryCurrent / 1024 / 1024).toFixed(1) + ' MB',
    activeState: obj.ActiveState,
    subState:    obj.SubState,
    startedAt:   obj.ExecMainStartTimestamp || '',
  };
}

// ── service control (requires sudo/root) ──────────
// Equivalent: systemctl start|stop|restart|reload <unit>
async function controlService(name, action) {
  const allowed = ['start', 'stop', 'restart', 'reload', 'enable', 'disable'];
  if (!allowed.includes(action)) throw new Error('Invalid action: ' + action);
  // sanitize name — only allow alphanumeric, hyphen, dot, @
  if (!/^[\w.\-@]+\.service$/.test(name)) throw new Error('Invalid unit name');
  const { stdout, stderr } = await execP(
    `systemctl ${action} "${name}" 2>&1`
  );
  return { ok: true, output: stdout + stderr };
}

// ── journal logs for a unit ───────────────────────
// Equivalent: journalctl -u nginx.service -n 100 -o json --no-pager
async function getServiceLogs(name, lines = 100) {
  if (!/^[\w.\-@]+\.service$/.test(name)) throw new Error('Invalid unit name');
  const { stdout } = await execP(
    `journalctl -u "${name}" -n ${lines} -o json --no-pager 2>/dev/null`
  );
  return stdout.trim().split('\n')
    .filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

module.exports = { listServices, getServiceInfo, controlService, getServiceLogs };
