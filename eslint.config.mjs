import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default [
  ...nextCoreWebVitals,
  {
    // React Hooks 7 adds this rule; the develop baseline used React Hooks 5.2.0.
    rules: { "react-hooks/purity": "off" },
  },
];
