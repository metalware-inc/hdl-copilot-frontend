import * as sinon from 'sinon'
import * as mockFs from 'mock-fs'
import { isExcludedImpl } from './helpers'
import { describe, it, beforeEach, afterEach } from 'mocha'
import { assert } from 'chai'

describe('simple test for isExcluded', () => {
    beforeEach(() => {
      // Setup mocks for file system and VSCode API
      mockFs.default({
        '/some/bar/soap': {
          'grass.sv': 'module grass;\nendmodule',
        },
        '/some/bar/notsoap': 'module notsoap;\nendmodule',
      });
    });
  
    afterEach(() => {
      mockFs.restore()
      sinon.restore()
    });

  it('is excluded', async () => {
    // Setup the test
    const path1 = '/some/bar/soap/grass.sv';
    const path2 = '/some/bar/notsoap';
    const configObj = { excludePaths: ['/some/bar/soap/'] };
    // Call your function
    assert.equal(isExcludedImpl(path1, configObj), true);
    assert.equal(isExcludedImpl(path2, configObj), false);
  });
});