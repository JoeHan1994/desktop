#!/usr/bin/env bash
set -euo pipefail

# Prevent MINGW/Git Bash from converting /path args to Windows paths
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"

# ============================================================
# Azure Bastion Configuration
# ============================================================
BASTION_NAME=""
RESOURCE_GROUP=""
SUBSCRIPTION_ID="3f6b2c12-11fc-476d-9e05-fd0a4bf80c04"
VM_NAME=""

# ============================================================
# OS Detection
# ============================================================
OS_TYPE="$(uname -s)"
TMPDIR="${TMPDIR:-/tmp}"

# ============================================================
# Input Parameters
# ============================================================
# Usage: ConnectBySSH.sh [--vmname <vm>] [--bn <bastion>] [--rg <rg>]
# Named parameters (case-insensitive, all optional — missing values will be prompted):
#   --vmname <v>                         VM name
#   --bn <n>  | --bastion_name <n>       Bastion name
#   --rg <g>  | --resource_group <g>     Resource group

show_help() {
    cat <<'EOF'

Usage: ConnectBySSH.sh [-h | --help] [--vmname <vm>] [--bn <bastion>] [--rg <rg>]

Options:
  -h, --help                        Show this help message and exit.
  --vmname <vm>                     VM name (e.g. vm30042501).
  --bn <bastion>, --bastion_name <n> Azure Bastion name.
  --rg <rg>,     --resource_group <g> Azure Resource Group name.

All parameters are optional at call time; missing values will be prompted.

EOF
    exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    key="$(echo "$1" | tr '[:upper:]' '[:lower:]')"
    case "$key" in
        -h|--help)
            show_help
            ;;
        --vmname)
            VM_NAME="$2"; shift 2
            ;;
        --bn|--bastion_name)
            BASTION_NAME="$2"; shift 2
            ;;
        --rg|--resource_group)
            RESOURCE_GROUP="$2"; shift 2
            ;;
        *)
            echo "[ERROR] Unknown parameter: $1"
            exit 1
            ;;
    esac
done

# Prompt for missing values
if [[ -z "$VM_NAME" ]]; then
    read -rp "Please enter VM name (e.g. vm30042501): " VM_NAME
fi
if [[ -z "$VM_NAME" ]]; then
    echo "[ERROR] VM name cannot be empty."
    exit 1
fi

if [[ -z "$BASTION_NAME" ]]; then
    read -rp "Please enter Bastion name: " BASTION_NAME
fi
if [[ -z "$BASTION_NAME" ]]; then
    echo "[ERROR] Bastion name cannot be empty."
    exit 1
fi

if [[ -z "$RESOURCE_GROUP" ]]; then
    read -rp "Please enter Resource Group: " RESOURCE_GROUP
fi
if [[ -z "$RESOURCE_GROUP" ]]; then
    echo "[ERROR] Resource group cannot be empty."
    exit 1
fi

# Extract resource group: strip "vm" prefix then strip last 2 characters
# e.g. vm30042501 -> 30042501 -> 300425
_TEMP="${VM_NAME:2}"
VM_RG="${_TEMP:0:${#_TEMP}-2}"

VM_ID="/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${VM_RG}/providers/Microsoft.Compute/virtualMachines/${VM_NAME}"
SSH_USER="Administrator"
LOCAL_PORT=2222
REMOTE_PORT=22
PID_FILE="${TMPDIR}/azure_bastion_${LOCAL_PORT}.pid"
TUNNEL_LOG="${TMPDIR}/azure_bastion_${LOCAL_PORT}.log"

echo ""
echo "============================================================"
echo " Azure Bastion Connect"
echo "============================================================"
echo ""

# ============================================================
# Required Tools Check
# ============================================================
echo "Checking required tools..."

