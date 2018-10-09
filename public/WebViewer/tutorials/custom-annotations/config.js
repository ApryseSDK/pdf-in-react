(function() {
    var TriangleControlHandle = function(annotation, index) {
        this.annotation = annotation;
        // set the index of this control handle so that we know which vertex is corresponds to
        this.index = index;
    };
    TriangleControlHandle.prototype = {
        // returns a rect that should represent the control handle's position and size
        getDimensions: function(annotation, selectionBox, zoom) {
            var x = annotation.vertices[this.index].x;
            var y = annotation.vertices[this.index].y;
            var width = Annotations.ControlHandle.handleWidth / zoom;
            var height = Annotations.ControlHandle.handleHeight / zoom;

            // adjust for the control handle's own width and height
            x = x - width * 0.5;
            y = y - height * 0.5;
            return new Annotations.Rect(x, y, x + width, y + height);
        },

        // this function is called when the control handle is dragged
        move: function(annotation, deltaX, deltaY, fromPoint, toPoint) {
            annotation.vertices[this.index].x += deltaX;
            annotation.vertices[this.index].y += deltaY;

            // recalculate the X, Y, width and height of the annotation
            var minX = Number.MAX_VALUE;
            var maxX = -Number.MAX_VALUE;
            var minY = Number.MAX_VALUE;
            var maxY = -Number.MAX_VALUE;
            for (var i = 0; i < annotation.vertices.length; ++i) {
                var vertex = annotation.vertices[i];
                minX = Math.min(minX, vertex.x);
                maxX = Math.max(maxX, vertex.x);
                minY = Math.min(minY, vertex.y);
                maxY = Math.max(maxY, vertex.y);
            }

            var rect = new Annotations.Rect(minX, minY, maxX, maxY);
            annotation.setRect(rect);
            // return true if redraw is needed
            return true;
        },

        draw: function(ctx, annotation, selectionBox, zoom) {
            var dim = this.getDimensions(annotation, selectionBox, zoom);
            ctx.beginPath();
            ctx.moveTo(dim.x1 + (dim.getWidth() / 2), dim.y1);
            ctx.lineTo(dim.x1 + dim.getWidth(), dim.y1 + dim.getHeight());
            ctx.lineTo(dim.x1, dim.y1 + dim.getHeight());
            ctx.closePath();
            ctx.stroke();
            ctx.fill();
        }
    };
    TriangleControlHandle.prototype = $.extend(true, new Annotations.ControlHandle(),
        TriangleControlHandle.prototype);


    // selection model creates the necessary control handles
    var TriangleSelectionModel = function(annotation, canModify) {
        Annotations.SelectionModel.call(this, annotation, canModify);
        if (canModify) {
            var controlHandles = this.getControlHandles();
            // pass the vertex index to each control handle
            controlHandles.push(new TriangleControlHandle(annotation, 0));
            controlHandles.push(new TriangleControlHandle(annotation, 1));
            controlHandles.push(new TriangleControlHandle(annotation, 2));
        }
    };
    TriangleSelectionModel.prototype = {
        drawSelectionOutline: function(ctx, annotation, zoom) {
            if (typeof zoom !== 'undefined') {
                ctx.lineWidth = Annotations.SelectionModel['selectionOutlineThickness'] / zoom;
            } else {
                ctx.lineWidth = Annotations.SelectionModel['selectionOutlineThickness'];
            }

            // changes the selection outline color if the user doesn't have permission to modify this annotation
            if (this.canModify()) {
                ctx.strokeStyle = Annotations.SelectionModel['defaultSelectionOutlineColor'].toString();
            } else {
                ctx.strokeStyle = Annotations.SelectionModel['defaultNoPermissionSelectionOutlineColor'].toString();
            }

            ctx.beginPath();
            ctx.moveTo(annotation.vertices[0].x, annotation.vertices[0].y);
            ctx.lineTo(annotation.vertices[1].x, annotation.vertices[1].y);
            ctx.lineTo(annotation.vertices[2].x, annotation.vertices[2].y);
            ctx.closePath();
            ctx.stroke();

            var dashUnit = Annotations.SelectionModel['selectionOutlineDashSize'] / zoom;
            var sequence = [dashUnit, dashUnit];
            ctx.setLineDash(sequence);
            ctx.strokeStyle = 'rgb(255, 255, 255)';
            ctx.stroke();
        },
        testSelection: function(annotation, x, y) {
            // the canvas visibility test will only select the annotation
            // if a user clicks exactly on it as opposed to the rectangular bounding box
            return Annotations.SelectionAlgorithm.canvasVisibilityTest(annotation, x, y);
        }
    };
    TriangleSelectionModel.prototype = $.extend(true, new Annotations.SelectionModel(),
        TriangleSelectionModel.prototype);


    var TriangleAnnotation = function() {
        Annotations.MarkupAnnotation.call(this);
        this.Subject = "Triangle";
        this.vertices = [];
        var numVertices = 3;
        for (var i = 0; i < numVertices; ++i) {
            this.vertices.push({
                x: 0,
                y: 0
            });
        }
    };
    TriangleAnnotation.prototype = $.extend(new Annotations.MarkupAnnotation(), {
        elementName: 'triangle',

        selectionModel: TriangleSelectionModel,

        draw: function(ctx) {
            this.setStyles(ctx);

            ctx.beginPath();
            ctx.moveTo(this.vertices[0].x, this.vertices[0].y);
            ctx.lineTo(this.vertices[1].x, this.vertices[1].y);
            ctx.lineTo(this.vertices[2].x, this.vertices[2].y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        },

        resize: function(rect) {
            // this function is only called when the annotation is dragged
            // since we handle the case where the control handles move
            var annotRect = this.getRect();
            var deltaX = rect.x1 - annotRect.x1;
            var deltaY = rect.y1 - annotRect.y1;

            // shift the vertices by the amount the rect has shifted
            this.vertices = this.vertices.map(function(vertex) {
                vertex.x += deltaX;
                vertex.y += deltaY;
                return vertex;
            });
            this.setRect(rect);
        },

        serialize: function(element, pageMatrix) {
            var el = Annotations.MarkupAnnotation.prototype.serialize.call(this, element, pageMatrix);
            el.setAttribute('vertices', Annotations.XfdfUtils.serializePointArray(this.vertices, pageMatrix));
            return el;
        },

        deserialize: function(element, pageMatrix) {
            Annotations.MarkupAnnotation.prototype.deserialize.call(this, element, pageMatrix);
            this.vertices = Annotations.XfdfUtils.deserializePointArray(element.getAttribute('vertices'), pageMatrix);
        }
    });

    var TriangleCreateTool = function(docViewer) {
        // TriangleAnnotation is the constructor function for our annotation we defined previously
        Tools.GenericAnnotationCreateTool.call(this, docViewer, TriangleAnnotation);
    };
    TriangleCreateTool.prototype = new Tools.GenericAnnotationCreateTool();
    TriangleCreateTool.prototype.mouseMove = function(e) {
        // call the parent mouseMove first
        Tools.GenericAnnotationCreateTool.prototype.mouseMove.call(this, e);
        if (this.annotation) {
            this.annotation.vertices[0].x = this.annotation.X + this.annotation.Width / 2;
            this.annotation.vertices[0].y = this.annotation.Y;
            this.annotation.vertices[1].x = this.annotation.X + this.annotation.Width;
            this.annotation.vertices[1].y = this.annotation.Y + this.annotation.Height;
            this.annotation.vertices[2].x = this.annotation.X;
            this.annotation.vertices[2].y = this.annotation.Y + this.annotation.Height;

            // update the annotation appearance
            this.docViewer.getAnnotationManager().redrawAnnotation(this.annotation);
        }
    };

    $(document).on("documentLoaded", function(event) {
        var triangleTool = 'AnnotationCreateTriangle';
        // add a button to the overflow tools container which can be accessed from
        // the downward pointing arrow to the right of the annotation tools
        $('#overflowToolsContainer').prepend(
            '<span data-toolmode="' + triangleTool + '" class="annotTool glyphicons" title="Triangle">' +
            '<img src="triangle-tool.png"/></span>'
        );

        var am = readerControl.getDocumentViewer().getAnnotationManager();
        // register the annotation type so that it can be saved to XFDF files
        am.registerAnnotationType("triangle", TriangleAnnotation);

        readerControl.toolModeMap[triangleTool] = new TriangleCreateTool(readerControl.docViewer);

        // registering the tool allows the triangle to have its properties remembered
        window.ControlUtils.userPreferences.registerTool(
            readerControl.toolModeMap[triangleTool], 'triangle', TriangleAnnotation
        );

        // set the tool mode to our tool so that we can start using it right away
        readerControl.setToolMode(triangleTool);
    });
})();
