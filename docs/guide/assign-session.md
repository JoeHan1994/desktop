# Assign Session Instructions

## Overview

Use **Assign Session** when you want to hand a session over to another Terraforge user. This action transfers ownership of the existing session.

## Prerequisite

- Open the session from **My Sessions**.
- You need the target user's Terraforge **User ID** (for example, `john.doe`).
- The target user must already exist in Terraforge and be active.

::: tip
In normal day-to-day use, **Assign Session** is available from the session actions menu when you are the owner of the session.
:::

## How to assign a session to another user

<video controls style="width:100%;max-width:960px;border-radius:8px;">
  <source src="https://tfpfsstorage.blob.core.windows.net/tfp-public/AssignSession.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

1. Sign in to Terraforge and open **My Sessions**.
2. Find the session you want to hand off.
3. Open the session actions menu (⋯).
4. Click **Assign Session**.
5. In the **Assign Session** dialog, confirm the **Session ID** and **Config Name**.
6. Enter the destination user's **User ID**.
7. Click **Assign**.

Once you click the **Assign** button, Terraforge immediately sends the ownership change request and shows a toast notification with the result.

## What happens after assignment

- The target user becomes the new owner of the session.
- The session is removed from your **My Sessions** list after the assignment succeeds.
- The new owner sees the session in their **My Sessions** list.
- Owner-only actions move to the new owner.

::: warning
Assign Session is a handoff, not a copy. Terraforge does **not** create a second session.
:::

## Restrictions and limitations

- You cannot assign the session to yourself.
- You cannot assign the session to an unknown or disabled user.
- Some system-managed sessions may not allow reassignment through the regular UI flow.
- Assign Session changes ownership. It does **not** share the session back to you automatically.

## Additional resources

If you want to keep ownership and let teammates use the same environment, please use [Share Session](./share-session).
