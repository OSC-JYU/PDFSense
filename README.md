# PDFSense [WORK IN PROGRESS]
Simple backend for language detection, text extraction, image extraction and OCR for PDF files

PDFSense combines several open source PDF, image and text tools to one REST API. It tries to use sensible defaults, so that you could get good results without tinkering with the settings.

PDFSense also **stores the output of every endpoint**. This allows you to upload original input once and then experiment with processing endpoint without the need to upload original data again and again.

## Typical OCR workflow (using execellent httpie for making requests)
1. upload PDF
This gives us an upload ID, that you can use in processing endpoints.

        http --form POST :8200/api/uploads file@myfile.pdf

    This returns upload id and some other information

        {
        "fileid": "2021.09.09_08:29:32-myfile.pdf",
        "filepath": "tmp/2021.09.09_08:29:32-myfile.pdf/myfile.pdf",
        "name": "myfile.pdf",
        "size": 9473628,
        "type": "application/pdf"
        }



2. Exract images
Now we can extract images from PDF

        http POST :8200/api/uploads/2021.09.09_08:29:32-myfile.pdf/extracted/images

    This returns a list of images

        {"files":["page-000.jpg","page-001.jpg" ... ]}

    We can now refer to extracted images by path "/api/uploads/2021.09.09_08:29:32-myfile.pdf/extracted/images".

3. process images (OCR)
Let's apply some processing to these images. In this case we do OCR.

        http POST :8200/api/uploads/2021.09.09_08:29:32-myfile.pdf/extracted/images/ocr?language=fin
