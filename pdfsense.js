
var fs 				= require('fs');
var fsp 			= require('fs').promises;
const util 			= require('util');
const stream 		= require('stream')
const path			= require('path')
const sharp 		= require('sharp');
const {v1:uuid} 	= require('uuid');
const { Poppler } 	= require("node-poppler");


const finished = util.promisify(stream.finished);

const ROOT = 'data'
const ALL_IMAGE_TYPES = ['.jpg','.png','.tiff','.ppm','.pbm','.ccitt']

const SHARP_COMMANDS = {
	rotate: {'angle': 90},
	blur: {'sigma':1},
	sharpen: {'sigma':1},
	flip: {},
	flop: {},
	trim: {'trim_threshold':10},
	grayscale: {},
	negate: {},
	threshold:{'threshold': 128}
}

class PDFSense {

	constructor(config) {
		this.config = config
		this.sharp_commands = SHARP_COMMANDS
	}


	async initialUpload(file, query) {
		var sanitize = require("sanitize-filename");
		const prefix = query.prefix ? query.prefix : ''
		const filename_clean = sanitize(file.name)
		var file_id = ''
		var target_path = ''
		//const file_id = uuid()
		try {
			file_id = this.createFileID(filename_clean, query, prefix)
			console.log(file_id)
			await fsp.mkdir(path.join(ROOT, file_id))
			target_path = path.join(ROOT, file_id, prefix + filename_clean)

			await fsp.rename(file.path, target_path)
			return {file_id: file_id, path: target_path}
		} catch (e) {
			await fsp.unlink(file.path) // remove uploaded file
			if(e.code == 'EEXIST') {
				return {file_id: file_id, path: target_path}
			} else {
				throw(e)
			}
		}
	}


	createFileID(filename, query, prefix) {

		if(!query.with_date && !query.prefix) return filename
		function pad2(n) { return n < 10 ? '0' + n : n }
		var date = new Date();
		var t = date.getFullYear().toString() +'_'+ pad2(date.getMonth() + 1) +'_'+ pad2( date.getDate()) +'_'+ pad2(date.getHours()) + ':' + pad2(date.getMinutes()) + ':' + pad2( date.getSeconds() )
		if(query.with_date)
			return prefix + filename + '____' + t
		else if(query.prefix)
			return prefix + filename
	}


	async removeUpload(file_id) {
		fsp.rm(path.join(ROOT, file_id), { recursive: true });
	}


	async getPaths(params, new_path) {
		const paths = {}
		paths.filename = this.getFilenameFromFileID(params.fileid)
		paths.input_path = path.join(ROOT, params.fileid)
		paths.output_path = path.join(ROOT, params.fileid, new_path)
		// orientation
		if(params.orientation) {
			if(!await this.exists(path.join(paths.input_path, 'orientation', params.orientation))) {
				throw('Orientation path not found: ' + path.join(paths.input_path, 'orientation', params.orientation))
			}
			paths.output_path = path.join(ROOT, params.fileid, 'orientation', params.orientation, new_path)
		}
		console.log(paths)
		return paths
	}


	async extractImagesFromPDF(params, options, query) {
		const {filename, input_path, output_path} = await this.getPaths(params, 'extracted/images')
		if(await this.exists(output_path)) throw(`Output directory exists (${output_path})`)
		const filepath = path.join(input_path, filename)
		if(!await this.exists(filepath)) throw(`PDF file not found! file: ${params.fileid}`)

		if(query.jpeg) options.jpegFile = true
		// default output format
		if(query.format && query.format === 'png') options.pngFile = true
		else if(query.format && query.format === 'tiff') options.tiffFile = true

		await fsp.mkdir(output_path, { recursive: true })
		await this.PDFImages(filepath, output_path, options)
		var files = await this.getImageList(output_path, '', ['.jpg','.png','.tiff','.ppm','.pbm','.ccitt'])
		var response = {files: files}
		return response
	}