if ! command -v az &>/dev/null; then
    echo "[ERROR] Azure CLI (az) is not installed or not in PATH."
    if [[ "$OS_TYPE" == "Darwin" ]]; then
        echo "Install via: brew install azure-cli"
    else
        echo "Install from: https://aka.ms/installazurecli"
    fi
    exit 1
fi

if ! command -v ssh &>/dev/null; then
    echo "[ERROR] OpenSSH client (ssh) is not installed or not in PATH."
    if [[ "$OS_TYPE" == "Darwin" ]]; then
        echo "OpenSSH is included with macOS. Check your PATH."
    else
        echo "Install via: sudo apt install openssh-client  (or equivalent)"
    fi
    exit 1
fi

if ! command -v ssh-keygen &>/dev/null; then
    echo "[ERROR] OpenSSH tool (ssh-keygen) is not installed or not in PATH."
    exit 1
fi

echo "Required tools OK."
echo ""

# ============================================================
# Fix Azure CLI Bastion Extension Permissions (Git Bash on Windows)
# ============================================================
case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
        _BASTION_UNIX="$HOME/.azure/cliextensions/bastion"
        if [[ -d "$_BASTION_UNIX" ]]; then
            _BASTION_WIN="$(cygpath -w "$_BASTION_UNIX" 2>/dev/null)"
            _WIN_USER="${USERNAME:-${USER:-$(whoami)}}"
            echo "Fixing bastion extension permissions for ${_WIN_USER} ..."
            powershell.exe -NoProfile -Command "icacls '${_BASTION_WIN}' /grant '${_WIN_USER}:(OI)(CI)F' /T" >/dev/null 2>&1 || true
        fi
        ;;
esac

# ============================================================
# Ensure SSH Directory Exists
# ============================================================
SSH_DIR="$HOME/.ssh"
PRIVATE_KEY="$SSH_DIR/id_ed25519"

if [[ ! -d "$SSH_DIR" ]]; then
    mkdir -p "$SSH_DIR" || { echo "[ERROR] Failed to create SSH directory: $SSH_DIR"; exit 1; }
    chmod 700 "$SSH_DIR"
fi

# ============================================================
# Create SSH Key If Missing
# ============================================================
if [[ ! -f "$PRIVATE_KEY" ]]; then
    echo "Creating SSH key..."
    ssh-keygen -t ed25519 -f "$PRIVATE_KEY" -N "" >/dev/null 2>&1 || { echo "[ERROR] Failed to create SSH key."; exit 1; }
    echo "SSH key created."
fi

# ============================================================
# Azure Login Check
# ============================================================
echo "Checking Azure login..."
if ! az account show &>/dev/null; then
    echo "Azure login required. Opening browser for login..."
    az login || { echo "[ERROR] Azure login failed."; exit 1; }
fi
echo "Azure login OK."

echo "Checking Azure subscription access..."
if ! az account show --subscription "$SUBSCRIPTION_ID" &>/dev/null; then
    echo "[ERROR] Cannot access Azure subscription: $SUBSCRIPTION_ID"
    echo "Please check your Azure account permissions."
    exit 1
fi
echo "Azure subscription OK: $SUBSCRIPTION_ID"
echo ""

# ============================================================
# Check Existing Tunnel
# ============================================================
check_port_listening() {
    case "$OS_TYPE" in
        Darwin)
            lsof -iTCP:"$LOCAL_PORT" -sTCP:LISTEN -t &>/dev/null
            ;;
        MINGW*|MSYS*|CYGWIN*)
            netstat -ano 2>/dev/null | grep "LISTENING" | grep -q ":${LOCAL_PORT} "
            ;;
        *)
            ss -tlnp 2>/dev/null | grep -q ":${LOCAL_PORT} " || \
            netstat -tlnp 2>/dev/null | grep -q ":${LOCAL_PORT} "
            ;;
    esac
}

