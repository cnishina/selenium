var fs = require('fs');
var path = require('path');

var sourceFile = path.resolve('types', 'chrome.js');
/*

obj = {
  type: string (example: jsdoc, class, enum, etc.)
  lineNumberStart:
  lineNumberEnd:

  // if it is a jsdoc
  jsdoc: {
    comment: the comment
    params:
    type:
    return:
  }

  // if it is a class
  class: {
    classParams: string[]
    constructorParams: string[]
    children: obj[] to capture jsdocs
  }

  // enum types
  enum: {
    map: [
      { key: value },
      { key: value },
      ...
    ]
  }
}

*/

/**
 * a namespace for these jsdoc parsing functions
 */
var JsDoc = {
  /**
   * reads the line and checks if the line starts with a comment
   * @param {number} index line of interest in lines
   * @param {string[]} lines
   */
  getJSDoc: function(index, lines) {
    var line = lines[index].trim();
    if (line.startsWith('//')) {
      return null;
    } else if (line.startsWith('/**')) {
      var obj = {};
      obj.type = 'jsdoc';
      obj.lineNumberStart = index;
      obj.jsdoc = {};
      obj.jsdoc.comment = line + '\n';
      obj = JsDoc.parseJSDocComment(index, lines, obj);
      return obj;
    } else {
      return null;
    }
  },

  /**
   * parse jsDoc comments
   */
  parseJSDocComment: function(index, lines, obj) {
    for (var pos = index + 1; pos < lines.length; pos++) {
      line = lines[pos].trim();
      if (JsDoc.isEnum(line)) {
        obj.jsdoc.type = 'enum';
      } else if (line.indexOf('@return') !== -1) {
        obj = JsDoc.getJSDocReturn(line, obj);
      } else if (line.indexOf('@param') !== -1) {
        obj = JsDoc.getJSDocParams(line, obj);
      }
      if (line.startsWith('*/')) {
        obj.lineNumberEnd = pos;
        obj.jsdoc.comment += ' ' + line;
        break;
      } else {
        obj.jsdoc.comment += ' ' + line + '\n';
      }
    }
    return obj;
  },

  /**
   * parse the return annotation
   */
  getJSDocReturn: function(line, obj) {
    var returnLine = line.replace('* @return ', '').trim();
    var depth = 0;
    var param = '';
    for (var i = 0; i < returnLine.length; i++) {
      if (returnLine.charAt(i) === '{') {
        depth++;
      } else if (returnLine.charAt(i) === '}') {
        depth--;
      } else {
        if (returnLine.charAt(i) !== '!') {
          param += returnLine.charAt(i);
        }
      }
      if (depth === 0) {
        obj.jsdoc.return = param;
        break;
      }
    }
    return obj;
  },

  /**
   * parse the param annotation
   */
  getJSDocParams: function(line, obj) {
    if (!obj.jsdoc.params) {
      obj.jsdoc.params = [];
    }
    var paramLine = line.replace('* @param ', '').trim();
    var depth = 0;
    var param = '';
    for (var i = 0; i < paramLine.length; i++) {
      if (paramLine.charAt(i) === '{') {
        depth++;
      } else if (paramLine.charAt(i) === '}') {
        depth--;
      } else {
        if (paramLine.charAt(i) !== '!') {
          param += paramLine.charAt(i);
        }
      }
      if (depth === 0) {
        obj.jsdoc.params.push(param);
        break;
      }
    }
    return obj;
  },

  /**
   * takes the comment and parses for '@enum '
   * @param {string} jsDoc comment
   * @returns {boolean}
   */
  isEnum: function(jsDocComment) {
    if (jsDocComment.indexOf('@enum ') !== -1) {
      return true;
    } else {
      return false;
    }
  }
}

