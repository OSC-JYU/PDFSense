IMAGES := $(shell docker images -f "dangling=true" -q)
CONTAINERS := $(shell docker ps -a -q -f status=exited)
NAME := pdfsense
VOLUME := pdf-data
VERSION := 20.04


clean:
	docker rm -f $(CONTAINERS)
	docker rmi -f $(IMAGES)

create_volume:
	docker volume create $(VOLUME)

build:
	docker build -t artturimatias/$(NAME):$(VERSION) .

start:
	docker run -d --name $(NAME) \
		-p 8200:8200 \
		-v $(VOLUME):/logs \
		--mount type=bind,source="$(PWD)"/tmp,target=/src/tmp \
		--network-alias pdfsense \
		artturimatias/$(NAME):$(VERSION)
restart:
	docker stop pdfsense
	docker rm pdfsense
	$(MAKE) start

bash:
	docker exec -it pdfsense bash
