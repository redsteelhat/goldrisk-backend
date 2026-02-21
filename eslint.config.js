import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import noFloatArithmetic from './eslint-rules/no-float-arithmetic.js';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { project: './tsconfig.json' },
    },
    plugins: {
      'goldrisk': {
        rules: {
          'no-float-arithmetic': noFloatArithmetic,
        },
      },
    },
    rules: {
      'goldrisk/no-float-arithmetic': 'error',
    },
  }
);
