module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo automatically applies react-native-worklets/plugin when
    // react-native-worklets is installed (see babel-preset-expo/build/index.js).
    // Do NOT also list it here — Reanimated 4 warns against double-application.
    //
    // react-native-worklets is a PEER dependency of react-native-reanimated, which
    // means we are responsible for installing it; it is a direct dependency in
    // package.json for that reason, not by accident.
    presets: ['babel-preset-expo'],
  };
};
