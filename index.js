const Koa			= require('koa');
const Router		= require('koa-router');
const bodyParser	= require('koa-body');
const json			= require('koa-json')
const winston 		= require('winston');
const PDFSense		= require("./pdfsense.js")

var app				= new Koa();
var router			= new Router();
const pdfsense 		= new PDFSense()


app.use(async function handleError(context, next) {

	try {
		await next();
	} catch (error) {
		context.status = 500;
		if(error.message) {
			console.log('ERROR: ' + error.message);
			context.body = {'error':error.message};
		} else {
			console.log('ERRORsdf: ' + error);
			context.body = {'error':error};
		}
		//debug(error.stack);
	}
});


//Set up body parsing middleware
app.use(bodyParser({
   formidable:{uploadDir: './tmp', maxFileSize: 20000 * 1024 * 1024},
   multipart: true,
   urlencoded: true
}));

app.use(router.routes());
app.use(json({ pretty: true, param: 'pretty' }))


// LOGGING
require('winston-daily-rotate-file');

var rotatedLog = new (winston.transports.DailyRotateFile)({
	filename: 'logs/pdfsense-%DATE%.log',
	datePattern: 'YYYY-MM',
	zippedArchive: false,
	maxSize: '20m'
});

const logger = winston.createLogger({
	format: winston.format.combine(
		winston.format.timestamp(),
		winston.format.prettyPrint()
	),
	transports: [
		new winston.transports.Console(),
		rotatedLog
	]
});

logger.info('PDFSense server started');
// LOGGING ENDS

app.use(json({ pretty: true, param: 'pretty' }))


// ROUTES
router.get('/', async function (ctx) {
	ctx.body = 'PDFSense here. Poppler-utils, Tesseract OCR and CLD language detection at your service.';
});

router.get('/api', async function (ctx) {
	ctx.body = 'PDFSense here';
});

router.post('/api/uploads', async function (ctx) {
	const file = ctx.request.files.file;
	//console.log(file)
	if(!file) throw(new Error('File upload failed'))
	const upload = await pdfsense.initialUpload(file)
	ctx.body = {
		fileid: upload.file_id,
		filepath: upload.path,
		name: file.name,
		type: file.type,
		size: file.size
	}
});

router.post('/api/uploads/:fileid/extracted/images', async function (ctx) {
	const result = await pdfsense.extractImagesFromPDF(ctx.params.fileid, ctx.body)
	ctx.body = result
})

router.post('/api/uploads/:fileid/rendered/images', async function (ctx) {
	const result = await pdfsense.renderImagesFromPDF(ctx.params.fileid, ctx.body)
	ctx.body = result
})

router.post('/api/uploads/:fileid/extracted/images/ocr', async function (ctx) {
	const result = await pdfsense.tesseract(ctx.params.fileid, ctx.body, ctx.path, 'txt')
	ctx.body = result
})

router.post('/api/uploads/:fileid/extracted/text', async function (ctx) {
	console.log(ctx.params.fileid)
	ctx.body = {}
})

router.post('/api/uploads/:fileid/rendered/images', async function (ctx) {
	console.log(ctx.params.fileid)
	ctx.body = {}
})

router.post('/api/uploads/:fileid/rendered/images/ocr', async function (ctx) {
	const result = await pdfsense.tesseract(ctx.params.fileid, ctx.body, ctx.path)
	ctx.body = result
})

router.delete('/api/uploads/:fileid', async function (ctx) {
	ctx.body = 'PDFSense here';
});



app.use(function *(){
  this.body = 'Invalid URL!!!';
});

// ROUTES ENDS


var set_port = process.env.PORT || 8200
var server = app.listen(set_port, function () {
	var host = server.address().address
	var port = server.address().port
	console.log('PDFsense running at http://%s:%s', host, port)
})
