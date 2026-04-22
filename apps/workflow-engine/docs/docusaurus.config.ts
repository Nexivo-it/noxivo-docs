import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Noxivo Engine SDK',
  tagline: 'Developer Documentation for the Noxivo Workflow Engine',
  favicon: 'img/noxivo-logo-dark.png',

  url: 'https://noxivo.app',
  baseUrl: '/',

  organizationName: 'Nexivo-it',
  projectName: 'noxivo-engine-docs',

  onBrokenLinks: 'warn',
  trailingSlash: false,
  markdown: {
    format: 'mdx',
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/', // Serve docs at site root
          editUrl:
            'https://github.com/Nexivo-it/noxivo-saas/edit/main/apps/workflow-engine-docs/',
          docItemComponent: "@theme/ApiItem", // Derived from docusaurus-theme-openapi-docs
          remarkPlugins: [
            [require('@docusaurus/remark-plugin-npm2yarn'), {sync: true}],
          ],
        },
        blog: false, // Disable the blog plugin
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    [
      'docusaurus-plugin-openapi-docs',
      {
        id: "api",
        docsPluginId: "classic",
        config: {
          engine: {
            specPath: "static/openapi.json",
            outputDir: "docs/api-reference",
            sidebarOptions: {
              groupPathsBy: "tag",
              categoryLinkSource: "tag",
            },
            // Ensure unique translation keys for similar paths if needed
            // but the plugin should ideally handle this. 
            // The conflict usually happens if multiple tags have same path summaries.
          }
        }
      },
    ],
  ],

  themes: ["docusaurus-theme-openapi-docs"],

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Noxivo Engine SDK',
      logo: {
        alt: 'Noxivo Logo',
        src: 'img/noxivo-logo-dark.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          to: '/api-reference/noxivo-engine-api',
          label: 'API Reference',
          position: 'left',
        },
        {
          href: 'https://admin.noxivo.app/',
          label: 'Go to Admin Dashboard',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Introduction',
              to: '/',
            },
            {
              label: 'API Reference',
              to: '/api-reference/noxivo-engine-api',
            },
          ],
        },
        {
          title: 'Platform',
          items: [
            {
              label: 'Client Dashboard',
              href: 'https://noxivo.app/dashboard/settings',
            },
            {
              label: 'Admin Dashboard',
              href: 'https://admin.noxivo.app/',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/Nexivo-it/noxivo-saas',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Noxivo, Inc. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
