// Asset Packer
// ------------
// Packs all CSS, JS and HTML assets declared in the ss.client.define() call to be sent upon initial connection
// Other code modules can still be served asynchronously later on

var CleanCSS, deleteOldFiles, existslib, formatKb, fs, log, magicPath, mkdir, pathlib, system, view;

log = console.log;

require('colors');

fs = require('fs');

pathlib = require('path');

existslib = process.version.split('.')[1] === '6' && require('path') || require('fs');

CleanCSS = require('clean-css');

system = require('./system');

magicPath = require('./magic_path');

view = require('./view');

module.exports = function(ss, client, options) {
  var asset, clientDir, containerDir, packAssetSet;
  asset = require('./asset')(ss, options);
  client.pack = true;
  containerDir = pathlib.join(ss.root, options.dirs.assets);
  clientDir = pathlib.join(containerDir, client.name);
  packAssetSet = function(assetType, paths, dir, postProcess) {
    var filePaths, prefix, processFiles, writeFile;
    writeFile = function(fileContents) {
      var fileName;
      fileName = clientDir + '/' + client.id + '.' + assetType;
      fs.writeFileSync(fileName, postProcess(fileContents));
      return log('✓'.green, 'Packed ' + filePaths.length + ' files into ' + fileName.substr(ss.root.length));
    };
    processFiles = function(fileContents, i) {
      var file, path, _ref;
      if (fileContents == null) {
        fileContents = [];
      }
      if (i == null) {
        i = 0;
      }
      _ref = filePaths[i], path = _ref.path, file = _ref.file;
      return asset[assetType](file, {
        pathPrefix: path,
        compress: true
      }, function(output) {
        fileContents.push(output);
        if (filePaths[++i]) {
          return processFiles(fileContents, i);
        } else {
          return writeFile(fileContents);
        }
      });
    };

    // Expand any dirs into real files    
    if (paths && paths.length > 0) {
      filePaths = [];
      prefix = pathlib.join(ss.root, dir);
      paths.forEach(function(path) {
        return magicPath.files(prefix, path).forEach(function(file) {
          return filePaths.push({
            path: path,
            file: file
          });
        });
      });
      return processFiles();
    }
  };

  /* PACKER */

  log(("Pre-packing and minifying the '" + client.name + "' client...").yellow);
  
  // Prepare folder
  mkdir(containerDir);
  mkdir(clientDir);
  if (!(options.packedAssets && options.packedAssets.keepOldFiles)) {
    deleteOldFiles(clientDir);
  }

  // Output CSS  
  packAssetSet('css', client.paths.css, options.dirs.css, function(files) {
    var original   = files.join("\n");
    var cssOptions = options.packedAssets && options.packedAssets.css ? options.packedAssets.css : {};
    var minified   = new CleanCSS(cssOptions).minify(original);
    log(("  Minified CSS from " + (formatKb(minified.stats.originalSize)) + " to " + (formatKb(minified.stats.minifiedSize)) + " [" + (Math.floor(minified.stats.efficiency * 100)) + "%]").grey);
    if (minified.errors.length) log(("  Errors: " + JSON.stringify(minified.errors)).red)
    // workaround: ignore warnings related to remote @import. by default it does not try to import remote paths. ie. {inline: ['local']}
    //             but it still triggers a warning for remote source because no callback funciton is being supplied with .minify method.
    var warnings = [];
    for (var i=0; i<minified.warnings.length; i++) {
      if (minified.warnings[i].match(/^skipping remote @import of/i) !== null) continue;
      warnings.push(minified.warnings[i]);
    }
    if (warnings.length) log(("  Warnings: " + JSON.stringify(warnings)).yellow)
    return minified.styles;
  });

  // Output JS  
  packAssetSet('js', client.paths.code, options.dirs.code, function(files) {
    // build client-side templates and pack into js asset package
    clientTemplates = (buildClientTemplates(ss, client, options)).join('');
    if (clientTemplates.length) {
      log(("  Compiled " + options.dirs.templates + '/' + client.paths.tmpl + " to " + (formatKb(clientTemplates.length))).grey);
    }
    return system.serve.js({
     compress: true
    }) + files.join(';') + ';' + clientTemplates + system.serve.initCode();
  });
  
	// Option to skip pre-rendering of the jade templates into html
  if (options.packedAssets && options.packedAssets.skipHtml) return;

  // Output HTML view
  return view(ss, client, options, function(html) {
    var fileName;
    fileName = pathlib.join(clientDir, client.id + '.html');
    fs.writeFileSync(fileName, html);
    return log('✓'.green, 'Created and cached HTML file ' + fileName.substr(ss.root.length));
  });
};

// PRIVATE

formatKb = function(size) {
  return "" + (Math.round((size / 1024) * 1000) / 1000) + " KB";
};

mkdir = function(dir) {
  if (!existslib.existsSync(dir)) {
    return fs.mkdirSync(dir);
  }
};

deleteOldFiles = function(clientDir) {
  var filesDeleted, numFilesDeleted;
  numFilesDeleted = 0;
  filesDeleted = fs.readdirSync(clientDir).map(function(fileName) {
    return fs.unlinkSync(pathlib.join(clientDir, fileName));
  });
  return filesDeleted.length > 1 && log('✓'.green, "" + filesDeleted.length + " previous packaged files deleted");
};

// Client-side templates
buildClientTemplates = function(ss, client, options) {
  var dir, files, output;
  var templateEngine = require('./template_engine')(ss);
  dir = pathlib.join(ss.root, options.dirs.templates);
  output = [];
  if (client.paths.tmpl) {
    files = [];
    client.paths.tmpl.forEach(function(tmpl) {
      return files = files.concat(magicPath.files(dir, tmpl));
    });
    // added bool (false) to indicate to template engine that template WILL be used in external js
    templateEngine.generate(dir, files, true, function(templateHTML) {
      return output.push(templateHTML);
    });
  }
  return output;
};