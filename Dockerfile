FROM ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y curl poppler-utils graphicsmagick imagemagick poppler-data tesseract-ocr tesseract-ocr-fin tesseract-ocr-swe vim

# Install Node.js
RUN apt-get install --yes curl
RUN curl --silent --location https://deb.nodesource.com/setup_12.x | bash -
RUN apt-get install -y nodejs


COPY package.json /src/package.json
RUN cd /src; npm install

COPY . /src
WORKDIR /src

CMD ["node", "index.js"]
