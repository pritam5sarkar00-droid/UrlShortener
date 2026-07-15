import amqp from 'amqp-connection-manager';
import dotenv from 'dotenv';

dotenv.config();

const RABBITMQ_URL = process.env.RABBITMQ_URL;

export const EXCHANGE = 'url.events';
export const CLICK_QUEUE = 'click-analytics';
export const CLICK_QUEUE_DLX = 'click-analytics-dlx';
export const CLICK_QUEUE_DLQ = 'click-analytics-dlq';

// amqp-connection-manager auto-reconnects on failure - this is the piece that
// makes the messaging layer "fault tolerant" rather than just "works on my machine".
export const connection = amqp.connect([RABBITMQ_URL], {
  heartbeatIntervalInSeconds: 10,
  reconnectTimeInSeconds: 5,
});

connection.on('connect', () => console.log('[rabbitmq] connected'));
connection.on('disconnect', (params) =>
  console.error('[rabbitmq] disconnected', params?.err?.message)
);

/**
 * Declares the topic exchange, the main click-analytics queue, and its
 * dead-letter path, then opens a channel against that topology.
 * Called from both the api (to publish) and the worker (to consume).
 */
export function createChannelWrapper(setupFn) {
  return connection.createChannel({
    json: true,
    setup: async (channel) => {
      await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
      await channel.assertExchange(CLICK_QUEUE_DLX, 'fanout', { durable: true });

      await channel.assertQueue(CLICK_QUEUE_DLQ, { durable: true });
      await channel.bindQueue(CLICK_QUEUE_DLQ, CLICK_QUEUE_DLX, '');

      await channel.assertQueue(CLICK_QUEUE, {
        durable: true,
        deadLetterExchange: CLICK_QUEUE_DLX,
      });
      await channel.bindQueue(CLICK_QUEUE, EXCHANGE, 'click.*');

      if (setupFn) await setupFn(channel);
    },
  });
}
