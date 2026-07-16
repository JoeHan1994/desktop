@echo off
setlocal EnableDelayedExpansion

REM ============================================================
REM Azure Bastion Configuration
REM ============================================================
set "BASTION_NAME="
set "RESOURCE_GROUP="
set "SUBSCRIPTION_ID=3f6b2c12-11fc-476d-9e05-fd0a4bf80c04"
set "VM_NAME="
REM ============================================================
REM Input Parameters
REM ============================================================
REM Usage: ConnectBySSH /vmname <vm> /bn <bastion> /rg <rg>
REM Named parameters (case-insensitive, all required):
REM   /VMName <v>                        -- VM name
REM   /BASTION_NAME <n>   or  /bn <n>    -- Bastion name
REM   /RESOURCE_GROUP <g> or  /rg <g>   -- Resource group

:PARSE_LOOP
if "%~1"=="" goto :PARSE_DONE
set "_P=%~1"
if /i "!_P!"=="/h"              goto :SHOW_HELP
if /i "!_P!"=="/help"           goto :SHOW_HELP
if /i "!_P!"=="/vmname"         goto :SET_VMN
if /i "!_P!"=="/bn"             goto :SET_BN
if /i "!_P!"=="/bastion_name"   goto :SET_BN
if /i "!_P!"=="/rg"             goto :SET_RG
if /i "!_P!"=="/resource_group" goto :SET_RG
echo [ERROR] Unknown parameter: !_P!
pause
exit /b 1

:SHOW_HELP
echo.
echo Usage: ConnectBySSH [/h ^| /help] [/vmname ^<vm^>] [/bn ^<bastion^>] [/rg ^<rg^>]
echo.
echo Options:
echo   /h, /help                        Show this help message and exit.
echo   /vmname ^<vm^>                     VM name (e.g. vm30042501).
echo   /bn ^<bastion^>, /BASTION_NAME ^<n^> Azure Bastion name.
echo   /rg ^<rg^>,   /RESOURCE_GROUP ^<g^>  Azure Resource Group name.
echo.
echo All parameters are optional at call time; missing values will be prompted.
echo.
exit /b 0

:SET_VMN
shift
set "VM_NAME=%~1"
shift
goto :PARSE_LOOP

:SET_BN
shift
set "BASTION_NAME=%~1"
shift
goto :PARSE_LOOP

:SET_RG
shift
set "RESOURCE_GROUP=%~1"
shift
goto :PARSE_LOOP

:PARSE_DONE
if "!VM_NAME!"=="" set /p "VM_NAME=Please enter VM name (e.g. vm30042501): "
if "!VM_NAME!"=="" (
    echo [ERROR] VM name cannot be empty.
    pause
    exit /b 1
)
if "!BASTION_NAME!"=="" set /p "BASTION_NAME=Please enter Bastion name: "
if "!BASTION_NAME!"=="" (
    echo [ERROR] Bastion name cannot be empty.
    pause
    exit /b 1
)
if "!RESOURCE_GROUP!"=="" set /p "RESOURCE_GROUP=Please enter Resource Group: "
if "!RESOURCE_GROUP!"=="" (
    echo [ERROR] Resource group cannot be empty.
    pause
    exit /b 1
)
REM Extract resource group: strip "vm" prefix then strip last 2 characters
REM e.g. vm30042501 -> 30042501 -> 300425
set "_TEMP=!VM_NAME:~2!"
set "VM_RG=!_TEMP:~0,-2!"
set "VM_ID=/subscriptions/%SUBSCRIPTION_ID%/resourceGroups/!VM_RG!/providers/Microsoft.Compute/virtualMachines/!VM_NAME!"
set "SSH_USER=Administrator"
set "LOCAL_PORT=2222"
set "REMOTE_PORT=22"
set "PID_FILE=%TEMP%\azure_bastion_%LOCAL_PORT%.pid"
set "TUNNEL_LOG=%TEMP%\azure_bastion_%LOCAL_PORT%.log"
set "TUNNEL_SCRIPT=%TEMP%\azure_bastion_%LOCAL_PORT%_tunnel.cmd"

echo.
echo ============================================================
echo Azure Bastion Connect
echo ============================================================
echo.

REM ============================================================
REM Required Tools Check
REM ============================================================
echo Checking required tools...

where az >nul 2>&1
if errorlevel 1 goto :NO_AZ

