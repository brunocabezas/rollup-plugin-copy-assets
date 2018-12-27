'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var constants = _interopDefault(require('constants'));
var stream = _interopDefault(require('stream'));
var util = _interopDefault(require('util'));
var os = _interopDefault(require('os'));
var assert = _interopDefault(require('assert'));
var fs = _interopDefault(require('fs'));
var path = _interopDefault(require('path'));

// simple mutable assign

function assign() {
  var args = [].slice.call(arguments).filter(function (i) {
    return i;
  });
  var dest = args.shift();
  args.forEach(function (src) {
    Object.keys(src).forEach(function (key) {
      dest[key] = src[key];
    });
  });

  return dest;
}

var assign_1 = assign;

function createCommonjsModule(fn, module) {
	return module = { exports: {} }, fn(module, module.exports), module.exports;
}

var fromCallback = function fromCallback(fn) {
  return Object.defineProperty(function () {
    var _arguments = arguments,
        _this = this;

    if (typeof arguments[arguments.length - 1] === 'function') fn.apply(this, arguments);else {
      return new Promise(function (resolve, reject) {
        _arguments[_arguments.length] = function (err, res) {
          if (err) return reject(err);
          resolve(res);
        };
        _arguments.length++;
        fn.apply(_this, _arguments);
      });
    }
  }, 'name', { value: fn.name });
};

var fromPromise = function fromPromise(fn) {
  return Object.defineProperty(function () {
    var cb = arguments[arguments.length - 1];
    if (typeof cb !== 'function') return fn.apply(this, arguments);else fn.apply(this, arguments).then(function (r) {
      return cb(null, r);
    }, cb);
  }, 'name', { value: fn.name });
};

var universalify = {
  fromCallback: fromCallback,
  fromPromise: fromPromise
};

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) {
  return typeof obj;
} : function (obj) {
  return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj;
};

var fs_1 = clone(fs);

function clone(obj) {
  if (obj === null || (typeof obj === 'undefined' ? 'undefined' : _typeof(obj)) !== 'object') return obj;

  if (obj instanceof Object) var copy = { __proto__: obj.__proto__ };else var copy = Object.create(null);

  Object.getOwnPropertyNames(obj).forEach(function (key) {
    Object.defineProperty(copy, key, Object.getOwnPropertyDescriptor(obj, key));
  });

  return copy;
}

var origCwd = process.cwd;
var cwd = null;

var platform = process.env.GRACEFUL_FS_PLATFORM || process.platform;

process.cwd = function () {
  if (!cwd) cwd = origCwd.call(process);
  return cwd;
};
try {
  process.cwd();
} catch (er) {}

var chdir = process.chdir;
process.chdir = function (d) {
  cwd = null;
  chdir.call(process, d);
};

var polyfills = patch;

function patch(fs$$1) {
  // (re-)implement some things that are known busted or missing.

  // lchmod, broken prior to 0.6.2
  // back-port the fix here.
  if (constants.hasOwnProperty('O_SYMLINK') && process.version.match(/^v0\.6\.[0-2]|^v0\.5\./)) {
    patchLchmod(fs$$1);
  }

  // lutimes implementation, or no-op
  if (!fs$$1.lutimes) {
    patchLutimes(fs$$1);
  }

  // https://github.com/isaacs/node-graceful-fs/issues/4
  // Chown should not fail on einval or eperm if non-root.
  // It should not fail on enosys ever, as this just indicates
  // that a fs doesn't support the intended operation.

  fs$$1.chown = chownFix(fs$$1.chown);
  fs$$1.fchown = chownFix(fs$$1.fchown);
  fs$$1.lchown = chownFix(fs$$1.lchown);

  fs$$1.chmod = chmodFix(fs$$1.chmod);
  fs$$1.fchmod = chmodFix(fs$$1.fchmod);
  fs$$1.lchmod = chmodFix(fs$$1.lchmod);

  fs$$1.chownSync = chownFixSync(fs$$1.chownSync);
  fs$$1.fchownSync = chownFixSync(fs$$1.fchownSync);
  fs$$1.lchownSync = chownFixSync(fs$$1.lchownSync);

  fs$$1.chmodSync = chmodFixSync(fs$$1.chmodSync);
  fs$$1.fchmodSync = chmodFixSync(fs$$1.fchmodSync);
  fs$$1.lchmodSync = chmodFixSync(fs$$1.lchmodSync);

  fs$$1.stat = statFix(fs$$1.stat);
  fs$$1.fstat = statFix(fs$$1.fstat);
  fs$$1.lstat = statFix(fs$$1.lstat);

  fs$$1.statSync = statFixSync(fs$$1.statSync);
  fs$$1.fstatSync = statFixSync(fs$$1.fstatSync);
  fs$$1.lstatSync = statFixSync(fs$$1.lstatSync);

  // if lchmod/lchown do not exist, then make them no-ops
  if (!fs$$1.lchmod) {
    fs$$1.lchmod = function (path$$1, mode, cb) {
      if (cb) process.nextTick(cb);
    };
    fs$$1.lchmodSync = function () {};
  }
  if (!fs$$1.lchown) {
    fs$$1.lchown = function (path$$1, uid, gid, cb) {
      if (cb) process.nextTick(cb);
    };
    fs$$1.lchownSync = function () {};
  }

  // on Windows, A/V software can lock the directory, causing this
  // to fail with an EACCES or EPERM if the directory contains newly
  // created files.  Try again on failure, for up to 60 seconds.

  // Set the timeout this long because some Windows Anti-Virus, such as Parity
  // bit9, may lock files for up to a minute, causing npm package install
  // failures. Also, take care to yield the scheduler. Windows scheduling gives
  // CPU to a busy looping process, which can cause the program causing the lock
  // contention to be starved of CPU by node, so the contention doesn't resolve.
  if (platform === "win32") {
    fs$$1.rename = function (fs$rename) {
      return function (from, to, cb) {
        var start = Date.now();
        var backoff = 0;
        fs$rename(from, to, function CB(er) {
          if (er && (er.code === "EACCES" || er.code === "EPERM") && Date.now() - start < 60000) {
            setTimeout(function () {
              fs$$1.stat(to, function (stater, st) {
                if (stater && stater.code === "ENOENT") fs$rename(from, to, CB);else cb(er);
              });
            }, backoff);
            if (backoff < 100) backoff += 10;
            return;
          }
          if (cb) cb(er);
        });
      };
    }(fs$$1.rename);
  }

  // if read() returns EAGAIN, then just try it again.
  fs$$1.read = function (fs$read) {
    return function (fd, buffer, offset, length, position, callback_) {
      var _callback;
      if (callback_ && typeof callback_ === 'function') {
        var eagCounter = 0;
        _callback = function callback(er, _, __) {
          if (er && er.code === 'EAGAIN' && eagCounter < 10) {
            eagCounter++;
            return fs$read.call(fs$$1, fd, buffer, offset, length, position, _callback);
          }
          callback_.apply(this, arguments);
        };
      }
      return fs$read.call(fs$$1, fd, buffer, offset, length, position, _callback);
    };
  }(fs$$1.read);

  fs$$1.readSync = function (fs$readSync) {
    return function (fd, buffer, offset, length, position) {
      var eagCounter = 0;
      while (true) {
        try {
          return fs$readSync.call(fs$$1, fd, buffer, offset, length, position);
        } catch (er) {
          if (er.code === 'EAGAIN' && eagCounter < 10) {
            eagCounter++;
            continue;
          }
          throw er;
        }
      }
    };
  }(fs$$1.readSync);
}

function patchLchmod(fs$$1) {
  fs$$1.lchmod = function (path$$1, mode, callback) {
    fs$$1.open(path$$1, constants.O_WRONLY | constants.O_SYMLINK, mode, function (err, fd) {
      if (err) {
        if (callback) callback(err);
        return;
      }
      // prefer to return the chmod error, if one occurs,
      // but still try to close, and report closing errors if they occur.
      fs$$1.fchmod(fd, mode, function (err) {
        fs$$1.close(fd, function (err2) {
          if (callback) callback(err || err2);
        });
      });
    });
  };

  fs$$1.lchmodSync = function (path$$1, mode) {
    var fd = fs$$1.openSync(path$$1, constants.O_WRONLY | constants.O_SYMLINK, mode);

    // prefer to return the chmod error, if one occurs,
    // but still try to close, and report closing errors if they occur.
    var threw = true;
    var ret;
    try {
      ret = fs$$1.fchmodSync(fd, mode);
      threw = false;
    } finally {
      if (threw) {
        try {
          fs$$1.closeSync(fd);
        } catch (er) {}
      } else {
        fs$$1.closeSync(fd);
      }
    }
    return ret;
  };
}

function patchLutimes(fs$$1) {
  if (constants.hasOwnProperty("O_SYMLINK")) {
    fs$$1.lutimes = function (path$$1, at, mt, cb) {
      fs$$1.open(path$$1, constants.O_SYMLINK, function (er, fd) {
        if (er) {
          if (cb) cb(er);
          return;
        }
        fs$$1.futimes(fd, at, mt, function (er) {
          fs$$1.close(fd, function (er2) {
            if (cb) cb(er || er2);
          });
        });
      });
    };

    fs$$1.lutimesSync = function (path$$1, at, mt) {
      var fd = fs$$1.openSync(path$$1, constants.O_SYMLINK);
      var ret;
      var threw = true;
      try {
        ret = fs$$1.futimesSync(fd, at, mt);
        threw = false;
      } finally {
        if (threw) {
          try {
            fs$$1.closeSync(fd);
          } catch (er) {}
        } else {
          fs$$1.closeSync(fd);
        }
      }
      return ret;
    };
  } else {
    fs$$1.lutimes = function (_a, _b, _c, cb) {
      if (cb) process.nextTick(cb);
    };
    fs$$1.lutimesSync = function () {};
  }
}

function chmodFix(orig) {
  if (!orig) return orig;
  return function (target, mode, cb) {
    return orig.call(fs_1, target, mode, function (er) {
      if (chownErOk(er)) er = null;
      if (cb) cb.apply(this, arguments);
    });
  };
}

function chmodFixSync(orig) {
  if (!orig) return orig;
  return function (target, mode) {
    try {
      return orig.call(fs_1, target, mode);
    } catch (er) {
      if (!chownErOk(er)) throw er;
    }
  };
}

function chownFix(orig) {
  if (!orig) return orig;
  return function (target, uid, gid, cb) {
    return orig.call(fs_1, target, uid, gid, function (er) {
      if (chownErOk(er)) er = null;
      if (cb) cb.apply(this, arguments);
    });
  };
}

