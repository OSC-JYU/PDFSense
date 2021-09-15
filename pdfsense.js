
const axios 		= require('axios');
var fs 				= require('fs');
var fsp 			= require('fs').promises;
const util 			= require('util');
const stream 		= require('stream')
const path			= require('path')
const sharp 		= require('sharp');
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
		await fsp.mkdir(path.join(input_path, output_path), { recursive: true })
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
		//await this.createDirs(file_id, output_path)
		await fsp.mkdir(path.join(input_path, output_path), { recursive: true })
		await this.PDFToPpm(filepath, path.join(input_path, output_path))
		var files = await fsp.readdir(path.join(input_path, output_path))
		var response = {files: files}
		return response
	}

	async tesseract(params, options, url_path, query) {
		const file_id = params.fileid
		const command_path = `/tesseract/${params.tesseract_command}`
		console.log(command_path)
		var p = url_path.split(file_id)[1]
		const input_path = path.join(ROOT, file_id, p.replace(command_path,''))
		const out_path =  path.join(ROOT, file_id, p)
		var files = await this.getFileList(input_path, input_path)
		//if(ctx.params.lang)
		if(query.lang) {
			options.lang = query.lang
		}
		console.log(`tesseract options: ${JSON.stringify(options, null, 2)}`)
		if(params.tesseract_command === 'pdf') await this.tesseractToPDF(files, options, out_path)
		else await this.tesseractToTextFile(files, options, out_path)
	}

	async sharp(file_id, options, url_path, command) {
		const command_path = `/sharp/${command}`
		var p = url_path.split(file_id)[1]
		const input_path = path.join(ROOT, file_id, p.replace(command_path,''))
		const out_path =  path.join(ROOT, file_id, p)
		var files = await this.getFileList(input_path, '')
		await fsp.mkdir(out_path, { recursive: true })
		//const filelist = files.map(x => path.join(input_path, x))
		for(const f of files) {
			console.log(f)
			await sharp(path.join(input_path, f)).rotate(90).toFile(path.join(out_path, f))

		}

	}

	async tesseractToTextFile(filelist, options, out_path) {
		await fsp.mkdir(out_path, { recursive: true })
		const tesseract = require("node-tesseract-ocr")
		let result = []
		for(const f of filelist) {
			const used = process.memoryUsage().heapUsed / 1024 / 1024;
			console.log(`The script uses approximately ${Math.round(used * 100) / 100} MB`);
			console.log('processing ' + f)
			const text = await tesseract.recognize(f, options)
			await fsp.writeFile(path.join(out_path, path.basename(f) + '.txt'), text, 'utf8')
			result.push(text)
		}
		// create fulltext.txt
		result = result.map((x , index) => '\n\n--- ' + index + ' ---\n\n' + x )
		await fsp.writeFile(path.join(out_path, 'fulltext.txt'), result.join(''), 'utf8')
		return 'done'
	}

	async tesseractToPDF(filelist, options) {
		const tesseract = require("node-tesseract-ocr")

		return 'done'
	}

	getFilenameFromFileID(file_id) {
		return file_id.split('-')[0]
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
				cropBox: true,
				pngFile: true,
				resolutionXYAxis: 300
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

	async getFileList(input_path, fullpath) {
		var files = await fsp.readdir(input_path, { withFileTypes: true })
		return files
			.filter(dirent => dirent.isFile())
        	.map(dirent => dirent.name)
			.map(x => path.join(fullpath, x))
	}

	createFileID(filename) {
		function pad2(n) { return n < 10 ? '0' + n : n }
		var date = new Date();
		var t = date.getFullYear().toString() +'.'+ pad2(date.getMonth() + 1) +'.'+ pad2( date.getDate()) +'_'+ pad2( date.getHours() ) +':'+ pad2( date.getMinutes() ) +':'+ pad2( date.getSeconds() )
		return filename + '-' + t
	}

	async noteshrink() {
		let pp = await koe(success, nosuccess)
	}

}

function isEntryPoint() {
  return require.main === module;
}

function koe(success, nosuccess) {
	return new Promise(function(success, nosuccess) {
		console.log('pam********************************')
		const { spawn } = require('child_process');
		const pyprog = spawn('python', ['./../pypy.py']);

		pyprog.stdout.on('data', function(data) {

			success(data);
		});

		pyprog.stderr.on('data', function(data) {
			console.log('sd')
			console.log(data)
			return success(data);
			//nosuccess(data);
		});
	});
}



function success(data) {
console.log('pommi')
}

function nosuccess(data) {
	console.log('pammi')
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
