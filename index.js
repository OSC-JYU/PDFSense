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
			console.log('ERROR: ' + error);
			context.body = {'error':error};
		}
		//debug(error.stack);
	}
});


//Set up body parsing middleware
app.use(bodyParser({
   formidable:{uploadDir: './data', maxFileSize: 20000 * 1024 * 1024},
   multipart: true,
   urlencoded: true
}));

app.use(router.routes());
app.use(json({ pretty: true, param: 'pretty' }))


// LOGGING
require('winston-daily-rotate-file');

var rotatedLog = new (winston.transports.DailyRotateFile)({
	filename: './logs/pdfsense-%DATE%.log',
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


router.param('sharp_command', (output, ctx, next) => {
	console.log('sharp command found!')
	console.log(ctx.path)
	console.log(ctx.params)
	return next();
})

router.param('tesseract_command', (output, ctx, next) => {
	console.log('tesseract command found!')
	if (!['pdf','text','textpdf'].includes(output)) throw(new Error('Tesseract path must end with /pdf or /text or /textpdf'))
	return next();
})


// ROUTES
router.get('/', async function (ctx) {
	ctx.body = 'PDFSense here. Poppler-utils, Tesseract OCR and CLD language detection at your service.';
});

router.get('/api', async function (ctx) {
	ctx.body = 'PDFSense here';
});

router.get('/api/uploads', async function (ctx) {
	const uploads = await pdfsense.getDirList('')
	ctx.body = uploads
});

router.post('/api/uploads', async function (ctx) {
	const file = ctx.request.files.file;
	//console.log(file)
	if(!file) throw(new Error('File upload failed'))
	const upload = await pdfsense.initialUpload(file, ctx.query.with_date)
	ctx.body = {
		fileid: upload.file_id,
		filepath: upload.path,
		path: `:${server.address().port}/api/uploads/${upload.file_id}`,
		name: file.name,
		type: file.type,
		size: file.size
	}
});

router.post('/api/uploads/:fileid/extracted/images', async function (ctx) {
	const result = await pdfsense.extractImagesFromPDF(ctx.params.fileid, ctx.body)
	ctx.body = result
})

router.post('/api/uploads/:fileid/rendered/:resolution', async function (ctx) {
	const result = await pdfsense.renderImagesFromPDF(ctx.params, ctx.request.body, ctx.query)
	ctx.body = result
})



router.post('/api/uploads/:fileid/extracted/text', async function (ctx) {
	const result = await pdfsense.extractTextFromPDF(ctx.params.fileid, ctx.body)
	ctx.body = {}
})

router.get('/api/uploads/:fileid/zip', async function (ctx) {
	ctx.body = await pdfsense.getArchive(ctx.params.fileid, ctx)
	//ctx.body = uploads
});

router.post('/api/uploads/:fileid/zip', async function (ctx) {
	const uploads = await pdfsense.createArchive(ctx.params.fileid, ctx)
	ctx.body = uploads
});

// catch sharp commands
router.post('/api/uploads/:fileid/(.*)/sharp/:sharp_command',async function (ctx, next) {
	const result = await pdfsense.sharp(ctx.params.fileid, ctx.request.body, ctx.path, ctx.params.sharp_command)
	ctx.body = result
});

// catch tesseract commands
router.post('/api/uploads/:fileid/(.*)/tesseract/:tesseract_command',async function (ctx, next) {
	const result = await pdfsense.tesseract(ctx.params, ctx.request.body, ctx.path, ctx.query)
	ctx.body = result
});

// catch noteshrink commands
router.post('/api/uploads/:fileid/(.*)/noteshrink/:noteshrink_command',async function (ctx, next) {
	const result = await pdfsense.noteshrink(ctx.params, ctx.request.body, ctx.path, ctx.query)
	ctx.body = result
});

// catch pdf combine command
router.post('/api/uploads/:fileid/(.*)/pdf/combined',async function (ctx, next) {
	const result = await pdfsense.combinePDFs(ctx.params, ctx.request.body, ctx.path, ctx.query)
	ctx.body = result
});

// catch pdf generation command
router.post('/api/uploads/:fileid/(.*)/pdf',async function (ctx, next) {
	const result = await pdfsense.images2PDF(ctx.params, ctx.request.body, ctx.path, ctx.query)
	ctx.body = result
});


router.delete('/api/uploads/:fileid', async function (ctx) {
	const result = pdfsense.removeUpload(ctx.params.fileid)
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
