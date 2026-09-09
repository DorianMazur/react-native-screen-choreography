import React from 'react';
import { AppRegistry } from 'react-native';
import { name as appName } from './app.json';

// Keep showcase screens/assets out of the deterministic benchmark's startup.
function Entry(props) {
  const benchmark =
    props.performanceScenario === 'ordinary' ||
    props.performanceScenario === 'live';
  const Component = benchmark
    ? require('./src/performance/PerformanceApp').default
    : require('./src/App').default;
  return <Component {...props} />;
}

AppRegistry.registerComponent(appName, () => Entry);
