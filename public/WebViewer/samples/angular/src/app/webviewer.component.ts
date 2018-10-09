import { Component, ViewChild, ElementRef, AfterViewInit } from '@angular/core';

declare let PDFTron: any;
declare let $: any;

@Component({
  selector: 'app-webviewer',
  template: '<div #viewer></div>',
  styles: ['div { height: 100% }']
})
export class WebViewerComponent implements AfterViewInit {
  @ViewChild('viewer') viewer: ElementRef;
  myWebViewer: any;

  ngAfterViewInit(): void {
    this.myWebViewer = new PDFTron.WebViewer({
      path: '../assets/webviewer',
      initialDoc: '../assets/docs/tiger.xod',
      config: '../assets/config.js'
    }, this.viewer.nativeElement);
  }

  getWebViewer(): any {
    return this.myWebViewer;
  }

  getWindow(): any {
    return this.viewer.nativeElement.querySelector('iframe').contentWindow;
  }

  getElement(): any {
    return $(this.viewer.nativeElement);
  }
}
