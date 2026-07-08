<#
.SYNOPSIS
Configures Windows Server OpenSSH for inbound SSH access.

.DESCRIPTION
Run this script in an elevated PowerShell session on the target Windows Server.
It installs OpenSSH Server if missing, starts sshd, sets it to automatic startup,
opens the SSH port in Windows Firewall for the selected profiles, and optionally
changes the current network profile to Private.

.EXAMPLE
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\configure-windows-ssh-server.ps1

.EXAMPLE
.\configure-windows-ssh-server.ps1 -SetNetworkPrivate

.EXAMPLE
.\configure-windows-ssh-server.ps1 -EnablePasswordAuthentication
#>

[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 22,

    [ValidateSet('Any', 'Domain', 'Private', 'Public')]
    [string]$FirewallProfile = 'Any',

    [switch]$SetNetworkPrivate,

    [switch]$EnablePasswordAuthentication
)

$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string]$Message)
    Write-Host "[ssh-setup] $Message" -ForegroundColor Cyan
}

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    $isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

    if (-not $isAdmin) {
        throw 'Please run this script from an elevated PowerShell session.'
    }
}

function Ensure-OpenSshServer {
    Write-Step 'Checking OpenSSH Server capability...'

    $capability = Get-WindowsCapability -Online |
        Where-Object { $_.Name -like 'OpenSSH.Server*' } |
        Select-Object -First 1

    if ($null -eq $capability) {
        Write-Warning 'OpenSSH Server capability was not found on this system. Checking for an existing sshd service instead.'
    }
    elseif ($capability.State -ne 'Installed') {
        Write-Step "Installing $($capability.Name)..."
        Add-WindowsCapability -Online -Name $capability.Name | Out-Null
    }

    $service = Get-Service -Name sshd -ErrorAction SilentlyContinue
    if ($null -eq $service) {
        throw 'The sshd service was not found. Install OpenSSH Server from Windows optional features, then run this script again.'
    }
}

function Ensure-SshdService {
    Write-Step 'Configuring sshd service startup...'
    Set-Service -Name sshd -StartupType Automatic

    $service = Get-Service -Name sshd
    if ($service.Status -ne 'Running') {
        Write-Step 'Starting sshd service...'
        Start-Service -Name sshd
    }
}

function Enable-PasswordAuthenticationIfRequested {
    if (-not $EnablePasswordAuthentication) {
        return
    }

    $configPath = Join-Path $env:ProgramData 'ssh\sshd_config'
    if (-not (Test-Path $configPath)) {
        Write-Warning "sshd_config was not found at $configPath. Skipping password authentication update."
        return
    }

    Write-Step 'Enabling PasswordAuthentication in sshd_config...'

    $backupPath = "$configPath.bak-$(Get-Date -Format 'yyyyMMddHHmmss')"
    Copy-Item -Path $configPath -Destination $backupPath -Force

    $content = Get-Content -Path $configPath -Raw
    if ($content -match '(?m)^\s*#?\s*PasswordAuthentication\s+') {
        $content = [regex]::Replace($content, '(?m)^\s*#?\s*PasswordAuthentication\s+.*$', 'PasswordAuthentication yes')
    }
    else {
        $content = $content.TrimEnd() + "`r`nPasswordAuthentication yes`r`n"
    }

    Set-Content -Path $configPath -Value $content -Encoding ascii
    Restart-Service -Name sshd
    Write-Step "Backed up sshd_config to $backupPath"
}

function Ensure-FirewallRules {
    Write-Step "Opening TCP port $Port in Windows Firewall for profile $FirewallProfile..."

    $defaultRule = Get-NetFirewallRule -DisplayName 'OpenSSH SSH Server (sshd)' -ErrorAction SilentlyContinue
    if ($null -ne $defaultRule) {
        $defaultRule | Set-NetFirewallRule -Enabled True -Direction Inbound -Action Allow -Profile $FirewallProfile
        $defaultRule | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -Protocol TCP -LocalPort $Port
    }

    $ruleName = "OpenSSH-Server-In-TCP-$Port-$FirewallProfile"
    $rule = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue

    if ($null -eq $rule) {
        New-NetFirewallRule `
            -Name $ruleName `
            -DisplayName "OpenSSH Server TCP $Port ($FirewallProfile)" `
            -Enabled True `
            -Direction Inbound `
            -Protocol TCP `
            -Action Allow `
            -LocalPort $Port `
            -Profile $FirewallProfile | Out-Null
    }
    else {
        $rule | Set-NetFirewallRule -Enabled True -Direction Inbound -Action Allow -Profile $FirewallProfile
        $rule | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -Protocol TCP -LocalPort $Port
    }
}

function Set-CurrentNetworkPrivateIfRequested {
    if (-not $SetNetworkPrivate) {
        return
    }

    Write-Step 'Changing non-domain network profiles to Private...'
    Get-NetConnectionProfile |
        Where-Object { $_.NetworkCategory -ne 'DomainAuthenticated' } |
        Set-NetConnectionProfile -NetworkCategory Private
}

function Show-Status {
    Write-Host ''
    Write-Step 'Current SSH service status:'
    Get-Service -Name sshd | Format-Table Status, Name, DisplayName -AutoSize

    Write-Step "Current TCP listeners on port ${Port}:"
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Format-Table LocalAddress, LocalPort, State, OwningProcess -AutoSize

    Write-Step 'Current OpenSSH firewall rules:'
    Get-NetFirewallRule |
        Where-Object { $_.DisplayName -like '*OpenSSH*' -or $_.Name -like 'OpenSSH-Server-In-TCP*' } |
        Format-Table DisplayName, Enabled, Direction, Action, Profile -AutoSize

    Write-Step 'Current network profiles:'
    Get-NetConnectionProfile | Format-Table Name, InterfaceAlias, NetworkCategory, IPv4Connectivity -AutoSize

    Write-Host ''
    Write-Host 'Done. From the client machine, verify with:' -ForegroundColor Green
    Write-Host "  Test-NetConnection <server-ip> -Port $Port"
    Write-Host "  ssh <username>@<server-ip>"
}

Assert-Administrator
Ensure-OpenSshServer
Ensure-SshdService
Set-CurrentNetworkPrivateIfRequested
Enable-PasswordAuthenticationIfRequested
Ensure-FirewallRules
Show-Status