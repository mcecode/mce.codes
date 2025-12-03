/** @type {import("prettier").Config} */
export default {
	objectWrap: "collapse",
	proseWrap: "always",
	trailingComma: "all",
	useTabs: true,
	plugins: ["prettier-plugin-astro"],
	overrides: [
		{
			files: "*.astro",
			options: { parser: "astro", astroAllowShorthand: true },
		},
	],
};
