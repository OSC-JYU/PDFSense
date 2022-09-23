# PDFSense (Work in progress)
A Simple and stateful backend for text extraction, image extraction, noteshrinking, and making OCR of PDF files

PDFSense combines several open source PDF, image and text tools to one REST API. It tries to use sensible defaults, so that you could get good results without tinkering with the settings.

PDFSense **stores the output of every endpoint** as a directory tree (thats' why it's stateful). This allows you to upload original PDF once and then experiment with processing endpoints without the need to upload original data again and again.

	.
	├── extracted
	│   └── images
	│       ├── noteshrink
	│       │   └── images
	│       │       ├── files.txt
	│       │       ├── noteshrink.cli
	│       │       ├── noteshrink.log
	│       │       ├── page-000.png
	│       │       └── ocr
	│       │           └── textpdf
	│       │               ├── files.txt
	│       │               ├── ocr.cli
	│       │               ├── ocr.log
	│       │               └── ocr.pdf
	│       └── page-000.jpg
	├── rendered
	│   └── 100
	│       ├── page-1.png
	│       └── pdf
	│           ├── combined
	│           │   ├── full.pdf
	│           │   ├── qpdf.cli
	│           │   └── qpdf.log
	│           ├── files.txt
	│           └── images.pdf
	└── typewritten_bw_aamunkoitto.pdf



PDFSense mounts 'data' directory from host machine to the container. This allows you to use following setup, where you can examine the result of each action immediately in your file browser:

