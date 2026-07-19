# Test Runs Instructions

## Overview

The **Test Runs** page lets you browse, filter, and inspect every automated test execution that has run against your sessions. This guide walks you through the full workflow — from finding a run to reading its results and logs.

## What Is a Test Run?

A test run is a single automated test execution triggered against a session environment. Each run records:

- Which **product** was tested (Publisher, Insights, or Catalog)
- The **status** of the execution (Running, Passed, Failed, etc.)
- **Per-test-case results** with pass/fail outcomes and error details
- **Execution logs** produced during the run
- Metadata: who queued it, which machine it ran on, how long it took

## Navigating to Test Runs

Click **Test Runs** in the left sidebar. The page opens with a list of recent test runs filtered to **your own runs from the last 5 days** by default.

## The Test Run List

Each row in the table represents one test run and shows:

| Column        | Description                                             |
| ------------- | ------------------------------------------------------- |
| **Status**    | Color-coded badge indicating the run outcome            |
| **Title**     | Descriptive name of the test run                        |
| **Product**   | The product under test (Publisher / Insights / Catalog) |
| **Version**   | Internal build version                                  |
| **Branch**    | Source branch the build was created from                |
| **Queued By** | The user who triggered the run                          |
| **Started**   | How long ago the run started (relative time)            |

### Status Badges

| Badge           | Meaning                          |
| --------------- | -------------------------------- |
| 🔵 **Running**  | Tests are actively executing     |
| 🟢 **Passed**   | All tests completed successfully |
| 🔴 **Failed**   | One or more tests failed         |
| 🟡 **Warning**  | Completed with warnings          |
| ⚪ **Pending**  | Queued, waiting to start         |
| ⚪ **Canceled** | Execution was manually stopped   |

## Filtering Test Runs

Click the **Search** button (top-left of the list) to open the filter panel.

### Available Filters

**Date Range** — Set a From and To date to narrow the list. The button label shows a summary of the active filter (e.g. `Last 5 days` or `2025/01/01 – 2025/01/31`).

**Status** — Filter by a specific run outcome (Running, Passed, or Failed), or leave as `All Statuses` to show everything.

**Product** — Limit results to a specific product: Publisher, Insights, or Catalog.

**Queued By** — Show runs triggered by a specific user, or switch to `All Users` to see everyone's runs.

### Resetting Filters

Click the **Reset** button inside the filter panel to return all filters to their defaults (last 5 days, current user).

## Inspecting a Test Run

<video controls style="width:100%;max-width:960px;border-radius:8px;">
  <source src="https://tfpfsstorage.blob.core.windows.net/tfp-public/ViewTestRunsResults.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

Click any row to open the **Detail Panel** on the right side of the screen.

### Resizing the Panel

Drag the vertical **grip handle** (⠿) on the left edge of the panel to adjust its width. You can also:

- Press **← Arrow** to make the panel wider
- Press **→ Arrow** to make the panel narrower

### Opening in a Full Page

Click the **↗ open icon** in the panel header to open the test run in a dedicated full-screen page (`/testruns/{id}/detail`). This is useful for sharing a direct link or inspecting results without the split-screen constraint.

### Fullscreen Mode

Click the **⤢ expand icon** to make the detail panel cover the entire screen. Click it again (or press the same button) to return to split-screen view.

### Closing the Panel

Click the **✕ close icon** in the panel header, or click elsewhere on the list.

## Detail Panel Tabs

The panel has two or three tabs depending on the product.

### Summary

Displays an overview of the test run:

| Field                  | Description                          |
| ---------------------- | ------------------------------------ |
| **Status**             | Outcome badge                        |
| **Duration**           | Total execution time (e.g. `4m 32s`) |
| **Product**            | Product under test                   |
| **Version**            | Internal build version               |
| **Machine**            | Machine ID the run executed on       |
| **Queued By**          | Who triggered the run                |
| **Config**             | Session configuration name           |
| **Started / Finished** | Exact timestamps                     |

If the run was triggered by an Azure DevOps pipeline, a **View in Azure DevOps** link appears, opening the originating build directly.

### Test Results

Shows individual test case outcomes parsed from the run's result files.

Each result row displays:

- **Test class** and **test method** name
- **Result** badge (Passed / Failed / Error / Timeout / Inconclusive / Aborted)
- **Duration** of that individual test
- **Error message** (expanded inline for failures)
- **Owner** assigned to the test case
- **Category** tag (if set)

::: tip
For **Catalog** product runs, results are displayed in a different format tailored to catalog-specific test output. The experience is the same — click a row to expand error details.
:::

### Logs

> Available for Publisher and Insights runs only (not shown for Catalog).

Lists all log files stored for this test run. Each file shows its filename and folder path within the run's storage location.

**To view a log file:** Click its row. The content loads inline — `.trx` files are rendered as a structured viewer, and Markdown (`.md`) files are rendered with formatting. Other file types are shown as plain text.

**To go back:** Click the **← Back to log files** button to return to the file list.

## Full Detail Page

Opening a run in its own page (`/testruns/{id}/detail`) provides the same Summary + Test Results + Logs tabs without the split-screen layout — ideal for focused investigation or sharing with teammates via URL.

## Additional resources

- **Finding a failed run quickly** — Set the Status filter to `Failed` and widen the date range to surface recent failures.
- **Checking a teammate's run** — Change the **Queued By** filter to `All Users`, then look for their name in the table's Queued By column.
- **Sharing a run** — Use the **↗ open in new page** button and copy the URL. Anyone with access to Terraforge can open the same run directly.
- **Tracking a live run** — Status updates every time you navigate to the page. If a run is `Running`, refresh the page or re-open the detail panel to see updated counts.
