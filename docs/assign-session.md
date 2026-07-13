# Assign Session

Use **Assign Session** when you want to hand a session over to another Terraforge user. This action transfers ownership of the existing session. If both people need access at the same time, use [Share Session](./share-session) instead.

<video controls style="width:100%;max-width:960px;border-radius:8px;">
  <source src="https://tfpfsstorage.blob.core.windows.net/tfp-public/AssignSession.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

---

## Before you start

- Open the session from **My Sessions**.
- You need the target user's Terraforge **User ID** (for example, `john.doe`).
- The target user must already exist in Terraforge and be active.

::: tip
In normal day-to-day use, **Assign Session** is available from the session actions menu when you are the owner of the session.
:::

---

## Step 1 - Open the session actions menu

1. Sign in to Terraforge and open **My Sessions**.
2. Find the session you want to hand off.
3. Open the session actions menu (⋯).
4. Click **Assign Session**.

---

## Step 2 - Enter the new owner

1. In the **Assign Session** dialog, confirm the **Session ID** and **Config Name**.
2. Enter the destination user's **User ID**.
3. Click **Assign**.

Terraforge immediately sends the ownership change request and shows a toast notification with the result.

---

## Step 3 - What happens after assignment

- The target user becomes the new owner of the session.
- The session is removed from your **My Sessions** list after the assignment succeeds.
- The new owner sees the session in their **My Sessions** list.
- Owner-only actions move to the new owner.

::: warning
Assign Session is a handoff, not a copy. Terraforge does **not** create a second session.
:::

---

## Common restrictions

- You cannot assign the session to yourself.
- You cannot assign the session to an unknown or disabled user.
- Some system-managed sessions may not allow reassignment through the regular UI flow.
- Assign Session changes ownership. It does **not** share the session back to you automatically.

---

## Assign vs Share

| Action             | Use it when                                            |
| ------------------ | ------------------------------------------------------ |
| **Assign Session** | One person should take over the session completely     |
| **Share Session**  | Another person needs access while you remain the owner |

If you want to keep ownership and let teammates use the same environment, continue with [Share Session](./share-session).
