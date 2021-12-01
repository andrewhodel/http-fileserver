var http = require('http'),
url = require('url'),
path = require('path'),
https = require('https'),
fs = require('fs');

var config = {
	port: 80,
	SSLport: 443,
	SSLcert: '/home/ec2-user/keys/andrewhodel_com.crt',
	SSLkey: '/home/ec2-user/keys/andrewhodel_com.key',
	SSLca: '/home/ec2-user/keys/andrewhodel_com.ca-bundle',
	root: '/home/ec2-user/andrewhodel.com',
	// 301 redirect http requests to https
	http_to_https: true
};

var mimeTypes = {
	"html": "text/html",
	"jpeg": "image/jpeg",
	"jpg": "image/jpeg",
	"png": "image/png",
	"js": "text/javascript",
	"css": "text/css"
};

var c_srv = function(req, res) {

	if (req.url.indexOf('/..') > -1) {
		// don't allow this
		res.writeHead(302, {'Location': '/'});
		res.end();
		return;
	}

	var uri = url.parse(req.url).pathname;

	if (!req.headers.host) {
		console.log(new Date().toString() + ' - got request with no req.headers.host', req);
		res.writeHead(400, {
			'Content-Type': 'text/plain'
		});
		res.write('error, no host header in request');
		res.end();
		return;
	}

	var host = req.headers.host;
	host = '';

	if (host.substr(0,4) == 'www.') {
		host = host.substr(4);
	}

	if (host.indexOf(':') > -1) {
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

	console.log(new Date().toString() + ' - ' + req.connection.remoteAddress + ' - Request: ' + filename);

	fs.exists(filename, function(exists) {

		// error status
		var error = false;

		if (!exists) {
			console.log(new Date().toString() + ' - 404: ' + this.filename);
			res.writeHead(404, {
				'Content-Type': 'text/plain'
			});
			res.write('404 Not Found\n');
			res.end();
			return;
		}

		if (fs.lstatSync(this.filename).isDirectory()) {
			res.writeHead(302, {'Location':uri + '/'});
			res.end();
			return;
		}

		res.statusCode = 200;
		var mimeType = mimeTypes[path.extname(this.filename).split(".")[1]];

		if (typeof(mimeType) != 'undefined') {
			res.setHeader('Content-Type', mimeType);
		}

		// this is the file size in bytes
		var fileSize = fs.statSync(this.filename).size;

		// check for range header on request
		// range: 'bytes=35756527-'
		if (typeof(req.headers.range) != 'undefined') {
			// this is a range request, meaning the file is already partially downloaded
			console.log('range request at', req.headers.range);

			// we will need to respond with a 206 Partial Content
			res.statusCode = 206;

			if (req.headers.range.indexOf('bytes') != 0) {
				// they aren't requesting bytes, just drop it
				error = 'range not requested in bytes, there is no reason to support your request';
			}

			// a range request should be in one of two forms
			// bytes=NNNN- means start at byte NNNN and send until the end of the file
			// bytes=NNNN-NNNNN means start at byte NNNN and send until NNNNN
			//
			// there is also multipart ranges which would be something like
			// bytes=0-50, 100-150
			// and the idea is that you send back a Content-Type: multipart/byteranges; boundary=234328kdjsdf
			// where the boundary defines each breakpoint, it is kind of strange to have a boundary because why wouldn't
			// the client just count it so we just won't support it because it seems off
			if (req.headers.range.indexOf(',') > -1) {
				error = 'server does not support multipart ranges';
			}

			// so get the byte range
			var r1 = Number(req.headers.range.split('=')[1].split('-')[0]);
			var r2 = Number(req.headers.range.split('=')[1].split('-')[1]);
			if (r2 == '') {
				r2 = fileSize;
			}

			// set headers for support range requests
			res.setHeader('Content-Range', 'bytes '+r1+'-'+r2+'/'+fileSize);
			// and content length
			res.setHeader('Content-Length', r2-r1);

		} else {

			// set headers for support range requests
			res.setHeader('Accept-Ranges', 'bytes');
			// and content length
			res.setHeader('Content-Length', fileSize);

		}

		if (error != false) {
			console.log('500 ERROR ', error);
			res.statusCode = 500;
			res.end(error);
		} else {

			if (typeof(req.headers.range) != 'undefined') {
				// is a range request
				var fileStream = fs.createReadStream(this.filename, {start:r1, end:r2});
			} else {
				// not a range request
				var fileStream = fs.createReadStream(this.filename);
			}
			//console.log('sending file');
			fileStream.pipe(res);

		}

	}.bind({filename: filename}));
}

if (config.port != null) {
	if (config.http_to_https) {
		http.createServer(function(req, res) {
			if (typeof(req.headers.host) == 'undefined') {
				res.writeHead(404, {});
			} else {
				res.writeHead(301, {'Location': 'https://' + req.headers.host});
			}
			res.end();
		}).listen(config.port);
	} else {
		http.createServer(c_srv).listen(config.port);
	}
	console.log('listening on port ' + config.port);
}

if (config.SSLport != null && config.SSLcert != null) {

	if (fs.existsSync(config.SSLkey)) {
		config.SSLkey = fs.readFileSync(config.SSLkey);
	}
	if (fs.existsSync(config.SSLcert)) {
		config.SSLcert = fs.readFileSync(config.SSLcert);
	}
	if (fs.existsSync(config.SSLca)) {
		config.SSLca = fs.readFileSync(config.SSLca);
	}

	var opts = {};
	opts.key = config.SSLkey;
	opts.cert = config.SSLcert;
	opts.ca = config.SSLca;

	https.createServer(opts, c_srv).listen(config.SSLport);
	console.log('listening on port ' + config.SSLport);

}