	async extractTextFromPDF(params, options) {
		const {filename, input_path, output_path} = await this.getPaths(params, 'extracted/text')
		if(await this.exists(output_path)) throw(`Output directory exists (${output_path})`)
		const filepath = path.join(input_path, filename)
		if(!await this.exists(filepath)) throw(`PDF file not found! file: ${params.fileid}`)

		await fsp.mkdir(output_path, { recursive: true })
		await this.PDFToText(filepath, output_path)
		var files = await fsp.readdir(output_path)
		var response = {files: files}
		return response
	}


	async renderImagesFromPDF(params, options, query) {
		if(!params.resolution || !parseInt(params.resolution)) throw('Invalid render resolution (must be integer)')
		const {filename, input_path, output_path} = await this.getPaths(params, 'rendered/' + params.resolution)
		if(await this.exists(output_path)) throw(`Output directory exists (${output_path})`)

		options.resolutionXYAxis = parseInt(params.resolution)
		if(query.format && ['jpg', 'jpeg'].includes(query.format)) options.jpegFile = true
		else options.pngFile = true
		if(!options.cropBox) options.cropBox = true

		const filepath = path.join(input_path, filename)
		if(!await this.exists(filepath)) throw('PDF file not found: ' + filepath)
		await fsp.mkdir(output_path, { recursive: true })
		console.log(output_path)

		const poppler = new Poppler('/usr/bin/');
		await poppler.pdfToPpm(filepath, output_path + '/page', options);
		var files = await this.getImageList(output_path, '')
		var response = {files: files}
		return response
	}


	async process_sharp(params, options, url_path, query) {
		const file_id = params.fileid
		var splitted = url_path.split('/')
		var command = splitted[splitted.length-2]
		const command_path = `${command}/${params.parameter}`

		var p = url_path.split(file_id)[1]
		const input_path = path.join(ROOT, file_id, p.replace(command_path,''))
		const out_path =  path.join(ROOT, file_id, p)
		var files = await this.getImageList(input_path, '')
		await fsp.mkdir(out_path, { recursive: true })

		for(const f of files) {
			//console.log(`${commands[0]} ${this.getParams(query,commands[0])} ${f} `)
			await sharp(path.join(input_path, f))[command](parseInt(params.parameter)).toFile(path.join(out_path, f))
		}
	}


	async sharp(params, options, url_path, query) {
		const file_id = params.fileid
		const command_path = `/sharp/${params.sharp_command}`
		var p = url_path.split(file_id)[1]
		const input_path = path.join(ROOT, file_id, p.replace(command_path,''))
		const out_path =  path.join(ROOT, file_id, p)
		var files = await this.getImageList(input_path, '')
		await fsp.mkdir(out_path, { recursive: true })

		var commands = params.sharp_command.split('_')
		if(commands.length == 1) {
			for(const f of files) {
				console.log(`${commands[0]} ${this.getParams(query,commands[0])} ${f} `)
				await sharp(path.join(input_path, f))[commands[0]](this.getParams(query,commands[0])).toFile(path.join(out_path, f))

			}
		} else if(commands.length == 2) {
			for(const f of files) {
				console.log(`${commands[0]} ${this.getParams(query,commands[0])} ${commands[1]} ${this.getParams(query,commands[1])} ${f} `)
				await sharp(
					path.join(input_path, f))
					[commands[0]](this.getParams(query,commands[0]))
					[commands[1]](this.getParams(query,commands[1]))
					.toFile(path.join(out_path, f))
			}
		} else if(commands.length == 3) {
			for(const f of files) {
				console.log(`${commands[0]} ${this.getParams(query,commands[0])} ${commands[1]} ${this.getParams(query,commands[1])} ${commands[2]} ${this.getParams(query,commands[2])} ${f} `)
				await sharp(
					path.join(input_path, f))
					[commands[0]](this.getParams(query,commands[0]))
					[commands[1]](this.getParams(query,commands[1]))
					[commands[2]](this.getParams(query,commands[2]))
					.toFile(path.join(out_path, f))
			}
		}
	}


