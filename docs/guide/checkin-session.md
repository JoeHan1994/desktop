# Check In Session

Use **Check In Session** when you have finished using a session and want to return it to the pool for others to check out. Checking in resets the session to its default state and makes it available again. If you no longer need the session at all and want to permanently remove it, use [Delete Session](./delete-session) instead.

<video controls style="width:100%;max-width:960px;border-radius:8px;">
  <source src="https://tfpfsstorage.blob.core.windows.net/tfp-public/CheckInSession.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

---

## Before you start

- You must be the **owner** of the session (shared users cannot check in).
- The session must have a **default checkpoint** — this is created automatically when the session is provisioned.
- Make sure you have saved any work you need. The check-in process **restores the default checkpoint**, which reverts all machine disks to their original state.

::: warning
Check In is **irreversible**. Any data, software, or configuration changes made since the default checkpoint will be lost. Back up your work before proceeding.
:::

---

## Step 1 — Open the session actions menu

1. Sign in to Terraforge and open **My Sessions**.
2. Find the session you want to check in.
3. Open the session actions menu (⋯).
4. Click **Check In Session**.

---

## Step 2 — Confirm the check-in

A confirmation dialog appears summarising what will happen:

- All machines will be reverted to the **default checkpoint**.
- The session will be reassigned to the available pool.
- You will lose ownership immediately.

Click **Check In** to confirm.

::: tip
If you are unsure whether to check in or delete, choose **Check In**. The session is returned to the pool and can be reused by the team, preserving the Azure resources.
:::

---

## Step 3 — What happens after check-in

1. Terraforge queues an asynchronous restore job.
2. The session machines are stopped, reverted to the default checkpoint, and restarted.
3. The session owner is changed to the system automation account (`terraauto`).
4. The session disappears from your **My Sessions** list.
5. Once the restore is complete, the session becomes available in the pool for other users to check out.

You can monitor the task progress in the **Task Jobs** tab of the session detail page before it disappears from your list.

---

## Common restrictions

- Only the session **owner** (Contributor role) can check in a session.
- The session must have a **default checkpoint**. If none exists, the check-in will be rejected.
- Shared users **cannot** check in a session — they can only ask the owner to do so.

---

## Check In vs Delete

| Action | Use it when |
| ------ | ----------- |
| **Check In** | You are done for now and the session should return to the pool for others |
| **Delete** | The session is no longer needed and all resources should be permanently removed |

To permanently remove a session and free all Azure resources, see [Delete Session](./delete-session).
