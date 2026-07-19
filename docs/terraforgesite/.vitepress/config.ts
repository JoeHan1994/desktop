import { fileURLToPath } from 'node:url'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid({
  title: 'Terraforge Docs',
  description: 'Test environment management and automated test execution platform',
  // Deployed under /docs/ sub-path in production (served by main app nginx)
  base: '/docs/',
  appearance: 'dark',
  lang: 'en-US',

  vite: {
    envDir: fileURLToPath(new URL('../..', import.meta.url)),
  },

  // Ignore dead links to localhost (dev URLs referenced in setup docs)
  ignoreDeadLinks: [/^http:\/\/localhost/],

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#3b82f6' }],
  ],

  themeConfig: {
    logo: { src: '/favicon.svg', alt: 'Terraforge Docs' },
    siteTitle: 'Terraforge Docs',

    // ── Top navigation ──────────────────────────────────────────────
    nav: [
      { text: 'Terraforge Site', link: 'https://terraforge.southeastasia.cloudapp.azure.com/' },
      { text: 'Feedback', link: 'https://terraforge.southeastasia.cloudapp.azure.com/feedback' },
      { text: 'Guide', link: '/guide/introduction', activeMatch: '/guide/' },
      { text: 'Features', link: '/features/', activeMatch: '/features/' },
    ],

    // ── Sidebar ──────────────────────────────────────────────────────
    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is Terraforge?', link: '/guide/introduction' },
            { text: 'Getting Started', link: '/guide/getting-started' },
          ],
        },
        {
          text: 'Quick Start',
          items: [
            { text: 'Checkout and Connect to a Session', link: '/guide/checkout-and-connect' },
            { text: 'Assign Session', link: '/guide/assign-session' },
            { text: 'Share Session', link: '/guide/share-session' },
            { text: 'Checkpoints and Restore', link: '/guide/checkpoints' },
            { text: 'Extend Days', link: '/guide/extend-days' },
            { text: 'Check In Session', link: '/guide/checkin-session' },
            { text: 'Delete Session', link: '/guide/delete-session' },
            { text: 'Prohibit Auto Shutdown', link: '/guide/prohibit-auto-shutdown' },
            { text: 'View Test Run Results', link: '/guide/test-runs' },
            { text: 'View Monitoring Logs', link: '/guide/monitoring' },
          ],
        },
        {
          text: 'Run Tasks',
          items: [
            { text: 'Overview', link: '/guide/run-tasks/' },
            { text: 'AAD Enrollment', link: '/guide/run-tasks/aad-enrollment' },
            { text: 'AAD Unrollment', link: '/guide/run-tasks/aad-unrollment' },
            { text: 'Create Checkpoint', link: '/guide/run-tasks/create-checkpoint' },
            { text: 'Enable VS Remote Debugger', link: '/guide/run-tasks/enable-vs-remote-debugger' },
            { text: 'Install Applications', link: '/guide/run-tasks/install-applications' },
            { text: 'Reboot Machine', link: '/guide/run-tasks/reboot-machine' },
            { text: 'Restore Session', link: '/guide/run-tasks/restore-session' },
            { text: 'Run Scripts', link: '/guide/run-tasks/run-scripts' },
            { text: 'Upgrade SCCM', link: '/guide/run-tasks/upgrade-sccm' },
            { text: 'Manage Templates', link: '/guide/run-tasks/manage-templates' },
            { text: 'Triggers', link: '/guide/run-tasks/triggers' },
          ],
        },
      ],
      '/features/': [
        {
          text: 'Features',
          items: [
            { text: 'Overview', link: '/features/' },
            { text: 'Dashboard', link: '/features/dashboard' },
            { text: 'Sessions', link: '/features/sessions' },
            { text: 'Configurations', link: '/features/configurations' },
            { text: 'Test Runs', link: '/features/test-runs' },
            { text: 'Monitoring', link: '/features/monitoring' },
            { text: 'Work Items', link: '/features/work-items' },
            { text: 'Run Tasks', link: '/features/run-tasks' },
            { text: 'Global Search', link: '/features/global-search' },
          ],
        },
      ],
    },

    // ── Search ───────────────────────────────────────────────────────
    search: {
      provider: 'local',
      options: {
        detailedView: true,
      },
    },

    // ── Social links ─────────────────────────────────────────────────
    socialLinks: [],

    // ── Footer ───────────────────────────────────────────────────────
    footer: {
      message: 'Internal use only — Terraforge Documentation',
      copyright: `© ${new Date().getFullYear()} PatchMyPC`,
    },

    // ── Edit link ────────────────────────────────────────────────────
    // editLink: {
    //   pattern: 'https://github.com/PatchMyPC/Terraforge-Infra/edit/main/Terraforge.Web/docs/:path',
    //   text: 'Edit this page on GitHub',
    // },

    // ── Last updated ─────────────────────────────────────────────────
    lastUpdated: {
      text: 'Last updated',
      formatOptions: {
        dateStyle: 'short',
      },
    },

    // ── Outline ──────────────────────────────────────────────────────
    outline: {
      level: [2, 3],
      label: 'On this page',
    },
  },

  // ── Mermaid config ─────────────────────────────────────────────────
  mermaid: {
    theme: 'dark',
  },
  mermaidPlugin: {
    class: 'mermaid',
  },

  markdown: {
    lineNumbers: true,
    theme: {
      light: 'github-light',
      dark: 'github-dark',
    },
    container: {
      tipLabel: 'Tip',
      warningLabel: 'Warning',
      dangerLabel: 'Danger',
      infoLabel: 'Info',
      detailsLabel: 'Details',
    },
  },
})
