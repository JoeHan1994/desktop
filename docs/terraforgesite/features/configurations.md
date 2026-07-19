# Configurations

The **Configurations** page (`/configs`) is a read-only reference that documents every active session environment template. Use it to understand what machines a configuration provisions, what OS images they use, and how the environment topology looks before you check out a session.

## Overview

Navigate to **Configurations** in the sidebar. The page uses a **sidebar + detail** layout:

- **Left sidebar** — a scrollable list of all active configurations, grouped alphabetically.
- **Right panel** — the details of the selected configuration.

Clicking a configuration name in the sidebar loads its details instantly on the right.

::: tip URL-based navigation
You can link directly to a specific configuration by appending `?name=<config-name>` to the URL. If the name matches an active configuration, it is automatically selected on load.

Example: `/configs?name=Lite-Dev`
:::

## Configuration Detail Tabs

The detail panel has three tabs:

### Overview

A visual summary of the configuration:

- **Machines table** — lists each virtual machine in the configuration with its index, OS image (offer + SKU), and assigned roles.
- **Architecture diagram** — a Mermaid flowchart rendered directly in the browser, showing how machines relate to each other and to any shared resources.

The diagram uses the same source data as the JSON tab, so it always reflects the current definition.

**Diagram controls:**

| Control             | Action                                                      |
| ------------------- | ----------------------------------------------------------- |
| **＋ / －** buttons | Zoom in and out                                             |
| **Download** button | Export the diagram as an SVG file                           |
| **Refresh** button  | Re-render the diagram (useful if the initial render stalls) |

The diagram theme follows the application's dark/light mode setting automatically.

### Diagram

A full-viewport rendering of the Mermaid architecture diagram — identical content to the mini-diagram in Overview, but larger and easier to read. Use this tab for a deeper look at complex multi-machine topologies.

### JSON

The raw configuration JSON, formatted with two-space indentation for readability. This is the exact definition used when provisioning a new session from this configuration.

Key fields you will typically find in a configuration JSON:

| Field              | Description                                                                         |
| ------------------ | ----------------------------------------------------------------------------------- |
| `azure.location`   | Azure region where the session is provisioned (shown as a badge in the page header) |
| `virtual_machines` | Array of VM definitions — each with image, roles, and settings                      |
| `resource_groups`  | Azure resource group settings including the `config_name`                           |

## Using Configurations

Configurations are the templates from which sessions are created. When you check out a session, you are requesting an instance of a specific configuration.

To look up which configuration a session uses, open the session and check the **Config** field in the session details.
