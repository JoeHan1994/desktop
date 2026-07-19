# Create Checkpoint

The **Create Checkpoint** task takes a snapshot of all virtual machines in the session and saves it as a named checkpoint. You can restore to this checkpoint later to reset the environment to this exact state.

## When to Use

Use this task at a stable point in your workflow — for example, after installing software but before running tests — so you can restore to a known-good state quickly without reprovisioning.

## Configuration Fields

<video controls style="width:100%;max-width:960px;border-radius:8px;">
  <source src="https://tfpfsstorage.blob.core.windows.net/tfp-public/RunTasks-CreateCheckpoint.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

### Checkpoint Name

A base name for the new checkpoint. The field accepts only alphanumeric characters, hyphens (`-`), and underscores (`_`).

A **random suffix** is automatically appended to the name you enter to ensure uniqueness within the session. For example, entering `post-install` might create `post-install-a3f2`.

::: tip
You do not need to worry about name collisions — the suffix handles that automatically.
:::

## Behaviour

- This task does **not** target individual machine roles. It always snapshots **all machines** in the session simultaneously.
- Checkpoint creation is **asynchronous**. The task is queued and tracked as a Task Job.
- Progress is visible in the **Task Jobs** tab — wait for the job to complete before running subsequent tasks that depend on the new checkpoint state.
- The new checkpoint appears immediately in the **Restore Session** task's checkpoint list once created.

## Notes

- Snapshots capture the full disk state of every machine.
- Creating a checkpoint can take several minutes depending on the number of machines and disk sizes.
- Only non-deleted, non-active checkpoints can be deleted later. See [Checkpoints and Restore](../checkpoints) for management details.

## Additional resources

**Save state after installing applications:**

1. Add **Install Applications** to deploy your build.
2. Add **Create Checkpoint** (e.g., name `post-install`) immediately after.
3. Run tests. If anything goes wrong, use **Restore Session** to return to `post-install-<suffix>` instantly.

**Baseline snapshot at session start:**

Add **Create Checkpoint** as the very first step in a template to capture the clean state before any changes are made.
