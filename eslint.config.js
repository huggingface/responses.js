import js from "@eslint/js";
import typescript from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";
import prettier from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";

export default [
	js.configs.recommended,
	{
		ignores: ["dist/**"],
	},
	{
		files: ["**/*.{js,ts}"],
		languageOptions: {
			parser: typescriptParser,
			parserOptions: {
				sourceType: "module",
				ecmaVersion: 2020,
			},
			globals: {
				browser: "readonly",
				node: "readonly",
				console: "readonly",
				process: "readonly",
			},
		},
		plugins: {
			"@typescript-eslint": typescript,
			prettier: prettier,
		},
		rules: {
			"no-constant-condition": "off",
			"@typescript-eslint/no-empty-function": "off",
			"@typescript-eslint/explicit-module-boundary-types": "error",
			"@typescript-eslint/consistent-type-imports": "error",
			"@typescript-eslint/no-unused-vars": "error",
			"@typescript-eslint/no-non-null-assertion": "error",
			"@typescript-eslint/no-explicit-any": "error",
			"@typescript-eslint/no-empty-interfaces": "off",
			// For doc purposes, prefer interfaces
			"@typescript-eslint/consistent-type-definitions": ["error", "interface"],
		},
	},
	prettierConfig,
];
