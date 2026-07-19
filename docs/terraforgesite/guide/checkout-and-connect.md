# Checkout and Connect Instructions

## Overview

This guide covers the complete workflow for checking out a virtual machine session in Terraforge and connecting to it — either directly through the in-browser Bastion terminal, or via a native RDP/SSH client.

Portal: [Terraforge URL](https://terraforge.southeastasia.cloudapp.azure.com/)  
Quick Start video: [terraforge101.mp4](https://patchmypc.sharepoint.com/:v:/r/sites/EngineeringTeam/Shared%20Documents/General/terraforge101.mp4?csf=1&web=1&e=LhW5WB)

## Prerequisite

- Access to the Terraforge portal (PatchMyPC Azure AD account required).
- Available session quota (your current usage is shown on the My Sessions page).

## How to checkout and connect

<video controls style="width:100%;max-width:960px;border-radius:8px;">
  <source src="https://tfpfsstorage.blob.core.windows.net/tfp-public/CheckoutSession.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

### Step 1 — Navigate to My Sessions

1.  Log in to the Terraforge portal using your PatchMyPC Azure AD account. You will land on the **Dashboard**.

2.  In the left-hand sidebar, click **My Sessions** to open the session management page.

3.  The page has two tabs:
    - **My Sessions** — sessions you own or have checked out.
    - **Shared Sessions** — sessions others have shared with you.

4.  At the top of the page, the **Checkout Available** card shows the number of sessions ready to check out and your quota usage. If your quota is full, you must check in or delete an existing session before checking out a new one.

### Step 2 — Checkout a Session

1.  Click the **Checkout Available** card (or any **Checkout** button on the page) to open the **Checkout Session** dialog.

2.  The dialog offers three modes:

    **A - Checkout from Pool (default)**
    - A grouped dropdown lists available sessions organized by configuration type.
    - Select the session that matches your required environment (e.g., `Lite-Dev (CM2509)`).
    - Each session entry shows visual badges:
      - **Remaining days** — red if ≤ 1 day remaining, yellow if 2–5 days remaining.
      - **Region** — the Azure region the session is hosted in (e.g., `Southeast Asia`).
    - Click **Checkout** to assign the session to yourself.

    **B - Create New Session**
    - Click the **Create New Session** link inside the dialog to switch modes.
    - Select a **Region** from the first dropdown. This filters the available configurations to only those deployed in that region. The default is **Southeast Asia**.
    - Select a **Configuration** from the second dropdown (options are filtered by the chosen region).
    - Click **Create Session** to provision and assign a brand-new session.
      ::: tip
      Creating a new session triggers a full environment build. Provisioning time varies by configuration and typically takes **1 to 5 hours**. Consider checking out from the pool when an existing session is available.
      :::

    **C - Request a Custom Configuration Session**
    - If no existing configuration meets your needs, you can request one by submitting feedback.
    - Navigate to the **Feedback** page (`/feedback`) and describe the custom environment you require (e.g., specific OS version, software packages, network topology).
    - The team will review your request and create or update a configuration on your behalf. You will be notified once it is available for checkout.

3.  A toast notification confirms the checkout. The session will appear in your **My Sessions** list within a few seconds.

::: warning Quota limit
If you have reached your session quota, the checkout and create actions will be disabled. Check in or delete an existing session first.
:::

### Step 3 — Open the Session

1. Your checked-out session appears as a row in the **My Sessions** table, showing:
   - **Type** — session type badge (e.g., Azure).
   - **Session ID** — unique numeric identifier.
   - **Config Name** — the environment template used.
   - **Task Status** — latest background task (Running / Passed / Failed).
   - **Checkpoint** — active snapshot name, if any.
   - **Owner** — your user account.
   - **Destruction** — scheduled expiry time (local timezone).

2. Click the **Session ID** link (or the row itself) to open the **Session Management** page.

### Step 4 — Understand the Session Management Page

The Session Management page has a collapsible left sidebar listing all machines in the session, and a main area that shows either the machine details or the in-browser Bastion terminal.

**Left sidebar** displays each machine with:

- Power state icon (Running / Stopped / Starting / Unknown).
- Machine ID.
- IP address and image name.
- A **machine actions menu** (⋮) for quick operations.

**Machine actions menu** (per machine):

- **Connect via Bastion** — opens the in-browser terminal for that machine.
- **Copy Machine ID** — copies the ID to clipboard.
- **Start / Stop / Reboot** — power management.
- **Prohibit Auto Shutdown** — prevent the machine from being idle-stopped for 1–5 days.

**Session actions menu** (⋮ on the session header):

- **Assign Session** — transfer session ownership to another user.
- **Start / Stop All Machines** — bulk power control.
- **Extend Days** — add 5 to 30 more days to a session that is close to expiry.
- **Prohibit Auto Shutdown** — protect all machines in the session from idle auto shutdown for 1 to 5 days.
- **Create Checkpoint / Restore Checkpoint** — snapshot management.
- **Share Session** — grant access to another user by their User ID, or share with the entire team.
- **Check In** — return the session to the checkout pool (removes it from your account).
- **Delete Session** — permanently destroy the session and all its VMs.

For step-by-step instructions, see [Assign Session](./assign-session), [Share Session](./share-session), [Extend Days](./extend-days), and [Prohibit Auto Shutdown](./prohibit-auto-shutdown).

::: warning Permissions
**Assign Session**, **Share Session**, **Check In**, and **Delete Session** are only available to the session owner. These actions are hidden or disabled for users accessing a shared session.
:::

### Step 5 — Connect via In-Browser Bastion

1.  In the left sidebar, click a machine row or select **Connect via Bastion** from its actions menu. The main area loads the **Bastion Terminal** — a full-screen iframe embedding the Azure Bastion session.

2.  **If the machine is stopped**, a "Machine Stopped" screen appears with a **Start Machine** button. Click it and wait approximately 60 seconds for the machine to start, then click **Refresh Power State** to check status. The Bastion terminal loads automatically once the machine is running.

3.  **If no Bastion link exists**, click **Create Connection** to generate a new Azure Bastion shareable link.

4.  Once connected, the machine's Windows desktop appears inside the browser.

**Floating toolbar** (top-right corner — hover to reveal after the first 15 seconds):

| Icon             | Action                                                                     |
| ---------------- | -------------------------------------------------------------------------- |
| User             | Copy domain **Username** to clipboard                                      |
| Key              | Copy domain **Password** (local password if no domain hybrid) to clipboard |
| Key variant      | Copy **Local Password** to clipboard                                       |
| Link             | Copy the current **page URL** (shareable Bastion link)                     |
| Download         | Download a pre-configured **.RDP file** for native Remote Desktop          |
| Terminal         | Open **Bastion Tunnel** dialog (native client access)                      |
| Rows             | Navigate to **Session Details** tab                                        |
| Refresh          | **Reconnect** / reload the Bastion iframe                                  |
| Machine ID badge | Copy the **Machine ID** to clipboard                                       |

::: tip
The toolbar fades after 15 seconds to avoid obstruction. Hover over the top-right corner to reveal it again at any time.
:::

### Step 6 — Authenticate in the Bastion Login Form

When the Azure Bastion login form appears inside the iframe:

1.  Click the **Copy Username** toolbar button (User icon). Paste into the **Username** field.
2.  Click the **Copy Password** toolbar button (Key icon). Paste into the **Password** field.
3.  Verify the **Protocol** is set to **RDP** and **Port** is **3389**.
4.  Click **Login**. Azure Bastion establishes the RDP session inside the browser.

### Step 7 (Optional) — Connect via Native RDP or SSH Client

For better performance or when using tools that require a local connection (e.g., Visual Studio remote debugger), use the **Bastion Tunnel** feature instead of the in-browser iframe.

1.  Click the **Bastion Tunnel** button (Terminal icon) in the floating toolbar.

2.  The **Bastion Tunnel** dialog appears with three connection tabs:

    | Tab                    | Protocol | Remote Port | Local Port | Client                                    |
    | ---------------------- | -------- | ----------- | ---------- | ----------------------------------------- |
    | **RDP Access**         | RDP      | 3389        | 9009       | Remote Desktop (mstsc) → `localhost:9009` |
    | **SSH Access**         | SSH      | 22          | 2222       | `ConnectBySSH.bat`                        |
    | **VS Remote Debugger** | Debug    | 4026        | 9004       | `DeployBySSH.bat`                         |

3.  For **RDP Access**, copy the `az network bastion tunnel` command shown in the dialog, then follow the steps:
    - Install the Azure CLI (if not already present).
    - Run `az login` in a terminal.
    - Paste and run the tunnel command — **keep this terminal open** while connected.
    - Connect your client to `localhost:{localPort}` using the credentials from the toolbar.

4.  For **SSH Access**, download `ConnectBySSH.bat` from the dialog, then run the connection command shown there in a terminal as Administrator.

5.  For **VS Remote Debugger**, download `DeployBySSH.bat` from the dialog, then run the connection command shown there in a terminal as Administrator.

    In Visual Studio, go to **Debug > Attach to Process**, set the connection target to `localhost:9004`, select the process to debug, and click **Attach**.

    If the remote debugger is not listening, run the **Enable VS Remote Debugger** task from the Run Tasks tab, or log into the machine and start it manually.

Alternatively, click **Download RDP** (Download icon in the toolbar) to download a pre-configured `.rdp` file and open it directly in the native Remote Desktop client.

### Step 8 — Working in the Virtual Machine

Once connected you have full control of the Windows desktop:

- Launch **Server Manager**, **PowerShell**, or any installed application from the Start Menu.
- The **Patch My PC Publishing Service** and related tools are pre-installed on applicable machines.

::: tip
If you attempt to open an application like Patch My PC and receive a warning stating "There is already another instance of the settings tool opened," ensure that no background processes or other users are currently utilizing the configuration tool.
:::