function chownFixSync(orig) {
  if (!orig) return orig;
  return function (target, uid, gid) {
    try {
      return orig.call(fs_1, target, uid, gid);
    } catch (er) {
      if (!chownErOk(er)) throw er;
    }
  };
}

function statFix(orig) {
  if (!orig) return orig;
  // Older versions of Node erroneously returned signed integers for
  // uid + gid.
  return function (target, cb) {
    return orig.call(fs_1, target, function (er, stats) {
      if (!stats) return cb.apply(this, arguments);
      if (stats.uid < 0) stats.uid += 0x100000000;
      if (stats.gid < 0) stats.gid += 0x100000000;
      if (cb) cb.apply(this, arguments);
    });
  };
}

function statFixSync(orig) {
  if (!orig) return orig;
  // Older versions of Node erroneously returned signed integers for
  // uid + gid.
  return function (target) {
    var stats = orig.call(fs_1, target);
    if (stats.uid < 0) stats.uid += 0x100000000;
    if (stats.gid < 0) stats.gid += 0x100000000;
    return stats;
  };
}

// ENOSYS means that the fs doesn't support the op. Just ignore
// that, because it doesn't matter.
//
// if there's no getuid, or if getuid() is something other
// than 0, and the error is EINVAL or EPERM, then just ignore
// it.
//
// This specific case is a silent failure in cp, install, tar,
// and most other unix tools that manage permissions.
//
// When running as root, or if other types of errors are
// encountered, then it's strict.
function chownErOk(er) {
  if (!er) return true;

  if (er.code === "ENOSYS") return true;

  var nonroot = !process.getuid || process.getuid() !== 0;
  if (nonroot) {
    if (er.code === "EINVAL" || er.code === "EPERM") return true;
  }

  return false;
}

var Stream = stream.Stream;

var legacyStreams = legacy;

function legacy(fs$$1) {
  return {
    ReadStream: ReadStream,
    WriteStream: WriteStream
  };

  function ReadStream(path$$1, options) {
    if (!(this instanceof ReadStream)) return new ReadStream(path$$1, options);

    Stream.call(this);

    var self = this;

    this.path = path$$1;
    this.fd = null;
    this.readable = true;
    this.paused = false;

    this.flags = 'r';
    this.mode = 438; /*=0666*/
    this.bufferSize = 64 * 1024;

    options = options || {};

    // Mixin options into this
    var keys = Object.keys(options);
    for (var index = 0, length = keys.length; index < length; index++) {
      var key = keys[index];
      this[key] = options[key];
    }

    if (this.encoding) this.setEncoding(this.encoding);

    if (this.start !== undefined) {
      if ('number' !== typeof this.start) {
        throw TypeError('start must be a Number');
      }
      if (this.end === undefined) {
        this.end = Infinity;
      } else if ('number' !== typeof this.end) {
        throw TypeError('end must be a Number');
      }

      if (this.start > this.end) {
        throw new Error('start must be <= end');
      }

      this.pos = this.start;
    }

    if (this.fd !== null) {
      process.nextTick(function () {
        self._read();
      });
      return;
    }

    fs$$1.open(this.path, this.flags, this.mode, function (err, fd) {
      if (err) {
        self.emit('error', err);
        self.readable = false;
        return;
      }

      self.fd = fd;
      self.emit('open', fd);
      self._read();
    });
  }

  function WriteStream(path$$1, options) {
    if (!(this instanceof WriteStream)) return new WriteStream(path$$1, options);

    Stream.call(this);

    this.path = path$$1;
    this.fd = null;
    this.writable = true;

    this.flags = 'w';
    this.encoding = 'binary';
    this.mode = 438; /*=0666*/
    this.bytesWritten = 0;

    options = options || {};

    // Mixin options into this
    var keys = Object.keys(options);
    for (var index = 0, length = keys.length; index < length; index++) {
      var key = keys[index];
      this[key] = options[key];
    }

    if (this.start !== undefined) {
      if ('number' !== typeof this.start) {
        throw TypeError('start must be a Number');
      }
      if (this.start < 0) {
        throw new Error('start must be >= zero');
      }

      this.pos = this.start;
    }

    this.busy = false;
    this._queue = [];

    if (this.fd === null) {
      this._open = fs$$1.open;
      this._queue.push([this._open, this.path, this.flags, this.mode, undefined]);
      this.flush();
    }
  }
}

var gracefulFs = createCommonjsModule(function (module) {
  var queue = [];

  function noop() {}

  var debug = noop;
  if (util.debuglog) debug = util.debuglog('gfs4');else if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || '')) debug = function debug() {
    var m = util.format.apply(util, arguments);
    m = 'GFS4: ' + m.split(/\n/).join('\nGFS4: ');
    console.error(m);
  };

  if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || '')) {
    process.on('exit', function () {
      debug(queue);
      assert.equal(queue.length, 0);
    });
  }

  module.exports = patch(fs_1);
  if (process.env.TEST_GRACEFUL_FS_GLOBAL_PATCH) {
    module.exports = patch(fs);
  }

  // Always patch fs.close/closeSync, because we want to
  // retry() whenever a close happens *anywhere* in the program.
  // This is essential when multiple graceful-fs instances are
  // in play at the same time.
  module.exports.close = fs.close = function (fs$close) {
    return function (fd, cb) {
      return fs$close.call(fs, fd, function (err) {
        if (!err) retry();

        if (typeof cb === 'function') cb.apply(this, arguments);
      });
    };
  }(fs.close);

  module.exports.closeSync = fs.closeSync = function (fs$closeSync) {
    return function (fd) {
      // Note that graceful-fs also retries when fs.closeSync() fails.
      // Looks like a bug to me, although it's probably a harmless one.
      var rval = fs$closeSync.apply(fs, arguments);
      retry();
      return rval;
    };
  }(fs.closeSync);

  function patch(fs$$1) {
    // Everything that references the open() function needs to be in here
    polyfills(fs$$1);
    fs$$1.gracefulify = patch;
    fs$$1.FileReadStream = ReadStream; // Legacy name.
    fs$$1.FileWriteStream = WriteStream; // Legacy name.
    fs$$1.createReadStream = createReadStream;
    fs$$1.createWriteStream = createWriteStream;
    var fs$readFile = fs$$1.readFile;
    fs$$1.readFile = readFile;
    function readFile(path$$1, options, cb) {
      if (typeof options === 'function') cb = options, options = null;

      return go$readFile(path$$1, options, cb);

      function go$readFile(path$$1, options, cb) {
        return fs$readFile(path$$1, options, function (err) {
          if (err && (err.code === 'EMFILE' || err.code === 'ENFILE')) enqueue([go$readFile, [path$$1, options, cb]]);else {
            if (typeof cb === 'function') cb.apply(this, arguments);
            retry();
          }
        });
      }
    }

    var fs$writeFile = fs$$1.writeFile;
    fs$$1.writeFile = writeFile;
    function writeFile(path$$1, data, options, cb) {
      if (typeof options === 'function') cb = options, options = null;

      return go$writeFile(path$$1, data, options, cb);

      function go$writeFile(path$$1, data, options, cb) {
        return fs$writeFile(path$$1, data, options, function (err) {
          if (err && (err.code === 'EMFILE' || err.code === 'ENFILE')) enqueue([go$writeFile, [path$$1, data, options, cb]]);else {
            if (typeof cb === 'function') cb.apply(this, arguments);
            retry();
          }
        });
      }
    }

    var fs$appendFile = fs$$1.appendFile;
    if (fs$appendFile) fs$$1.appendFile = appendFile;
    function appendFile(path$$1, data, options, cb) {
      if (typeof options === 'function') cb = options, options = null;

      return go$appendFile(path$$1, data, options, cb);

      function go$appendFile(path$$1, data, options, cb) {
        return fs$appendFile(path$$1, data, options, function (err) {
          if (err && (err.code === 'EMFILE' || err.code === 'ENFILE')) enqueue([go$appendFile, [path$$1, data, options, cb]]);else {
            if (typeof cb === 'function') cb.apply(this, arguments);
            retry();
          }
        });
      }
    }

    var fs$readdir = fs$$1.readdir;
    fs$$1.readdir = readdir;
    function readdir(path$$1, options, cb) {
      var args = [path$$1];
      if (typeof options !== 'function') {
        args.push(options);
      } else {
        cb = options;
      }
      args.push(go$readdir$cb);

      return go$readdir(args);

      function go$readdir$cb(err, files) {
        if (files && files.sort) files.sort();

        if (err && (err.code === 'EMFILE' || err.code === 'ENFILE')) enqueue([go$readdir, [args]]);else {
          if (typeof cb === 'function') cb.apply(this, arguments);
          retry();
        }
      }
    }

    function go$readdir(args) {
      return fs$readdir.apply(fs$$1, args);
    }

    if (process.version.substr(0, 4) === 'v0.8') {
      var legStreams = legacyStreams(fs$$1);
      ReadStream = legStreams.ReadStream;
      WriteStream = legStreams.WriteStream;
    }

    var fs$ReadStream = fs$$1.ReadStream;
    ReadStream.prototype = Object.create(fs$ReadStream.prototype);
    ReadStream.prototype.open = ReadStream$open;

    var fs$WriteStream = fs$$1.WriteStream;
    WriteStream.prototype = Object.create(fs$WriteStream.prototype);
    WriteStream.prototype.open = WriteStream$open;

    fs$$1.ReadStream = ReadStream;
    fs$$1.WriteStream = WriteStream;

    function ReadStream(path$$1, options) {
      if (this instanceof ReadStream) return fs$ReadStream.apply(this, arguments), this;else return ReadStream.apply(Object.create(ReadStream.prototype), arguments);
    }

    function ReadStream$open() {
      var that = this;
      open(that.path, that.flags, that.mode, function (err, fd) {
        if (err) {
          if (that.autoClose) that.destroy();

          that.emit('error', err);
        } else {
          that.fd = fd;
          that.emit('open', fd);
          that.read();
        }
      });
    }

    function WriteStream(path$$1, options) {
      if (this instanceof WriteStream) return fs$WriteStream.apply(this, arguments), this;else return WriteStream.apply(Object.create(WriteStream.prototype), arguments);
    }

    function WriteStream$open() {
      var that = this;
      open(that.path, that.flags, that.mode, function (err, fd) {
        if (err) {
          that.destroy();
          that.emit('error', err);
        } else {
          that.fd = fd;
          that.emit('open', fd);
        }
      });
    }

    function createReadStream(path$$1, options) {
      return new ReadStream(path$$1, options);
    }

    function createWriteStream(path$$1, options) {
      return new WriteStream(path$$1, options);
    }

    var fs$open = fs$$1.open;
    fs$$1.open = open;
    function open(path$$1, flags, mode, cb) {
      if (typeof mode === 'function') cb = mode, mode = null;

      return go$open(path$$1, flags, mode, cb);

      function go$open(path$$1, flags, mode, cb) {
        return fs$open(path$$1, flags, mode, function (err, fd) {
          if (err && (err.code === 'EMFILE' || err.code === 'ENFILE')) enqueue([go$open, [path$$1, flags, mode, cb]]);else {
            if (typeof cb === 'function') cb.apply(this, arguments);
            retry();
          }
        });
      }
    }

    return fs$$1;
  }

  function enqueue(elem) {
    debug('ENQUEUE', elem[0].name, elem[1]);
    queue.push(elem);
  }

  function retry() {
    var elem = queue.shift();
    if (elem) {
      debug('RETRY', elem[0].name, elem[1]);
      elem[0].apply(null, elem[1]);
    }
  }
});
var gracefulFs_1 = gracefulFs.close;
var gracefulFs_2 = gracefulFs.closeSync;

