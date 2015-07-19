var http = require('http'),
	url = require('url'),
	path = require('path'),
	fs = require('fs');

var config = {
	port: 80,
	root: '/home/www'
};

var mimeTypes = {
	"html": "text/html",
	"jpeg": "image/jpeg",
	"jpg": "image/jpeg",
	"png": "image/png",
	"js": "text/javascript",
	"css": "text/css"
};

http.createServer(function(req, res) {
	var uri = url.parse(req.url).pathname;
	var host = req.headers.host;

	if (req.headers.host.indexOf(':') > -1) {
		// remove port from host to find vhost directory
		host = req.headers.host.slice(0,req.headers.host.indexOf(':'));
	}

	var filename = config.root + '/' + host + uri;

	// swap ascii codes for real characters
	var newlpath = '';
	var startPoint = 0;
	for (var c=0; c<filename.length; c++) {
		if (filename[c] == '%') {
			// add everything before that point
			newlpath = filename.substring(startPoint,c);
			// change the next two characters from hex to decimal
			var h = parseInt('0x' + filename[c+1] + filename[c+2]);
			// add the character that the hex code represents in ascii
			newlpath = newlpath + String.fromCharCode(h);
			startPoint = c+3;
		}
	}
	// add everything from startPoint to the end of filename
	newlpath = newlpath + filename.substring(startPoint);
	// set filename to newlpath
	filename = newlpath;

	if (filename.substr(filename.length - 1) == '/') {
		filename += 'index.html';
	}

	console.log(new Date().toString() + ' - Request: ' + filename);

	fs.exists(filename, function(exists) {
		if (!exists) {
			console.log(new Date().toString() + ' - 404: ' + filename);
			res.writeHead(200, {
				'Content-Type': 'text/plain'
			});
			res.write('404 Not Found\n');
			res.end();
			return;
		}
		var mimeType = mimeTypes[path.extname(filename).split(".")[1]];
		res.writeHead(200, mimeType);

		var fileStream = fs.createReadStream(filename);
		fileStream.pipe(res);

	});
}).listen(config.port);

console.log('listening on port ' + config.port);
