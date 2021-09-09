
const axios 		= require('axios');
var fs 				= require('fs');
var fsp 			= require('fs').promises;
const util 			= require('util');
const stream 		= require('stream')
const path			= require('path')
const {v1:uuid} 	= require('uuid');
const { Poppler } 	= require("node-poppler");


const finished = util.promisify(stream.finished);

const ROOT = 'tmp'

class PDFSense {

	constructor(config) {
		this.config = config
	}


	async extractImagesFromPDF(file_id, options) {
		var filename = this.getFilenameFromFileID(file_id)
		const input_path = path.join(ROOT, file_id)
		const output_path = 'extracted/images'
		const filepath = path.join(input_path, filename)
		await this.createDirs(file_id, output_path)
		await this.PDFImages(filepath, path.join(input_path, output_path))
		var files = await fsp.readdir(path.join(input_path, output_path))
		var response = {files: files}
		return response
	}

	async renderImagesFromPDF(file_id, options) {
		var filename = this.getFilenameFromFileID(file_id)
		const input_path = path.join(ROOT, file_id)
		const output_path = 'rendered/images'
		const filepath = path.join(input_path, filename)
		await this.createDirs(file_id, output_path)
		await this.PDFToPpm(filepath, path.join(input_path, output_path))
		var files = await fsp.readdir(path.join(input_path, output_path))
		var response = {files: files}
		return response
	}

	async tesseract(file_id, options, url_path, output) {
		var p = url_path.split(file_id)[1]
		var filepath = path.join(ROOT, file_id, p.replace('/ocr',''))
		var files = await fsp.readdir(filepath)
		const filelist = files.map(x => path.join(filepath, x))
		if(!output) await this.tesseractToPDF(filelist, options)
		else await this.tesseractToTextFile(filelist, {l:'fin'})
	}

	async tesseractToTextFile(filelist, options) {
		const tesseract = require("node-tesseract-ocr")
		for(const f of filelist) {
			const used = process.memoryUsage().heapUsed / 1024 / 1024;
			console.log(`The script uses approximately ${Math.round(used * 100) / 100} MB`);
			console.log('OCR: ' + f)
			const text = await tesseract.recognize(f, options)
			await fsp.writeFile(path.join('tmp', path.basename(f) + '.txt'), text, 'utf8')
			//await this.saveText(text, path.join(ROOT, file_id, p))
		}
		return 'done'
	}

	async tesseractToPDF(filelist, options) {
		const tesseract = require("node-tesseract-ocr")

		return 'done'
	}

	getFilenameFromFileID(file_id) {
		return file_id.split('-')[1]
	}


	async PDFImages(filepath, outpath, options) {

		if(!options) {
			options = {
				allFiles: true
			}
		}
		const poppler = new Poppler('/usr/bin/');
		console.log(outpath)
		await poppler.pdfImages(filepath, outpath + '/page', options)
		// then OCR those toImages

		// create new PDF
	}

	async PDFToPpm(filepath, outpath, options) {
		if(!options) {
			options = {
				cropBox: true
			}
		}
		const poppler = new Poppler('/usr/bin/');
		await poppler.pdfToPpm(filepath, outpath + '/page', options);

	}


	async initialUpload(file) {
		var sanitize = require("sanitize-filename");

		const filename_clean = sanitize(file.name)
		//const file_id = uuid()
		const file_id = this.createFileID(filename_clean)
		console.log(file_id)
		await fsp.mkdir(path.join('tmp', file_id))
		const target_path = path.join('tmp', file_id, filename_clean)

		await fsp.rename(file.path, target_path)
		return {file_id: file_id, path: target_path}
		//await fsp.unlink(file.path)
	}

	async saveFile(ctx) {
		var fs = require('fs');
		var fsp = require('fs').promises;

		const file_id = uuid()
		//console.log(ctx.request.files)
		const file = ctx.request.files.file;

		const reader = fs.createReadStream(file.path);
		const stream = fs.createWriteStream(path.join('tmp', file_id));
		reader.pipe(stream);
		console.log('uploading %s -> %s', file.name, stream.path);

		reader.on('error', function(e){
			console.log(e.message);
		})

		// promise
		var end = new Promise(function(resolve, reject) {
			stream.on('finish', async () => {
				//console.log(file)

				resolve();
			})
			stream.on('error', reject);
		});


		return end;
	}

