'use strict';

import AxiosError from '../core/AxiosError.js';

/**
 * Create a retry interceptor with customizable delay strategy
 *
 * @param {Object} options - Retry configuration options
 * @param {number} options.retries - Maximum number of retry attempts (default: 3)
 * @param {Function|number} options.delay - Delay function or fixed delay in ms (default: 1000)
 * @param {Function} options.retryCondition - Function to determine if request should be retried
 * @param {Function} options.onRetry - Callback function called before each retry attempt
 *
 * @returns {Function} Response interceptor function
 */
function createRetryInterceptor(options = {}) {
  const {
    retries = 3,
    delay = 1000,
    retryCondition = (error) => {
      // Retry on network errors and 5xx status codes
      return !error.response || (error.response.status >= 500 && error.response.status <= 599);
    },
    onRetry = () => {}
  } = options;

  return function retryInterceptor(error) {
    const config = error.config;
    
    // Initialize retry state if not present
    if (!config.__retryCount) {
      config.__retryCount = 0;
    }

    // Check if we should retry
    const shouldRetry = config.__retryCount < retries && retryCondition(error);
    
    if (!shouldRetry) {
      return Promise.reject(error);
    }

    // Increment retry count
    config.__retryCount++;

    // Calculate delay
    const delayMs = typeof delay === 'function' 
      ? delay(config.__retryCount, error) 
      : delay;

    // Call onRetry callback
    onRetry(config.__retryCount, error, delayMs);

    // Create delay promise
    const delayPromise = new Promise(resolve => {
      setTimeout(resolve, delayMs);
    });

    // Return retry promise
    return delayPromise.then(() => {
      return this.request(config);
    });
  };
}

/**
 * Common delay strategies
 */
const delayStrategies = {
  /**
   * Fixed delay strategy
   * @param {number} ms - Fixed delay in milliseconds
   */
  fixed: (ms) => () => ms,

  /**
   * Linear backoff strategy
   * @param {number} baseDelay - Base delay in milliseconds
   */
  linear: (baseDelay = 1000) => (attempt) => baseDelay * attempt,

  /**
   * Exponential backoff strategy
   * @param {number} baseDelay - Base delay in milliseconds
   * @param {number} factor - Exponential factor (default: 2)
   */
  exponential: (baseDelay = 1000, factor = 2) => (attempt) => baseDelay * Math.pow(factor, attempt - 1),

  /**
   * Exponential backoff with jitter
   * @param {number} baseDelay - Base delay in milliseconds
   * @param {number} factor - Exponential factor (default: 2)
   * @param {number} jitter - Jitter factor between 0 and 1 (default: 0.1)
   */
  exponentialJitter: (baseDelay = 1000, factor = 2, jitter = 0.1) => (attempt) => {
    const delay = baseDelay * Math.pow(factor, attempt - 1);
    const jitterMs = delay * jitter * Math.random();
    return delay + jitterMs;
  }
};

export { createRetryInterceptor, delayStrategies };
export default createRetryInterceptor;