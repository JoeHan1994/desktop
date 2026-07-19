# Manage Templates

Task **Templates** let you save a configured task list and reuse it across sessions — or share it with your team — without rebuilding the same sequence every time.

## Saving a Task List as a Template

<video controls style="width:100%;max-width:960px;border-radius:8px;">
  <source src="https://tfpfsstorage.blob.core.windows.net/tfp-public/TaskTemplates.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

After building a task list on the **Run Tasks** tab, click **Save Template** in the toolbar.

1. A dialog appears asking for a **Template Name**.
2. Enter a descriptive name (e.g., `Install Publisher + Checkpoint`).
3. Click **Save**.

The current task list — including all task types, configurations, and target roles — is serialised and stored as a template.

::: tip Re-saving an existing template
If you loaded a template, modified it, and click **Save Template** again, you can either overwrite the existing template or save it as a new one with a different name.
:::

## Loading a Template

Use the **template selector dropdown** in the Run Tasks toolbar to load a saved template:

1. Open the dropdown (it shows the active template name, or **Select a template** when none is loaded).
2. Browse the list — your own templates appear first, followed by shared templates.
3. Click a template to load it. The current task list is replaced with the template's tasks.

::: warning Unsaved changes
Loading a template replaces the current task list. Any unsaved changes will be lost.
:::

## Managing Templates

Click the **Manage** button (next to the template selector) to open the **Manage Templates** drawer.

### My Templates tab

Lists all templates you own, sorted alphabetically.

Each template card shows:

| Field        | Description                                |
| ------------ | ------------------------------------------ |
| **Name**     | Template display name                       |
| **Enabled**  | Toggle — disabled templates cannot be loaded |
| **Shared**   | Whether the template is visible to everyone |
| **Created**  | Date the template was created               |
| **Updated**  | Date the template was last modified         |

#### Actions (⋮ menu)

| Action               | Description                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| **Preview**          | Load the template's task list into the Run Tasks panel for review (without replacing the current list) |
| **Enable / Disable** | Toggle whether the template can be loaded and used                                               |
| **Share with everyone** | Toggle — makes the template visible to all users under the **Shared Templates** tab           |
| **Share with user**  | Create a copy of this template for a specific user (enter their User ID)                         |
| **Assign to user**   | Transfer ownership of the template to another user — removes it from your list                   |
| **Delete**           | Permanently delete the template. This action cannot be undone.                                   |

### Shared Templates tab

Lists templates shared by other users (marked as **Share with everyone**). You can preview and load shared templates, but you cannot edit or delete them.

## Template Visibility Rules

| State          | Who can see and load it                          |
| -------------- | ------------------------------------------------ |
| Enabled        | Owner and any user it has been shared with       |
| Disabled       | Owner only (in Manage Templates), cannot be loaded |
| Shared         | All users (appears under **Shared Templates**)   |
| Assigned away  | New owner only, no longer appears in your list   |

## Additional resources

**Standardise a test preparation sequence:**

1. Build the task list (e.g., Install Publisher → Create Checkpoint → Run Scripts).
2. Save as `Standard Test Prep`.
3. Share with everyone so the whole team can load it.

**Share a template with a specific colleague:**

1. Open Manage Templates → find the template → ⋮ → **Share with user**.
2. Enter the colleague's User ID.
3. A copy appears in their template list.

**Hand off ownership:**

1. Open Manage Templates → find the template → ⋮ → **Assign to user**.
2. Enter the new owner's User ID.
3. The template is transferred and removed from your list.
