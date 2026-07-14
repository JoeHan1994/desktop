# Delete Session

Use **Delete Session** when a session is no longer needed and all of its Azure resources should be permanently removed. This frees up quota and reduces infrastructure costs. If you want to return the session to the pool for reuse instead, use [Check In Session](./checkin-session).

<video controls style="width:100%;max-width:960px;border-radius:8px;">
  <source src="https://tfpfsstorage.blob.core.windows.net/tfp-public/DeleteSession.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

---

## Before you start

- You must be the **owner** of the session (shared users cannot delete).
- Deletion is **permanent and irreversible** — all virtual machines, disks, snapshots, and associated Azure resources will be destroyed.
- Make sure you have saved any data or artefacts you need before proceeding.

::: danger
There is no undo for Delete Session. The session, all its machines, and all its checkpoints will be permanently removed from Azure.
:::

---

## Step 1 — Open the session actions menu

1. Sign in to Terraforge and open **My Sessions**.
2. Find the session you want to delete.
3. Open the session actions menu (⋯).
4. Click **Delete Session**.

---

## Step 2 — Confirm the deletion

A confirmation dialog appears with a summary of what will be destroyed:

- All virtual machines in the session.
- All disk snapshots and checkpoints (including the default checkpoint).
- All associated Azure resources tied to the session.

Click **Delete** to confirm. The dialog requires an explicit confirmation step to prevent accidental deletion.

::: tip
If you only need to take a break and plan to resume later, consider extending the session lifetime with [Extend Days](./extend-days) instead of deleting.
:::

---

## Step 3 — What happens after deletion

1. Terraforge queues an asynchronous destroy job via the message queue.
2. The session is immediately marked for deletion and removed from your **My Sessions** list.
3. The MessageWorker processes the job in the background:
   - All virtual machines are deallocated and deleted.
   - All disk resources (OS disks, data disks, snapshots) are removed.
   - Network interfaces and related Azure resources are cleaned up.
4. Once complete, the session no longer exists in Terraforge or Azure.

The process is asynchronous — resource cleanup may take a few minutes depending on how many machines the session contains.

---

## Common restrictions

- Only the session **owner** (Contributor role) can delete a session.
- Shared users **cannot** delete a session.
- A session that is already being destroyed cannot be deleted again (idempotent — the request has no additional effect).

---

## Delete vs Check In

| Action | Use it when |
| ------ | ----------- |
| **Delete** | The session is no longer needed and resources should be freed permanently |
| **Check In** | You are done for now but the session should be returned to the pool for others |

To return a session to the shared pool without losing resources, see [Check In Session](./checkin-session).
