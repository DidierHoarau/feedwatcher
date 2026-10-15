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
    // cookie@2 ships ESM only and is required by light-my-request
    "node_modules/cookie/.+\\.js$": [
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
  transformIgnorePatterns: ["/node_modules/(?!cookie/)"],
  testEnvironment: "node",
};
