# AAD Enrollment

The **AAD Enrollment** task enrolls one or more machines into Azure Active Directory using a Windows Provisioning Package (`.ppkg`).

<video controls style="width:100%;max-width:960px;border-radius:8px;">
  <source src="https://tfpfsstorage.blob.core.windows.net/tfp-public/RunTasks-AADEnrollment.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

---

## When to Use

Use this task when you need a machine in your session to be joined to Azure AD — for example, before running tests that require device compliance or Intune enrollment.

---

## Configuration Fields

### Environment

Selects which Azure AD tenant to enroll into.

| Option      | Description        |
| ----------- | ------------------ |
| **Dev**     | Development tenant |
| **Staging** | Staging tenant     |
| **Prod**    | Production tenant  |

::: tip Auto-detection
Terraforge inspects the machine roles assigned to this session and automatically selects the matching environment. When auto-detection succeeds, this field is **locked** and cannot be changed manually.
:::

### Provisioning Package

Specifies the `.ppkg` file used to perform the enrollment.

| Option              | Description                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------ |
| **Default Package** | Uses the standard provisioning package maintained by the team for the selected environment |
| **Custom Package**  | Browse and select a specific `.ppkg` file from Azure Blob Storage                          |

When **Custom Package** is selected, a file browser opens filtered to `.ppkg` files only.

### Target Roles

Selects which machines in the session this task runs against. See [Target Roles](./index#target-roles) for available options.

---

## Behaviour

- The task installs the provisioning package on each target machine.
- The machine **automatically reboots** after the package is applied.

::: warning Reboot required
A reboot is triggered automatically as part of this task. Ensure no unsaved work is in progress on the target machines.
:::

---

## Common Workflows

**Enroll before testing Intune policies:**

1. Add **AAD Enrollment** targeting the machines that need device compliance.
2. Add subsequent tasks (e.g., **Install Applications**) after enrollment.
3. The machines will reboot mid-sequence — subsequent steps start after the machines come back online.

**Using a custom package for a one-off test:**

1. Select **Custom Package** and browse for your `.ppkg` file in storage.
2. The custom file overrides the default for this specific run only.