	getParams(query, command) {
		var out = null
		if(command in SHARP_COMMANDS) {
			for(var p of Object.keys(SHARP_COMMANDS[command])) {
				out = SHARP_COMMANDS[command][p]
				if(query[p]) {
					out = parseInt(query[p])
				}
			}
		} else {
			throw(`Sharp command '${command}' not found! available commands: ${Object.keys(SHARP_COMMANDS)}`)
		}
		return out
	}


	async tesseract(params, options, url_path, query) {
		const file_id = params.fileid
		const command_path = `/ocr/${params.tesseract_command}`
		var p = url_path.split(file_id)[1]
		const input_path = path.join(ROOT, file_id, p.replace(command_path,''))
		const out_path =  path.join(ROOT, file_id, p + '/')
		if(!await this.exists(input_path)) throw(`Input path not found! (${input_path})`)
		var filelist = await this.getImageList(input_path, input_path, ALL_IMAGE_TYPES)
		if(filelist.length === 0) throw('No images found!')

		if(await this.exists(out_path)) throw(`Output directory exists (${out_path})`)

		try {
			await fsp.mkdir(out_path, { recursive: true })
			await fsp.writeFile(path.join(out_path, 'files.txt'), filelist.join('\n'), 'utf8')
		} catch(e) {
			throw('Could not create files.txt ' + e)
		}

		if(query.lang) {
			options.lang = query.lang
		}
		console.log(`tesseract options: ${JSON.stringify(options, null, 2)}`)
		if(params.tesseract_command === 'pdf') {
			options.pdf = true
			 await this.tesseractToPDF(filelist, options, out_path, 'full')
		} else if(params.tesseract_command === 'textpdf') {
			options.pdf = true
			if(!options.c) options.c = {}
			options.c['textonly_pdf'] = 1
			await this.tesseractToPDF(filelist, options, out_path, 'ocr')
		} else if(params.tesseract_command === 'text') {
			await this.tesseractToText(filelist, options, out_path, '')
		}
	}


	async tesseractToText(filelist, options, out_path, outfile) {

		var result = {log: [], data: [], cli: '', exitcode: ''}
		for(const f of filelist) {
			const used = process.memoryUsage().heapUsed / 1024 / 1024;
			console.log(`The script uses approximately ${Math.round(used * 100) / 100} MB`);
			console.log('processing ' + f)
			//const text = await tesseract.recognize(f, options)
			try {
				console.log(options)
				await this.tesseract_spawn(f, options, path.join(out_path, path.basename(f)), outfile, result)
				await fsp.writeFile(path.join(out_path, 'ocr.cli'), result.cli.join(' '), 'utf8')
				await fsp.writeFile(path.join(out_path, 'ocr.log'), result.log.join(' '), 'utf8')
			} catch(e) {
				console.log(e)
				await fsp.writeFile(path.join(out_path, 'ocr.cli'), e.cli.join(' '), 'utf8')
				await fsp.writeFile(path.join(out_path, 'ocr.log'), e.log.join(' '), 'utf8')
			}
			//await fsp.writeFile(path.join(out_path, path.basename(f) + '.txt'), text, 'utf8')
			//result.push(text)
		}
		// create fulltext.txt
		//result = result.map((x , index) => '\n\n--- ' + index + ' ---\n\n' + x )
		//await fsp.writeFile(path.join(out_path, 'fulltext.txt'), result.join(''), 'utf8')
		console.log('OCR done')
		return 'done'
	}


