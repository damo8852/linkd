/**
 * jest-expo preset. Built-in matchers (toBeOnTheScreen, ...) come from
 * @testing-library/react-native by default since v12.4, so no setup file.
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // The first render of a full screen in a test file can take over 5 s on the macOS and Windows
  // CI runners (well under 1 s locally); Jest's 5 s default made those tests fail at random.
  testTimeout: 20_000,
};
