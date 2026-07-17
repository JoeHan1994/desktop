# Monitoring

The **Monitoring** page helps you spot and triage recurring error-level log entries detected across your test sessions' virtual machines. Entries are aggregated by content so that identical errors across multiple machines appear as a single row with an occurrence count.

<video controls style="width:100%;max-width:960px;border-radius:8px;">
  <source src="https://tfpfsstorage.blob.core.windows.net/tfp-public/ViewMonitoringLogs.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

---

## Before you start

- Sign in to Terraforge.
- Click **Monitoring** in the left sidebar to open the page.

---

## Viewing Log Entries

The page opens with a data table showing aggregated error entries. By default you see **Active** entries for **My Sessions** with no time restriction.

Each row in the table shows:

| Column            | Description                                                            |
| ----------------- | ---------------------------------------------------------------------- |
| **Product**       | The software product that generated the log entry                      |
| **Message**       | Error message text (truncated to 120 characters; hover for full text)  |
| **Occurrences**   | Total times this error has been detected across all matching machines   |
| **Last Detected** | Timestamp of the most recent occurrence                                |
| **Status**        | `Active` (red badge) or `Dismissed` (grey badge)                       |
| **Actions**       | Toggle button to dismiss or reactivate the entry                       |

---

## Filtering Entries

A filter bar at the top of the page lets you narrow results:

| Filter              | Options                                         | Default      |
| ------------------- | ----------------------------------------------- | ------------ |
| **Scope**           | My Sessions / All Sessions                      | My Sessions  |
| **Status**          | Active / Dismissed / All Statuses               | Active       |
| **Product**         | Dropdown populated from detected products       | All Products |
| **File Path**       | Dropdown populated from detected log file paths | All File Paths |
| **Detected Within** | Last 1 / 3 / 7 / 14 / 30 / 90 days, or All Time | All Time     |
| **Keyword**         | Free-text search across the error message       | —            |

Click **Clear** to reset all filters to their defaults. The **Refresh** button forces an immediate re-fetch.

::: tip
Use the **Keyword** filter to quickly search for a specific error string or exception type across all detected entries.
:::

---

## Inspecting an Entry

Click any row to open a **Detail Drawer** on the right side of the screen.

### Summary

The drawer header shows:

- **Status** — Active or Dismissed badge
- **Total Occurrences** — aggregate count across all machines
- **Product** — the product that generated the entry

### Full Message

The complete error message is displayed in a monospace code block. Active entries are highlighted with a red border. Click the **Copy** button to copy the full message to the clipboard.

### Affected Machines

A table listing every machine where this error was detected:

| Column            | Description                                                                   |
| ----------------- | ----------------------------------------------------------------------------- |
| **Session**       | The session ID containing the machine                                         |
| **Machine**       | Machine ID (clickable link to the machine detail if you have access)          |
| **User ID**       | The session owner                                                             |
| **Count**         | Number of occurrences on this specific machine                                |
| **Last Detected** | When the error was last seen on this machine                                  |
| **Status**        | Per-machine Active / Dismissed status                                         |
| **Logs**          | Direct link to the relevant log file in the session log viewer                |

::: tip
Machine links are only clickable for sessions you own or that have been shared with you. Administrators can click all machine links.
:::

---

## Dismissing and Reactivating Entries

Each log entry has a status that controls whether it appears in the default **Active** filter:

- **Active** — a live issue that needs attention (shown as a red bug icon)
- **Dismissed** — a known or resolved issue hidden from the default view

### How to Change Status

You can toggle status from two places:

1. **Actions column** in the data table — click the icon to open a scope picker.
2. **Detail drawer footer** — dedicated buttons for each scope.

Both offer two scope options:

- **My sessions only** — changes the status only for entries in your sessions.
- **All sessions** — changes the status across all sessions platform-wide.

::: info
Dismissing an entry does not delete it. Switch the Status filter to **All Statuses** or **Dismissed** to see dismissed entries again. You can reactivate a dismissed entry at any time by clicking **Mark as bug**.
:::

---

## Session-Level Log Browser

In addition to the global Monitoring page, each session detail view includes a **Monitoring** tab with two integrated sections:

### Error Alerts

A collapsible summary bar at the top of the tab showing:

- Active count and dismissed count
- Per-product breakdown (Publisher / Insights / Others)
- Total occurrences

Expand the bar to see a detail table. Click an error message to jump directly to its location in the log file below.

### Log File Viewer

A split-panel layout below the error alerts:

- **Left panel** — a file tree organized by machine → product folder → log file. Click a file to load its content.
- **Right panel** — the log content viewer with keyword highlighting and search filtering.

The viewer detects **CMTrace/SCCM log format** automatically and renders entries with color-coded severity (red for errors, yellow for warnings). Other log files are shown as plain text.

::: tip
When you click an error message in the alerts table, the viewer automatically navigates to the matching file and scrolls to the relevant line.
:::

---

## Auto-Refresh

The global monitoring table refreshes automatically every **60 seconds**. Filter options (products, file paths, statuses) are cached for **5 minutes** before re-fetching.

---

## Tips

- **Triage a new failure quickly** — leave the default filters (Active + My Sessions) and look for entries with high occurrence counts.
- **See platform-wide issues** — switch the Scope filter to **All Sessions** to see errors across every user's environments.
- **Track a dismissed issue** — change the Status filter to **Dismissed** to find entries you or others have already reviewed.
- **Jump to the source** — in the session Monitoring tab, click an error message to open the exact log file and scroll to the matching entry.
- **Share a finding** — open the detail drawer, copy the full error message, and share it with your team alongside the session and machine IDs listed in the Affected Machines table.