	async tesseractToPDF(filelist, options, out_path, outfile) {
		var result = {log: [], data: [], cli: '', exitcode: ''}
		try {
			await this.tesseract_spawn(filelist, options, out_path, outfile, result)
			await fsp.writeFile(path.join(out_path, 'ocr.cli'), result.cli.join(' '), 'utf8')
			await fsp.writeFile(path.join(out_path, 'ocr.log'), result.log.join('\n'), 'utf8')
		} catch(e) {
			if(e.cli) await fsp.writeFile(path.join(out_path, 'ocr.cli'), e.cli.join(' '), 'utf8')
			if(e.log) await fsp.writeFile(path.join(out_path, 'ocr.log'), e.log.join('\n'), 'utf8')
			throw(e)
		}
		console.log('OCR done')
		return 'done'
	}

	tesseract_spawn(filelist, options, out_path, outfile, result) {
		const spawn = require("child_process").spawn
		var args = []
		if(options.c) {
			for(var parameter in options.c) {
				args.push('-c')
				args.push(`${parameter}=${options.c[parameter]}`)
			}
		}
		if(options.lang) {
			args.push('-l')
			args.push(options.lang)
		}

		if(Array.isArray(filelist)) args.push(path.join(out_path, 'files.txt'))
		else args.push(filelist)
		if(out_path) args.push(path.join(out_path, outfile))
		if(options.pdf) args.push('pdf')
		if(options.psm ===  0) {
			args.push('-')
			args.push('--psm')
			args.push(0)
		}


		console.log(args)
		return new Promise((resolve, reject) => {
			 var child = spawn('tesseract', args);
			 console.log(child.spawnargs)
			 result.cli = child.spawnargs

			child.stdout.setEncoding('utf8');
	 		child.stdout.on('data', function (data) {
	 			console.log('stdout: ' + data);
				//result.log.push(child.spawnargs)
				result.data.push(data)
	 		});
			child.stderr.setEncoding('utf8');
	 		child.stderr.on('data', function (data) {
	 			console.log('stderr: ' + data);
				result.log.push(data)
	 		});
	 		child.on('close', function (code) {
	 			console.log('child process exited with code ' + code);
				result.log.push(code)
				result.exitcode = code
				resolve(result)
	 		});
			child.on('error', function (code) {
	 			console.log('child process errored with code ' + code);
				result.exitcode = code
				reject(result)
	 		});
		 })
	}



	async getPageCountFromPDF(filepath) {
		const poppler = new Poppler('/usr/bin/');
		var info = await poppler.pdfInfo(filepath, {});
		const regex = /Pages:( *)([0-9]*)/gm
		var page_count = 0
		let m;

		while ((m = regex.exec(info)) !== null) {
			// This is necessary to avoid infinite loops with zero-width matches
			if (m.index === regex.lastIndex) {
				regex.lastIndex++;
			}

			if(m[2] && parseInt(m[2])) page_count = parseInt(m[2])
			else console.log('Could not find page count from info')
		}
		return page_count
	}


