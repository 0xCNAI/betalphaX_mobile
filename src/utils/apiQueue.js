/**
 * Generic Request Queue with Deduplication, Rate Limiting, and Circuit Breaker
 * Used to prevent hitting API rate limits (429 errors).
 */
export class RequestQueue {
    /**
     * @param {number} maxConcurrent - Max number of concurrent requests (default: 1)
     * @param {number} intervalMs - Minimum interval between requests in ms (default: 1000)
     */
    constructor(maxConcurrent = 1, intervalMs = 1000) {
        this.queue = [];
        this.processing = false;
        this.maxConcurrent = maxConcurrent;
        this.intervalMs = intervalMs;
        this.backoffMultiplier = 1; // For exponential backoff
        this.consecutiveErrors = 0;
        this.inFlightRequests = new Map(); // For deduplication
        this.circuitBreakerOpen = false; // Circuit breaker state
        this.circuitBreakerTimeout = null;
    }

    /**
     * Add a request to the queue
     * @param {Function} fn - Async function to execute
     * @param {string|null} dedupeKey - Optional key for deduplication
     * @returns {Promise<any>}
     */
    add(fn, dedupeKey = null) {
        // Circuit breaker: reject immediately if circuit is open
        if (this.circuitBreakerOpen) {
            console.warn('[RequestQueue] Circuit breaker is OPEN - rejecting request');
            return Promise.reject(new Error('Circuit breaker open - too many consecutive errors'));
        }

        // Request deduplication: if same request is in-flight, return existing Promise
        if (dedupeKey && this.inFlightRequests.has(dedupeKey)) {
            console.log(`[RequestQueue] Deduplicating request: ${dedupeKey}`);
            return this.inFlightRequests.get(dedupeKey);
        }

        const promise = new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject, dedupeKey });
            this.process();
        });

        // Track in-flight request for deduplication
        if (dedupeKey) {
            this.inFlightRequests.set(dedupeKey, promise);
            // Clean up after promise settles
            promise.finally(() => {
                this.inFlightRequests.delete(dedupeKey);
            });
        }

        return promise;
    }

    async process() {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;
        const { fn, resolve, reject, dedupeKey } = this.queue.shift();

        try {
            const result = await fn();
            // Success - reset backoff
            this.consecutiveErrors = 0;
            this.backoffMultiplier = 1;
            resolve(result);
        } catch (error) {
            // Check if it's a 429 error (Rate Limit) or 503 (Service Unavailable)
            const isRateLimit = error.message && (error.message.includes('429') || error.message.includes('503'));

            if (isRateLimit) {
                this.consecutiveErrors++;
                // Exponential backoff: 1x, 2x, 4x, 8x (max)
                this.backoffMultiplier = Math.min(Math.pow(2, this.consecutiveErrors - 1), 8);
                console.warn(`[RequestQueue] Rate limit/Error detected. Backoff multiplier: ${this.backoffMultiplier}x`);

                // Circuit breaker: open circuit after 5 consecutive rate limit errors
                if (this.consecutiveErrors >= 5) {
                    this.openCircuitBreaker();
                }
            }
            reject(error);
        } finally {
            this.processing = false;
            // Apply backoff multiplier to interval
            const actualInterval = this.intervalMs * this.backoffMultiplier;
            setTimeout(() => this.process(), actualInterval);
        }
    }

    openCircuitBreaker() {
        console.error('[RequestQueue] 🔴 CIRCUIT BREAKER OPENED - Pausing all requests for 30 seconds');
        this.circuitBreakerOpen = true;

        // Clear any existing timeout
        if (this.circuitBreakerTimeout) {
            clearTimeout(this.circuitBreakerTimeout);
        }

        // Close circuit breaker after 30 seconds
        this.circuitBreakerTimeout = setTimeout(() => {
            console.log('[RequestQueue] 🟢 CIRCUIT BREAKER CLOSED - Resuming requests');
            this.circuitBreakerOpen = false;
            this.consecutiveErrors = 0;
            this.backoffMultiplier = 1;
            this.process(); // Resume processing
        }, 30000);
    }
}
