FROM node:20.2.0-alpine3.18

WORKDIR /app

RUN apk update
RUN apk add bash
RUN apk add mysql-client
RUN apk add supervisor
RUN apk add rsync

RUN yarn config set network-timeout 600000 -g
RUN npm install -g http-server

RUN yarn install