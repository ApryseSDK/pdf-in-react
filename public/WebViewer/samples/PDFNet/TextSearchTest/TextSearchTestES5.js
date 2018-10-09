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
//# sourceURL=TextSearchTest.js
(function(exports) {
  'use strict';

  exports.runTextSearchTest = function() {
    var marked2$0 = [main].map(regeneratorRuntime.mark);
    function main() {
      var input_url, input_filename, doc, txt_search, mode, pattern, step, result, hlts, highlightPageNum, cur_page, quad_arr, i, currQuad, x1, x2, y1, y2, hyper_link, docBuffer;

      return regeneratorRuntime.wrap(function main$(context$3$0) {
        while (1) switch (context$3$0.prev = context$3$0.next) {
        case 0:
          console.log('Beginning Test');

          input_url = '../TestFiles/';
          input_filename = 'credit card numbers.pdf';
          context$3$0.prev = 3;
          context$3$0.next = 6;
          return PDFNet.PDFDoc.createFromURL(input_url + input_filename);
        case 6:
          doc = context$3$0.sent;
          doc.initSecurityHandler();
          doc.lock();

          context$3$0.next = 11;
          return PDFNet.TextSearch.create();
        case 11:
          txt_search = context$3$0.sent;
          mode = PDFNet.TextSearch.Mode.e_whole_word + PDFNet.TextSearch.Mode.e_page_stop;
          pattern = 'joHn sMiTh';

          // searches for the "pattern" in the document while following the inputted modes.
          txt_search.begin(doc, pattern, mode);

          step = 0;
        case 16:
          if (!true) {
            context$3$0.next = 129;
            break;
          }

          context$3$0.next = 19;
          return txt_search.run();
        case 19:
          result = context$3$0.sent;

          if (!result) {
            context$3$0.next = 119;
            break;
          }

          if (!(step === 0)) {
            context$3$0.next = 33;
            break;
          }

          // Step 0: found "John Smith"
          // note that, here, 'ambient_str' and 'highlights' are not written to,
          // as 'e_ambient_string' and 'e_highlight' are not set.
          console.log(result.out_str + "'s credit card number is: ");

          context$3$0.next = 25;
          return txt_search.getMode();
        case 25:
          mode = context$3$0.sent;
          mode += PDFNet.TextSearch.Mode.e_reg_expression + PDFNet.TextSearch.Mode.e_highlight;
          txt_search.setMode(mode);
          // or "(\\d{4}-){3}\\d{4}"
          pattern = '\\d{4}-\\d{4}-\\d{4}-\\d{4}';
          txt_search.setPattern(pattern);

          ++step;
          context$3$0.next = 117;
          break;
        case 33:
          if (!(step === 1)) {
            context$3$0.next = 53;
            break;
          }

          // step 1: found John's credit card number
          console.log(' ' + result.out_str);
          // note that, here, 'hlts' is written to, as 'e_highlight' has been set.
          // output the highlight info of the credit card number.
          hlts = result.highlights;
          hlts.begin(doc);
        case 37:
          context$3$0.next = 39;
          return hlts.hasNext();
        case 39:
          if (!context$3$0.sent) {
            context$3$0.next = 48;
            break;
          }

          context$3$0.next = 42;
          return hlts.getCurrentPageNumber();
        case 42:
          highlightPageNum = context$3$0.sent;
          console.log('The current highlight is from page: ' + highlightPageNum);
          context$3$0.next = 46;
          return hlts.next();
        case 46:
          context$3$0.next = 37;
          break;
        case 48:
          // see if there is an AMEX card number
          pattern = '\\d{4}-\\d{6}-\\d{5}';
          txt_search.setPattern(pattern);

          ++step;
          context$3$0.next = 117;
          break;
        case 53:
          if (!(step === 2)) {
            context$3$0.next = 65;
            break;
          }

          // found an AMEX card number
          console.log('There is an AMEX card number: ' + result.out_str);

          context$3$0.next = 57;
          return txt_search.getMode();
        case 57:
          mode = context$3$0.sent;
          mode += PDFNet.TextSearch.Mode.e_search_up;
          txt_search.setMode(mode);
          pattern = '[A-z]++ [A-z]++';
          txt_search.setPattern(pattern);

          ++step;
          context$3$0.next = 117;
          break;
        case 65:
          if (!(step === 3)) {
            context$3$0.next = 117;
            break;
          }

          // found the owner's name of the AMEX card
          console.log("Is the owner's name: " + result.out_str + '?');

          // add a link annotation based on the location of the found instance
          hlts = result.highlights;
          context$3$0.next = 70;
          return hlts.begin(doc);
        case 70:
          context$3$0.next = 72;
          return hlts.hasNext();
        case 72:
          if (!context$3$0.sent) {
            context$3$0.next = 112;
            break;
          }

          context$3$0.t0 = doc;
          context$3$0.next = 76;
          return hlts.getCurrentPageNumber();
        case 76:
          context$3$0.t1 = context$3$0.sent;
          context$3$0.next = 79;
          return context$3$0.t0.getPage.call(context$3$0.t0, context$3$0.t1);
        case 79:
          cur_page = context$3$0.sent;
          context$3$0.next = 82;
          return hlts.getCurrentQuads();
        case 82:
          quad_arr = context$3$0.sent;
          i = 0;
        case 84:
          if (!(i < quad_arr.length)) {
            context$3$0.next = 109;
            break;
          }

          currQuad = quad_arr[i];
          x1 = Math.min(Math.min(Math.min(currQuad.p1x, currQuad.p2x), currQuad.p3x), currQuad.p4x);
          x2 = Math.max(Math.max(Math.max(currQuad.p1x, currQuad.p2x), currQuad.p3x), currQuad.p4x);
          y1 = Math.min(Math.min(Math.min(currQuad.p1y, currQuad.p2y), currQuad.p3y), currQuad.p4y);
          y2 = Math.max(Math.max(Math.max(currQuad.p1y, currQuad.p2y), currQuad.p3y), currQuad.p4y);
          context$3$0.t2 = PDFNet.LinkAnnot;
          context$3$0.t3 = doc;
          context$3$0.next = 94;
          return PDFNet.Rect.init(x1, y1, x2, y2);
        case 94:
          context$3$0.t4 = context$3$0.sent;
          context$3$0.next = 97;
          return context$3$0.t2.create.call(context$3$0.t2, context$3$0.t3, context$3$0.t4);
        case 97:
          hyper_link = context$3$0.sent;
          context$3$0.t5 = hyper_link;
          context$3$0.next = 101;
          return PDFNet.Action.createURI(doc, 'http://www.pdftron.com');
        case 101:
          context$3$0.t6 = context$3$0.sent;
          context$3$0.next = 104;
          return context$3$0.t5.setAction.call(context$3$0.t5, context$3$0.t6);
        case 104:
          context$3$0.next = 106;
          return cur_page.annotPushBack(hyper_link);
        case 106:
          ++i;
          context$3$0.next = 84;
          break;
        case 109:
          hlts.next();
          context$3$0.next = 70;
          break;
        case 112:
          context$3$0.next = 114;
          return doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
        case 114:
          docBuffer = context$3$0.sent;
          saveBufferAsPDFDoc(docBuffer, 'credit card numbers_linked.pdf');
          return context$3$0.abrupt("break", 129);
        case 117:
          context$3$0.next = 127;
          break;
        case 119:
          context$3$0.next = 121;
          return result.isPageEnd();
        case 121:
          if (!context$3$0.sent) {
            context$3$0.next = 125;
            break;
          }

          // you can update your UI here, if needed
          console.log('page end');
          context$3$0.next = 127;
          break;
        case 125:
          if (!result.isDocEnd()) {
            context$3$0.next = 127;
            break;
          }

          return context$3$0.abrupt("break", 129);
        case 127:
          context$3$0.next = 16;
          break;
        case 129:
          context$3$0.next = 134;
          break;
        case 131:
          context$3$0.prev = 131;
          context$3$0.t7 = context$3$0["catch"](3);
          console.log(context$3$0.t7);
        case 134:
        case "end":
          return context$3$0.stop();
        }
      }, marked2$0[0], this, [[3, 131]]);
    }
    // start the generator
    // replace with your own license key and remove the samples-key.js script tag
    PDFNet.runGeneratorWithCleanup(main(), window.sampleL);
  };
})(window);