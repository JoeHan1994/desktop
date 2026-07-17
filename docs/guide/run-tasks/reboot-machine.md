# Reboot Machine

The **Reboot Machine** task restarts the selected virtual machines and waits until they are back online before allowing the task sequence to continue.

<video controls style="width:100%;max-width:960px;border-radius:8px;">
  <source src="https://tfpfsstorage.blob.core.windows.net/tfp-public/RunTasks-RebootMachine.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

---

## When to Use

Use this task whenever a previous step requires a restart to take effect — for example, after applying software, changing system settings, or running an enrollment.

---

## Configuration Fields

This task has no additional configuration fields. Simply select the **Target Roles** to specify which machines to reboot.

### Target Roles

Selects which machines in the session this task runs against. See [Target Roles](./index#target-roles) for available options.

::: tip
To reboot every machine in the session at once, select **All Machines**.
:::

---

## Behaviour

- The task sends a reboot command to all targeted machines simultaneously.
- Terraforge waits for each machine to come back online before marking the task as completed.
- Once all targeted machines are online again, the next task in the sequence starts.
- If a machine does not come back online within the timeout window, the task is marked as **Failed**.

---

## Common Workflows

**Reboot after applying software:**

1. Add **Install Applications** (or **Run Scripts**) to deploy or configure software.
2. Add **Reboot Machine** immediately after, targeting the same roles.
3. Subsequent tasks start automatically once the machines are back online.

**Reboot all machines between test phases:**

1. Add **Reboot Machine** targeting **All Machines** between major test phases.
2. Ensures a clean post-reboot state for subsequent tasks.
