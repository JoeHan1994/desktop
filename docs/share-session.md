# Share Session

Use **Share Session** when another person needs to access the same environment without becoming the owner. If you want to transfer ownership instead of collaborating, use [Assign Session](./assign-session).

<video controls style="width:100%;max-width:960px;border-radius:8px;">
  <source src="https://tfpfsstorage.blob.core.windows.net/tfp-public/ShareSession.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

---

## Before you start

- Open the session from **My Sessions**.
- For user-to-user sharing, you need the target user's Terraforge **User ID**.
- The target user must already exist in Terraforge and be active.

::: tip
Sharing keeps the session where it is. The owner stays responsible for the session lifecycle, including cleanup and check-in.
:::

---

## Step 1 - Open the Share Session dialog

1. Sign in to Terraforge and open **My Sessions**.
2. Find the session you want to share.
3. Open the session actions menu (⋯).
4. Click **Share Session**.

---

## Step 2 - Choose who should receive access

The dialog supports two sharing modes.

### Option A - Share with a specific user

1. Keep **Share with** set to **Specific User**.
2. Enter the teammate's **User ID**.
3. Click **Share**.

### Option B - Share with everyone

1. Change **Share with** to **Everyone**.
2. The **User ID** input becomes disabled.
3. Click **Share**.

::: warning
When a session is shared with **Everyone**, Terraforge removes the existing per-user share entries and treats the session as globally shared.
:::

---

## Step 3 - Review current shared access

The **Currently Shared With** list at the bottom of the dialog shows all active share entries for the session.

- Each entry is displayed as a badge.
- Click the **X** button next to an entry to remove that share.
- If the session is already shared with **Everyone**, remove that entry first before switching back to user-by-user sharing.

---

## Step 4 - What shared users can do

After the share succeeds, the recipient can find the session in:

- the **Shared Sessions** tab on the **My Sessions** page
- the **Shared With Me** area on the **Dashboard**

Shared users can typically:

- open **Session Details**
- connect through Bastion, RDP, or SSH
- start and stop machines
- run tasks
- create and restore checkpoints
- use other non-owner management actions exposed by the UI

Shared users cannot:

- assign the session to someone else
- share the session again
- check the session in
- delete the session

---

## Common restrictions

- You cannot share a session with yourself.
- You cannot share a session with an unknown or disabled user.
- You cannot share a session with system accounts.
- Some system-managed sessions are not shareable through the regular UI flow.

---

## Share vs Assign

| Action             | Result                                          |
| ------------------ | ----------------------------------------------- |
| **Share Session**  | Keeps you as owner and adds another access path |
| **Assign Session** | Changes the owner of the existing session       |

If you no longer need to own the session and want to hand it off completely, use [Assign Session](./assign-session).