	async detectOrientation(params, options, url_path, query) {
		if(!query.resolution || !parseInt(query.resolution)) throw('You must provide integer as "resolution" query paramater. For example "/orientation?resolution=300"')
		const file_id = params.fileid
		const command_path = `/orientation`
		var p = url_path.split(file_id)[1]
		const input_path = path.join(ROOT, file_id, p.replace(command_path,''))
		const out_path =  path.join(ROOT, file_id, p + '/')
		await fsp.mkdir(out_path)

		var filename = this.getFilenameFromFileID(file_id)
		const filepath = path.join(input_path, filename)
		console.log('filepath: ' + filepath)
		console.log('out: ' + out_path)

		var page_count = await this.getPageCountFromPDF(filepath)

		var options = {resolutionXYAxis: parseInt(query.resolution), jpegFile: true}
		const poppler = new Poppler('/usr/bin/');
		await poppler.pdfToPpm(filepath, out_path + '/page', options);


		var filelist = await this.getImageList(out_path, out_path)
		var result = {log: [], data: [], cli: '', exitcode: ''}
		options.psm = 0
		var degrees = []
		const data_txt_stream = fs.createWriteStream(path.join(out_path, 'data.txt'), { flags: 'a' })
		for(const f of filelist) {
			const used = process.memoryUsage().heapUsed / 1024 / 1024;
			console.log(`The script uses approximately ${Math.round(used * 100) / 100} MB`);
			console.log('processing ' + f)
			try {
				await this.tesseract_spawn(f, options, null, null, result)

				if(result.data && result.data.length && result.data[0].includes('Orientation in degrees:')) {
					var data = result.data[0].split('\n')
					try {
						var degree = parseInt(data[1].replace('Orientation in degrees:',''))
						degrees.push(degree)
					} catch(e) {
						throw(e)
					}
				}
				data_txt_stream.write(path.join(out_path, path.basename(f)) + '\n')
				data_txt_stream.write(result.data.join(' '))
				//await fsp.appendFile(path.join(out_path, 'data.txt'), result.data.join(' '), 'utf8')
				await fsp.writeFile(path.join(out_path, 'ocr.log'), result.log.join(' '), 'utf8')
				result.data  = []
			} catch(e) {
				console.log(e)
				await fsp.writeFile(path.join(out_path, 'ocr.cli'), e.cli.join(' '), 'utf8')
				await fsp.writeFile(path.join(out_path, 'ocr.log'), e.log.join(' '), 'utf8')
			}
		}


		// check the most common orientation and create directory for it
		const counts = {}
		degrees.forEach(function (x) { counts[x] = (counts[x] || 0) + 1; });
		var max = 0
		var angle = null
		for(var key in counts) {
  			if(counts[key] > max) {
				max = counts[key]
				angle = key
			}
		}
		if(angle) {
			data_txt_stream.write('\nORIENTATIONS FOUND:\n' + JSON.stringify(counts))
			data_txt_stream.write('\nCreating directory ' + angle)
			data_txt_stream.close()
			const image_path = path.join(out_path, angle, 'rendered', query.resolution)
			console.log('Creating image directory ' + image_path)
			await fsp.mkdir(image_path, { recursive: true })
			await this.moveFiles(out_path, image_path)
		} else {
			data_txt_stream.write('\nOrientation not found!')
			data_txt_stream.close()
			console.log('Orientation not found')
			throw('Orientation not found!')
		}

		//await fsp.copyFile(filepath, path.join(out_path, angle, filename))
	}



	async noteshrink(params, options, url_path, query) {
		const file_id = params.fileid
		const command_path = `/noteshrink/${params.noteshrink_command}`
		console.log(command_path)
		var p = url_path.split(file_id)[1]
		const input_path = path.join(ROOT, file_id, p.replace(command_path,''))
		console.log(input_path)
		const out_path =  path.join(ROOT, file_id, p)
		await fsp.mkdir(out_path, { recursive: true })
		var filelist = await this.getImageList(input_path, input_path)
		await fsp.writeFile(path.join(out_path, 'files.txt'), filelist.join('\n'), 'utf8')
		var result = {log: [], cli: []}

		for(const file of filelist) {
			try {
				var outfile = path.basename(file).split('.').slice(0, -1).join('.')
				var args = ['noteshrink/noteshrink.py', '-b'+out_path+'/'+outfile, file]
				var out = await this.spawn('python3', args)
				result.cli.push(out.cli)
				result.log.push(out.log)
			} catch(e) {
				console.log(`Problem with file ${file} \n ${e}`)
			}
		}

		await fsp.writeFile(path.join(out_path, 'noteshrink.cli'), result.cli.join('\n'), 'utf8')
		await fsp.writeFile(path.join(out_path, 'noteshrink.log'), result.log.join('\n'), 'utf8')
		return result
	}


