import React, { Component } from 'react';
import './App.css';
import PDFViewer from './components/PDFViewer/PDFViewer';
import PDFJSBackend from './backends/pdfjs';
import WebviewerBackend from './backends/webviewer';

class App extends Component {

  constructor() {
    super();
    this.myViewer = React.createRef();
  }

  onButtonClick = () => {
    this.myViewer.current.rotate('clockwise');
  }

  render() {
    return (
      <div className="App">
        
        <button onClick={this.onButtonClick}>Rotate Clockwise</button>

        <PDFViewer ref={this.myViewer} backend={WebviewerBackend} src='/myPDF.pdf' />
      </div>
    );
  }
}

export default App;
