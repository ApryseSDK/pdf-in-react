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
//# sourceURL=AnnotationTest.js
(function(exports) {
  'use strict';

  exports.runAnnotationTest = function() {
    var marked2$0 = [AnnotationLowLevelAPI, AnnotationHighLevelAPI, CreateTestAnnots, main].map(regeneratorRuntime.mark);
    function AnnotationLowLevelAPI(doc) {
      var itr, page, annots, sdfDoc, annot, link1, dest, link2, dest2, tenthPage, XYZDestination, link3, action;

      return regeneratorRuntime.wrap(function AnnotationLowLevelAPI$(context$3$0) {
        while (1) switch (context$3$0.prev = context$3$0.next) {
        case 0:
          context$3$0.prev = 0;
          context$3$0.next = 3;
          return PDFNet.startDeallocateStack();
        case 3:
          console.log('running LowLevelAPI');
          context$3$0.next = 6;
          return doc.getPageIterator(1);
        case 6:
          itr = context$3$0.sent;
          context$3$0.next = 9;
          return itr.current();
        case 9:
          page = context$3$0.sent;
          context$3$0.next = 12;
          return page.getAnnots();
        case 12:
          annots = context$3$0.sent;

          if (!(annots == null)) {
            context$3$0.next = 22;
            break;
          }

          context$3$0.next = 16;
          return doc.createIndirectArray();
        case 16:
          annots = context$3$0.sent;
          context$3$0.next = 19;
          return page.getSDFObj();
        case 19:
          sdfDoc = context$3$0.sent;
          context$3$0.next = 22;
          return sdfDoc.put('Annots', annots);
        case 22:
          context$3$0.next = 24;
          return doc.createIndirectDict();
        case 24:
          annot = context$3$0.sent;
          context$3$0.next = 27;
          return annot.putName('Subtype', 'Text');
        case 27:
          context$3$0.next = 29;
          return annot.putBool('Open', true);
        case 29:
          context$3$0.next = 31;
          return annot.putString('Contents', 'The quick brown fox ate the lazy mouse.');
        case 31:
          context$3$0.next = 33;
          return annot.putRect('Rect', 266, 116, 430, 204);
        case 33:
          context$3$0.next = 35;
          return annots.pushBack(annot);
        case 35:
          context$3$0.next = 37;
          return doc.createIndirectDict();
        case 37:
          link1 = context$3$0.sent;
          context$3$0.next = 40;
          return link1.putName('Subtype', 'Link');
        case 40:
          context$3$0.t0 = PDFNet.Destination;
          context$3$0.next = 43;
          return doc.getPage(2);
        case 43:
          context$3$0.t1 = context$3$0.sent;
          context$3$0.next = 46;
          return context$3$0.t0.createFit.call(context$3$0.t0, context$3$0.t1);
        case 46:
          dest = context$3$0.sent;
          context$3$0.t2 = link1;
          context$3$0.next = 50;
          return dest.getSDFObj();
        case 50:
          context$3$0.t3 = context$3$0.sent;
          context$3$0.next = 53;
          return context$3$0.t2.put.call(context$3$0.t2, 'Dest', context$3$0.t3);
        case 53:
          context$3$0.next = 55;
          return link1.putRect('Rect', 85, 705, 503, 661);
        case 55:
          context$3$0.next = 57;
          return annots.pushBack(link1);
        case 57:
          context$3$0.next = 59;
          return doc.createIndirectDict();
        case 59:
          link2 = context$3$0.sent;
          context$3$0.next = 62;
          return link2.putName('Subtype', 'Link');
        case 62:
          context$3$0.t4 = PDFNet.Destination;
          context$3$0.next = 65;
          return doc.getPage(3);
        case 65:
          context$3$0.t5 = context$3$0.sent;
          context$3$0.next = 68;
          return context$3$0.t4.createFit.call(context$3$0.t4, context$3$0.t5);
        case 68:
          dest2 = context$3$0.sent;
          context$3$0.t6 = link2;
          context$3$0.next = 72;
          return dest2.getSDFObj();
        case 72:
          context$3$0.t7 = context$3$0.sent;
          context$3$0.next = 75;
          return context$3$0.t6.put.call(context$3$0.t6, 'Dest', context$3$0.t7);
        case 75:
          context$3$0.next = 77;
          return link2.putRect('Rect', 85, 638, 503, 594);
        case 77:
          context$3$0.next = 79;
          return annots.pushBack(link2);
        case 79:
          context$3$0.next = 81;
          return doc.getPage(10);
        case 81:
          tenthPage = context$3$0.sent;
          context$3$0.next = 84;
          return PDFNet.Destination.createXYZ(tenthPage, 100, 722, 10);
        case 84:
          XYZDestination = context$3$0.sent;
          context$3$0.t8 = link2;
          context$3$0.next = 88;
          return XYZDestination.getSDFObj();
        case 88:
          context$3$0.t9 = context$3$0.sent;
          context$3$0.next = 91;
          return context$3$0.t8.put.call(context$3$0.t8, 'Dest', context$3$0.t9);
        case 91:
          context$3$0.next = 93;
          return doc.createIndirectDict();
        case 93:
          link3 = context$3$0.sent;
          context$3$0.next = 96;
          return link3.putName('Subtype', 'Link');
        case 96:
          context$3$0.next = 98;
          return link3.putRect('Rect', 85, 570, 503, 524);
        case 98:
          context$3$0.next = 100;
          return link3.putDict('A');
        case 100:
          action = context$3$0.sent;
          context$3$0.next = 103;
          return action.putName('S', 'URI');
        case 103:
          context$3$0.next = 105;
          return action.putString('URI', 'http://www.pdftron.com');
        case 105:
          context$3$0.next = 107;
          return annots.pushBack(link3);
        case 107:
          console.log('AnnotationLowLevel Done.');
          context$3$0.next = 110;
          return PDFNet.endDeallocateStack();
        case 110:
          context$3$0.next = 115;
          break;
        case 112:
          context$3$0.prev = 112;
          context$3$0.t10 = context$3$0["catch"](0);
          console.log(context$3$0.t10);
        case 115:
        case "end":
          return context$3$0.stop();
        }
      }, marked2$0[0], this, [[0, 112]]);
    }

    function AnnotationHighLevelAPI(doc) {
      var first_page, page_num, itr, page, num_annots, i, annot, annotSDF, subType, subTypeVal, outputString, bbox, annotType, link, action, dest, page_num_out, SDFObj, URI, URIval, URIText, createURIAction, linkRect, hyperlink, page3, goto_page_3, border_style, greenColorPt, stamp, ink, pt3, cyanColorPt;

      return regeneratorRuntime.wrap(function AnnotationHighLevelAPI$(context$3$0) {
        while (1) switch (context$3$0.prev = context$3$0.next) {
        case 0:
          context$3$0.next = 2;
          return PDFNet.startDeallocateStack();
        case 2:
          context$3$0.next = 4;
          return doc.getPage(1);
        case 4:
          first_page = context$3$0.sent;

          // The following code snippet traverses all annotations in the document
          console.log('Traversing all annotations in the document...');

          context$3$0.next = 8;
          return doc.getPage(1);
        case 8:
          first_page = context$3$0.sent;
          page_num = 0;
          context$3$0.next = 12;
          return doc.getPageIterator(1);
        case 12:
          itr = context$3$0.sent;
          itr;
        case 14:
          context$3$0.next = 16;
          return itr.hasNext();
        case 16:
          if (!context$3$0.sent) {
            context$3$0.next = 122;
            break;
          }

          page_num += 1;
          console.log('Page ' + page_num + ': ');
          context$3$0.next = 21;
          return itr.current();
        case 21:
          page = context$3$0.sent;
          context$3$0.next = 24;
          return page.getNumAnnots();
        case 24:
          num_annots = context$3$0.sent;
          i = 0;
        case 26:
          if (!(i < num_annots)) {
            context$3$0.next = 118;
            break;
          }

          context$3$0.next = 29;
          return page.getAnnot(i);
        case 29:
          annot = context$3$0.sent;
          context$3$0.next = 32;
          return annot.isValid();
        case 32:
          if (context$3$0.sent) {
            context$3$0.next = 34;
            break;
          }

          return context$3$0.abrupt("continue", 115);
        case 34:
          context$3$0.next = 36;
          return annot.getSDFObj();
        case 36:
          annotSDF = context$3$0.sent;
          context$3$0.next = 39;
          return annotSDF.get('Subtype');
        case 39:
          subType = context$3$0.sent;
          context$3$0.next = 42;
          return subType.value();
        case 42:
          subTypeVal = context$3$0.sent;
          context$3$0.next = 45;
          return subTypeVal.getName();
        case 45:
          context$3$0.t0 = context$3$0.sent;
          outputString = 'Annot Type: ' + context$3$0.t0;
          context$3$0.next = 49;
          return annot.getRect();
        case 49:
          bbox = context$3$0.sent;
          outputString += ';  Position: ' + bbox.x1 + ', ' + bbox.y1 + ', ' + bbox.x2 + ', ' + bbox.y2;
          console.log(outputString);
          context$3$0.next = 54;
          return annot.getType();
        case 54:
          annotType = context$3$0.sent;
          context$3$0.t1 = annotType;
          context$3$0.next = (context$3$0.t1 === PDFNet.Annot.Type.e_Link ? 58 : (context$3$0.t1 === PDFNet.Annot.Type.e_Widget ? 110 : (context$3$0.t1 === PDFNet.Annot.Type.e_FileAttachment ? 111 : 112)));
          break;
        case 58:
          context$3$0.next = 60;
          return PDFNet.LinkAnnot.createFromAnnot(annot);
        case 60:
          link = context$3$0.sent;
          context$3$0.next = 63;
          return link.getAction();
        case 63:
          action = context$3$0.sent;
          context$3$0.next = 66;
          return action.isValid();
        case 66:
          if (context$3$0.sent) {
            context$3$0.next = 68;
            break;
          }

          return context$3$0.abrupt("continue", 115);
        case 68:
          context$3$0.next = 70;
          return action.getType();
        case 70:
          context$3$0.t2 = context$3$0.sent;
          context$3$0.t3 = PDFNet.Action.Type.e_GoTo;

          if (!(context$3$0.t2 === context$3$0.t3)) {
            context$3$0.next = 90;
            break;
          }

          context$3$0.next = 75;
          return action.getDest();
        case 75:
          dest = context$3$0.sent;
          context$3$0.next = 78;
          return dest.isValid();
        case 78:
          if (context$3$0.sent) {
            context$3$0.next = 82;
            break;
          }

          console.log('  Destination is not valid');
          context$3$0.next = 88;
          break;
        case 82:
          context$3$0.next = 84;
          return dest.getPage();
        case 84:
          context$3$0.next = 86;
          return context$3$0.sent.getIndex();
        case 86:
          page_num_out = context$3$0.sent;
          console.log('  Links to: page number ' + page_num_out + ' in this document');
        case 88:
          context$3$0.next = 109;
          break;
        case 90:
          context$3$0.next = 92;
          return action.getType();
        case 92:
          context$3$0.t4 = context$3$0.sent;
          context$3$0.t5 = PDFNet.Action.Type.e_URI;

          if (!(context$3$0.t4 === context$3$0.t5)) {
            context$3$0.next = 109;
            break;
          }

          context$3$0.next = 97;
          return action.getSDFObj();
        case 97:
          SDFObj = context$3$0.sent;
          context$3$0.next = 100;
          return SDFObj.get('URI');
        case 100:
          URI = context$3$0.sent;
          context$3$0.next = 103;
          return URI.value();
        case 103:
          URIval = context$3$0.sent;
          context$3$0.next = 106;
          return URIval.getAsPDFText();
        case 106:
          URIText = context$3$0.sent;
          // Other get methods such as getNumber do not work either, although some do, so confusing.
          console.log(' Links to: ' + URIText);
          // deallocate dictionary object on C side
          URI.destroy();
        case 109:
          return context$3$0.abrupt("break", 113);
        case 110:
          return context$3$0.abrupt("break", 113);
        case 111:
          return context$3$0.abrupt("break", 113);
        case 112:
          return context$3$0.abrupt("break", 113);
        case 113:
          context$3$0.next = 115;
          return subType.destroy();
        case 115:
          ++i;
          context$3$0.next = 26;
          break;
        case 118:
          context$3$0.next = 120;
          return itr.next();
        case 120:
          context$3$0.next = 14;
          break;
        case 122:
          context$3$0.next = 124;
          return doc.getPage(1);
        case 124:
          first_page = context$3$0.sent;
          context$3$0.next = 127;
          return PDFNet.Action.createURI(doc, 'http://www.pdftron.com');
        case 127:
          createURIAction = context$3$0.sent;
          linkRect = new PDFNet.Rect(85, 570, 503, 524);
          context$3$0.next = 131;
          return PDFNet.LinkAnnot.create(doc, linkRect);
        case 131:
          hyperlink = context$3$0.sent;
          context$3$0.next = 134;
          return hyperlink.setAction(createURIAction);
        case 134:
          context$3$0.next = 136;
          return first_page.annotPushBack(hyperlink);
        case 136:
          context$3$0.next = 138;
          return doc.getPage(3);
        case 138:
          page3 = context$3$0.sent;
          context$3$0.t6 = PDFNet.Action;
          context$3$0.next = 142;
          return PDFNet.Destination.createFitH(page3, 0);
        case 142:
          context$3$0.t7 = context$3$0.sent;
          context$3$0.next = 145;
          return context$3$0.t6.createGoto.call(context$3$0.t6, context$3$0.t7);
        case 145:
          goto_page_3 = context$3$0.sent;
          context$3$0.next = 148;
          return PDFNet.LinkAnnot.create(doc, (new PDFNet.Rect(85, 458, 503, 502)));
        case 148:
          link = context$3$0.sent;
          context$3$0.next = 151;
          return link.setAction(goto_page_3);
        case 151:
          context$3$0.next = 153;
          return PDFNet.AnnotBorderStyle.create(PDFNet.AnnotBorderStyle.Style.e_solid, 3, 0, 0);
        case 153:
          border_style = context$3$0.sent;
          // default false
          link.setBorderStyle(border_style, false);
          context$3$0.next = 157;
          return PDFNet.ColorPt.init(0, 0, 1, 0);
        case 157:
          greenColorPt = context$3$0.sent;
          context$3$0.next = 160;
          return link.setColorDefault(greenColorPt);
        case 160:
          context$3$0.next = 162;
          return first_page.annotPushBack(link);
        case 162:
          context$3$0.next = 164;
          return PDFNet.RubberStampAnnot.create(doc, (new PDFNet.Rect(30, 30, 300, 200)));
        case 164:
          stamp = context$3$0.sent;
          context$3$0.next = 167;
          return stamp.setIconName('Draft');
        case 167:
          context$3$0.next = 169;
          return first_page.annotPushBack(stamp);
        case 169:
          context$3$0.next = 171;
          return PDFNet.InkAnnot.create(doc, (new PDFNet.Rect(110, 10, 300, 200)));
        case 171:
          ink = context$3$0.sent;
          pt3 = new PDFNet.Point(110, 10);
          context$3$0.next = 175;
          return ink.setPoint(0, 0, pt3);
        case 175:
          pt3.x = 150;
          pt3.y = 50;
          context$3$0.next = 179;
          return ink.setPoint(0, 1, pt3);
        case 179:
          pt3.x = 190;
          pt3.y = 60;
          context$3$0.next = 183;
          return ink.setPoint(0, 2, pt3);
        case 183:
          pt3.x = 180;
          pt3.y = 90;
          context$3$0.next = 187;
          return ink.setPoint(1, 0, pt3);
        case 187:
          pt3.x = 190;
          pt3.y = 95;
          context$3$0.next = 191;
          return ink.setPoint(1, 1, pt3);
        case 191:
          pt3.x = 200;
          pt3.y = 100;
          context$3$0.next = 195;
          return ink.setPoint(1, 2, pt3);
        case 195:
          pt3.x = 166;
          pt3.y = 86;
          context$3$0.next = 199;
          return ink.setPoint(2, 0, pt3);
        case 199:
          pt3.x = 196;
          pt3.y = 96;
          context$3$0.next = 203;
          return ink.setPoint(2, 1, pt3);
        case 203:
          pt3.x = 221;
          pt3.y = 121;
          context$3$0.next = 207;
          return ink.setPoint(2, 2, pt3);
        case 207:
          pt3.x = 288;
          pt3.y = 188;
          context$3$0.next = 211;
          return ink.setPoint(2, 3, pt3);
        case 211:
          context$3$0.next = 213;
          return PDFNet.ColorPt.init(0, 1, 1, 0);
        case 213:
          cyanColorPt = context$3$0.sent;
          context$3$0.next = 216;
          return ink.setColor(cyanColorPt, 3);
        case 216:
          first_page.annotPushBack(ink);

          context$3$0.next = 219;
          return PDFNet.endDeallocateStack();
        case 219:
        case "end":
          return context$3$0.stop();
        }
      }, marked2$0[1], this);
    }

    function CreateTestAnnots(doc) {
      var ew, eb, element, first_page, txtannot, solidLine, greenColorPt, redColorPt, page, line, darkGreenColorPt, dash, bStyle, blueColorPt, page3, circle, sq, poly, solidBorderStyle, lk, page4, font, hl, cr, page5, fs, page6, ipage, iann, fa, txt, ink, page7, snd, page8, px, py, istamp, st;

      return regeneratorRuntime.wrap(function CreateTestAnnots$(context$3$0) {
        while (1) switch (context$3$0.prev = context$3$0.next) {
        case 0:
          context$3$0.next = 2;
          return PDFNet.startDeallocateStack();
        case 2:
          context$3$0.next = 4;
          return PDFNet.ElementWriter.create();
        case 4:
          ew = context$3$0.sent;
          context$3$0.next = 7;
          return PDFNet.ElementBuilder.create();
        case 7:
          eb = context$3$0.sent;
          context$3$0.next = 10;
          return doc.pageCreate(new PDFNet.Rect(0, 0, 600, 600));
        case 10:
          first_page = context$3$0.sent;
          doc.pagePushBack(first_page);
          // begin writing to this page
          ew.beginOnPage(first_page, PDFNet.ElementWriter.WriteMode.e_overlay, false);
          // save changes to the current page
          ew.end();

          context$3$0.next = 16;
          return PDFNet.FreeTextAnnot.create(doc, new PDFNet.Rect(10, 400, 160, 570));
        case 16:
          txtannot = context$3$0.sent;
          context$3$0.next = 19;
          return txtannot.setContents('\n\nSome swift brown fox snatched a gray hare out of the air by freezing it with an angry glare.\n\nAha!\n\nAnd there was much rejoicing!');
        case 19:
          context$3$0.next = 21;
          return PDFNet.AnnotBorderStyle.create(PDFNet.AnnotBorderStyle.Style.e_solid, 1, 10, 20);
        case 21:
          solidLine = context$3$0.sent;
          context$3$0.next = 24;
          return txtannot.setBorderStyle(solidLine, true);
        case 24:
          context$3$0.next = 26;
          return txtannot.setQuaddingFormat(0);
        case 26:
          context$3$0.next = 28;
          return first_page.annotPushBack(txtannot);
        case 28:
          context$3$0.next = 30;
          return txtannot.refreshAppearance();
        case 30:
          context$3$0.next = 32;
          return PDFNet.FreeTextAnnot.create(doc, new PDFNet.Rect(100, 100, 350, 500));
        case 32:
          txtannot = context$3$0.sent;
          context$3$0.next = 35;
          return txtannot.setContentRect(new PDFNet.Rect(200, 200, 350, 500));
        case 35:
          context$3$0.next = 37;
          return txtannot.setContents('\n\nSome swift brown fox snatched a gray hare out of the air by freezing it with an angry glare.\n\nAha!\n\nAnd there was much rejoicing!');
        case 37:
          context$3$0.next = 39;
          return txtannot.setCalloutLinePoints(new PDFNet.Point(200, 300), new PDFNet.Point(150, 290), new PDFNet.Point(110, 110));
        case 39:
          context$3$0.next = 41;
          return PDFNet.AnnotBorderStyle.create(PDFNet.AnnotBorderStyle.Style.e_solid, 1, 10, 20);
        case 41:
          solidLine = context$3$0.sent;
          context$3$0.next = 44;
          return txtannot.setBorderStyle(solidLine, true);
        case 44:
          context$3$0.next = 46;
          return txtannot.setEndingStyle(PDFNet.LineAnnot.EndingStyle.e_ClosedArrow);
        case 46:
          context$3$0.next = 48;
          return PDFNet.ColorPt.init(0, 1, 0, 0);
        case 48:
          greenColorPt = context$3$0.sent;
          context$3$0.next = 51;
          return txtannot.setColorDefault(greenColorPt);
        case 51:
          context$3$0.next = 53;
          return txtannot.setQuaddingFormat(1);
        case 53:
          context$3$0.next = 55;
          return first_page.annotPushBack(txtannot);
        case 55:
          context$3$0.next = 57;
          return txtannot.refreshAppearance();
        case 57:
          context$3$0.next = 59;
          return PDFNet.FreeTextAnnot.create(doc, new PDFNet.Rect(400, 10, 550, 400));
        case 59:
          txtannot = context$3$0.sent;
          context$3$0.next = 62;
          return txtannot.setContents('\n\nSome swift brown fox snatched a gray hare out of the air by freezing it with an angry glare.\n\nAha!\n\nAnd there was much rejoicing!');
        case 62:
          context$3$0.next = 64;
          return PDFNet.AnnotBorderStyle.create(PDFNet.AnnotBorderStyle.Style.e_solid, 1, 10, 20);
        case 64:
          solidLine = context$3$0.sent;
          context$3$0.next = 67;
          return txtannot.setBorderStyle(solidLine, true);
        case 67:
          context$3$0.next = 69;
          return PDFNet.ColorPt.init(0, 0, 1, 0);
        case 69:
          redColorPt = context$3$0.sent;
          context$3$0.next = 72;
          return txtannot.setColorDefault(redColorPt);
        case 72:
          context$3$0.next = 74;
          return txtannot.setOpacity(0.2);
        case 74:
          context$3$0.next = 76;
          return txtannot.setQuaddingFormat(2);
        case 76:
          context$3$0.next = 78;
          return first_page.annotPushBack(txtannot);
        case 78:
          context$3$0.next = 80;
          return txtannot.refreshAppearance();
        case 80:
          context$3$0.next = 82;
          return doc.pageCreate(new PDFNet.Rect(0, 0, 600, 600));
        case 82:
          page = context$3$0.sent;
          doc.pagePushBack(page);
          context$3$0.next = 86;
          return ew.beginOnPage(page, PDFNet.ElementWriter.WriteMode.e_overlay, false);
        case 86:
          context$3$0.next = 88;
          return eb.reset(new PDFNet.GState('0'));
        case 88:
          context$3$0.next = 90;
          return ew.end();
        case 90:
          context$3$0.next = 92;
          return PDFNet.LineAnnot.create(doc, new PDFNet.Rect(250, 250, 400, 400));
        case 92:
          line = context$3$0.sent;
          context$3$0.next = 95;
          return line.setStartPoint(new PDFNet.Point(350, 270));
        case 95:
          context$3$0.next = 97;
          return line.setEndPoint(new PDFNet.Point(260, 370));
        case 97:
          context$3$0.next = 99;
          return line.setStartStyle(PDFNet.LineAnnot.EndingStyle.e_Square);
        case 99:
          context$3$0.next = 101;
          return line.setEndStyle(PDFNet.LineAnnot.EndingStyle.e_Circle);
        case 101:
          context$3$0.next = 103;
          return PDFNet.ColorPt.init(0.3, 0.5, 0, 0);
        case 103:
          darkGreenColorPt = context$3$0.sent;
          context$3$0.next = 106;
          return line.setColor(darkGreenColorPt, 3);
        case 106:
          context$3$0.next = 108;
          return line.setContents('Dashed Captioned');
        case 108:
          context$3$0.next = 110;
          return line.setShowCaption(true);
        case 110:
          context$3$0.next = 112;
          return line.setCapPos(PDFNet.LineAnnot.CapPos.e_Top);
        case 112:
          dash = new Float64Array([2.0, 2.0]);
          context$3$0.next = 115;
          return PDFNet.AnnotBorderStyle.createWithDashPattern(PDFNet.AnnotBorderStyle.Style.e_dashed, 2, 0, 0, dash);
        case 115:
          bStyle = context$3$0.sent;
          line.setBorderStyle(bStyle, false);
          line.refreshAppearance();
          page.annotPushBack(line);
          context$3$0.next = 121;
          return PDFNet.LineAnnot.create(doc, new PDFNet.Rect(347, 377, 600, 600));
        case 121:
          line = context$3$0.sent;
          context$3$0.next = 124;
          return line.setStartPoint(new PDFNet.Point(385, 410));
        case 124:
          context$3$0.next = 126;
          return line.setEndPoint(new PDFNet.Point(540, 555));
        case 126:
          context$3$0.next = 128;
          return line.setStartStyle(PDFNet.LineAnnot.EndingStyle.e_Circle);
        case 128:
          context$3$0.next = 130;
          return line.setEndStyle(PDFNet.LineAnnot.EndingStyle.e_OpenArrow);
        case 130:
          context$3$0.next = 132;
          return PDFNet.ColorPt.init(1, 0, 0, 0);
        case 132:
          redColorPt = context$3$0.sent;
          context$3$0.next = 135;
          return line.setColor(redColorPt, 3);
        case 135:
          context$3$0.next = 137;
          return PDFNet.ColorPt.init(0, 1, 0, 0);
        case 137:
          greenColorPt = context$3$0.sent;
          context$3$0.next = 140;
          return line.setInteriorColor(greenColorPt, 3);
        case 140:
          context$3$0.next = 142;
          return line.setContents('Inline Caption');
        case 142:
          context$3$0.next = 144;
          return line.setShowCaption(true);
        case 144:
          context$3$0.next = 146;
          return line.setCapPos(PDFNet.LineAnnot.CapPos.e_Inline);
        case 146:
          context$3$0.next = 148;
          return line.setLeaderLineExtensionLength(-4.0);
        case 148:
          context$3$0.next = 150;
          return line.setLeaderLineLength(-12);
        case 150:
          context$3$0.next = 152;
          return line.setLeaderLineOffset(2.0);
        case 152:
          context$3$0.next = 154;
          return line.refreshAppearance();
        case 154:
          page.annotPushBack(line);
          context$3$0.next = 157;
          return PDFNet.LineAnnot.create(doc, new PDFNet.Rect(10, 400, 200, 600));
        case 157:
          line = context$3$0.sent;
          context$3$0.next = 160;
          return line.setStartPoint(new PDFNet.Point(25, 426));
        case 160:
          context$3$0.next = 162;
          return line.setEndPoint(new PDFNet.Point(180, 555));
        case 162:
          context$3$0.next = 164;
          return line.setStartStyle(PDFNet.LineAnnot.EndingStyle.e_Circle);
        case 164:
          context$3$0.next = 166;
          return line.setEndStyle(PDFNet.LineAnnot.EndingStyle.e_Square);
        case 166:
          context$3$0.next = 168;
          return PDFNet.ColorPt.init(0, 0, 1, 0);
        case 168:
          blueColorPt = context$3$0.sent;
          context$3$0.next = 171;
          return line.setColor(blueColorPt, 3);
        case 171:
          context$3$0.next = 173;
          return PDFNet.ColorPt.init(1, 0, 0, 0);
        case 173:
          redColorPt = context$3$0.sent;
          context$3$0.next = 176;
          return line.setInteriorColor(redColorPt, 3);
        case 176:
          context$3$0.next = 178;
          return line.setContents('Offset Caption');
        case 178:
          context$3$0.next = 180;
          return line.setShowCaption(true);
        case 180:
          context$3$0.next = 182;
          return line.setCapPos(PDFNet.LineAnnot.CapPos.e_Top);
        case 182:
          context$3$0.next = 184;
          return line.setTextHOffset(-60);
        case 184:
          context$3$0.next = 186;
          return line.setTextVOffset(10);
        case 186:
          context$3$0.next = 188;
          return line.refreshAppearance();
        case 188:
          page.annotPushBack(line);
          context$3$0.next = 191;
          return PDFNet.LineAnnot.create(doc, new PDFNet.Rect(200, 10, 400, 70));
        case 191:
          line = context$3$0.sent;
          line.setStartPoint(new PDFNet.Point(220, 25));
          line.setEndPoint(new PDFNet.Point(370, 60));
          line.setStartStyle(PDFNet.LineAnnot.EndingStyle.e_Butt);
          line.setEndStyle(PDFNet.LineAnnot.EndingStyle.e_OpenArrow);
          context$3$0.t0 = line;
          context$3$0.next = 199;
          return PDFNet.ColorPt.init(0, 0, 1);
        case 199:
          context$3$0.t1 = context$3$0.sent;
          context$3$0.t0.setColor.call(context$3$0.t0, context$3$0.t1, 3);
          line.setContents('Regular Caption');
          line.setShowCaption(true);
          line.setCapPos(PDFNet.LineAnnot.CapPos.e_Top);
          context$3$0.next = 206;
          return line.refreshAppearance();
        case 206:
          page.annotPushBack(line);
          context$3$0.next = 209;
          return PDFNet.LineAnnot.create(doc, new PDFNet.Rect(200, 70, 400, 130));
        case 209:
          line = context$3$0.sent;
          line.setStartPoint(new PDFNet.Point(220, 111));
          line.setEndPoint(new PDFNet.Point(370, 78));
          line.setStartStyle(PDFNet.LineAnnot.EndingStyle.e_Circle);
          line.setEndStyle(PDFNet.LineAnnot.EndingStyle.e_Diamond);
          line.setContents('Circle to Diamond');
          context$3$0.t2 = line;
          context$3$0.next = 218;
          return PDFNet.ColorPt.init(0, 0, 1);
        case 218:
          context$3$0.t3 = context$3$0.sent;
          context$3$0.t2.setColor.call(context$3$0.t2, context$3$0.t3, 3);
          context$3$0.t4 = line;
          context$3$0.next = 223;
          return PDFNet.ColorPt.init(0, 1, 0);
        case 223:
          context$3$0.t5 = context$3$0.sent;
          context$3$0.t4.setInteriorColor.call(context$3$0.t4, context$3$0.t5, 3);
          line.setShowCaption(true);
          line.setCapPos(PDFNet.LineAnnot.CapPos.e_Top);
          line.refreshAppearance();
          page.annotPushBack(line);
          context$3$0.next = 231;
          return PDFNet.LineAnnot.create(doc, new PDFNet.Rect(10, 100, 160, 200));
        case 231:
          line = context$3$0.sent;
          line.setStartPoint(new PDFNet.Point(15, 110));
          line.setEndPoint(new PDFNet.Point(150, 190));
          line.setStartStyle(PDFNet.LineAnnot.EndingStyle.e_Slash);
          line.setEndStyle(PDFNet.LineAnnot.EndingStyle.e_ClosedArrow);
          line.setContents('Slash to CArrow');
          context$3$0.t6 = line;
          context$3$0.next = 240;
          return PDFNet.ColorPt.init(1, 0, 0);
        case 240:
          context$3$0.t7 = context$3$0.sent;
          context$3$0.t6.setColor.call(context$3$0.t6, context$3$0.t7, 3);
          context$3$0.t8 = line;
          context$3$0.next = 245;
          return PDFNet.ColorPt.init(0, 1, 1);
        case 245:
          context$3$0.t9 = context$3$0.sent;
          context$3$0.t8.setInteriorColor.call(context$3$0.t8, context$3$0.t9, 3);
          line.setShowCaption(true);
          line.setCapPos(PDFNet.LineAnnot.CapPos.e_Top);
          line.refreshAppearance();
          page.annotPushBack(line);
          context$3$0.next = 253;
          return PDFNet.LineAnnot.create(doc, new PDFNet.Rect(270, 270, 570, 433));
        case 253:
          line = context$3$0.sent;
          line.setStartPoint(new PDFNet.Point(300, 400));
          line.setEndPoint(new PDFNet.Point(550, 300));
          line.setStartStyle(PDFNet.LineAnnot.EndingStyle.e_RClosedArrow);
          line.setEndStyle(PDFNet.LineAnnot.EndingStyle.e_ROpenArrow);
          line.setContents('ROpen & RClosed arrows');
          context$3$0.t10 = line;
          context$3$0.next = 262;
          return PDFNet.ColorPt.init(0, 0, 1);
        case 262:
          context$3$0.t11 = context$3$0.sent;
          context$3$0.t10.setColor.call(context$3$0.t10, context$3$0.t11, 3);
          context$3$0.t12 = line;
          context$3$0.next = 267;
          return PDFNet.ColorPt.init(0, 1, 0);
        case 267:
          context$3$0.t13 = context$3$0.sent;
          context$3$0.t12.setInteriorColor.call(context$3$0.t12, context$3$0.t13, 3);
          line.setShowCaption(true);
          line.setCapPos(PDFNet.LineAnnot.CapPos.e_Top);
          line.refreshAppearance();
          page.annotPushBack(line);
          context$3$0.next = 275;
          return PDFNet.LineAnnot.create(doc, new PDFNet.Rect(195, 395, 205, 505));
        case 275:
          line = context$3$0.sent;
          line.setStartPoint(new PDFNet.Point(200, 400));
          line.setEndPoint(new PDFNet.Point(200, 500));
          line.refreshAppearance();
          page.annotPushBack(line);
          context$3$0.next = 282;
          return PDFNet.LineAnnot.create(doc, new PDFNet.Rect(55, 299, 150, 301));
        case 282:
          line = context$3$0.sent;
          line.setStartPoint(new PDFNet.Point(55, 300));
          line.setEndPoint(new PDFNet.Point(155, 300));
          line.setStartStyle(PDFNet.LineAnnot.EndingStyle.e_Circle);
          line.setEndStyle(PDFNet.LineAnnot.EndingStyle.e_Circle);
          line.setContents(("Caption that's longer than its line."));
          context$3$0.t14 = line;
          context$3$0.next = 291;
          return PDFNet.ColorPt.init(1, 0, 1);
        case 291:
          context$3$0.t15 = context$3$0.sent;
          context$3$0.t14.setColor.call(context$3$0.t14, context$3$0.t15, 3);
          context$3$0.t16 = line;
          context$3$0.next = 296;
          return PDFNet.ColorPt.init(0, 1, 0);
        case 296:
          context$3$0.t17 = context$3$0.sent;
          context$3$0.t16.setInteriorColor.call(context$3$0.t16, context$3$0.t17, 3);
          line.setShowCaption(true);
          line.setCapPos(PDFNet.LineAnnot.CapPos.e_Top);
          line.refreshAppearance();
          page.annotPushBack(line);
          context$3$0.next = 304;
          return PDFNet.LineAnnot.create(doc, new PDFNet.Rect(300, 200, 390, 234));
        case 304:
          line = context$3$0.sent;
          line.setStartPoint(new PDFNet.Point(310, 210));
          line.setEndPoint(new PDFNet.Point(380, 220));
          context$3$0.t18 = line;
          context$3$0.next = 310;
          return PDFNet.ColorPt.init(0, 0, 0);
        case 310:
          context$3$0.t19 = context$3$0.sent;
          context$3$0.t18.setColor.call(context$3$0.t18, context$3$0.t19, 3);
          line.refreshAppearance();
          page.annotPushBack(line);
          context$3$0.next = 316;
          return doc.pageCreate(new PDFNet.Rect(0, 0, 600, 600));
        case 316:
          page3 = context$3$0.sent;
          // begin writing to the page
          ew.beginOnPage(page3);
          // save changes to the current page
          ew.end();
          doc.pagePushBack(page3);
          context$3$0.next = 322;
          return PDFNet.CircleAnnot.create(doc, new PDFNet.Rect(300, 300, 390, 350));
        case 322:
          circle = context$3$0.sent;
          context$3$0.t20 = circle;
          context$3$0.next = 326;
          return PDFNet.ColorPt.init(0, 0, 0);
        case 326:
          context$3$0.t21 = context$3$0.sent;
          context$3$0.t20.setColor.call(context$3$0.t20, context$3$0.t21, 3);
          circle.refreshAppearance();
          page3.annotPushBack(circle);
          context$3$0.next = 332;
          return PDFNet.CircleAnnot.create(doc, new PDFNet.Rect(100, 100, 200, 200));
        case 332:
          circle = context$3$0.sent;
          context$3$0.t22 = circle;
          context$3$0.next = 336;
          return PDFNet.ColorPt.init(0, 1, 0);
        case 336:
          context$3$0.t23 = context$3$0.sent;
          context$3$0.t22.setColor.call(context$3$0.t22, context$3$0.t23, 3);
          context$3$0.t24 = circle;
          context$3$0.next = 341;
          return PDFNet.ColorPt.init(0, 0, 1);
        case 341:
          context$3$0.t25 = context$3$0.sent;
          context$3$0.t24.setInteriorColor.call(context$3$0.t24, context$3$0.t25, 3);
          dash = [2, 4];
          context$3$0.t26 = circle;
          context$3$0.next = 347;
          return PDFNet.AnnotBorderStyle.createWithDashPattern(PDFNet.AnnotBorderStyle.Style.e_dashed, 3, 0, 0, dash);
        case 347:
          context$3$0.t27 = context$3$0.sent;
          context$3$0.t26.setBorderStyle.call(context$3$0.t26, context$3$0.t27);
          circle.setPadding(new PDFNet.Rect(2, 2, 2, 2));
          circle.refreshAppearance();
          page3.annotPushBack(circle);
          context$3$0.next = 354;
          return PDFNet.SquareAnnot.create(doc, new PDFNet.Rect(10, 200, 80, 300));
        case 354:
          sq = context$3$0.sent;
          context$3$0.t28 = sq;
          context$3$0.next = 358;
          return PDFNet.ColorPt.init(0, 0, 0);
        case 358:
          context$3$0.t29 = context$3$0.sent;
          context$3$0.t28.setColor.call(context$3$0.t28, context$3$0.t29, 3);
          sq.refreshAppearance();
          page3.annotPushBack(sq);
          context$3$0.next = 364;
          return PDFNet.SquareAnnot.create(doc, new PDFNet.Rect(500, 200, 580, 300));
        case 364:
          sq = context$3$0.sent;
          context$3$0.t30 = sq;
          context$3$0.next = 368;
          return PDFNet.ColorPt.init(1, 0, 0);
        case 368:
          context$3$0.t31 = context$3$0.sent;
          context$3$0.t30.setColor.call(context$3$0.t30, context$3$0.t31, 3);
          context$3$0.t32 = sq;
          context$3$0.next = 373;
          return PDFNet.ColorPt.init(0, 1, 1);
        case 373:
          context$3$0.t33 = context$3$0.sent;
          context$3$0.t32.setInteriorColor.call(context$3$0.t32, context$3$0.t33, 3);
          dash = [4, 2];
          context$3$0.t34 = sq;
          context$3$0.next = 379;
          return PDFNet.AnnotBorderStyle.createWithDashPattern(PDFNet.AnnotBorderStyle.Style.e_dashed, 6, 0, 0, dash);
        case 379:
          context$3$0.t35 = context$3$0.sent;
          context$3$0.t34.setBorderStyle.call(context$3$0.t34, context$3$0.t35);
          sq.setPadding(new PDFNet.Rect(4, 4, 4, 4));
          sq.refreshAppearance();
          page3.annotPushBack(sq);
          context$3$0.next = 386;
          return PDFNet.PolygonAnnot.create(doc, new PDFNet.Rect(5, 500, 125, 590));
        case 386:
          poly = context$3$0.sent;
          context$3$0.t36 = poly;
          context$3$0.next = 390;
          return PDFNet.ColorPt.init(1, 0, 0);
        case 390:
          context$3$0.t37 = context$3$0.sent;
          context$3$0.t36.setColor.call(context$3$0.t36, context$3$0.t37, 3);
          context$3$0.t38 = poly;
          context$3$0.next = 395;
          return PDFNet.ColorPt.init(1, 1, 0);
        case 395:
          context$3$0.t39 = context$3$0.sent;
          context$3$0.t38.setInteriorColor.call(context$3$0.t38, context$3$0.t39, 3);
          poly.setVertex(0, new PDFNet.Point(12, 510));
          poly.setVertex(1, new PDFNet.Point(100, 510));
          poly.setVertex(2, new PDFNet.Point(100, 555));
          poly.setVertex(3, new PDFNet.Point(35, 544));
          context$3$0.next = 403;
          return PDFNet.AnnotBorderStyle.create(PDFNet.AnnotBorderStyle.Style.e_solid, 4, 0, 0);
        case 403:
          solidBorderStyle = context$3$0.sent;
          poly.setBorderStyle(solidBorderStyle);
          poly.setPadding(new PDFNet.Rect(4, 4, 4, 4));
          poly.refreshAppearance();
          page3.annotPushBack(poly);
          context$3$0.next = 410;
          return PDFNet.PolyLineAnnot.create(doc, new PDFNet.Rect(400, 10, 500, 90));
        case 410:
          poly = context$3$0.sent;
          context$3$0.t40 = poly;
          context$3$0.next = 414;
          return PDFNet.ColorPt.init(1, 0, 0);
        case 414:
          context$3$0.t41 = context$3$0.sent;
          context$3$0.t40.setColor.call(context$3$0.t40, context$3$0.t41, 3);
          context$3$0.t42 = poly;
          context$3$0.next = 419;
          return PDFNet.ColorPt.init(0, 1, 0);
        case 419:
          context$3$0.t43 = context$3$0.sent;
          context$3$0.t42.setInteriorColor.call(context$3$0.t42, context$3$0.t43, 3);
          poly.setVertex(0, new PDFNet.Point(405, 20));
          poly.setVertex(1, new PDFNet.Point(440, 40));
          poly.setVertex(2, new PDFNet.Point(410, 60));
          poly.setVertex(3, new PDFNet.Point(470, 80));
          context$3$0.t44 = poly;
          context$3$0.next = 428;
          return PDFNet.AnnotBorderStyle.create(PDFNet.AnnotBorderStyle.Style.e_solid, 2, 0, 0);
        case 428:
          context$3$0.t45 = context$3$0.sent;
          context$3$0.t44.setBorderStyle.call(context$3$0.t44, context$3$0.t45);
          poly.setPadding(new PDFNet.Rect(4, 4, 4, 4));
          poly.setStartStyle(PDFNet.LineAnnot.EndingStyle.e_RClosedArrow);
          poly.setEndStyle(PDFNet.LineAnnot.EndingStyle.e_ClosedArrow);
          poly.refreshAppearance();
          page3.annotPushBack(poly);
          context$3$0.next = 437;
          return PDFNet.LinkAnnot.create(doc, new PDFNet.Rect(5, 5, 55, 24));
        case 437:
          lk = context$3$0.sent;
          // lk.setColor(yield PDFNet.ColorPt.init(0,1,0), 3 );
          lk.refreshAppearance();
          page3.annotPushBack(lk);
          context$3$0.next = 442;
          return doc.pageCreate(new PDFNet.Rect(0, 0, 600, 600));
        case 442:
          page4 = context$3$0.sent;
          // begin writing to the page
          ew.beginOnPage(page4);
          // save changes to the current page
          ew.end();
          doc.pagePushBack(page4);

          ew.beginOnPage(page4);
          context$3$0.next = 449;
          return PDFNet.Font.create(doc, PDFNet.Font.StandardType1Font.e_helvetica);
        case 449:
          font = context$3$0.sent;
          context$3$0.next = 452;
          return eb.createTextBeginWithFont(font, 16);
        case 452:
          element = context$3$0.sent;
          element.setPathFill(true);
          ew.writeElement(element);
          context$3$0.next = 457;
          return eb.createTextRun('Some random text on the page', font, 16);
        case 457:
          element = context$3$0.sent;
          element.setTextMatrixEntries(1, 0, 0, 1, 100, 500);
          ew.writeElement(element);
          context$3$0.t46 = ew;
          context$3$0.next = 463;
          return eb.createTextEnd();
        case 463:
          context$3$0.t47 = context$3$0.sent;
          context$3$0.t46.writeElement.call(context$3$0.t46, context$3$0.t47);
          ew.end();
          context$3$0.next = 468;
          return PDFNet.HighlightAnnot.create(doc, new PDFNet.Rect(100, 490, 150, 515));
        case 468:
          hl = context$3$0.sent;
          context$3$0.t48 = hl;
          context$3$0.next = 472;
          return PDFNet.ColorPt.init(0, 1, 0);
        case 472:
          context$3$0.t49 = context$3$0.sent;
          context$3$0.t48.setColor.call(context$3$0.t48, context$3$0.t49, 3);
          hl.refreshAppearance();
          page4.annotPushBack(hl);
          context$3$0.next = 478;
          return PDFNet.SquigglyAnnot.create(doc, new PDFNet.Rect(100, 450, 250, 600));
        case 478:
          sq = context$3$0.sent;
          // sq.setColor(yield PDFNet.ColorPt.init(1,0,0), 3 );
          sq.setQuadPoint(0, PDFNet.QuadPoint(122, 455, 240, 545, 230, 595, 101, 500));
          sq.refreshAppearance();
          page4.annotPushBack(sq);
          context$3$0.next = 484;
          return PDFNet.CaretAnnot.create(doc, new PDFNet.Rect(100, 40, 129, 69));
        case 484:
          cr = context$3$0.sent;
          context$3$0.t50 = cr;
          context$3$0.next = 488;
          return PDFNet.ColorPt.init(0, 0, 1);
        case 488:
          context$3$0.t51 = context$3$0.sent;
          context$3$0.t50.setColor.call(context$3$0.t50, context$3$0.t51, 3);
          cr.setSymbol('P');
          cr.refreshAppearance();
          page4.annotPushBack(cr);
          context$3$0.next = 495;
          return doc.pageCreate(new PDFNet.Rect(0, 0, 600, 600));
        case 495:
          page5 = context$3$0.sent;
          // begin writing to the page
          ew.beginOnPage(page5);
          // save changes to the current page
          ew.end();
          doc.pagePushBack(page5);
          context$3$0.next = 501;
          return PDFNet.FileSpec.create(doc, '../TestFiles/butterfly.png', false);
        case 501:
          fs = context$3$0.sent;
          context$3$0.next = 504;
          return doc.pageCreate(new PDFNet.Rect(0, 0, 600, 600));
        case 504:
          page6 = context$3$0.sent;
          // begin writing to the page
          ew.beginOnPage(page6);
          // save changes to the current page
          ew.end();
          doc.pagePushBack(page6);

          ipage = 0;
        case 509:
          if (!(ipage < 2)) {
            context$3$0.next = 549;
            break;
          }

          iann = 0;
        case 511:
          if (!(iann < 100)) {
            context$3$0.next = 546;
            break;
          }

          if (iann > PDFNet.FileAttachmentAnnot.Icon.e_Tag) {
            context$3$0.next = 524;
            break;
          }

          context$3$0.next = 515;
          return PDFNet.FileAttachmentAnnot.createWithFileSpec(doc, new PDFNet.Rect(50 + 50 * iann, 100, 70 + 50 * iann, 120), fs, iann);
        case 515:
          fa = context$3$0.sent;

          if (!ipage) {
            context$3$0.next = 522;
            break;
          }

          context$3$0.t52 = fa;
          context$3$0.next = 520;
          return PDFNet.ColorPt.init(1, 1, 0);
        case 520:
          context$3$0.t53 = context$3$0.sent;
          context$3$0.t52.setColor.call(context$3$0.t52, context$3$0.t53);
        case 522:
          fa.refreshAppearance();
          if (ipage === 0) {
            page5.annotPushBack(fa);
          } else {
            page6.annotPushBack(fa);
          }
        case 524:
          if (!(iann > PDFNet.TextAnnot.Icon.e_Note)) {
            context$3$0.next = 526;
            break;
          }

          return context$3$0.abrupt("break", 546);
        case 526:
          context$3$0.next = 528;
          return PDFNet.TextAnnot.create(doc, new PDFNet.Rect(10 + iann * 50, 200, 30 + iann * 50, 220));
        case 528:
          txt = context$3$0.sent;
          txt.setIcon(iann);
          context$3$0.t54 = txt;
          context$3$0.next = 533;
          return txt.getIconName();
        case 533:
          context$3$0.t55 = context$3$0.sent;
          context$3$0.t54.setContents.call(context$3$0.t54, context$3$0.t55);

          if (!ipage) {
            context$3$0.next = 541;
            break;
          }

          context$3$0.t56 = txt;
          context$3$0.next = 539;
          return PDFNet.ColorPt.init(1, 1, 0);
        case 539:
          context$3$0.t57 = context$3$0.sent;
          context$3$0.t56.setColor.call(context$3$0.t56, context$3$0.t57);
        case 541:
          txt.refreshAppearance();
          if (ipage === 0) {
            page5.annotPushBack(txt);
          } else {
            page6.annotPushBack(txt);
          }
        case 543:
          iann++;
          context$3$0.next = 511;
          break;
        case 546:
          ++ipage;
          context$3$0.next = 509;
          break;
        case 549:
          context$3$0.next = 551;
          return PDFNet.TextAnnot.create(doc, new PDFNet.Rect(10, 20, 30, 40));
        case 551:
          txt = context$3$0.sent;
          txt.setIconName('UserIcon');
          txt.setContents('User defined icon, unrecognized by appearance generator');
          context$3$0.t58 = txt;
          context$3$0.next = 557;
          return PDFNet.ColorPt.init(0, 1, 0);
        case 557:
          context$3$0.t59 = context$3$0.sent;
          context$3$0.t58.setColor.call(context$3$0.t58, context$3$0.t59);
          txt.refreshAppearance();
          page6.annotPushBack(txt);
          context$3$0.next = 563;
          return PDFNet.InkAnnot.create(doc, new PDFNet.Rect(100, 400, 200, 550));
        case 563:
          ink = context$3$0.sent;
          context$3$0.t60 = ink;
          context$3$0.next = 567;
          return PDFNet.ColorPt.init(0, 0, 1);
        case 567:
          context$3$0.t61 = context$3$0.sent;
          context$3$0.t60.setColor.call(context$3$0.t60, context$3$0.t61);
          ink.setPoint(1, 3, new PDFNet.Point(220, 505));
          ink.setPoint(1, 0, new PDFNet.Point(100, 490));
          ink.setPoint(0, 1, new PDFNet.Point(120, 410));
          ink.setPoint(0, 0, new PDFNet.Point(100, 400));
          ink.setPoint(1, 2, new PDFNet.Point(180, 490));
          ink.setPoint(1, 1, new PDFNet.Point(140, 440));
          context$3$0.t62 = ink;
          context$3$0.next = 578;
          return PDFNet.AnnotBorderStyle.create(PDFNet.AnnotBorderStyle.Style.e_solid, 3, 0, 0);
        case 578:
          context$3$0.t63 = context$3$0.sent;
          context$3$0.t62.setBorderStyle.call(context$3$0.t62, context$3$0.t63);
          ink.refreshAppearance();
          page6.annotPushBack(ink);
          context$3$0.next = 584;
          return doc.pageCreate(new PDFNet.Rect(0, 0, 600, 600));
        case 584:
          page7 = context$3$0.sent;
          // begin writing to the page
          ew.beginOnPage(page7);
          // save changes to the current page
          ew.end();
          doc.pagePushBack(page7);

          context$3$0.next = 590;
          return PDFNet.SoundAnnot.create(doc, new PDFNet.Rect(100, 500, 120, 520));
        case 590:
          snd = context$3$0.sent;
          context$3$0.t64 = snd;
          context$3$0.next = 594;
          return PDFNet.ColorPt.init(1, 1, 0);
        case 594:
          context$3$0.t65 = context$3$0.sent;
          context$3$0.t64.setColor.call(context$3$0.t64, context$3$0.t65);
          snd.setIcon(PDFNet.SoundAnnot.Icon.e_Speaker);
          snd.refreshAppearance();
          page7.annotPushBack(snd);
          context$3$0.next = 601;
          return PDFNet.SoundAnnot.create(doc, new PDFNet.Rect(200, 500, 220, 520));
        case 601:
          snd = context$3$0.sent;
          context$3$0.t66 = snd;
          context$3$0.next = 605;
          return PDFNet.ColorPt.init(1, 1, 0);
        case 605:
          context$3$0.t67 = context$3$0.sent;
          context$3$0.t66.setColor.call(context$3$0.t66, context$3$0.t67);
          snd.setIcon(PDFNet.SoundAnnot.Icon.e_Mic);
          snd.refreshAppearance();
          page7.annotPushBack(snd);
          context$3$0.next = 612;
          return doc.pageCreate(new PDFNet.Rect(0, 0, 600, 600));
        case 612:
          page8 = context$3$0.sent;
          // begin writing to the page
          ew.beginOnPage(page8);
          // save changes to the current page
          ew.end();
          doc.pagePushBack(page8);

          ipage = 0;
        case 617:
          if (!(ipage < 2)) {
            context$3$0.next = 641;
            break;
          }

          px = 5;
          py = 520;
          istamp = PDFNet.RubberStampAnnot.Icon.e_Approved;
        case 621:
          if (!(istamp <= PDFNet.RubberStampAnnot.Icon.e_Draft)) {
            context$3$0.next = 638;
            break;
          }

          context$3$0.next = 624;
          return PDFNet.RubberStampAnnot.create(doc, new PDFNet.Rect(1, 1, 100, 100));
        case 624:
          st = context$3$0.sent;
          st.setIcon(istamp);
          context$3$0.t68 = st;
          context$3$0.next = 629;
          return st.getIconName();
        case 629:
          context$3$0.t69 = context$3$0.sent;
          context$3$0.t68.setContents.call(context$3$0.t68, context$3$0.t69);
          st.setRect(new PDFNet.Rect(px, py, px + 100, py + 25));
          py -= 100;
          if (py < 0) {
            py = 520;
            px += 200;
          }
          if (ipage === 0) {
            // page7.annotPushBack( st );
          } else {
            page8.annotPushBack(st);
            st.refreshAppearance();
          }
        case 635:
          istamp++;
          context$3$0.next = 621;
          break;
        case 638:
          ++ipage;
          context$3$0.next = 617;
          break;
        case 641:
          context$3$0.next = 643;
          return PDFNet.RubberStampAnnot.create(doc, new PDFNet.Rect(400, 5, 550, 45));
        case 643:
          st = context$3$0.sent;
          st.setIconName('UserStamp');
          st.setContents('User defined stamp');
          page8.annotPushBack(st);
          st.refreshAppearance();

          context$3$0.next = 650;
          return PDFNet.endDeallocateStack();
        case 650:
        case "end":
          return context$3$0.stop();
        }
      }, marked2$0[2], this);
    }

    function main() {
      var ret, input_path, doc, docbuf, first_page, docbuf2, docnew, doc1buf;

      return regeneratorRuntime.wrap(function main$(context$3$0) {
        while (1) switch (context$3$0.prev = context$3$0.next) {
        case 0:
          context$3$0.prev = 0;
          console.log('Beginning Annotation Test. This test will add different annotations to PDF documents.');
          ret = 0;
          input_path = '../TestFiles/';
          context$3$0.next = 6;
          return PDFNet.PDFDoc.createFromURL(input_path + 'numbered.pdf');
        case 6:
          doc = context$3$0.sent;
          doc.initSecurityHandler();
          doc.lock();

          console.log('PDFNet and PDF document initialized and locked');

          return context$3$0.delegateYield(AnnotationLowLevelAPI(doc), "t0", 11);
        case 11:
          context$3$0.next = 13;
          return doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
        case 13:
          docbuf = context$3$0.sent;
          saveBufferAsPDFDoc(docbuf, 'annotation_testLowLevel.pdf');

          context$3$0.next = 17;
          return doc.getPage(1);
        case 17:
          first_page = context$3$0.sent;
          return context$3$0.delegateYield(AnnotationHighLevelAPI(doc), "t1", 19);
        case 19:
          context$3$0.next = 21;
          return doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
        case 21:
          docbuf2 = context$3$0.sent;
          saveBufferAsPDFDoc(docbuf2, 'annotation_testHighLevel.pdf');

          context$3$0.next = 25;
          return PDFNet.PDFDoc.create();
        case 25:
          docnew = context$3$0.sent;
          docnew.lock();
          return context$3$0.delegateYield(CreateTestAnnots(docnew), "t2", 28);
        case 28:
          context$3$0.next = 30;
          return docnew.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
        case 30:
          doc1buf = context$3$0.sent;
          saveBufferAsPDFDoc(doc1buf, 'new_annot_test_api.pdf');
          console.log('Done.');
          return context$3$0.abrupt("return", ret);
        case 36:
          context$3$0.prev = 36;
          context$3$0.t3 = context$3$0["catch"](0);
          console.log(context$3$0.t3);
        case 39:
        case "end":
          return context$3$0.stop();
        }
      }, marked2$0[3], this, [[0, 36]]);
    }
    // start the generator
    // replace with your own license key and remove the samples-key.js script tag
    PDFNet.runGeneratorWithCleanup(main(), window.sampleL);
  };
})(window);