get_tunnel_pid() {
    case "$OS_TYPE" in
        Darwin)
            lsof -iTCP:"$LOCAL_PORT" -sTCP:LISTEN -t 2>/dev/null | head -1
            ;;
        MINGW*|MSYS*|CYGWIN*)
            netstat -ano 2>/dev/null | grep "LISTENING" | grep ":${LOCAL_PORT} " | awk '{print $NF}' | head -1
            ;;
        *)
            ss -tlnp 2>/dev/null | grep ":${LOCAL_PORT} " | grep -oP 'pid=\K[0-9]+' | head -1 || \
            netstat -tlnp 2>/dev/null | grep ":${LOCAL_PORT} " | awk '{print $NF}' | cut -d/ -f1 | head -1
            ;;
    esac
}

if check_port_listening; then
    echo "Tunnel already exists on port $LOCAL_PORT."
    echo ""
else
    # ============================================================
    # Start Bastion Tunnel
    # ============================================================
    echo "Starting Azure Bastion Tunnel..."
    rm -f "$TUNNEL_LOG" 2>/dev/null

    nohup az network bastion tunnel \
        --name "$BASTION_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --target-resource-id "$VM_ID" \
        --resource-port "$REMOTE_PORT" \
        --port "$LOCAL_PORT" \
        --subscription "$SUBSCRIPTION_ID" \
        > "$TUNNEL_LOG" 2>&1 &

    TUNNEL_BG_PID=$!

    echo ""
    echo "Waiting for tunnel startup..."
    WAIT_COUNT=0

    while ! check_port_listening; do
        sleep 2
        WAIT_COUNT=$((WAIT_COUNT + 1))
        if [[ $WAIT_COUNT -ge 15 ]]; then
            echo ""
            echo "[ERROR] Tunnel failed to start within 30 seconds."
            if [[ -f "$TUNNEL_LOG" ]]; then
                echo ""
                echo "Tunnel log:"
                cat "$TUNNEL_LOG"
            fi
            exit 1
        fi
    done

    # Capture Tunnel PID
    TUNNEL_PID="$(get_tunnel_pid)"
    if [[ -n "$TUNNEL_PID" ]]; then
        echo "$TUNNEL_PID" > "$PID_FILE"
        echo "Tunnel PID: $TUNNEL_PID"
    fi
    echo ""
    echo "Tunnel Ready: localhost:$LOCAL_PORT"
    echo ""
fi

# ============================================================
# Refresh known_hosts for 127.0.0.1:LOCAL_PORT
# ============================================================
echo "Refreshing known_hosts..."
ssh-keygen -R "[127.0.0.1]:$LOCAL_PORT" 2>/dev/null || true
ssh-keyscan -p "$LOCAL_PORT" -H 127.0.0.1 >> "$HOME/.ssh/known_hosts" 2>/dev/null
echo ""

# ============================================================
# Ensure SSH Key Auth is Set Up on Remote (one-time setup)
# ============================================================
echo "Checking SSH key authorization on remote..."
if ssh -p "$LOCAL_PORT" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
       -i "$PRIVATE_KEY" "${SSH_USER}@127.0.0.1" "exit" 2>/dev/null; then
    echo "SSH key auth OK."
else
    echo "SSH key not authorized. Registering via Azure Run Command (one-time, no password needed)..."
    echo ""

    PUBKEY="$(cat "${PRIVATE_KEY}.pub")"
    if [[ -z "$PUBKEY" ]]; then
        echo "[ERROR] Failed to read public key from: ${PRIVATE_KEY}.pub"
        exit 1
    fi

    SETUP_SCRIPT="${TMPDIR}/setup_auth.ps1"
    cat > "$SETUP_SCRIPT" <<PSEOF
