module.exports = {
  coverageProvider: "v8",
  moduleFileExtensions: ["ts", "js"],
  transform: {
    "^.+\\.(ts|tsx)$": [
      "@swc/jest",
      {
        jsc: {
          target: "es2020",
        },
      },
    ],
    // jsdom and friends ship ESM-only files, which jest cannot require
    // natively: transform every node_modules .js file to CJS like cookie.
    "node_modules/.+\\.(js|mjs)$": [
      "@swc/jest",
      {
        jsc: {
          target: "es2020",
        },
      },
    ],
  },
  moduleNameMapper: {
    "^uuid$": "<rootDir>/__mocks__/uuid.ts",
  },
  testMatch: ["/**/src/**/*.spec.(ts|js)"],
  transformIgnorePatterns: [],
  testEnvironment: "node",
};
