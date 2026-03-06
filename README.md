# SysWatch

**Linux system monitor + learning dashboard** — install it, run it, done.

Monitor CPU, memory, disk, services, journal logs and processes from a clean web UI.
Every panel shows the exact Linux commands being used — so you **learn while you monitor**.

---

## Requirements

| Requirement | Version |
|---|---|
| OS | Linux only (Ubuntu 20.04+, Debian 11+, RHEL 8+, Arch, etc.) |
| Node.js | 18 or higher |
| systemd | Required for service control and journalctl |
| Permissions | Must run as `root` / `sudo` |

---

## Step 1 — Install Node.js 18+ (if not already installed)

```bash
node --version
```

If missing or below v18:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # should print v20.x.x
```

---

## Step 2 — Install SysWatch globally

```bash
sudo npm install -g saymon-syswatch-linux
```

Verify installation:

```bash
which syswatch          # shows path e.g. /usr/local/bin/syswatch
syswatch --help
```

---

## Step 3 — Run the first-time setup wizard

```bash
sudo syswatch
```

The wizard runs automatically when no config is found. It asks 4 questions:

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
  Port [8080]: 8585        ← pick any free port
  ✓ HTTP port: 8585

Step 3/4 — Who can access SysWatch?
  1) Only this computer  (127.0.0.1) ← safer
  2) Anyone on my network (0.0.0.0)  ← for remote/LAN access
  Choose [1]: 2
  ✓ Access: Network (0.0.0.0)

Step 4/4 — Enable HTTPS? (optional)
  Enable HTTPS? [y/N]: N
  ✓ HTTPS: Disabled

  ✓ Setup complete!
  Config saved → /etc/syswatch/syswatch.config.json
```

Config is saved to a **fixed path** — never in your current directory:

| Run as | Config location |
|---|---|
| `sudo` / root | `/etc/syswatch/syswatch.config.json` |
| Normal user | `~/.config/syswatch/syswatch.config.json` |

---

## Step 4 — Open your browser

```
http://YOUR_SERVER_IP:PORT
```

Example: `http://192.168.1.10:8585`

> **On AWS EC2 / cloud servers:** You must also open the port in your **Security Group inbound rules** (Custom TCP → your port → 0.0.0.0/0). UFW alone is not enough on cloud VMs.

---

## Step 5 — Set up auto-start on boot (recommended)

### Find the correct binary path first

```bash
which syswatch
# Usually: /usr/local/bin/syswatch
```

### Create the systemd service

```bash
sudo nano /etc/systemd/system/syswatch.service
```

Paste (replace the path if `which syswatch` gave a different result):

```ini
[Unit]
Description=SysWatch Linux Monitor
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/syswatch
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Enable and start

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now syswatch
sudo systemctl status syswatch
```

You should see `Active: active (running)`.

---

## CLI Options

```bash
sudo syswatch                  # first run = setup wizard, then start
sudo syswatch --setup          # re-run setup wizard anytime
sudo syswatch --no-auth        # skip password (local testing only)
sudo syswatch --port 3000      # override port
sudo syswatch --host 0.0.0.0   # allow LAN/remote access
sudo syswatch --https          # enable HTTPS
sudo syswatch --help           # show all options
```

---

## Running alongside other services (Jitsi, nginx, etc.)

If your server already runs other software, **check which ports are in use first**:

```bash
sudo ss -tlnp | grep LISTEN
```

Then pick a free port for SysWatch. Common ports to avoid:

| Port | Used by |
|---|---|
| 80, 443 | nginx / Apache / Jitsi web |
| 4443 | Jitsi Videobridge TCP fallback |
| 8080, 8888 | Jitsi internal APIs |
| 9090 | Jitsi Jicofo REST API |
| 5222, 5269 | Prosody XMPP |
| 22 | SSH |

**Safe choices:** `8585`, `7070`, `3001`, `9191`, `9999`

Re-run setup to change port anytime:

```bash
sudo syswatch --setup
```

---

## HTTPS

### Self-signed certificate (quick)

Answer `y` to the HTTPS question during setup. A certificate is auto-generated using `openssl`. Your browser will show a "Not Secure" warning — click **Advanced → Proceed**. This is normal for self-signed certs.

### Let's Encrypt (real domain)

```bash
sudo certbot certonly --standalone -d yourdomain.com
```

Then edit `/etc/syswatch/syswatch.config.json`:

```json
{
  "certPath": "/etc/letsencrypt/live/yourdomain.com/fullchain.pem",
  "keyPath":  "/etc/letsencrypt/live/yourdomain.com/privkey.pem"
}
```

Restart: `sudo systemctl restart syswatch`

---

## Learn Mode

Toggle **Learn Mode** in the dashboard top-right corner. Every panel reveals:
- The exact Linux command being executed
- What each flag does
- The Node.js code that calls it

| Panel | Commands you learn |
|---|---|
| Overview | `/proc/stat` · `/proc/meminfo` · `/proc/loadavg` · `/proc/net/dev` |
| Services | `systemctl list-units` · `systemctl show` · `systemctl restart` |
| Logs | `journalctl -f -u nginx -p err -o json --since "1h ago"` |
| Processes | `ps aux` · `/proc/PID/stat` · `kill -9 PID` |
| Boot | `systemd-analyze blame` · `critical-chain` · `plot` |

---

## Troubleshooting

### `status=203/EXEC` — binary not found by systemd

Systemd uses a minimal PATH. Find the real binary path and update the service:

```bash
which syswatch
# e.g. /usr/local/bin/syswatch

sudo sed -i "s|ExecStart=.*|ExecStart=$(which syswatch)|" /etc/systemd/system/syswatch.service
sudo systemctl daemon-reload
sudo systemctl restart syswatch
```

---

### `EADDRINUSE` — port already in use

You started syswatch manually and then also started it via systemd (two instances fighting for the same port). Kill the manual one:

```bash
sudo pkill -f syswatch
sleep 2
sudo systemctl restart syswatch
sudo systemctl status syswatch
```

Always use systemd to manage the process — never run `syswatch &` in the background manually on a server.

---

### Browser shows "This site can't be reached" on a cloud server

Two things to check:

**1. UFW firewall:**
```bash
sudo ufw allow YOUR_PORT/tcp
sudo ufw status
```

**2. AWS / cloud Security Group:**
Go to EC2 → Instances → your instance → Security tab → Edit inbound rules → Add rule:
- Type: Custom TCP
- Port: your chosen port (e.g. 8585)
- Source: 0.0.0.0/0

UFW alone is not enough on AWS EC2, GCP, Azure, etc. — the cloud-level firewall must also allow the port.

---

### View live logs

```bash
sudo journalctl -u syswatch -f
```

---

### Reset / change password or port

```bash
sudo syswatch --setup
```

This re-runs the full wizard and overwrites the config.

---

### Uninstall

```bash
sudo systemctl disable --now syswatch
sudo rm /etc/systemd/system/syswatch.service
sudo systemctl daemon-reload
sudo npm uninstall -g saymon-syswatch-linux
sudo rm -rf /etc/syswatch
```

---

## License

MIT
