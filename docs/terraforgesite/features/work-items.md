# Work Items

**Work Items** shows Azure DevOps work items assigned to you, pulled directly from your organisation's Azure DevOps project. The page provides a read-only, at-a-glance view of your current tasks without leaving Terraforge.

## Overview

Navigate to **Work Items** in the sidebar. The page displays work items assigned to you, organised into three tabs by state.

## Tabs

| Tab                  | Shows                                                                       |
| -------------------- | --------------------------------------------------------------------------- |
| **Active**           | Work items in **New** or **Active** state — things that need your attention |
| **Resolved**         | Work items in **Resolved** state — completed but not yet closed             |
| **Closed this week** | Work items in **Closed** state                                              |

Each tab shows a badge with the item count. Switch between tabs to see different states.

## Data Table

Each tab displays a sortable data table with the following columns:

| Column            | Description                                                                            |
| ----------------- | -------------------------------------------------------------------------------------- |
| **State**         | Badge showing the work item state: `New`, `Active`, `Resolved`, or `Closed`            |
| **ID**            | The Azure DevOps work item ID — clickable link that opens the item in Azure DevOps     |
| **Title**         | Work item title (truncated to 2 lines; hover for full text)                            |
| **Type**          | Work item type (e.g. Bug, Request, Manual Tests, Test Plan)                            |
| **Priority**      | Colour-coded badge: `Critical` (red), `High` (amber), `Medium` (grey), `Low` (outline) |
| **Assigned To**   | The team member the item is assigned to                                                |
| **Changed**       | Last modified date (on the Active and Closed tabs)                                     |
| **Resolved Date** | Date the item was resolved (shown only on the Resolved tab)                            |

All columns support sorting by clicking the column header.

## Search

A **search box** in the top-right corner lets you filter the current tab's items by keyword. The filter applies across all visible columns (ID, title, type, assignee, etc.) in real time.

## Azure DevOps Integration

Work items are fetched from Azure DevOps. Clicking a work item's **ID** opens it directly in Azure DevOps in a new browser tab.

::: tip
This page is read-only. To create, edit, or transition work items, use Azure DevOps directly. Changes made in Azure DevOps will be reflected here on the next refresh.
:::

## Auto-refresh

All three tabs refresh automatically every **2 minutes**. You can also switch tabs to trigger a data fetch if the tab hasn't been loaded yet.