var fs_1$1 = createCommonjsModule(function (module, exports) {
  // This is adapted from https://github.com/normalize/mz
  // Copyright (c) 2014-2016 Jonathan Ong me@jongleberry.com and Contributors
  var u = universalify.fromCallback;

  var api = ['access', 'appendFile', 'chmod', 'chown', 'close', 'copyFile', 'fchmod', 'fchown', 'fdatasync', 'fstat', 'fsync', 'ftruncate', 'futimes', 'lchown', 'link', 'lstat', 'mkdir', 'mkdtemp', 'open', 'readFile', 'readdir', 'readlink', 'realpath', 'rename', 'rmdir', 'stat', 'symlink', 'truncate', 'unlink', 'utimes', 'writeFile'].filter(function (key) {
    // Some commands are not available on some systems. Ex:
    // fs.copyFile was added in Node.js v8.5.0
    // fs.mkdtemp was added in Node.js v5.10.0
    // fs.lchown is not available on at least some Linux
    return typeof gracefulFs[key] === 'function';
  });

  // Export all keys:
  Object.keys(gracefulFs).forEach(function (key) {
    exports[key] = gracefulFs[key];
  });

  // Universalify async methods:
  api.forEach(function (method) {
    exports[method] = u(gracefulFs[method]);
  });

  // We differ from mz/fs in that we still ship the old, broken, fs.exists()
  // since we are a drop-in replacement for the native module
  exports.exists = function (filename, callback) {
    if (typeof callback === 'function') {
      return gracefulFs.exists(filename, callback);
    }
    return new Promise(function (resolve) {
      return gracefulFs.exists(filename, resolve);
    });
  };

  // fs.read() & fs.write need special treatment due to multiple callback args

  exports.read = function (fd, buffer, offset, length, position, callback) {
    if (typeof callback === 'function') {
      return gracefulFs.read(fd, buffer, offset, length, position, callback);
    }
    return new Promise(function (resolve, reject) {
      gracefulFs.read(fd, buffer, offset, length, position, function (err, bytesRead, buffer) {
        if (err) return reject(err);
        resolve({ bytesRead: bytesRead, buffer: buffer });
      });
    });
  };

  // Function signature can be
  // fs.write(fd, buffer[, offset[, length[, position]]], callback)
  // OR
  // fs.write(fd, string[, position[, encoding]], callback)
  // so we need to handle both cases
  exports.write = function (fd, buffer, a, b, c, callback) {
    if (typeof arguments[arguments.length - 1] === 'function') {
      return gracefulFs.write(fd, buffer, a, b, c, callback);
    }

    // Check for old, depricated fs.write(fd, string[, position[, encoding]], callback)
    if (typeof buffer === 'string') {
      return new Promise(function (resolve, reject) {
        gracefulFs.write(fd, buffer, a, b, function (err, bytesWritten, buffer) {
          if (err) return reject(err);
          resolve({ bytesWritten: bytesWritten, buffer: buffer });
        });
      });
    }

    return new Promise(function (resolve, reject) {
      gracefulFs.write(fd, buffer, a, b, c, function (err, bytesWritten, buffer) {
        if (err) return reject(err);
        resolve({ bytesWritten: bytesWritten, buffer: buffer });
      });
    });
  };
});
var fs_2 = fs_1$1.exists;
var fs_3 = fs_1$1.read;
var fs_4 = fs_1$1.write;

// get drive on windows
function getRootPath(p) {
  p = path.normalize(path.resolve(p)).split(path.sep);
  if (p.length > 0) return p[0];
  return null;
}

// http://stackoverflow.com/a/62888/10333 contains more accurate
// TODO: expand to include the rest
var INVALID_PATH_CHARS = /[<>:"|?*]/;

function invalidWin32Path(p) {
  var rp = getRootPath(p);
  p = p.replace(rp, '');
  return INVALID_PATH_CHARS.test(p);
}

var win32 = {
  getRootPath: getRootPath,
  invalidWin32Path: invalidWin32Path
};

var invalidWin32Path$1 = win32.invalidWin32Path;

var o777 = parseInt('0777', 8);

function mkdirs(p, opts, callback, made) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  } else if (!opts || (typeof opts === 'undefined' ? 'undefined' : _typeof(opts)) !== 'object') {
    opts = { mode: opts };
  }

  if (process.platform === 'win32' && invalidWin32Path$1(p)) {
    var errInval = new Error(p + ' contains invalid WIN32 path characters.');
    errInval.code = 'EINVAL';
    return callback(errInval);
  }

  var mode = opts.mode;
  var xfs = opts.fs || gracefulFs;

  if (mode === undefined) {
    mode = o777 & ~process.umask();
  }
  if (!made) made = null;

  callback = callback || function () {};
  p = path.resolve(p);

  xfs.mkdir(p, mode, function (er) {
    if (!er) {
      made = made || p;
      return callback(null, made);
    }
    switch (er.code) {
      case 'ENOENT':
        if (path.dirname(p) === p) return callback(er);
        mkdirs(path.dirname(p), opts, function (er, made) {
          if (er) callback(er, made);else mkdirs(p, opts, callback, made);
        });
        break;

      // In the case of any other error, just see if there's a dir
      // there already.  If so, then hooray!  If not, then something
      // is borked.
      default:
        xfs.stat(p, function (er2, stat) {
          // if the stat fails, then that's super weird.
          // let the original error be the failure reason.
          if (er2 || !stat.isDirectory()) callback(er, made);else callback(null, made);
        });
        break;
    }
  });
}

var mkdirs_1 = mkdirs;

var invalidWin32Path$2 = win32.invalidWin32Path;

var o777$1 = parseInt('0777', 8);

function mkdirsSync(p, opts, made) {
  if (!opts || (typeof opts === 'undefined' ? 'undefined' : _typeof(opts)) !== 'object') {
    opts = { mode: opts };
  }

  var mode = opts.mode;
  var xfs = opts.fs || gracefulFs;

  if (process.platform === 'win32' && invalidWin32Path$2(p)) {
    var errInval = new Error(p + ' contains invalid WIN32 path characters.');
    errInval.code = 'EINVAL';
    throw errInval;
  }

  if (mode === undefined) {
    mode = o777$1 & ~process.umask();
  }
  if (!made) made = null;

  p = path.resolve(p);

  try {
    xfs.mkdirSync(p, mode);
    made = made || p;
  } catch (err0) {
    switch (err0.code) {
      case 'ENOENT':
        if (path.dirname(p) === p) throw err0;
        made = mkdirsSync(path.dirname(p), opts, made);
        mkdirsSync(p, opts, made);
        break;

      // In the case of any other error, just see if there's a dir
      // there already.  If so, then hooray!  If not, then something
      // is borked.
      default:
        var stat = void 0;
        try {
          stat = xfs.statSync(p);
        } catch (err1) {
          throw err0;
        }
        if (!stat.isDirectory()) throw err0;
        break;
    }
  }

  return made;
}

var mkdirsSync_1 = mkdirsSync;

var u = universalify.fromCallback;
var mkdirs$1 = u(mkdirs_1);

var mkdirs_1$1 = {
  mkdirs: mkdirs$1,
  mkdirsSync: mkdirsSync_1,
  // alias
  mkdirp: mkdirs$1,
  mkdirpSync: mkdirsSync_1,
  ensureDir: mkdirs$1,
  ensureDirSync: mkdirsSync_1
};

var u$1 = universalify.fromPromise;

function pathExists(path$$1) {
  return fs_1$1.access(path$$1).then(function () {
    return true;
  }).catch(function () {
    return false;
  });
}

var pathExists_1 = {
  pathExists: u$1(pathExists),
  pathExistsSync: fs_1$1.existsSync
};

// HFS, ext{2,3}, FAT do not, Node.js v0.10 does not
function hasMillisResSync() {
  var tmpfile = path.join('millis-test-sync' + Date.now().toString() + Math.random().toString().slice(2));
  tmpfile = path.join(os.tmpdir(), tmpfile);

  // 550 millis past UNIX epoch
  var d = new Date(1435410243862);
  gracefulFs.writeFileSync(tmpfile, 'https://github.com/jprichardson/node-fs-extra/pull/141');
  var fd = gracefulFs.openSync(tmpfile, 'r+');
  gracefulFs.futimesSync(fd, d, d);
  gracefulFs.closeSync(fd);
  return gracefulFs.statSync(tmpfile).mtime > 1435410243000;
}

function hasMillisRes(callback) {
  var tmpfile = path.join('millis-test' + Date.now().toString() + Math.random().toString().slice(2));
  tmpfile = path.join(os.tmpdir(), tmpfile);

  // 550 millis past UNIX epoch
  var d = new Date(1435410243862);
  gracefulFs.writeFile(tmpfile, 'https://github.com/jprichardson/node-fs-extra/pull/141', function (err) {
    if (err) return callback(err);
    gracefulFs.open(tmpfile, 'r+', function (err, fd) {
      if (err) return callback(err);
      gracefulFs.futimes(fd, d, d, function (err) {
        if (err) return callback(err);
        gracefulFs.close(fd, function (err) {
          if (err) return callback(err);
          gracefulFs.stat(tmpfile, function (err, stats) {
            if (err) return callback(err);
            callback(null, stats.mtime > 1435410243000);
          });
        });
      });
    });
  });
}

function timeRemoveMillis(timestamp) {
  if (typeof timestamp === 'number') {
    return Math.floor(timestamp / 1000) * 1000;
  } else if (timestamp instanceof Date) {
    return new Date(Math.floor(timestamp.getTime() / 1000) * 1000);
  } else {
    throw new Error('fs-extra: timeRemoveMillis() unknown parameter type');
  }
}

