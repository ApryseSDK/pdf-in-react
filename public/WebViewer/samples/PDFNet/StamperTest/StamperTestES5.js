/**
 * Copyright (c) 2014, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * https://raw.github.com/facebook/regenerator/master/LICENSE file. An
 * additional grant of patent rights can be found in the PATENTS file in
 * the same directory.
 */

!(function(global) {
  "use strict";

  var hasOwn = Object.prototype.hasOwnProperty;
  var undefined; // More compressible than void 0.
  var $Symbol = typeof Symbol === "function" ? Symbol : {};
  var iteratorSymbol = $Symbol.iterator || "@@iterator";
  var toStringTagSymbol = $Symbol.toStringTag || "@@toStringTag";

  var inModule = typeof module === "object";
  var runtime = global.regeneratorRuntime;
  if (runtime) {
    if (inModule) {
      // If regeneratorRuntime is defined globally and we're in a module,
      // make the exports object identical to regeneratorRuntime.
      module.exports = runtime;
    }
    // Don't bother evaluating the rest of this file if the runtime was
    // already defined globally.
    return;
  }

  // Define the runtime globally (as expected by generated code) as either
  // module.exports (if we're in a module) or a new, empty object.
  runtime = global.regeneratorRuntime = inModule ? module.exports : {};

  function wrap(innerFn, outerFn, self, tryLocsList) {
    // If outerFn provided and outerFn.prototype is a Generator, then outerFn.prototype instanceof Generator.
    var protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator;
    var generator = Object.create(protoGenerator.prototype);
    var context = new Context(tryLocsList || []);

    // The ._invoke method unifies the implementations of the .next,
    // .throw, and .return methods.
    generator._invoke = makeInvokeMethod(innerFn, self, context);

    return generator;
  }
  runtime.wrap = wrap;

  // Try/catch helper to minimize deoptimizations. Returns a completion
  // record like context.tryEntries[i].completion. This interface could
  // have been (and was previously) designed to take a closure to be
  // invoked without arguments, but in all the cases we care about we
  // already have an existing method we want to call, so there's no need
  // to create a new function object. We can even get away with assuming
  // the method takes exactly one argument, since that happens to be true
  // in every case, so we don't have to touch the arguments object. The
  // only additional allocation required is the completion record, which
  // has a stable shape and so hopefully should be cheap to allocate.
  function tryCatch(fn, obj, arg) {
    try {
      return { type: "normal", arg: fn.call(obj, arg) };
    } catch (err) {
      return { type: "throw", arg: err };
    }
  }

  var GenStateSuspendedStart = "suspendedStart";
  var GenStateSuspendedYield = "suspendedYield";
  var GenStateExecuting = "executing";
  var GenStateCompleted = "completed";

  // Returning this object from the innerFn has the same effect as
  // breaking out of the dispatch switch statement.
  var ContinueSentinel = {};

  // Dummy constructor functions that we use as the .constructor and
  // .constructor.prototype properties for functions that return Generator
  // objects. For full spec compliance, you may wish to configure your
  // minifier not to mangle the names of these two functions.
  function Generator() {}
  function GeneratorFunction() {}
  function GeneratorFunctionPrototype() {}

  var Gp = GeneratorFunctionPrototype.prototype = Generator.prototype;
  GeneratorFunction.prototype = Gp.constructor = GeneratorFunctionPrototype;
  GeneratorFunctionPrototype.constructor = GeneratorFunction;
  GeneratorFunctionPrototype[toStringTagSymbol] = GeneratorFunction.displayName = "GeneratorFunction";

  // Helper for defining the .next, .throw, and .return methods of the
  // Iterator interface in terms of a single ._invoke method.
  function defineIteratorMethods(prototype) {
    ["next", "throw", "return"].forEach(function(method) {
      prototype[method] = function(arg) {
        return this._invoke(method, arg);
      };
    });
  }

  runtime.isGeneratorFunction = function(genFun) {
    var ctor = typeof genFun === "function" && genFun.constructor;
    return ctor
      ? ctor === GeneratorFunction ||
        // For the native GeneratorFunction constructor, the best we can
        // do is to check its .name property.
        (ctor.displayName || ctor.name) === "GeneratorFunction"
      : false;
  };

  runtime.mark = function(genFun) {
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(genFun, GeneratorFunctionPrototype);
    } else {
      genFun.__proto__ = GeneratorFunctionPrototype;
      if (!(toStringTagSymbol in genFun)) {
        genFun[toStringTagSymbol] = "GeneratorFunction";
      }
    }
    genFun.prototype = Object.create(Gp);
    return genFun;
  };

  // Within the body of any async function, `await x` is transformed to
  // `yield regeneratorRuntime.awrap(x)`, so that the runtime can test
  // `value instanceof AwaitArgument` to determine if the yielded value is
  // meant to be awaited. Some may consider the name of this method too
  // cutesy, but they are curmudgeons.
  runtime.awrap = function(arg) {
    return new AwaitArgument(arg);
  };

  function AwaitArgument(arg) {
    this.arg = arg;
  }

  function AsyncIterator(generator) {
    function invoke(method, arg, resolve, reject) {
      var record = tryCatch(generator[method], generator, arg);
      if (record.type === "throw") {
        reject(record.arg);
      } else {
        var result = record.arg;
        var value = result.value;
        if (value instanceof AwaitArgument) {
          return Promise.resolve(value.arg).then(function(value) {
            invoke("next", value, resolve, reject);
          }, function(err) {
            invoke("throw", err, resolve, reject);
          });
        }

        return Promise.resolve(value).then(function(unwrapped) {
          // When a yielded Promise is resolved, its final value becomes
          // the .value of the Promise<{value,done}> result for the
          // current iteration. If the Promise is rejected, however, the
          // result for this iteration will be rejected with the same
          // reason. Note that rejections of yielded Promises are not
          // thrown back into the generator function, as is the case
          // when an awaited Promise is rejected. This difference in
          // behavior between yield and await is important, because it
          // allows the consumer to decide what to do with the yielded
          // rejection (swallow it and continue, manually .throw it back
          // into the generator, abandon iteration, whatever). With
          // await, by contrast, there is no opportunity to examine the
          // rejection reason outside the generator function, so the
          // only option is to throw it from the await expression, and
          // let the generator function handle the exception.
          result.value = unwrapped;
          resolve(result);
        }, reject);
      }
    }

    if (typeof process === "object" && process.domain) {
      invoke = process.domain.bind(invoke);
    }

    var previousPromise;

    function enqueue(method, arg) {
      function callInvokeWithMethodAndArg() {
        return new Promise(function(resolve, reject) {
          invoke(method, arg, resolve, reject);
        });
      }

      return previousPromise =
        // If enqueue has been called before, then we want to wait until
        // all previous Promises have been resolved before calling invoke,
        // so that results are always delivered in the correct order. If
        // enqueue has not been called before, then it is important to
        // call invoke immediately, without waiting on a callback to fire,
        // so that the async generator function has the opportunity to do
        // any necessary setup in a predictable way. This predictability
        // is why the Promise constructor synchronously invokes its
        // executor callback, and why async functions synchronously
        // execute code before the first await. Since we implement simple
        // async functions in terms of async generators, it is especially
        // important to get this right, even though it requires care.
        previousPromise ? previousPromise.then(
          callInvokeWithMethodAndArg,
          // Avoid propagating failures to Promises returned by later
          // invocations of the iterator.
          callInvokeWithMethodAndArg
        ) : callInvokeWithMethodAndArg();
    }

    // Define the unified helper method that is used to implement .next,
    // .throw, and .return (see defineIteratorMethods).
    this._invoke = enqueue;
  }

  defineIteratorMethods(AsyncIterator.prototype);

  // Note that simple async functions are implemented on top of
  // AsyncIterator objects; they just return a Promise for the value of
  // the final result produced by the iterator.
  runtime.async = function(innerFn, outerFn, self, tryLocsList) {
    var iter = new AsyncIterator(
      wrap(innerFn, outerFn, self, tryLocsList)
    );

    return runtime.isGeneratorFunction(outerFn)
      ? iter // If outerFn is a generator, return the full iterator.
      : iter.next().then(function(result) {
          return result.done ? result.value : iter.next();
        });
  };

  function makeInvokeMethod(innerFn, self, context) {
    var state = GenStateSuspendedStart;

    return function invoke(method, arg) {
      if (state === GenStateExecuting) {
        throw new Error("Generator is already running");
      }

      if (state === GenStateCompleted) {
        if (method === "throw") {
          throw arg;
        }

        // Be forgiving, per 25.3.3.3.3 of the spec:
        // https://people.mozilla.org/~jorendorff/es6-draft.html#sec-generatorresume
        return doneResult();
      }

      while (true) {
        var delegate = context.delegate;
        if (delegate) {
          if (method === "return" ||
              (method === "throw" && delegate.iterator[method] === undefined)) {
            // A return or throw (when the delegate iterator has no throw
            // method) always terminates the yield* loop.
            context.delegate = null;

            // If the delegate iterator has a return method, give it a
            // chance to clean up.
            var returnMethod = delegate.iterator["return"];
            if (returnMethod) {
              var record = tryCatch(returnMethod, delegate.iterator, arg);
              if (record.type === "throw") {
                // If the return method threw an exception, let that
                // exception prevail over the original return or throw.
                method = "throw";
                arg = record.arg;
                continue;
              }
            }

            if (method === "return") {
              // Continue with the outer return, now that the delegate
              // iterator has been terminated.
              continue;
            }
          }

          var record = tryCatch(
            delegate.iterator[method],
            delegate.iterator,
            arg
          );

          if (record.type === "throw") {
            context.delegate = null;

            // Like returning generator.throw(uncaught), but without the
            // overhead of an extra function call.
            method = "throw";
            arg = record.arg;
            continue;
          }

          // Delegate generator ran and handled its own exceptions so
          // regardless of what the method was, we continue as if it is
          // "next" with an undefined arg.
          method = "next";
          arg = undefined;

          var info = record.arg;
          if (info.done) {
            context[delegate.resultName] = info.value;
            context.next = delegate.nextLoc;
          } else {
            state = GenStateSuspendedYield;
            return info;
          }

          context.delegate = null;
        }

        if (method === "next") {
          // Setting context._sent for legacy support of Babel's
          // function.sent implementation.
          context.sent = context._sent = arg;

        } else if (method === "throw") {
          if (state === GenStateSuspendedStart) {
            state = GenStateCompleted;
            throw arg;
          }

          if (context.dispatchException(arg)) {
            // If the dispatched exception was caught by a catch block,
            // then let that catch block handle the exception normally.
            method = "next";
            arg = undefined;
          }

        } else if (method === "return") {
          context.abrupt("return", arg);
        }

        state = GenStateExecuting;

        var record = tryCatch(innerFn, self, context);
        if (record.type === "normal") {
          // If an exception is thrown from innerFn, we leave state ===
          // GenStateExecuting and loop back for another invocation.
          state = context.done
            ? GenStateCompleted
            : GenStateSuspendedYield;

          var info = {
            value: record.arg,
            done: context.done
          };

          if (record.arg === ContinueSentinel) {
            if (context.delegate && method === "next") {
              // Deliberately forget the last sent value so that we don't
              // accidentally pass it on to the delegate.
              arg = undefined;
            }
          } else {
            return info;
          }

        } else if (record.type === "throw") {
          state = GenStateCompleted;
          // Dispatch the exception by looping back around to the
          // context.dispatchException(arg) call above.
          method = "throw";
          arg = record.arg;
        }
      }
    };
  }

  // Define Generator.prototype.{next,throw,return} in terms of the
  // unified ._invoke helper method.
  defineIteratorMethods(Gp);

  Gp[iteratorSymbol] = function() {
    return this;
  };

  Gp[toStringTagSymbol] = "Generator";

  Gp.toString = function() {
    return "[object Generator]";
  };

  function pushTryEntry(locs) {
    var entry = { tryLoc: locs[0] };

    if (1 in locs) {
      entry.catchLoc = locs[1];
    }

    if (2 in locs) {
      entry.finallyLoc = locs[2];
      entry.afterLoc = locs[3];
    }

    this.tryEntries.push(entry);
  }

  function resetTryEntry(entry) {
    var record = entry.completion || {};
    record.type = "normal";
    delete record.arg;
    entry.completion = record;
  }

  function Context(tryLocsList) {
    // The root entry object (effectively a try statement without a catch
    // or a finally block) gives us a place to store values thrown from
    // locations where there is no enclosing try statement.
    this.tryEntries = [{ tryLoc: "root" }];
    tryLocsList.forEach(pushTryEntry, this);
    this.reset(true);
  }

  runtime.keys = function(object) {
    var keys = [];
    for (var key in object) {
      keys.push(key);
    }
    keys.reverse();

    // Rather than returning an object with a next method, we keep
    // things simple and return the next function itself.
    return function next() {
      while (keys.length) {
        var key = keys.pop();
        if (key in object) {
          next.value = key;
          next.done = false;
          return next;
        }
      }

      // To avoid creating an additional object, we just hang the .value
      // and .done properties off the next function object itself. This
      // also ensures that the minifier will not anonymize the function.
      next.done = true;
      return next;
    };
  };

  function values(iterable) {
    if (iterable) {
      var iteratorMethod = iterable[iteratorSymbol];
      if (iteratorMethod) {
        return iteratorMethod.call(iterable);
      }

      if (typeof iterable.next === "function") {
        return iterable;
      }

      if (!isNaN(iterable.length)) {
        var i = -1, next = function next() {
          while (++i < iterable.length) {
            if (hasOwn.call(iterable, i)) {
              next.value = iterable[i];
              next.done = false;
              return next;
            }
          }

          next.value = undefined;
          next.done = true;

          return next;
        };

        return next.next = next;
      }
    }

    // Return an iterator with no values.
    return { next: doneResult };
  }
  runtime.values = values;

  function doneResult() {
    return { value: undefined, done: true };
  }

  Context.prototype = {
    constructor: Context,

    reset: function(skipTempReset) {
      this.prev = 0;
      this.next = 0;
      // Resetting context._sent for legacy support of Babel's
      // function.sent implementation.
      this.sent = this._sent = undefined;
      this.done = false;
      this.delegate = null;

      this.tryEntries.forEach(resetTryEntry);

      if (!skipTempReset) {
        for (var name in this) {
          // Not sure about the optimal order of these conditions:
          if (name.charAt(0) === "t" &&
              hasOwn.call(this, name) &&
              !isNaN(+name.slice(1))) {
            this[name] = undefined;
          }
        }
      }
    },

    stop: function() {
      this.done = true;

      var rootEntry = this.tryEntries[0];
      var rootRecord = rootEntry.completion;
      if (rootRecord.type === "throw") {
        throw rootRecord.arg;
      }

      return this.rval;
    },

    dispatchException: function(exception) {
      if (this.done) {
        throw exception;
      }

      var context = this;
      function handle(loc, caught) {
        record.type = "throw";
        record.arg = exception;
        context.next = loc;
        return !!caught;
      }

      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        var record = entry.completion;

        if (entry.tryLoc === "root") {
          // Exception thrown outside of any try block that could handle
          // it, so set the completion value of the entire function to
          // throw the exception.
          return handle("end");
        }

        if (entry.tryLoc <= this.prev) {
          var hasCatch = hasOwn.call(entry, "catchLoc");
          var hasFinally = hasOwn.call(entry, "finallyLoc");

          if (hasCatch && hasFinally) {
            if (this.prev < entry.catchLoc) {
              return handle(entry.catchLoc, true);
            } else if (this.prev < entry.finallyLoc) {
              return handle(entry.finallyLoc);
            }

          } else if (hasCatch) {
            if (this.prev < entry.catchLoc) {
              return handle(entry.catchLoc, true);
            }

          } else if (hasFinally) {
            if (this.prev < entry.finallyLoc) {
              return handle(entry.finallyLoc);
            }

          } else {
            throw new Error("try statement without catch or finally");
          }
        }
      }
    },

    abrupt: function(type, arg) {
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        if (entry.tryLoc <= this.prev &&
            hasOwn.call(entry, "finallyLoc") &&
            this.prev < entry.finallyLoc) {
          var finallyEntry = entry;
          break;
        }
      }

      if (finallyEntry &&
          (type === "break" ||
           type === "continue") &&
          finallyEntry.tryLoc <= arg &&
          arg <= finallyEntry.finallyLoc) {
        // Ignore the finally entry if control is not jumping to a
        // location outside the try/catch block.
        finallyEntry = null;
      }

      var record = finallyEntry ? finallyEntry.completion : {};
      record.type = type;
      record.arg = arg;

      if (finallyEntry) {
        this.next = finallyEntry.finallyLoc;
      } else {
        this.complete(record);
      }

      return ContinueSentinel;
    },

    complete: function(record, afterLoc) {
      if (record.type === "throw") {
        throw record.arg;
      }

      if (record.type === "break" ||
          record.type === "continue") {
        this.next = record.arg;
      } else if (record.type === "return") {
        this.rval = record.arg;
        this.next = "end";
      } else if (record.type === "normal" && afterLoc) {
        this.next = afterLoc;
      }
    },

    finish: function(finallyLoc) {
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        if (entry.finallyLoc === finallyLoc) {
          this.complete(entry.completion, entry.afterLoc);
          resetTryEntry(entry);
          return ContinueSentinel;
        }
      }
    },

    "catch": function(tryLoc) {
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        if (entry.tryLoc === tryLoc) {
          var record = entry.completion;
          if (record.type === "throw") {
            var thrown = record.arg;
            resetTryEntry(entry);
          }
          return thrown;
        }
      }

      // The context.catch method must only be called with a location
      // argument that corresponds to a known catch block.
      throw new Error("illegal catch attempt");
    },

    delegateYield: function(iterable, resultName, nextLoc) {
      this.delegate = {
        iterator: values(iterable),
        resultName: resultName,
        nextLoc: nextLoc
      };

      return ContinueSentinel;
    }
  };
})(
  // Among the various tricks for obtaining a reference to the global
  // object, this seems to be the most reliable technique that does not
  // use indirect eval (which violates Content Security Policy).
  typeof global === "object" ? global :
  typeof window === "object" ? window :
  typeof self === "object" ? self : this
);
//---------------------------------------------------------------------------------------
// Copyright (c) 2001-2014 by PDFTron Systems Inc. All Rights Reserved.
// Consult legal.txt regarding legal and license information.
//---------------------------------------------------------------------------------------
// eslint-disable-next-line spaced-comment
//# sourceURL=StamperTest.js
(function(exports) {
  'use strict';

  exports.runStamperTest = function() {
    var marked2$0 = [main].map(regeneratorRuntime.mark);
    function main() {
      var ret, input_url, doc, stamper, redColorPt, pgSet, oddPgSet, docBuffer, img, blackColorPt, fishDoc, srcPage, pageOneCrop, font, pgSetImage;

      return regeneratorRuntime.wrap(function main$(context$3$0) {
        while (1) switch (context$3$0.prev = context$3$0.next) {
        case 0:
          console.log('Beginning Test');
          ret = 0;
          input_url = '../TestFiles/';
          context$3$0.prev = 3;
          context$3$0.next = 6;
          return PDFNet.startDeallocateStack();
        case 6:
          context$3$0.next = 8;
          return PDFNet.PDFDoc.createFromURL(input_url + 'newsletter.pdf');
        case 8:
          doc = context$3$0.sent;
          doc.initSecurityHandler();
          doc.lock();
          console.log('PDFNet and PDF document initialized and locked');

          context$3$0.next = 14;
          return PDFNet.Stamper.create(PDFNet.Stamper.SizeType.e_relative_scale, 0.5, 0.5);
        case 14:
          stamper = context$3$0.sent;
          stamper.setAlignment(PDFNet.Stamper.HorizontalAlignment.e_horizontal_center, PDFNet.Stamper.VerticalAlignment.e_vertical_center);

          context$3$0.next = 18;
          return PDFNet.ColorPt.init(1, 0, 0);
        case 18:
          redColorPt = context$3$0.sent;
          stamper.setFontColor(redColorPt);
          context$3$0.t0 = PDFNet.PageSet;
          context$3$0.next = 23;
          return doc.getPageCount();
        case 23:
          context$3$0.t1 = context$3$0.sent;
          context$3$0.next = 26;
          return context$3$0.t0.createRange.call(context$3$0.t0, 1, context$3$0.t1);
        case 26:
          pgSet = context$3$0.sent;
          stamper.stampText(doc, 'If you are reading this\nthis is an even page', pgSet);
          context$3$0.t2 = PDFNet.PageSet;
          context$3$0.next = 31;
          return doc.getPageCount();
        case 31:
          context$3$0.t3 = context$3$0.sent;
          context$3$0.t4 = PDFNet.PageSet.Filter.e_odd;
          context$3$0.next = 35;
          return context$3$0.t2.createFilteredRange.call(context$3$0.t2, 1, context$3$0.t3, context$3$0.t4);
        case 35:
          oddPgSet = context$3$0.sent;
          // delete all text stamps in odd pages
          PDFNet.Stamper.deleteStamps(doc, oddPgSet);

          context$3$0.next = 39;
          return doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
        case 39:
          docBuffer = context$3$0.sent;
          saveBufferAsPDFDoc(docBuffer, 'newsletter_stamped_even.pdf');
          console.log('Sample 1 complete');

          context$3$0.next = 44;
          return PDFNet.endDeallocateStack();
        case 44:
          context$3$0.next = 50;
          break;
        case 46:
          context$3$0.prev = 46;
          context$3$0.t5 = context$3$0["catch"](3);
          console.log(context$3$0.t5.stack);
          ret = 1;
        case 50:
          context$3$0.prev = 50;
          context$3$0.next = 53;
          return PDFNet.startDeallocateStack();
        case 53:
          context$3$0.next = 55;
          return PDFNet.PDFDoc.createFromURL(input_url + 'newsletter.pdf');
        case 55:
          doc = context$3$0.sent;
          doc.initSecurityHandler();
          doc.lock();
          console.log('Sample 2 PDF document initialized and locked');

          context$3$0.next = 61;
          return PDFNet.Stamper.create(PDFNet.Stamper.SizeType.e_relative_scale, 0.5, 0.5);
        case 61:
          stamper = context$3$0.sent;
          context$3$0.next = 64;
          return PDFNet.Image.createFromURL(doc, input_url + 'peppers.jpg');
        case 64:
          img = context$3$0.sent;
          stamper.setSize(PDFNet.Stamper.SizeType.e_relative_scale, 0.5, 0.5);
          // set position of the image to the center, left of PDF pages
          stamper.setAlignment(PDFNet.Stamper.HorizontalAlignment.e_horizontal_left, PDFNet.Stamper.VerticalAlignment.e_vertical_center);

          context$3$0.next = 69;
          return PDFNet.ColorPt.init(0, 0, 0, 0);
        case 69:
          blackColorPt = context$3$0.sent;
          stamper.setFontColor(blackColorPt);
          stamper.setRotation(180);
          stamper.setAsBackground(false);
          context$3$0.next = 75;
          return PDFNet.PageSet.createRange(1, 2);
        case 75:
          pgSet = context$3$0.sent;
          stamper.stampImage(doc, img, pgSet);

          context$3$0.next = 79;
          return doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
        case 79:
          docBuffer = context$3$0.sent;
          saveBufferAsPDFDoc(docBuffer, 'newsletter_stamped_vegetable.pdf');
          console.log('sample 2 complete');
          context$3$0.next = 84;
          return PDFNet.endDeallocateStack();
        case 84:
          context$3$0.next = 90;
          break;
        case 86:
          context$3$0.prev = 86;
          context$3$0.t6 = context$3$0["catch"](50);
          console.log(context$3$0.t6.stack);
          ret = 1;
        case 90:
          context$3$0.prev = 90;
          context$3$0.next = 93;
          return PDFNet.startDeallocateStack();
        case 93:
          context$3$0.next = 95;
          return PDFNet.PDFDoc.createFromURL(input_url + 'newsletter.pdf');
        case 95:
          doc = context$3$0.sent;
          doc.initSecurityHandler();
          doc.lock();
          context$3$0.next = 100;
          return PDFNet.PDFDoc.createFromURL(input_url + 'fish.pdf');
        case 100:
          fishDoc = context$3$0.sent;
          fishDoc.initSecurityHandler();
          fishDoc.lock();
          console.log('Sample 3 PDF documents initialized and locked');

          context$3$0.next = 106;
          return PDFNet.Stamper.create(PDFNet.Stamper.SizeType.e_relative_scale, 0.5, 0.5);
        case 106:
          stamper = context$3$0.sent;
          context$3$0.next = 109;
          return fishDoc.getPage(1);
        case 109:
          srcPage = context$3$0.sent;
          context$3$0.next = 112;
          return srcPage.getCropBox();
        case 112:
          pageOneCrop = context$3$0.sent;
          context$3$0.t7 = stamper;
          context$3$0.t8 = PDFNet.Stamper.SizeType.e_absolute_size;
          context$3$0.next = 117;
          return pageOneCrop.width();
        case 117:
          context$3$0.t9 = context$3$0.sent;
          context$3$0.t10 = context$3$0.t9 * 0.1;
          context$3$0.t11 = -1;
          context$3$0.t7.setSize.call(context$3$0.t7, context$3$0.t8, context$3$0.t10, context$3$0.t11);
          stamper.setOpacity(0.4);
          stamper.setRotation(-67);

          // put the image at the bottom right hand corner
          stamper.setAlignment(PDFNet.Stamper.HorizontalAlignment.e_horizontal_right, PDFNet.Stamper.VerticalAlignment.e_vertical_bottom);
          context$3$0.t12 = PDFNet.PageSet;
          context$3$0.next = 127;
          return doc.getPageCount();
        case 127:
          context$3$0.t13 = context$3$0.sent;
          context$3$0.next = 130;
          return context$3$0.t12.createRange.call(context$3$0.t12, 1, context$3$0.t13);
        case 130:
          pgSet = context$3$0.sent;
          stamper.stampPage(doc, srcPage, pgSet);

          context$3$0.next = 134;
          return doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
        case 134:
          docBuffer = context$3$0.sent;
          saveBufferAsPDFDoc(docBuffer, 'newsletter_stamped_fish_corner.pdf');
          console.log('sample 3 complete');
          context$3$0.next = 139;
          return PDFNet.endDeallocateStack();
        case 139:
          context$3$0.next = 145;
          break;
        case 141:
          context$3$0.prev = 141;
          context$3$0.t14 = context$3$0["catch"](90);
          console.log(context$3$0.t14.stack);
          ret = 1;
        case 145:
          context$3$0.prev = 145;
          context$3$0.next = 148;
          return PDFNet.startDeallocateStack();
        case 148:
          context$3$0.next = 150;
          return PDFNet.PDFDoc.createFromURL(input_url + 'newsletter.pdf');
        case 150:
          doc = context$3$0.sent;
          doc.initSecurityHandler();
          doc.lock();
          console.log('Sample 4 PDF document initialized and locked');

          context$3$0.next = 156;
          return PDFNet.Stamper.create(PDFNet.Stamper.SizeType.e_absolute_size, 20, 20);
        case 156:
          stamper = context$3$0.sent;
          stamper.setOpacity(1);
          stamper.setRotation(45);
          stamper.setAsBackground(true);
          stamper.setPosition(30, 40);
          context$3$0.next = 163;
          return PDFNet.Image.createFromURL(doc, input_url + 'peppers.jpg');
        case 163:
          img = context$3$0.sent;
          context$3$0.next = 166;
          return PDFNet.PageSet.createFilteredRange(1, 20, PDFNet.PageSet.Filter.e_odd);
        case 166:
          pgSet = context$3$0.sent;
          stamper.stampImage(doc, img, pgSet);

          context$3$0.next = 170;
          return doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
        case 170:
          docBuffer = context$3$0.sent;
          saveBufferAsPDFDoc(docBuffer, 'newsletter_stamped_4_first20odd.pdf');
          context$3$0.next = 174;
          return PDFNet.endDeallocateStack();
        case 174:
          context$3$0.next = 180;
          break;
        case 176:
          context$3$0.prev = 176;
          context$3$0.t15 = context$3$0["catch"](145);
          console.log(context$3$0.t15.stack);
          ret = 1;
        case 180:
          context$3$0.prev = 180;
          context$3$0.next = 183;
          return PDFNet.startDeallocateStack();
        case 183:
          context$3$0.next = 185;
          return PDFNet.PDFDoc.createFromURL(input_url + 'newsletter.pdf');
        case 185:
          doc = context$3$0.sent;
          doc.initSecurityHandler();
          doc.lock();
          console.log('Sample 5 PDF document initialized and locked');

          context$3$0.next = 191;
          return PDFNet.Stamper.create(PDFNet.Stamper.SizeType.e_relative_scale, 0.05, 0.05);
        case 191:
          stamper = context$3$0.sent;
          stamper.setOpacity(0.7);
          stamper.setRotation(90);
          stamper.setPosition(0, 0);
          stamper.setSize(PDFNet.Stamper.SizeType.e_font_size, 80, -1);
          stamper.setTextAlignment(PDFNet.Stamper.TextAlignment.e_align_center);
          context$3$0.next = 199;
          return PDFNet.PageSet.createFilteredRange(1, 20, PDFNet.PageSet.Filter.e_even);
        case 199:
          pgSet = context$3$0.sent;
          stamper.stampText(doc, 'Goodbye\nMoon', pgSet);

          context$3$0.next = 203;
          return doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
        case 203:
          docBuffer = context$3$0.sent;
          saveBufferAsPDFDoc(docBuffer, 'newsletter_stamped_5_.first20even.pdf');

          context$3$0.next = 207;
          return PDFNet.endDeallocateStack();
        case 207:
          context$3$0.next = 213;
          break;
        case 209:
          context$3$0.prev = 209;
          context$3$0.t16 = context$3$0["catch"](180);
          console.log(context$3$0.t16.stack);
          ret = 1;
        case 213:
          context$3$0.prev = 213;
          context$3$0.next = 216;
          return PDFNet.startDeallocateStack();
        case 216:
          context$3$0.next = 218;
          return PDFNet.PDFDoc.createFromURL(input_url + 'newsletter.pdf');
        case 218:
          doc = context$3$0.sent;
          doc.initSecurityHandler();
          doc.lock();
          console.log('Sample 6 PDF document initialized and locked');

          context$3$0.next = 224;
          return PDFNet.Stamper.create(PDFNet.Stamper.SizeType.e_relative_scale, 0.1, 0.1);
        case 224:
          stamper = context$3$0.sent;
          stamper.setOpacity(0.8);
          stamper.setRotation(135);
          stamper.setAsBackground(false);
          stamper.showsOnPrint(false);
          stamper.setAlignment(PDFNet.Stamper.HorizontalAlignment.e_horizontal_right, PDFNet.Stamper.VerticalAlignment.e_vertical_top);
          stamper.setPosition(10, 10);

          context$3$0.next = 233;
          return PDFNet.Image.createFromURL(doc, input_url + 'peppers.jpg');
        case 233:
          img = context$3$0.sent;
          context$3$0.t17 = PDFNet.PageSet;
          context$3$0.next = 237;
          return doc.getPageCount();
        case 237:
          context$3$0.t18 = context$3$0.sent;
          context$3$0.t19 = PDFNet.PageSet.Filter.e_all;
          context$3$0.next = 241;
          return context$3$0.t17.createFilteredRange.call(context$3$0.t17, 1, context$3$0.t18, context$3$0.t19);
        case 241:
          pgSet = context$3$0.sent;
          stamper.stampImage(doc, img, pgSet);

          context$3$0.next = 245;
          return doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
        case 245:
          docBuffer = context$3$0.sent;
          saveBufferAsPDFDoc(docBuffer, 'newsletter_stamped_corner.pdf');

          context$3$0.next = 249;
          return PDFNet.endDeallocateStack();
        case 249:
          context$3$0.next = 255;
          break;
        case 251:
          context$3$0.prev = 251;
          context$3$0.t20 = context$3$0["catch"](213);
          console.log(context$3$0.t20.stack);
          ret = 1;
        case 255:
          context$3$0.prev = 255;
          context$3$0.next = 258;
          return PDFNet.startDeallocateStack();
        case 258:
          context$3$0.next = 260;
          return PDFNet.PDFDoc.createFromURL(input_url + 'newsletter.pdf');
        case 260:
          doc = context$3$0.sent;
          doc.initSecurityHandler();
          doc.lock();
          console.log('Sample 7 PDF document initialized and locked');

          context$3$0.next = 266;
          return PDFNet.Stamper.create(PDFNet.Stamper.SizeType.e_relative_scale, 0.07, -0.1);
        case 266:
          stamper = context$3$0.sent;
          stamper.setAlignment(PDFNet.Stamper.HorizontalAlignment.e_horizontal_right, PDFNet.Stamper.VerticalAlignment.e_vertical_bottom);
          stamper.setAlignment(PDFNet.Stamper.HorizontalAlignment.e_horizontal_center, PDFNet.Stamper.VerticalAlignment.e_vertical_top);
          context$3$0.next = 271;
          return PDFNet.Font.create(doc, PDFNet.Font.StandardType1Font.e_courier);
        case 271:
          font = context$3$0.sent;
          stamper.setFont(font);
          context$3$0.next = 275;
          return PDFNet.ColorPt.init(1, 0, 0, 0);
        case 275:
          redColorPt = context$3$0.sent;
          stamper.setFontColor(redColorPt);
          stamper.setTextAlignment(PDFNet.Stamper.TextAlignment.e_align_right);
          stamper.setAsBackground(true);

          context$3$0.next = 281;
          return PDFNet.PageSet.createRange(1, 2);
        case 281:
          pgSet = context$3$0.sent;
          stamper.stampText(doc, 'This is a title!', pgSet);

          context$3$0.next = 285;
          return PDFNet.Image.createFromURL(doc, input_url + 'peppers.jpg');
        case 285:
          img = context$3$0.sent;
          stamper.setAsBackground(false);

          context$3$0.next = 289;
          return PDFNet.PageSet.createRange(1, 1);
        case 289:
          pgSetImage = context$3$0.sent;
          stamper.stampImage(doc, img, pgSetImage);

          context$3$0.next = 293;
          return doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
        case 293:
          docBuffer = context$3$0.sent;
          saveBufferAsPDFDoc(docBuffer, 'newsletter_stamped_hidden.pdf');
          console.log('Done');

          context$3$0.next = 298;
          return PDFNet.endDeallocateStack();
        case 298:
          context$3$0.next = 304;
          break;
        case 300:
          context$3$0.prev = 300;
          context$3$0.t21 = context$3$0["catch"](255);
          console.log(context$3$0.t21.stack);
          ret = 1;
        case 304:
          return context$3$0.abrupt("return", ret);
        case 305:
        case "end":
          return context$3$0.stop();
        }
      }, marked2$0[0], this, [
        [3, 46],
        [50, 86],
        [90, 141],
        [145, 176],
        [180, 209],
        [213, 251],
        [255, 300]
      ]);
    }

    // replace with your own license key and remove the samples-key.js script tag
    PDFNet.runGeneratorWithCleanup(main(), window.sampleL);
  };
})(window);