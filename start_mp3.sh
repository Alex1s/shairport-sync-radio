#!/usr/bin/env bash

shairport-sync -c ./shairport-sync.conf \
  | ffmpeg -f s16le -ar 44100 -ac 2 -i pipe:0 -f mp3 -codec:a libmp3lame -b:a 320k -compression_level 0 pipe:1 \
  | node server.js