var ClassObj = {
  /**
   * get the class
   */
  getClass(index, lines) {
    var line = lines[index];
    var obj = {};
    if (line.startsWith('class ')) {
      var depth = 0;
      obj.type = 'class';
      obj.lineNumberStart = index;
      for (var i = index; i < lines.length; i++) {
        var lineClass = lines[i].trim();
        var jsDoc = JsDoc.getJSDoc(i, lines);
        if (jsDoc) {
          i = jsDoc.lineNumberEnd;
        } else if (lineClass.startsWith('constructor')) {
          obj = ClassObj.parseConstructor(i, lines, obj);
        } else if (lineClass.indexOf('{') !== -1) {
          depth++;
        } else if (lineClass.indexOf('}') !== -1) {
          depth--;
        }
        if (depth === 0) {
          obj.lineNumberEnd = i;
          break;
        }
      }
    } else {
      return null;
    }
    return obj;
  },

  parseConstructor(index, lines, obj) {
    var depth = 0;
    if (!obj.class) {
      obj.class = {};
      obj.class.constructorParams = [];
      obj.class.classParams = [];
    }

    // read the constructor parameters
    obj.class.constructorParams = lines[index]
        .replace(/ /g,'')
        .replace('constructor(', '')
        .replace('){', '')
        .split(',');

    // read the class parameters
    for (var i = index; i < lines.length; i++) {
        var line = lines[i];
        if (line.indexOf('{') !== -1) {
          depth++;
        }
        if (line.indexOf('}') !== -1) {
          depth--;
        } else if (line.trim().startsWith('this.')) {
          obj.class.classParams.push(line
            .replace(/ /g,'')
            .replace('this.','')
            .split('=')[0]);
        }
        if (depth === 0) {
          obj.lineNumberEnd = index;
          break;
        }
    }
    return obj;
  },

  writeClass(index, lines, obj) {
    // Write the class with edits

    // go line by line
    for (var linePos = obj.lineNumberStart; linePos <= obj.lineNumberEnd; linePos++) {
      // if we are at a class let's write it out for now
      var line = lines[linePos];

      // class declaration
      if (linePos === index) {
        console.log(line);
        // write out class params
        for (var paramPos in obj.class.constructorParams) {
          var param = obj.class.constructorParams[paramPos];
          console.log('  ' + param + ': any;');
        }
      } else if (line.trim().startsWith('constructor')) {
        var constructor = '  constructor(';
        for (var paramPos in obj.class.classParams) {
          var param = obj.class.classParams[paramPos];
          if (param.startsWith('opt_')) {
            constructor += param + '?: any';
          } else {
            constructor += param + ': any';
          }
          if (paramPos != obj.class.classParams.length - 1) {
            constructor += ',';
          } else {
            constructor += ') {';
          }
        }
        console.log(constructor);
      } else {
        console.log(line);
      }
    }
  }
}

var GenerateTypeScript = {
  parseSourceFile(lines) {
    var parsed = [];
    for (var i = 0; i < lines.length; i++) {
      var obj = null;
      obj = ClassObj.getClass(i, lines, obj);
      if (obj) {
        parsed.push(obj);
        i = obj.lineNumberEnd;
        continue;
      }
      obj = JsDoc.getJSDoc(i, lines, obj);
      if (obj) {
        parsed.push(obj);
        i = obj.lineNumberEnd;
        continue;
      }
    }
    return parsed;
  },

  writeTypeScriptFile(sourceFile, lines, parsed) {
    var target = sourceFile.replace('.js', '.ts')
    console.log(target);
    var parsedPos = 0;
    var parsedObj = parsed[parsedPos];
    var content = '';
    for (var i = 0; i < lines.length; i++) {
      if (parsedObj && parsedObj.lineNumberStart === i) {
        if (parsedObj.type === 'jsdoc') {
          if (parsedObj.jsdoc.type === 'enum') {
              console.log('them enums');
          }
          i = parsedObj.lineNumberEnd;
          parsedPos++;
          parsedObj = parsed[parsedPos];
        } else if (parsedObj.type = 'class' ){
          ClassObj.writeClass(i, lines, parsedObj);
          i = parsedObj.lineNumberEnd;
          parsedPos++;
          parsedObj = parsed[parsedPos];
        }
      } else {
        content += lines[i] + '\n';
      }
    }
  }
}


function doSomethingAmazing(sourceFile) {
  var fileContents = fs.readFileSync(path.resolve(sourceFile)).toString();
  var lines = fileContents.split('\n');
  var parsed = GenerateTypeScript.parseSourceFile(lines);
  GenerateTypeScript.writeTypeScriptFile(sourceFile, lines, parsed);
}


doSomethingAmazing(sourceFile);
