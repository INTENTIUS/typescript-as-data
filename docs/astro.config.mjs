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
			// Three doors for three audiences (#85). The landing page names what
			// the mechanism enables and nothing about the mechanism; the
			// specification, the reference and the conformance suite sit one
			// level down, behind the third door.
			sidebar: [
				{ label: 'What it enables', autogenerate: { directory: 'what-it-enables' } },
				{ label: 'Try it', autogenerate: { directory: 'try-it' } },
				{ label: 'For your platform', autogenerate: { directory: 'for-your-platform' } },
				{
					label: 'The specification',
					items: [
						{ label: 'Introduction', autogenerate: { directory: 'introduction' } },
						{ label: 'Normative text', autogenerate: { directory: 'spec' } },
						{ label: 'Reference implementation', autogenerate: { directory: 'reference' } },
						{ label: 'Conformance', autogenerate: { directory: 'conformance' } },
						{ label: 'Evidence', link: '/evidence/' },
					],
				},
			],
		}),
	],
});
