

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

// eslint-disable-next-line spaced-comment
//# sourceURL=ElementBuilderTest.js
(function(exports) {
  'use strict';

  exports.runElementBuilderTest = function() {
    var marked2$0 = [main].map(regeneratorRuntime.mark);
    function main() {
      var ret, input_url, doc, eb, writer, element, gstate, pageRect, page, img, dash_pattern, reader, font, font2, para, para_end, text_run, text_run_end, para_width, cur_width, text, embed_file, mask_read, device_gray, mask, docBuffer;

      return regeneratorRuntime.wrap(function main$(context$3$0) {
        while (1) switch (context$3$0.prev = context$3$0.next) {
        case 0:
          ret = 0;
          input_url = '../TestFiles/';
          context$3$0.prev = 2;
          context$3$0.next = 5;
          return PDFNet.PDFDoc.create();
        case 5:
          doc = context$3$0.sent;
          context$3$0.next = 8;
          return PDFNet.ElementBuilder.create();
        case 8:
          eb = context$3$0.sent;
          context$3$0.next = 11;
          return PDFNet.ElementWriter.create();
        case 11:
          writer = context$3$0.sent;
          context$3$0.next = 14;
          return PDFNet.Rect.init(0, 0, 612, 794);
        case 14:
          pageRect = context$3$0.sent;
          context$3$0.next = 17;
          return doc.pageCreate(pageRect);
        case 17:
          page = context$3$0.sent;

          // begin writing to the page
          writer.beginOnPage(page);

          context$3$0.next = 21;
          return PDFNet.Image.createFromURL(doc, input_url + 'peppers.jpg');
        case 21:
          img = context$3$0.sent;
          context$3$0.t0 = eb;
          context$3$0.t1 = img;
          context$3$0.t2 = PDFNet.Matrix2D;
          context$3$0.next = 27;
          return img.getImageWidth();
        case 27:
          context$3$0.t3 = context$3$0.sent;
          context$3$0.t4 = context$3$0.t3 / 2;
          context$3$0.t5 = -145;
          context$3$0.next = 32;
          return img.getImageHeight();
        case 32:
          context$3$0.t6 = context$3$0.sent;
          context$3$0.t7 = context$3$0.t6 / 2;
          context$3$0.next = 36;

          return context$3$0.t2.create.call(
            context$3$0.t2,
            context$3$0.t4,
            context$3$0.t5,
            20,
            context$3$0.t7,
            200,
            150
          );
        case 36:
          context$3$0.t8 = context$3$0.sent;
          context$3$0.next = 39;
          return context$3$0.t0.createImageFromMatrix.call(context$3$0.t0, context$3$0.t1, context$3$0.t8);
        case 39:
          element = context$3$0.sent;
          writer.writePlacedElement(element);

          context$3$0.next = 43;
          return element.getGState();
        case 43:
          gstate = context$3$0.sent;
          gstate.setTransform(200, 0, 0, 300, 50, 450);
          writer.writePlacedElement(element);

          context$3$0.t9 = writer;
          context$3$0.next = 49;
          return eb.createImageScaled(img, 300, 600, 200, -150);
        case 49:
          context$3$0.t10 = context$3$0.sent;
          context$3$0.t9.writePlacedElement.call(context$3$0.t9, context$3$0.t10);

          // save changes to the current page
          writer.end();
          doc.pagePushBack(page);

          context$3$0.next = 55;
          return doc.pageCreate(pageRect);
        case 55:
          page = context$3$0.sent;

          // begin writing to this page
          writer.beginOnPage(page);
          // Reset the GState to default
          eb.reset();

          // start constructing the path
          eb.pathBegin();
          eb.moveTo(306, 396);
          eb.curveTo(681, 771, 399.75, 864.75, 306, 771);
          eb.curveTo(212.25, 864.75, -69, 771, 306, 396);
          eb.closePath();
          context$3$0.next = 65;
          return eb.pathEnd();
        case 65:
          element = context$3$0.sent;
          // the path should be filled
          element.setPathFill(true);

          context$3$0.next = 69;
          return element.getGState();
        case 69:
          gstate = context$3$0.sent;
          context$3$0.t11 = gstate;
          context$3$0.next = 73;
          return PDFNet.ColorSpace.createDeviceCMYK();
        case 73:
          context$3$0.t12 = context$3$0.sent;
          context$3$0.t11.setFillColorSpace.call(context$3$0.t11, context$3$0.t12);
          context$3$0.t13 = gstate;
          context$3$0.next = 78;
          return PDFNet.ColorPt.init(1, 0, 0, 0);
        case 78:
          context$3$0.t14 = context$3$0.sent;
          context$3$0.t13.setFillColorWithColorPt.call(context$3$0.t13, context$3$0.t14);
          gstate.setTransform(0.5, 0, 0, 0.5, -20, 300);
          writer.writePlacedElement(element);

          // Draw the same path using a different stroke color
          // this path is should be filled and stroked
          element.setPathStroke(true);
          context$3$0.t15 = gstate;
          context$3$0.next = 86;
          return PDFNet.ColorPt.init(0, 0, 1, 0);
        case 86:
          context$3$0.t16 = context$3$0.sent;
          context$3$0.t15.setFillColorWithColorPt.call(context$3$0.t15, context$3$0.t16);
          context$3$0.t17 = gstate;
          context$3$0.next = 91;
          return PDFNet.ColorSpace.createDeviceRGB();
        case 91:
          context$3$0.t18 = context$3$0.sent;
          context$3$0.t17.setStrokeColorSpace.call(context$3$0.t17, context$3$0.t18);
          context$3$0.t19 = gstate;
          context$3$0.next = 96;
          return PDFNet.ColorPt.init(1, 0, 0);
        case 96:
          context$3$0.t20 = context$3$0.sent;
          context$3$0.t19.setStrokeColorWithColorPt.call(context$3$0.t19, context$3$0.t20);
          gstate.setTransform(0.5, 0, 0, 0.5, 280, 300);
          gstate.setLineWidth(20);
          writer.writePlacedElement(element);

          // Draw the same path with with a given dash pattern
          // this path is should be only stroked
          element.setPathFill(false);
          context$3$0.t21 = gstate;
          context$3$0.next = 105;
          return PDFNet.ColorPt.init(0, 0, 1);
        case 105:
          context$3$0.t22 = context$3$0.sent;
          context$3$0.t21.setStrokeColorWithColorPt.call(context$3$0.t21, context$3$0.t22);
          gstate.setTransform(0.5, 0, 0, 0.5, 280, 0);
          dash_pattern = [];
          dash_pattern.push(30);
          gstate.setDashPattern(dash_pattern, 0);
          writer.writePlacedElement(element);

          context$3$0.t23 = writer;
          context$3$0.next = 115;
          return eb.createGroupBegin();
        case 115:
          context$3$0.t24 = context$3$0.sent;
          context$3$0.t23.writeElement.call(context$3$0.t23, context$3$0.t24);
          // Start constructing the new path (the old path was lost when we created
          // a new Element using CreateGroupBegin()).
          eb.pathBegin();
          eb.moveTo(306, 396);
          eb.curveTo(681, 771, 399.75, 864.75, 306, 771);
          eb.curveTo(212.25, 864.75, -69, 771, 306, 396);
          eb.closePath();
          context$3$0.next = 124;
          return eb.pathEnd();
        case 124:
          element = context$3$0.sent;
          // this path is a clipping path
          element.setPathClip(true);
          // this path should be filled and stroked
          element.setPathStroke(true);
          context$3$0.next = 129;
          return element.getGState();
        case 129:
          gstate = context$3$0.sent;
          gstate.setTransform(0.5, 0, 0, 0.5, -20, 0);

          writer.writeElement(element);

          context$3$0.t25 = writer;
          context$3$0.next = 135;
          return eb.createImageScaled(img, 100, 300, 400, 600);
        case 135:
          context$3$0.t26 = context$3$0.sent;
          context$3$0.t25.writeElement.call(context$3$0.t25, context$3$0.t26);
          context$3$0.t27 = writer;
          context$3$0.next = 140;
          return eb.createGroupEnd();
        case 140:
          context$3$0.t28 = context$3$0.sent;
          context$3$0.t27.writeElement.call(context$3$0.t27, context$3$0.t28);

          // save changes to the current page
          writer.end();
          doc.pagePushBack(page);


          context$3$0.next = 146;
          return doc.pageCreate(pageRect);
        case 146:
          page = context$3$0.sent;

          // begin writing to this page
          writer.beginOnPage(page);
          // Reset the GState to default
          eb.reset();

          context$3$0.t29 = eb;
          context$3$0.next = 152;
          return PDFNet.Font.create(doc, PDFNet.Font.StandardType1Font.e_times_roman);
        case 152:
          context$3$0.t30 = context$3$0.sent;
          context$3$0.next = 155;
          return context$3$0.t29.createTextBeginWithFont.call(context$3$0.t29, context$3$0.t30, 12);
        case 155:
          element = context$3$0.sent;
          writer.writeElement(element);

          context$3$0.next = 159;
          return eb.createNewTextRun('Hello World!');
        case 159:
          element = context$3$0.sent;
          element.setTextMatrixEntries(10, 0, 0, 10, 0, 600);
          context$3$0.next = 163;
          return element.getGState();
        case 163:
          gstate = context$3$0.sent;
          // Set the spacing between lines
          gstate.setLeading(15);
          writer.writeElement(element);

          context$3$0.t31 = writer;
          context$3$0.next = 169;
          return eb.createTextNewLine();
        case 169:
          context$3$0.t32 = context$3$0.sent;
          context$3$0.t31.writeElement.call(context$3$0.t31, context$3$0.t32);
          context$3$0.next = 173;
          return eb.createNewTextRun('Hello World!');
        case 173:
          element = context$3$0.sent;
          context$3$0.next = 176;
          return element.getGState();
        case 176:
          gstate = context$3$0.sent;
          gstate.setTextRenderMode(PDFNet.GState.TextRenderingMode.e_stroke_text);
          gstate.setCharSpacing(-1.25);
          gstate.setWordSpacing(-1.25);
          writer.writeElement(element);

          context$3$0.t33 = writer;
          context$3$0.next = 184;
          return eb.createTextNewLine();
        case 184:
          context$3$0.t34 = context$3$0.sent;
          context$3$0.t33.writeElement.call(context$3$0.t33, context$3$0.t34);
          context$3$0.next = 188;
          return eb.createNewTextRun('Hello World!');
        case 188:
          element = context$3$0.sent;
          context$3$0.next = 191;
          return element.getGState();
        case 191:
          gstate = context$3$0.sent;
          gstate.setCharSpacing(0);
          gstate.setWordSpacing(0);
          gstate.setLineWidth(3);
          gstate.setTextRenderMode(PDFNet.GState.TextRenderingMode.e_fill_stroke_text);
          context$3$0.t35 = gstate;
          context$3$0.next = 199;
          return PDFNet.ColorSpace.createDeviceRGB();
        case 199:
          context$3$0.t36 = context$3$0.sent;
          context$3$0.t35.setStrokeColorSpace.call(context$3$0.t35, context$3$0.t36);
          context$3$0.t37 = gstate;
          context$3$0.next = 204;
          return PDFNet.ColorPt.init(1, 0, 0);
        case 204:
          context$3$0.t38 = context$3$0.sent;
          context$3$0.t37.setStrokeColorWithColorPt.call(context$3$0.t37, context$3$0.t38);
          context$3$0.t39 = gstate;
          context$3$0.next = 209;
          return PDFNet.ColorSpace.createDeviceCMYK();
        case 209:
          context$3$0.t40 = context$3$0.sent;
          context$3$0.t39.setFillColorSpace.call(context$3$0.t39, context$3$0.t40);
          context$3$0.t41 = gstate;
          context$3$0.next = 214;
          return PDFNet.ColorPt.init(1, 0, 0, 0);
        case 214:
          context$3$0.t42 = context$3$0.sent;
          context$3$0.t41.setFillColorWithColorPt.call(context$3$0.t41, context$3$0.t42);
          writer.writeElement(element);


          context$3$0.t43 = writer;
          context$3$0.next = 220;
          return eb.createTextNewLine();
        case 220:
          context$3$0.t44 = context$3$0.sent;
          context$3$0.t43.writeElement.call(context$3$0.t43, context$3$0.t44);
          context$3$0.next = 224;
          return eb.createNewTextRun('Hello World!');
        case 224:
          element = context$3$0.sent;
          context$3$0.next = 227;
          return element.getGState();
        case 227:
          gstate = context$3$0.sent;
          gstate.setTextRenderMode(PDFNet.GState.TextRenderingMode.e_clip_text);
          writer.writeElement(element);

          context$3$0.t45 = writer;
          context$3$0.next = 233;
          return eb.createTextEnd();
        case 233:
          context$3$0.t46 = context$3$0.sent;
          context$3$0.t45.writeElement.call(context$3$0.t45, context$3$0.t46);
          context$3$0.t47 = writer;
          context$3$0.next = 238;
          return eb.createImageScaled(img, 10, 100, 1300, 720);
        case 238:
          context$3$0.t48 = context$3$0.sent;
          context$3$0.t47.writeElement.call(context$3$0.t47, context$3$0.t48);

          // save changes to the current page
          writer.end();
          doc.pagePushBack(page);

          context$3$0.next = 244;
          return PDFNet.ElementReader.create();
        case 244:
          reader = context$3$0.sent;
          context$3$0.t49 = reader;
          context$3$0.t50 = doc;
          context$3$0.next = 249;
          return doc.getPageCount();
        case 249:
          context$3$0.t51 = context$3$0.sent;
          context$3$0.next = 252;
          return context$3$0.t50.getPage.call(context$3$0.t50, context$3$0.t51);
        case 252:
          context$3$0.t52 = context$3$0.sent;
          context$3$0.t49.beginOnPage.call(context$3$0.t49, context$3$0.t52);
          context$3$0.t53 = doc;
          context$3$0.next = 257;
          return PDFNet.Rect.init(0, 0, 1300, 794);
        case 257:
          context$3$0.t54 = context$3$0.sent;
          context$3$0.next = 260;
          return context$3$0.t53.pageCreate.call(context$3$0.t53, context$3$0.t54);
        case 260:
          page = context$3$0.sent;

          // begin writing to this page
          writer.beginOnPage(page);
          // Reset the GState to default
          eb.reset();

          context$3$0.next = 265;
          return PDFNet.Font.create(doc, PDFNet.Font.StandardType1Font.e_helvetica);
        case 265:
          font = context$3$0.sent;
        case 266:
          context$3$0.next = 268;
          return reader.next();
        case 268:
          if (!(element = context$3$0.sent)) {
            context$3$0.next = 281;
            break;
          }

          context$3$0.next = 271;
          return element.getType();
        case 271:
          context$3$0.t55 = context$3$0.sent;
          context$3$0.t56 = PDFNet.Element.Type.e_text;

          if (!(context$3$0.t55 === context$3$0.t56)) {
            context$3$0.next = 278;
            break;
          }

          context$3$0.next = 276;
          return element.getGState();
        case 276:
          context$3$0.t57 = font;
          context$3$0.sent.setFont(context$3$0.t57, 14);
        case 278:
          writer.writeElement(element);
          context$3$0.next = 266;
          break;
        case 281:
          reader.end();
          // save changes to the current page
          writer.end();

          doc.pagePushBack(page);


          context$3$0.t58 = reader;
          context$3$0.t59 = doc;
          context$3$0.next = 288;
          return doc.getPageCount();
        case 288:
          context$3$0.t60 = context$3$0.sent;
          context$3$0.next = 291;
          return context$3$0.t59.getPage.call(context$3$0.t59, context$3$0.t60);
        case 291:
          context$3$0.t61 = context$3$0.sent;
          context$3$0.t58.beginOnPage.call(context$3$0.t58, context$3$0.t61);
          context$3$0.t62 = doc;
          context$3$0.next = 296;
          return PDFNet.Rect.init(0, 0, 1300, 794);
        case 296:
          context$3$0.t63 = context$3$0.sent;
          context$3$0.next = 299;
          return context$3$0.t62.pageCreate.call(context$3$0.t62, context$3$0.t63);
        case 299:
          page = context$3$0.sent;

          // begin writing to this page
          writer.beginOnPage(page);
          // Reset the GState to default
          eb.reset();

          context$3$0.next = 304;
          return PDFNet.Font.create(doc, PDFNet.Font.StandardType1Font.e_courier_bold);
        case 304:
          font2 = context$3$0.sent;
        case 305:
          context$3$0.next = 307;
          return reader.next();
        case 307:
          if (!(element = context$3$0.sent)) {
            context$3$0.next = 320;
            break;
          }

          context$3$0.next = 310;
          return element.getType();
        case 310:
          context$3$0.t64 = context$3$0.sent;
          context$3$0.t65 = PDFNet.Element.Type.e_text;

          if (!(context$3$0.t64 === context$3$0.t65)) {
            context$3$0.next = 317;
            break;
          }

          context$3$0.next = 315;
          return element.getGState();
        case 315:
          context$3$0.t66 = font2;
          context$3$0.sent.setFont(context$3$0.t66, 16);
        case 317:
          writer.writeElement(element);
          context$3$0.next = 305;
          break;
        case 320:
          reader.end();
          // save changes to the current page
          writer.end();
          doc.pagePushBack(page);


          context$3$0.next = 325;
          return doc.pageCreate();
        case 325:
          page = context$3$0.sent;
          // begin writing to this page
          writer.beginOnPage(page);
          // Reset the GState to default
          eb.reset();

          context$3$0.t67 = eb;
          context$3$0.next = 331;
          return PDFNet.Font.create(doc, PDFNet.Font.StandardType1Font.e_times_roman);
        case 331:
          context$3$0.t68 = context$3$0.sent;
          context$3$0.next = 334;
          return context$3$0.t67.createTextBeginWithFont.call(context$3$0.t67, context$3$0.t68, 12);
        case 334:
          element = context$3$0.sent;
          element.setTextMatrixEntries(1.5, 0, 0, 1.5, 50, 600);
          context$3$0.next = 338;
          return element.getGState();
        case 338:
          context$3$0.sent.setLeading(15);
          writer.writeElement(element);


          para = 'A PDF text object consists of operators that can show ' +
                          'text strings, move the text position, and set text state and certain ' +
                          'other parameters. In addition, there are three parameters that are ' +
                          'defined only within a text object and do not persist from one text ' +
                          'object to the next: Tm, the text matrix, Tlm, the text line matrix, ' +
                          'Trm, the text rendering matrix, actually just an intermediate result ' +
                          'that combines the effects of text state parameters, the text matrix ' +
                          '(Tm), and the current transformation matrix';

          para_end = para.Length;
          text_run = 0;
          para_width = 300;
          cur_width = 0;
        case 345:
          if (!(text_run < para_end)) {
            context$3$0.next = 381;
            break;
          }

          text_run_end = para.indexOf(' ', text_run);
          if (text_run_end < 0) {
            text_run_end = para_end - 1;
          }

          text = para.substring(text_run, text_run_end - text_run + 1);
          context$3$0.next = 351;
          return eb.createNewTextRun(text);
        case 351:
          element = context$3$0.sent;
          context$3$0.t69 = cur_width;
          context$3$0.next = 355;
          return element.getTextLength();
        case 355:
          context$3$0.t70 = context$3$0.sent;
          context$3$0.t71 = context$3$0.t69 + context$3$0.t70;
          context$3$0.t72 = para_width;

          if (!(context$3$0.t71 < context$3$0.t72)) {
            context$3$0.next = 365;
            break;
          }

          writer.writeElement(element);
          context$3$0.next = 362;
          return element.getTextLength();
        case 362:
          cur_width += context$3$0.sent;
          context$3$0.next = 378;
          break;
        case 365:
          context$3$0.t73 = writer;
          context$3$0.next = 368;
          return eb.createTextNewLine();
        case 368:
          context$3$0.t74 = context$3$0.sent;
          context$3$0.t73.writeElement.call(context$3$0.t73, context$3$0.t74);
          text = para.substr(text_run, text_run_end - text_run + 1);
          context$3$0.next = 373;
          return eb.createNewTextRun(text);
        case 373:
          element = context$3$0.sent;
          context$3$0.next = 376;
          return element.getTextLength();
        case 376:
          cur_width = context$3$0.sent;
          writer.writeElement(element);
        case 378:
          text_run = text_run_end + 1;
          context$3$0.next = 345;
          break;
        case 381:
          context$3$0.next = 383;
          return eb.createTextNewLine();
        case 383:
          element = context$3$0.sent;
          // Skip 2 lines
          writer.writeElement(element);
          writer.writeElement(element);

          context$3$0.t75 = writer;
          context$3$0.next = 389;
          return eb.createNewTextRun('An example of space adjustments between inter-characters:');
        case 389:
          context$3$0.t76 = context$3$0.sent;
          context$3$0.t75.writeElement.call(context$3$0.t75, context$3$0.t76);
          context$3$0.t77 = writer;
          context$3$0.next = 394;
          return eb.createTextNewLine();
        case 394:
          context$3$0.t78 = context$3$0.sent;
          context$3$0.t77.writeElement.call(context$3$0.t77, context$3$0.t78);
          context$3$0.next = 398;
          return eb.createNewTextRun('AWAY');
        case 398:
          element = context$3$0.sent;
          writer.writeElement(element);

          context$3$0.t79 = writer;
          context$3$0.next = 403;
          return eb.createTextNewLine();
        case 403:
          context$3$0.t80 = context$3$0.sent;
          context$3$0.t79.writeElement.call(context$3$0.t79, context$3$0.t80);
          context$3$0.next = 407;
          return eb.createNewTextRun('A');
        case 407:
          element = context$3$0.sent;
          writer.writeElement(element);

          context$3$0.next = 411;
          return eb.createNewTextRun('W');
        case 411:
          element = context$3$0.sent;
          element.setPosAdjustment(140);
          writer.writeElement(element);

          context$3$0.next = 416;
          return eb.createNewTextRun('A');
        case 416:
          element = context$3$0.sent;
          element.setPosAdjustment(140);
          writer.writeElement(element);

          context$3$0.next = 421;
          return eb.createNewTextRun('Y again');
        case 421:
          element = context$3$0.sent;
          element.setPosAdjustment(115);
          writer.writeElement(element);

          // Draw the same strings using direct content output...
          // flush pending Element writing operations.
          writer.flush();

          // You can also write page content directly to the content stream using
          // ElementWriter.WriteString(...) and ElementWriter.WriteBuffer(...) methods.
          // Note that if you are planning to use these functions you need to be familiar
          // with PDF page content operators (see Appendix A in PDF Reference Manual).
          // Because it is easy to make mistakes during direct output we recommend that
          // you use ElementBuilder and Element interface instead.

          // Skip 2 lines
          writer.writeString('T* T* ');
          writer.writeString('(Direct output to PDF page content stream:) Tj  T* ');
          writer.writeString('(AWAY) Tj T* ');
          writer.writeString('[(A)140(W)140(A)115(Y again)] TJ ');

          context$3$0.t81 = writer;
          context$3$0.next = 432;
          return eb.createTextEnd();
        case 432:
          context$3$0.t82 = context$3$0.sent;
          context$3$0.t81.writeElement.call(context$3$0.t81, context$3$0.t82);

          // save changes to the current page
          writer.end();
          doc.pagePushBack(page);

          context$3$0.next = 438;
          return doc.pageCreate();
        case 438:
          page = context$3$0.sent;
          // begin writing to the page
          writer.beginOnPage(page);


          context$3$0.next = 442;
          return PDFNet.Filter.createURLFilter(input_url + 'imagemask.dat');
        case 442:
          embed_file = context$3$0.sent;
          context$3$0.next = 445;
          return PDFNet.FilterReader.create(embed_file);
        case 445:
          mask_read = context$3$0.sent;
          context$3$0.next = 448;
          return PDFNet.ColorSpace.createDeviceGray();
        case 448:
          device_gray = context$3$0.sent;
          context$3$0.next = 451;
          return PDFNet.Image.createDirectFromStream(doc, mask_read, 64, 64, 1, device_gray, PDFNet.Image.InputFilter.e_ascii_hex);
        case 451:
          mask = context$3$0.sent;
          context$3$0.next = 454;
          return mask.getSDFObj();
        case 454:
          context$3$0.sent.putBool('ImageMask', true);
          context$3$0.next = 457;
          return eb.createRect(0, 0, 612, 794);
        case 457:
          element = context$3$0.sent;
          element.setPathStroke(false);
          element.setPathFill(true);
          context$3$0.next = 462;
          return element.getGState();
        case 462:
          gstate = context$3$0.sent;

          gstate.setFillColorSpace(device_gray);
          context$3$0.t83 = gstate;
          context$3$0.next = 467;
          return PDFNet.ColorPt.init(0.8);
        case 467:
          context$3$0.t84 = context$3$0.sent;
          context$3$0.t83.setFillColorWithColorPt.call(context$3$0.t83, context$3$0.t84);
          writer.writePlacedElement(element);

          context$3$0.t85 = eb;
          context$3$0.t86 = mask;
          context$3$0.next = 474;
          return PDFNet.Matrix2D.create(200, 0, 0, -200, 40, 680);
        case 474:
          context$3$0.t87 = context$3$0.sent;
          context$3$0.next = 477;
          return context$3$0.t85.createImageFromMatrix.call(context$3$0.t85, context$3$0.t86, context$3$0.t87);
        case 477:
          element = context$3$0.sent;
          context$3$0.next = 480;
          return element.getGState();
        case 480:
          context$3$0.t88 = context$3$0.sent;
          context$3$0.next = 483;
          return PDFNet.ColorPt.init(0.1);
        case 483:
          context$3$0.t89 = context$3$0.sent;
          context$3$0.t88.setFillColorWithColorPt.call(context$3$0.t88, context$3$0.t89);
          writer.writePlacedElement(element);

          context$3$0.next = 488;
          return element.getGState();
        case 488:
          gstate = context$3$0.sent;
          context$3$0.t90 = gstate;
          context$3$0.next = 492;
          return PDFNet.ColorSpace.createDeviceRGB();
        case 492:
          context$3$0.t91 = context$3$0.sent;
          context$3$0.t90.setFillColorSpace.call(context$3$0.t90, context$3$0.t91);
          context$3$0.t92 = gstate;
          context$3$0.next = 497;
          return PDFNet.ColorPt.init(1, 0, 0);
        case 497:
          context$3$0.t93 = context$3$0.sent;
          context$3$0.t92.setFillColorWithColorPt.call(context$3$0.t92, context$3$0.t93);
          context$3$0.t94 = eb;
          context$3$0.t95 = mask;
          context$3$0.next = 503;
          return PDFNet.Matrix2D.create(200, 0, 0, -200, 320, 680);
        case 503:
          context$3$0.t96 = context$3$0.sent;
          context$3$0.next = 506;
          return context$3$0.t94.createImageFromMatrix.call(context$3$0.t94, context$3$0.t95, context$3$0.t96);
        case 506:
          element = context$3$0.sent;
          writer.writePlacedElement(element);

          context$3$0.next = 510;
          return element.getGState();
        case 510:
          context$3$0.t97 = context$3$0.sent;
          context$3$0.next = 513;
          return PDFNet.ColorPt.init(0, 1, 0);
        case 513:
          context$3$0.t98 = context$3$0.sent;
          context$3$0.t97.setFillColorWithColorPt.call(context$3$0.t97, context$3$0.t98);
          context$3$0.t99 = eb;
          context$3$0.t100 = mask;
          context$3$0.next = 519;
          return PDFNet.Matrix2D.create(200, 0, 0, -200, 40, 380);
        case 519:
          context$3$0.t101 = context$3$0.sent;
          context$3$0.next = 522;
          return context$3$0.t99.createImageFromMatrix.call(context$3$0.t99, context$3$0.t100, context$3$0.t101);
        case 522:
          element = context$3$0.sent;
          writer.writePlacedElement(element);

          context$3$0.next = 526;
          return PDFNet.Image.createFromURL(doc, (input_url + 'peppers.jpg'));
        case 526:
          img = context$3$0.sent;

          // mask is the explicit mask for the primary (base) image
          img.setMask(mask);

          context$3$0.t102 = eb;
          context$3$0.t103 = img;
          context$3$0.next = 532;
          return PDFNet.Matrix2D.create(200, 0, 0, -200, 320, 380);
        case 532:
          context$3$0.t104 = context$3$0.sent;
          context$3$0.next = 535;
          return context$3$0.t102.createImageFromMatrix.call(context$3$0.t102, context$3$0.t103, context$3$0.t104);
        case 535:
          element = context$3$0.sent;
          writer.writePlacedElement(element);

          // save changes to the current page
          writer.end();
          doc.pagePushBack(page);

          context$3$0.next = 541;
          return doc.pageCreate();
        case 541:
          page = context$3$0.sent;
          // begin writing to this page
          writer.beginOnPage(page);
          // Reset the GState to default
          eb.reset();

          context$3$0.t105 = eb;
          context$3$0.next = 547;
          return PDFNet.Font.create(doc, PDFNet.Font.StandardType1Font.e_times_roman);
        case 547:
          context$3$0.t106 = context$3$0.sent;
          context$3$0.next = 550;
          return context$3$0.t105.createTextBeginWithFont.call(context$3$0.t105, context$3$0.t106, 100);
        case 550:
          element = context$3$0.sent;
          context$3$0.next = 553;
          return element.getGState();
        case 553:
          gstate = context$3$0.sent;
          gstate.setTextKnockout(false);
          gstate.setBlendMode(PDFNet.GState.BlendMode.e_bl_difference);
          writer.writeElement(element);

          context$3$0.next = 559;
          return eb.createNewTextRun('Transparency');
        case 559:
          element = context$3$0.sent;
          element.setTextMatrixEntries(1, 0, 0, 1, 30, 30);
          context$3$0.next = 563;
          return element.getGState();
        case 563:
          gstate = context$3$0.sent;
          context$3$0.t107 = gstate;
          context$3$0.next = 567;
          return PDFNet.ColorSpace.createDeviceCMYK();
        case 567:
          context$3$0.t108 = context$3$0.sent;
          context$3$0.t107.setFillColorSpace.call(context$3$0.t107, context$3$0.t108);
          context$3$0.t109 = gstate;
          context$3$0.next = 572;
          return PDFNet.ColorPt.init(1, 0, 0, 0);
        case 572:
          context$3$0.t110 = context$3$0.sent;
          context$3$0.t109.setFillColorWithColorPt.call(context$3$0.t109, context$3$0.t110);

          gstate.setFillOpacity(0.5);
          writer.writeElement(element);

          // Write the same text on top the old; shifted by 3 points
          element.setTextMatrixEntries(1, 0, 0, 1, 33, 33);
          context$3$0.t111 = gstate;
          context$3$0.next = 580;
          return PDFNet.ColorPt.init(0, 1, 0, 0);
        case 580:
          context$3$0.t112 = context$3$0.sent;
          context$3$0.t111.setFillColorWithColorPt.call(context$3$0.t111, context$3$0.t112);
          gstate.setFillOpacity(0.5);

          writer.writeElement(element);
          context$3$0.t113 = writer;
          context$3$0.next = 587;
          return eb.createTextEnd();
        case 587:
          context$3$0.t114 = context$3$0.sent;
          context$3$0.t113.writeElement.call(context$3$0.t113, context$3$0.t114);

          // Draw three overlapping transparent circles.
          // start constructing the path
          eb.pathBegin();
          eb.moveTo(459.223, 505.646);
          eb.curveTo(459.223, 415.841, 389.85, 343.04, 304.273, 343.04);
          eb.curveTo(218.697, 343.04, 149.324, 415.841, 149.324, 505.646);
          eb.curveTo(149.324, 595.45, 218.697, 668.25, 304.273, 668.25);
          eb.curveTo(389.85, 668.25, 459.223, 595.45, 459.223, 505.646);
          context$3$0.next = 597;
          return eb.pathEnd();
        case 597:
          element = context$3$0.sent;
          element.setPathFill(true);

          context$3$0.next = 601;
          return element.getGState();
        case 601:
          gstate = context$3$0.sent;
          context$3$0.t115 = gstate;
          context$3$0.next = 605;
          return PDFNet.ColorSpace.createDeviceRGB();
        case 605:
          context$3$0.t116 = context$3$0.sent;
          context$3$0.t115.setFillColorSpace.call(context$3$0.t115, context$3$0.t116);
          context$3$0.t117 = gstate;
          context$3$0.next = 610;
          return PDFNet.ColorPt.init(0, 0, 1);
        case 610:
          context$3$0.t118 = context$3$0.sent;
          context$3$0.t117.setFillColorWithColorPt.call(context$3$0.t117, context$3$0.t118);

          gstate.setBlendMode(PDFNet.GState.BlendMode.e_bl_normal);
          gstate.setFillOpacity(0.5);
          writer.writeElement(element);

          // Translate relative to the Blue Circle
          gstate.setTransform(1, 0, 0, 1, 113, -185);
          context$3$0.t119 = gstate;
          context$3$0.next = 619;
          return PDFNet.ColorPt.init(0, 1, 0);
        case 619:
          context$3$0.t120 = context$3$0.sent;
          context$3$0.t119.setFillColorWithColorPt.call(context$3$0.t119, context$3$0.t120);
          gstate.setFillOpacity(0.5);
          writer.writeElement(element);

          // Translate relative to the Green Circle
          gstate.setTransform(1, 0, 0, 1, -220, 0);
          context$3$0.t121 = gstate;
          context$3$0.next = 627;
          return PDFNet.ColorPt.init(1, 0, 0);
        case 627:
          context$3$0.t122 = context$3$0.sent;
          context$3$0.t121.setFillColorWithColorPt.call(context$3$0.t121, context$3$0.t122);
          gstate.setFillOpacity(0.5);
          writer.writeElement(element);

          // save changes to the current page
          writer.end();
          doc.pagePushBack(page);

          context$3$0.next = 635;
          return doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_remove_unused);
        case 635:
          docBuffer = context$3$0.sent;
          saveBufferAsPDFDoc(docBuffer, 'element_builder.pdf');

          console.log('Done. Result saved in element_builder.pdf...');
          context$3$0.next = 644;
          break;
        case 640:
          context$3$0.prev = 640;
          context$3$0.t123 = context$3$0["catch"](2);
          console.log(context$3$0.t123);
          ret = 1;
        case 644:
          return context$3$0.abrupt("return", ret);
        case 645:
        case "end":
          return context$3$0.stop();
        }
      }, marked2$0[0], this, [[2, 640]]);
    }


    // replace with your own license key and remove the samples-key.js script tag
    PDFNet.runGeneratorWithCleanup(main(), window.sampleL);
  };
})(window);