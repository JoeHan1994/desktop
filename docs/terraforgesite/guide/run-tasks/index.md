# Run Tasks Overview

The **Run Tasks** tab inside a session lets you compose and execute ordered task sequences against the session's virtual machines — without opening a terminal or writing deployment scripts by hand.

## Opening Run Tasks

1. Open a session by clicking its ID in the **My Sessions** list.
2. In the session detail page, click the **Run Tasks** tab.

## Building a Task List

```
┌─────────────────────────────────────────────────┐
│  [ Select task type ▼ ]  [ + Add ]              │  ← Toolbar
│                                                 │
│  ⠿  Step 1  AAD Enrollment        [config...]  │
│  ⠿  Step 2  Install Applications  [config...]  │  ← Task cards
│  ⠿  Step 3  Create Checkpoint     [config...]  │
│                                                 │
│  [ ▶ Run ]  [ Save Template ]                   │  ← Actions
└─────────────────────────────────────────────────┘
```

### Steps

1. Select a **task type** from the dropdown in the toolbar.
2. Click **+ Add** — a new task card appears at the bottom of the list.
3. Fill in the task's fields (each task type has its own configuration form).
4. Repeat to add more tasks.
5. Drag the **⠿ grip handle** on any card to reorder tasks.
6. Click **▶ Run** to queue all tasks for execution.

::: tip Sequential execution
Tasks execute in the order they appear in the list, top to bottom. The run stops if any task fails.
:::

## Available Task Types

| Task Type                                      | What it does                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| [AAD Enrollment](./aad-enrollment)             | Enroll machines into Azure Active Directory                              |
| [AAD Unrollment](./aad-unrollment)             | Remove machines from Azure Active Directory                              |
| [Install Applications](./install-applications) | Deploy software from a product catalog or Azure DevOps pipeline artifact |
| [Run Scripts](./run-scripts)                   | Execute a PowerShell script (inline or from storage)                     |
| [Create Checkpoint](./create-checkpoint)       | Take a VM snapshot of all machines in the session                        |
| [Restore Session](./restore-session)           | Revert all machines to a saved checkpoint                                |
| [Reboot Machine](./reboot-machine)             | Restart selected machines and wait for them to come back online          |
| [Upgrade SCCM](./upgrade-sccm)                 | Upgrade the SCCM site server to a selected version                       |
| [Enable VS Remote Debugger](./enable-vs-remote-debugger) | Install and start the Visual Studio Remote Debugger on session machines  |

## Target Roles

Most task types include a **Target Roles** selector. This controls which machines in the session the task runs against.

| Selection        | Behaviour                                                    |
| ---------------- | ------------------------------------------------------------ |
| **All Machines** | Runs the task on every machine in the session simultaneously |
| Specific role(s) | Runs only on machines that match one or more selected roles  |

Roles are grouped into categories:

- **Special** — `All` (targets every machine)
- **PMPC** — Publisher, DevopsAgent, Catalog AppRunner, AdvancedInsights variants
- **Domain Controller** — Root-DC, child DCs
- **Domain Member** — Domain-joined workstations
- **SCCM Site** — Standalone-Site, Central-Site, Primary Sites
- **SCCM Client** — Site client machines
- **OS Products** — Dynamically populated from enabled Azure VM images

::: tip
If your task should run on every machine (e.g., a reboot), choose **All Machines**. If it targets a specific role (e.g., Install Applications on the Publisher machine), select that role only.
:::

## Task Templates

Templates let you save a configured task list and replay it later without rebuilding from scratch.

### Saving a Template

1. Build and configure your task list.
2. Click **Save Template** at the bottom of the task list.
3. Enter a name and click **Save**.

### Loading a Template

Open the **task type dropdown** — below the built-in task types you will find two sections:

- **My Templates** — templates you created
- **Shared Templates** — templates shared by teammates

Select a template to load all its tasks into the current list.

### Managing Templates

Click **Manage Templates** to open the template management drawer:

| Action           | Description                                         |
| ---------------- | --------------------------------------------------- |
| Enable / Disable | Toggle whether the template appears in the dropdown |
| Rename           | Change the template's display name                  |
| Share            | Toggle sharing with the rest of the team            |
| Preview JSON     | View the raw task list configuration                |
| Delete           | Permanently remove the template                     |

## Task Triggers

Triggers schedule a template to run automatically on a timed or event-based schedule — no manual intervention required.

### Opening Triggers

Click the **Triggers** button in the Run Tasks toolbar to open the Trigger drawer.

### Trigger Types

| Type                | Description                                                                             |
| ------------------- | --------------------------------------------------------------------------------------- |
| **One-Time**        | Executes the template once at a specific date and time                                  |
| **Interval**        | Repeats every N minutes                                                                 |
| **Cron**            | Runs on a cron schedule with a configurable timezone                                    |
| **On New Artifact** | Fires when a new Azure DevOps pipeline build artifact is published on a selected branch |

### Trigger Target

Each trigger specifies which sessions to run the template against:

| Target Type           | Description                                                            |
| --------------------- | ---------------------------------------------------------------------- |
| **Specific Sessions** | Select one or more of your active sessions by ID                       |
| **Config Name**       | Run against all active sessions matching a specific configuration name |

### Creating a Trigger

1. Click **New Trigger** inside the Trigger drawer.
2. Enter a **name** for the trigger.
3. Select the **template** to execute.
4. Choose the **trigger type** and fill in the schedule details.
5. Select the **target** (sessions or config name).
6. Optionally set a **max run limit** (default: 100) to prevent runaway executions.
7. Toggle **Enabled** to activate immediately.
8. Click **Save**.

### Trigger Run History

Click **View Runs** (⋯ menu on any trigger) to see its execution history. Each run shows:

| Field    | Description                            |
| -------- | -------------------------------------- |
| Status   | Running / Completed / Failed / Skipped |
| Started  | When the trigger fired                 |
| Finished | When execution completed               |

## Monitoring Task Progress

All Run Tasks executions are tracked as **Task Jobs**. Switch to the **Task Jobs** tab in the session detail to monitor them.

Task jobs are displayed in a hierarchical tree — the root node represents the full run, with child nodes for each machine step. See [Run Tasks — Task Status](../../features/run-tasks#task-status) in the Features documentation for full details.
