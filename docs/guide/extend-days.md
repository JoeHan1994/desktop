# Extend Days

Use **Extend Days** when you need more time with an existing session before it reaches its destruction date.

This action extends the current session lifetime. It does not create a new session, and it does not change the owner.

<video controls style="width:100%;max-width:960px;border-radius:8px;">
  <source src="https://tfpfsstorage.blob.core.windows.net/tfp-public/ExtendDays.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

---

## Before you start

- Open the session from **My Sessions** or another view where you have session management access.
- Make sure the session is close enough to expiry for the action to appear.

::: tip
In the current Terraforge UI, **Extend Days** is shown from the session actions menu when the session has fewer than **30 days remaining**.
:::

---

## Step 1 - Open the session actions menu

1. Sign in to Terraforge and open the session you want to extend.
2. Open the session actions menu (⋯) in the session header.
3. Click **Extend Days**.

---

## Step 2 - Choose the extension length

The **Extend Session Days** dialog offers fixed extension options:

- **5 days**
- **10 days**
- **15 days**
- **20 days**
- **25 days**
- **30 days**

Select the number of days you want to add, then click **Extend**.

---

## Step 3 - What happens after extension

- Terraforge adds the selected number of days to the session's **current destruction time**.
- The session remains the same session with the same machines and configuration.
- Session lists and session details refresh with the updated destruction date.

::: warning
Extend Days adds time to the existing destruction date. It does **not** reset the session back to a brand-new 60-day lifetime.
:::

---

## Common restrictions

- You need session management permission to extend a session.
- The extension request fails if the session no longer exists or has already been deleted.
- The backend only accepts a **positive** number of days.
- The current UI only offers the fixed values listed above.
