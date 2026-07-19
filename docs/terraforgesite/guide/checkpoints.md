# Checkpoints & Restore Instructions

## Overview

A checkpoint is a snapshot of all machine disk states within a session. You can restore to a checkpoint to reset the entire environment to a known-good state. Each session displays its currently active checkpoint name in the session list and detail views.

## The Default Checkpoint

Every session has a special checkpoint named **`default`** — created automatically when the session is first provisioned. The default checkpoint:

- **Cannot be deleted** — the delete button is disabled with a tooltip explaining why
- **Is used during Check In** — when a session is checked in, the default checkpoint is automatically restored to clean the environment before returning it to the pool
- **Serves as the baseline** — the known-good state for the session's initial configuration

## Create a Checkpoint

1. Open the session actions menu (⋯) and click **Create Checkpoint**.
2. Enter a name (max 50 characters, must be unique within the session).
3. Click **Create** — the request is queued as an asynchronous task job.
4. Monitor progress in the **Task Jobs** tab.

::: tip
Checkpoint creation is asynchronous. The task job will appear in the Task Status panel where you can track its progress.
:::

<video controls style="width:100%;max-width:960px;border-radius:8px;">
  <source src="https://tfpfsstorage.blob.core.windows.net/tfp-public/CreateCheckpoint.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

## View Checkpoints

Checkpoints are displayed in the **Restore Session** dialog (accessed from the session actions menu). Each checkpoint shows:

| Field         | Description                                            |
| ------------- | ------------------------------------------------------ |
| Name          | The checkpoint name (unique per session)               |
| Active badge  | Green badge indicating the currently active checkpoint |
| Default badge | Secondary badge for the `default` checkpoint           |
| Created date  | When the checkpoint was taken                          |

## Delete a Checkpoint

To delete a checkpoint, open the **Restore Session** dialog and click the **trash icon** next to the checkpoint you want to remove.

**Restrictions:**

- The **default** checkpoint cannot be deleted
- The **currently active** checkpoint cannot be deleted
- Deletion is permanent and cannot be undone

::: warning
Only non-active, non-default checkpoints can be deleted. The delete button is disabled for protected checkpoints.
:::

<video controls style="width:100%;max-width:960px;border-radius:8px;">
  <source src="https://tfpfsstorage.blob.core.windows.net/tfp-public/RemoveCheckpoint.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

## Restore Session

Restoring a session reverts all machines to the state captured by a specific checkpoint. This is an asynchronous operation — the backend stops all VMs, restores their disk snapshots, and restarts them.

### How to Restore

1. Open the session actions menu (⋯) and click **Restore Session**.
2. The restore dialog opens and loads all available checkpoints for the session.
3. Select a checkpoint from the radio button list.
4. Click **Restore** to confirm.

### What Happens During Restore

1. All machines in the session are **stopped**.
2. Each machine's disk is **reverted** to the selected checkpoint's snapshot.
3. All machines are **restarted**.
4. The restored checkpoint becomes the **active** checkpoint; all others are deactivated.

The restore request is processed asynchronously via a queue. Track progress in the **Task Status** tab.

::: danger
Restoring overwrites the current machine state for all machines in the session. Any changes since the selected checkpoint was taken will be permanently lost.
:::

::: tip
If you only need to restore the default checkpoint and release the session, use **Check In** instead — it combines restore + reassignment in a single action.
:::

<video controls style="width:100%;max-width:960px;border-radius:8px;">
  <source src="https://tfpfsstorage.blob.core.windows.net/tfp-public/RestoreCheckpoint.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

## Additional resources

- [Check In Session](./checkin-session) — return the session to the pool using the default checkpoint.
- [Assign Session](./assign-session) — transfer ownership before checking in.
