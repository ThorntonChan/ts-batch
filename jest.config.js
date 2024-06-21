/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleDirectories: ['node_modules', '<rootDir>'],
  setupFiles: ['<rootDir>/src/test/setup.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/test/testProps.ts'],
};
