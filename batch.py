
import os
import logging
import datetime
import requests
import json
import argparse

URL = 'http://localhost:8200/api/uploads'

# EDIT THIS and remember COMMA after each line!!!
# commands = [
#     '/orientation?resolution=300',
#     '/orientation/0/rendered/300',
# ]

commands = [
    '/orientation?resolution=300',
    '/orientation/0/rendered/300/ocr/textpdf?lang=fin',

]

parser = argparse.ArgumentParser(description='Batch processing with PDFSense')
parser.add_argument('--dir', type=str, help='input directory', required=True)
parser.add_argument('--prefix', type=str, help='prefix for file names')
parser.add_argument('--download', action="store_true", help='download files')
parser.add_argument('--foo', help='foo help')
args = parser.parse_args()
print(args.dir)

def readDir():
    log_format = "%(levelname)s %(asctime)s - %(message)s"
    log_file = f"batch_{datetime.datetime.now().strftime('%Y-%m-%d:%H_%M_%S')}.log"
    logging.basicConfig(filename=os.path.join("logs",f"batch_{datetime.datetime.now().strftime('%Y-%m-%d:%H_%M_%S')}.log"),
                        filemode="w",
                        format=log_format,
                        level=logging.INFO)
    logger = logging.getLogger()
    counter = 0
    file_count = 0
    prefix = args.prefix if args.prefix else ''

    if args.download:
        try:
            os.makedirs(os.path.join(args.dir, 'output'))
        except FileExistsError:
            # directory already exists
            pass

    for root, dir, files in os.walk(args.dir):

        for filename in files:
            if filename.lower().endswith(".pdf"):
                file_count += 1
                file = os.path.join(root, filename)
                print(file)
                files = {'file': open(file, 'rb')}
                r = requests.post(URL, files=files, params={'prefix': prefix})
                r_json = r.json()
                print(json.dumps(r_json, indent=2))
                if(r.status_code == 200):
                    counter += 1
                    fileid = r_json.get('fileid')
                    for command in commands:
                        print(f"{URL}/{fileid}{command}")
                        r = requests.post(f"{URL}/{fileid}{command}")
                        print(r.status_code)

                    if args.download:
                        # download files from combined if /combined is last endpoint
                        c = commands[len(commands)-1]
                        if '/combined' in c:
                            try:
                                download_file(f"{URL}/{fileid}{c}/{prefix}{fileid}", os.path.join(args.dir, 'output', fileid))
                            except:
                                print('Download failed')
                        else:
                            print('no /combined found, not downloading')



    print(f"files found {file_count}, processed: {counter}")
    print(f"log file: logs/{log_file}")


def download_file(url, filename):
    # NOTE the stream=True parameter below
    with requests.get(url, stream=True) as r:
        r.raise_for_status()
        with open(os.path.join(filename), 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192):
                # If you have chunk encoded response uncomment if
                # and set chunk_size parameter to None.
                #if chunk:
                f.write(chunk)
    return filename

if __name__ == '__main__':
    readDir()
