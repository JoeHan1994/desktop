# Enable VS Remote Debugger

The **Enable VS Remote Debugger** task installs and starts the Visual Studio Remote Debugger (`msvsmon.exe`) on target machines, enabling you to attach a local Visual Studio instance to a process running inside the session VM.

<video controls style="width:100%;max-width:960px;border-radius:8px;">
  <source src="https://tfpfsstorage.blob.core.windows.net/tfp-public/RunTasks-EnableVSRemoteDebugger.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

---

## When to Use

Use this task when you need to debug a running process on a session machine from your local Visual Studio — for example, to step through application code, inspect memory, or diagnose a crash that only reproduces in the test environment.

---

### Target Roles

Selects which machines in the session this task runs against. See [Target Roles](./index#target-roles) for available options.

---

## Behaviour

1. Windows Firewall rules are automatically created to allow inbound traffic on the configured port.
2. The Remote Debugger process (`msvsmon.exe`) is started under a service account with sufficient privileges.
3. If **Run as Service** is enabled, the service is registered and set to start automatically.
4. The task is marked **Completed** once the debugger is listening on the configured port.

::: tip Connecting from Visual Studio
After this task completes, open Visual Studio locally and go to **Debug → Attach to Process…**, then set the **Connection type** to `Remote (no authentication)` or `Remote (Windows)` depending on the authentication mode you selected. Enter the machine's hostname or IP address followed by the port (e.g., `vm-publisher:4026`).
:::

---

## Common Workflows

**Debug an application that only fails in the test session:**

1. Add **Enable VS Remote Debugger** with the VS version matching your local installation.
2. Add **Install Applications** to deploy the build under test.
3. Run the task list, then attach Visual Studio to the target process.