function utimesMillis(path$$1, atime, mtime, callback) {
  // if (!HAS_MILLIS_RES) return fs.utimes(path, atime, mtime, callback)
  gracefulFs.open(path$$1, 'r+', function (err, fd) {
    if (err) return callback(err);
    gracefulFs.futimes(fd, atime, mtime, function (futimesErr) {
      gracefulFs.close(fd, function (closeErr) {
        if (callback) callback(futimesErr || closeErr);
      });
    });
  });
}

function utimesMillisSync(path$$1, atime, mtime) {
  var fd = gracefulFs.openSync(path$$1, 'r+');
  gracefulFs.futimesSync(fd, atime, mtime);
  return gracefulFs.closeSync(fd);
}

var utimes = {
  hasMillisRes: hasMillisRes,
  hasMillisResSync: hasMillisResSync,
  timeRemoveMillis: timeRemoveMillis,
  utimesMillis: utimesMillis,
  utimesMillisSync: utimesMillisSync
};

var mkdirp = mkdirs_1$1.mkdirs;
var pathExists$1 = pathExists_1.pathExists;
var utimes$1 = utimes.utimesMillis;

var notExist = Symbol('notExist');
var existsReg = Symbol('existsReg');

function copy(src, dest, opts, cb) {
  if (typeof opts === 'function' && !cb) {
    cb = opts;
    opts = {};
  } else if (typeof opts === 'function') {
    opts = { filter: opts };
  }

  cb = cb || function () {};
  opts = opts || {};

  opts.clobber = 'clobber' in opts ? !!opts.clobber : true; // default to true for now
  opts.overwrite = 'overwrite' in opts ? !!opts.overwrite : opts.clobber; // overwrite falls back to clobber

  // Warn about using preserveTimestamps on 32-bit node
  if (opts.preserveTimestamps && process.arch === 'ia32') {
    console.warn('fs-extra: Using the preserveTimestamps option in 32-bit node is not recommended;\n\n    see https://github.com/jprichardson/node-fs-extra/issues/269');
  }

  src = path.resolve(src);
  dest = path.resolve(dest);

  // don't allow src and dest to be the same
  if (src === dest) return cb(new Error('Source and destination must not be the same.'));

  if (opts.filter) return handleFilter(checkParentDir, src, dest, opts, cb);
  return checkParentDir(src, dest, opts, cb);
}

function checkParentDir(src, dest, opts, cb) {
  var destParent = path.dirname(dest);
  pathExists$1(destParent, function (err, dirExists) {
    if (err) return cb(err);
    if (dirExists) return startCopy(src, dest, opts, cb);
    mkdirp(destParent, function (err) {
      if (err) return cb(err);
      return startCopy(src, dest, opts, cb);
    });
  });
}

function startCopy(src, dest, opts, cb) {
  if (opts.filter) return handleFilter(getStats, src, dest, opts, cb);
  return getStats(src, dest, opts, cb);
}

function handleFilter(onInclude, src, dest, opts, cb) {
  Promise.resolve(opts.filter(src, dest)).then(function (include) {
    if (include) return onInclude(src, dest, opts, cb);
    return cb();
  }, function (error) {
    return cb(error);
  });
}

function getStats(src, dest, opts, cb) {
  var stat = opts.dereference ? gracefulFs.stat : gracefulFs.lstat;
  stat(src, function (err, st) {
    if (err) return cb(err);

    if (st.isDirectory()) return onDir(st, src, dest, opts, cb);else if (st.isFile() || st.isCharacterDevice() || st.isBlockDevice()) return onFile(st, src, dest, opts, cb);else if (st.isSymbolicLink()) return onLink(src, dest, opts, cb);
  });
}

function onFile(srcStat, src, dest, opts, cb) {
  checkDest(dest, function (err, resolvedPath) {
    if (err) return cb(err);
    if (resolvedPath === notExist) {
      return copyFile(srcStat, src, dest, opts, cb);
    } else if (resolvedPath === existsReg) {
      return mayCopyFile(srcStat, src, dest, opts, cb);
    } else {
      if (src === resolvedPath) return cb();
      return mayCopyFile(srcStat, src, dest, opts, cb);
    }
  });
}

function mayCopyFile(srcStat, src, dest, opts, cb) {
  if (opts.overwrite) {
    gracefulFs.unlink(dest, function (err) {
      if (err) return cb(err);
      return copyFile(srcStat, src, dest, opts, cb);
    });
  } else if (opts.errorOnExist) {
    return cb(new Error('\'' + dest + '\' already exists'));
  } else return cb();
}

function copyFile(srcStat, src, dest, opts, cb) {
  if (typeof gracefulFs.copyFile === 'function') {
    return gracefulFs.copyFile(src, dest, function (err) {
      if (err) return cb(err);
      return setDestModeAndTimestamps(srcStat, dest, opts, cb);
    });
  }
  return copyFileFallback(srcStat, src, dest, opts, cb);
}

function copyFileFallback(srcStat, src, dest, opts, cb) {
  var rs = gracefulFs.createReadStream(src);
  rs.on('error', function (err) {
    return cb(err);
  }).once('open', function () {
    var ws = gracefulFs.createWriteStream(dest, { mode: srcStat.mode });
    ws.on('error', function (err) {
      return cb(err);
    }).on('open', function () {
      return rs.pipe(ws);
    }).once('close', function () {
      return setDestModeAndTimestamps(srcStat, dest, opts, cb);
    });
  });
}

function setDestModeAndTimestamps(srcStat, dest, opts, cb) {
  gracefulFs.chmod(dest, srcStat.mode, function (err) {
    if (err) return cb(err);
    if (opts.preserveTimestamps) {
      return utimes$1(dest, srcStat.atime, srcStat.mtime, cb);
    }
    return cb();
  });
}

function onDir(srcStat, src, dest, opts, cb) {
  checkDest(dest, function (err, resolvedPath) {
    if (err) return cb(err);
    if (resolvedPath === notExist) {
      if (isSrcSubdir(src, dest)) {
        return cb(new Error('Cannot copy \'' + src + '\' to a subdirectory of itself, \'' + dest + '\'.'));
      }
      return mkDirAndCopy(srcStat, src, dest, opts, cb);
    } else if (resolvedPath === existsReg) {
      if (isSrcSubdir(src, dest)) {
        return cb(new Error('Cannot copy \'' + src + '\' to a subdirectory of itself, \'' + dest + '\'.'));
      }
      return mayCopyDir(src, dest, opts, cb);
    } else {
      if (src === resolvedPath) return cb();
      return copyDir(src, dest, opts, cb);
    }
  });
}

function mayCopyDir(src, dest, opts, cb) {
  gracefulFs.stat(dest, function (err, st) {
    if (err) return cb(err);
    if (!st.isDirectory()) {
      return cb(new Error('Cannot overwrite non-directory \'' + dest + '\' with directory \'' + src + '\'.'));
    }
    return copyDir(src, dest, opts, cb);
  });
}

function mkDirAndCopy(srcStat, src, dest, opts, cb) {
  gracefulFs.mkdir(dest, srcStat.mode, function (err) {
    if (err) return cb(err);
    gracefulFs.chmod(dest, srcStat.mode, function (err) {
      if (err) return cb(err);
      return copyDir(src, dest, opts, cb);
    });
  });
}

function copyDir(src, dest, opts, cb) {
  gracefulFs.readdir(src, function (err, items) {
    if (err) return cb(err);
    return copyDirItems(items, src, dest, opts, cb);
  });
}

function copyDirItems(items, src, dest, opts, cb) {
  var item = items.pop();
  if (!item) return cb();
  startCopy(path.join(src, item), path.join(dest, item), opts, function (err) {
    if (err) return cb(err);
    return copyDirItems(items, src, dest, opts, cb);
  });
}

function onLink(src, dest, opts, cb) {
  gracefulFs.readlink(src, function (err, resolvedSrcPath) {
    if (err) return cb(err);

    if (opts.dereference) {
      resolvedSrcPath = path.resolve(process.cwd(), resolvedSrcPath);
    }

    checkDest(dest, function (err, resolvedDestPath) {
      if (err) return cb(err);

      if (resolvedDestPath === notExist || resolvedDestPath === existsReg) {
        // if dest already exists, fs throws error anyway,
        // so no need to guard against it here.
        return gracefulFs.symlink(resolvedSrcPath, dest, cb);
      } else {
        if (opts.dereference) {
          resolvedDestPath = path.resolve(process.cwd(), resolvedDestPath);
        }
        if (resolvedDestPath === resolvedSrcPath) return cb();

        // prevent copy if src is a subdir of dest since unlinking
        // dest in this case would result in removing src contents
        // and therefore a broken symlink would be created.
        gracefulFs.stat(dest, function (err, st) {
          if (err) return cb(err);
          if (st.isDirectory() && isSrcSubdir(resolvedDestPath, resolvedSrcPath)) {
            return cb(new Error('Cannot overwrite \'' + resolvedDestPath + '\' with \'' + resolvedSrcPath + '\'.'));
          }
          return copyLink(resolvedSrcPath, dest, cb);
        });
      }
    });
  });
}

function copyLink(resolvedSrcPath, dest, cb) {
  gracefulFs.unlink(dest, function (err) {
    if (err) return cb(err);
    return gracefulFs.symlink(resolvedSrcPath, dest, cb);
  });
}

// check if dest exists and/or is a symlink
function checkDest(dest, cb) {
  gracefulFs.readlink(dest, function (err, resolvedPath) {
    if (err) {
      if (err.code === 'ENOENT') return cb(null, notExist);

      // dest exists and is a regular file or directory, Windows may throw UNKNOWN error.
      if (err.code === 'EINVAL' || err.code === 'UNKNOWN') return cb(null, existsReg);

      return cb(err);
    }
    return cb(null, resolvedPath); // dest exists and is a symlink
  });
}

// return true if dest is a subdir of src, otherwise false.
// extract dest base dir and check if that is the same as src basename
function isSrcSubdir(src, dest) {
  var baseDir = dest.split(path.dirname(src) + path.sep)[1];
  if (baseDir) {
    var destBasename = baseDir.split(path.sep)[0];
    if (destBasename) {
      return src !== dest && dest.indexOf(src) > -1 && destBasename === path.basename(src);
    }
    return false;
  }
  return false;
}

var copy_1 = copy;

var u$2 = universalify.fromCallback;
var copy$1 = {
  copy: u$2(copy_1)
};

/* eslint-disable node/no-deprecated-api */
var buffer = function buffer(size) {
  if (typeof Buffer.allocUnsafe === 'function') {
    try {
      return Buffer.allocUnsafe(size);
    } catch (e) {
      return new Buffer(size);
    }
  }
  return new Buffer(size);
};

