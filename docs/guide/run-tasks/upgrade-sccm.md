# Upgrade SCCM

The **Upgrade SCCM** task upgrades the Microsoft Configuration Manager (SCCM / ConfigMgr) site server within the session to a selected target version.

<video controls style="width:100%;max-width:960px;border-radius:8px;">
  <source src="https://tfpfsstorage.blob.core.windows.net/tfp-public/RunTasks-UpgradeSCCM.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

---

## When to Use

Use this task to test SCCM upgrade scenarios or to prepare a session with a specific SCCM version before running product tests that require a particular site version.

---

## Configuration Fields

### Current Site Version (read-only)

Terraforge automatically reads the current SCCM site version installed in the session and displays it above the target version selector.

If the version cannot be detected, a warning is shown:

::: warning Unable to detect version
If the current SCCM site version cannot be determined, it may be because the SCCM site is not yet fully initialised, or the SCCM-Site machine is not yet reachable. Ensure the session is ready before running this task.
:::

### Target Version

A dropdown listing all **enabled** SCCM releases. Each entry is formatted as:

```
<full version> - <release name>
```

For example: `2309 - SCCM 2309`

Select the version you want to upgrade to. Only versions **higher** than the current site version will result in a successful upgrade.

### Upgrade SCCM Clients

A toggle that controls whether SCCM client machines are also upgraded after the site server is upgraded.

| Setting          | Behaviour                                                                         |
| ---------------- | --------------------------------------------------------------------------------- |
| **On** (default) | Both the site server and all SCCM clients are upgraded                            |
| **Off**          | Only the site server is upgraded; client machines remain on their current version |

---

## Target Machines

This task always targets the **SCCM-Site** machine role automatically. No manual target role selection is needed.

The upgrade is performed on:

- The SCCM site server (`SCCM-Site` role)
- SCCM client machines (if **Upgrade SCCM Clients** is enabled)

---

## Behaviour

1. The task connects to the SCCM site server and initiates the upgrade to the selected version.
2. The upgrade process runs in the background. Progress is tracked as a Task Job.
3. If **Upgrade SCCM Clients** is enabled, client upgrades are triggered after the site server completes.
4. The task is marked **Completed** once all upgrades finish.
5. SCCM upgrades can take **20–60 minutes** depending on infrastructure size.

::: tip
After the upgrade completes, consider adding a [Create Checkpoint](./create-checkpoint) step to save the upgraded state as a new baseline.
:::

---

## Common Workflows

**Test application compatibility on a specific SCCM version:**

1. Add **Upgrade SCCM** and select the target version.
2. Add **Install Applications** to deploy the build under test.
3. Add any further test automation steps.
4. Run the full task list.

**Upgrade only the site server for server-side testing:**

1. Add **Upgrade SCCM**.
2. Disable **Upgrade SCCM Clients**.
3. Run the task — clients remain unchanged for isolated server-side scenarios.
