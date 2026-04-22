import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Noxivo Docs',
  tagline: 'High-performance headless workflow engine for WhatsApp',
  favicon: 'img/noxivo-logo-dark.png',

  url: 'https://noxivo.app',
  baseUrl: '/',

  organizationName: 'Nexivo-it',
  projectName: 'noxivo-docs',

  onBrokenLinks: 'throw',
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
            'https://github.com/Nexivo-it/noxivo-docs/edit/main/',
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
    () => ({
      name: 'disable-progress-plugin',
      configureWebpack(config) {
        return {
          plugins: config.plugins.filter((plugin) => {
            return plugin.constructor.name !== 'ProgressPlugin' && plugin.constructor.name !== 'WebpackBar';
          }),
        };
      },
    }),
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Noxivo Docs',
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
          href: 'https://api-workflow-engine.noxivo.app/docs',
          label: 'API Reference (Swagger)',
          position: 'left',
        },
        {
          href: 'https://noxivo.app',
          label: 'Go to Dashboard',
          position: 'right',
        },
        {
          href: 'https://github.com/Nexivo-it/noxivo-docs',
          label: 'GitHub',
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
              label: 'API Reference (Swagger)',
              href: 'https://api-workflow-engine.noxivo.app/docs',
            },
            {
              label: 'n8n Integration',
              to: '/integrations/n8n-guide',
            },
          ],
        },
        {
          title: 'Platform',
          items: [
            {
              label: 'Noxivo Dashboard',
              href: 'https://noxivo.app',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/Nexivo-it/noxivo-docs',
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