var mkdirpSync = mkdirs_1$1.mkdirsSync;
var utimesSync = utimes.utimesMillisSync;

var notExist$1 = Symbol('notExist');
var existsReg$1 = Symbol('existsReg');

function copySync(src, dest, opts) {
  if (typeof opts === 'function') {
    opts = { filter: opts };
  }

  opts = opts || {};
  opts.clobber = 'clobber' in opts ? !!opts.clobber : true; // default to true for now
  opts.overwrite = 'overwrite' in opts ? !!opts.overwrite : opts.clobber; // overwrite falls back to clobber

  // Warn about using preserveTimestamps on 32-bit node
  if (opts.preserveTimestamps && process.arch === 'ia32') {
    console.warn('fs-extra: Using the preserveTimestamps option in 32-bit node is not recommended;\n\n    see https://github.com/jprichardson/node-fs-extra/issues/269');
  }

  src = path.resolve(src);
  dest = path.resolve(dest);

  // don't allow src and dest to be the same
  if (src === dest) throw new Error('Source and destination must not be the same.');

  if (opts.filter && !opts.filter(src, dest)) return;

  var destParent = path.dirname(dest);
  if (!gracefulFs.existsSync(destParent)) mkdirpSync(destParent);
  return startCopy$1(src, dest, opts);
}

function startCopy$1(src, dest, opts) {
  if (opts.filter && !opts.filter(src, dest)) return;
  return getStats$1(src, dest, opts);
}

function getStats$1(src, dest, opts) {
  var statSync = opts.dereference ? gracefulFs.statSync : gracefulFs.lstatSync;
  var st = statSync(src);

  if (st.isDirectory()) return onDir$1(st, src, dest, opts);else if (st.isFile() || st.isCharacterDevice() || st.isBlockDevice()) return onFile$1(st, src, dest, opts);else if (st.isSymbolicLink()) return onLink$1(src, dest, opts);
}

function onFile$1(srcStat, src, dest, opts) {
  var resolvedPath = checkDest$1(dest);
  if (resolvedPath === notExist$1) {
    return copyFile$1(srcStat, src, dest, opts);
  } else if (resolvedPath === existsReg$1) {
    return mayCopyFile$1(srcStat, src, dest, opts);
  } else {
    if (src === resolvedPath) return;
    return mayCopyFile$1(srcStat, src, dest, opts);
  }
}

function mayCopyFile$1(srcStat, src, dest, opts) {
  if (opts.overwrite) {
    gracefulFs.unlinkSync(dest);
    return copyFile$1(srcStat, src, dest, opts);
  } else if (opts.errorOnExist) {
    throw new Error('\'' + dest + '\' already exists');
  }
}

function copyFile$1(srcStat, src, dest, opts) {
  if (typeof gracefulFs.copyFileSync === 'function') {
    gracefulFs.copyFileSync(src, dest);
    gracefulFs.chmodSync(dest, srcStat.mode);
    if (opts.preserveTimestamps) {
      return utimesSync(dest, srcStat.atime, srcStat.mtime);
    }
    return;
  }
  return copyFileFallback$1(srcStat, src, dest, opts);
}

function copyFileFallback$1(srcStat, src, dest, opts) {
  var BUF_LENGTH = 64 * 1024;
  var _buff = buffer(BUF_LENGTH);

  var fdr = gracefulFs.openSync(src, 'r');
  var fdw = gracefulFs.openSync(dest, 'w', srcStat.mode);
  var bytesRead = 1;
  var pos = 0;

  while (bytesRead > 0) {
    bytesRead = gracefulFs.readSync(fdr, _buff, 0, BUF_LENGTH, pos);
    gracefulFs.writeSync(fdw, _buff, 0, bytesRead);
    pos += bytesRead;
  }

  if (opts.preserveTimestamps) gracefulFs.futimesSync(fdw, srcStat.atime, srcStat.mtime);

  gracefulFs.closeSync(fdr);
  gracefulFs.closeSync(fdw);
}

function onDir$1(srcStat, src, dest, opts) {
  var resolvedPath = checkDest$1(dest);
  if (resolvedPath === notExist$1) {
    if (isSrcSubdir$1(src, dest)) {
      throw new Error('Cannot copy \'' + src + '\' to a subdirectory of itself, \'' + dest + '\'.');
    }
    return mkDirAndCopy$1(srcStat, src, dest, opts);
  } else if (resolvedPath === existsReg$1) {
    if (isSrcSubdir$1(src, dest)) {
      throw new Error('Cannot copy \'' + src + '\' to a subdirectory of itself, \'' + dest + '\'.');
    }
    return mayCopyDir$1(src, dest, opts);
  } else {
    if (src === resolvedPath) return;
    return copyDir$1(src, dest, opts);
  }
}

function mayCopyDir$1(src, dest, opts) {
  if (!gracefulFs.statSync(dest).isDirectory()) {
    throw new Error('Cannot overwrite non-directory \'' + dest + '\' with directory \'' + src + '\'.');
  }
  return copyDir$1(src, dest, opts);
}

function mkDirAndCopy$1(srcStat, src, dest, opts) {
  gracefulFs.mkdirSync(dest, srcStat.mode);
  gracefulFs.chmodSync(dest, srcStat.mode);
  return copyDir$1(src, dest, opts);
}

function copyDir$1(src, dest, opts) {
  gracefulFs.readdirSync(src).forEach(function (item) {
    startCopy$1(path.join(src, item), path.join(dest, item), opts);
  });
}

function onLink$1(src, dest, opts) {
  var resolvedSrcPath = gracefulFs.readlinkSync(src);

  if (opts.dereference) {
    resolvedSrcPath = path.resolve(process.cwd(), resolvedSrcPath);
  }

  var resolvedDestPath = checkDest$1(dest);
  if (resolvedDestPath === notExist$1 || resolvedDestPath === existsReg$1) {
    // if dest already exists, fs throws error anyway,
    // so no need to guard against it here.
    return gracefulFs.symlinkSync(resolvedSrcPath, dest);
  } else {
    if (opts.dereference) {
      resolvedDestPath = path.resolve(process.cwd(), resolvedDestPath);
    }
    if (resolvedDestPath === resolvedSrcPath) return;

    // prevent copy if src is a subdir of dest since unlinking
    // dest in this case would result in removing src contents
    // and therefore a broken symlink would be created.
    if (gracefulFs.statSync(dest).isDirectory() && isSrcSubdir$1(resolvedDestPath, resolvedSrcPath)) {
      throw new Error('Cannot overwrite \'' + resolvedDestPath + '\' with \'' + resolvedSrcPath + '\'.');
    }
    return copyLink$1(resolvedSrcPath, dest);
  }
}

function copyLink$1(resolvedSrcPath, dest) {
  gracefulFs.unlinkSync(dest);
  return gracefulFs.symlinkSync(resolvedSrcPath, dest);
}

// check if dest exists and/or is a symlink
function checkDest$1(dest) {
  var resolvedPath = void 0;
  try {
    resolvedPath = gracefulFs.readlinkSync(dest);
  } catch (err) {
    if (err.code === 'ENOENT') return notExist$1;

    // dest exists and is a regular file or directory, Windows may throw UNKNOWN error
    if (err.code === 'EINVAL' || err.code === 'UNKNOWN') return existsReg$1;

    throw err;
  }
  return resolvedPath; // dest exists and is a symlink
}

// return true if dest is a subdir of src, otherwise false.
// extract dest base dir and check if that is the same as src basename
function isSrcSubdir$1(src, dest) {
  var baseDir = dest.split(path.dirname(src) + path.sep)[1];
  if (baseDir) {
    var destBasename = baseDir.split(path.sep)[0];
    if (destBasename) {
      return src !== dest && dest.indexOf(src) > -1 && destBasename === path.basename(src);
    }
    return false;
  }
  return false;
}

var copySync_1 = copySync;

var copySync$1 = {
  copySync: copySync_1
};

var isWindows = process.platform === 'win32';

function defaults$1(options) {
  var methods = ['unlink', 'chmod', 'stat', 'lstat', 'rmdir', 'readdir'];
  methods.forEach(function (m) {
    options[m] = options[m] || gracefulFs[m];
    m = m + 'Sync';
    options[m] = options[m] || gracefulFs[m];
  });

  options.maxBusyTries = options.maxBusyTries || 3;
}

function rimraf(p, options, cb) {
  var busyTries = 0;

  if (typeof options === 'function') {
    cb = options;
    options = {};
  }

  assert(p, 'rimraf: missing path');
  assert.equal(typeof p === 'undefined' ? 'undefined' : _typeof(p), 'string', 'rimraf: path should be a string');
  assert.equal(typeof cb === 'undefined' ? 'undefined' : _typeof(cb), 'function', 'rimraf: callback function required');
  assert(options, 'rimraf: invalid options argument provided');
  assert.equal(typeof options === 'undefined' ? 'undefined' : _typeof(options), 'object', 'rimraf: options should be object');

  defaults$1(options);

  rimraf_(p, options, function CB(er) {
    if (er) {
      if ((er.code === 'EBUSY' || er.code === 'ENOTEMPTY' || er.code === 'EPERM') && busyTries < options.maxBusyTries) {
        busyTries++;
        var time = busyTries * 100;
        // try again, with the same exact callback as this one.
        return setTimeout(function () {
          return rimraf_(p, options, CB);
        }, time);
      }

      // already gone
      if (er.code === 'ENOENT') er = null;
    }

    cb(er);
  });
}

// Two possible strategies.
// 1. Assume it's a file.  unlink it, then do the dir stuff on EPERM or EISDIR
// 2. Assume it's a directory.  readdir, then do the file stuff on ENOTDIR
//
// Both result in an extra syscall when you guess wrong.  However, there
// are likely far more normal files in the world than directories.  This
// is based on the assumption that a the average number of files per
// directory is >= 1.
//
// If anyone ever complains about this, then I guess the strategy could
// be made configurable somehow.  But until then, YAGNI.
function rimraf_(p, options, cb) {
  assert(p);
  assert(options);
  assert(typeof cb === 'function');

  // sunos lets the root user unlink directories, which is... weird.
  // so we have to lstat here and make sure it's not a dir.
  options.lstat(p, function (er, st) {
    if (er && er.code === 'ENOENT') {
      return cb(null);
    }

    // Windows can EPERM on stat.  Life is suffering.
    if (er && er.code === 'EPERM' && isWindows) {
      return fixWinEPERM(p, options, er, cb);
    }

    if (st && st.isDirectory()) {
      return rmdir(p, options, er, cb);
    }

    options.unlink(p, function (er) {
      if (er) {
        if (er.code === 'ENOENT') {
          return cb(null);
        }
        if (er.code === 'EPERM') {
          return isWindows ? fixWinEPERM(p, options, er, cb) : rmdir(p, options, er, cb);
        }
        if (er.code === 'EISDIR') {
          return rmdir(p, options, er, cb);
        }
      }
      return cb(er);
    });
  });
}

