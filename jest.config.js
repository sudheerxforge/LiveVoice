module.exports = {
  preset: '@react-native/jest-preset',
  // Same as the preset's default, plus AsyncStorage, whose Jest mock ships as
  // untranspiled ES modules.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-native-async-storage)/)',
  ],
};
