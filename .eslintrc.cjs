/** @type {import('@types/eslint').Linter.BaseConfig} */
module.exports = {
  root: true,
  extends: [
    "@remix-run/eslint-config",
    "@remix-run/eslint-config/node",
    // jest-testing-library preset removed: this project uses Vitest, not Jest.
    "prettier",
  ],
  globals: {
    shopify: "readonly"
  },
};
