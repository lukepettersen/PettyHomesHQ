import next from "eslint-config-next";

const config = [
  { ignores: [".next/**", "node_modules/**", "mockups/**", "src/generated/**", "next-env.d.ts"] },
  ...next,
];

export default config;
