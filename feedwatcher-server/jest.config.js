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
  },
  moduleNameMapper: {
    "^uuid$": "<rootDir>/__mocks__/uuid.ts",
  },
  testMatch: ["/**/src/**/*.spec.(ts|js)"],
  testEnvironment: "node",
};