\$key = '${PUBKEY}'
\$sshDir = \$env:ProgramData + '\\ssh'
\$authFile = \$sshDir + '\\administrators_authorized_keys'
Set-Content -Path \$authFile -Value \$key -Encoding ASCII
icacls.exe \$authFile /inheritance:r
icacls.exe \$authFile /grant 'SYSTEM:F'
icacls.exe \$authFile /grant 'Administrators:F'
\$admSshDir = 'C:\\Users\\Administrator\\.ssh'
if (-not (Test-Path \$admSshDir)) { \$null = New-Item -ItemType Directory -Force \$admSshDir }
Set-Content -Path (\$admSshDir + '\\authorized_keys') -Value \$key -Encoding ASCII
Write-Host ('Keys written. Stored key: ' + (Get-Content \$authFile))
\$cfg = \$sshDir + '\\sshd_config'
Set-Content \$cfg 'Port 22' -Encoding ASCII
Add-Content \$cfg 'PubkeyAuthentication yes' -Encoding ASCII
Add-Content \$cfg 'PasswordAuthentication yes' -Encoding ASCII
Add-Content \$cfg 'Subsystem sftp sftp-server.exe' -Encoding ASCII
Add-Content \$cfg 'Match Group administrators' -Encoding ASCII
Add-Content \$cfg '       AuthorizedKeysFile __PROGRAMDATA__/ssh/administrators_authorized_keys' -Encoding ASCII
Write-Host 'sshd_config restored'
Restart-Service sshd -Force
Start-Sleep -Seconds 5
Write-Host ('sshd status: ' + (Get-Service sshd).Status)
Write-Host 'SSH key setup complete'
PSEOF

    RUNCMD_OUTPUT="${TMPDIR}/runcmd.json"
    if ! az vm run-command invoke \
            --ids "$VM_ID" \
            --command-id RunPowerShellScript \
            --scripts "@${SETUP_SCRIPT}" \
            --subscription "$SUBSCRIPTION_ID" \
            > "$RUNCMD_OUTPUT" 2>&1; then
        rm -f "$SETUP_SCRIPT" "$RUNCMD_OUTPUT" 2>/dev/null
        echo "[ERROR] Failed to register SSH key via Azure Run Command."
        exit 1
    fi

    rm -f "$SETUP_SCRIPT" 2>/dev/null
    cat "$RUNCMD_OUTPUT"
    echo ""

    if grep -qi "FullyQualifiedErrorId" "$RUNCMD_OUTPUT" 2>/dev/null; then
        rm -f "$RUNCMD_OUTPUT" 2>/dev/null
        echo "[ERROR] SSH key setup script failed on remote VM."
        exit 1
    fi
    rm -f "$RUNCMD_OUTPUT" 2>/dev/null

    echo "Key registered. Verifying SSH key auth..."
    echo "Local key fingerprint:"
    ssh-keygen -l -f "${PRIVATE_KEY}.pub"
    echo ""

    SSH_VERIFY_LOG="${TMPDIR}/ssh_verify.txt"
    if ! ssh -p "$LOCAL_PORT" -v -o BatchMode=yes -o ConnectTimeout=10 \
             -o StrictHostKeyChecking=no -o IdentitiesOnly=yes \
             -i "$PRIVATE_KEY" "${SSH_USER}@127.0.0.1" "exit" 2>"$SSH_VERIFY_LOG"; then
        echo "[DEBUG] SSH verbose output:"
        cat "$SSH_VERIFY_LOG"
        rm -f "$SSH_VERIFY_LOG" 2>/dev/null
        echo ""
        echo "[ERROR] Key auth still not working after setup."
        exit 1
    fi
    rm -f "$SSH_VERIFY_LOG" 2>/dev/null
    echo "SSH key auth OK."
    echo ""
fi

# ============================================================
# SSH Connect
# ============================================================
echo "Connecting..."
echo ""
echo "Username : $SSH_USER"
echo ""

ssh -o StrictHostKeyChecking=no -i "$PRIVATE_KEY" "${SSH_USER}@127.0.0.1" -p "$LOCAL_PORT"
SSH_EXIT_CODE=$?

echo ""
echo "SSH session closed."
echo ""
exit $SSH_EXIT_CODE
