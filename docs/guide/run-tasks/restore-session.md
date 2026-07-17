# Restore Session

The **Restore Session** task reverts all virtual machines in the session to a previously saved checkpoint, rolling back any changes made after that snapshot was taken.

<video controls style="width:100%;max-width:960px;border-radius:8px;">
  <source src="https://tfpfsstorage.blob.core.windows.net/tfp-public/RunTasks-RestoreSession.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

---

## When to Use

Use this task to reset the environment to a known-good state — for example, after a failed test run, before starting a new test scenario, or when you want to replay a test from a clean baseline.

---

## Configuration Fields

### Checkpoint

A dropdown listing all available checkpoints for this session. The currently active checkpoint is marked **(Active)**.

::: tip
Create checkpoints in advance using the [Create Checkpoint](./create-checkpoint) task, or by using the Checkpoints tab in the session detail view.
:::

---

## Behaviour

- This task applies to **all machines** in the session — there is no per-role targeting.
- The restore operation is **destructive**: any changes made after the selected checkpoint will be lost.
- After the restore completes, all machines are running in the state they were in when the checkpoint was taken.
- The task is tracked as a Task Job. Progress is visible in the **Task Jobs** tab.

---

## Template Compatibility Warning

::: warning
If you select a checkpoint other than `default`, a warning is displayed:

> **Checkpoint 'your-checkpoint' may not exist in other sessions.**
> If you save this as a template, consider using 'default' for better compatibility.

This is important when using templates across multiple sessions. The `default` checkpoint is guaranteed to exist in every session provisioned from the same configuration, whereas custom-named checkpoints exist only in the specific session where they were created.
:::

To keep templates reusable across sessions:

- Use **Restore Session** with the `default` checkpoint in shared templates.
- Use custom checkpoint names only in templates intended for a single session.

---

## Common Workflows

**Reset after a failed test:**

1. A test run fails and leaves machines in a broken state.
2. Add **Restore Session** pointing to `post-install-<suffix>` (a checkpoint taken after the clean installation).
3. Run the restore to roll back to the clean state.
4. Retry the test.

**Replay a test scenario multiple times:**

1. Create a checkpoint at the starting state.
2. Build a template: **Run Tests** → **Restore Session (to start state)** → repeat.
3. Each iteration begins from the same baseline without reprovisioning.
