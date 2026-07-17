# Run Scripts

The **Run Scripts** task executes a PowerShell script on target machines. Scripts can be written inline or loaded from a file stored in Azure Blob Storage.

<video controls style="width:100%;max-width:960px;border-radius:8px;">
  <source src="https://tfpfsstorage.blob.core.windows.net/tfp-public/RunTasks-RunScripts.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

---

## When to Use

Use this task for any custom automation that doesn't fit a built-in task type — configuring system settings, applying registry changes, running pre/post-test setup steps, or invoking command-line tools on session machines.

---

## Configuration Fields

### Title

A short display name for this script step, shown in the task list and in the Task Jobs tree view.

### Script Source

| Source           | Description                                                         |
| ---------------- | ------------------------------------------------------------------- |
| **Inline Code**  | Write the script directly in a text editor within the task card     |
| **Storage File** | Select a script file from Azure Blob Storage using the file browser |

---

## Inline Code Mode

A multi-line code editor appears in the task card. Type or paste your PowerShell script directly.

```powershell
# Example: configure a registry value
Set-ItemProperty -Path "HKLM:\Software\MyApp" -Name "FeatureFlag" -Value 1
Write-Host "Done."
```

No file upload is needed — the script content is sent directly to the machine at runtime.

---

## Storage File Mode

1. Click **Browse...** to open the **File Browser**.
2. Navigate the Azure Blob Storage tree to locate your script file (`.ps1`, `.cmd`, `.bat`, or any executable).
3. Click the file to select it — the path is filled in automatically.

### Arguments (optional)

Pass command-line arguments to the script. Arguments are appended after the script path at execution time.

```
-Environment Staging -Verbose $true
```

::: tip
Arguments are only available in **Storage File** mode. Inline scripts receive no external parameters, but you can hardcode values directly in the script body.
:::

---

## Target Roles

Selects which machines in the session this task runs against. See [Target Roles](./index#target-roles) for available options.

---

## Behaviour

- The script runs as a background process on each target machine.
- Standard output and errors are captured and available in the Task Jobs log.
- If the script exits with a non-zero exit code, the task step is marked as **Failed**.
- No automatic reboot is triggered. Add a [Reboot Machine](./reboot-machine) step after the script if a restart is needed.

---

## Common Workflows

**Apply a registry setting before a test run:**

1. Add **Run Scripts** with Inline Code.
2. Write a short PowerShell block to set the registry values.
3. Target the specific machine role(s) that need the change.

**Run a pre-existing automation script from storage:**

1. Upload the `.ps1` file to Azure Blob Storage beforehand.
2. Add **Run Scripts** with Storage File mode.
3. Browse for the file and optionally add arguments.
4. Target the appropriate roles.

**Chain script + reboot:**

1. Add **Run Scripts** for the configuration step.
2. Add **Reboot Machine** immediately after.
3. Terraforge will wait for the machines to come back online before proceeding to the next task.