	async combinePDFs(params, options, url_path, query, combine2original) {
		const file_id = params.fileid
		const prefix = query.prefix ? query.prefix : ''
		const command_path = `/combined`
		var p = url_path.split(file_id)[1]
		var input_path = path.join(ROOT, file_id, p.replace(command_path,''))
		if(!await this.exists(input_path)) throw(`Input directory not found (${input_path})`)
		var out_path =  path.join(ROOT, file_id, p + '/')
		var result = {}

		await fsp.mkdir(out_path, { recursive: true })

		// combine ocr.pdf to the original pdf
		if(combine2original) {
			const original_path = path.join(ROOT, file_id, file_id)
			var qpdf_args = [original_path, '--underlay', input_path + '/ocr.pdf','--',out_path + '/' + prefix + file_id]
			result = await this.spawn('qpdf', qpdf_args)

		// combine PDF created froma images to ocr.pdf
		} else {


			// find out where textonly PDF is (ocr.pdf)
			var dirs = []
			for await (const f of this.getTextPdfDirs(path.join(ROOT, file_id))) {
	  			console.log(f);
				dirs.push(f)
			}
			var result = {}
			if(dirs.length > 0) {
				var qpdf_args = ['--empty', '--pages', input_path + '/images.pdf', '--', '--underlay',dirs[dirs.length-1] + '/ocr.pdf','--',out_path + 'full.pdf']
				result = await this.spawn('qpdf', qpdf_args)
				result.used_textonlypdf = dirs[dirs.length-1]
				if(dirs.length > 1) {
					result.textonlypdf_dirs = dirs
				}
			}

		}

		await fsp.writeFile(path.join(out_path, 'qpdf.cli'), result.cli, 'utf8')
		await fsp.writeFile(path.join(out_path, 'qpdf.log'), result.log.join('\n'), 'utf8')
		return result

	}


	async images2PDF(params, options, url_path, query) {
		const file_id = params.fileid
		const command_path = `/pdf`
		var p = url_path.split(file_id)[1]
		const input_path = path.join(ROOT, file_id, p.replace(command_path,''))
		console.log(input_path)
		const out_path =  path.join(ROOT, file_id, p)
		await fsp.mkdir(out_path, { recursive: true })
		var filelist = await this.getImageList(input_path, input_path, ['.jpg', 'jpeg', '.png', '.tiff', '.tif', '.ppm'])
		if(filelist.length === 0) throw('No images found!')

		await fsp.writeFile(path.join(out_path, 'files.txt'), filelist, 'utf8')
		filelist.push('-o')
		filelist.push(out_path + '/images.pdf')
		var result = await this.spawn('img2pdf', filelist)
		await fsp.writeFile(path.join(out_path, 'convert.cli'), result.cli, 'utf8')
		await fsp.writeFile(path.join(out_path, 'convert.log'), result.log.join('\n'), 'utf8')
		return result
	}


	spawn(command, args) {
		const spawn = require("child_process").spawn
		var result = {log: [], cli: '', exitcode: ''}

		 return new Promise((resolve, reject) => {
			var child = spawn(command, args);
			console.log(child.spawnargs)
			result.cli = child.spawnargs.join(' ')

			child.stdout.setEncoding('utf8');
	 		child.stdout.on('data', function (data) {
	 			console.log('stdout: ' + data);
				result.log.push(data)
	 		});
			child.stderr.setEncoding('utf8');
	 		child.stderr.on('data', function (data) {
	 			console.log('stderr: ' + data);
				result.log.push(data)
	 		});
	 		child.on('close', function (code) {
	 			console.log('child process exited with code ' + code);
				result.log.push(code)
				result.exitcode = code
				resolve(result)
	 			//file.end();
	 		});
			child.on('error', function (code) {
	 			console.log('child process errored with code ' + code);
				result.exitcode = code
				reject(result)
	 			//file.end();
	 		});
		 })
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
	}


	async PDFToText(filepath, outpath, options) {
		if(!options) {
			options = {
			}
		}
		const poppler = new Poppler('/usr/bin/');
		await poppler.pdfToText(filepath, outpath + '/text.txt', options);
	}


