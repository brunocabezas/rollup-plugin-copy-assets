'use strict';

import fs from 'fs-extra';
import path from 'path';

/**
 * Takes an array of files/directories to copy to the final build directory.
 * @param {Object} options The options object.
 * @return {Object} The rollup code object.
 */
export default function copy(options = {}) {
  const { assets, outputDir } = options;
  let basedir = '';
  return {
    name: 'copy-assets',
    options: function options(options) {
      // Cache the base directory so we can figure out where to put assets.
      // Handling input as array
      const inputStr = Array.isArray(options.input)
        ? options.input[0]
        : options.input;
      basedir = path.dirname(inputStr);
    },
    generateBundle: ({ file, dir }) => {
      const outputDirectory = dir || path.dirname(file);
      return Promise.all(
        assets.map((asset) => {
          // console.log(!!outputDir, outputDir, dir);
          const isFolder = !path.basename(asset).includes('.');
          const out = !!outputDir
            ? path.join(
                outputDirectory,
                outputDir,
                isFolder ? '' : path.basename(asset)
              )
            : path.join(outputDirectory, path.relative(basedir, asset));
          console.log(out);
          return fs.copy(asset, out);
        })
      );
    },
  };
}