function fixWinEPERM(p, options, er, cb) {
  assert(p);
  assert(options);
  assert(typeof cb === 'function');
  if (er) {
    assert(er instanceof Error);
  }

  options.chmod(p, 438, function (er2) {
    if (er2) {
      cb(er2.code === 'ENOENT' ? null : er);
    } else {
      options.stat(p, function (er3, stats) {
        if (er3) {
          cb(er3.code === 'ENOENT' ? null : er);
        } else if (stats.isDirectory()) {
          rmdir(p, options, er, cb);
        } else {
          options.unlink(p, cb);
        }
      });
    }
  });
}

function fixWinEPERMSync(p, options, er) {
  var stats = void 0;

  assert(p);
  assert(options);
  if (er) {
    assert(er instanceof Error);
  }

  try {
    options.chmodSync(p, 438);
  } catch (er2) {
    if (er2.code === 'ENOENT') {
      return;
    } else {
      throw er;
    }
  }

  try {
    stats = options.statSync(p);
  } catch (er3) {
    if (er3.code === 'ENOENT') {
      return;
    } else {
      throw er;
    }
  }

  if (stats.isDirectory()) {
    rmdirSync(p, options, er);
  } else {
    options.unlinkSync(p);
  }
}

function rmdir(p, options, originalEr, cb) {
  assert(p);
  assert(options);
  if (originalEr) {
    assert(originalEr instanceof Error);
  }
  assert(typeof cb === 'function');

  // try to rmdir first, and only readdir on ENOTEMPTY or EEXIST (SunOS)
  // if we guessed wrong, and it's not a directory, then
  // raise the original error.
  options.rmdir(p, function (er) {
    if (er && (er.code === 'ENOTEMPTY' || er.code === 'EEXIST' || er.code === 'EPERM')) {
      rmkids(p, options, cb);
    } else if (er && er.code === 'ENOTDIR') {
      cb(originalEr);
    } else {
      cb(er);
    }
  });
}

function rmkids(p, options, cb) {
  assert(p);
  assert(options);
  assert(typeof cb === 'function');

  options.readdir(p, function (er, files) {
    if (er) return cb(er);

    var n = files.length;
    var errState = void 0;

    if (n === 0) return options.rmdir(p, cb);

    files.forEach(function (f) {
      rimraf(path.join(p, f), options, function (er) {
        if (errState) {
          return;
        }
        if (er) return cb(errState = er);
        if (--n === 0) {
          options.rmdir(p, cb);
        }
      });
    });
  });
}

// this looks simpler, and is strictly *faster*, but will
// tie up the JavaScript thread and fail on excessively
// deep directory trees.
function rimrafSync(p, options) {
  var st = void 0;

  options = options || {};
  defaults$1(options);

  assert(p, 'rimraf: missing path');
  assert.equal(typeof p === 'undefined' ? 'undefined' : _typeof(p), 'string', 'rimraf: path should be a string');
  assert(options, 'rimraf: missing options');
  assert.equal(typeof options === 'undefined' ? 'undefined' : _typeof(options), 'object', 'rimraf: options should be object');

  try {
    st = options.lstatSync(p);
  } catch (er) {
    if (er.code === 'ENOENT') {
      return;
    }

    // Windows can EPERM on stat.  Life is suffering.
    if (er.code === 'EPERM' && isWindows) {
      fixWinEPERMSync(p, options, er);
    }
  }

  try {
    // sunos lets the root user unlink directories, which is... weird.
    if (st && st.isDirectory()) {
      rmdirSync(p, options, null);
    } else {
      options.unlinkSync(p);
    }
  } catch (er) {
    if (er.code === 'ENOENT') {
      return;
    } else if (er.code === 'EPERM') {
      return isWindows ? fixWinEPERMSync(p, options, er) : rmdirSync(p, options, er);
    } else if (er.code !== 'EISDIR') {
      throw er;
    }
    rmdirSync(p, options, er);
  }
}

function rmdirSync(p, options, originalEr) {
  assert(p);
  assert(options);
  if (originalEr) {
    assert(originalEr instanceof Error);
  }

  try {
    options.rmdirSync(p);
  } catch (er) {
    if (er.code === 'ENOTDIR') {
      throw originalEr;
    } else if (er.code === 'ENOTEMPTY' || er.code === 'EEXIST' || er.code === 'EPERM') {
      rmkidsSync(p, options);
    } else if (er.code !== 'ENOENT') {
      throw er;
    }
  }
}

function rmkidsSync(p, options) {
  assert(p);
  assert(options);
  options.readdirSync(p).forEach(function (f) {
    return rimrafSync(path.join(p, f), options);
  });

  // We only end up here once we got ENOTEMPTY at least once, and
  // at this point, we are guaranteed to have removed all the kids.
  // So, we know that it won't be ENOENT or ENOTDIR or anything else.
  // try really hard to delete stuff on windows, because it has a
  // PROFOUNDLY annoying habit of not closing handles promptly when
  // files are deleted, resulting in spurious ENOTEMPTY errors.
  var retries = isWindows ? 100 : 1;
  var i = 0;
  do {
    var threw = true;
    try {
      var ret = options.rmdirSync(p, options);
      threw = false;
      return ret;
    } finally {
      if (++i < retries && threw) continue; // eslint-disable-line
    }
  } while (true);
}

var rimraf_1 = rimraf;
rimraf.sync = rimrafSync;

var u$3 = universalify.fromCallback;

var remove = {
  remove: u$3(rimraf_1),
  removeSync: rimraf_1.sync
};

var _fs;
try {
  _fs = gracefulFs;
} catch (_) {
  _fs = fs;
}

function readFile(file, options, callback) {
  if (callback == null) {
    callback = options;
    options = {};
  }

  if (typeof options === 'string') {
    options = { encoding: options };
  }

  options = options || {};
  var fs$$1 = options.fs || _fs;

  var shouldThrow = true;
  if ('throws' in options) {
    shouldThrow = options.throws;
  }

  fs$$1.readFile(file, options, function (err, data) {
    if (err) return callback(err);

    data = stripBom(data);

    var obj;
    try {
      obj = JSON.parse(data, options ? options.reviver : null);
    } catch (err2) {
      if (shouldThrow) {
        err2.message = file + ': ' + err2.message;
        return callback(err2);
      } else {
        return callback(null, null);
      }
    }

    callback(null, obj);
  });
}

function readFileSync(file, options) {
  options = options || {};
  if (typeof options === 'string') {
    options = { encoding: options };
  }

  var fs$$1 = options.fs || _fs;

  var shouldThrow = true;
  if ('throws' in options) {
    shouldThrow = options.throws;
  }

  try {
    var content = fs$$1.readFileSync(file, options);
    content = stripBom(content);
    return JSON.parse(content, options.reviver);
  } catch (err) {
    if (shouldThrow) {
      err.message = file + ': ' + err.message;
      throw err;
    } else {
      return null;
    }
  }
}

function stringify(obj, options) {
  var spaces;
  var EOL = '\n';
  if ((typeof options === 'undefined' ? 'undefined' : _typeof(options)) === 'object' && options !== null) {
    if (options.spaces) {
      spaces = options.spaces;
    }
    if (options.EOL) {
      EOL = options.EOL;
    }
  }

  var str = JSON.stringify(obj, options ? options.replacer : null, spaces);

  return str.replace(/\n/g, EOL) + EOL;
}

function writeFile(file, obj, options, callback) {
  if (callback == null) {
    callback = options;
    options = {};
  }
  options = options || {};
  var fs$$1 = options.fs || _fs;

  var str = '';
  try {
    str = stringify(obj, options);
  } catch (err) {
    // Need to return whether a callback was passed or not
    if (callback) callback(err, null);
    return;
  }

  fs$$1.writeFile(file, str, options, callback);
}

function writeFileSync(file, obj, options) {
  options = options || {};
  var fs$$1 = options.fs || _fs;

  var str = stringify(obj, options);
  // not sure if fs.writeFileSync returns anything, but just in case
  return fs$$1.writeFileSync(file, str, options);
}

function stripBom(content) {
  // we do this because JSON.parse would convert it to a utf8 string if encoding wasn't specified
  if (Buffer.isBuffer(content)) content = content.toString('utf8');
  content = content.replace(/^\uFEFF/, '');
  return content;
}

var jsonfile = {
  readFile: readFile,
  readFileSync: readFileSync,
  writeFile: writeFile,
  writeFileSync: writeFileSync
};

var jsonfile_1 = jsonfile;

var u$4 = universalify.fromCallback;

var jsonfile$1 = {
  // jsonfile exports
  readJson: u$4(jsonfile_1.readFile),
  readJsonSync: jsonfile_1.readFileSync,
  writeJson: u$4(jsonfile_1.writeFile),
  writeJsonSync: jsonfile_1.writeFileSync
};

var pathExists$2 = pathExists_1.pathExists;

function outputJson(file, data, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  var dir = path.dirname(file);

  pathExists$2(dir, function (err, itDoes) {
    if (err) return callback(err);
    if (itDoes) return jsonfile$1.writeJson(file, data, options, callback);

    mkdirs_1$1.mkdirs(dir, function (err) {
      if (err) return callback(err);
      jsonfile$1.writeJson(file, data, options, callback);
    });
  });
}

var outputJson_1 = outputJson;

function outputJsonSync(file, data, options) {
  var dir = path.dirname(file);

  if (!gracefulFs.existsSync(dir)) {
    mkdirs_1$1.mkdirsSync(dir);
  }

  jsonfile$1.writeJsonSync(file, data, options);
}

var outputJsonSync_1 = outputJsonSync;

var u$5 = universalify.fromCallback;

jsonfile$1.outputJson = u$5(outputJson_1);
jsonfile$1.outputJsonSync = outputJsonSync_1;
// aliases
jsonfile$1.outputJSON = jsonfile$1.outputJson;
jsonfile$1.outputJSONSync = jsonfile$1.outputJsonSync;
jsonfile$1.writeJSON = jsonfile$1.writeJson;
jsonfile$1.writeJSONSync = jsonfile$1.writeJsonSync;
jsonfile$1.readJSON = jsonfile$1.readJson;
jsonfile$1.readJSONSync = jsonfile$1.readJsonSync;

var json = jsonfile$1;

// most of this code was written by Andrew Kelley
// licensed under the BSD license: see
// https://github.com/andrewrk/node-mv/blob/master/package.json

// this needs a cleanup

var u$6 = universalify.fromCallback;

