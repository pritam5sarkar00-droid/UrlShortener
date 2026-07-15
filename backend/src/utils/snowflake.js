// Twitter-style Snowflake ID: a 64-bit-safe integer made of
// [41-bit ms timestamp since EPOCH][10-bit worker id][12-bit sequence]
// Unique across many concurrently running api/worker instances with zero
// coordination between them - that's what makes it horizontally scalable.

const WORKER_ID_BITS = 10n;
const SEQUENCE_BITS = 12n;
const MAX_WORKER_ID = (1n << WORKER_ID_BITS) - 1n; // 1023
const MAX_SEQUENCE = (1n << SEQUENCE_BITS) - 1n; // 4095

// Arbitrary custom epoch (2024-01-01T00:00:00Z) - keeps the timestamp portion
// smaller than if we used the Unix epoch, buying more years before 41 bits run out.
const EPOCH = 1704067200000n;

export class SnowflakeGenerator {
  constructor(workerId) {
    const id = BigInt(workerId);
    if (id < 0n || id > MAX_WORKER_ID) {
      throw new Error(`SNOWFLAKE_WORKER_ID must be between 0 and ${MAX_WORKER_ID}`);
    }
    this.workerId = id;
    this.sequence = 0n;
    this.lastTimestamp = -1n;
  }

  nextId() {
    let timestamp = BigInt(Date.now());

    if (timestamp < this.lastTimestamp) {
      // Clock moved backwards (e.g. NTP correction) - refuse to generate a
      // duplicate/smaller ID rather than risk a collision.
      throw new Error('Clock moved backwards, refusing to generate id');
    }

    if (timestamp === this.lastTimestamp) {
      this.sequence = (this.sequence + 1n) & MAX_SEQUENCE;
      if (this.sequence === 0n) {
        // Sequence exhausted for this millisecond - spin until the clock ticks.
        while (BigInt(Date.now()) <= timestamp) {
          // busy-wait, sub-millisecond
        }
        timestamp = BigInt(Date.now());
      }
    } else {
      this.sequence = 0n;
    }

    this.lastTimestamp = timestamp;

    const id =
      ((timestamp - EPOCH) << (WORKER_ID_BITS + SEQUENCE_BITS)) |
      (this.workerId << SEQUENCE_BITS) |
      this.sequence;

    return id; // BigInt - safe to store directly in a Postgres BIGINT column
  }
}

export const snowflake = new SnowflakeGenerator(process.env.SNOWFLAKE_WORKER_ID || 1);
