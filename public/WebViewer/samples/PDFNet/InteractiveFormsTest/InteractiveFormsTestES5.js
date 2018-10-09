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
// Copyright (c) 2001-2015 by PDFTron Systems Inc. All Rights Reserved.
// Consult legal.txt regarding legal and license information.
//---------------------------------------------------------------------------------------
// eslint-disable-next-line spaced-comment
//# sourceURL=InteractiveFormsTest.js
(function(exports) {
  'use strict';

  exports.runInteractiveFormsTest = function() {
    var marked2$0 = [RenameAllFields, CreateCheckmarkAppearance, CreateButtonAppearance, main].map(regeneratorRuntime.mark);
    PDFNet.CheckStyle = {
      e_check: 0,
      e_circle: 1,
      e_cross: 2,
      e_diamond: 3,
      e_square: 4,
      e_star: 5
    };

    function RenameAllFields(doc, name) {
      var itr, counter, f;

      return regeneratorRuntime.wrap(function RenameAllFields$(context$3$0) {
        while (1) switch (context$3$0.prev = context$3$0.next) {
        case 0:
          context$3$0.next = 2;
          return doc.getFieldIterator(name);
        case 2:
          itr = context$3$0.sent;
          counter = 0;
        case 4:
          context$3$0.next = 6;
          return itr.hasNext();
        case 6:
          if (!context$3$0.sent) {
            context$3$0.next = 17;
            break;
          }

          context$3$0.next = 9;
          return itr.current();
        case 9:
          f = context$3$0.sent;
          f.rename(name + counter);
        case 11:
          context$3$0.next = 13;
          return doc.getFieldIterator(name);
        case 13:
          itr = context$3$0.sent;
          ++counter;
          context$3$0.next = 4;
          break;
        case 17:
        case "end":
          return context$3$0.stop();
        }
      }, marked2$0[0], this);
    }

    // Note: The visual appearance of check-marks and radio-buttons in PDF documents is
    // not limited to CheckStyle-s. It is possible to create a visual appearance using
    // arbitrary glyph, text, raster image, or path object. Although most PDF producers
    // limit the options to the above 'standard' styles, using PDFNetJS you can generate
    // arbitrary appearances.
    function CreateCheckmarkAppearance(doc, style) {
      var builder, writer, symbol, zapfDingbatsFont, checkmark, stm;

      return regeneratorRuntime.wrap(function CreateCheckmarkAppearance$(context$3$0) {
        while (1) switch (context$3$0.prev = context$3$0.next) {
        case 0:
          context$3$0.next = 2;
          return PDFNet.ElementBuilder.create();
        case 2:
          builder = context$3$0.sent;
          context$3$0.next = 5;
          return PDFNet.ElementWriter.create();
        case 5:
          writer = context$3$0.sent;
          writer.begin(doc);
          context$3$0.t0 = writer;
          context$3$0.next = 10;
          return builder.createTextBegin();
        case 10:
          context$3$0.t1 = context$3$0.sent;
          context$3$0.t0.writeElement.call(context$3$0.t0, context$3$0.t1);
          context$3$0.t2 = style;
          context$3$0.next = (context$3$0.t2 === PDFNet.CheckStyle.e_circle ? 15 : (context$3$0.t2 === PDFNet.CheckStyle.e_diamond ? 17 : (context$3$0.t2 === PDFNet.CheckStyle.e_cross ? 19 : (context$3$0.t2 === PDFNet.CheckStyle.e_square ? 21 : (context$3$0.t2 === PDFNet.CheckStyle.e_star ? 23 : 25)))));
          break;
        case 15:
          symbol = '\x6C';
          return context$3$0.abrupt("break", 26);
        case 17:
          symbol = '\x75';
          return context$3$0.abrupt("break", 26);
        case 19:
          symbol = '\x35';
          return context$3$0.abrupt("break", 26);
        case 21:
          symbol = '\x6E';
          return context$3$0.abrupt("break", 26);
        case 23:
          symbol = '\x48';
          return context$3$0.abrupt("break", 26);
        case 25:
          // e_check
          symbol = '\x34';
        case 26:
          context$3$0.next = 28;
          return PDFNet.Font.create(doc, PDFNet.Font.StandardType1Font.e_zapf_dingbats);
        case 28:
          zapfDingbatsFont = context$3$0.sent;
          context$3$0.next = 31;
          return builder.createTextRunWithSize(symbol, 1, zapfDingbatsFont, 1);
        case 31:
          checkmark = context$3$0.sent;
          writer.writeElement(checkmark);
          context$3$0.t3 = writer;
          context$3$0.next = 36;
          return builder.createTextEnd();
        case 36:
          context$3$0.t4 = context$3$0.sent;
          context$3$0.t3.writeElement.call(context$3$0.t3, context$3$0.t4);
          context$3$0.next = 40;
          return writer.end();
        case 40:
          stm = context$3$0.sent;
          context$3$0.next = 43;
          return stm.putRect('BBox', -0.2, -0.2, 1, 1);
        case 43:
          context$3$0.next = 45;
          return stm.putName('Subtype', 'Form');
        case 45:
          return context$3$0.abrupt("return", stm);
        case 46:
        case "end":
          return context$3$0.stop();
        }
      }, marked2$0[1], this);
    }

    function CreateButtonAppearance(doc, button_down) {
      var builder, writer, element, elementGState, text, HelveticaBoldFont, stm;

      return regeneratorRuntime.wrap(function CreateButtonAppearance$(context$3$0) {
        while (1) switch (context$3$0.prev = context$3$0.next) {
        case 0:
          context$3$0.next = 2;
          return PDFNet.ElementBuilder.create();
        case 2:
          builder = context$3$0.sent;
          context$3$0.next = 5;
          return PDFNet.ElementWriter.create();
        case 5:
          writer = context$3$0.sent;
          writer.begin(doc);

          context$3$0.next = 9;
          return builder.createRect(0, 0, 101, 37);
        case 9:
          element = context$3$0.sent;
          element.setPathFill(true);
          element.setPathStroke(false);

          context$3$0.next = 14;
          return element.getGState();
        case 14:
          elementGState = context$3$0.sent;
          context$3$0.t0 = elementGState;
          context$3$0.next = 18;
          return PDFNet.ColorSpace.createDeviceGray();
        case 18:
          context$3$0.t1 = context$3$0.sent;
          context$3$0.t0.setFillColorSpace.call(context$3$0.t0, context$3$0.t1);
          context$3$0.t2 = elementGState;
          context$3$0.next = 23;
          return PDFNet.ColorPt.init(0.75);
        case 23:
          context$3$0.t3 = context$3$0.sent;
          context$3$0.t2.setFillColorWithColorPt.call(context$3$0.t2, context$3$0.t3);
          writer.writeElement(element);

          context$3$0.t4 = writer;
          context$3$0.next = 29;
          return builder.createTextBegin();
        case 29:
          context$3$0.t5 = context$3$0.sent;
          context$3$0.t4.writeElement.call(context$3$0.t4, context$3$0.t5);
          text = 'Submit';
          context$3$0.next = 34;
          return PDFNet.Font.create(doc, PDFNet.Font.StandardType1Font.e_helvetica_bold);
        case 34:
          HelveticaBoldFont = context$3$0.sent;
          context$3$0.next = 37;
          return builder.createTextRunWithSize(text, text.length, HelveticaBoldFont, 12);
        case 37:
          element = context$3$0.sent;
          context$3$0.next = 40;
          return element.getGState();
        case 40:
          elementGState = context$3$0.sent;
          context$3$0.t6 = elementGState;
          context$3$0.next = 44;
          return PDFNet.ColorPt.init(0);
        case 44:
          context$3$0.t7 = context$3$0.sent;
          context$3$0.t6.setFillColorWithColorPt.call(context$3$0.t6, context$3$0.t7);

          if (button_down) {
            element.setTextMatrixEntries(1, 0, 0, 1, 33, 10);
          } else {
            element.setTextMatrixEntries(1, 0, 0, 1, 30, 13);
          }
          writer.writeElement(element);

          context$3$0.t8 = writer;
          context$3$0.next = 51;
          return builder.createTextEnd();
        case 51:
          context$3$0.t9 = context$3$0.sent;
          context$3$0.t8.writeElement.call(context$3$0.t8, context$3$0.t9);
          context$3$0.next = 55;
          return writer.end();
        case 55:
          stm = context$3$0.sent;
          context$3$0.next = 58;
          return stm.putRect('BBox', 0, 0, 101, 37);
        case 58:
          context$3$0.next = 60;
          return stm.putName('Subtype', 'Form');
        case 60:
          return context$3$0.abrupt("return", stm);
        case 61:
        case "end":
          return context$3$0.stop();
        }
      }, marked2$0[2], this);
    }

    function main() {
      var input_path, doc, blank_page, emp_first_name, emp_last_name, emp_last_check1, submit, annot1, annot2, annot3, checkMarkApp, annot4, falseButtonApp, trueButtonApp, url, button_action, annot_action, docBuffer, copyOfBuffer, doc2, itr, currentItr, type, str_val, currItr, f, doc3, src_page, doc4, pitr, page, annots, i, annotObj, annotObjSubtype, annotObjVal, annotObjName, field;

      return regeneratorRuntime.wrap(function main$(context$3$0) {
        while (1) switch (context$3$0.prev = context$3$0.next) {
        case 0:
          context$3$0.prev = 0;
          console.log('Beginning Test 1');

          input_path = '../TestFiles/';
          context$3$0.next = 5;
          return PDFNet.PDFDoc.create();
        case 5:
          doc = context$3$0.sent;
          doc.initSecurityHandler();
          doc.lock();
          console.log('PDF document initialized and locked');

          context$3$0.next = 11;
          return doc.pageCreate();
        case 11:
          blank_page = context$3$0.sent;
          context$3$0.next = 14;
          return doc.fieldCreateFromStrings('employee.name.first', PDFNet.Field.Type.e_text, 'John', '');
        case 14:
          emp_first_name = context$3$0.sent;
          context$3$0.next = 17;
          return doc.fieldCreateFromStrings('employee.name.last', PDFNet.Field.Type.e_text, 'Doe', '');
        case 17:
          emp_last_name = context$3$0.sent;
          context$3$0.next = 20;
          return doc.fieldCreateFromStrings('employee.name.check1', PDFNet.Field.Type.e_check, 'Yes', '');
        case 20:
          emp_last_check1 = context$3$0.sent;
          context$3$0.next = 23;
          return doc.fieldCreate('submit', PDFNet.Field.Type.e_button);
        case 23:
          submit = context$3$0.sent;
          context$3$0.t0 = PDFNet.WidgetAnnot;
          context$3$0.t1 = doc;
          context$3$0.next = 28;
          return PDFNet.Rect.init(50, 550, 350, 600);
        case 28:
          context$3$0.t2 = context$3$0.sent;
          context$3$0.t3 = emp_first_name;
          context$3$0.next = 32;
          return context$3$0.t0.create.call(context$3$0.t0, context$3$0.t1, context$3$0.t2, context$3$0.t3);
        case 32:
          annot1 = context$3$0.sent;
          context$3$0.t4 = PDFNet.WidgetAnnot;
          context$3$0.t5 = doc;
          context$3$0.next = 37;
          return PDFNet.Rect.init(50, 450, 350, 500);
        case 37:
          context$3$0.t6 = context$3$0.sent;
          context$3$0.t7 = emp_last_name;
          context$3$0.next = 41;
          return context$3$0.t4.create.call(context$3$0.t4, context$3$0.t5, context$3$0.t6, context$3$0.t7);
        case 41:
          annot2 = context$3$0.sent;
          context$3$0.t8 = PDFNet.WidgetAnnot;
          context$3$0.t9 = doc;
          context$3$0.next = 46;
          return PDFNet.Rect.init(64, 356, 120, 410);
        case 46:
          context$3$0.t10 = context$3$0.sent;
          context$3$0.t11 = emp_last_check1;
          context$3$0.next = 50;
          return context$3$0.t8.create.call(context$3$0.t8, context$3$0.t9, context$3$0.t10, context$3$0.t11);
        case 50:
          annot3 = context$3$0.sent;
          return context$3$0.delegateYield(CreateCheckmarkAppearance(doc, PDFNet.CheckStyle.e_check), "t12", 52);
        case 52:
          checkMarkApp = context$3$0.t12;
          // Set the annotation appearance for the "Yes" state...
          annot3.setAppearance(checkMarkApp, PDFNet.Annot.State.e_normal, 'Yes');

          context$3$0.t13 = PDFNet.WidgetAnnot;
          context$3$0.t14 = doc;
          context$3$0.next = 58;
          return PDFNet.Rect.init(64, 284, 163, 320);
        case 58:
          context$3$0.t15 = context$3$0.sent;
          context$3$0.t16 = submit;
          context$3$0.next = 62;
          return context$3$0.t13.create.call(context$3$0.t13, context$3$0.t14, context$3$0.t15, context$3$0.t16);
        case 62:
          annot4 = context$3$0.sent;
          return context$3$0.delegateYield(CreateButtonAppearance(doc, false), "t17", 64);
        case 64:
          falseButtonApp = context$3$0.t17;
          return context$3$0.delegateYield(CreateButtonAppearance(doc, true), "t18", 66);
        case 66:
          trueButtonApp = context$3$0.t18;
          context$3$0.next = 69;
          return annot4.setAppearance(falseButtonApp, PDFNet.Annot.State.e_normal);
        case 69:
          context$3$0.next = 71;
          return annot4.setAppearance(trueButtonApp, PDFNet.Annot.State.e_down);
        case 71:
          context$3$0.next = 73;
          return PDFNet.FileSpec.createURL(doc, 'http://www.pdftron.com');
        case 73:
          url = context$3$0.sent;
          context$3$0.next = 76;
          return PDFNet.Action.createSubmitForm(url);
        case 76:
          button_action = context$3$0.sent;
          context$3$0.next = 79;
          return annot4.getSDFObj();
        case 79:
          context$3$0.next = 81;
          return context$3$0.sent.putDict('AA');
        case 81:
          annot_action = context$3$0.sent;
          context$3$0.t19 = annot_action;
          context$3$0.next = 85;
          return button_action.getSDFObj();
        case 85:
          context$3$0.t20 = context$3$0.sent;
          context$3$0.t19.put.call(context$3$0.t19, 'D', context$3$0.t20);

          // Add annotations to the page
          blank_page.annotPushBack(annot1);
          blank_page.annotPushBack(annot2);
          blank_page.annotPushBack(annot3);
          blank_page.annotPushBack(annot4);

          // Add the page as the last page in the document.
          doc.pagePushBack(blank_page);

          // If you are not satisfied with the look of default auto-generated appearance
          // streams you can delete "AP" entry from the Widget annotation and set
          // "NeedAppearances" flag in AcroForm dictionary:
          //    doc.GetAcroForm().PutBool("NeedAppearances", true);
          // This will force the viewer application to auto-generate new appearance streams
          // every time the document is opened.
          //
          // Alternatively you can generate custom annotation appearance using ElementWriter
          // and then set the "AP" entry in the widget dictionary to the new appearance
          // stream.
          //
          // Yet another option is to pre-populate field entries with dummy text. When
          // you edit the field values using PDFNet the new field appearances will match
          // the old ones.

          // doc.GetAcroForm().PutBool("NeedAppearances", true);
          // NOTE: refreshFieldAppearances will replace previously generated appearance streams
          doc.refreshFieldAppearances();

          context$3$0.next = 95;
          return doc.saveMemoryBuffer(0);
        case 95:
          docBuffer = context$3$0.sent;
          saveBufferAsPDFDoc(docBuffer, 'forms_test1.pdf');

          console.log('Example 1 complete and everything deallocated.');
          context$3$0.next = 103;
          break;
        case 100:
          context$3$0.prev = 100;
          context$3$0.t21 = context$3$0["catch"](0);
          console.log(context$3$0.t21.stack);
        case 103:
          context$3$0.prev = 103;
          console.log('Beginning Test 2');

          input_path = '../TestFiles/';
          copyOfBuffer = new Uint8Array(docBuffer.buffer.slice(0));
          context$3$0.next = 109;
          return PDFNet.PDFDoc.createFromBuffer(copyOfBuffer);
        case 109:
          doc2 = context$3$0.sent;

          doc2.initSecurityHandler();
          doc2.lock();
          console.log('Sample 2 PDF document initialized and locked');
          context$3$0.next = 115;
          return doc2.getFieldIteratorBegin();
        case 115:
          itr = context$3$0.sent;
        case 116:
          context$3$0.next = 118;
          return itr.hasNext();
        case 118:
          if (!context$3$0.sent) {
            context$3$0.next = 168;
            break;
          }

          context$3$0.next = 121;
          return itr.current();
        case 121:
          currentItr = context$3$0.sent;
          context$3$0.t22 = console;
          context$3$0.next = 125;
          return currentItr.getName();
        case 125:
          context$3$0.t23 = context$3$0.sent;
          context$3$0.t24 = 'Field name: ' + context$3$0.t23;
          context$3$0.t22.log.call(context$3$0.t22, context$3$0.t24);
          context$3$0.t25 = console;
          context$3$0.next = 131;
          return currentItr.getPartialName();
        case 131:
          context$3$0.t26 = context$3$0.sent;
          context$3$0.t27 = 'Field partial name: ' + context$3$0.t26;
          context$3$0.t25.log.call(context$3$0.t25, context$3$0.t27);

          console.log('Field type: ');
          context$3$0.next = 137;
          return currentItr.getType();
        case 137:
          type = context$3$0.sent;
          context$3$0.next = 140;
          return currentItr.getValueAsString();
        case 140:
          str_val = context$3$0.sent;
          context$3$0.t28 = type;
          context$3$0.next = (context$3$0.t28 === PDFNet.Field.Type.e_button ? 144 : (context$3$0.t28 === PDFNet.Field.Type.e_radio ? 146 : (context$3$0.t28 === PDFNet.Field.Type.e_check ? 148 : (context$3$0.t28 === PDFNet.Field.Type.e_text ? 154 : (context$3$0.t28 === PDFNet.Field.Type.e_choice ? 160 : (context$3$0.t28 === PDFNet.Field.Type.e_signature ? 162 : 164))))));
          break;
        case 144:
          console.log('Button');
          return context$3$0.abrupt("break", 164);
        case 146:
          console.log('Radio button: Value = ' + str_val);
          return context$3$0.abrupt("break", 164);
        case 148:
          context$3$0.next = 150;
          return itr.current();
        case 150:
          currItr = context$3$0.sent;
          currItr.setValueAsBool(true);
          console.log('Check box: Value = ' + str_val);
          return context$3$0.abrupt("break", 164);
        case 154:
          console.log('Text');
          context$3$0.next = 157;
          return itr.current();
        case 157:
          currItr = context$3$0.sent;
          currItr.setValueAsString('This is a new value. The old one was: ' + str_val);
          return context$3$0.abrupt("break", 164);
        case 160:
          console.log('Choice');
          return context$3$0.abrupt("break", 164);
        case 162:
          console.log('Signature');
          return context$3$0.abrupt("break", 164);
        case 164:
          console.log('-----------------------');
        case 165:
          itr.next();
          context$3$0.next = 116;
          break;
        case 168:
          context$3$0.next = 170;
          return doc2.getField('employee.name.first');
        case 170:
          f = context$3$0.sent;

          if (!f) {
            context$3$0.next = 181;
            break;
          }

          context$3$0.t29 = console;
          context$3$0.next = 175;
          return f.getName();
        case 175:
          context$3$0.t30 = context$3$0.sent;
          context$3$0.t31 = 'Field search for ' + context$3$0.t30;
          context$3$0.t32 = context$3$0.t31 + ' was successful';
          context$3$0.t29.log.call(context$3$0.t29, context$3$0.t32);
          context$3$0.next = 182;
          break;
        case 181:
          console.log('Field search failed');
        case 182:
          // Regenerate field appearances.
          doc2.refreshFieldAppearances();

          context$3$0.next = 185;
          return doc2.saveMemoryBuffer(0);
        case 185:
          docBuffer = context$3$0.sent;
          saveBufferAsPDFDoc(docBuffer, 'forms_test_edit.pdf');
          console.log('Example 2 complete and everything deallocated.');
          context$3$0.next = 193;
          break;
        case 190:
          context$3$0.prev = 190;
          context$3$0.t33 = context$3$0["catch"](103);
          console.log(context$3$0.t33);
        case 193:
          context$3$0.prev = 193;
          copyOfBuffer = new Uint8Array(docBuffer.buffer.slice(0));
          context$3$0.next = 197;
          return PDFNet.PDFDoc.createFromBuffer(copyOfBuffer);
        case 197:
          doc3 = context$3$0.sent;
          doc3.initSecurityHandler();
          doc3.lock();
          console.log('Sample 3 PDF document initialized and locked');
          context$3$0.next = 203;
          return doc3.getPage(1);
        case 203:
          src_page = context$3$0.sent;
          // Append several copies of the first page
          doc3.pagePushBack(src_page);
          // Note that forms are successfully copied
          doc3.pagePushBack(src_page);
          doc3.pagePushBack(src_page);
          doc3.pagePushBack(src_page);

          return context$3$0.delegateYield(RenameAllFields(doc3, 'employee.name.first'), "t34", 209);
        case 209:
          return context$3$0.delegateYield(RenameAllFields(doc3, 'employee.name.last'), "t35", 210);
        case 210:
          return context$3$0.delegateYield(RenameAllFields(doc3, 'employee.name.check1'), "t36", 211);
        case 211:
          return context$3$0.delegateYield(RenameAllFields(doc3, 'submit'), "t37", 212);
        case 212:
          context$3$0.next = 214;
          return doc3.saveMemoryBuffer(0);
        case 214:
          docBuffer = context$3$0.sent;
          saveBufferAsPDFDoc(docBuffer, 'forms_test1_cloned.pdf');
          console.log('Example 3 complete and everything deallocated.');
          context$3$0.next = 222;
          break;
        case 219:
          context$3$0.prev = 219;
          context$3$0.t38 = context$3$0["catch"](193);
          console.log(context$3$0.t38);
        case 222:
          context$3$0.prev = 222;
          copyOfBuffer = new Uint8Array(docBuffer.buffer.slice(0));
          context$3$0.next = 226;
          return PDFNet.PDFDoc.createFromBuffer(copyOfBuffer);
        case 226:
          doc4 = context$3$0.sent;
          doc4.initSecurityHandler();
          doc4.lock();
          console.log('Sample 4 PDF document initialized and locked');

          if (!true) {
            context$3$0.next = 234;
            break;
          }

          doc4.flattenAnnotations();
          context$3$0.next = 281;
          break;
        case 234:
          context$3$0.next = 236;
          return doc4.getPageIterator();
        case 236:
          pitr = context$3$0.sent;
        case 237:
          context$3$0.next = 239;
          return pitr.hasNext();
        case 239:
          if (!context$3$0.sent) {
            context$3$0.next = 281;
            break;
          }

          context$3$0.next = 242;
          return pitr.current();
        case 242:
          page = context$3$0.sent;
          context$3$0.next = 245;
          return page.getAnnots();
        case 245:
          annots = context$3$0.sent;

          if (!annots) {
            context$3$0.next = 277;
            break;
          }

          context$3$0.next = 249;
          return annots.size();
        case 249:
          context$3$0.t39 = context$3$0.sent;
          context$3$0.t40 = parseInt(context$3$0.t39, 10);
          i = context$3$0.t40 - 1;
        case 252:
          if (!(i >= 0)) {
            context$3$0.next = 277;
            break;
          }

          context$3$0.next = 255;
          return annots.getAt(i);
        case 255:
          annotObj = context$3$0.sent;
          context$3$0.next = 258;
          return annotObj.get('Subtype');
        case 258:
          annotObjSubtype = context$3$0.sent;
          context$3$0.next = 261;
          return annotObjSubtype.value();
        case 261:
          annotObjVal = context$3$0.sent;
          context$3$0.next = 264;
          return annotObj.get('Subtype');
        case 264:
          context$3$0.next = 266;
          return context$3$0.sent.value();
        case 266:
          context$3$0.next = 268;
          return context$3$0.sent.getName();
        case 268:
          annotObjName = context$3$0.sent;

          if (!(annotObjName === 'Widget')) {
            context$3$0.next = 274;
            break;
          }

          context$3$0.next = 272;
          return PDFNet.Field.create(annotObj);
        case 272:
          field = context$3$0.sent;
          // Another way of making a read only field is by modifying
          // field's e_read_only flag:
          //    field.SetFlag(Field::e_read_only, true);
          field.flatten(page);
        case 274:
          --i;
          context$3$0.next = 252;
          break;
        case 277:
          context$3$0.next = 279;
          return pitr.next();
        case 279:
          context$3$0.next = 237;
          break;
        case 281:
          context$3$0.next = 283;
          return doc4.saveMemoryBuffer(0);
        case 283:
          docBuffer = context$3$0.sent;
          saveBufferAsPDFDoc(docBuffer, 'forms_test1_flattened.pdf');
          console.log('done - Example 4 complete and everything deallocated.');
          context$3$0.next = 291;
          break;
        case 288:
          context$3$0.prev = 288;
          context$3$0.t41 = context$3$0["catch"](222);
          console.log(context$3$0.t41);
        case 291:
        case "end":
          return context$3$0.stop();
        }
      }, marked2$0[3], this, [[0, 100], [103, 190], [193, 219], [222, 288]]);
    }
    // replace with your own license key and remove the samples-key.js script tag
    PDFNet.runGeneratorWithCleanup(main(), window.sampleL);
  };
})(window);