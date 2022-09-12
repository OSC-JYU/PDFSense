
var fs 				= require('fs')
var fsp 			= require('fs').promises
const util 			= require('util')
const stream 		= require('stream')
const path			= require('path')
var sanitize 		= require('sanitize-filename')

const PDFSense 		= require("./pdfsense.js")

const pdfsense 		= new PDFSense()

const ROOT = 'data'

const finished = util.promisify(stream.finished);



class Batch {

	constructor(config) {
		this.config = config

	}

	async init() {
		const {default: got} = await import('got')
		this.got = got
	}

	async process(req_path, dir) {
		var files = await pdfsense.getFileList(dir, '', ['.pdf'])
		const process_path = req_path.split('/api/batch/')[1]

		for(var file of files) {
			try {
				const file_id = await this.copyFile(dir, file)
				var commands = this.splitPath(process_path)
				console.log(commands)

				var url = `http://localhost:8200/api/uploads/${file_id}/extracted/images`
				console.log(url)
				var r = await this.got.post(url)
			} catch (e) {
				console.log(e)
				throw(e)
			}
		}



		return files
	}

	async copyFile(input_dir, file) {
		const input_path = path.join(input_dir, file)
		const filename_clean = sanitize(file)
		const file_id = pdfsense.createFileID(file, true)
		await fsp.mkdir(path.join(ROOT, file_id))
		const target_path = path.join(ROOT, file_id, filename_clean)

		await fsp.copyFile(input_path, target_path)
		return file_id

	}

	splitPath(url) {
		var tmp = []
		var commands = []
		var parts = url.split('/')
		if(parts.length % 2 != 0) throw('invalid command path: ' + url)

		for(var i=0; i<parts.length; i++) {
			tmp.push(parts[i])
			if(i % 2) {
				commands.push(tmp.join('/'))
			}

		}
		return commands

	}

}


module.exports = Batch;
