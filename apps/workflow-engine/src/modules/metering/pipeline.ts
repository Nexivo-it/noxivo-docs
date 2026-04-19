import { MeteringCounterService, type MeterCounterStore } from './counter.service.js';
import {
  MeteringAggregationWorker,
  createMeteringAggregationProcessor,
  scheduleHourlyAggregation,
  type MeteringAggregationQueue
} from './aggregation.worker.js';

export interface MeteringPipeline {
  worker: MeteringAggregationWorker;
  processor: ReturnType<typeof createMeteringAggregationProcessor>;
}

export async function initializeMeteringPipeline(input: {
  counterStore: MeterCounterStore;
  aggregationQueue: MeteringAggregationQueue;
}): Promise<MeteringPipeline> {
  const counterService = new MeteringCounterService(input.counterStore);
  const worker = new MeteringAggregationWorker(counterService);
  await scheduleHourlyAggregation(input.aggregationQueue);

  return {
    worker,
    processor: createMeteringAggregationProcessor(worker)
  };
}
