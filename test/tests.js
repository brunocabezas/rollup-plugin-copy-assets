import assert from 'assert';
import { rollup } from 'rollup';
import fs from 'fs-extra';
import copy from '../dist/rollup-plugin-copy-assets.module';

// Change working directory to current
process.chdir(__dirname);

describe('rollup-plugin-copy-assets', function() {
  afterEach(() => fs.remove('output'));

  it('should copy the assets to output dir', function(done) {
    build({ assets: [ 'fixtures/top-level-item.txt' ] })
      .then(() => Promise.all([
        assertExists('output/top-level-item.txt'),
      ]))
      .then(() => done());
  });

  it('should copy folders to output dir with same hierarchy', function(done) {
    build({
      assets: [ 'fixtures/assets' ],
    }).then(() => Promise.all([
      assertExists('output/assets'),
      assertExists('output/assets/foo.txt'),
      assertExists('output/assets/bar.csv'),
    ]))
    .then(() => done());
  });

  it('should copy all paths given to it', function(done) {
    build({
      assets: [ 'fixtures/assets', 'fixtures/top-level-item.txt' ],
    }).then(() => Promise.all([
      assertExists('output/assets'),
      assertExists('output/assets/foo.txt'),
      assertExists('output/assets/bar.csv'),
    ]))
    .then(() => done());

  it('should copy assets to outputDir as base folder when present', function(done) {
    build({
      assets: ['fixtures/assets', 'fixtures/top-level-item.txt'],
      outputDir: 'testDir',
    })
      .then(() =>
        Promise.all([
          // assertExists('output/testDir'),
          assertExists('output/testDir/foo.txt'),
          assertExists('output/testDir/bar.csv'),
          assertExists('output/testDir/top-level-item.txt'),
        ])
      )
      .then(() => done());
  });

  it('should be compatible with array of string as input on rollup config', function(done) {
    buildWithMultipleInput({
      assets: ['fixtures/assets', 'fixtures/top-level-item.txt'],
      outputDir: 'testDir',
    })
      .then(() =>
        Promise.all([
          assertExists('output/index.js'),
          assertExists('output/index2.js'),
        ])
      )
      .then(() => done());
  });
});

// Run the rollup build with an plugin configuration.
function build(config) {
  return rollup({
    input: './fixtures/index.js',
    plugins: [copy(config)],
  }).then((bundle) =>
    bundle.write({
      file: 'output/bundle.js',
      format: 'iife',
      name: 'test',
    })
  );
}

// Run the rollup build with an plugin configuration compatible with multiple inputs.
function buildWithMultipleInput(config) {
  return rollup({
    input: ['./fixtures/index.js', './fixtures/index2.js'],
    plugins: [copy(config)],
    experimentalCodeSplitting: true,
  }).then((bundle) =>
    bundle.write({ dir: 'output/', format: 'es', name: 'test' })
  );
}

// Asserts that a file does or does not exist.
function assertExists(file, shouldExist = true) {
  return fs.pathExists(file)
    .then((exists) => assert.ok(exists === shouldExist));
}