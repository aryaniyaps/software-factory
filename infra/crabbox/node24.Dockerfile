FROM node:24-bookworm

RUN apt-get update \
  && apt-get install --no-install-recommends -y openssh-server rsync git ca-certificates \
  && mkdir -p /run/sshd \
  && rm -rf /var/lib/apt/lists/*
