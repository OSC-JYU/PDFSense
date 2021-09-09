IMAGES := $(shell docker images -f "dangling=true" -q)
CONTAINERS := $(shell docker ps -a -q -f status=exited)
VOLUME := pdf-data
VERSION := 20.04


clean:
	docker rm -f $(CONTAINERS)
	docker rmi -f $(IMAGES)

create_volume:
	docker volume create $(VOLUME)

build:
	docker build -t osc.repo.kopla.jyu.fi/arihayri/ubuntu-node12-pdf:$(VERSION) .

push:
	docker push osc.repo.kopla.jyu.fi/arihayri/ubuntu-node12-pdf:$(VERSION)

pull:
	docker pull osc.repo.kopla.jyu.fi/arihayri/ubuntu-node12-pdf:$(VERSION)

start:
	docker run -d --name ubuntu-node12-pdf \
		-v $(VOLUME):/logs \
		--network-alias ubuntu-node12-pdf \
		osc.repo.kopla.jyu.fi/arihayri/ubuntu-node12-pdf:$(VERSION)
restart:
	docker stop ubuntu-node12-pdf
	docker rm ubuntu-node12-pdf
	$(MAKE) start

bash:
	docker exec -it ubuntu-node12-pdf bash
