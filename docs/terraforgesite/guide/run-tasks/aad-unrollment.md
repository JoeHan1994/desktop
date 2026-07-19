# AAD Unrollment

The **AAD Unrollment** task removes a machine's Azure Active Directory enrollment — effectively disenrolling the device from an Azure AD tenant.

## When to Use

Use this task to clean up Azure AD enrollment before restoring a checkpoint or checking in a session, or to reset a machine's AAD state between test scenarios.

## Configuration Fields

<video controls style="width:100%;max-width:960px;border-radius:8px;">
  <source src="https://tfpfsstorage.blob.core.windows.net/tfp-public/RunTasks-AADUnrollment.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

### Environment

Selects which Azure AD tenant to remove the enrollment from.

| Option      | Description        |
| ----------- | ------------------ |
| **Dev**     | Development tenant |
| **Staging** | Staging tenant     |
| **Prod**    | Production tenant  |

::: tip Auto-detection
Terraforge inspects the machine roles assigned to this session and automatically selects the matching environment. When auto-detection succeeds, this field is **locked** and cannot be changed manually.
:::

### Provisioning Package Name

Specifies the name of the provisioning package used to perform the unrollment.

| Option                   | Description                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------- |
| **Default Package Name** | Uses the standard package name maintained by the team for the selected environment |
| **Custom Package Name**  | Enter a specific package name manually (e.g., `AAD-Enrollment-IntuneWinPackage`)   |

::: info
Unlike AAD Enrollment which references a `.ppkg` file by path, unrollment references the package **by name** — the name of the package that was originally installed during enrollment.
:::

### Target Roles

Selects which machines in the session this task runs against. See [Target Roles](./index#target-roles) for available options.

## Behaviour

- The task runs the unrollment operation on each target machine using the specified package name.
- No automatic reboot is triggered (unlike AAD Enrollment).

## Additional resources

**Reset AAD state between test runs:**

1. Add **AAD Unrollment** to revert the AAD join state.
2. Add **AAD Enrollment** to re-enroll with a fresh identity.
3. Continue with subsequent test tasks.

**Clean up before check-in:**

Add **AAD Unrollment** as the first step in a clean-up sequence before checking the session back into the pool, ensuring the machine starts fresh for the next user.
