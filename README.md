# SysWatch 🖥️

**Linux system monitor + learning dashboard** — install it, run it, done.

Monitor CPU, memory, disk, services, journal logs and processes from a web UI.
Every panel shows the exact Linux commands being used — so you **learn while you monitor**.

---

## ⚡ Install & Run (3 steps)

```bash
# Step 1 — Install
sudo npm install -g syswatch

# Step 2 — Run (first time auto-runs setup wizard)
sudo syswatch

# Step 3 — Open browser
# http://localhost:8080
```

**That's it.** On first run, a setup wizard asks you 4 simple questions in the terminal — including your password — and creates the config file automatically.

---

## 🧙 First-Run Setup Wizard

When you run SysWatch for the first time (no config found), it automatically starts an interactive wizard:

```
╭──────────────────────────────────────────────────────╮
│   SysWatch — First Time Setup                        │
│   Takes about 30 seconds ⚡                          │
╰──────────────────────────────────────────────────────╯

Step 1/4 — Set your login password
  Enter password: ********
  Confirm password: ********
  ✓ Password set!

Step 2/4 — HTTP Port
  Port [8080]: (press Enter for default)
  ✓ HTTP port: 8080

Step 3/4 — Who can access SysWatch?
  1) Only this computer  (localhost) ← safer
  2) Anyone on my network (0.0.0.0)
  Choose [1]:
  ✓ Access: Localhost only

Step 4/4 — Enable HTTPS?
  Enable HTTPS? [y/N]:
  ✓ HTTPS: Disabled

  ✓ Setup complete! Config saved → syswatch.config.json
  Starting SysWatch → http://localhost:8080
```

The wizard creates `syswatch.config.json` automatically. **No manual editing needed.**

---

## 🔁 Re-run Setup (change password, port, etc.)

```bash
sudo syswatch --setup
```

---

## ⚙️ CLI Options

```bash
sudo syswatch                 # first run = setup wizard, then start
sudo syswatch --setup         # re-run setup wizard anytime
sudo syswatch --no-auth       # skip password (local testing only)
sudo syswatch --port 3000     # override port
sudo syswatch --host 0.0.0.0  # allow LAN access
sudo syswatch --https         # enable HTTPS too
sudo syswatch --help          # show all options
```

---

## 🔒 HTTPS

**Self-signed (quick):** Answer "y" to the HTTPS question in setup. A cert is auto-generated. Browser will warn "Not Secure" — click Advanced → Proceed. Normal for self-signed.

**Let's Encrypt (real domain):**
```bash
sudo certbot certonly --standalone -d yourdomain.com
# Then edit syswatch.config.json:
# "certPath": "/etc/letsencrypt/live/yourdomain.com/fullchain.pem"
# "keyPath":  "/etc/letsencrypt/live/yourdomain.com/privkey.pem"
```

---

## 🔄 Auto-start on boot (systemd)

```bash
sudo nano /etc/systemd/system/syswatch.service
```
```ini
[Unit]
Description=SysWatch Linux Monitor
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/bin/syswatch
Restart=on-failure

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now syswatch
```

---

## 📚 Learn Mode

Toggle **📖 Learn Mode** in the dashboard top-right. Every panel shows:
- The exact Linux command being run
- What each flag does
- The Node.js code that calls it

| Panel | Commands you learn |
|-------|--------------------|
| Overview | `/proc/stat` · `/proc/meminfo` · `/proc/loadavg` · `/proc/net/dev` |
| Services | `systemctl list-units` · `systemctl show` · `systemctl restart` |
| Logs | `journalctl -f -u nginx -p err -o json --since "1h ago"` |
| Processes | `ps aux` · `/proc/PID/stat` · `kill -9 PID` |
| Boot | `systemd-analyze blame` · `critical-chain` · `plot` |

---

## 🐧 Requirements

- **Linux** — Ubuntu 20.04+, Debian 11+, RHEL 8+, Arch, etc.
- **Node.js 18+** — https://nodejs.org
- **systemd** — for service control and journalctl
- **sudo/root** — needed for journal access and service control

---

## 📄 License

MIT
