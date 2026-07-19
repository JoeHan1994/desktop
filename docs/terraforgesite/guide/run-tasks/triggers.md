# Triggers

**Triggers** let you schedule a saved task template to run automatically — on a fixed time, on a repeating interval, via a cron expression, or whenever a new build artifact is published to an Azure DevOps pipeline.

## Opening Triggers

1. Open a session and navigate to the **Run Tasks** tab.
2. Click the **Triggers** button in the toolbar to open the **Task Triggers** drawer.

## Trigger List

The drawer shows all triggers you have created, regardless of which session you opened it from. Each trigger card displays:

| Field         | Description                                               |
| ------------- | --------------------------------------------------------- |
| **Name**      | Human-readable label for the trigger                      |
| **Template**  | The task template that will be executed                   |
| **Schedule**  | A summary of when the trigger fires                       |
| **Target**    | Which sessions or config group the tasks run against      |
| **Next run**  | The next scheduled execution time (if applicable)         |
| **Last run**  | The most recent execution time and total run count        |
| **Status**    | Active / Disabled toggle                                  |

Use the **Active / Disabled** toggle on a trigger card to pause or resume it without deleting it.

## Creating a Trigger

Click **New Trigger** in the drawer header. A form appears with the following fields.

### General

| Field            | Description                                                      |
| ---------------- | ---------------------------------------------------------------- |
| **Trigger Name** | A short, descriptive label (e.g., `Nightly Publisher Install`)   |
| **Template**     | Select the task template to execute when the trigger fires       |
| **Enabled**      | Whether the trigger is active immediately after creation         |
| **Max Runs**     | Maximum number of times this trigger can fire (default: 100). Set to unlimited by leaving blank. |

### Schedule Type

Choose one of four trigger types:

#### One-Time

Runs the template exactly once at a specific date and time.

| Field              | Description                            |
| ------------------ | -------------------------------------- |
| **Scheduled Time** | The date and time (local timezone) to run |

The trigger is automatically disabled after it fires.

#### Interval

Runs the template repeatedly at a fixed time interval.

| Field                | Description                                          |
| -------------------- | ---------------------------------------------------- |
| **Interval (minutes)** | How many minutes to wait between consecutive runs |

::: tip
Use an interval trigger for frequent background operations, such as checking machine health every 30 minutes.
:::

#### Cron

Runs the template on a [cron schedule](https://crontab.guru/).

| Field               | Description                                                |
| ------------------- | ---------------------------------------------------------- |
| **Cron Expression** | Standard 5-field cron expression (e.g., `0 9 * * 1-5` for 9 AM on weekdays) |
| **Timezone**        | The timezone used to evaluate the cron expression         |

**Common examples:**

| Expression      | Meaning                        |
| --------------- | ------------------------------ |
| `0 9 * * 1-5`   | 9:00 AM, Monday–Friday          |
| `0 0 * * *`     | Midnight every day              |
| `*/30 * * * *`  | Every 30 minutes                |
| `0 18 * * 5`    | 6:00 PM every Friday            |

#### On New Artifact

Fires when a new build artifact is published to a specified Azure DevOps pipeline branch. This is useful for automatically installing the latest build as soon as CI produces it.

| Field                | Description                                                                      |
| -------------------- | -------------------------------------------------------------------------------- |
| **Application Type** | `Publisher` or `Advanced Insights` — filters the available pipelines             |
| **Pipeline**         | Select the Azure DevOps pipeline to monitor                                      |
| **Branch**           | The branch to watch for new builds                                               |
| **Poll Interval (minutes)** | How often Terraforge checks for a new artifact (minimum: 1 minute)      |

::: info How it works
Terraforge records the last known build ID for the selected pipeline and branch. Each poll cycle, it fetches the latest successful build ID. If the ID has changed, a new artifact is detected and the template is queued for execution.
:::

### Target — Which Sessions to Run Against

The trigger can target sessions in two ways:

| Target Type       | Description                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| **Sessions**      | Run against one or more specific sessions (selected from your active sessions at creation time)  |
| **Config**        | Run against all active sessions that belong to a named configuration group                        |

#### Sessions target

A multi-select list shows your active sessions. Select one or more sessions to include.

::: tip
The session you opened the Triggers drawer from is pre-selected by default.
:::

#### Config target

Enter the **Config Name** (the configuration group name shown on the session list). Whenever the trigger fires, it runs against all currently active sessions in that config group — meaning newly checked-out sessions are automatically included in future runs.

## Editing and Deleting Triggers

Use the **⋮ menu** on any trigger card:

| Action           | Description                                      |
| ---------------- | ------------------------------------------------ |
| **Edit**         | Open the form to modify any trigger settings     |
| **View History** | See the execution history for this trigger       |
| **Delete**       | Permanently remove the trigger                   |

## Execution History

Click **⋮ → View History** on a trigger to see its run log. Each run record shows:

| Field           | Description                                     |
| --------------- | ----------------------------------------------- |
| **Status**      | Running / Completed / Failed / Skipped          |
| **Sessions**    | Number of sessions the tasks ran against        |
| **Started at**  | When the run began                              |
| **Finished at** | When the run completed (or failed)              |
| **Message**     | Error or status message (if any)                |

A run is marked **Skipped** when no target sessions are available at fire time (e.g., all sessions in the target config have expired).

## Trigger Status Reference

| Status      | Meaning                                                            |
| ----------- | ------------------------------------------------------------------ |
| **Active**  | The trigger is enabled and will fire according to its schedule     |
| **Disabled** | The trigger is paused and will not fire until re-enabled          |
| **Running** | A run is currently in progress                                     |
| **Completed** | The last run finished successfully                               |
| **Failed**  | The last run encountered an error                                  |
| **Skipped** | The last run was skipped (no matching sessions found)              |
