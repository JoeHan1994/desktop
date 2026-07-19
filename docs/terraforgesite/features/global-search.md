# Global Search

## Overview

The **Command Palette** is a quick-access search interface that lets you jump to any page, find sessions, and trigger common actions — all without leaving the keyboard.

## Opening the Command Palette

| Platform        | Shortcut                |
| --------------- | ----------------------- |
| **macOS**       | <kbd>⌘</kbd> + <kbd>K</kbd> |
| **Windows / Linux** | <kbd>Ctrl</kbd> + <kbd>K</kbd> |
| **Mobile / Small screen** | Tap the 🔍 icon in the top header bar |

The palette is available on **every page** — sessions list, session detail, fullscreen layout, and portal views.

## Searching Pages

Start typing to filter all sidebar navigation items in real time. Results are grouped by their section label (e.g. *Sessions*, *Admin*, *System*).

Select a result with <kbd>↵</kbd> or click it to navigate immediately.

::: tip
You don't need an exact match — the search is case-insensitive and matches anywhere in the page title.
:::

## Searching Sessions

When your query is **2 characters or longer**, the palette also searches your sessions from the local cache. It matches against:

| Field            | Example             |
| ---------------- | ------------------- |
| **Session ID**   | `12345`             |
| **Config Name**  | `API-Agent`         |
| **User Name**    | `john.doe`          |

Up to **5 session results** are shown. Each result displays:

- Session ID (e.g. `#12345`)
- Configuration name
- Owner user ID
- Status badge with colour coding

Selecting a session takes you directly to its **detail page**.

## Direct "Go to" Shortcuts

For the fastest navigation, type an ID directly:

| Pattern              | Action                          | Example     |
| -------------------- | ------------------------------- | ----------- |
| **Numeric ID**       | Go to Session #\{id\}           | `12345`     |
| **Machine ID** (`vm` + digits) | Go to Machine page     | `vm101`     |

These shortcuts appear at the top of the results list with an arrow icon. Press <kbd>↵</kbd> to jump there instantly.

::: tip
Machine ID matching is case-insensitive — `VM101`, `vm101`, and `Vm101` all work.
:::

## Quick Actions

Below the search results you'll find a set of **Quick Actions** that are always available, even with an empty query:

| Action                 | Description                             | Shortcut hint |
| ---------------------- | --------------------------------------- | ------------- |
| **Toggle Theme**       | Switch between dark and light mode      | displayed in palette |
| **Toggle Sidebar**     | Collapse or expand the sidebar          | —             |
| **Copy Current URL**   | Copy the current page URL to clipboard  | —             |
| **Open Documentation** | Open the documentation site             | —             |

## Keyboard Navigation

The entire palette is keyboard-friendly:

| Key                        | Action               |
| -------------------------- | -------------------- |
| <kbd>↑</kbd> <kbd>↓</kbd> | Move between results |
| <kbd>↵</kbd>               | Select / activate    |
| <kbd>Esc</kbd>             | Close the palette    |
