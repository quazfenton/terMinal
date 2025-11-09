/**
 * Performance Tests
 * Tests for command recognition, caching, and execution performance
 */

const CommandRecognizer = require('../../core/CommandRecognizer');
const ResponseCache = require('../../cache/ResponseCache');
const PerformanceMonitor = require('../../monitoring/PerformanceMonitor');

describe('Performance Improvements', () => {
  let commandRecognizer;
  let responseCache;
  let performanceMonitor;

  beforeEach(() => {
    commandRecognizer = new CommandRecognizer();
    responseCache = new ResponseCache();
    performanceMonitor = new PerformanceMonitor();
  });

  describe('CommandRecognizer', () => {
    test('identifies direct commands quickly', () => {
      const directCommands = ['ls -la', 'pwd', 'git status', 'npm install'];
      
      const start = process.hrtime.bigint();
      
      directCommands.forEach(cmd => {
        expect(commandRecognizer.isDirectCommand(cmd)).toBe(true);
      });
      
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1000000; // Convert to ms
      
      expect(duration).toBeLessThan(10); // Should be very fast
    });

    test('identifies AI queries correctly', () => {
      const aiQueries = [
        'create a new React component',
        'how do I install Docker?',
        'explain this error message',
        'help me debug this code'
      ];
      
      aiQueries.forEach(query => {
        expect(commandRecognizer.needsAiProcessing(query)).toBe(true);
      });
    });

    test('performance benchmark for command recognition', () => {
      const commands = [
        'ls', 'pwd', 'git status', 'npm test', 'create a file',
        'cd /home', 'cat file.txt', 'help me with this', 'mkdir test'
      ];
      
      const iterations = 1000;
      const start = process.hrtime.bigint();
      
      for (let i = 0; i < iterations; i++) {
        commands.forEach(cmd => {
          commandRecognizer.getCommandType(cmd);
        });
      }
      
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1000000;
      const avgPerCommand = duration / (iterations * commands.length);
      
      expect(avgPerCommand).toBeLessThan(0.1); // Less than 0.1ms per command
    });
  });

  describe('ResponseCache', () => {
    test('caches and retrieves responses quickly', () => {
      const testResponse = { success: true, commands: ['ls -la'] };
      
      // Cache response
      const cacheStart = process.hrtime.bigint();
      responseCache.set('test query', testResponse);
      const cacheEnd = process.hrtime.bigint();
      
      // Retrieve response
      const retrieveStart = process.hrtime.bigint();
      const cached = responseCache.get('test query');
      const retrieveEnd = process.hrtime.bigint();
      
      const cacheDuration = Number(cacheEnd - cacheStart) / 1000000;
      const retrieveDuration = Number(retrieveEnd - retrieveStart) / 1000000;
      
      expect(cached).toEqual(testResponse);
      expect(cacheDuration).toBeLessThan(1);
      expect(retrieveDuration).toBeLessThan(0.1);
    });

    test('handles cache eviction efficiently', () => {
      const cache = new ResponseCache(5); // Small cache for testing
      
      // Fill cache beyond capacity
      for (let i = 0; i < 10; i++) {
        cache.set(`query${i}`, { result: i });
      }
      
      expect(cache.size()).toBe(5);
      
      // Verify LRU eviction
      expect(cache.get('query0')).toBeNull(); // Should be evicted
      expect(cache.get('query9')).toBeTruthy(); // Should still exist
    });
  });

  describe('PerformanceMonitor', () => {
    test('tracks operation timing accurately', async () => {
      const timerId = performanceMonitor.startTimer('testOperation');
      
      // Simulate work
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const metric = performanceMonitor.endTimer(timerId);
      
      expect(metric).toBeDefined();
      expect(metric.duration).toBeGreaterThan(8);
      expect(metric.duration).toBeLessThan(50);
      expect(metric.operation).toBe('testOperation');
    });

    test('calculates average metrics correctly', () => {
      // Record multiple metrics
      for (let i = 0; i < 5; i++) {
        performanceMonitor.recordMetric('testOp', {
          operation: 'testOp',
          duration: 100 + i * 10,
          memoryDelta: 1000,
          timestamp: Date.now()
        });
      }
      
      const avgMetrics = performanceMonitor.getAverageMetrics('testOp');
      
      expect(avgMetrics.count).toBe(5);
      expect(avgMetrics.averageDuration).toBe(120); // (100+110+120+130+140)/5
      expect(avgMetrics.minDuration).toBe(100);
      expect(avgMetrics.maxDuration).toBe(140);
    });
  });

  describe('Integration Performance', () => {
    test('direct command execution is faster than AI processing', () => {
      const directCommand = 'ls -la';
      const aiQuery = 'show me all files in this directory';
      
      // Measure direct command recognition
      const directStart = process.hrtime.bigint();
      const isDirect = commandRecognizer.isDirectCommand(directCommand);
      const directEnd = process.hrtime.bigint();
      
      // Measure AI query recognition
      const aiStart = process.hrtime.bigint();
      const needsAI = commandRecognizer.needsAiProcessing(aiQuery);
      const aiEnd = process.hrtime.bigint();
      
      const directDuration = Number(directEnd - directStart) / 1000000;
      const aiDuration = Number(aiEnd - aiStart) / 1000000;
      
      expect(isDirect).toBe(true);
      expect(needsAI).toBe(true);
      expect(directDuration).toBeLessThan(1);
      expect(aiDuration).toBeLessThan(1);
    });

    test('cache hit is significantly faster than cache miss', () => {
      const query = 'test performance query';
      const response = { success: true, cached: false };
      
      // Cache miss (first access)
      const missStart = process.hrtime.bigint();
      const missResult = responseCache.get(query);
      const missEnd = process.hrtime.bigint();
      
      // Set cache
      responseCache.set(query, response);
      
      // Cache hit (second access)
      const hitStart = process.hrtime.bigint();
      const hitResult = responseCache.get(query);
      const hitEnd = process.hrtime.bigint();
      
      const missDuration = Number(missEnd - missStart) / 1000000;
      const hitDuration = Number(hitEnd - hitStart) / 1000000;
      
      expect(missResult).toBeNull();
      expect(hitResult).toEqual(response);
      expect(hitDuration).toBeLessThan(missDuration);
    });
  });
});