var remove$1 = remove.remove;
var mkdirp$1 = mkdirs_1$1.mkdirs;

function move(src, dest, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  var overwrite = options.overwrite || options.clobber || false;

  isSrcSubdir$2(src, dest, function (err, itIs) {
    if (err) return callback(err);
    if (itIs) return callback(new Error('Cannot move \'' + src + '\' to a subdirectory of itself, \'' + dest + '\'.'));
    mkdirp$1(path.dirname(dest), function (err) {
      if (err) return callback(err);
      doRename();
    });
  });

  function doRename() {
    if (path.resolve(src) === path.resolve(dest)) {
      gracefulFs.access(src, callback);
    } else if (overwrite) {
      gracefulFs.rename(src, dest, function (err) {
        if (!err) return callback();

        if (err.code === 'ENOTEMPTY' || err.code === 'EEXIST') {
          remove$1(dest, function (err) {
            if (err) return callback(err);
            options.overwrite = false; // just overwriteed it, no need to do it again
            move(src, dest, options, callback);
          });
          return;
        }

        // weird Windows shit
        if (err.code === 'EPERM') {
          setTimeout(function () {
            remove$1(dest, function (err) {
              if (err) return callback(err);
              options.overwrite = false;
              move(src, dest, options, callback);
            });
          }, 200);
          return;
        }

        if (err.code !== 'EXDEV') return callback(err);
        moveAcrossDevice(src, dest, overwrite, callback);
      });
    } else {
      gracefulFs.link(src, dest, function (err) {
        if (err) {
          if (err.code === 'EXDEV' || err.code === 'EISDIR' || err.code === 'EPERM' || err.code === 'ENOTSUP') {
            return moveAcrossDevice(src, dest, overwrite, callback);
          }
          return callback(err);
        }
        return gracefulFs.unlink(src, callback);
      });
    }
  }
}

function moveAcrossDevice(src, dest, overwrite, callback) {
  gracefulFs.stat(src, function (err, stat) {
    if (err) return callback(err);

    if (stat.isDirectory()) {
      moveDirAcrossDevice(src, dest, overwrite, callback);
    } else {
      moveFileAcrossDevice(src, dest, overwrite, callback);
    }
  });
}

function moveFileAcrossDevice(src, dest, overwrite, callback) {
  var flags = overwrite ? 'w' : 'wx';
  var ins = gracefulFs.createReadStream(src);
  var outs = gracefulFs.createWriteStream(dest, { flags: flags });

  ins.on('error', function (err) {
    ins.destroy();
    outs.destroy();
    outs.removeListener('close', onClose);

    // may want to create a directory but `out` line above
    // creates an empty file for us: See #108
    // don't care about error here
    gracefulFs.unlink(dest, function () {
      // note: `err` here is from the input stream errror
      if (err.code === 'EISDIR' || err.code === 'EPERM') {
        moveDirAcrossDevice(src, dest, overwrite, callback);
      } else {
        callback(err);
      }
    });
  });

  outs.on('error', function (err) {
    ins.destroy();
    outs.destroy();
    outs.removeListener('close', onClose);
    callback(err);
  });

  outs.once('close', onClose);
  ins.pipe(outs);

  function onClose() {
    gracefulFs.unlink(src, callback);
  }
}

function moveDirAcrossDevice(src, dest, overwrite, callback) {
  var options = {
    overwrite: false
  };

  if (overwrite) {
    remove$1(dest, function (err) {
      if (err) return callback(err);
      startCopy();
    });
  } else {
    startCopy();
  }

  function startCopy() {
    copy_1(src, dest, options, function (err) {
      if (err) return callback(err);
      remove$1(src, callback);
    });
  }
}

// return true if dest is a subdir of src, otherwise false.
// extract dest base dir and check if that is the same as src basename
function isSrcSubdir$2(src, dest, cb) {
  gracefulFs.stat(src, function (err, st) {
    if (err) return cb(err);
    if (st.isDirectory()) {
      var baseDir = dest.split(path.dirname(src) + path.sep)[1];
      if (baseDir) {
        var destBasename = baseDir.split(path.sep)[0];
        if (destBasename) return cb(null, src !== dest && dest.indexOf(src) > -1 && destBasename === path.basename(src));
        return cb(null, false);
      }
      return cb(null, false);
    }
    return cb(null, false);
  });
}

var move_1 = {
  move: u$6(move)
};

var copySync$2 = copySync$1.copySync;
var removeSync = remove.removeSync;
var mkdirpSync$1 = mkdirs_1$1.mkdirsSync;

function moveSync(src, dest, options) {
  options = options || {};
  var overwrite = options.overwrite || options.clobber || false;

  src = path.resolve(src);
  dest = path.resolve(dest);

  if (src === dest) return gracefulFs.accessSync(src);

  if (isSrcSubdir$3(src, dest)) throw new Error('Cannot move \'' + src + '\' into itself \'' + dest + '\'.');

  mkdirpSync$1(path.dirname(dest));
  tryRenameSync();

  function tryRenameSync() {
    if (overwrite) {
      try {
        return gracefulFs.renameSync(src, dest);
      } catch (err) {
        if (err.code === 'ENOTEMPTY' || err.code === 'EEXIST' || err.code === 'EPERM') {
          removeSync(dest);
          options.overwrite = false; // just overwriteed it, no need to do it again
          return moveSync(src, dest, options);
        }

        if (err.code !== 'EXDEV') throw err;
        return moveSyncAcrossDevice(src, dest, overwrite);
      }
    } else {
      try {
        gracefulFs.linkSync(src, dest);
        return gracefulFs.unlinkSync(src);
      } catch (err) {
        if (err.code === 'EXDEV' || err.code === 'EISDIR' || err.code === 'EPERM' || err.code === 'ENOTSUP') {
          return moveSyncAcrossDevice(src, dest, overwrite);
        }
        throw err;
      }
    }
  }
}

function moveSyncAcrossDevice(src, dest, overwrite) {
  var stat = gracefulFs.statSync(src);

  if (stat.isDirectory()) {
    return moveDirSyncAcrossDevice(src, dest, overwrite);
  } else {
    return moveFileSyncAcrossDevice(src, dest, overwrite);
  }
}

function moveFileSyncAcrossDevice(src, dest, overwrite) {
  var BUF_LENGTH = 64 * 1024;
  var _buff = buffer(BUF_LENGTH);

  var flags = overwrite ? 'w' : 'wx';

  var fdr = gracefulFs.openSync(src, 'r');
  var stat = gracefulFs.fstatSync(fdr);
  var fdw = gracefulFs.openSync(dest, flags, stat.mode);
  var bytesRead = 1;
  var pos = 0;

  while (bytesRead > 0) {
    bytesRead = gracefulFs.readSync(fdr, _buff, 0, BUF_LENGTH, pos);
    gracefulFs.writeSync(fdw, _buff, 0, bytesRead);
    pos += bytesRead;
  }

  gracefulFs.closeSync(fdr);
  gracefulFs.closeSync(fdw);
  return gracefulFs.unlinkSync(src);
}

function moveDirSyncAcrossDevice(src, dest, overwrite) {
  var options = {
    overwrite: false
  };

  if (overwrite) {
    removeSync(dest);
    tryCopySync();
  } else {
    tryCopySync();
  }

  function tryCopySync() {
    copySync$2(src, dest, options);
    return removeSync(src);
  }
}

// return true if dest is a subdir of src, otherwise false.
// extract dest base dir and check if that is the same as src basename
function isSrcSubdir$3(src, dest) {
  try {
    return gracefulFs.statSync(src).isDirectory() && src !== dest && dest.indexOf(src) > -1 && dest.split(path.dirname(src) + path.sep)[1].split(path.sep)[0] === path.basename(src);
  } catch (e) {
    return false;
  }
}

var moveSync_1 = {
  moveSync: moveSync
};

var u$7 = universalify.fromCallback;

var emptyDir = u$7(function emptyDir(dir, callback) {
  callback = callback || function () {};
  fs.readdir(dir, function (err, items) {
    if (err) return mkdirs_1$1.mkdirs(dir, callback);

    items = items.map(function (item) {
      return path.join(dir, item);
    });

    deleteItem();

    function deleteItem() {
      var item = items.pop();
      if (!item) return callback();
      remove.remove(item, function (err) {
        if (err) return callback(err);
        deleteItem();
      });
    }
  });
});

function emptyDirSync(dir) {
  var items = void 0;
  try {
    items = fs.readdirSync(dir);
  } catch (err) {
    return mkdirs_1$1.mkdirsSync(dir);
  }

  items.forEach(function (item) {
    item = path.join(dir, item);
    remove.removeSync(item);
  });
}

var empty = {
  emptyDirSync: emptyDirSync,
  emptydirSync: emptyDirSync,
  emptyDir: emptyDir,
  emptydir: emptyDir
};

var u$8 = universalify.fromCallback;

var pathExists$3 = pathExists_1.pathExists;

function createFile(file, callback) {
  function makeFile() {
    gracefulFs.writeFile(file, '', function (err) {
      if (err) return callback(err);
      callback();
    });
  }

  gracefulFs.stat(file, function (err, stats) {
    // eslint-disable-line handle-callback-err
    if (!err && stats.isFile()) return callback();
    var dir = path.dirname(file);
    pathExists$3(dir, function (err, dirExists) {
      if (err) return callback(err);
      if (dirExists) return makeFile();
      mkdirs_1$1.mkdirs(dir, function (err) {
        if (err) return callback(err);
        makeFile();
      });
    });
  });
}

function createFileSync(file) {
  var stats = void 0;
  try {
    stats = gracefulFs.statSync(file);
  } catch (e) {}
  if (stats && stats.isFile()) return;

  var dir = path.dirname(file);
  if (!gracefulFs.existsSync(dir)) {
    mkdirs_1$1.mkdirsSync(dir);
  }

  gracefulFs.writeFileSync(file, '');
}

var file = {
  createFile: u$8(createFile),
  createFileSync: createFileSync
};

var u$9 = universalify.fromCallback;

var pathExists$4 = pathExists_1.pathExists;

function createLink(srcpath, dstpath, callback) {
  function makeLink(srcpath, dstpath) {
    gracefulFs.link(srcpath, dstpath, function (err) {
      if (err) return callback(err);
      callback(null);
    });
  }

  pathExists$4(dstpath, function (err, destinationExists) {
    if (err) return callback(err);
    if (destinationExists) return callback(null);
    gracefulFs.lstat(srcpath, function (err, stat) {
      if (err) {
        err.message = err.message.replace('lstat', 'ensureLink');
        return callback(err);
      }

      var dir = path.dirname(dstpath);
      pathExists$4(dir, function (err, dirExists) {
        if (err) return callback(err);
        if (dirExists) return makeLink(srcpath, dstpath);
        mkdirs_1$1.mkdirs(dir, function (err) {
          if (err) return callback(err);
          makeLink(srcpath, dstpath);
        });
      });
    });
  });
}

