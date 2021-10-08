# PDFSense [WORK IN PROGRESS]
A Simple and stateful backend for text extraction, image extraction, noteshrinking, and OCR of PDF files

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
	│       │       └── tesseract
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


## Command path API
PDFSense uses weird but handy command path API.

### 1. Initial upload of original input file

First we must upload the original PDF. This creates an unique id which is used as a base path for actual processing commands.
[httpie](https://httpie.io/):

	http --form POST :8200/api/uploads file@myfile.pdf

curl:

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

### 3. Process images

Let's apply some processing to these images. In this case let's test OCR.
We add command **tesseract/text** to the path.

        http POST :8200/api/uploads/myfile.pdf/extracted/images/tesseract/text?language=fin

This runs tesseract and creates one text file per image and additonal file called "fulltext.txt".

### 4. Further Processing

If the result of OCR was not satisfying, we must identify the problem and further process images. Let's say that our images had bad orientation and they must be rotated. We can do this by "sharp" command.

We just remove the previous command from path (tesseract/text) and apply sharp command **sharp/rotate**.

        http POST :8200/api/uploads/myfile.pdf/extracted/images/sharp/rotate?angle=90

After then we can try run OCR again for rotated images.

        http POST :8200/api/uploads/myfile.pdf/extracted/images/sharp/rotate/tesseract/text?lang=fin


## Endpoints

### POST api/uploads
Upload PDF and get upload id.

	curl -F "file=@my.pdf" http://localhost:8200/api/uploads

or with [httpie](https://httpie.io/):

	http --form :8200/api/uploads file@my.pdf

### POST api/uploads/[UPLOAD_ID]/extracted/[images|text]
Extracts text (pdf2text) or images (pdfimages) from PDF

	http POST api/uploads/my.pdf/extracted/images

### POST api/uploads/[UPLOAD_ID]/rendered/[RESOLUTION]
Renders images from PDF with resolution defined in path. For example:

	http POST api/uploads/my.pdf/rendered/300

Default output is png, but with option '?format=jpg' endpoint outputs images in jpg format.

### POST ../sharp/rotated?angle=ANGLE
Rotate images. Add to extracted or rendered images path.

	http POST api/uploads/my.pdf/rendered/300/sharp/rotated

### POST ../noteshrink/images
Apply noteshrink to images (excellent for improving bad b/w scans)

	http POST api/uploads/my.pdf/rendered/300/noteshrink/images

### POST ../tesseract/[text|pdf|textpdf]?lang=LANG_CODE
Do OCR and output text file (text), regular PDF (pdf) or PDF with text only (textpdf).You can run all or just one.
Note the language query parameter! Default language is 'eng'. **Make sure you have installed tesseract language package for your language** (see Dockerfile, eng, fin and swe are installed by default)

	http POST api/uploads/my.pdf/rendered/300/noteshrink/images/tesseract/pdf?lang=fin

### POST ../pdf
Generate PDF from images. For example:

	POST api/uploads/my.pdf/rendered/300/pdf

### POST ../pdf/combined
Create searchable PDF by adding text-only PDF to the PDF generated from images. This can be used for creating **searchable PDF with low resolution images**.
Run this from path where your image PDF is. For example:

	POST api/uploads/my.pdf/rendered/100/pdf/combined

PDFSense scans directory tree in order to find text only PDF (produced by /tesseract/textpdf -endpoint). That's why you should have only one text only PDF in your tree.


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
