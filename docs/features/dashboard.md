# Dashboard

The **Dashboard** is your home screen — a live overview of the platform's current state.

---

## Layout

The Dashboard is divided into two zones:

```text
┌──────────────────────────────── KPI Stat Cards ────────────────────────────────────┐
│  Session Quota │ Shared With Me │ Log Monitoring │ Active Work Items │ Checkout    │
└────────────────────────────────────────────────────────────────────────────────────┘
┌────── My Sessions ──────┐  ┌──── Shared With Me ────┐
│  Status bar & breakdown │  │  Config name badges     │
│  Active / Expiring / …  │  │  Grouped by status      │
├────── Test Runs ────────┤  ├──── Work Items ─────────┤
│  Running / Failed today │  │  Pie chart by type      │
│  5-day activity summary │  │  Priority breakdown     │
└─────────────────────────┘  └─────────────────────────┘
```

---

## KPI Stat Cards

A full-width row of **5 stat cards** at the top of the page. Each card shows a key metric with a mini donut chart or description. Clicking a card navigates to the relevant section.

| Card                   | Description                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Session Quota**      | Session usage vs. quota limit as a progress bar. Shows active and pending counts separately. Turns amber when the limit is reached |
| **Shared With Me**     | Number of sessions shared with you by other users. Mini donut shows the percentage currently active                                |
| **Log Monitoring**     | Count of active log monitoring issues assigned to you, with the number of affected products. Turns red when issues are present     |
| **Active Work Items**  | Total active work items assigned to you. Mini donut shows the percentage that are high or critical priority                        |
| **Checkout Available** | Number of pre-configured sessions available for quick checkout. Clicking opens the Checkout dialog directly                        |

---

## Content Cards

Below the KPI row, a **2-column grid** displays four detail cards:

### My Sessions

Shows a visual breakdown of your sessions by status:

- **Status distribution bar** — colour-coded horizontal bar (green = Active, amber = Expiring, red = Expired)
- **Status counts** — Active, Expiring, and Expired session totals
- **Machine count** — total virtual machines across all your sessions
- **Expiry warning** — highlights sessions expiring within the next 24 hours

Click **View All** to navigate to the Sessions page.

### Shared With Me

Displays sessions that other team members have shared with you:

- **Config name badges** — grouped by session configuration name with counts
- **Status breakdown** — Active / Expiring / Expired counts for shared sessions

::: tip
Sessions owned by the `devopsagent` service account are automatically filtered out.
:::

### Test Runs

Summarises recent test execution activity:

- **Running badge** — number of test runs currently in progress
- **Failed Today badge** — count of test runs that failed today (highlighted in red)
- **Stats breakdown** — three blocks showing Running, Failed Today, and Last 5 Days totals

Click **View All** to navigate to the Test Runs page.

### Active Work Items

Provides a breakdown of your active work items by type and priority:

- **Pie chart** — visual distribution of work item types (Bug, Request, Manual Tests, Test Plan, etc.)
- **Type legend** — each type listed with its icon and count
- **Priority badges** — Critical, High, Medium, and Low priority counts with colour coding

Click **View All** to navigate to the Work Items page.

---

## Auto-refresh

Each data source refreshes independently on its own interval:

| Data            | Refresh interval |
| --------------- | ---------------- |
| Sessions        | 60 seconds       |
| Shared Sessions | 60 seconds       |
| Checkout Groups | 60 seconds       |
| Test Run Stats  | 60 seconds       |
| Work Items      | 2 minutes        |
| Log Monitoring  | 2 minutes        |
| Session Quota   | 3 minutes        |

Real-time events (e.g., a session status change or a run completing) trigger immediate cache invalidation via WebSocket/SSE without waiting for the next refresh cycle.
