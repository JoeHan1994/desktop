# Run Tasks

The **Run Tasks** tab within a session lets you compose and execute task sequences against your session machines. Tasks are defined as ordered steps, each targeting specific machine roles.

---

## Available Task Types

| Task Type            | Description                                                   |
| -------------------- | ------------------------------------------------------------- |
| AAD Enrollment       | Enroll machines into Azure AD (Dev/Staging/Prod environments) |
| AAD Unrollment       | Remove Azure AD enrollment from machines                      |
| Create Checkpoint    | Take a VM snapshot with a custom name                         |
| Install Applications | Deploy one or more applications to target machines            |
| Reboot Machine       | Restart selected machines                                     |
| Restore Session      | Revert machines to a previously saved checkpoint              |
| Run Scripts          | Execute PowerShell scripts (inline code or from storage)      |
| Upgrade SCCM         | Upgrade SCCM to a specific version on site servers            |

---

## Building a Task List

1. Open the session detail page and switch to the **Run Tasks** tab.
2. Select a task type from the dropdown and click **Add**.
3. Configure each task — set target roles, fill in required fields, and adjust options.
4. Drag tasks to reorder execution sequence using the grip handle.
5. Click **Run** to queue all tasks for execution.

::: tip
Tasks execute sequentially in the order they appear. Drag-and-drop reordering lets you control the exact execution flow.
:::

---

## Task Templates

Templates save reusable task configurations so you can repeat common workflows without rebuilding from scratch.

**Saving a template:**

1. Build your task list with the desired steps.
2. Click **Save Template** at the bottom.
3. Give it a name — the entire task list is saved as JSON.

**Loading a template:**

- Select a template from the **My Templates** or **Shared Templates** sections in the task type dropdown.
- All tasks from the template are loaded into the task list, ready to run or modify.

**Managing templates:**

- Click **Manage Templates** to open the template management drawer.
- Enable/disable templates, rename them, delete them, or preview their JSON content.
- Share templates with everyone on the team using the share toggle.

---

## Task Triggers

Triggers allow you to schedule template execution automatically — useful for recurring test workflows or timed operations.

**Trigger types:**

| Type     | Description                                    |
| -------- | ---------------------------------------------- |
| One-Time | Execute once at a specific date/time           |
| Interval | Repeat every N minutes                         |
| Cron     | Schedule using a cron expression with timezone |
| New Build | Trigger on new Azure DevOps build completion  |

**Creating a trigger:**

1. Click the **Triggers** button in the Run Tasks toolbar.
2. Click **Create** in the trigger drawer.
3. Select a saved template, target sessions or config, and schedule type.
4. Set an optional max run limit and enable/disable the trigger.

**Trigger run statuses:**

| Status    | Description                                |
| --------- | ------------------------------------------ |
| Running   | Trigger execution is currently in progress |
| Completed | Trigger execution finished successfully    |
| Failed    | Trigger execution encountered an error     |
| Skipped   | Trigger execution was skipped              |

You can view the execution history of each trigger by clicking **View Runs** in the trigger list.

---

## Task Status

Background operations (provisioning, checkpoint create/restore, destroy, and Run Tasks executions) are tracked as **Task Jobs**. View them in the session detail under the **Task Jobs** tab.

### Hierarchical Tree View

Task jobs are displayed in a **tree structure** — parent jobs contain child steps for each machine or sub-operation. The left panel shows the full tree with expand/collapse controls:

- **Expand All / Collapse All** buttons for quick navigation
- **Auto-refresh** every 10 seconds for running jobs
- Click any node to view its details in the right panel

### Task Status Indicators

Each task job displays a real-time status with visual indicators:

| Status  | Icon            | Description                  |
| ------- | --------------- | ---------------------------- |
| Running | Spinning loader | Task is currently executing  |
| Passed  | Green check     | Task completed successfully  |
| Failed  | Red X           | Task encountered an error    |
| Warning | Yellow triangle | Task completed with warnings |
| Not Run | Gray clock      | Task has not started yet     |

### Status Overview Chart

At the top of the Task Jobs panel, a **donut chart** provides a visual summary of all task statuses across the tree — showing counts and percentages for Passed, Failed, Running, Warning, and other states at a glance.

### Task Detail Panel

Selecting a task job in the tree opens a detail panel showing:

- **Details** — Task ID, session ID, machine ID, and current status
- **Timeline** — Start time, finish time, and total duration
- **Sub-tasks** — List of child tasks with their individual statuses
- **Log Output** — Inline message/error output from the task
- **Task Log** — Full log file fetched from Azure Storage (separate logs for root-level runs vs. per-machine execution)
