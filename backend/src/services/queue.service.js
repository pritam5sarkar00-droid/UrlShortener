import { createChannelWrapper, EXCHANGE } from '../config/rabbitmq.js';
import { hashIp } from '../utils/hash.js';

let channelWrapper = null;

export function initPublisher() {
  if (!channelWrapper) {
    channelWrapper = createChannelWrapper();
  }
  return channelWrapper;
}

export async function publishClickEvent(payload) {
  const wrapper = initPublisher();
  // Fire-and-forget from the caller's perspective: the channel wrapper queues
  // and retries internally, the redirect response never waits on this.
  await wrapper.publish(EXCHANGE, 'click.created', payload);
}

export function buildClickPayload(req, shortCode) {
  return {
    shortCode,
    // Hash, don't store raw IPs - click_events.ip_hash is for rough analytics
    // (rate limiting signals, abuse detection) not for identifying people.
    ipHash: hashIp(req.ip),
    userAgent: req.get('user-agent') || null,
    referrer: req.get('referer') || null,
    clickedAt: new Date().toISOString(),
  };
}