function createLinkSync(srcpath, dstpath, callback) {
  var destinationExists = gracefulFs.existsSync(dstpath);
  if (destinationExists) return undefined;

  try {
    gracefulFs.lstatSync(srcpath);
  } catch (err) {
    err.message = err.message.replace('lstat', 'ensureLink');
    throw err;
  }

  var dir = path.dirname(dstpath);
  var dirExists = gracefulFs.existsSync(dir);
  if (dirExists) return gracefulFs.linkSync(srcpath, dstpath);
  mkdirs_1$1.mkdirsSync(dir);

  return gracefulFs.linkSync(srcpath, dstpath);
}

var link = {
  createLink: u$9(createLink),
  createLinkSync: createLinkSync
};

var pathExists$5 = pathExists_1.pathExists;

/**
 * Function that returns two types of paths, one relative to symlink, and one
 * relative to the current working directory. Checks if path is absolute or
 * relative. If the path is relative, this function checks if the path is
 * relative to symlink or relative to current working directory. This is an
 * initiative to find a smarter `srcpath` to supply when building symlinks.
 * This allows you to determine which path to use out of one of three possible
 * types of source paths. The first is an absolute path. This is detected by
 * `path.isAbsolute()`. When an absolute path is provided, it is checked to
 * see if it exists. If it does it's used, if not an error is returned
 * (callback)/ thrown (sync). The other two options for `srcpath` are a
 * relative url. By default Node's `fs.symlink` works by creating a symlink
 * using `dstpath` and expects the `srcpath` to be relative to the newly
 * created symlink. If you provide a `srcpath` that does not exist on the file
 * system it results in a broken symlink. To minimize this, the function
 * checks to see if the 'relative to symlink' source file exists, and if it
 * does it will use it. If it does not, it checks if there's a file that
 * exists that is relative to the current working directory, if does its used.
 * This preserves the expectations of the original fs.symlink spec and adds
 * the ability to pass in `relative to current working direcotry` paths.
 */

function symlinkPaths(srcpath, dstpath, callback) {
  if (path.isAbsolute(srcpath)) {
    return gracefulFs.lstat(srcpath, function (err, stat) {
      if (err) {
        err.message = err.message.replace('lstat', 'ensureSymlink');
        return callback(err);
      }
      return callback(null, {
        'toCwd': srcpath,
        'toDst': srcpath
      });
    });
  } else {
    var dstdir = path.dirname(dstpath);
    var relativeToDst = path.join(dstdir, srcpath);
    return pathExists$5(relativeToDst, function (err, exists) {
      if (err) return callback(err);
      if (exists) {
        return callback(null, {
          'toCwd': relativeToDst,
          'toDst': srcpath
        });
      } else {
        return gracefulFs.lstat(srcpath, function (err, stat) {
          if (err) {
            err.message = err.message.replace('lstat', 'ensureSymlink');
            return callback(err);
          }
          return callback(null, {
            'toCwd': srcpath,
            'toDst': path.relative(dstdir, srcpath)
          });
        });
      }
    });
  }
}

function symlinkPathsSync(srcpath, dstpath) {
  var exists = void 0;
  if (path.isAbsolute(srcpath)) {
    exists = gracefulFs.existsSync(srcpath);
    if (!exists) throw new Error('absolute srcpath does not exist');
    return {
      'toCwd': srcpath,
      'toDst': srcpath
    };
  } else {
    var dstdir = path.dirname(dstpath);
    var relativeToDst = path.join(dstdir, srcpath);
    exists = gracefulFs.existsSync(relativeToDst);
    if (exists) {
      return {
        'toCwd': relativeToDst,
        'toDst': srcpath
      };
    } else {
      exists = gracefulFs.existsSync(srcpath);
      if (!exists) throw new Error('relative srcpath does not exist');
      return {
        'toCwd': srcpath,
        'toDst': path.relative(dstdir, srcpath)
      };
    }
  }
}

var symlinkPaths_1 = {
  symlinkPaths: symlinkPaths,
  symlinkPathsSync: symlinkPathsSync
};

function symlinkType(srcpath, type, callback) {
  callback = typeof type === 'function' ? type : callback;
  type = typeof type === 'function' ? false : type;
  if (type) return callback(null, type);
  gracefulFs.lstat(srcpath, function (err, stats) {
    if (err) return callback(null, 'file');
    type = stats && stats.isDirectory() ? 'dir' : 'file';
    callback(null, type);
  });
}

function symlinkTypeSync(srcpath, type) {
  var stats = void 0;

  if (type) return type;
  try {
    stats = gracefulFs.lstatSync(srcpath);
  } catch (e) {
    return 'file';
  }
  return stats && stats.isDirectory() ? 'dir' : 'file';
}

var symlinkType_1 = {
  symlinkType: symlinkType,
  symlinkTypeSync: symlinkTypeSync
};

var u$a = universalify.fromCallback;

var mkdirs$2 = mkdirs_1$1.mkdirs;
var mkdirsSync$1 = mkdirs_1$1.mkdirsSync;

var symlinkPaths$1 = symlinkPaths_1.symlinkPaths;
var symlinkPathsSync$1 = symlinkPaths_1.symlinkPathsSync;

var symlinkType$1 = symlinkType_1.symlinkType;
var symlinkTypeSync$1 = symlinkType_1.symlinkTypeSync;

var pathExists$6 = pathExists_1.pathExists;

function createSymlink(srcpath, dstpath, type, callback) {
  callback = typeof type === 'function' ? type : callback;
  type = typeof type === 'function' ? false : type;

  pathExists$6(dstpath, function (err, destinationExists) {
    if (err) return callback(err);
    if (destinationExists) return callback(null);
    symlinkPaths$1(srcpath, dstpath, function (err, relative) {
      if (err) return callback(err);
      srcpath = relative.toDst;
      symlinkType$1(relative.toCwd, type, function (err, type) {
        if (err) return callback(err);
        var dir = path.dirname(dstpath);
        pathExists$6(dir, function (err, dirExists) {
          if (err) return callback(err);
          if (dirExists) return gracefulFs.symlink(srcpath, dstpath, type, callback);
          mkdirs$2(dir, function (err) {
            if (err) return callback(err);
            gracefulFs.symlink(srcpath, dstpath, type, callback);
          });
        });
      });
    });
  });
}

function createSymlinkSync(srcpath, dstpath, type, callback) {
  callback = typeof type === 'function' ? type : callback;
  type = typeof type === 'function' ? false : type;

  var destinationExists = gracefulFs.existsSync(dstpath);
  if (destinationExists) return undefined;

  var relative = symlinkPathsSync$1(srcpath, dstpath);
  srcpath = relative.toDst;
  type = symlinkTypeSync$1(relative.toCwd, type);
  var dir = path.dirname(dstpath);
  var exists = gracefulFs.existsSync(dir);
  if (exists) return gracefulFs.symlinkSync(srcpath, dstpath, type);
  mkdirsSync$1(dir);
  return gracefulFs.symlinkSync(srcpath, dstpath, type);
}

var symlink = {
  createSymlink: u$a(createSymlink),
  createSymlinkSync: createSymlinkSync
};

var ensure = {
  // file
  createFile: file.createFile,
  createFileSync: file.createFileSync,
  ensureFile: file.createFile,
  ensureFileSync: file.createFileSync,
  // link
  createLink: link.createLink,
  createLinkSync: link.createLinkSync,
  ensureLink: link.createLink,
  ensureLinkSync: link.createLinkSync,
  // symlink
  createSymlink: symlink.createSymlink,
  createSymlinkSync: symlink.createSymlinkSync,
  ensureSymlink: symlink.createSymlink,
  ensureSymlinkSync: symlink.createSymlinkSync
};

var u$b = universalify.fromCallback;

var pathExists$7 = pathExists_1.pathExists;

function outputFile(file, data, encoding, callback) {
  if (typeof encoding === 'function') {
    callback = encoding;
    encoding = 'utf8';
  }

  var dir = path.dirname(file);
  pathExists$7(dir, function (err, itDoes) {
    if (err) return callback(err);
    if (itDoes) return gracefulFs.writeFile(file, data, encoding, callback);

    mkdirs_1$1.mkdirs(dir, function (err) {
      if (err) return callback(err);

      gracefulFs.writeFile(file, data, encoding, callback);
    });
  });
}

function outputFileSync(file, data, encoding) {
  var dir = path.dirname(file);
  if (gracefulFs.existsSync(dir)) {
    return gracefulFs.writeFileSync.apply(gracefulFs, arguments);
  }
  mkdirs_1$1.mkdirsSync(dir);
  gracefulFs.writeFileSync.apply(gracefulFs, arguments);
}

var output = {
  outputFile: u$b(outputFile),
  outputFileSync: outputFileSync
};

var fs$1 = {};

// Export graceful-fs:
assign_1(fs$1, fs_1$1);
// Export extra methods:
assign_1(fs$1, copy$1);
assign_1(fs$1, copySync$1);
assign_1(fs$1, mkdirs_1$1);
assign_1(fs$1, remove);
assign_1(fs$1, json);
assign_1(fs$1, move_1);
assign_1(fs$1, moveSync_1);
assign_1(fs$1, empty);
assign_1(fs$1, ensure);
assign_1(fs$1, output);
assign_1(fs$1, pathExists_1);

var lib = fs$1;

/**
 * Takes an array of files/directories to copy to the final build directory.
 * @param {Object} options The options object.
 * @return {Object} The rollup code object.
 */
function copy$2() {
  var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  var assets = options.assets,
      outputDir = options.outputDir;

  var basedir = '';
  return {
    name: 'copy-assets',
    options: function options(options) {
      // Cache the base directory so we can figure out where to put assets.
      // Handling input as array
      var inputStr = Array.isArray(options.input) ? options.input[0] : options.input;
      basedir = path.dirname(inputStr);
    },
    generateBundle: function generateBundle(_ref) {
      var file = _ref.file,
          dir = _ref.dir;

      var outputDirectory = dir || path.dirname(file);
      return Promise.all(assets.map(function (asset) {
        // console.log(!!outputDir, outputDir, dir);
        var isFolder = !path.basename(asset).includes('.');
        var out = !!outputDir ? path.join(outputDirectory, outputDir, isFolder ? '' : path.basename(asset)) : path.join(outputDirectory, path.relative(basedir, asset));
        console.log(out);
        return lib.copy(asset, out);
      }));
    }
  };
}

module.exports = copy$2;
