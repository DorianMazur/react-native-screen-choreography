import React from 'react';
import { AppRegistry } from 'react-native';
import { name as appName } from './app.json';

// Load the Gallery benchmark harness only for instrumented launches.
function Entry(props) {
  const benchmark = props.performanceScenario === 'gallery';
  const Component = benchmark
    ? require('./src/performance/PerformanceApp').default
    : require('./src/App').default;
  return <Component {...props} />;
}

AppRegistry.registerComponent(appName, () => Entry);
