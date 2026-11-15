/**
 * Background Job: Form Stats Flush
 *
 * Form views are counted in a Redis hash (one HINCRBY per view) instead of a row update per
 * view. This job moves the counts to `forms.views` every minute. See FormService.flushViews.
 */

import type {FormStatsFlushJobData} from '@plunk/types';
import {type Job, Worker} from 'bullmq';
import signale from 'signale';

import {FormService} from '../services/FormService.js';
import {formStatsQueue} from '../services/QueueService.js';

async function processFlush(_job: Job<FormStatsFlushJobData>): Promise<{forms: number}> {
  const forms = await FormService.flushViews();
  return {forms};
}

export function createFormStatsWorker(): Worker<FormStatsFlushJobData> {
  const worker = new Worker<FormStatsFlushJobData>(formStatsQueue.name, processFlush, {
    connection: formStatsQueue.opts.connection,
    // One flush at a time: the flush renames the hash, so two runs would race on it.
    concurrency: 1,
  });

  worker.on('failed', (job, error) => {
    signale.error(`[FORM-STATS] Job ${job?.id} failed:`, error);
  });

  worker.on('error', error => {
    signale.error('[FORM-STATS] Worker error:', error);
  });

  return worker;
}
