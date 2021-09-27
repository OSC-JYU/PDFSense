IMAGES := $(shell docker images -f "dangling=true" -q)
CONTAINERS := $(shell docker ps -a -q -f status=exited)
NAME := pdfsense
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
		--mount type=bind,source="$(PWD)"/data,target=/src/data \
		--mount type=bind,source="$(PWD)"/logs,target=/src/logs \
		--network-alias pdfsense \
		artturimatias/$(NAME):$(VERSION)

stop:
	docker stop pdfsense

restart:
	docker stop pdfsense
	docker rm pdfsense
	$(MAKE) start

bash:
	docker exec -it pdfsense bash
