var shell = require('shelljs');

var startCommand = 'browser-sync start --server --startPath samples/showcase/index.html';
var args = process.argv.slice(2);
if (args.length > 0) {
  var firstArg = args[0].split('=');
  if (firstArg[0] === '--key') {
    startCommand += '?key=' + firstArg[1];
  }
}

shell.exec(startCommand);