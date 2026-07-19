# Prohibit Auto Shutdown Instructions

## Overview

Use **Prohibit Auto Shutdown** when you want to protect machines from Terraforge's automatic idle shutdown for a short period.

This is useful during long-running installs, overnight validation, debugging, or any session where you do not want machines to be stopped automatically while work is still in progress.

## Prerequisite

- Open the target session.
- Make sure you have session management permission.

There are two ways to use this feature:

- **Session-level**: from the session actions menu, which protects **all machines in the session**.
- **Machine-level**: from an individual machine's actions menu, which protects only that machine.

This guide focuses on the **session-level** workflow.

## How to prohibit auto shutdown

<video controls style="width:100%;max-width:960px;border-radius:8px;">
  <source src="https://tfpfsstorage.blob.core.windows.net/tfp-public/ProhibitAutoShutdown.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

1. Sign in to Terraforge and open the session you want to protect.
2. Open the session actions menu (⋯) in the session header.
3. Click **Prohibit Auto Shutdown**.

### Select the protection period

The dialog offers a fixed protection period of **1 to 5 days**.

Choose one of these values:

- **1 day**
- **2 days**
- **3 days**
- **4 days**
- **5 days**

The dialog also shows a **Protected Until** preview so you can confirm the target time before applying it.

Click **Confirm** to continue.

## What happens after confirmation

- Terraforge applies the protection window to **all machines in the current session**.
- The session refreshes its machine data in the background.
- A success toast shows the local time until which the machines are protected.

::: tip
If you only want to protect one machine instead of the whole session, use **Prohibit Auto Shutdown** from that machine's own actions menu.
:::

## What this does and does not do

### What it does

- Prevents Terraforge from automatically shutting down protected machines because of idle-time rules.

### What it does not do

- It does **not** extend the session destruction date.
- It does **not** transfer session ownership.
- It does **not** prevent you from manually starting, stopping, or rebooting machines.

After the protection time expires, normal automatic shutdown behavior applies again.

## Restrictions and limitations

- You need session management permission to apply this setting.
- The current UI only allows **1 to 5 days**.
- The request fails if the session no longer exists.
- If the session has no machines, Terraforge cannot apply the protection window.
