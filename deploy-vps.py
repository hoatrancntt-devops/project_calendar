"""Deploy Project_Calender to VPS via paramiko (SFTP + SSH).

Usage:
  set VPS_PASSWORD=your_password   (Windows)
  export VPS_PASSWORD=your_password  (Linux/macOS)
  python -X utf8 deploy-vps.py

Routes through Tailscale NC when TAILSCALE_NC=1 (bypasses fail2ban on Tailscale IP).
"""
import os
import posixpath
import subprocess
import sys
import paramiko
from pathlib import Path

# Force UTF-8 output on Windows to handle Docker build unicode chars (✓ etc.)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# VPS config — credentials read from environment, never hardcoded
HOST        = "100.107.189.14"
TS_HOST     = "hlv-org-calendar"   # Tailscale MagicDNS hostname
PORT        = 22
USER        = os.environ.get("VPS_USER", "hoatv")
PASSWORD    = os.environ.get("VPS_PASSWORD", "")
VPS_KEY_PATH = os.environ.get("VPS_KEY_PATH", "")
USE_TAILSCALE_NC = os.environ.get("TAILSCALE_NC", "1") == "1"  # default on

if not PASSWORD and not VPS_KEY_PATH:
    sys.exit(
        "Error: set VPS_PASSWORD or VPS_KEY_PATH env var before running.\n"
        "  Windows: set VPS_PASSWORD=yourpassword\n"
        "  Linux:   export VPS_PASSWORD=yourpassword"
    )

REMOTE_DIR = f"/home/{USER}/m365-calendar"

# Local project root
LOCAL_ROOT = Path(__file__).parent

# Files/dirs to exclude from upload
EXCLUDE = {"node_modules", ".git", "deploy-vps.py", "__pycache__", ".env", "dist", ".DS_Store"}

# Tailscale NC proxy socket — routes SSH through Tailscale daemon to bypass fail2ban
class _TailscaleNcSock:
    """Wraps a tailscale nc subprocess as a paramiko socket."""
    _closed = False

    def __init__(self, proc):
        self._proc = proc

    def send(self, data):
        self._proc.stdin.write(data)
        self._proc.stdin.flush()
        return len(data)

    def recv(self, n):
        return self._proc.stdout.read(n)

    def close(self):
        self._closed = True
        try:
            self._proc.terminate()
        except Exception:
            pass

    def settimeout(self, _):
        pass

    def getpeername(self):
        return (TS_HOST, PORT)


def _tailscale_path():
    """Return platform-appropriate tailscale executable path."""
    candidates = [
        r"C:\Program Files\Tailscale\tailscale.exe",
        "/c/Program Files/Tailscale/tailscale",
        "tailscale",
    ]
    for c in candidates:
        if Path(c).exists() or c == "tailscale":
            return c
    return "tailscale"