where ssh >nul 2>&1
if errorlevel 1 goto :NO_SSH

where ssh-keygen >nul 2>&1
if errorlevel 1 goto :NO_SSH_KEYGEN

echo Required tools OK.
echo.
goto :TOOLS_OK

:NO_AZ
echo [ERROR] Azure CLI az is not installed or not in PATH.
echo Please install it from: https://aka.ms/installazurecliwindows
pause
exit /b 1

:NO_SSH
echo [ERROR] OpenSSH client ssh is not installed or not in PATH.
echo Please install OpenSSH Client from Windows Optional Features.
pause
exit /b 1

:NO_SSH_KEYGEN
echo [ERROR] OpenSSH tool ssh-keygen is not installed or not in PATH.
echo Please install OpenSSH Client from Windows Optional Features.
pause
exit /b 1

:TOOLS_OK
REM ============================================================
REM Ensure SSH Directory Exists
REM ============================================================
set "SSH_DIR=%USERPROFILE%\.ssh"
set "PRIVATE_KEY=%SSH_DIR%\id_ed25519"
if exist "%SSH_DIR%" goto :SSH_DIR_OK
mkdir "%SSH_DIR%"
if errorlevel 1 goto :SSH_DIR_FAIL
goto :SSH_DIR_OK

:SSH_DIR_FAIL
echo [ERROR] Failed to create SSH directory: %SSH_DIR%
pause
exit /b 1

:SSH_DIR_OK

REM ============================================================
REM Create SSH Key If Missing
REM ============================================================
if exist "%PRIVATE_KEY%" goto :SSH_KEY_OK
echo Creating SSH key...
call ssh-keygen -t ed25519 -f "%PRIVATE_KEY%" -N ""
if errorlevel 1 goto :SSH_KEY_FAIL
if not exist "%PRIVATE_KEY%" goto :SSH_KEY_FAIL
echo SSH key created.
goto :SSH_KEY_OK

:SSH_KEY_FAIL
echo [ERROR] Failed to create SSH key.
pause
exit /b 1

:SSH_KEY_OK
REM ============================================================
REM Azure Login Check
REM ============================================================
echo Checking Azure login...
call az account show >nul 2>&1
if errorlevel 1 goto :DO_LOGIN
echo Azure login OK.
goto :AZ_LOGIN_DONE

:DO_LOGIN
echo Azure login required. Opening browser for login...
call az login
if errorlevel 1 goto :LOGIN_FAIL
echo Azure login OK.
goto :AZ_LOGIN_DONE

:LOGIN_FAIL
echo [ERROR] Azure login failed.
pause
exit /b 1

:AZ_LOGIN_DONE
echo Checking Azure subscription access...
call az account show --subscription "%SUBSCRIPTION_ID%" >nul 2>&1
if errorlevel 1 goto :SUBSCRIPTION_FAIL
echo Azure subscription OK: %SUBSCRIPTION_ID%
echo.

:SUBSCRIPTION_DONE
REM ============================================================
REM Check Existing Tunnel
REM ============================================================
netstat -ano | findstr "LISTENING" | findstr ":%LOCAL_PORT%" >nul
if errorlevel 1 goto :START_TUNNEL
echo Tunnel already exists on port %LOCAL_PORT%.
echo.
goto :SSH_CONNECT

REM ============================================================
REM Start Bastion Tunnel
REM ============================================================
:START_TUNNEL
echo Starting Azure Bastion Tunnel...
if exist "%TUNNEL_LOG%" del "%TUNNEL_LOG%" >nul 2>&1
if exist "%TUNNEL_SCRIPT%" del "%TUNNEL_SCRIPT%" >nul 2>&1
> "%TUNNEL_SCRIPT%" echo @echo off
>> "%TUNNEL_SCRIPT%" echo call az network bastion tunnel --name "%BASTION_NAME%" --resource-group "%RESOURCE_GROUP%" --target-resource-id "%VM_ID%" --resource-port %REMOTE_PORT% --port %LOCAL_PORT% --subscription "%SUBSCRIPTION_ID%" ^> "%TUNNEL_LOG%" 2^>^&1
findstr /C:"call az network bastion tunnel" "%TUNNEL_SCRIPT%" >nul 2>&1
if errorlevel 1 goto :TUNNEL_SCRIPT_FAIL
start "AzureBastionTunnel" /MIN cmd /c ""%TUNNEL_SCRIPT%""
if errorlevel 1 goto :TUNNEL_START_FAIL

