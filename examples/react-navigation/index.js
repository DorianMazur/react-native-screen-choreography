import React from 'react';
import { AppRegistry } from 'react-native';
import { name as appName } from './app.json';
import { PERFORMANCE_SCENARIO_IDS } from './src/performance/scenarios';

// Load the benchmark harness only for instrumented launches.
function Entry(props) {
  const benchmark = PERFORMANCE_SCENARIO_IDS.includes(
    props.performanceScenario
  );
  const Component = benchmark
    ? props.performanceScenario.startsWith('tray-')
      ? require('./src/performance/TrayPerformanceApp').default
      : require('./src/performance/PerformanceApp').default
    : require('./src/App').default;
  return <Component {...props} />;
}

AppRegistry.registerComponent(appName, () => Entry);