def connect():
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    if USE_TAILSCALE_NC:
        # Route through Tailscale NC to bypass direct-IP fail2ban blocks
        ts = _tailscale_path()
        proc = subprocess.Popen(
            [ts, "nc", TS_HOST, str(PORT)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        sock = _TailscaleNcSock(proc)
        t = paramiko.Transport(sock)
        t.start_client(timeout=30)
        if VPS_KEY_PATH:
            key = paramiko.Ed25519Key.from_private_key_file(VPS_KEY_PATH)
            t.auth_publickey(USER, key)
        else:
            t.auth_password(USER, PASSWORD)
        client._transport = t
        return client

    connect_kwargs = dict(hostname=HOST, port=PORT, username=USER, timeout=30)
    if VPS_KEY_PATH:
        connect_kwargs["key_filename"] = VPS_KEY_PATH
    else:
        connect_kwargs["password"] = PASSWORD
    client.connect(**connect_kwargs)
    return client


def run_cmd(client, cmd, check=True, sudo=False):
    """Run remote command, optionally prefixed with sudo (password via echo pipe)."""
    display_cmd = cmd
    if sudo:
        # Use echo pipe so sudo -S reads password from stdin non-interactively
        cmd = f"echo {PASSWORD!r} | sudo -S sh -c {cmd!r}"
    print(f"  $ {'[sudo] ' if sudo else ''}{display_cmd}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=300)
    out = stdout.read().decode("utf-8", errors="replace").strip()
    err = stderr.read().decode("utf-8", errors="replace").strip()
    exit_code = stdout.channel.recv_exit_status()
    # Strip sudo password prompt lines from stderr
    err_clean = "\n".join(l for l in err.splitlines() if not l.strip().startswith("[sudo]") and "password for" not in l.lower())
    if out:
        print(f"    {out}")
    if err_clean:
        print(f"    [stderr] {err_clean}")
    if check and exit_code != 0:
        raise RuntimeError(f"Command failed (exit {exit_code}): {display_cmd}")
    return out, err_clean, exit_code


def sftp_mkdir_p(sftp, remote_path):
    """Create remote directory recursively using POSIX paths."""
    # Split on forward slash (always POSIX on remote Linux)
    parts = [p for p in remote_path.split("/") if p]
    current = ""
    for part in parts:
        current = f"{current}/{part}" if current else f"/{part}"
        try:
            sftp.stat(current)
        except FileNotFoundError:
            try:
                sftp.mkdir(current)
            except Exception:
                pass


def upload_dir(sftp, local_dir: Path, remote_dir: str):
    """Recursively upload local_dir to remote_dir via SFTP (POSIX remote paths)."""
    sftp_mkdir_p(sftp, remote_dir)
    for item in local_dir.iterdir():
        if item.name in EXCLUDE:
            continue
        # Always use forward slash for remote path (Linux VPS)
        remote_path = posixpath.join(remote_dir, item.name)
        if item.is_dir():
            upload_dir(sftp, item, remote_path)
        else:
            print(f"  Uploading {item.relative_to(LOCAL_ROOT)}")
            sftp.put(str(item), remote_path)


def main():
    print(f"\n{'='*50}")
    print(f"Deploying m365-calendar to {HOST}")
    print(f"{'='*50}\n")

    # Step 1: Connect
    print("[1/5] Connecting to VPS...")
    client = connect()
    print("  Connected OK")

    # Step 2: Check Docker
    print("\n[2/5] Checking Docker...")
    run_cmd(client, "docker --version")
    run_cmd(client, "docker compose version 2>/dev/null || docker-compose --version")

    # Step 3: Prepare remote directory
    print(f"\n[3/5] Preparing remote dir: {REMOTE_DIR}")
    run_cmd(client, f"mkdir -p {REMOTE_DIR}")

    # Step 3b: Write .env on VPS (never uploaded via SFTP for security)
    print(f"\n[3b/5] Writing .env on VPS...")
    backend_secret = os.environ.get("BACKEND_API_SECRET", "")
    if backend_secret:
        run_cmd(client, f"echo 'BACKEND_API_SECRET={backend_secret}' > {REMOTE_DIR}/.env")
        print("  .env written OK")
    else:
        print("  [WARN] BACKEND_API_SECRET not set locally — .env on VPS unchanged")

    # Step 4: Upload files
    print("\n[4/5] Uploading project files...")
    sftp = client.open_sftp()
    upload_dir(sftp, LOCAL_ROOT, REMOTE_DIR)
    sftp.close()
    print("  Upload complete")

    # Step 5: Build & start containers
    print("\n[5/5] Building & starting Docker containers...")
    run_cmd(client, f"cd {REMOTE_DIR} && docker compose down 2>/dev/null; true", check=False, sudo=True)
    run_cmd(client, f"cd {REMOTE_DIR} && docker compose build --no-cache && docker compose up -d", sudo=True)
    run_cmd(client, "docker ps --filter name=m365-calendar-app --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'", sudo=True)

    client.close()

    print(f"\n{'='*50}")
    print(f"Deployment complete!")
    print(f"App running at: http://{HOST}:4141")
    print(f"{'='*50}\n")


if __name__ == "__main__":
    main()