![ideal setup](https://github.com/artturimatias/PDFSense/blob/master/images/setup.jpg)

## Install and run with Docker

Get source, build image and start

	git clone https://github.com/artturimatias/PDFSense
	cd PDFSense
	make build
	make start

## Get started

Upload your first PDF:

    curl -F "file=@myfile.pdf" http://localhost:8200/api/uploads

Render your PDF as images with resolution 150 dpi:

    curl -X POST http://localhost:8200/api/uploads/myfile.pdf/rendered/150

Now you can find rendered images from data/uploads/myfile.pdf/rendered/150

You can continue processing with rendered images. Let's rotate images and create a new PDF from rotated images:

    curl -X POST http://localhost:8200/api/uploads/myfile.pdf/rendered/150/rotate/90
	curl -X POST http://localhost:8200/api/uploads/myfile.pdf/rendered/150/rotate/90/pdf

Now you should have a PDF file with pages that are sideways on data/uploads/myfile.pdf/rendered/300/rotate/90/pdf/images.pdf

## Command path API
PDFSense uses weird but handy command path REST API. You first upload your PDF to /api/uploads, then you can continue processing by using the file id which can be found from the response. You can then continue prosessing by stacking commands in the path.

PDFSense includes also a python script, which allows you easily **batch process** several files.

### Image processing commands

 - **/rotate/:angle** (integer)         Rotate images (using sharp)
 - **/blur/:sigma** (integer)           Blur images (using sharp)
 - **/sharpen/:sigma** (integer)        Sharpen images (using sharp)
 - **/threshold/:threshold** (integer)  Threshold (using sharp)
 - **/trim/:threshold** (integer)       Trim images

Image processing commands without parameters:

 - **/grayscale**   Turn images to grayscale images (using sharp)
 - **/flip**        Flip images vertically (using sharp)
 - **/flop**        Flop images horizontally (using sharp)
 - **/negate**      Invert colors (using sharp)

### PDF Extracting Commands

 - **/extracted/images** (pdfimages)
 - **/extracted/text**
 - **/rendered/:resolution**

### OCR commands

  - **/ocr/text?lang=[LANG]** Create text file per page
  - **/ocr/pdf?lang=[LANG]** Create searchable PDF from images
  - **/ocr/textpdf?lang=[LANG]** Create text only (invisible text) PDF

### PDF generation Commands
 - **/pdf** Create pdf from images
 - **/combined** Create searchable pdf from images by adding overlay from /ocr/textpdf end point when run after any image endpoint.
 - **/combined** Create searchable pdf from original pdf when run after /ocr/textpdf endpoint

## Workflow

### 1. Initial upload of original input file

First we must upload the original PDF. This creates an unique file id which is used as a base path for actual processing commands.

using [httpie](https://httpie.io/):

	http --form POST :8200/api/uploads file@myfile.pdf

using curl:

	curl -F "file=@myfile.pdf" http://localhost:8200/api/uploads

This returns upload id and some other information

    {
    "fileid": "myfile.pdf",
    "filepath": "tmp/myfile.pdf/myfile.pdf",
	"path":":8200/api/uploads/myfile.pdf",
    "name": "myfile.pdf",
    "size": 9473628,
    "type": "application/pdf"
    }


### 2. Exract images

Now we can extract images from PDF by adding command **extracted/images** to the path

        http POST :8200/api/uploads/myfile.pdf/extracted/images

This returns a list of images

        {"files":["page-000.jpg","page-001.jpg" ... ]}

We can now refer to extracted images by path "/api/uploads/myfile.pdf/extracted/images".
We can further process the result of image extraction by adding a new command path to the path.

Note that extracted images can have "strange" formats like ppm, formats which image processing endpoints can not handle. However, you can force extracted files to png format by adding "?format=png" to the end of the url.

### 3. Process images

Let's apply some processing to these images. In this case let's test OCR.
We add command **ocr/text** to the path.

        http POST :8200/api/uploads/myfile.pdf/extracted/images/ocr/text?lang=fin

This runs tesseract and creates one text file per image and additonal file called "fulltext.txt".

### 4. Further Processing

If the result of OCR was not satisfying, we must identify the problem and further process images. Let's say that our images had bad orientation and they must be rotated. We can do this by "sharp" command.

We just remove the previous command from path (ocr/text) and apply sharp command **rotate/:ANGLE**.

        http POST :8200/api/uploads/myfile.pdf/extracted/images/rotate/90

After then we can try run OCR again for rotated images.

        http POST :8200/api/uploads/myfile.pdf/extracted/images/rotate/90/ocr/text?lang=fin

## Batch processing

After you have experimented different settings and you are getting decent result for couple of files, you may want to process more files with same settings.
There is a simple python script (batch.py) included with PDFSense and it is located in 'python' directory.

### batch.py

Here is a commands that OCR files and then creates a searchable pdf by using the original PDF as a base and adding text-only PDF as overlay on it.

    commands = [
    '/rendered/300',
    '/rendered/300/ocr/textpdf?lang=fin',
    '/rendered/300/ocr/textpdf/combined'
    ]

So just write paths as they would be when processing files directly through API.

Here is an example that makes OCR for all files in 'pdf' directory. The result is stored in myfiles/output (--download option).

    python3 python/batch.py --dir ./my_files --download


### externally
PDFSense is an API and you can use whatever tools in order to call API and process multiple files one by one.

## Endpoints

### POST api/uploads
Upload PDF and get upload id.

	curl -F "file=@my.pdf" http://localhost:8200/api/uploads

or with [httpie](https://httpie.io/):

	http --form :8200/api/uploads file@my.pdf

### POST api/uploads/[UPLOAD_ID]/extracted/images
Extracts text (pdf2text) or images (pdfimages) from PDF

	http POST :8200/api/uploads/my.pdf/extracted/images?format=png

Default output is jpg, but that can be changed by setting option "format". Supported formats are jpg, png and tiff

### POST api/uploads/[UPLOAD_ID]/extracted/text
Extracts text (pdf2text) or images (pdfimages) from PDF

	http POST :8200/api/uploads/my.pdf/extracted/text


### POST api/uploads/[UPLOAD_ID]/rendered/[RESOLUTION]
Renders images from PDF with resolution defined in path. For example:

	http POST api/uploads/my.pdf/rendered/300

Default output is png, but with option '?format=jpg' endpoint outputs images in jpg format.

### POST api/uploads/[UPLOAD_ID]/orientation?resolution=[INTEGER]
Sometimes orientation of crappy digitalisations could be sideways. Orientation endpoint makes it possible to divide processing paths based on orientation when making batch editing.

Call orientation endpoint after upload. The endpoint creates a directory 'orientation/[ANGLE]'. This allows processing different orientations different ways.

	http POST api/uploads/my.pdf/orientation?resolution=300

This will create a command path 'api/uploads/my.pdf/orientation/0/rendered/300' if the orientation is 0. Likewise, if orientation is 90, the path would be 'api/uploads/my.pdf/orientation/90/rendered/300'.

This means that you can batch process pdf files differently based on their orientation. Just use batch.py and run it with different command sets per orientation. In other words, if orientation is 90, you have to rotate images by 90 degrees and then do the ocr etc. If orientation is 0, you do not need rotate step.

As you see, the end of the orientation path is same as if you rendered images from PDF with resolution 300 (rendered/300). The explanation is that rendered images are used for orientation detection and after detection, images are copied to rendered/300 directory, so they can be further processed without rendering again.

### POST ../IMAGE_PROCESSING_COMMAND/[COMMAND]
Use sharp for processing images. Add to extracted or rendered images path.

example: rotate rendered images 90 degree clockwise:

	http POST api/uploads/my.pdf/rendered/300/rotate/90

Commands and their parameters and default values:

	rotate: {'angle': 90},
	blur: {'sigma':1},
	sharpen: {'sigma':1},
	trim: {'trim_threshold':10},
	threshold:{'threshold': 128}
	flip: {},
	flop: {},
	grayscale: {},
	negate: {},


### POST ../noteshrink/images
Apply noteshrink to images (excellent for improving bad b/w scans)

	http POST api/uploads/my.pdf/rendered/300/noteshrink/images

### POST ../ocr/[text|pdf|textpdf]?lang=LANG_CODE
Runs tesseract and output text file (text), regular PDF (pdf) or PDF with text only (textpdf).You can run all or just one.
Note the language query parameter! Default language is 'eng'. **Make sure you have installed tesseract language package for your language** (see Dockerfile, eng, fin and swe are installed by default)

	http POST api/uploads/my.pdf/rendered/300/noteshrink/images/ocr/pdf?lang=fin

### POST ../pdf
Generate PDF from images. For example:

	POST api/uploads/my.pdf/rendered/300/pdf

### POST ../pdf/combined
Create searchable PDF by adding text-only PDF to the PDF **generated from images**. This can be used for creating **searchable PDF with low resolution images**.
Note that this creates a new PDF file. If you want to add text layer to the original file, then use /ocr/textpdf/combined -endpoint.

Run this from path where your image PDF is. For example:

	POST api/uploads/my.pdf/rendered/100/pdf/combined

PDFSense scans directory tree in order to find text only PDF (produced by /ocr/textpdf -endpoint). That's why you should have only one text only PDF in your tree.

### POST ../combined
Create searchable pdf by adding text-only PDF as overlay to the copy of the original file. **This can be used only after /ocr/textpdf -endpoint**. Unlike other endpoints, this will create a file named by file_id (original file name).

    POST ../ocr/textpdf/combined?prefix=ocr_

Optional prefix allows you to add prefix to file name.

### POST api/uploads/[UPLOAD_ID]/zip
Create a zip archive with all files and directories produced by PDFSense

### GET api/uploads/[UPLOAD_ID]/zip
Fetch all files and directories as zip archive

## Shoulders
https://github.com/tesseract-ocr

https://github.com/lovell/sharp

https://github.com/mzucker/noteshrink

https://pypi.org/project/poppler-utils/

https://github.com/qpdf/qpdf

https://github.com/mzsanford/cld

If you just want to OCR pdf files and have searchable pdf as output, then try [OCRmyPDF](https://github.com/jbarlow83/OCRmyPDF)

## FAQ

### Result of OCR is totally gibberish

First, make sure that you have set the language right (like '?lang=fin') and that you have required language pack installed (see Dockerfile).
Also one possible explanation for a very bad OCR result is the wrong orientation of images. If images are "sideways", then OCR might not be able to detect text lines.
For black/white scan I recommend using 'noteshrink' (/noteshrink/images) before doing OCR.


### What's the difference between "extracted" and "rendered" images?

The command path "extracted/images" takes images from PDF as their native resolution and format by using Poppler util called "pdfimages". In some cases this might produce images being badly orientated or images without cropping that was present in original PDF.
However, images from "rendered/[RESOLUTION]" are rendered from PDF by pdftoppm. These images are like screenshots of pages with desired resolution. The cropbox option is sometimes useful in order to get images in their cropped (visible in PDF) form.

### docker: Error response from daemon: invalid mount config for type "bind": bind source path does not exist: /data.

This happens when you run "**sudo** make start". The variable PWD is not then set. You either run sudo with E option:

	sudo -E make start

Or, you can make sure that you can run docker commands as a regular user:
https://docs.docker.com/engine/install/linux-postinstall/

### I have some images and I want to create PDF file with these images. Can I do it?

Yes, just create following file structure in data directory of PDFSense:

    uploads/my_image_pdf/extracted/images

Then copy your files to the images directory and then run:

http POST :8200/api/uploads/my_image_pdf/extracted/images/pdf

Note that images must jpg files, or png files WITHOUT alpha channel.
