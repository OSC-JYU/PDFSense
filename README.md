# PDFSense [WORK IN PROGRESS]
Simple backend for language detection, text extraction, image extraction and OCR for PDF files

PDFSense combines several open source PDF, image and text tools to one REST API. It tries to use sensible defaults, so that you could get good results without tinkering with the settings.

PDFSense also **stores the output of every endpoint**. This allows you to upload original input once and then experiment with processing endpoint without the need to upload original data again and again.


## Install and run with Docker

Get source, build image and start

	git clone https://github.com/artturimatias/PDFSense
	cd PDFSense
	make build
	make start


## Command path API
PDFSense uses weird but handy command path API.

### 1. Initial upload of original input file

First we must upload the original input file. This creates an unique id which is used as a base path for actual processing commands.

	http --form POST :8200/api/uploads file@myfile.pdf

This returns upload id and some other information

    {
    "fileid": "2021.09.09_08:29:32-myfile.pdf",
    "filepath": "tmp/2021.09.09_08:29:32-myfile.pdf/myfile.pdf",
    "name": "myfile.pdf",
    "size": 9473628,
    "type": "application/pdf"
    }


### 2. Exract images

Now we can extract images from PDF by adding command **extracted/images** to the path

        http POST :8200/api/uploads/2021.09.09_08:29:32-myfile.pdf/extracted/images

This returns a list of images

        {"files":["page-000.jpg","page-001.jpg" ... ]}

We can now refer to extracted images by path "/api/uploads/2021.09.09_08:29:32-myfile.pdf/extracted/images".
We can further process the result of image extraction by adding a new command path to the path.

### 3. Process extracted images

Let's apply some processing to these images. In this case let's test OCR.
We add command **tesseract/text** to the path.

        http POST :8200/api/uploads/2021.09.09_08:29:32-myfile.pdf/extracted/images/tesseract/text?language=fin

This runs tesseract and creates one text file per image and additonal file called "fulltext.txt".

### 4. Further Processing

If the result of OCR was not satisfying, we must identify the problem and further process images. Let's say that our images had bad orientation and they must be rotated. We can do this by "sharp" command.

We just remove the previous command from path (tesseract/text) and apply sharp command **sharp/rotate**.

        http POST :8200/api/uploads/2021.09.09_08:29:32-myfile.pdf/extracted/images/sharp/rotate?angle=90

After then we can try run OCR again for rotated images.

        http POST :8200/api/uploads/2021.09.09_08:29:32-myfile.pdf/extracted/images/sharp/rotate/tesseract/text?language=fin


## Endpoints

### extracted/[images|text]
Extracts text (pdf2text) or images (pdfimages) from PDF

### rendered/images
Renders images from PDF

## FAQ

### Result of OCR is totally gibberish

One possible explanation for a very bad OCR result is the wrong orientation of images. If images are "sideways", then OCR might not be able to detect text lines.
Make sure that images are really rotated and not pseudo rotated with Exif orientation.


### What's the difference between "extracted/images" and "rendered/images"?

The command path "extracted/images" takes images from PDF as their native resolution and format by using Poppler util called "pdfimages". In some cases this might produce images being badly orientated or images without cropping that was present in original PDF.
However, "rendered/images" are rendered from PDF by pdftoppm. These images are like screenshots of pages with desired resolution. The cropbox option is sometimes useful in order to get images in their cropped (visible in PDF) form.