echo.
echo Waiting for tunnel startup...
set WAIT_COUNT=0

:WAIT_LOOP
ping -n 2 localhost >nul
netstat -ano | findstr "LISTENING" | findstr ":%LOCAL_PORT%" >nul
if not errorlevel 1 goto :TUNNEL_READY

set /a WAIT_COUNT+=1
if !WAIT_COUNT! geq 15 goto :TUNNEL_FAIL
goto :WAIT_LOOP

:SUBSCRIPTION_FAIL
echo [ERROR] Cannot access Azure subscription: %SUBSCRIPTION_ID%
echo Please check your Azure account permissions.
pause
exit /b 1

:TUNNEL_SCRIPT_FAIL
echo [ERROR] Failed to create tunnel startup script: %TUNNEL_SCRIPT%
pause
exit /b 1

:TUNNEL_START_FAIL
echo [ERROR] Failed to start Azure Bastion tunnel process.
pause
exit /b 1

:TUNNEL_FAIL
echo.
echo [ERROR] Tunnel failed to start within 15 seconds.
if not exist "%TUNNEL_LOG%" goto :TUNNEL_FAIL_DONE
echo.
echo Tunnel log:
type "%TUNNEL_LOG%"

:TUNNEL_FAIL_DONE
pause
exit /b 1

:TUNNEL_READY
REM ============================================================
REM Capture Tunnel PID
REM ============================================================
if exist "%PID_FILE%" del "%PID_FILE%"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":%LOCAL_PORT%"') do (
    echo %%a > "%PID_FILE%"
)

if exist "%PID_FILE%" (
    set /p TUNNEL_PID=<"%PID_FILE%"
    echo Tunnel PID: !TUNNEL_PID!
)
echo.
echo Tunnel Ready: localhost:%LOCAL_PORT%
echo.

:SSH_CONNECT
REM ============================================================
REM Refresh known_hosts for 127.0.0.1:%LOCAL_PORT%
REM ============================================================
echo Refreshing known_hosts...
ssh-keygen -R "[127.0.0.1]:%LOCAL_PORT%" >nul 2>&1
ssh-keyscan -p %LOCAL_PORT% -H 127.0.0.1 >> "%USERPROFILE%\.ssh\known_hosts" 2>nul
echo.

REM ============================================================
REM Ensure SSH Key Auth is Set Up on Remote (one-time setup)
REM ============================================================
echo Checking SSH key authorization on remote...
ssh -p %LOCAL_PORT% -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=no -i "%PRIVATE_KEY%" %SSH_USER%@127.0.0.1 "exit" >nul 2>&1
if not errorlevel 1 goto :DO_SSH_CONNECT

