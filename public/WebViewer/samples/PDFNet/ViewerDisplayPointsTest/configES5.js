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
//# sourceURL=config.js
(function() {
  // Stores information of the elements of each page so that we don't have to recompute them on subsequent clicks
  var pageElementDataList = [];

  // prevListenerFunc required to clean up mouse event listeners after switching documents
  var prevListenerFunc;
  // keep track of previously created annotations so that they can be cleaned up
  var prevAnnotations = [];
  $(document).on('documentLoaded', function() {
    PDFNet.initialize().then(function() {
      // get document
      var stillRunning = false;
      var documentViewer = readerControl.docViewer;
      var doc = documentViewer.getDocument();
      doc.getPDFDoc().then(function(pdfDoc) {
        if (prevListenerFunc) {
          // If we have a previously loaded pdf document, remove any event listeners from that document.
          documentViewer.getViewer()[0].removeEventListener('mousedown', prevListenerFunc);
          // Clear out any information about the pdf's elements we may have stored.
          pageElementDataList = [];
        }
        var handleMouseClick = function(evt) {
          // Make a check to see if processes are still running to prevent multiple from running at same time.
          if (!stillRunning) {
            stillRunning = true;
            var annotManager = readerControl.docViewer.getAnnotationManager();
            if (prevAnnotations.length > 0) {
              for (var i = 0; i < prevAnnotations.length; i++) {
                annotManager.deleteAnnotation(prevAnnotations[i]);
              }
              prevAnnotations = [];
            }
            console.log('MouseClick X: ' + evt.pageX + ', MouseClick Y: ' + evt.pageY);

            // Get the Window coordinates
            var scrollContainer = $('#DocumentViewer');
            var viewportTop = scrollContainer.scrollTop();
            var viewportLeft = scrollContainer.scrollLeft();
            var windowCoord = { x: (evt.pageX + viewportLeft), y: (evt.pageY + viewportTop) };

            var displayModeManager = documentViewer.getDisplayModeManager();
            var displayMode = displayModeManager.getDisplayMode();
            // Get which page was clicked on
            var pageIndex = displayMode.getSelectedPages(windowCoord, windowCoord).first;

            pdfDoc.requirePage(pageIndex + 1).then(function() {
              // Get the context from the doc which is used for properly reading the elements on the pdf document.
              return doc.extractPDFNetLayersContext(); // layers context object, whenever layers changed, want to recalculate.
            }).then(function(layersContextID) {
              // running custom PDFNetJS script
              return runCustomScript(pdfDoc, layersContextID, windowCoord, pageIndex, documentViewer, Annotations, annotManager);
            }).then(function() {
              console.log('finished script');
              // refresh information on viewer and update appearance
              documentViewer.updateView();
              stillRunning = false;
            });
          }
        };
        prevListenerFunc = handleMouseClick;
        documentViewer.getViewer()[0].addEventListener('mousedown', handleMouseClick);
      });
    });
  });

  var runCustomScript = function(pdfDoc, layersContextID, windowCoord, pageIndex, documentViewer, Annotations, annotManager) {
    var marked2$0 = [
      setPoint,
      DrawRectangleAnnot,
      DrawPointAnnot,
      ProcessElements,
      ProcessPaths,
      ExtractElements,
      main
    ].map(regeneratorRuntime.mark);

    // eslint-disable-next-line no-unused-vars
    function setPoint(pdfCoord, pageIndex, builder, writer, rectImg, testSize) {
      var size, posMatrix, rectElement;

      return regeneratorRuntime.wrap(function setPoint$(context$3$0) {
        while (1) switch (context$3$0.prev = context$3$0.next) {
        case 0:
          size = 5;
          if (testSize !== undefined) {
            size = testSize;
          }
          context$3$0.next = 4;
          return PDFNet.Matrix2D.create(size, 0, 0, size, pdfCoord.x - 2.5, pdfCoord.y - 2.5);
        case 4:
          posMatrix = context$3$0.sent;
          context$3$0.next = 7;
          return builder.createImageFromMatrix(rectImg, posMatrix);
        case 7:
          rectElement = context$3$0.sent;
          writer.writePlacedElement(rectElement);
        case 9:
        case "end":
          return context$3$0.stop();
        }
      }, marked2$0[0], this);
    }

    function DrawRectangleAnnot(pageIndex, x1, y1, x2, y2) {
      var p1, p2, displayAnnot;

      return regeneratorRuntime.wrap(function DrawRectangleAnnot$(context$3$0) {
        while (1) switch (context$3$0.prev = context$3$0.next) {
        case 0:
          p1 = docCore.getViewerCoordinates(pageIndex, x1, y1);
          p2 = docCore.getViewerCoordinates(pageIndex, x2, y2);
          displayAnnot = new Annotations.RectangleAnnotation();
          displayAnnot.setPageNumber(pageIndex + 1);
          displayAnnot.setRect(new Annotations.Rect(p1.x, Math.min(p1.y, p2.y), p2.x, Math.max(p1.y, p2.y)));
          annotManager.addAnnotation(displayAnnot);
          prevAnnotations.push(displayAnnot);
        case 7:
        case "end":
          return context$3$0.stop();
        }
      }, marked2$0[1], this);
    }

    function DrawPointAnnot(pageIndex, x, y) {
      var p1, p2, displayAnnot;

      return regeneratorRuntime.wrap(function DrawPointAnnot$(context$3$0) {
        while (1) switch (context$3$0.prev = context$3$0.next) {
        case 0:
          p1 = docCore.getViewerCoordinates(pageIndex, x, y);
          p2 = docCore.getViewerCoordinates(pageIndex, x, y);
          p1.x -= 2;
          p1.y -= 2;
          p2.x += 2;
          p2.y += 2;
          displayAnnot = new Annotations.RectangleAnnotation();
          displayAnnot.setPageNumber(pageIndex + 1);

          displayAnnot.FillColor = new Annotations.Color(255, 255, 0, 1);
          displayAnnot.StrokeColor = new Annotations.Color(255, 0, 0, 1);

          displayAnnot.setRect(new Annotations.Rect(p1.x, Math.min(p1.y, p2.y), p2.x, Math.max(p1.y, p2.y)));
          annotManager.addAnnotation(displayAnnot);
          prevAnnotations.push(displayAnnot);
        case 13:
        case "end":
          return context$3$0.stop();
        }
      }, marked2$0[2], this);
    }

    function ProcessElements(
      pageElementData,
      page_builder,
      doc,
      page,
      pageIndex,
      pdfMousePoint,
      selectTopElementOnly) {
      var pageRotMtx, rotatedMousePoint, elementNum, element, elementBBox;

      return regeneratorRuntime.wrap(function ProcessElements$(context$3$0) {
        while (1) switch (context$3$0.prev = context$3$0.next) {
        case 0:
          context$3$0.next = 2;
          return page.getDefaultMatrix();
        case 2:
          pageRotMtx = context$3$0.sent;
          context$3$0.next = 5;
          return pageRotMtx.inverse();
        case 5:
          pageRotMtx = context$3$0.sent;
          context$3$0.next = 8;
          return pageRotMtx.mult(pdfMousePoint.x, pdfMousePoint.y);
        case 8:
          rotatedMousePoint = context$3$0.sent;
          elementNum = pageElementData.length - 1;
        case 10:
          if (!(elementNum >= 0)) {
            context$3$0.next = 26;
            break;
          }

          element = pageElementData[elementNum];
          elementBBox = element.bbox;

          if (!(elementBBox.x1 < rotatedMousePoint.x && elementBBox.x2 > rotatedMousePoint.x && elementBBox.y1 < rotatedMousePoint.y && elementBBox.y2 > rotatedMousePoint.y)) {
            context$3$0.next = 17;
            break;
          }

          console.log('bounding box detected');
          context$3$0.next = 18;
          break;
        case 17:
          return context$3$0.abrupt("continue", 23);
        case 18:
          return context$3$0.delegateYield(
            DrawRectangleAnnot(pageIndex, elementBBox.x1, elementBBox.y1, elementBBox.x2, elementBBox.y2),
            "t0",
            19
          );
        case 19:
          if (!(element.name === 'path')) {
            context$3$0.next = 21;
            break;
          }

          return context$3$0.delegateYield(
            ProcessPaths(element.operators, element.points, element.ctm, pageIndex),
            "t1",
            21
          );
        case 21:
          if (!selectTopElementOnly) {
            context$3$0.next = 23;
            break;
          }

          return context$3$0.abrupt("break", 26);
        case 23:
          elementNum--;
          context$3$0.next = 10;
          break;
        case 26:
        case "end":
          return context$3$0.stop();
        }
      }, marked2$0[3], this);
    }

    // Draw out all path points
    function ProcessPaths(opr, pointList, currTransMtx, pageIndex) {
      var point_index, x1, y1, pagePoint, opr_index, w, h, x2, y2, x3, y3, x4, y4, pagePoint1, pagePoint2, pagePoint3, pagePoint4;

      return regeneratorRuntime.wrap(function ProcessPaths$(context$3$0) {
        while (1) switch (context$3$0.prev = context$3$0.next) {
        case 0:
          point_index = 0;
          if (opr.length > 4000) {
            console.log('Processing ' + opr.length + ' points. This will take significant time.');
          } else if (opr.length > 500) {
            console.log('Processing ' + opr.length + ' points. This may take some time.');
          }

          opr_index = 0;
        case 3:
          if (!(opr_index < opr.length)) {
            context$3$0.next = 78;
            break;
          }

          context$3$0.t0 = opr[opr_index];
          context$3$0.next = (context$3$0.t0 === PDFNet.Element.PathSegmentType.e_moveto ? 7 : (context$3$0.t0 === PDFNet.Element.PathSegmentType.e_lineto ? 16 : (context$3$0.t0 === PDFNet.Element.PathSegmentType.e_cubicto ? 25 : (context$3$0.t0 === PDFNet.Element.PathSegmentType.e_rect ? 42 : (context$3$0.t0 === PDFNet.Element.PathSegmentType.e_closepath ? 73 : 74)))));
          break;
        case 7:
          // code to handle move segments
          x1 = pointList[point_index];++point_index;
          y1 = pointList[point_index];++point_index;
          context$3$0.next = 13;
          return currTransMtx.mult(x1, y1);
        case 13:
          pagePoint = context$3$0.sent;
          return context$3$0.delegateYield(DrawPointAnnot(pageIndex, pagePoint.x, pagePoint.y), "t1", 15);
        case 15:
          return context$3$0.abrupt("break", 75);
        case 16:
          // code to handle line segments
          x1 = pointList[point_index];++point_index;
          y1 = pointList[point_index];++point_index;
          context$3$0.next = 22;
          return currTransMtx.mult(x1, y1);
        case 22:
          pagePoint = context$3$0.sent;
          return context$3$0.delegateYield(DrawPointAnnot(pageIndex, pagePoint.x, pagePoint.y), "t2", 24);
        case 24:
          return context$3$0.abrupt("break", 75);
        case 25:
          // code to handle cubic segments
          x1 = pointList[point_index];++point_index;
          y1 = pointList[point_index];++point_index;
          x2 = pointList[point_index];++point_index;
          y2 = pointList[point_index];++point_index;
          x3 = pointList[point_index];++point_index;
          y3 = pointList[point_index];++point_index;
          context$3$0.next = 39;
          return currTransMtx.mult(x3, y3);
        case 39:
          pagePoint = context$3$0.sent;
          return context$3$0.delegateYield(DrawPointAnnot(pageIndex, pagePoint.x, pagePoint.y), "t3", 41);
        case 41:
          return context$3$0.abrupt("break", 75);
        case 42:
          // code to handle rect segments
          x1 = pointList[point_index];++point_index;
          y1 = pointList[point_index];++point_index;
          w = pointList[point_index];
          ++point_index;
          h = pointList[point_index];
          ++point_index;
          x2 = x1 + w;
          y2 = y1;
          x3 = x2;
          y3 = y1 + h;
          x4 = x1;
          y4 = y3;
          context$3$0.next = 58;
          return currTransMtx.mult(x1, y1);
        case 58:
          pagePoint1 = context$3$0.sent;
          context$3$0.next = 61;
          return currTransMtx.mult(x2, y2);
        case 61:
          pagePoint2 = context$3$0.sent;
          context$3$0.next = 64;
          return currTransMtx.mult(x3, y3);
        case 64:
          pagePoint3 = context$3$0.sent;
          context$3$0.next = 67;
          return currTransMtx.mult(x4, y4);
        case 67:
          pagePoint4 = context$3$0.sent;
          return context$3$0.delegateYield(DrawPointAnnot(pageIndex, pagePoint1.x, pagePoint1.y), "t4", 69);
        case 69:
          return context$3$0.delegateYield(DrawPointAnnot(pageIndex, pagePoint2.x, pagePoint2.y), "t5", 70);
        case 70:
          return context$3$0.delegateYield(DrawPointAnnot(pageIndex, pagePoint3.x, pagePoint3.y), "t6", 71);
        case 71:
          return context$3$0.delegateYield(DrawPointAnnot(pageIndex, pagePoint4.x, pagePoint4.y), "t7", 72);
        case 72:
          return context$3$0.abrupt("break", 75);
        case 73:
          return context$3$0.abrupt("break", 75);
        case 74:
          return context$3$0.abrupt("break", 75);
        case 75:
          ++opr_index;
          context$3$0.next = 3;
          break;
        case 78:
          // ensure that we update the view
          annotManager.drawAnnotations(pageIndex + 1);
        case 79:
        case "end":
          return context$3$0.stop();
        }
      }, marked2$0[4], this);
    }

    // Store all information we need so that we won't have to do this a second time.
    function ExtractElements(page_reader) {
      var elementArray, element, ctm, elemType, elementBBox, retObj, pathinfo, opr, points, elementXObj, elementNum, elemArray2;

      return regeneratorRuntime.wrap(function ExtractElements$(context$3$0) {
        while (1) switch (context$3$0.prev = context$3$0.next) {
        case 0:
          elementArray = [];
          context$3$0.next = 3;
          return page_reader.next();
        case 3:
          element = context$3$0.sent;
        case 4:
          if (!(element !== null)) {
            context$3$0.next = 58;
            break;
          }

          context$3$0.next = 7;
          return element.isOCVisible();
        case 7:
          context$3$0.t0 = !context$3$0.sent;

          if (context$3$0.t0) {
            context$3$0.next = 12;
            break;
          }

          context$3$0.next = 11;
          return element.isClippingPath();
        case 11:
          context$3$0.t0 = context$3$0.sent;
        case 12:
          if (!context$3$0.t0) {
            context$3$0.next = 14;
            break;
          }

          return context$3$0.abrupt("continue", 53);
        case 14:
          context$3$0.next = 16;
          return element.getCTM();
        case 16:
          ctm = context$3$0.sent;
          context$3$0.next = 19;
          return element.getType();
        case 19:
          elemType = context$3$0.sent;
          context$3$0.t1 = elemType;

          context$3$0.next = (context$3$0.t1 === // Process path data
          PDFNet.Element.Type.e_path ? 23 : (context$3$0.t1 === // Process image data
          PDFNet.Element.Type.e_image ? 34 : (context$3$0.t1 === // Process form XObjects
          PDFNet.Element.Type.e_form ? 46 : 52)));

          break;
        case 23:
          context$3$0.next = 25;
          return element.getPathData();
        case 25:
          pathinfo = context$3$0.sent;
          opr = new Uint8Array(pathinfo.operators);
          points = new Float64Array(pathinfo.points);
          context$3$0.next = 30;
          return element.getBBox();
        case 30:
          elementBBox = context$3$0.sent;
          retObj = {
            name: 'path', type: elemType, ctm: ctm, operators: opr, points: points, bbox: elementBBox
          };
          elementArray.push(retObj);
          return context$3$0.abrupt("break", 53);
        case 34:
          context$3$0.next = 36;
          return element.getBBox();
        case 36:
          elementBBox = context$3$0.sent;
          context$3$0.next = 39;
          return element.getXObject();
        case 39:
          elementXObj = context$3$0.sent;
          context$3$0.next = 42;
          return elementXObj.getObjNum();
        case 42:
          elementNum = context$3$0.sent;
          retObj = {
            name: 'image', type: elemType, num: elementNum, ctm: ctm, bbox: elementBBox
          };
          elementArray.push(retObj);
          return context$3$0.abrupt("break", 53);
        case 46:
          page_reader.formBegin();
          return context$3$0.delegateYield(ExtractElements(page_reader), "t2", 48);
        case 48:
          elemArray2 = context$3$0.t2;
          elementArray = elementArray.concat(elemArray2);
          page_reader.end();
          return context$3$0.abrupt("break", 53);
        case 52:
          return context$3$0.abrupt("break", 53);
        case 53:
          context$3$0.next = 55;
          return page_reader.next();
        case 55:
          element = context$3$0.sent;
          context$3$0.next = 4;
          break;
        case 58:
          return context$3$0.abrupt("return", elementArray);
        case 59:
        case "end":
          return context$3$0.stop();
        }
      }, marked2$0[5], this);
    }


    var displayModeManager = documentViewer.getDisplayModeManager();
    var displayMode = displayModeManager.getDisplayMode();
    var docCore = documentViewer.getDocument();
    function main() {
      var ret, doc, selectTopElementOnly, pageNum, viewerPageCoord, pdfCoord, page_reader, page_builder, currPage, pageRotMtx, pageElementData, layersContext, sq;

      return regeneratorRuntime.wrap(function main$(context$3$0) {
        while (1) switch (context$3$0.prev = context$3$0.next) {
        case 0:
          ret = 0;
          context$3$0.prev = 1;
          doc = pdfDoc;
          doc.lock();
          doc.initSecurityHandler();

          selectTopElementOnly = true;
          pageNum = pageIndex + 1;
          viewerPageCoord = displayMode.windowToPage(windowCoord, pageIndex);
          pdfCoord = docCore.getPDFCoordinates(pageIndex, viewerPageCoord.x, viewerPageCoord.y);
          context$3$0.next = 11;
          return PDFNet.ElementReader.create();
        case 11:
          page_reader = context$3$0.sent;
          context$3$0.next = 14;
          return PDFNet.ElementBuilder.create();
        case 14:
          page_builder = context$3$0.sent;
          context$3$0.next = 17;
          return doc.getPage(pageNum);
        case 17:
          currPage = context$3$0.sent;
          context$3$0.next = 20;
          return currPage.getDefaultMatrix();
        case 20:
          pageRotMtx = context$3$0.sent;
          context$3$0.next = 23;
          return pageRotMtx.mult(pdfCoord.x, pdfCoord.y);
        case 23:
          pdfCoord = context$3$0.sent;
          pageElementData = pageElementDataList[pageIndex];

          if (!(pageElementData === undefined)) {
            context$3$0.next = 35;
            break;
          }

          context$3$0.next = 28;
          return doc.getPage(pageNum);
        case 28:
          currPage = context$3$0.sent;
          layersContext = new PDFNet.OCGContext(layersContextID);
          page_reader.beginOnPage(currPage, layersContext);

          return context$3$0.delegateYield(ExtractElements(page_reader), "t0", 32);
        case 32:
          pageElementData = context$3$0.t0;
          pageElementDataList[pageIndex] = pageElementData;
          page_reader.end();
        case 35:
          context$3$0.next = 37;
          return doc.getPage(pageNum);
        case 37:
          currPage = context$3$0.sent;
          layersContext = new PDFNet.OCGContext(layersContextID);

          return context$3$0.delegateYield(
            ProcessElements(pageElementData, page_builder, doc, currPage, pageIndex, pdfCoord, selectTopElementOnly),
            "t1",
            40
          );
        case 40:
          context$3$0.next = 42;
          return PDFNet.SquareAnnot.create(doc, PDFNet.Rect(10, 200, 800, 300));
        case 42:
          sq = context$3$0.sent;
          context$3$0.t2 = sq;
          context$3$0.next = 46;
          return PDFNet.ColorPt.init(0, 0, 0);
        case 46:
          context$3$0.t3 = context$3$0.sent;
          context$3$0.t2.setColor.call(context$3$0.t2, context$3$0.t3, 3);
          sq.refreshAppearance();
          currPage.annotPushBack(sq);
          context$3$0.next = 56;
          break;
        case 52:
          context$3$0.prev = 52;
          context$3$0.t4 = context$3$0["catch"](1);
          console.log(context$3$0.t4.stack);
          ret = 1;
        case 56:
        case "end":
          return context$3$0.stop();
        }
      }, marked2$0[6], this, [[1, 52]]);
    }

    // start the generator
    return PDFNet.runGeneratorWithCleanup(main());
  };
})(window);