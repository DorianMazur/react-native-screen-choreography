import React from 'react';
import { AppRegistry } from 'react-native';
import { name as appName } from './app.json';
import { SCENARIO_IDS } from './src/performance/scenarios';

// Load the benchmark harness only for instrumented launches.
function Entry(props) {
  const benchmark = SCENARIO_IDS.includes(props.performanceScenario);
  const Component = benchmark
    ? require('./src/performance/PerformanceApp').default
    : require('./src/App').default;
  return <Component {...props} />;
}

AppRegistry.registerComponent(appName, () => Entry);
