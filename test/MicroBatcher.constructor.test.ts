import { describe, expect, test } from '@jest/globals';
import { MicroBatcher } from '../src/MicroBatcher';

describe('MicroBatcher constructor unit tests', () => {
  describe('constructor can be templated, and should accept messages of templated type', () => {
    test('microbatcher can be templated with string', () => {
      const stringMicroBatcher = new MicroBatcher<string>({
        batchProcessFn: async (batch) => {
          console.log(batch);
        },
      });
      stringMicroBatcher.add('test');
      expect(stringMicroBatcher['queue']).toContain('test');
    });

    test('microbatcher can be templated with number', () => {
      const numberMicroBatcher = new MicroBatcher<number>({
        batchProcessFn: async (batch) => {
          console.log(batch);
        },
      });
      numberMicroBatcher.add(1);
      expect(numberMicroBatcher['queue']).toContain(1);
    });

    test('microbatcher can be templated with custom type', () => {
      type CustomType = {
        id: number;
        name: string;
      };
      const customTypeMicroBatcher = new MicroBatcher<CustomType>({
        batchProcessFn: async (batch) => {
          console.log(batch);
        },
      });
      const customTypeData = { id: 1, name: 'test' };
      customTypeMicroBatcher.add(customTypeData);
      expect(customTypeMicroBatcher['queue']).toContain(customTypeData);
    });

    test('microbatcher can be templated with custom class', () => {
      class CustomClass {
        id: number;
        name: string;

        constructor(id: number, name: string) {
          this.id = id;
          this.name = name;
        }
      }

      const customClassMicroBatcher = new MicroBatcher<CustomClass>({
        batchProcessFn: async (batch) => {
          console.log(batch);
        },
      });
      const customClassData = new CustomClass(1, 'test');
      customClassMicroBatcher.add(customClassData);
      expect(customClassMicroBatcher['queue']).toContain(customClassData);
    });
  });
  test('microbatcher should throw error when initialized with config values less than 0', () => {
    const invalidMicroBatcherConfig = {
      maxBatchSize: -1,
      maxBatchTime: -1,
      batchProcessFn: async (batch: any) => {},
      start: true,
    };
    expect(() => new MicroBatcher(invalidMicroBatcherConfig)).toThrow();
  });
});
