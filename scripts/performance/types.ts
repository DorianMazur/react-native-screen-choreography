export type InputRecord = Record<string, any>;
export type MetricSamples = Record<string, number[]>;
export type MetricDefinition = {
  source: string;
  displayName: string;
  identifier: string | null;
  unitOfMeasurement: string;
  meaning: string;
};
export type MeasurementDocument = { file: string; data: InputRecord };
