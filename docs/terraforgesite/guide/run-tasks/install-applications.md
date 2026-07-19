# Install Applications

The **Install Applications** task deploys one or more software packages to target machines. Each application in the list runs in order on the selected machines.

## When to Use

Use this task to install a build of Publisher, Advanced Insights, Catalog, or any other software onto your session machines before running tests.

## Configuration Fields

<video controls style="width:100%;max-width:960px;border-radius:8px;">
  <source src="https://tfpfsstorage.blob.core.windows.net/tfp-public/RunTasks-InstallApplications.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

### Application List

The task supports installing multiple applications in a single step. Click **+ Add Application** to add entries to the list.

Each application entry has the following fields:

#### Application Type

| Type                  | Description                     |
| --------------------- | ------------------------------- |
| **Publisher**         | PatchMyPC Publisher application |
| **Advanced Insights** | Advanced Insights application   |
| **Others**            | Any other software package      |

#### Application Source

| Source       | Description                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------ |
| **Product**  | Select a specific version from the internal product catalog (official releases and pre-releases) |
| **Pipeline** | Pick a build artifact directly from an Azure DevOps pipeline                                     |

## Product Source

When **Product** is selected as the source:

1. **Product Name** — Choose from a searchable dropdown of available product names.
2. **Version** — A second dropdown loads available versions for the selected product.
3. **Official / Pre-release** — Versions are tagged to indicate whether they are official releases.

Use ☆ to toggle a product as a favourite — favourited products appear at the top of the list.

## Pipeline Source

When **Pipeline** is selected as the source:

### 1. Select a Pipeline

Choose from a list of saved Azure DevOps pipelines filtered by the selected application type (Publisher or Advanced Insights).

If no pipelines are saved yet, click **+ Add** to register a new pipeline:

- **Pipeline ID** — The numeric ID from the Azure DevOps pipeline URL. Click **How to find ID & Name?** for a visual guide.
- **Display Name** — A human-readable label (e.g., `Publisher CI Build`).

### 2. Select a Branch

Once a pipeline is selected, a branch picker loads available branches from Azure DevOps.

- **⭐ Favourite branches** — branches you have previously saved appear at the top.
- **Other branches** — all other live branches from the pipeline.
- Click the star icon next to any branch to save it as a favourite for quick access next time.

### 3. Select an Artifact

After selecting a branch, the task fetches available MSI artifacts from the latest successful build on that branch.

- Artifacts are grouped by their parent folder in the build output.
- Select a specific MSI file, or choose **Latest** to always use the most recently published artifact on that branch.

### Uninstall Mode

Toggle **Uninstall** on any application entry to remove it instead of installing it. The same source and version selectors apply — the task will uninstall the matching package.

### Target Roles

Selects which machines in the session this task runs against. See [Target Roles](./index#target-roles) for available options.

## Behaviour

- Applications in the list are installed sequentially on each target machine.
- If an installation fails, the task stops and marks as Failed.
- The task does **not** automatically reboot after installation. Add a [Reboot Machine](./reboot-machine) step after if a restart is required.

## Additional resources

**Install a specific Publisher release for regression testing:**

1. Add **Install Applications**.
2. Set source to **Product**, select `Publisher`, and pick the exact version.
3. Set target roles to `PMPC-Publisher`.
4. Run the task.

**Install the latest CI build from a feature branch:**

1. Add **Install Applications**.
2. Set source to **Pipeline**, select the CI pipeline, choose the feature branch, and select **Latest** artifact.
3. Set target roles to the machines that need the build.
4. Run the task.

**Install multiple packages in one step:**

1. Add **Install Applications**.
2. Click **+ Add Application** multiple times to queue Publisher, Advanced Insights, and any extras.
3. All packages install sequentially in the order listed.
