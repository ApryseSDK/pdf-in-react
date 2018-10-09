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
//# sourceURL=BookmarkTest.js
(function(exports) {
  'use strict';

  exports.runBookmarkTest = function() {
    var marked2$0 = [addIndent, printOutlineTree, main].map(regeneratorRuntime.mark);
    function addIndent(item, str) {
      var ident, i;

      return regeneratorRuntime.wrap(function addIndent$(context$3$0) {
        while (1) switch (context$3$0.prev = context$3$0.next) {
        case 0:
          context$3$0.next = 2;
          return item.getIndent();
        case 2:
          context$3$0.t0 = context$3$0.sent;
          ident = context$3$0.t0 - 1;
          for (i = 0; i < ident; ++i) {
            str += '  ';
            // note: must manually set IndentString to empty after this function is called.
          }
          return context$3$0.abrupt("return", str);
        case 6:
        case "end":
          return context$3$0.stop();
        }
      }, marked2$0[0], this);
    }

    function printOutlineTree(item) {
      var IndentString, ActionString, TitleString, action, actionType, dest, page;

      return regeneratorRuntime.wrap(function printOutlineTree$(context$3$0) {
        while (1) switch (context$3$0.prev = context$3$0.next) {
        case 0:
          if (!(item != null)) {
            context$3$0.next = 66;
            break;
          }

          IndentString = '';
          ActionString = '';
          TitleString = '';
          return context$3$0.delegateYield(addIndent(item, IndentString), "t0", 5);
        case 5:
          IndentString = context$3$0.t0;
          context$3$0.next = 8;
          return item.getTitle();
        case 8:
          TitleString = context$3$0.sent;
          context$3$0.t1 = IndentString;
          context$3$0.next = 12;
          return item.isOpen();
        case 12:
          context$3$0.t2 = context$3$0.sent;

          if (!(context$3$0.t1 + context$3$0.t2)) {
            context$3$0.next = 17;
            break;
          }

          context$3$0.t3 = '- ';
          context$3$0.next = 18;
          break;
        case 17:
          context$3$0.t3 = '+ ';
        case 18:
          context$3$0.t4 = context$3$0.t3;
          context$3$0.t5 = TitleString;
          context$3$0.t6 = context$3$0.t4 + context$3$0.t5;
          ActionString = context$3$0.t6 + ' Action -> ';
          context$3$0.next = 24;
          return item.getAction();
        case 24:
          action = context$3$0.sent;
          context$3$0.next = 27;
          return action.isValid();
        case 27:
          if (!context$3$0.sent) {
            context$3$0.next = 53;
            break;
          }

          context$3$0.next = 30;
          return action.getType();
        case 30:
          actionType = context$3$0.sent;

          if (!(actionType === PDFNet.Action.Type.e_GoTo)) {
            context$3$0.next = 50;
            break;
          }

          context$3$0.next = 34;
          return action.getDest();
        case 34:
          dest = context$3$0.sent;
          context$3$0.next = 37;
          return dest.isValid();
        case 37:
          if (!context$3$0.sent) {
            context$3$0.next = 48;
            break;
          }

          context$3$0.next = 40;
          return dest.getPage();
        case 40:
          page = context$3$0.sent;
          context$3$0.t7 = console;
          context$3$0.t8 = ActionString + 'GoTo Page # ';
          context$3$0.next = 45;
          return page.getIndex();
        case 45:
          context$3$0.t9 = context$3$0.sent;
          context$3$0.t10 = context$3$0.t8 + context$3$0.t9;
          context$3$0.t7.log.call(context$3$0.t7, context$3$0.t10);
        case 48:
          context$3$0.next = 51;
          break;
        case 50:
          console.log(ActionString + "Not a 'GoTo' action");
        case 51:
          context$3$0.next = 54;
          break;
        case 53:
          console.log(ActionString + 'NULL');
        case 54:
          context$3$0.next = 56;
          return item.hasChildren();
        case 56:
          if (!context$3$0.sent) {
            context$3$0.next = 61;
            break;
          }

          context$3$0.next = 59;
          return item.getFirstChild();
        case 59:
          context$3$0.t11 = context$3$0.sent;
          return context$3$0.delegateYield(printOutlineTree(context$3$0.t11), "t12", 61);
        case 61:
          context$3$0.next = 63;
          return item.getNext();
        case 63:
          item = context$3$0.sent;
          context$3$0.next = 0;
          break;
        case 66:
        case "end":
          return context$3$0.stop();
        }
      }, marked2$0[1], this);
    }

    function main() {
      var ret, input_path, doc, red, green, blue, red_iter, red_currpage, red_currpageActual, red_dest, tenthPage, green_dest, key, nineteenthPage, blue_dest, blue_action, sub_red1, sub_red2, sub_red3, sub_red4, sub_red5, sub_red6, firstbookmark, foo, bar, bookmarkBuffer, docOut, root, file_spec, spec, goto_remote, remoteBookmark1, remoteBookmark2, gotoR, dest, docbuf;

      return regeneratorRuntime.wrap(function main$(context$3$0) {
        while (1) switch (context$3$0.prev = context$3$0.next) {
        case 0:
          console.log('Beginning Test');
          ret = 0;
          input_path = '../TestFiles/';
          context$3$0.next = 5;
          return PDFNet.PDFDoc.createFromURL(input_path + 'numbered.pdf');
        case 5:
          doc = context$3$0.sent;
          doc.initSecurityHandler();
          doc.lock();
          console.log('PDFNet and PDF document initialized and locked');

          context$3$0.next = 11;
          return PDFNet.Bookmark.create(doc, 'Red');
        case 11:
          red = context$3$0.sent;
          context$3$0.next = 14;
          return PDFNet.Bookmark.create(doc, 'Green');
        case 14:
          green = context$3$0.sent;
          context$3$0.next = 17;
          return PDFNet.Bookmark.create(doc, 'Blue');
        case 17:
          blue = context$3$0.sent;

          doc.addRootBookmark(red);
          doc.addRootBookmark(green);
          doc.addRootBookmark(blue);

          // You can also add new root bookmarks using Bookmark.addNext("...")
          blue.addNewNext('foo');
          blue.addNewNext('bar');

          context$3$0.next = 25;
          return doc.getPageIterator(1);
        case 25:
          red_iter = context$3$0.sent;
          context$3$0.next = 28;
          return red_iter.current();
        case 28:
          red_currpage = context$3$0.sent;
          context$3$0.next = 31;
          return doc.getPage(1);
        case 31:
          red_currpageActual = context$3$0.sent;
          context$3$0.next = 34;
          return PDFNet.Destination.createFit(red_currpage);
        case 34:
          red_dest = context$3$0.sent;
          context$3$0.t0 = red;
          context$3$0.next = 38;
          return PDFNet.Action.createGoto(red_dest);
        case 38:
          context$3$0.t1 = context$3$0.sent;
          context$3$0.t0.setAction.call(context$3$0.t0, context$3$0.t1);
          context$3$0.next = 42;
          return doc.getPage(10);
        case 42:
          tenthPage = context$3$0.sent;
          context$3$0.next = 45;
          return PDFNet.Destination.createFit(tenthPage);
        case 45:
          green_dest = context$3$0.sent;
          context$3$0.t2 = green;
          context$3$0.next = 49;
          return PDFNet.Action.createGoto(green_dest);
        case 49:
          context$3$0.t3 = context$3$0.sent;
          context$3$0.t2.setAction.call(context$3$0.t2, context$3$0.t3);
          key = 'blue1';
          context$3$0.next = 54;
          return doc.getPage(19);
        case 54:
          nineteenthPage = context$3$0.sent;
          context$3$0.next = 57;
          return PDFNet.Destination.createFit(nineteenthPage);
        case 57:
          blue_dest = context$3$0.sent;
          context$3$0.next = 60;
          return PDFNet.Action.createGotoWithKey(key, blue_dest);
        case 60:
          blue_action = context$3$0.sent;

          blue.setAction(blue_action);

          context$3$0.next = 64;
          return red.addNewChild('Red - Page 1');
        case 64:
          sub_red1 = context$3$0.sent;
          context$3$0.t4 = sub_red1;
          context$3$0.t5 = PDFNet.Action;
          context$3$0.t6 = PDFNet.Destination;
          context$3$0.next = 70;
          return doc.getPage(1);
        case 70:
          context$3$0.t7 = context$3$0.sent;
          context$3$0.next = 73;
          return context$3$0.t6.createFit.call(context$3$0.t6, context$3$0.t7);
        case 73:
          context$3$0.t8 = context$3$0.sent;
          context$3$0.next = 76;
          return context$3$0.t5.createGoto.call(context$3$0.t5, context$3$0.t8);
        case 76:
          context$3$0.t9 = context$3$0.sent;
          context$3$0.t4.setAction.call(context$3$0.t4, context$3$0.t9);
          context$3$0.next = 80;
          return red.addNewChild('Red - Page 2');
        case 80:
          sub_red2 = context$3$0.sent;
          context$3$0.t10 = sub_red2;
          context$3$0.t11 = PDFNet.Action;
          context$3$0.t12 = PDFNet.Destination;
          context$3$0.next = 86;
          return doc.getPage(2);
        case 86:
          context$3$0.t13 = context$3$0.sent;
          context$3$0.next = 89;
          return context$3$0.t12.createFit.call(context$3$0.t12, context$3$0.t13);
        case 89:
          context$3$0.t14 = context$3$0.sent;
          context$3$0.next = 92;
          return context$3$0.t11.createGoto.call(context$3$0.t11, context$3$0.t14);
        case 92:
          context$3$0.t15 = context$3$0.sent;
          context$3$0.t10.setAction.call(context$3$0.t10, context$3$0.t15);
          context$3$0.next = 96;
          return red.addNewChild('Red - Page 3');
        case 96:
          sub_red3 = context$3$0.sent;
          context$3$0.t16 = sub_red3;
          context$3$0.t17 = PDFNet.Action;
          context$3$0.t18 = PDFNet.Destination;
          context$3$0.next = 102;
          return doc.getPage(3);
        case 102:
          context$3$0.t19 = context$3$0.sent;
          context$3$0.next = 105;
          return context$3$0.t18.createFit.call(context$3$0.t18, context$3$0.t19);
        case 105:
          context$3$0.t20 = context$3$0.sent;
          context$3$0.next = 108;
          return context$3$0.t17.createGoto.call(context$3$0.t17, context$3$0.t20);
        case 108:
          context$3$0.t21 = context$3$0.sent;
          context$3$0.t16.setAction.call(context$3$0.t16, context$3$0.t21);
          context$3$0.next = 112;
          return sub_red3.addNewChild('Red - Page 4');
        case 112:
          sub_red4 = context$3$0.sent;
          context$3$0.t22 = sub_red4;
          context$3$0.t23 = PDFNet.Action;
          context$3$0.t24 = PDFNet.Destination;
          context$3$0.next = 118;
          return doc.getPage(4);
        case 118:
          context$3$0.t25 = context$3$0.sent;
          context$3$0.next = 121;
          return context$3$0.t24.createFit.call(context$3$0.t24, context$3$0.t25);
        case 121:
          context$3$0.t26 = context$3$0.sent;
          context$3$0.next = 124;
          return context$3$0.t23.createGoto.call(context$3$0.t23, context$3$0.t26);
        case 124:
          context$3$0.t27 = context$3$0.sent;
          context$3$0.t22.setAction.call(context$3$0.t22, context$3$0.t27);
          context$3$0.next = 128;
          return sub_red3.addNewChild('Red - Page 5');
        case 128:
          sub_red5 = context$3$0.sent;
          context$3$0.t28 = sub_red5;
          context$3$0.t29 = PDFNet.Action;
          context$3$0.t30 = PDFNet.Destination;
          context$3$0.next = 134;
          return doc.getPage(5);
        case 134:
          context$3$0.t31 = context$3$0.sent;
          context$3$0.next = 137;
          return context$3$0.t30.createFit.call(context$3$0.t30, context$3$0.t31);
        case 137:
          context$3$0.t32 = context$3$0.sent;
          context$3$0.next = 140;
          return context$3$0.t29.createGoto.call(context$3$0.t29, context$3$0.t32);
        case 140:
          context$3$0.t33 = context$3$0.sent;
          context$3$0.t28.setAction.call(context$3$0.t28, context$3$0.t33);
          context$3$0.next = 144;
          return sub_red3.addNewChild('Red - Page 6');
        case 144:
          sub_red6 = context$3$0.sent;
          context$3$0.t34 = sub_red6;
          context$3$0.t35 = PDFNet.Action;
          context$3$0.t36 = PDFNet.Destination;
          context$3$0.next = 150;
          return doc.getPage(6);
        case 150:
          context$3$0.t37 = context$3$0.sent;
          context$3$0.next = 153;
          return context$3$0.t36.createFit.call(context$3$0.t36, context$3$0.t37);
        case 153:
          context$3$0.t38 = context$3$0.sent;
          context$3$0.next = 156;
          return context$3$0.t35.createGoto.call(context$3$0.t35, context$3$0.t38);
        case 156:
          context$3$0.t39 = context$3$0.sent;
          context$3$0.t34.setAction.call(context$3$0.t34, context$3$0.t39);
          context$3$0.next = 160;
          return doc.getFirstBookmark();
        case 160:
          firstbookmark = context$3$0.sent;
          context$3$0.next = 163;
          return firstbookmark.find('foo');
        case 163:
          foo = context$3$0.sent;
          context$3$0.next = 166;
          return foo.isValid();
        case 166:
          if (!context$3$0.sent) {
            context$3$0.next = 170;
            break;
          }

          foo.delete();
          context$3$0.next = 171;
          break;
        case 170:
          console.log('Bookmark foo is invalid');
        case 171:
          context$3$0.next = 173;
          return firstbookmark.find('bar');
        case 173:
          bar = context$3$0.sent;
          context$3$0.next = 176;
          return bar.isValid();
        case 176:
          if (!context$3$0.sent) {
            context$3$0.next = 180;
            break;
          }

          bar.delete();
          context$3$0.next = 181;
          break;
        case 180:
          console.log('Bookmark bar is invalid');
        case 181:
          // Adding color to Bookmarks. Color and other formatting can help readers
          // get around more easily in large PDF documents.
          red.setColor(1, 0, 0);
          green.setColor(0, 1, 0);
          // set bold font
          green.setFlags(2);
          blue.setColor(0, 0, 1);
          // set bold and italic
          blue.setFlags(3);

          context$3$0.next = 188;
          return doc.saveMemoryBuffer(0);
        case 188:
          bookmarkBuffer = context$3$0.sent;
          saveBufferAsPDFDoc(bookmarkBuffer, 'bookmark.pdf');

          context$3$0.next = 192;
          return PDFNet.PDFDoc.createFromBuffer(bookmarkBuffer);
        case 192:
          docOut = context$3$0.sent;
          docOut.initSecurityHandler();
          docOut.lock();

          context$3$0.next = 197;
          return docOut.getFirstBookmark();
        case 197:
          root = context$3$0.sent;
          return context$3$0.delegateYield(printOutlineTree(root), "t40", 199);
        case 199:
          console.log('Done.');

          doc = docOut;

          doc.initSecurityHandler();

          context$3$0.next = 204;
          return doc.createIndirectDict();
        case 204:
          file_spec = context$3$0.sent;
          file_spec.putName('Type', 'Filespec');
          file_spec.putString('F', 'bookmark.pdf');
          context$3$0.next = 209;
          return PDFNet.FileSpec.createFromObj(file_spec);
        case 209:
          spec = context$3$0.sent;
          context$3$0.next = 212;
          return PDFNet.Action.createGotoRemoteSetNewWindow(spec, 5, true);
        case 212:
          goto_remote = context$3$0.sent;
          context$3$0.next = 215;
          return PDFNet.Bookmark.create(doc, 'REMOTE BOOKMARK 1');
        case 215:
          remoteBookmark1 = context$3$0.sent;
          remoteBookmark1.setAction(goto_remote);
          doc.addRootBookmark(remoteBookmark1);

          context$3$0.next = 220;
          return PDFNet.Bookmark.create(doc, 'REMOTE BOOKMARK 2');
        case 220:
          remoteBookmark2 = context$3$0.sent;
          doc.addRootBookmark(remoteBookmark2);

          context$3$0.next = 224;
          return remoteBookmark2.getSDFObj();
        case 224:
          context$3$0.next = 226;
          return context$3$0.sent.putDict('A');
        case 226:
          gotoR = context$3$0.sent;
          // Set action type
          gotoR.putName('S', 'GoToR');
          gotoR.putBool('NewWindow', true);

          // Set the file specification
          gotoR.put('F', file_spec);

          context$3$0.next = 232;
          return gotoR.putArray('D');
        case 232:
          dest = context$3$0.sent;
          dest.pushBackNumber(9);
          dest.pushBackName('Fit');
          context$3$0.next = 237;
          return doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_remove_unused);
        case 237:
          docbuf = context$3$0.sent;
          saveBufferAsPDFDoc(docbuf, 'bookmark_remote.pdf');

          console.log('Done.');
          return context$3$0.abrupt("return", ret);
        case 241:
        case "end":
          return context$3$0.stop();
        }
      }, marked2$0[2], this);
    }
    // replace with your own license key and remove the samples-key.js script tag
    PDFNet.runGeneratorWithCleanup(main(), window.sampleL);
  };
})(window);