	async downloadFile(fileUrl) {
		const file_id = uuid()
		const writer = fs.createWriteStream(path.join('tmp', file_id));
		return new Promise(function(resolve, reject) {
			axios({
				method: 'get',
				url: fileUrl,
				responseType: 'stream',
			}).then(async response => {
				response.data.pipe(writer);
				resolve({'file_id':file_id})
				//return finished(writer); //this is a Promise
			});
		});

	}


	async createPageImage(pdf_id, page) {
		var file = path.join('data', pdf_id)
		var pdfImage = new PDFImage(file);

		//var imagepath = 'tmp/'

		pdfImage.convertPage(0).then(function (imagepath) {
			console.log(imagepath)
		  // 0-th page (first page) of the slide.pdf is available as slide-0.png
		  fs.existsSync("/tmp/slide-0.png") // => true
		});

	}

	async removePDF(pdf_id) {


	}

	async createDirs(file_id, dpath) {
		// just in case
		if(ROOT.startsWith('/')) throw(new Error('Check your ROOT constant!'))

		let [dir, subdir] = dpath.split('/')
		try {
			await fsp.mkdir(path.join(ROOT, file_id, dir))
		} catch(e) {
			console.log(`${dir } exists`)
		}

		try {
			await fsp.mkdir(path.join(ROOT, file_id, dir, subdir))
		} catch(e) {
			try {
				await fsp.rmdir(path.join(ROOT, file_id, dir, subdir), { recursive: true, force: true })
				await fsp.mkdir(path.join(ROOT, file_id, dir, subdir))
			} catch(e) {
				console.log(e)
				throw(new Error(`Directory creation failed: ${ROOT}/${file_id}/${dir}/${subdir}`))
			}
		}
	}

	createFileID(filename) {
		function pad2(n) { return n < 10 ? '0' + n : n }
		var date = new Date();
		var t = date.getFullYear().toString() +'.'+ pad2(date.getMonth() + 1) +'.'+ pad2( date.getDate()) +'_'+ pad2( date.getHours() ) +':'+ pad2( date.getMinutes() ) +':'+ pad2( date.getSeconds() )
		return t + '-' + filename
	}


}

function isEntryPoint() {
  return require.main === module;
}

module.exports = PDFSense;

async function main() {

	console.log('is entrypoint')
	const pdfsense = new PDFSense()
	//var pdf = await pdfsense.downloadFile('https://jyx.jyu.fi/bitstream/handle/123456789/40157/978-951-39-4908-2.pdf?sequence=1&isAllowed=y', 'filu.pdf')
	var pdf = await pdfsense.downloadFile('http://www.africau.edu/images/default/sample.pdf', 'filu.pdf')
	console.log(pdf)
	var file = path.join('tmp', pdf.file_id)

	// TODO: find out why node poppler did not work!
	//const file = "test_document.pdf";
	// const poppler = new Poppler('/usr/bin/');
	// const options = {
	// 	firstPageToConvert: 1,
	// 	lastPageToConvert: 1,
	// 	pngFile: true,
	// };
	// const outputFile = 'test_document.png';

	//const res = await poppler.pdfToCairo(file, null, options);

	const exec = require('child_process').exec;

	var args = []
/*
	const child = exec('/usr/bin/pdftocairo -f 1 -l 1 -png ' + file, (error, stdout, stderr) => {
    	if (error) {
        	console.error('stderr', stderr);
        	throw error;
    	}
    	console.log('stdout', stdout);
	});

	const child2 = exec('/usr/bin/pdftoppm -r 300 -cropbox tmp/2000.pdf tmp/page', (error, stdout, stderr) => {
    	if (error) {
        	console.error('stderr', stderr);
        	throw error;
    	}
    	console.log('stdout', stdout);
	});
*/
	const poppler = new Poppler('/usr/bin/');
	const options = {
		cropBox: true,
		resolutionXYAxis:300
	}
	var res = await poppler.pdfToPpm('tmp/2000.pdf', 'tmp/page', options);
	console.log(res)
}

if(isEntryPoint) {
//main()
}
