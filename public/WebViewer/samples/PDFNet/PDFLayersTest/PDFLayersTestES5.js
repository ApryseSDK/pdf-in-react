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
//# sourceURL=PDFLayersTest.js
(function(exports) {
  'use strict';

  exports.runPDFLayersTest = function() {
    var marked2$0 = [CreateLayer, CreateGroup1, CreateGroup2, CreateGroup3, main].map(regeneratorRuntime.mark);
    // A utility function used to add new Content Groups (Layers) to the document.
    function CreateLayer(doc, layer_name) {
      var grp, cfg, layer_order_array, grpSDFObj;

      return regeneratorRuntime.wrap(function CreateLayer$(context$3$0) {
        while (1) switch (context$3$0.prev = context$3$0.next) {
        case 0:
          context$3$0.next = 2;
          return PDFNet.startDeallocateStack();
        case 2:
          context$3$0.next = 4;
          return PDFNet.OCG.create(doc, layer_name);
        case 4:
          grp = context$3$0.sent;
          context$3$0.next = 7;
          return doc.getOCGConfig();
        case 7:
          cfg = context$3$0.sent;

          if (!(cfg == null)) {
            context$3$0.next = 13;
            break;
          }

          context$3$0.next = 11;
          return PDFNet.OCGConfig.create(doc, true);
        case 11:
          cfg = context$3$0.sent;
          cfg.setName('Default');
        case 13:
          context$3$0.next = 15;
          return cfg.getOrder();
        case 15:
          layer_order_array = context$3$0.sent;

          if (!(layer_order_array == null)) {
            context$3$0.next = 21;
            break;
          }

          context$3$0.next = 19;
          return doc.createIndirectArray();
        case 19:
          layer_order_array = context$3$0.sent;
          cfg.setOrder(layer_order_array);
        case 21:
          context$3$0.next = 23;
          return grp.getSDFObj();
        case 23:
          grpSDFObj = context$3$0.sent;
          layer_order_array.pushBack(grpSDFObj);

          context$3$0.next = 27;
          return PDFNet.endDeallocateStack();
        case 27:
          return context$3$0.abrupt("return", grp);
        case 28:
        case "end":
          return context$3$0.stop();
        }
      }, marked2$0[0], this);
    }

    // Creates some content (3 images) and associate them with the image layer
    function CreateGroup1(doc, layer) {
      var writer, nullEncoderHints, img, builder, imgWidth, imgHeight, imgMatrix, element, gstate, grp_obj;

      return regeneratorRuntime.wrap(function CreateGroup1$(context$3$0) {
        while (1) switch (context$3$0.prev = context$3$0.next) {
        case 0:
          context$3$0.next = 2;
          return PDFNet.startDeallocateStack();
        case 2:
          context$3$0.next = 4;
          return PDFNet.ElementWriter.create();
        case 4:
          writer = context$3$0.sent;
          writer.begin(doc);

          nullEncoderHints = new PDFNet.Obj('0');
          context$3$0.next = 9;
          return PDFNet.Image.createFromURL(doc, '../TestFiles/peppers.jpg', nullEncoderHints);
        case 9:
          img = context$3$0.sent;
          context$3$0.next = 12;
          return PDFNet.ElementBuilder.create();
        case 12:
          builder = context$3$0.sent;
          context$3$0.next = 15;
          return img.getImageWidth();
        case 15:
          imgWidth = context$3$0.sent;
          context$3$0.next = 18;
          return img.getImageHeight();
        case 18:
          imgHeight = context$3$0.sent;
          imgMatrix = new PDFNet.Matrix2D(imgWidth / 2, -145, 20, imgHeight / 2, 200, 150);
          context$3$0.next = 22;
          return builder.createImageFromMatrix(img, imgMatrix);
        case 22:
          element = context$3$0.sent;
          writer.writePlacedElement(element);

          context$3$0.next = 26;
          return element.getGState();
        case 26:
          gstate = context$3$0.sent;
          gstate.setTransform(200, 0, 0, 300, 50, 450);
          writer.writePlacedElement(element);

          context$3$0.t0 = writer;
          context$3$0.next = 32;
          return builder.createImageScaled(img, 300, 600, 200, -150);
        case 32:
          context$3$0.t1 = context$3$0.sent;
          context$3$0.t0.writePlacedElement.call(context$3$0.t0, context$3$0.t1);
          context$3$0.next = 36;
          return writer.end();
        case 36:
          grp_obj = context$3$0.sent;

          // Indicate that this form (content group) belongs to the given layer (OCG).
          grp_obj.putName('Subtype', 'Form');
          grp_obj.put('OC', layer);
          // Set the clip box for the content.
          grp_obj.putRect('BBox', 0, 0, 1000, 1000);
          context$3$0.next = 42;
          return PDFNet.endDeallocateStack();
        case 42:
          return context$3$0.abrupt("return", grp_obj);
        case 43:
        case "end":
          return context$3$0.stop();
        }
      }, marked2$0[1], this);
    }

    function CreateGroup2(doc, layer) {
      var writer, builder, element, gstate, CMYKSpace, cyanColorPt, RGBSpace, redColorPt, grp_obj;

      return regeneratorRuntime.wrap(function CreateGroup2$(context$3$0) {
        while (1) switch (context$3$0.prev = context$3$0.next) {
        case 0:
          context$3$0.next = 2;
          return PDFNet.startDeallocateStack();
        case 2:
          context$3$0.next = 4;
          return PDFNet.ElementWriter.create();
        case 4:
          writer = context$3$0.sent;
          writer.begin(doc);

          context$3$0.next = 8;
          return PDFNet.ElementBuilder.create();
        case 8:
          builder = context$3$0.sent;
          // start constructing the path
          builder.pathBegin();
          builder.moveTo(306, 396);
          builder.curveTo(681, 771, 399.75, 864.75, 306, 771);
          builder.curveTo(212.25, 864.75, -69, 771, 306, 396);
          builder.closePath();
          context$3$0.next = 16;
          return builder.pathEnd();
        case 16:
          element = context$3$0.sent;

          // Set the path FILL color space and color.
          element.setPathFill(true);
          context$3$0.next = 20;
          return element.getGState();
        case 20:
          gstate = context$3$0.sent;
          context$3$0.next = 23;
          return PDFNet.ColorSpace.createDeviceCMYK();
        case 23:
          CMYKSpace = context$3$0.sent;
          gstate.setFillColorSpace(CMYKSpace);
          context$3$0.next = 27;
          return PDFNet.ColorPt.init(1, 0, 0, 0);
        case 27:
          cyanColorPt = context$3$0.sent;
          // cyan
          gstate.setFillColorWithColorPt(cyanColorPt);

          // Set the path STROKE color space and color.
          element.setPathStroke(true);
          context$3$0.next = 32;
          return PDFNet.ColorSpace.createDeviceRGB();
        case 32:
          RGBSpace = context$3$0.sent;
          gstate.setStrokeColorSpace(RGBSpace);
          context$3$0.next = 36;
          return PDFNet.ColorPt.init(1, 0, 0);
        case 36:
          redColorPt = context$3$0.sent;
          // red
          gstate.setStrokeColorWithColorPt(redColorPt);
          gstate.setLineWidth(20);

          gstate.setTransform(0.5, 0, 0, 0.5, 280, 300);

          writer.writeElement(element);

          context$3$0.next = 43;
          return writer.end();
        case 43:
          grp_obj = context$3$0.sent;

          // Indicate that this form (content group) belongs to the given layer (OCG).
          grp_obj.putName('Subtype', 'Form');
          grp_obj.put('OC', layer);
          // Set the clip box for the content.
          grp_obj.putRect('BBox', 0, 0, 1000, 1000);

          context$3$0.next = 49;
          return PDFNet.endDeallocateStack();
        case 49:
          return context$3$0.abrupt("return", grp_obj);
        case 50:
        case "end":
          return context$3$0.stop();
        }
      }, marked2$0[2], this);
    }

    function CreateGroup3(doc, layer) {
      var writer, builder, textFont, element, transform, grp_obj;

      return regeneratorRuntime.wrap(function CreateGroup3$(context$3$0) {
        while (1) switch (context$3$0.prev = context$3$0.next) {
        case 0:
          context$3$0.next = 2;
          return PDFNet.startDeallocateStack();
        case 2:
          context$3$0.next = 4;
          return PDFNet.ElementWriter.create();
        case 4:
          writer = context$3$0.sent;
          writer.begin(doc);

          context$3$0.next = 8;
          return PDFNet.ElementBuilder.create();
        case 8:
          builder = context$3$0.sent;
          context$3$0.next = 11;
          return PDFNet.Font.create(doc, PDFNet.Font.StandardType1Font.e_times_roman);
        case 11:
          textFont = context$3$0.sent;
          context$3$0.next = 14;
          return builder.createTextBeginWithFont(textFont, 120);
        case 14:
          element = context$3$0.sent;
          writer.writeElement(element);

          context$3$0.next = 18;
          return builder.createNewTextRun('A text layer!');
        case 18:
          element = context$3$0.sent;
          context$3$0.next = 21;
          return PDFNet.Matrix2D.createRotationMatrix(-45 * (3.1415 / 180.0));
        case 21:
          transform = context$3$0.sent;
          context$3$0.next = 24;
          return transform.concat(1, 0, 0, 1, 180, 100);
        case 24:
          context$3$0.next = 26;
          return element.setTextMatrix(transform);
        case 26:
          context$3$0.next = 28;
          return writer.writeElement(element);
        case 28:
          context$3$0.t0 = writer;
          context$3$0.next = 31;
          return builder.createTextEnd();
        case 31:
          context$3$0.t1 = context$3$0.sent;
          context$3$0.next = 34;
          return context$3$0.t0.writeElement.call(context$3$0.t0, context$3$0.t1);
        case 34:
          context$3$0.next = 36;
          return writer.end();
        case 36:
          grp_obj = context$3$0.sent;

          // Indicate that this form (content group) belongs to the given layer (OCG).
          grp_obj.putName('Subtype', 'Form');
          grp_obj.put('OC', layer);
          // Set the clip box for the content.
          grp_obj.putRect('BBox', 0, 0, 1000, 1000);
          context$3$0.next = 42;
          return PDFNet.endDeallocateStack();
        case 42:
          return context$3$0.abrupt("return", grp_obj);
        case 43:
        case "end":
          return context$3$0.stop();
        }
      }, marked2$0[3], this);
    }


    function main() {
      var ret, doc, image_layer, text_layer, vector_layer, page, builder, writer, group_obj, element, group_obj2, ocgs, text_ocmd, elementGState, prefs, docbuf, init_cfg, ctx, pdfdraw, firstPageBuffer, i, sz, ocg, fname, pageBuffer, nonLayerBuffer;

      return regeneratorRuntime.wrap(function main$(context$3$0) {
        while (1) switch (context$3$0.prev = context$3$0.next) {
        case 0:
          console.log('Beginning Test');
          ret = 0;
          context$3$0.prev = 2;
          context$3$0.next = 5;
          return PDFNet.PDFDoc.create();
        case 5:
          doc = context$3$0.sent;
          doc.initSecurityHandler();
          doc.lock();
          console.log('PDFNet and PDF document initialized and locked');

          return context$3$0.delegateYield(CreateLayer(doc, 'Image Layer'), "t0", 10);
        case 10:
          image_layer = context$3$0.t0;
          return context$3$0.delegateYield(CreateLayer(doc, 'Text Layer'), "t1", 12);
        case 12:
          text_layer = context$3$0.t1;
          return context$3$0.delegateYield(CreateLayer(doc, 'Vector Layer'), "t2", 14);
        case 14:
          vector_layer = context$3$0.t2;
          context$3$0.next = 17;
          return doc.pageCreate();
        case 17:
          page = context$3$0.sent;
          context$3$0.next = 20;
          return PDFNet.ElementBuilder.create();
        case 20:
          builder = context$3$0.sent;
          context$3$0.next = 23;
          return PDFNet.ElementWriter.create();
        case 23:
          writer = context$3$0.sent;
          writer.beginOnPage(page);

          context$3$0.t3 = doc;
          context$3$0.next = 28;
          return image_layer.getSDFObj();
        case 28:
          context$3$0.t4 = context$3$0.sent;
          return context$3$0.delegateYield(CreateGroup1(context$3$0.t3, context$3$0.t4), "t5", 30);
        case 30:
          group_obj = context$3$0.t5;
          context$3$0.next = 33;
          return builder.createFormFromStream(group_obj);
        case 33:
          element = context$3$0.sent;
          writer.writeElement(element);

          context$3$0.t6 = doc;
          context$3$0.next = 38;
          return vector_layer.getSDFObj();
        case 38:
          context$3$0.t7 = context$3$0.sent;
          return context$3$0.delegateYield(CreateGroup2(context$3$0.t6, context$3$0.t7), "t8", 40);
        case 40:
          group_obj2 = context$3$0.t8;
          context$3$0.next = 43;
          return builder.createFormFromStream(group_obj2);
        case 43:
          element = context$3$0.sent;
          writer.writeElement(element);

          if (!false) {
            context$3$0.next = 77;
            break;
          }

          ocgs = doc.createIndirectArray();
          context$3$0.t9 = ocgs;
          context$3$0.next = 50;
          return image_layer.getSDFObj();
        case 50:
          context$3$0.t10 = context$3$0.sent;
          context$3$0.t9.pushBack.call(context$3$0.t9, context$3$0.t10);
          context$3$0.t11 = ocgs;
          context$3$0.next = 55;
          return vector_layer.getSDFObj();
        case 55:
          context$3$0.t12 = context$3$0.sent;
          context$3$0.t11.pushBack.call(context$3$0.t11, context$3$0.t12);
          context$3$0.t13 = ocgs;
          context$3$0.next = 60;
          return text_layer.getSDFObj();
        case 60:
          context$3$0.t14 = context$3$0.sent;
          context$3$0.t13.PushBack.call(context$3$0.t13, context$3$0.t14);
          context$3$0.next = 64;
          return PDFNet.OCMD.create(doc, ocgs, PDFNet.OCMD.VisibilityPolicyType.e_AllOn);
        case 64:
          text_ocmd = context$3$0.sent;
          context$3$0.t15 = builder;
          context$3$0.t16 = doc;
          context$3$0.next = 69;
          return text_ocmd.getSDFObj();
        case 69:
          context$3$0.t17 = context$3$0.sent;
          return context$3$0.delegateYield(CreateGroup3(context$3$0.t16, context$3$0.t17), "t18", 71);
        case 71:
          context$3$0.t19 = context$3$0.t18;
          context$3$0.next = 74;
          return context$3$0.t15.createFormFromStream.call(context$3$0.t15, context$3$0.t19);
        case 74:
          element = context$3$0.sent;
          context$3$0.next = 87;
          break;
        case 77:
          context$3$0.t20 = builder;
          context$3$0.t21 = doc;
          context$3$0.next = 81;
          return text_layer.getSDFObj();
        case 81:
          context$3$0.t22 = context$3$0.sent;
          return context$3$0.delegateYield(CreateGroup3(context$3$0.t21, context$3$0.t22), "t23", 83);
        case 83:
          context$3$0.t24 = context$3$0.t23;
          context$3$0.next = 86;
          return context$3$0.t20.createFormFromStream.call(context$3$0.t20, context$3$0.t24);
        case 86:
          element = context$3$0.sent;
        case 87:
          writer.writeElement(element);

          context$3$0.t25 = builder;
          context$3$0.next = 91;
          return page.getPageWidth();
        case 91:
          context$3$0.t26 = context$3$0.sent;
          context$3$0.next = 94;
          return page.getPageHeight();
        case 94:
          context$3$0.t27 = context$3$0.sent;
          context$3$0.next = 97;
          return context$3$0.t25.createRect.call(context$3$0.t25, 0, 0, context$3$0.t26, context$3$0.t27);
        case 97:
          element = context$3$0.sent;
          element.setPathFill(false);
          element.setPathStroke(true);
          context$3$0.next = 102;
          return element.getGState();
        case 102:
          elementGState = context$3$0.sent;
          elementGState.setLineWidth(40);
          writer.writeElement(element);

          // save changes to the current page
          writer.end();
          doc.pagePushBack(page);

          context$3$0.next = 109;
          return doc.getViewPrefs();
        case 109:
          prefs = context$3$0.sent;
          prefs.setPageMode(PDFNet.PDFDocViewPrefs.PageMode.e_UseOC);

          context$3$0.next = 113;
          return doc.saveMemoryBuffer(PDFNet.SDFDoc.SaveOptions.e_linearized);
        case 113:
          docbuf = context$3$0.sent;
          saveBufferAsPDFDoc(docbuf, 'pdf_layers.pdf');
          console.log('done example 1');
          context$3$0.next = 122;
          break;
        case 118:
          context$3$0.prev = 118;
          context$3$0.t28 = context$3$0["catch"](2);
          console.log(context$3$0.t28.stack);
          ret = 1;
        case 122:
          context$3$0.prev = 122;
          context$3$0.next = 125;
          return doc.hasOC();
        case 125:
          if (context$3$0.sent) {
            context$3$0.next = 129;
            break;
          }

          console.log("The document does not contain 'Optional Content'");
          context$3$0.next = 184;
          break;
        case 129:
          context$3$0.next = 131;
          return doc.getOCGConfig();
        case 131:
          init_cfg = context$3$0.sent;
          context$3$0.next = 134;
          return PDFNet.OCGContext.createFromConfig(init_cfg);
        case 134:
          ctx = context$3$0.sent;
          context$3$0.next = 137;
          return PDFNet.PDFDraw.create();
        case 137:
          pdfdraw = context$3$0.sent;
          pdfdraw.setImageSize(1000, 1000);
          pdfdraw.setOCGContext(ctx);

          context$3$0.next = 142;
          return doc.getPage(1);
        case 142:
          page = context$3$0.sent;
          context$3$0.next = 145;
          return pdfdraw.exportStream(page);
        case 145:
          firstPageBuffer = context$3$0.sent;
          saveBufferAsPNG(firstPageBuffer, 'pdf_layers_default.png');

          ctx.setNonOCDrawing(false);

          context$3$0.next = 150;
          return doc.getOCGs();
        case 150:
          ocgs = context$3$0.sent;

          if (!(ocgs !== null)) {
            context$3$0.next = 178;
            break;
          }

          context$3$0.next = 154;
          return ocgs.size();
        case 154:
          sz = context$3$0.sent;
          i = 0;
        case 156:
          if (!(i < sz)) {
            context$3$0.next = 178;
            break;
          }

          context$3$0.t29 = PDFNet.OCG;
          context$3$0.next = 160;
          return ocgs.getAt(i);
        case 160:
          context$3$0.t30 = context$3$0.sent;
          context$3$0.next = 163;
          return context$3$0.t29.createFromObj.call(context$3$0.t29, context$3$0.t30);
        case 163:
          ocg = context$3$0.sent;
          ctx.resetStates(false);
          ctx.setState(ocg, true);
          fname = 'pdf_layers_';
          context$3$0.next = 169;
          return ocg.getName();
        case 169:
          fname += context$3$0.sent;
          fname += '.png';
          context$3$0.next = 173;
          return pdfdraw.exportStream(page);
        case 173:
          pageBuffer = context$3$0.sent;
          saveBufferAsPNG(pageBuffer, fname);
        case 175:
          ++i;
          context$3$0.next = 156;
          break;
        case 178:
          // Now draw content that is not part of any layer...
          ctx.setNonOCDrawing(true);
          ctx.setOCDrawMode(PDFNet.OCGContext.OCDrawMode.e_NoOC);
          context$3$0.next = 182;
          return pdfdraw.exportStream(page);
        case 182:
          nonLayerBuffer = context$3$0.sent;
          saveBufferAsPNG(nonLayerBuffer, 'pdf_layers_non_oc.png');
        case 184:
          console.log('done');
          context$3$0.next = 191;
          break;
        case 187:
          context$3$0.prev = 187;
          context$3$0.t31 = context$3$0["catch"](122);
          console.log(context$3$0.t31.stack);
          ret = 1;
        case 191:
        case "end":
          return context$3$0.stop();
        }
      }, marked2$0[4], this, [[2, 118], [122, 187]]);
    }
    // start the generator
    // replace with your own license key and remove the samples-key.js script tag
    PDFNet.runGeneratorWithCleanup(main(), window.sampleL);
  };
})(window);