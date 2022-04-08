#!/usr/bin/env bash

shairport-sync -c ./shairport-sync.conf \
  | node server.js
