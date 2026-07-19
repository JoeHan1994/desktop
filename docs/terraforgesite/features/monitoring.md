# Monitoring

The **Monitoring** section surfaces error-level log entries detected across your test sessions' virtual machines. It aggregates matching messages by content hash so you can quickly spot recurring issues and track them.

## Overview

Navigate to **Monitoring** in the sidebar. The page shows a searchable, filterable data table of **aggregated log entries** — each row represents a unique error message found across one or more machines.

## Search & Filters

A filter bar at the top of the page lets you narrow down results:

| Filter              | Options                                           | Default        |
| ------------------- | ------------------------------------------------- | -------------- |
| **Scope**           | My Sessions / All Sessions                        | My Sessions    |
| **Status**          | Active / Dismissed / All Statuses                 | Active         |
| **Product**         | Dropdown populated from detected products         | All Products   |
| **File Path**       | Dropdown populated from detected log file paths   | All File Paths |
| **Detected Within** | Last 1 / 3 / 7 / 14 / 30 / 90 days, or All Time   | All Time       |
| **Keyword**         | Free-text search across the error message content | —              |

Click **Clear** to reset all filters to their defaults. The **Refresh** button forces an immediate re-fetch.

## Data Table

Each row in the table displays:

| Column            | Description                                                                            |
| ----------------- | -------------------------------------------------------------------------------------- |
| **Product**       | The software product that generated the log entry                                      |
| **Message**       | The error message text (truncated to 120 characters in the table; hover for full text) |
| **Occurrences**   | Total number of times this error has been detected across all machines                 |
| **Last Detected** | Timestamp of the most recent occurrence                                                |
| **Status**        | `Active` (red badge) or `Dismissed` (grey badge)                                       |
| **Actions**       | Toggle status button — dismiss or reactivate the entry                                 |

Click any row to open the **Detail Drawer** for a complete view.

## Detail Drawer

Clicking a row opens a right-side drawer that includes:

### Summary

- **Status** — Active or Dismissed badge
- **Total Occurrences** — aggregate count across all machines
- **Product** — the product name

### Full Message

The complete error message displayed in a monospace code block with a **Copy** button for easy clipboard access. Active entries are highlighted with a red border.

### Affected Machines

A table listing every machine where this error was detected:

| Column            | Description                                                               |
| ----------------- | ------------------------------------------------------------------------- |
| **Session**       | The session ID containing the machine                                     |
| **Machine**       | Machine ID (clickable link to the machine detail page if you have access) |
| **User ID**       | The session owner                                                         |
| **Count**         | Number of occurrences on this specific machine                            |
| **Last Detected** | When the error was last seen on this machine                              |
| **Status**        | Per-machine Active / Dismissed status                                     |
| **Logs**          | Direct link to the relevant log file in the log viewer                    |

::: tip Machine links
Machine links are only clickable for sessions you own or that have been shared with you. Administrators can access all machine links.
:::

## Status Management

Each log entry has a status that controls whether it appears in the default "Active" filter:

- **Active** — a live issue that needs attention
- **Dismissed** — a known or resolved issue hidden from the default view

### Changing Status

You can toggle status from two places:

1. **Actions column** in the data table — click the bug icon to open a scope picker
2. **Detail drawer footer** — dedicated buttons for each scope

Both places offer two scope options:

- **My sessions only** — changes the status for your sessions only
- **All sessions** — changes the status across all sessions platform-wide

::: info
Dismissing an entry doesn't delete it. Switch the Status filter to "All Statuses" or "Dismissed" to see dismissed entries again. You can reactivate a dismissed entry at any time with "Mark as bug".
:::

## Auto-refresh

The log table refreshes automatically every **60 seconds**. Filter options (products, file paths, statuses) are cached for **5 minutes** before re-fetching.
