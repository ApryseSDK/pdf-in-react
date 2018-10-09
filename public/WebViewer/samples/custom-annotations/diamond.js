/**
 * ReaderControl config file
 * ------------------------------
 * This js file is meant to simplify configuring commonly used settings for ReaderControl.
 * You can override default settings through ReaderControl.config properties, or add JavaScript code directly here.
 */
(function() {
  'use strict';

  var CustomDiamondControlHandle = function(annotation, position) {
    this.annotation = annotation;
    this.position = position;
  };
  CustomDiamondControlHandle.prototype = {
    getDimensions: function(annotation, selectionBox, zoom) {
      var x, y;
      var width = Annotations.ControlHandle.handleWidth / zoom;
      var height = Annotations.ControlHandle.handleHeight / zoom;

      switch (this.position) {
        case 'top':
          y = selectionBox.y1;
          x = (selectionBox.x1 + selectionBox.x2) * 0.5;
          break;
        case 'bottom':
          y = selectionBox.y2;
          x = (selectionBox.x1 + selectionBox.x2) * 0.5;
          break;
        case 'left':
          y = (selectionBox.y1 + selectionBox.y2) * 0.5;
          x = selectionBox.x1;
          break;
        case 'right':
          y = (selectionBox.y1 + selectionBox.y2) * 0.5;
          x = selectionBox.x2;
          break;
        default:
          return null;
      }
      // adjust for the control handle's own width & height
      x -= width * 0.5;
      y -= height * 0.5;
      return new Annotations.Rect(x, y, x + width, y + height);
    },
    // eslint-disable-next-line no-unused-vars
    move: function(annotation, deltaX, deltaY, fromPoint, toPoint) {
      var rect = annotation.getRect();
      switch (this.position) {
        case 'top':
          rect.y1 += deltaY;
          break;
        case 'bottom':
          rect.y2 += deltaY;
          break;
        case 'left':
          rect.x1 += deltaX;
          break;
        case 'right':
          rect.x2 += deltaX;
          break;
        default:
          return null;
      }
      annotation.resize(rect);
      return true; // return true if redraw is needed
    }
  };
  CustomDiamondControlHandle.prototype = $.extend(true, new Annotations.ControlHandle(), CustomDiamondControlHandle.prototype);

  var CustomDiamondSelectionModel = function(annotation, canModify) {
    Annotations.SelectionModel.call(this, annotation, canModify);
    if (canModify) {
      var controlHandles = this.getControlHandles();
      controlHandles.push(new CustomDiamondControlHandle(annotation, 'top'));
      controlHandles.push(new CustomDiamondControlHandle(annotation, 'left'));
      controlHandles.push(new CustomDiamondControlHandle(annotation, 'right'));
      controlHandles.push(new CustomDiamondControlHandle(annotation, 'bottom'));
    }
  };
  CustomDiamondSelectionModel.prototype = {
    drawSelectionOutline: function(ctx, annotation, zoom) {
      // by default, the selection outline is drawn around the annotation's bounding box (x,y,width,height)
      // this can be customized here.

      // getDimensions accounts thickness adjustment
      var dim = this.getDimensions(annotation);
      var x = dim.x1;
      var y = dim.y1;

      var width = dim.getWidth();
      var height = dim.getHeight();

      if (typeof zoom !== 'undefined') {
        ctx.lineWidth = Annotations.SelectionModel['selectionOutlineThickness'] / zoom;
      } else {
        ctx.lineWidth = Annotations.SelectionModel['selectionOutlineThickness'];
      }

      if (this.canModify()) {
        ctx.strokeStyle = Annotations.SelectionModel['defaultSelectionOutlineColor'].toString();
      } else {
        ctx.strokeStyle = Annotations.SelectionModel['defaultNoPermissionSelectionOutlineColor'].toString();
      }

      var sequence = [2, 2];
      if (ctx.setLineDash) {
        ctx.setLineDash(sequence);
      } else {
        // it's ok to set mozDash even if it's not Firefox since it's just a property
        ctx.mozDash = sequence;
      }
      ctx.strokeRect(x, y, width, height);
      ctx.lineDashOffset = 2;
      ctx.mozDashOffset = 2;

      // draw a white line at half the stroke width. So the line is visible when background is blue.
      ctx.lineWidth /= 2;
      ctx.strokeStyle = 'rgb(255, 255, 255)';
      ctx.strokeRect(x, y, width, height);
    },
    testSelection: function(annotation, x, y, pageMatrix) {
      // by default, the selection algorithm used is based on the annotation's bounding rect (x,y, width, height)
      // See Annotations.SelectionAlgorithm for available algorithms or implement your custom logic here.
      return Annotations.SelectionAlgorithm.canvasVisibilityTest(annotation, x, y, pageMatrix);
    }
  };
  CustomDiamondSelectionModel.prototype = $.extend(true, new Annotations.SelectionModel(), CustomDiamondSelectionModel.prototype);

  /*
   *@extends {Annotations.MarkupAnnotation}
   */
  var CustomDiamondAnnotation = function() {
    Annotations.MarkupAnnotation.call(this);
    this.Subject = 'Custom Diamond';
    this.Custom = 'save this field'; // the 'Custom' field is a built-in attribute
    this.myCustomAttribute = 'customValue'; // you can define your own attributes as well
  };
  CustomDiamondAnnotation.prototype = $.extend(new Annotations.MarkupAnnotation(), {
    elementName: 'custom-diamond',
    /**
     * Override the default draw method.
     * Coordinate space is relative to the X,Y position, in the unmirrored quandrant:
     * i.e. two mouse points used to create the annotations are (0,0) and (Width, Height)
     * Mirroring is automatically applied if NoResize is false.
     * @override
     */
    draw: function(ctx, pageMatrix) {
      this.setStyles(ctx, pageMatrix);

      // draw diamond
      //--------------------
      ctx.translate(this.X, this.Y);
      ctx.beginPath();
      ctx.moveTo(this.Width / 2, 0);
      ctx.lineTo(this.Width, this.Height / 2);
      ctx.lineTo(this.Width / 2, this.Height);
      ctx.lineTo(0, this.Height / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    },
    serialize: function(element, pageMatrix) {
      var el = Annotations.MarkupAnnotation.prototype.serialize.call(this, element, pageMatrix);
      $(el).attr('myattribute', this.myCustomAttribute);
      return el;
    },
    deserialize: function(element, pageMatrix) {
      Annotations.MarkupAnnotation.prototype.deserialize.call(this, element, pageMatrix);
      this.myCustomAttribute = $(element).attr('myattribute');
    },
    selectionModel: CustomDiamondSelectionModel
  });

  /**
   * CustomDiamondCreateTool
   * -for shape annotations based on two mouse points, extend from GenericAnnotationCreateTool/
   */
  var CustomDiamondCreateTool = function(docViewer) {
    // pass in the constructor to the custom Annotation
    Tools.GenericAnnotationCreateTool.call(this, docViewer, CustomDiamondAnnotation);
  };
  CustomDiamondCreateTool.prototype = new Tools.GenericAnnotationCreateTool();
  CustomDiamondCreateTool.prototype.mouseLeftUp = function(e) {
    Tools.GenericAnnotationCreateTool.prototype.mouseLeftUp.call(this, e);
    // access the annotation created through this.annotation

    // switch out the tool
    // var toolModes = exports.Tools;
    // this.docViewer.setToolMode(toolModes.AnnotationEditTool);
  };

  /**
   * Override the default double click behavior for the AnnotationEditTool
   */
  // Tools.AnnotationEditTool.prototype.mouseDoubleClick = function(e){
  //  Tools.AnnotationEditTool.prototype.mouseDoubleClick.call(this,e);
  // }


  //= ========================================================
  // Load a custom script for the "about" page
  //= ========================================================
  $.extend(ReaderControl.config, {
    customScript: 'defaultScriptExtension.js'
  });

  //= ========================================================
  // Load a custom script for custom annotations and
  // add a new tool button to the annotation panel
  //= ========================================================
  $(document).bind('documentLoaded', function() {
    $('#overflowToolsContainer').prepend('<span data-toolmode="AnnotationCreateCustomDiamond" class="annotTool glyphicons" title="Custom Diamond"><img src="../../samples/custom-annotations/annot_custom_diamond.png"/></span>');

    // document finished loading
    var am = readerControl.getDocumentViewer().getAnnotationManager();
    // register Annotation for serialization
    am.registerAnnotationType('custom-diamond', CustomDiamondAnnotation);
    // register ToolMode for ReaderControl UI
    var diamondTool = 'AnnotationCreateCustomDiamond';
    readerControl.toolModeMap[diamondTool] = new CustomDiamondCreateTool(readerControl.docViewer);
    window.ControlUtils.userPreferences.registerTool(readerControl.toolModeMap[diamondTool], 'custom-diamond', CustomDiamondAnnotation);

    readerControl.setToolMode(diamondTool);
  });
})();
