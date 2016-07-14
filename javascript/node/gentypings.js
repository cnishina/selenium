'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');
var spawn = require('child_process').spawnSync;

/**
 * Helper function to copy from the source to the target
 * must exist.
 *
 * @param {string} source path
 * @param {string} target path
 */
function copyFileSync(source, target) {
  var targetFile = target;

  // if target is a directory a new file with the same name will be created
  if (fs.existsSync(target) && fs.lstatSync(target).isDirectory()) {
    targetFile = path.join(target, path.basename(source));
  }
  fs.writeFileSync(targetFile + '.tmp', fs.readFileSync(source));
}

/**
 * Copies the source and the files to the target path.
 *
 * @param {string} source path
 * @param {string} target path
 */
function copyFolderRecursiveSync(source, target) {
  var files = [];

  // check if folder needs to be created or integrated
  var targetFolder = path.join(target, path.basename(source));
  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder);
  }

  // copy files
  if (fs.lstatSync(source).isDirectory()) {
    files = fs.readdirSync(source);
    files.forEach(function(file) {
      var curSource = path.join(source, file);
      if (fs.lstatSync(curSource).isDirectory()) {
        copyFolderRecursiveSync(curSource, targetFolder);
      } else {
        copyFileSync(curSource, targetFolder);
      }
    });
  }
}

/**
 * Reads the temporary JavaScript file (*.js.tmp). It does a very simple
 * parse of the file to record the constructor, constructor, parameters and
 * class variables. Takes the simple parsing of the file and writes
 * the typescript version of the file with class variables not declared
 * within the constructor, with '?' added to optional params that start with
 * 'opt_'. Finally, removes the temporary JavaScript file.
 *
 * Example given a JavaScript file with:
 *
 * class Foo extends Bar {
 *   constructor(opt_param) {
 *     this.coolParam = opt_param;
 *   }
 * }
 *
 * converts to:
 *
 * class Foo extends Bar {
 *   coolParam: any;
 *   constructor(opt_param?) {
 *     this.coolParam = opt_param;
 *   }
 * }
 *
 * @param {string} source path
 * @returns {string} path to the TypeScript file
 */
function parseFile(source) {
  var fileContents = fs.readFileSync(path.resolve(source)).toString();
  var lines = fileContents.split('\n');
  var classes = [];

  // get class names
  lines.forEach(function(line, index) {
    line = line.trim();
    if (line.indexOf('class') === 0) {
      var className = line.split(' ')[1];
      classes.push({'className': className, 'classLineNumber': index});
    }
  });

  // parse the files
  classes.forEach(function(classObj) {
    classObj.classParams = [];
    var constructorFound = false;
    var depth = 0;
    for (var lineNumber = classObj.classLineNumber; lineNumber < lines.length; lineNumber++) {
      var line = lines[lineNumber].replace(/ /g,'');
      if (line.indexOf('constructor') === 0 && !constructorFound) {
        classObj.constructorLineStart = lineNumber;
        constructorFound = true;
        depth = 1;

        // read in constructor parameters
        classObj.constructorParams = line.replace('constructor(','').replace('){','').split(',');
      }
      else if (constructorFound) {
        if (line.indexOf('{') !== -1) {
          depth++;
        }
        if (line.indexOf('}') !== -1) {
          depth--;
        }
        if (line.startsWith('this.')) {
          classObj.classParams.push(line.replace('this.','').split('=')[0]);
        }
        if (depth === 0) {
          classObj.constructorLineEnd = lineNumber;
          break;
        }
      }
    }
  });

  // write the files
  var classPos = 0;
  var classObj = classes[classPos];
  var newFileContents = '';
  var foundModule = false;
  var moduleDepth = 0;
  lines.forEach(function(line, index) {
    if (line.indexOf('require(') !== -1 || line.indexOf('use strict') !== -1) {

    }
    else if (classObj) {
      if (classObj.classLineNumber === index) {
        newFileContents += line + '\n';
        classObj.classParams.forEach(function(param) {
          newFileContents += '  ' + param + ': any;\n';
        });
        newFileContents += '\n';
      } else if (classObj.constructorLineStart === index) {
        for (var pos = 0; pos < classObj.constructorParams.length; pos++) {
          var param = classObj.constructorParams[pos];
          if (param.startsWith('opt_')) {
            line = line.replace(param, param + '?');
          }
        }
        newFileContents += line + '\n';
      } else if (classObj.constructorLineEnd === index) {
        newFileContents += line + '\n';
        classPos++;
        classObj = classes[classPos];
      } else {
        newFileContents += line + '\n';
      }
    } else {
      if (line.indexOf('module') !== -1) {
        console.log('found a module');
        foundModule = true;
        moduleDepth = 1;
      } else if (foundModule) {
        if (line.indexOf('{') !== -1) {
          moduleDepth++;
        } else if (line.indexOf('}') !== -1) {
          moduleDepth--;
        }
        if (moduleDepth === 0) {
          foundModule = false;
        }
      } else {
        newFileContents += line + '\n';
      }
    }
  });
  fs.writeFileSync(path.resolve(source.replace('.js.tmp', '.ts')), newFileContents);
  fs.unlinkSync(source);
  return path.resolve(source.replace('.js.tmp', '.ts'));
}

function runSpawn(task, opt_arg) {
  opt_arg = typeof opt_arg !== 'undefined' ? opt_arg: [];
  var child = spawn(task, opt_arg, {stdio: 'inherit'});
}

function mvPackage() {
  var packageJsonTmp = path.resolve('types', 'selenium-webdriver', 'package.json.tmp');
  var packageJson = path.resolve('types', 'selenium-webdriver', 'package.json');
  runSpawn('mv', [packageJsonTmp, packageJson]);
}

runSpawn('mkdir', ['-p','types']);
copyFolderRecursiveSync('selenium-webdriver', 'types');
parseFile(path.resolve('types', 'selenium-webdriver','lib','capabilities.js.tmp'));
runSpawn('tsc');