echo SSH key not authorized. Registering via Azure Run Command ^(one-time, no password needed^)...
echo.
set "PUBKEY="
for /f "usebackq delims=" %%a in ("%PRIVATE_KEY%.pub") do (
    set "PUBKEY=%%a"
    goto :PUBKEY_READ_DONE
)
:PUBKEY_READ_DONE
if "!PUBKEY!"=="" goto :PUBKEY_FAIL
echo $key = '!PUBKEY!' > "%TEMP%\setup_auth.ps1"
echo $sshDir = $env:ProgramData + '\ssh' >> "%TEMP%\setup_auth.ps1"
echo $authFile = $sshDir + '\administrators_authorized_keys' >> "%TEMP%\setup_auth.ps1"
echo Set-Content -Path $authFile -Value $key -Encoding ASCII >> "%TEMP%\setup_auth.ps1"
echo icacls.exe $authFile /inheritance:r >> "%TEMP%\setup_auth.ps1"
echo icacls.exe $authFile /grant 'SYSTEM:F' >> "%TEMP%\setup_auth.ps1"
echo icacls.exe $authFile /grant 'Administrators:F' >> "%TEMP%\setup_auth.ps1"
echo $admSshDir = 'C:\Users\Administrator\.ssh' >> "%TEMP%\setup_auth.ps1"
echo if (-not (Test-Path $admSshDir)) { $null = New-Item -ItemType Directory -Force $admSshDir } >> "%TEMP%\setup_auth.ps1"
echo Set-Content -Path ($admSshDir + '\authorized_keys') -Value $key -Encoding ASCII >> "%TEMP%\setup_auth.ps1"
echo Write-Host ('Keys written. Stored key: ' + (Get-Content $authFile)) >> "%TEMP%\setup_auth.ps1"
echo $cfg = $sshDir + '\sshd_config' >> "%TEMP%\setup_auth.ps1"
echo Set-Content $cfg 'Port 22' -Encoding ASCII >> "%TEMP%\setup_auth.ps1"
echo Add-Content $cfg 'PubkeyAuthentication yes' -Encoding ASCII >> "%TEMP%\setup_auth.ps1"
echo Add-Content $cfg 'PasswordAuthentication yes' -Encoding ASCII >> "%TEMP%\setup_auth.ps1"
echo Add-Content $cfg 'Subsystem sftp sftp-server.exe' -Encoding ASCII >> "%TEMP%\setup_auth.ps1"
echo Add-Content $cfg 'Match Group administrators' -Encoding ASCII >> "%TEMP%\setup_auth.ps1"
echo Add-Content $cfg '       AuthorizedKeysFile __PROGRAMDATA__/ssh/administrators_authorized_keys' -Encoding ASCII >> "%TEMP%\setup_auth.ps1"
echo Write-Host 'sshd_config restored' >> "%TEMP%\setup_auth.ps1"
echo Restart-Service sshd -Force >> "%TEMP%\setup_auth.ps1"
echo Start-Sleep -Seconds 5 >> "%TEMP%\setup_auth.ps1"
echo Write-Host ('sshd status: ' + (Get-Service sshd).Status) >> "%TEMP%\setup_auth.ps1"
echo Write-Host 'SSH key setup complete' >> "%TEMP%\setup_auth.ps1"
call az vm run-command invoke --ids "!VM_ID!" --command-id RunPowerShellScript --scripts "@%TEMP%\setup_auth.ps1" --subscription "%SUBSCRIPTION_ID%" > "%TEMP%\runcmd.json"
set "RUN_CMD_CODE=!ERRORLEVEL!"
del "%TEMP%\setup_auth.ps1" >nul 2>&1
type "%TEMP%\runcmd.json"
echo.
if !RUN_CMD_CODE! neq 0 (
    del "%TEMP%\runcmd.json" >nul 2>&1
    echo [ERROR] Failed to register SSH key via Azure Run Command.
    pause
    exit /b 1
)
findstr /i "FullyQualifiedErrorId" "%TEMP%\runcmd.json" >nul 2>&1
if not errorlevel 1 (
    del "%TEMP%\runcmd.json" >nul 2>&1
    echo [ERROR] SSH key setup script failed on remote VM.
    pause
    exit /b 1
)
del "%TEMP%\runcmd.json" >nul 2>&1
echo Key registered. Verifying SSH key auth...
echo Local key fingerprint:
ssh-keygen -l -f "%PRIVATE_KEY%.pub"
echo.
ssh -p %LOCAL_PORT% -v -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=no -o IdentitiesOnly=yes -i "%PRIVATE_KEY%" %SSH_USER%@127.0.0.1 "exit" 2>"%TEMP%\ssh_verify.txt"
if errorlevel 1 (
    echo [DEBUG] SSH verbose output:
    type "%TEMP%\ssh_verify.txt"
    del "%TEMP%\ssh_verify.txt" >nul 2>&1
    echo.
    echo [ERROR] Key auth still not working after setup.
    pause
    exit /b 1
)
del "%TEMP%\ssh_verify.txt" >nul 2>&1
echo SSH key auth OK.
echo.
goto :DO_SSH_CONNECT

:PUBKEY_FAIL
echo [ERROR] Failed to read public key from: %PRIVATE_KEY%.pub
pause
exit /b 1

:DO_SSH_CONNECT
REM ============================================================
REM SSH Connect
REM ============================================================
echo Connecting...
echo.
echo Username : %SSH_USER%
echo.

call ssh -o StrictHostKeyChecking=no -i "%PRIVATE_KEY%" %SSH_USER%@127.0.0.1 -p %LOCAL_PORT%
set "SSH_EXIT_CODE=%ERRORLEVEL%"

echo.
echo SSH session closed.
echo.
if exist "%TUNNEL_SCRIPT%" del "%TUNNEL_SCRIPT%" >nul 2>&1
endlocal & exit /b %SSH_EXIT_CODE%
