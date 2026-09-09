// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://intentius.io',
	base: '/typescript-as-data',
	integrations: [
		starlight({
			title: 'typescript-as-data',
			description:
				'A specification for a statically evaluable subset of TypeScript, its reference implementation, and its conformance suite.',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/INTENTIUS/typescript-as-data' },
			],
			sidebar: [
				{ label: 'Introduction', autogenerate: { directory: 'introduction' } },
				{ label: 'Specification', autogenerate: { directory: 'spec' } },
				{ label: 'Reference implementation', autogenerate: { directory: 'reference' } },
				{ label: 'Conformance', autogenerate: { directory: 'conformance' } },
			],
		}),
	],
});