	async getArchive(file_id, ctx) {
		var filename = this.getFilenameFromFileID(file_id)
		const input_path = path.join(ROOT, file_id)
		console.log(path.join(input_path, `${filename}.zip`))
		const src = fs.createReadStream(path.join(input_path, `${filename}.zip`));
		ctx.attachment(`${filename}.zip`)
        ctx.response.set("content-type", "application/octet-stream");
        ctx.response.body = src;
		src.pipe(ctx.res);

		var end = new Promise(function(resolve, reject) {
		    src.on('close', () => { console.log('finish'); resolve()});
		    src.on('error', reject);
		});

		return end
	}


	async createArchive(file_id, ctx) {
		const archiver = require('archiver');
		var filename = this.getFilenameFromFileID(file_id)
		const input_path = path.join(ROOT, file_id)
		const output = fs.createWriteStream(path.join(input_path, filename + '.zip'), {flags:'w'});
		const archive = archiver('zip', {
		  zlib: { level: 0 } // Do not compress, images compresses badly.
		});
		archive.pipe(output);
		var end = new Promise(function(resolve, reject) {
			output.on('finish', async () => {
				console.log('done')
				resolve({file: filename + '.zip', fetch:`/api/uploads/${file_id}/zip`});
			})
			output.on('close', async () => {
				console.log('done')
				resolve('close');
			})
			output.on('error', reject);
			archive.on('error', reject);
		});

		archive.file(path.join(input_path, filename), {name: filename})
		archive.directory(path.join(input_path, 'extracted'), 'extracted');
		archive.directory(path.join(input_path, 'rendered'), 'rendered');
		archive.finalize()

		return end;
	}


	async getFile(file_id, filename, ctx) {
		var p = ctx.path.split(file_id)[1]
		var input_path = path.join(ROOT, file_id, p, filename)
		console.log(input_path)
		const src = fs.createReadStream(input_path);
		ctx.attachment(filename)
        ctx.response.set("content-type", "application/octet-stream");
        ctx.response.body = src;
		src.pipe(ctx.res);

		var end = new Promise(function(resolve, reject) {
		    src.on('close', () => { console.log('finish'); resolve()});
		    src.on('error', reject);
		});

		return end
	}


	getFilenameFromFileID(file_id) {
		return file_id.split('____')[0]
	}

	async moveFiles(input_path, out_path, filter) {
		if(!filter) filter = ['.png','.jpg','.tiff']
		var files = await fsp.readdir(input_path, { withFileTypes: true })
		var filelist = files
			.filter(dirent => dirent.isFile())
			.map(dirent => dirent.name)
			.filter(f => filter.includes(path.extname(f)))

		for(var file of filelist) {
			await fsp.rename(path.join(input_path, file), path.join(out_path, file))
		}
	}

	async getImageList(input_path, fullpath, filter) {
		console.log(input_path)
		if(!filter) filter = ['.png','.jpg','.tiff']
		var files = await fsp.readdir(input_path, { withFileTypes: true })
		return files
			.filter(dirent => dirent.isFile())
        	.map(dirent => dirent.name)
			.filter(f => filter.includes(path.extname(f)))
			.map(x => path.join(fullpath, x))
	}


	async getDirList(input_path) {
		var files = await fsp.readdir(path.join(ROOT, input_path), { withFileTypes: true })
		return files
			.filter(dirent => !dirent.isFile())
        	.map(dirent => dirent.name)
	}


	async * getTextPdfDirs(dir) {
		const dirents = await fsp.readdir(dir, { withFileTypes: true });
		for (const dirent of dirents) {
			const res = path.join(dir, dirent.name);
			if (dirent.isDirectory()) {
				if(res.includes('ocr/textpdf')) yield res;
				else yield* this.getTextPdfDirs(res);
			}
		}
	}


	async exists (path) {
		try {
			await fsp.access(path)
			return true
		} catch {
			return false
		}
	}


}

function isEntryPoint() {
  return require.main === module;
}

module.exports = PDFSense;
